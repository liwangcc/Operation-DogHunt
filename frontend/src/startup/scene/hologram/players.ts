// 全息球场上的战术演示：十个站位棋子按战术跑位，球在队员之间传递并出手，循环播放。
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { palette } from '../layout'
import { createGlowMaterial, createHoloMaterial } from './material'
import { HOOP, HOOP_HEIGHT, PLAYS, PLAY_FADE, PLAY_HOLD, playDuration, type Play, type Spot } from './plays'

/** 把球场上的英尺坐标换成桌面上方的世界坐标；mirrored 为 true 时换到另一个半场。 */
export type CourtMapper = (spot: Spot, heightFeet: number, mirrored: boolean) => Vector3

const TEAM = 5
const TRAIL = 12
const UP = new Vector3(0, 1, 0)

function ease(u: number): number {
  return u * u * (3 - 2 * u)
}

function mix(from: Spot, to: Spot, u: number): Spot {
  return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u]
}

/** 棋子外形：圆底座、收腰的身体和一个圆头，按球场比例约等于一名球员的身高。 */
function createTokenGeometry(): BufferGeometry {
  const profile = [[0.085, 0], [0.09, 0.012], [0.05, 0.03], [0.028, 0.1], [0.052, 0.19], [0.05, 0.215], [0.001, 0.225]]
  const body = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 24)
  const head = new SphereGeometry(0.043, 20, 14).translate(0, 0.262, 0)
  return mergeGeometries([body, head])
}

interface Snapshot {
  offense: Spot[]
  defense: Spot[]
  /** 球的位置（英尺）与离地高度。 */
  ball: Spot
  ballHeight: number
  /** 当前这一步的起点站位，用来画跑动路线。 */
  from: Spot[]
  /** 0 表示球还没进，之后是进球后经过的秒数。 */
  sinceScore: number
}

/** 最近一次持球的进攻队员：出手那一步需要知道球从谁手里出去。 */
function holderBefore(play: Play, step: number): number {
  for (let i = step; i >= 0; i -= 1) {
    const ball = play.steps[i].ball
    if (typeof ball === 'number') return ball
  }
  return 0
}

function ballDuring(play: Play, step: number, u: number, offense: Spot[], time: number): { spot: Spot; height: number } {
  const current = play.steps[step].ball
  const previous = holderBefore(play, step - 1)
  if (current === 'shot') {
    // 先停一拍再出手，球沿抛物线飞向篮筐。
    const flight = Math.max(0, (u - 0.35) / 0.65)
    const arc = 4 * flight * (1 - flight)
    return { spot: mix(offense[previous], HOOP, flight), height: 7 + (HOOP_HEIGHT - 7) * flight + arc * 6 }
  }
  if (current !== previous) {
    const flight = Math.min(1, u / 0.7)
    return { spot: mix(offense[previous], offense[current], flight), height: 4.2 + Math.sin(flight * Math.PI) * 1.2 }
  }
  return { spot: offense[current], height: 1.3 + Math.abs(Math.sin(time * 7)) * 2.4 }
}

/** 战术播放到第 t 秒时的全部站位。 */
function snapshot(play: Play, t: number, time: number): Snapshot {
  let start = 0
  for (let step = 0; step < play.steps.length; step += 1) {
    const current = play.steps[step]
    if (t < start + current.seconds) {
      if (step === 0) {
        return { offense: current.offense, defense: current.defense, ball: current.offense[holderBefore(play, 0)], ballHeight: 3.4, from: current.offense, sinceScore: 0 }
      }
      const before = play.steps[step - 1]
      const raw = (t - start) / current.seconds
      const u = ease(raw)
      const offense = current.offense.map((spot, i) => mix(before.offense[i], spot, u))
      const defense = current.defense.map((spot, i) => mix(before.defense[i], spot, u))
      const ball = ballDuring(play, step, raw, offense, time)
      return { offense, defense, ball: ball.spot, ballHeight: ball.height, from: before.offense, sinceScore: 0 }
    }
    start += current.seconds
  }
  // 演完之后：球穿过篮网落下，队员停在最后的位置。
  const last = play.steps[play.steps.length - 1]
  const since = t - start
  return { offense: last.offense, defense: last.defense, ball: HOOP, ballHeight: Math.max(0.4, HOOP_HEIGHT - since * 14), from: last.offense, sinceScore: since + 0.001 }
}

export interface Players {
  object: Group
  /** time 为场景运行秒数；master 是全息投影整体的亮度（开机动画用）；still 为 true 时停在起始站位不播放。 */
  update: (time: number, master: number, still: boolean) => void
  /** 立刻切到下一套战术（点击战术桌时调用）。 */
  next: (time: number) => void
}

export function createPlayers(toCourt: CourtMapper): Players {
  const holo = createHoloMaterial(0xffffff, 0.32, 2.8)
  const tokens = new InstancedMesh(createTokenGeometry(), holo.material, TEAM * 2)
  const ringMaterial = createGlowMaterial(0xffffff, 1.6)
  const routeMaterial = createGlowMaterial(palette.glow, 1.1)
  const trailMaterial = createGlowMaterial(palette.warm, 1.4)
  const ballMaterial = new MeshBasicMaterial({ color: new Color(3.2, 1.9, 0.9), transparent: true })
  /** 随战术切换一起淡入淡出的发光材质。 */
  const faders = [ringMaterial, routeMaterial, trailMaterial, ballMaterial]
  const rings = new InstancedMesh(new TorusGeometry(0.1, 0.006, 6, 30).rotateX(Math.PI / 2), ringMaterial, TEAM * 2)
  const routes = new InstancedMesh(new BoxGeometry(1, 0.003, 0.014), routeMaterial, TEAM)
  const ball = new Mesh(new SphereGeometry(0.026, 18, 12), ballMaterial)
  const trail = new InstancedMesh(new SphereGeometry(0.02, 10, 8), trailMaterial, TRAIL)
  const pulseMaterial = createGlowMaterial(palette.warm, 3)
  const pulse = new Mesh(new TorusGeometry(1, 0.035, 8, 48).rotateX(Math.PI / 2), pulseMaterial)

  const teal = new Color(palette.glow)
  const amber = new Color(palette.warm)
  for (let i = 0; i < TEAM * 2; i += 1) {
    tokens.setColorAt(i, i < TEAM ? teal : amber)
    rings.setColorAt(i, i < TEAM ? teal : amber)
  }
  for (const mesh of [tokens, rings, routes, trail]) mesh.frustumCulled = false

  const object = new Group()
  object.add(tokens, rings, routes, ball, trail, pulse)

  const matrix = new Matrix4()
  const turn = new Quaternion()
  const history: Vector3[] = Array.from({ length: TRAIL }, () => new Vector3())
  let playIndex = 0
  let mirrored = false
  let startedAt = 0
  let initialized = false

  function advance(time: number): void {
    playIndex = (playIndex + 1) % PLAYS.length
    mirrored = !mirrored
    startedAt = time
  }

  function placeTokens(state: Snapshot): void {
    const spots = [...state.offense, ...state.defense]
    spots.forEach((spot, i) => {
      const position = toCourt(spot, 0, mirrored)
      tokens.setMatrixAt(i, matrix.makeTranslation(position.x, position.y, position.z))
      rings.setMatrixAt(i, matrix.makeTranslation(position.x, position.y + 0.006, position.z))
    })
    tokens.instanceMatrix.needsUpdate = true
    rings.instanceMatrix.needsUpdate = true
  }

  /** 进攻队员这一步的跑动路线：从起点到当前位置的一条细线。 */
  function placeRoutes(state: Snapshot): void {
    state.offense.forEach((spot, i) => {
      const from = toCourt(state.from[i], 0, mirrored)
      const to = toCourt(spot, 0, mirrored)
      const length = from.distanceTo(to)
      turn.setFromAxisAngle(UP, Math.atan2(-(to.z - from.z), to.x - from.x))
      matrix.compose(from.lerp(to, 0.5).setY(to.y + 0.004), turn, new Vector3(Math.max(length, 0.0001), 1, length > 0.05 ? 1 : 0.0001))
      routes.setMatrixAt(i, matrix)
    })
    routes.instanceMatrix.needsUpdate = true
  }

  function placeBall(state: Snapshot): void {
    const position = toCourt(state.ball, state.ballHeight, mirrored)
    ball.position.copy(position)
    ball.visible = state.sinceScore < 0.45
    history.pop()
    history.unshift(position)
    history.forEach((point, i) => {
      const size = ball.visible ? 1 - i / TRAIL : 0.0001
      trail.setMatrixAt(i, matrix.makeScale(size, size, size).setPosition(point))
    })
    trail.instanceMatrix.needsUpdate = true
    // 进球后篮筐处荡开一圈光环。
    const spread = state.sinceScore > 0 ? Math.min(1, state.sinceScore / 0.9) : 0
    pulse.visible = spread > 0 && spread < 1
    pulse.position.copy(toCourt(HOOP, HOOP_HEIGHT, mirrored))
    pulse.scale.setScalar(0.04 + spread * 0.3)
    pulseMaterial.opacity = 1 - spread
  }


  return {
    object,
    next: (time) => advance(time),
    update: (time, master, still) => {
      if (!initialized) {
        startedAt = time
        initialized = true
      }
      const play = PLAYS[playIndex]
      const total = playDuration(play) + PLAY_HOLD + PLAY_FADE
      // 静止时固定在淡入结束后的那一刻，起始站位完整可见。
      let local = still ? 0.6 : time - startedAt
      if (local > total) {
        advance(time)
        local = 0
      }
      const state = snapshot(PLAYS[playIndex], local, time)
      const fade = Math.min(1, local / 0.5) * Math.min(1, Math.max(0, (total - local) / PLAY_FADE))
      holo.update(time, fade * master)
      faders.forEach((material) => {
        material.opacity = fade * master
      })
      object.visible = fade * master > 0.01
      placeTokens(state)
      placeRoutes(state)
      placeBall(state)
    },
  }
}
