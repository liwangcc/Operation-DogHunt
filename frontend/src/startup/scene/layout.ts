// 指挥室的空间约定：色板、关键尺寸、方位角的含义，以及把“方位 + 半径”换算成坐标的工具。
import { Matrix4, Vector3 } from 'three'

export const DEG = Math.PI / 180

/** 设计文档 3.3 的色值；发光体会在此基础上乘以亮度倍数进入高动态范围。 */
export const palette = {
  deep: 0x081321,
  interior: 0x14273b,
  glow: 0x49ddeb,
  warm: 0xe7aa62,
  white: 0xdfeaff,
  alert: 0xff4a3d,
} as const

/**
 * 房间是一个圆形大厅，单位为米。镜头边界（cameraRig.ts）按这些尺寸推算，改动时要一起核对。
 * 方位角：90° 是初始镜头正对的落地窗，0° 在画面右侧，180° 在左侧，270° 是镜头背后的实墙。
 */
export const room = {
  /** 玻璃幕墙底边所在半径。 */
  radius: 10,
  /** 窗下矮台的高度与进深。 */
  sillHeight: 0.45,
  sillDepth: 0.6,
  /** 窗楣高度；玻璃向外倾斜，到这里时半径变为 headerRadius。 */
  headerHeight: 7,
  headerRadius: 11,
  /** 斜顶向内收到这个半径后变成平顶。 */
  coveInnerRadius: 6.4,
  ceilingHeight: 8.7,
  /** 实墙占据的方位范围，其余方位都是玻璃。 */
  wallFrom: 225 * DEG,
  wallTo: 315 * DEG,
  /** 城市地面相对房间地面的高度。 */
  cityGround: -32,
} as const

/** 玻璃幕墙覆盖的方位范围（跨过 0°，所以终点大于 360°）。 */
export const glassArc = { from: room.wallTo, to: room.wallFrom + Math.PI * 2 } as const

/** 方位角 + 半径 + 高度 → 世界坐标。 */
export function polar(angle: number, radius: number, height = 0): Vector3 {
  return new Vector3(Math.cos(angle) * radius, height, -Math.sin(angle) * radius)
}

/**
 * 把物体摆到某个方位：物体自身的 +x 指向窗外，+z 沿墙面切线，+y 向上。
 * turn 让物体再绕自身竖轴转一个角度，tilt 让它前后倾斜。
 */
export function radialMatrix(angle: number, radius: number, height = 0, turn = 0, tilt = 0): Matrix4 {
  const matrix = new Matrix4().makeRotationY(angle).multiply(new Matrix4().makeTranslation(radius, height, 0))
  if (turn !== 0) matrix.multiply(new Matrix4().makeRotationY(turn))
  if (tilt !== 0) matrix.multiply(new Matrix4().makeRotationZ(tilt))
  return matrix
}

/** 可复现的随机数（mulberry32）：固定种子，保证每次打开看到的是同一个场景。 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}
