// 球员骨架：身体各段的尺寸，以及按这些尺寸搭起来的关节层级。这里只有空节点，外壳由 model.ts 挂上去。
import { Group } from 'three'
import type { Athlete } from '../../sim/types'

/**
 * 身体各段的尺寸（米）。模型面朝本地 +z，左侧是 +x，原点在两脚之间的地面上。
 * 下标 0 是左侧，1 是右侧。
 */
export interface Frame {
  /** 身高相对 1.9 米的比例，以及粗细的比例。 */
  unit: number
  bulk: number
  /** 踝关节离地高度；踝到前脚掌、踝到脚尖的水平距离。 */
  ankle: number
  footBall: number
  footToe: number
  shin: number
  thigh: number
  /** 髋关节到身体中线的距离。 */
  hipHalf: number
  /** 站直时髋关节离地的高度。 */
  hipHeight: number
  /** 腰部转轴高出髋关节连线多少；肩、颈再高出腰部转轴多少。 */
  waist: number
  shoulderRise: number
  shoulderHalf: number
  neckRise: number
  /** 头部中心高出颈部转轴多少。 */
  headRise: number
  upperArm: number
  forearm: number
  /** 手腕到掌心的距离。 */
  palm: number
}

const BULK = [0.94, 1, 1.1] as const

export function frameFor(athlete: Athlete): Frame {
  const unit = athlete.height / 1.9
  const bulk = BULK[athlete.role]
  const ankle = 0.085 * unit
  const shin = 0.445 * unit
  const thigh = 0.47 * unit
  return {
    unit, bulk, ankle, shin, thigh,
    footBall: 0.135 * unit,
    footToe: 0.2 * unit,
    hipHalf: 0.098 * unit * bulk,
    hipHeight: ankle + shin + thigh,
    waist: 0.125 * unit,
    shoulderRise: 0.435 * unit,
    shoulderHalf: 0.222 * unit * bulk,
    neckRise: 0.5 * unit,
    headRise: 0.135 * unit,
    upperArm: 0.315 * unit,
    forearm: 0.275 * unit,
    palm: 0.085 * unit,
  }
}

/** 一条肢体：上段（大腿、上臂）、下段（小腿、前臂）和末端（脚、手）。每段沿自己的 -y 方向伸出。 */
export interface Limb {
  upper: Group
  lower: Group
  end: Group
}

export interface Skeleton {
  frame: Frame
  /** 整个人在场上的位置和朝向。 */
  root: Group
  pelvis: Group
  chest: Group
  head: Group
  arms: [Limb, Limb]
  legs: [Limb, Limb]
}

function limb(parent: Group, x: number, y: number, upperLength: number, lowerLength: number): Limb {
  const upper = new Group()
  upper.position.set(x, y, 0)
  const lower = new Group()
  lower.position.y = -upperLength
  const end = new Group()
  end.position.y = -lowerLength
  parent.add(upper)
  upper.add(lower)
  lower.add(end)
  return { upper, lower, end }
}

export function createSkeleton(frame: Frame): Skeleton {
  const root = new Group()
  const pelvis = new Group()
  pelvis.position.y = frame.hipHeight
  const chest = new Group()
  chest.position.y = frame.waist
  const head = new Group()
  head.position.y = frame.neckRise
  root.add(pelvis)
  pelvis.add(chest)
  chest.add(head)
  const side = (index: number): number => (index === 0 ? 1 : -1)
  const arms = [0, 1].map((index) => limb(chest, side(index) * frame.shoulderHalf, frame.shoulderRise, frame.upperArm, frame.forearm)) as [Limb, Limb]
  const legs = [0, 1].map((index) => limb(pelvis, side(index) * frame.hipHalf, 0, frame.thigh, frame.shin)) as [Limb, Limb]
  return { frame, root, pelvis, chest, head, arms, legs }
}
