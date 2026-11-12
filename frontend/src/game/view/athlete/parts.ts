// 球员外壳的零件：车削出的肢体、分片装甲、球形关节、头盔、手和球鞋。按骨头分组，同一块骨头上的零件再按材质归并。
// 尺寸按 1.9 米身高书写，装到具体球员身上时再按身高和粗细缩放。每块骨头的原点在它的关节上，沿 -y 伸出，+z 是正面。
import { CylinderGeometry, LatheGeometry, Matrix4, SphereGeometry, Vector2, type BufferGeometry } from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { Assembly } from '@/startup/scene/assembly'
import { rbox, revolve, type ProfilePoint } from '@/startup/scene/build'
import type { Frame } from './skeleton'

/**
 * 零件用到的材质槽位：碳纤维内衬、石墨色外壳、金属关节、面罩玻璃、白色（鞋底与头盔条纹）、
 * 队色装甲（相当于球衣球裤）、深色的队色饰板、发光灯带。
 */
export type Slot = 'suit' | 'shell' | 'joint' | 'glass' | 'white' | 'armor' | 'trim' | 'glow'

type Pair = [Assembly<Slot>, Assembly<Slot>]

export interface BodyParts {
  pelvis: Assembly<Slot>
  chest: Assembly<Slot>
  head: Assembly<Slot>
  /** 下标 0 是左侧，1 是右侧。 */
  upperArm: Pair
  forearm: Pair
  hand: Pair
  thigh: Pair
  shin: Pair
  foot: Pair
}

/** revolve 的方位角：正面（+z）、背面，以及身体外侧（左侧肢体的外侧是 +x）。 */
const FRONT = -Math.PI / 2
const BACK = Math.PI / 2
const outer = (side: number): number => (side > 0 ? 0 : Math.PI)

/** 往一块骨头上添加零件：位置按“标准身材”书写，统一乘上这名球员的缩放。 */
class Sculpt {
  readonly bin = new Assembly<Slot>()

  constructor(private readonly scale: Matrix4) {}

  add(slot: Slot, geometry: BufferGeometry, x = 0, y = 0, z = 0, turn?: Matrix4): this {
    const matrix = new Matrix4().makeTranslation(x, y, z)
    if (turn) matrix.multiply(turn)
    this.bin.add(slot, geometry, matrix.premultiply(this.scale))
    return this
  }
}

/** 光滑的回转体，可以压扁成椭圆截面（肢体不是正圆）。 */
function lathe(points: ProfilePoint[], squashX = 1, squashZ = 1, segments = 24): BufferGeometry {
  return new LatheGeometry(points.map(([radius, height]) => new Vector2(radius, height)), segments).scale(squashX, 1, squashZ)
}

/**
 * 贴着某段外形的一片装甲：沿 points 的外形向外浮起 gap，自身厚 thick，只覆盖以 center 为中心、左右各 half 弧度的一段。
 * 板面保持光滑，边缘是硬棱。half 取 π 时是完整的一圈。
 */
function plate(points: ProfilePoint[], gap: number, thick: number, center: number, half: number, squashX = 1, squashZ = 1): BufferGeometry {
  const outside = points.map(([radius, height]): ProfilePoint => [radius + gap + thick, height])
  const inside = points.map(([radius, height]): ProfilePoint => [radius + gap, height]).reverse()
  const geometry = revolve([...outside, ...inside], { from: center - half, to: center + half, closed: true, segments: Math.max(6, Math.ceil(half / 0.09)) })
  return toCreasedNormals(geometry.scale(squashX, 1, squashZ), 0.7)
}

function ball(radius: number, scaleX = 1, scaleY = 1, scaleZ = 1): BufferGeometry {
  return new SphereGeometry(radius, 20, 14).scale(scaleX, scaleY, scaleZ)
}

/** 外形上高度在 from 到 to 之间的一段（两端按高度插值补齐），用来让装甲贴着肢体的轮廓。 */
function span(points: ProfilePoint[], from: number, to: number): ProfilePoint[] {
  const at = (height: number): ProfilePoint => {
    for (let i = 0; i < points.length - 1; i += 1) {
      const [r0, y0] = points[i]
      const [r1, y1] = points[i + 1]
      if (height >= y0 && height <= y1) return [r0 + ((r1 - r0) * (height - y0)) / Math.max(y1 - y0, 1e-6), height]
    }
    return [points[points.length - 1][0], height]
  }
  return [at(from), ...points.filter(([, height]) => height > from + 0.004 && height < to - 0.004), at(to)]
}

const THIGH: ProfilePoint[] = [[0.054, -0.47], [0.058, -0.44], [0.064, -0.38], [0.076, -0.28], [0.09, -0.17], [0.096, -0.08], [0.09, -0.02], [0.07, 0.03], [0.03, 0.05]]
const CALF: ProfilePoint[] = [[0.037, -0.445], [0.039, -0.4], [0.046, -0.32], [0.059, -0.2], [0.063, -0.13], [0.058, -0.05], [0.05, 0], [0.03, 0.02]]
const BICEP: ProfilePoint[] = [[0.044, -0.315], [0.047, -0.27], [0.056, -0.17], [0.06, -0.1], [0.055, -0.04], [0.044, 0]]
const FOREARM: ProfilePoint[] = [[0.033, -0.275], [0.036, -0.24], [0.047, -0.14], [0.051, -0.07], [0.046, -0.015], [0.037, 0]]
const TORSO: ProfilePoint[] = [[0.118, 0], [0.13, 0.1], [0.165, 0.22], [0.192, 0.33], [0.2, 0.39], [0.17, 0.44], [0.11, 0.475], [0.06, 0.5], [0.05, 0.52]]
const SKULL: ProfilePoint[] = [[0.04, 0.04], [0.074, 0.052], [0.094, 0.085], [0.103, 0.135], [0.1, 0.185], [0.083, 0.232], [0.05, 0.262], [0.012, 0.274], [0, 0.275]]
const DOME: ProfilePoint[] = [[0.1055, 0.165], [0.1035, 0.19], [0.0865, 0.236], [0.053, 0.267], [0.014, 0.279], [0, 0.28]]
const NAPE: ProfilePoint[] = [[0.076, 0.055], [0.096, 0.087], [0.104, 0.135], [0.1045, 0.166]]
/** 躯干和头的截面压扁比例。 */
const CHEST_DEPTH = 0.64
const HEAD: [number, number] = [0.9, 1.08]

/** 大腿：股四头肌的隆起、队色的裤腿和石墨色护甲，外侧一道灯带，根部是髋关节球。 */
function thigh(sculpt: Sculpt, side: number): void {
  sculpt.add('suit', lathe(THIGH, 1, 1.06), 0, 0, 0.004)
  sculpt.add('joint', ball(0.074))
  // 上半截是一圈队色的裤腿（球裤一直盖到大腿中段），下半截正面是石墨色护甲。
  sculpt.add('armor', plate(span(THIGH, -0.235, -0.02), 0.005, 0.011, 0, Math.PI, 1, 1.06), 0, 0, 0.004)
  sculpt.add('white', plate(span(THIGH, -0.25, -0.238), 0.005, 0.012, 0, Math.PI, 1, 1.06), 0, 0, 0.004)
  sculpt.add('shell', plate(span(THIGH, -0.4, -0.27), 0.004, 0.01, FRONT, 1.0, 1, 1.06), 0, 0, 0.004)
  sculpt.add('trim', plate(span(THIGH, -0.39, -0.27), 0.004, 0.008, BACK, 0.8, 1, 1.06), 0, 0, 0.004)
  sculpt.add('glow', plate(span(THIGH, -0.2, -0.06), 0.0165, 0.002, outer(side), 0.05, 1, 1.06), 0, 0, 0.004)
}

/** 小腿：向后鼓出的小腿肚、正面的队色护胫（相当于球袜）、膝盖护片，两端是膝、踝关节球。 */
function shin(sculpt: Sculpt): void {
  sculpt.add('joint', ball(0.053))
  sculpt.add('shell', ball(0.042, 1, 1.2, 0.6), 0, 0.004, 0.038)
  sculpt.add('suit', lathe(CALF, 1, 1.12), 0, 0, -0.008)
  sculpt.add('armor', plate(span(CALF, -0.4, -0.06), 0.005, 0.011, FRONT, 1.25), 0, 0, 0.002)
  sculpt.add('shell', plate(span(CALF, -0.3, -0.1), 0.006, 0.009, BACK, 0.75, 1, 1.12), 0, 0, -0.008)
  sculpt.add('joint', ball(0.038), 0, -0.445, 0)
}

/** 球鞋：白色鞋底、深色鞋面（鞋头、脚背、后跟三块拼成）、队色的鞋口和后跟。不带任何品牌图形。 */
function foot(sculpt: Sculpt): void {
  sculpt.add('white', rbox(0.108, 0.032, 0.29, 0.015), 0, -0.069, 0.07)
  sculpt.add('suit', ball(1, 0.051, 0.038, 0.08), 0, -0.04, 0.132)
  sculpt.add('suit', ball(1, 0.047, 0.058, 0.064), 0, -0.028, -0.014)
  sculpt.add('suit', rbox(0.086, 0.052, 0.14, 0.023), 0, -0.02, 0.062, new Matrix4().makeRotationX(0.42))
  sculpt.add('armor', lathe([[0.042, -0.012], [0.05, 0], [0.05, 0.024], [0.043, 0.032]]))
  sculpt.add('armor', ball(1, 0.04, 0.034, 0.03), 0, -0.036, -0.058)
  sculpt.add('shell', ball(1, 0.047, 0.024, 0.05), 0, -0.044, 0.165)
}

/** 骨盆：队色的外壳相当于球裤，两侧各一片石墨色髋甲，上沿一圈金属腰环。 */
function pelvis(sculpt: Sculpt): void {
  const shorts: ProfilePoint[] = [[0.075, -0.11], [0.11, -0.095], [0.142, -0.05], [0.158, 0.01], [0.154, 0.07], [0.136, 0.112]]
  sculpt.add('armor', lathe(shorts, 1, 0.76))
  sculpt.add('suit', ball(1, 0.094, 0.062, 0.074), 0, -0.082, 0)
  for (const angle of [0, Math.PI]) sculpt.add('shell', plate(span(shorts, -0.07, 0.09), 0.004, 0.01, angle, 0.5, 1, 0.76))
  sculpt.add('joint', lathe([[0.134, 0.108], [0.142, 0.116], [0.142, 0.138], [0.132, 0.146]], 1, 0.76))
  sculpt.add('glow', rbox(0.05, 0.008, 0.005, 0.002), 0, 0.127, 0.109)
}

/** 躯干：倒三角的胸腔、带褶的腹部、队色的胸甲和背甲、分块的腹甲、肩窝与领环，后腰一道脊柱灯带。 */
function chest(sculpt: Sculpt): void {
  const ribs: ProfilePoint[] = []
  for (let i = 0; i <= 8; i += 1) ribs.push([0.113 + i * 0.001 + (i % 2) * 0.007, -0.05 + i * 0.016])
  sculpt.add('suit', lathe(ribs, 1, 0.72))
  sculpt.add('suit', lathe(TORSO, 1, CHEST_DEPTH, 32))
  sculpt.add('armor', plate(span(TORSO, 0.265, 0.455), 0.004, 0.016, FRONT, 1.2, 1, CHEST_DEPTH))
  for (const turn of [-0.36, 0.36]) {
    sculpt.add('trim', plate(span(TORSO, 0.165, 0.25), 0.004, 0.01, FRONT + turn, 0.3, 1, CHEST_DEPTH))
    sculpt.add('trim', plate(span(TORSO, 0.07, 0.152), 0.004, 0.01, FRONT + turn, 0.3, 1, CHEST_DEPTH))
  }
  for (const angle of [0, Math.PI]) sculpt.add('shell', plate(span(TORSO, 0.1, 0.3), 0.004, 0.009, angle, 0.42, 1, CHEST_DEPTH))
  sculpt.add('armor', plate(span(TORSO, 0.24, 0.455), 0.004, 0.015, BACK, 1.25, 1, CHEST_DEPTH))
  sculpt.add('shell', plate(span(TORSO, 0.06, 0.225), 0.004, 0.009, BACK, 0.8, 1, CHEST_DEPTH))
  for (const x of [-0.222, 0.222]) sculpt.add('shell', ball(0.066), x, 0.435, 0)
  sculpt.add('joint', lathe([[0.058, 0.492], [0.071, 0.499], [0.071, 0.518], [0.06, 0.525]]))
  sculpt.add('glow', rbox(0.014, 0.13, 0.006, 0.002), 0, 0.15, -0.105)
  sculpt.add('glow', rbox(0.09, 0.007, 0.005, 0.002), 0, 0.252, 0.119)
}

/** 头：没有五官。正面是一条横向的深色面罩，里面一道发光的细线；其余是队色头盔壳，头顶一条白色条纹，两侧是金属耳罩。 */
function head(sculpt: Sculpt): void {
  const [wide, deep] = HEAD
  sculpt.add('suit', lathe([[0.054, 0], [0.05, 0.015], [0.054, 0.03], [0.05, 0.045], [0.054, 0.06], [0.05, 0.08]]))
  sculpt.add('glass', lathe(SKULL, wide, deep, 32))
  sculpt.add('armor', lathe(DOME, wide, deep, 32))
  sculpt.add('armor', plate(NAPE, 0.002, 0.006, BACK, 1.85, wide, deep))
  sculpt.add('shell', plate([[0.05, 0.035], [0.078, 0.056], [0.094, 0.085], [0.099, 0.105]], 0.002, 0.007, FRONT, 1.32, wide, deep))
  sculpt.add('glow', plate([[0.103, 0.132], [0.103, 0.14]], 0.0012, 0.002, FRONT, 1.05, wide, deep))
  for (const center of [FRONT, BACK]) sculpt.add('white', plate(DOME, 0.0005, 0.002, center, 0.17, wide, deep))
  sculpt.add('white', plate(NAPE, 0.0085, 0.002, BACK, 0.17, wide, deep))
  for (const x of [-0.094, 0.094]) sculpt.add('joint', new CylinderGeometry(0.026, 0.03, 0.02, 20), x, 0.128, 0, new Matrix4().makeRotationZ(x > 0 ? -Math.PI / 2 : Math.PI / 2))
}

/** 上臂：肩关节球、外侧的队色肩甲、肱二头肌的隆起，背面一片石墨色饰板。 */
function upperArm(sculpt: Sculpt, side: number): void {
  sculpt.add('shell', ball(0.058))
  sculpt.add('armor', ball(1, 0.06, 0.098, 0.076), side * 0.026, -0.03, 0)
  sculpt.add('suit', lathe(BICEP, 1, 1.05))
  sculpt.add('shell', plate(span(BICEP, -0.25, -0.09), 0.004, 0.007, BACK, 0.75, 1, 1.05))
  sculpt.add('trim', plate(span(BICEP, -0.2, -0.1), 0.004, 0.006, FRONT, 0.6, 1, 1.05))
}

/** 前臂：肘关节球、石墨色护臂（上沿一圈队色、中间一圈灯带）、腕关节球。 */
function forearm(sculpt: Sculpt): void {
  sculpt.add('joint', ball(0.044))
  sculpt.add('suit', lathe(FOREARM))
  sculpt.add('shell', plate(span(FOREARM, -0.225, -0.1), 0.004, 0.009, 0, Math.PI))
  sculpt.add('armor', plate(span(FOREARM, -0.095, -0.06), 0.004, 0.01, 0, Math.PI))
  sculpt.add('glow', plate([[0.0445, -0.165], [0.045, -0.157]], 0.0135, 0.002, 0, Math.PI))
  sculpt.add('joint', ball(0.032), 0, -0.275, 0)
}

/** 手：手掌、四根微屈的手指和拇指。手指沿 -y，掌心朝 +z；拇指在身体外侧（左手 +x，右手 -x）。 */
function hand(sculpt: Sculpt, side: number): void {
  sculpt.add('suit', rbox(0.086, 0.094, 0.03, 0.013), 0, -0.054, 0)
  sculpt.add('shell', rbox(0.066, 0.058, 0.009, 0.004), 0, -0.052, -0.018)
  const curl = new Matrix4().makeRotationX(-0.3).multiply(new Matrix4().makeTranslation(0, -0.044, 0))
  for (const x of [-0.0315, -0.0105, 0.0105, 0.0315]) sculpt.add('suit', rbox(0.0175, 0.088, 0.019, 0.0075), x, -0.1, 0, curl)
  const thumb = new Matrix4().makeRotationZ(side * 0.7).multiply(new Matrix4().makeTranslation(0, -0.031, 0))
  sculpt.add('suit', rbox(0.022, 0.064, 0.022, 0.0085), side * 0.049, -0.046, 0.013, thumb)
}

/** 按一名球员的身材做出全身的零件。四肢和躯干随粗细缩放，头、手、脚只随身高缩放。 */
export function buildParts(frame: Frame): BodyParts {
  const body = new Matrix4().makeScale(frame.unit * frame.bulk, frame.unit, frame.unit * frame.bulk)
  const plain = new Matrix4().makeScale(frame.unit, frame.unit, frame.unit)
  const each = (make: (sculpt: Sculpt, side: number) => void, scale: Matrix4): Pair =>
    [1, -1].map((side) => {
      const sculpt = new Sculpt(scale)
      make(sculpt, side)
      return sculpt.bin
    }) as Pair
  const one = (make: (sculpt: Sculpt) => void, scale: Matrix4): Assembly<Slot> => {
    const sculpt = new Sculpt(scale)
    make(sculpt)
    return sculpt.bin
  }
  return {
    pelvis: one(pelvis, body),
    chest: one(chest, body),
    head: one(head, plain),
    upperArm: each(upperArm, body),
    forearm: each(forearm, body),
    hand: each(hand, plain),
    thigh: each(thigh, body),
    shin: each(shin, body),
    foot: each(foot, plain),
  }
}
