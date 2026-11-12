// 基础姿势：站立与跑动时的摆臂、防守站姿、运球护球、双手持球、伸手接球。投篮、扣篮等动作的姿势在 moves.ts 里叠加。
import { Vector3 } from 'three'
import { BALL } from '../../sim/constants'
import { fromShoulder, grip, sideOf, withinReach, type HandGoal, type Pose, type Situation } from './pose'

const toward = new Vector3()
const fingers = new Vector3()
const spot = new Vector3()

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function smooth(from: number, to: number, value: number): number {
  const t = clamp((value - from) / (to - from), 0, 1)
  return t * t * (3 - 2 * t)
}

/** 自然下垂、肘部微屈的手臂。 */
export function hang(goal: HandGoal, situation: Situation, index: number): void {
  const side = sideOf(index)
  fromShoulder(goal, situation, index, 0.07, -0.555, 0.06)
  goal.fingers.set(0, -1, 0.12)
  goal.palm.set(-side, 0, 0.1)
  goal.elbow.set(side * 0.25, -0.1, -1)
  goal.snap = 16
}

/** 跑动摆臂：与对侧的腿同步，跑得越快肘弯得越多、摆幅越大。 */
function swingArms(pose: Pose, situation: Situation): void {
  const amount = clamp(situation.speed / 3.2, 0, 1)
  const pump = 0.35 + 0.65 * situation.gait.run
  for (let index = 0; index < 2; index += 1) {
    const side = sideOf(index)
    const beat = situation.gait.swing[1 - index] * amount
    const front = Math.max(0, beat) * pump
    const back = Math.max(0, -beat) * pump
    const bent = amount * pump
    const goal = pose.hands[index]
    fromShoulder(goal, situation, index, 0.07 - 0.1 * front + 0.03 * back, -0.555 + 0.3 * front + 0.17 * back + 0.12 * bent, 0.06 + 0.3 * front - 0.24 * back)
    goal.fingers.set(0, -1 + 1.1 * front + 0.25 * bent, 0.15 + 0.9 * front - 0.25 * back)
    goal.palm.set(-side, 0, 0.1)
    goal.elbow.set(side * 0.3, -0.2, -1)
    goal.snap = 22
  }
}

/** 站立与跑动：重心、前倾、站宽、摆臂，以及腾空时默认的腿部姿态。 */
export function basePose(pose: Pose, situation: Situation): void {
  const { frame, gait } = situation
  const unit = frame.unit
  const ratio = clamp(situation.speed / 7, 0, 1)
  const forwardness = situation.speed > 0.3 ? situation.ahead / situation.speed : 0
  pose.crouch = (0.02 + 0.02 * ratio) * unit
  pose.lean = 0.05 + 0.05 * ratio + 0.2 * ratio * Math.max(0, forwardness)
  pose.roll = clamp(situation.across / 7, -1, 1) * 0.2
  pose.twist = 0
  pose.width = (0.32 - 0.12 * gait.run) * unit
  pose.toeOut = 0.14
  pose.splay = 0.1
  for (let index = 0; index < 2; index += 1) {
    pose.airFeet[index].set(sideOf(index) * 0.015 * unit, -(frame.thigh + frame.shin) * 0.95, -0.02 * unit)
    pose.airPitch[index] = 0.55
    pose.early[index] = false
  }
  swingArms(pose, situation)
  if (situation.hasBall) pose.look.copy(situation.hoop)
  else pose.look.copy(situation.ball)
}

/** 防守站姿：屈膝压低、两脚分开、膝盖朝外，靠球一侧的手抬起来干扰，另一只手张开封传球路线。 */
export function guard(pose: Pose, situation: Situation): void {
  const unit = situation.frame.unit
  const depth = situation.marking ? 1 : 0.55
  pose.crouch = (0.1 + 0.13 * depth) * unit
  pose.lean = 0.16 + 0.14 * depth
  pose.width = (0.42 + 0.16 * depth) * unit
  pose.toeOut = 0.3
  pose.splay = 0.25 + 0.3 * depth
  const active = situation.ball.x > 0 ? 0 : 1
  for (let index = 0; index < 2; index += 1) {
    const side = sideOf(index)
    const goal = pose.hands[index]
    const flutter = Math.sin(situation.time * 5.3 + situation.athlete.id * 1.7 + index * 2.1) * 0.025
    if (index === active && situation.contesting) {
      // 对手起跳投篮：这只手直直举起来挡视线。
      fromShoulder(goal, situation, index, 0.03, 0.55, 0.18)
      goal.fingers.set(0, 1, 0.12)
      goal.palm.set(0, 0.1, 1)
    } else if (index === active) {
      fromShoulder(goal, situation, index, 0.24, -0.02 + flutter, 0.32)
      goal.fingers.set(side * 0.3, 1, 0.25)
      goal.palm.set(0, 0.1, 1)
    } else {
      fromShoulder(goal, situation, index, 0.3, -0.28 + flutter, 0.24)
      goal.fingers.set(side * 0.6, -0.4, 0.7)
      goal.palm.set(0, 0.25, 1)
    }
    goal.elbow.set(side * 0.9, -0.5, -0.35)
    goal.snap = 14
  }
  pose.look.copy(situation.contesting ? situation.ball : situation.mark)
}

/**
 * 运球：一只手掌压在球的上方跟着球起落（球落到腰以下时手停在那里等它弹回来），
 * 身边有防守人时压低重心、侧身，另一只手臂横在身前护球。
 */
export function dribble(pose: Pose, situation: Situation): void {
  const { frame, ball } = situation
  const unit = frame.unit
  const index = situation.ballHand >= 0 ? 1 : 0
  const side = sideOf(index)
  const guarded = clamp((2.4 - situation.pressure) / 1.4, 0, 1)
  pose.crouch += (0.05 + 0.08 * guarded) * unit
  pose.lean += 0.07 + 0.08 * guarded
  pose.twist = side * 0.22 * guarded
  pose.width += 0.1 * guarded * unit
  const goal = pose.hands[index]
  const waitAt = (frame.hipHeight - pose.crouch) * 0.64
  const top = ball.y + BALL.radius + 0.012
  const waiting = clamp((waitAt - top) / (0.3 * unit), 0, 1)
  goal.fingers.set(-side * 0.12, -0.2 - 0.35 * waiting, 1).normalize()
  goal.palm.set(0, -1, 0.15 + 0.3 * waiting).normalize()
  goal.wrist.set(ball.x, Math.max(top, waitAt), ball.z).addScaledVector(goal.fingers, -frame.palm)
  goal.elbow.set(side * 0.9, 0.15, -0.7)
  goal.snap = 48
  shieldArm(pose.hands[1 - index], situation, 1 - index, guarded)
  pose.look.copy(situation.hoop).setY(situation.hoop.y * 0.6)
}

/** 持球时不运球的那只手：没人逼防时随步伐小幅摆动，被贴防时抬起前臂横在身前护球。 */
function shieldArm(goal: HandGoal, situation: Situation, index: number, amount: number): void {
  const side = sideOf(index)
  const unit = situation.frame.unit
  fromShoulder(goal, situation, index, 0.13, -0.2, 0.3)
  spot.copy(goal.wrist)
  hang(goal, situation, index)
  goal.wrist.z += situation.gait.swing[1 - index] * clamp(situation.speed / 3.2, 0, 1) * 0.12 * unit
  goal.wrist.lerp(spot, 0.25 + 0.75 * amount)
  goal.fingers.set(-side * 0.5 * amount, -0.6 + 1.2 * amount, 0.5)
  goal.palm.set(-side * (1 - amount), -0.2, amount)
  goal.elbow.set(side * 0.9, -0.3, -0.5)
}

/** 无球进攻时偶尔举手要球：靠球一侧的手举过头顶，掌心朝着持球的队友。 */
export function beckon(pose: Pose, situation: Situation): void {
  const { athlete, ball } = situation
  if (situation.pressure < 2.2 || situation.speed > 3.5 || Math.sin(situation.time * 0.9 + athlete.id * 2.1) < 0.55) return
  const index = ball.x > 0 ? 0 : 1
  const goal = pose.hands[index]
  fromShoulder(goal, situation, index, 0.12, 0.46, 0.18)
  goal.fingers.set(0, 1, 0.1)
  goal.palm.copy(ball).sub(goal.wrist).setY(0)
  goal.elbow.set(sideOf(index), -0.4, -0.5)
  goal.snap = 9
}

/** 双手持球：左右手各扶着球的一侧。跳起来抢到球、被撞得失去重心时用。 */
export function cradle(pose: Pose, situation: Situation): void {
  for (let index = 0; index < 2; index += 1) {
    const side = sideOf(index)
    const goal = pose.hands[index]
    grip(goal, situation.ball, toward.set(-side, 0.12, 0.2), fingers.set(0, 0.35, 0.94), situation.frame)
    goal.elbow.set(side, -0.6, -0.3)
    goal.snap = 48
  }
}

/** 传球飞向自己：球越近，双手越往球的方向伸，球到的时候手正好在那里。 */
export function receive(pose: Pose, situation: Situation): void {
  const { ball, frame } = situation
  const chestY = (situation.shoulders[0].y + situation.shoulders[1].y) * 0.5 - 0.15 * frame.unit
  const distance = Math.hypot(ball.x, ball.y - chestY, ball.z)
  const ready = smooth(4.2, 1.2, distance)
  if (ready <= 0) return
  for (let index = 0; index < 2; index += 1) {
    const side = sideOf(index)
    const goal = pose.hands[index]
    spot.copy(goal.wrist)
    grip(goal, ball, toward.set(-side * 0.8, 0, 0.6), fingers.set(side * 0.2, 0.7, 0.7), frame, 0.03)
    withinReach(goal, situation, index, 0.9)
    goal.wrist.lerpVectors(spot, goal.wrist, ready)
    goal.elbow.set(side, -0.7, -0.4)
    goal.snap = 30
  }
  pose.look.copy(ball)
}
