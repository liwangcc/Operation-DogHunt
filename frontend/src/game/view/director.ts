// 比赛镜头：平时用侧面的转播机位跟球；进球时切到篮筐特写并放慢动作，高光进球再切到球员的庆祝特写。
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { COURT } from '../sim/constants'
import type { MatchState } from '../sim/types'

type Shot = 'intro' | 'broadcast' | 'hoop' | 'celebrate'

const BROADCAST_FOV = 36
/** 开场从正上方俯视整块球场（接续沙盘的俯视镜头），再落到转播机位所用的秒数。 */
const INTRO_SECONDS = 2.2
const SLOW_MOTION = 0.32

function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

export class Director {
  readonly camera = new PerspectiveCamera(BROADCAST_FOV, 1, 0.3, 220)
  /** 模拟时间相对真实时间的倍率：进球特写时小于 1，形成慢动作。 */
  timeScale = 1
  private shot: Shot = 'intro'
  private shotTime = 0
  private followX = 0
  private followZ = 0
  private side = 1
  private scorer = -1
  private dunk = false
  private tremor = 0
  private readonly position = new Vector3()
  private readonly lookAt = new Vector3()

  constructor(private readonly reducedMotion: boolean) {}

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** 镜头是否还在开场的俯视阶段。 */
  get overhead(): boolean {
    return this.shot === 'intro' && this.shotTime < INTRO_SECONDS * 0.55
  }

  /** 重新从俯视开场（开始比赛、重新开始时调用）。 */
  restart(): void {
    this.shot = this.reducedMotion ? 'broadcast' : 'intro'
    this.shotTime = 0
    this.timeScale = 1
    this.followX = 0
    this.followZ = 0
  }

  /** 进球：切到进球那一端的篮筐特写。 */
  onScore(side: number, scorer: number, dunk: boolean): void {
    if (this.reducedMotion) return
    this.shot = 'hoop'
    this.shotTime = 0
    this.side = side
    this.scorer = scorer
    this.dunk = dunk
  }

  /** 扣篮、砸筐时画面抖一下。 */
  shake(amount: number): void {
    if (!this.reducedMotion) this.tremor = Math.max(this.tremor, amount)
  }

  update(match: MatchState, delta: number, time: number): void {
    this.shotTime += delta
    this.tremor *= Math.exp(-delta * 7)
    this.advanceShot(match)
    let fov = BROADCAST_FOV
    if (this.shot === 'hoop') fov = this.frameHoop()
    else if (this.shot === 'celebrate') fov = this.frameScorer(match)
    else this.frameBroadcast(match, delta)
    if (this.shot === 'intro') this.blendFromOverhead()
    // 窄屏时加大视角，保证水平方向至少能看到半个场。
    const wide = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(27)) / Math.max(this.camera.aspect, 0.5)))
    this.camera.fov = Math.max(fov, Math.min(70, wide))
    this.camera.updateProjectionMatrix()
    this.camera.position.copy(this.position)
    if (this.tremor > 0.002) {
      this.camera.position.x += Math.sin(time * 71) * this.tremor
      this.camera.position.y += Math.cos(time * 93) * this.tremor
    }
    this.camera.lookAt(this.lookAt)
  }

  /** 特写镜头的衔接：篮筐特写 →（高光进球）庆祝特写 → 发球前切回转播机位。 */
  private advanceShot(match: MatchState): void {
    // 开场镜头落定之前比赛不开始，免得跳球发生在看不清的时候。
    this.timeScale = this.shot === 'intro' ? 0 : 1
    if (this.shot === 'intro' && this.shotTime >= INTRO_SECONDS) this.cut('broadcast')
    if (this.shot === 'hoop') {
      const hold = this.dunk ? 1.25 : 0.95
      if (this.shotTime < hold * 0.62) this.timeScale = SLOW_MOTION
      if (this.shotTime >= hold) this.cut(match.celebrating && match.athletes[this.scorer] ? 'celebrate' : 'broadcast')
    }
    if (this.shot === 'celebrate' && (match.phase !== 'dead' || match.pause < 0.35)) this.cut('broadcast')
    if ((this.shot === 'hoop' || this.shot === 'celebrate') && match.phase === 'final') this.cut('broadcast')
  }

  private cut(shot: Shot): void {
    this.shot = shot
    this.shotTime = 0
  }

  /** 转播机位：架在近侧边线外的高处，沿球场长边平滑地跟着球移动。 */
  private frameBroadcast(match: MatchState, delta: number): void {
    const ball = match.ball
    const limit = COURT.halfLength - 5.5
    const goal = MathUtils.clamp(ball.x + ball.vx * 0.25, -limit, limit)
    const k = 1 - Math.exp(-delta * 3.4)
    this.followX += (goal - this.followX) * k
    this.followZ += (ball.z - this.followZ) * k
    this.position.set(this.followX * 0.86, 8.8, 20.6)
    this.lookAt.set(this.followX, 1.3, this.followZ * 0.22 - 0.8)
  }

  /** 开场：从正上方俯视的位置过渡到转播机位。 */
  private blendFromOverhead(): void {
    const t = ease(Math.min(1, this.shotTime / INTRO_SECONDS))
    this.position.lerpVectors(new Vector3(0, 30, 2.4), this.position, t)
    this.lookAt.lerpVectors(new Vector3(0, 0, 0), this.lookAt, t)
  }

  /** 篮筐特写：在筐的斜前下方仰拍，镜头缓缓推近，看球穿过篮网。 */
  private frameHoop(): number {
    const push = Math.min(1, this.shotTime / 1.2)
    const hoopX = this.side * COURT.hoopX
    this.position.set(hoopX - this.side * (3.3 - push * 0.7), 1.9 + push * 0.25, 2.9 - push * 0.5)
    this.lookAt.set(hoopX, 2.95, 0)
    return 44
  }

  /** 庆祝特写：在进球球员面前半身景别，缓慢环绕。 */
  private frameScorer(match: MatchState): number {
    const scorer = match.athletes[this.scorer]
    const angle = scorer.facing + 0.5 - this.shotTime * 0.35
    this.position.set(scorer.x + Math.cos(angle) * 3.9, scorer.height * 0.8, scorer.z + Math.sin(angle) * 3.9)
    // 看向头顶略上方，把人放在画面下半部，头部不会被上方的记分牌压住。
    this.lookAt.set(scorer.x, scorer.height * 0.95, scorer.z)
    return 38
  }
}
