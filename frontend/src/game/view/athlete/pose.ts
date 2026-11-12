// 姿势的数据结构：身体重心与躯干的倾斜、双手要到的位置、腾空时双脚的位置、视线，以及计算姿势所需的场上信息。
import { Vector3 } from 'three'
import { BALL } from '../../sim/constants'
import type { Athlete, BallState } from '../../sim/types'
import type { Gait } from './gait'
import type { Frame } from './skeleton'

/**
 * 一只手的目标。所有坐标都在球员的“本体坐标”里：原点在脚下的地面，+z 是面朝的方向，+x 是左侧，+y 向上。
 */
export interface HandGoal {
  /** 手腕的位置。 */
  wrist: Vector3
  /** 手指的指向、掌心的朝向、肘尖凸出的方向（都不需要是单位向量）。 */
  fingers: Vector3
  palm: Vector3
  elbow: Vector3
  /** 跟随目标的快慢：平时十几，手在球上时用几十，保证手不离球。 */
  snap: number
}

export interface Pose {
  /** 重心比站直时低多少（米）。 */
  crouch: number
  /** 躯干前倾（正值向前）、侧倾（正值向右）、上身相对骨盆的水平扭转（正值向左转）。 */
  lean: number
  roll: number
  twist: number
  /** 两脚之间的站宽，以及脚尖外撇的角度。 */
  width: number
  toeOut: number
  /** 膝盖向外撇的程度：防守的低重心站姿膝盖朝外。 */
  splay: number
  /** 下标 0 是左手，1 是右手。 */
  hands: [HandGoal, HandGoal]
  /** 腾空时两只脚踝相对各自髋关节的位置，以及脚的俯仰。 */
  airFeet: [Vector3, Vector3]
  airPitch: [number, number]
  /** 起跳时不等腿伸直就先离地的脚（上篮时提膝的那条腿）。 */
  early: [boolean, boolean]
  /** 视线看向的点。 */
  look: Vector3
}

function createHandGoal(): HandGoal {
  return { wrist: new Vector3(), fingers: new Vector3(0, -1, 0), palm: new Vector3(1, 0, 0), elbow: new Vector3(0, 0, -1), snap: 16 }
}

export function createPose(): Pose {
  return {
    crouch: 0, lean: 0, roll: 0, twist: 0, width: 0.3, toeOut: 0.14, splay: 0.12,
    hands: [createHandGoal(), createHandGoal()],
    airFeet: [new Vector3(), new Vector3()],
    airPitch: [0, 0],
    early: [false, false],
    look: new Vector3(0, 1.6, 4),
  }
}

/** 计算一名球员这一帧的姿势所需要知道的事情。位置都已换算到他的本体坐标。 */
export interface Situation {
  athlete: Athlete
  frame: Frame
  gait: Gait
  /** 上一帧两个肩关节、两个髋关节所在的位置：手和腿的目标以它们为基准。 */
  shoulders: [Vector3, Vector3]
  hips: [Vector3, Vector3]
  /** 速度的大小、向前的分量、向右的分量。 */
  speed: number
  ahead: number
  across: number
  hasBall: boolean
  ball: Vector3
  ballState: BallState
  /** 运球手所在的一侧：+1 右手，-1 左手，换手途中在两者之间。 */
  ballHand: number
  /** 传球正飞向自己。 */
  receiving: boolean
  /** 自己正在防守（对方有球权）。mark 是盯防对象，marking 表示他离得够近、需要摆出防守姿态。 */
  defending: boolean
  marking: boolean
  mark: Vector3
  /** 盯防的人正在起跳投篮：举手干扰。 */
  contesting: boolean
  /** 自己进攻的篮筐中心。 */
  hoop: Vector3
  /** 身边最近的对手离得多近（米）：持球时决定要不要压低护球。 */
  pressure: number
  mood: 'play' | 'celebrate' | 'dejected'
  time: number
}

const reach = new Vector3()

/** 左手在 +x 一侧，右手在 -x 一侧。 */
export function sideOf(index: number): number {
  return index === 0 ? 1 : -1
}

/**
 * 让手掌贴在球面上：toward 是掌心指向球心的方向。算出对应的手腕位置。
 * @param gap 手掌离球面的间隙
 */
export function grip(goal: HandGoal, ball: Vector3, toward: Vector3, fingers: Vector3, frame: Frame, gap = 0.012): void {
  goal.palm.copy(toward).normalize()
  goal.fingers.copy(fingers).normalize()
  goal.wrist.copy(ball).addScaledVector(goal.palm, -(BALL.radius + gap)).addScaledVector(goal.fingers, -frame.palm)
}

/** 手腕放在肩关节附近的某个位置（相对肩的偏移，单位为“身高比例”，x 向外为正）。 */
export function fromShoulder(goal: HandGoal, situation: Situation, index: number, out: number, up: number, forward: number): void {
  const unit = situation.frame.unit
  goal.wrist.copy(situation.shoulders[index]).add(reach.set(sideOf(index) * out * unit, up * unit, forward * unit))
}

/** 手够不着目标时，把目标沿着“肩 → 目标”的方向拉回到臂展以内。 */
export function withinReach(goal: HandGoal, situation: Situation, index: number, slack = 0.97): void {
  const shoulder = situation.shoulders[index]
  const limit = (situation.frame.upperArm + situation.frame.forearm) * slack
  reach.subVectors(goal.wrist, shoulder)
  const distance = reach.length()
  if (distance > limit) goal.wrist.copy(shoulder).addScaledVector(reach, limit / distance)
}
