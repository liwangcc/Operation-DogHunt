// 比赛画面总装：把球场、篮架、球馆、球员和球放进一个场景，每帧按比赛状态摆好，并把比赛事件变成画面上的反馈。
import { Color, FogExp2, Matrix4, Scene, Vector3, WebGLRenderTarget, type Group, type PerspectiveCamera, type Texture, type WebGLRenderer } from 'three'
import type { MaterialKit, MaterialName } from '@/startup/materials/kit'
import { Assembly } from '@/startup/scene/assembly'
import { addBasketball } from '@/startup/scene/props'
import { BALL, RULES } from '../sim/constants'
import type { GameEvent, MatchState } from '../sim/types'
import { animateAthlete, createMotion, type Mood, type Motion } from './athlete/animator'
import { createAthleteMaterials, createAthleteModel, type AthleteMaterials, type AthleteModel } from './athlete/model'
import { createArena, type Arena } from './arena'
import { createCourtFloor, type CourtFloor } from './court'
import { Director } from './director'
import { createArenaEnvironment, type ArenaEnvironment } from './environment'
import { createHoop, type Hoop } from './hoop'

interface Parts {
  scene: Scene
  director: Director
  floor: CourtFloor
  arena: Arena
  /** 下标 0 是 x 正方向一端的篮架，1 是负方向一端。 */
  hoops: [Hoop, Hoop]
  athleteMaterials: AthleteMaterials
  models: AthleteModel[]
  motions: Motion[]
  ball: Group
  environment: ArenaEnvironment
}

export class GameView {
  readonly scene: Scene
  readonly director: Director
  private readonly projected = new Vector3()

  private constructor(private readonly parts: Parts) {
    this.scene = parts.scene
    this.director = parts.director
  }

  /**
   * 搭建比赛画面。分成很多小段来做，每做完一段就调用 breathe 把主线程让出来；
   * 最后预先编译着色器、把模型和贴图传给显卡，这样真正切进比赛时不会卡顿。
   */
  static async build(renderer: WebGLRenderer, kit: MaterialKit, match: MatchState, reducedMotion: boolean, breathe: () => Promise<void>): Promise<GameView> {
    const scene = new Scene()
    scene.background = new Color(0x02050a)
    scene.fog = new FogExp2(0x02050a, 0.014)
    const floor = createCourtFloor(kit.textures.wood)
    scene.add(floor.mesh)
    await breathe()
    const arena = createArena(kit)
    scene.add(arena.object)
    await breathe()
    const hoops: [Hoop, Hoop] = [createHoop(kit, 1), createHoop(kit, -1)]
    scene.add(hoops[0].object, hoops[1].object)
    await breathe()
    const athleteMaterials = createAthleteMaterials(kit)
    const models: AthleteModel[] = []
    const motions: Motion[] = []
    for (const athlete of match.athletes) {
      const model = createAthleteModel(athleteMaterials, athlete)
      models.push(model)
      motions.push(createMotion(athlete, model.skeleton))
      scene.add(model.skeleton.root)
      await breathe()
    }
    const ballParts = new Assembly<MaterialName>()
    addBasketball(ballParts, new Matrix4(), BALL.radius)
    const ball = ballParts.build(kit.materials)
    scene.add(ball)
    const environment = createArenaEnvironment(renderer)
    scene.environment = environment.texture
    await breathe()
    const view = new GameView({ scene, director: new Director(reducedMotion), floor, arena, hoops, athleteMaterials, models, motions, ball, environment })
    await view.warmUp(renderer, match, breathe)
    return view
  }

  get camera(): PerspectiveCamera {
    return this.director.camera
  }

  setMirror(texture: Texture | null, matrix: Matrix4): void {
    this.parts.floor.setMirror(texture, matrix)
  }

  setFloorVisible(visible: boolean): void {
    this.parts.floor.mesh.visible = visible
  }

  /** 把比赛事件变成画面反馈：篮网甩动、篮圈震动、镜头抖动、进球特写和全场灯光。 */
  react(event: GameEvent, match: MatchState): void {
    const { hoops, arena } = this.parts
    const hoop = (side: number): Hoop => hoops[side > 0 ? 0 : 1]
    if (event.type === 'net') hoop(event.side).swish(event.clean ? 1 : 0.7)
    else if (event.type === 'rim') hoop(event.side).rattle(Math.min(1, event.speed * 0.09))
    else if (event.type === 'dunk') {
      hoop(event.side).rattle(1)
      this.director.shake(0.22)
    } else if (event.type === 'score') {
      const big = event.kind === 'dunk' || event.points === 3
      arena.celebrate(event.team, big ? 1 : 0.6)
      this.director.onScore(event.side, match.celebrating ? event.player : -1, event.kind === 'dunk')
    }
  }

  /**
   * 每帧调用：摆好所有球员和球，推进各处的动画，并更新镜头。
   * @param delta 模拟经过的秒数（慢动作时变小）
   * @param realDelta 真实经过的秒数
   */
  sync(match: MatchState, delta: number, realDelta: number, time: number): void {
    const { models, motions, hoops, arena } = this.parts
    const ball = match.ball
    const winner = match.phase === 'final' ? (match.score[0] > match.score[1] ? 0 : 1) : -1
    // 开场镜头期间比赛还没开始走表，球员按真实时间保持站姿的细微动作；暂停时完全静止。
    const pace = delta > 0 ? delta : this.director.timeScale === 0 ? realDelta : 0
    match.athletes.forEach((athlete, index) => {
      const model = models[index]
      const mood: Mood = athlete.action === 'celebrate' || athlete.team === winner ? 'celebrate' : winner >= 0 ? 'dejected' : 'play'
      animateAthlete(model.skeleton, motions[index], athlete, match, mood, time, pace)
      model.marker.visible = athlete.id === match.controlled && match.phase !== 'final'
    })
    this.parts.ball.position.set(ball.x, ball.y, ball.z)
    // 球按自身速度滚动。
    this.parts.ball.rotation.z -= (ball.vx * delta) / BALL.radius
    this.parts.ball.rotation.x += (ball.vz * delta) / BALL.radius
    for (const hoop of hoops) hoop.update(time, realDelta)
    arena.setScore({ score: match.score, clock: Math.ceil(match.clock), period: match.period > RULES.periods ? 0 : match.period })
    arena.update(time, realDelta)
    this.director.update(match, realDelta, time)
    arena.setRigVisible(!this.director.overhead)
  }

  /** 场上某一点在画面上的位置（CSS 像素），用来摆放出手条等界面元素。 */
  locate(x: number, y: number, z: number, width: number, height: number): { x: number; y: number } {
    this.projected.set(x, y, z).project(this.camera)
    return { x: (this.projected.x * 0.5 + 0.5) * width, y: (0.5 - this.projected.y * 0.5) * height }
  }

  dispose(): void {
    const { floor, arena, hoops, athleteMaterials, environment, scene } = this.parts
    floor.dispose()
    arena.dispose()
    hoops.forEach((hoop) => hoop.dispose())
    athleteMaterials.dispose()
    environment.dispose()
    scene.traverse((node) => (node as { geometry?: { dispose: () => void } }).geometry?.dispose())
  }

  /** 预热：先在后台编译着色器，再往一块很小的离屏画布上画一遍，把模型和贴图传给显卡。 */
  private async warmUp(renderer: WebGLRenderer, match: MatchState, breathe: () => Promise<void>): Promise<void> {
    this.director.setAspect(16 / 9)
    this.director.restart()
    this.sync(match, 0, 0, 0)
    await renderer.compileAsync(this.scene, this.camera)
    await breathe()
    const previous = renderer.getRenderTarget()
    const scratch = new WebGLRenderTarget(64, 64)
    renderer.setRenderTarget(scratch)
    // 这一遍必须连阴影一起画：灯的阴影贴图还没建过就拿去用，之后球场上所有受光的表面都会是黑的。
    renderer.shadowMap.needsUpdate = true
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(previous)
    scratch.dispose()
    await breathe()
  }
}
