// 比赛控制器：把输入、模拟、画面和声音串起来，按固定步长推进比赛，并把比分、提示等信息报给界面。
// 画面可以提前在后台搭好（create），真正开打时再接管键盘和声音（begin），退出后保留画面供下次直接进入（end）。
import type { WebGLRenderer } from 'three'
import type { MaterialKit } from '@/startup/materials/kit'
import { TEAM_NAMES, type GameCallbacks, type HudState } from './hud'
import { GameInput } from './input'
import { RULES, SHOT, STEP } from './sim/constants'
import { NO_INTENT } from './sim/control'
import { createMatch, stepMatch } from './sim/match'
import type { GameEvent, Intent, MatchState } from './sim/types'
import { createGameSound, type GameSound } from './sound'
import { GameView } from './view/gameView'

/** 一帧里最多补多少个物理步；再多说明页面卡住了，直接丢掉积压的时间。 */
const MAX_STEPS = 12
const HUD_INTERVAL = 0.1

const KIND_TEXT = { dunk: '扣篮', layup: '上篮', jumper: '命中' } as const
const GRADE_TEXT = { perfect: '完美出手', good: '时机不错', early: '出手偏早', late: '出手偏晚' } as const

const NO_CALLBACKS: GameCallbacks = { onHud: () => undefined, onFeed: () => undefined, onMeter: () => undefined }

export class Game {
  private input: GameInput | null = null
  private sound: GameSound | null = null
  private callbacks = NO_CALLBACKS
  private accumulator = 0
  private time = 0
  private paused = false
  private muted = false
  private hudTimer = 0
  private hudKey = ''
  private meterShown = false
  /** 还没有被物理步消费掉的“刚按下 / 刚松开”：显示帧率高于物理帧率时，有的帧不会推进模拟。 */
  private pending = { shootPressed: false, shootReleased: false, passPressed: false, stealPressed: false }

  private constructor(
    readonly view: GameView,
    private match: MatchState,
  ) {}

  /**
   * 在后台把比赛画面搭好。
   * @param breathe 每搭完一部分就等它一下，把主线程让出来，启动页的画面才不会卡住
   */
  static async create(renderer: WebGLRenderer, kit: MaterialKit, reducedMotion: boolean, breathe: () => Promise<void>): Promise<Game> {
    const match = createMatch(Date.now() >>> 0, true)
    return new Game(await GameView.build(renderer, kit, match, reducedMotion, breathe), match)
  }

  /** 开打：接管键盘、打开声音，从开场镜头开一场新比赛。 */
  begin(callbacks: GameCallbacks): void {
    this.callbacks = callbacks
    this.input ??= new GameInput(() => this.togglePause(), () => this.toggleMute())
    this.sound ??= createGameSound()
    this.sound.setMuted(this.muted)
    this.hudKey = ''
    this.restart()
  }

  /** 退出比赛：交还键盘、关掉声音。画面留着，下次进入不用重新搭。 */
  end(): void {
    this.input?.dispose()
    this.input = null
    this.sound?.dispose()
    this.sound = null
    this.callbacks = NO_CALLBACKS
  }

  setAspect(aspect: number): void {
    this.view.director.setAspect(aspect)
  }

  /** 每个显示帧调用一次：按真实经过的时间补上若干物理步，再更新画面。 */
  frame(realDelta: number, width: number, height: number): void {
    this.time += realDelta
    const intent = this.collect(this.input?.sample() ?? NO_INTENT)
    let simulated = 0
    if (!this.paused) {
      this.accumulator += realDelta * this.view.director.timeScale
      let steps = 0
      while (this.accumulator >= STEP && steps < MAX_STEPS) {
        // 按键的“刚按下 / 刚松开”只交给第一个物理步。
        stepMatch(this.match, steps === 0 ? intent : { ...intent, shootPressed: false, shootReleased: false, passPressed: false, stealPressed: false })
        if (steps === 0) this.pending = { shootPressed: false, shootReleased: false, passPressed: false, stealPressed: false }
        this.accumulator -= STEP
        steps += 1
        this.dispatch()
      }
      if (steps === MAX_STEPS) this.accumulator = 0
      simulated = steps * STEP
    } else {
      // 暂停期间按下的键不算数，否则一恢复比赛就会莫名其妙地出手或传球。
      this.pending = { shootPressed: false, shootReleased: false, passPressed: false, stealPressed: false }
    }
    this.view.sync(this.match, simulated, realDelta, this.time)
    this.reportMeter(width, height)
    this.hudTimer -= realDelta
    if (this.hudTimer <= 0) this.reportHud()
  }

  togglePause(): void {
    if (this.match.phase === 'final') return
    this.paused = !this.paused
    this.reportHud()
  }

  toggleMute(): void {
    this.muted = !this.muted
    this.sound?.setMuted(this.muted)
    this.reportHud()
  }

  /** 重新开一场。 */
  restart(): void {
    const next = createMatch(Date.now() >>> 0, true)
    // 画面里的球员模型是按第一场的球员建的；新比赛沿用同样的阵容，直接替换状态即可。
    this.match = next
    this.accumulator = 0
    this.paused = false
    this.pending = { shootPressed: false, shootReleased: false, passPressed: false, stealPressed: false }
    this.view.director.restart()
    this.reportHud()
  }

  dispose(): void {
    this.end()
    this.view.dispose()
  }

  /** 把这一帧的输入和之前没消费掉的按键边沿合并。 */
  private collect(sample: Intent): Intent {
    this.pending.shootPressed ||= sample.shootPressed
    this.pending.shootReleased ||= sample.shootReleased
    this.pending.passPressed ||= sample.passPressed
    this.pending.stealPressed ||= sample.stealPressed
    return { ...sample, ...this.pending }
  }

  /** 把模拟发出的事件分发给画面、声音和界面提示。 */
  private dispatch(): void {
    const events = this.match.events
    for (const event of events) {
      this.view.react(event, this.match)
      this.sound?.play(event)
      this.announce(event)
    }
    events.length = 0
  }

  private announce(event: GameEvent): void {
    const feed = this.callbacks.onFeed
    if (event.type === 'score') {
      const three = event.points === 3 ? '三分' : ''
      feed(`${TEAM_NAMES[event.team]} ${three}${KIND_TEXT[event.kind]} +${event.points}`, 'score')
      this.reportHud()
    } else if (event.type === 'release' && event.kind === 'jumper' && event.player === this.match.controlled) {
      feed(GRADE_TEXT[event.grade], event.grade === 'perfect' || event.grade === 'good' ? 'good' : 'warn')
      if (event.grade === 'perfect') this.sound?.chime()
    } else if (event.type === 'steal') {
      feed('抢断！', this.match.athletes[event.player].team === 0 ? 'good' : 'warn')
    } else if (event.type === 'block') {
      feed('盖帽！', this.match.athletes[event.player].team === 0 ? 'good' : 'warn')
    } else if (event.type === 'whistle' && event.reason === 'out') {
      feed('出界', 'info')
    } else if (event.type === 'whistle' && event.reason === 'shotclock') {
      feed(`${RULES.shotClock} 秒违例`, 'info')
    } else if (event.type === 'buzzer' && event.reason === 'period') {
      feed(this.match.period > RULES.periods ? '进入加时' : '本节结束 · 交换场地', 'info')
    } else if (event.type === 'buzzer' && event.reason === 'final') {
      feed('全场结束', 'info')
      this.reportHud()
    }
  }

  /** 玩家控制的球员正在蓄力跳投时，在他头顶显示出手条。 */
  private reportMeter(width: number, height: number): void {
    const shooter = this.match.athletes[this.match.controlled]
    const charging = shooter !== undefined && shooter.action === 'shoot' && !shooter.released && !this.paused
    if (!charging) {
      if (this.meterShown) this.callbacks.onMeter(false, 0, 0, 0, 0)
      this.meterShown = false
      return
    }
    const spot = this.view.locate(shooter.x, shooter.y + shooter.height + 0.3, shooter.z, width, height)
    // 松手是按物理步结算的：窗口里有几个物理步算完美，绿区就画多宽，看到的和判定的是一回事。
    const steps = shooter.shotWindow > 0 ? Math.floor(shooter.shotWindow / STEP + 1e-6) * 2 + 1 : 0
    this.callbacks.onMeter(true, spot.x, spot.y, Math.min(1, shooter.actionTime / SHOT.forcedRelease), (steps * STEP) / SHOT.forcedRelease)
    this.meterShown = true
  }

  /** 比分牌每 0.1 秒刷新一次；内容没变就不通知界面。 */
  private reportHud(): void {
    this.hudTimer = HUD_INTERVAL
    const match = this.match
    const state: HudState = {
      score: [match.score[0], match.score[1]],
      period: match.period,
      overtime: match.period > RULES.periods,
      clock: Math.ceil(match.clock),
      shotClock: Math.max(0, Math.ceil(match.shotClock)),
      phase: match.phase,
      offense: match.offense,
      paused: this.paused,
      muted: this.muted,
    }
    const key = JSON.stringify(state)
    if (key === this.hudKey) return
    this.hudKey = key
    this.callbacks.onHud(state)
  }
}
