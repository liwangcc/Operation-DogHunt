// 动作姿势：跳投、上篮、扣篮、传球、抢断、起跳、失去重心、变向，以及进球后的庆祝和输球后的沮丧。
import { Vector3 } from 'three'
import { COURT, MOVES, SHOT } from '../../sim/constants'
import { fromShoulder, grip, sideOf, withinReach, type Pose, type Situation } from './pose'
import { clamp, cradle, smooth } from './posture'

const toward = new Vector3()
const fingers = new Vector3()
const spot = new Vector3()
const rest = new Vector3()

function mix(out: Vector3, ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number): Vector3 {
  return out.set(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)
}

/** 起跳前的一蹲：动作开始的一瞬间重心压低，随后蹬伸。 */
function dip(time: number, depth: number, unit: number): number {
  return (0.03 + depth * (1 - smooth(0, 0.15, time))) * unit
}

/** 跳投：球从胸前举到额前，投篮手在球的后下方、扶球手在侧面；出手后手臂伸直、手腕下压保持随球动作。 */
function shoot(pose: Pose, situation: Situation): void {
  const { athlete, frame, ball } = situation
  const unit = frame.unit
  const time = athlete.actionTime
  pose.crouch = dip(time, 0.22, unit)
  pose.roll = 0
  pose.twist = 0
  pose.width = 0.34 * unit
  pose.toeOut = 0.1
  pose.look.copy(situation.hoop)
  for (let index = 0; index < 2; index += 1) {
    pose.airFeet[index].set(sideOf(index) * 0.02 * unit, -(frame.thigh + frame.shin) * 0.955, -0.04 * unit)
    pose.airPitch[index] = 0.65
  }
  const [left, right] = pose.hands
  if (situation.hasBall) {
    const lift = clamp(time / (SHOT.idealRelease * 0.8), 0, 1)
    pose.lean = 0.1 - 0.14 * lift
    grip(right, ball, mix(toward, 1, 0.1, 0.15, 0.12, 0.72, 0.68, lift), mix(fingers, 0, 0.45, 0.9, 0.05, 0.72, -0.69, lift), frame)
    mix(right.elbow, -0.6, -0.6, -0.5, -0.25, -0.55, 0.8, lift)
    grip(left, ball, mix(toward, -1, 0.1, 0.15, -0.93, 0.05, 0.36, lift), mix(fingers, 0, 0.45, 0.9, 0, 0.97, 0.2, lift), frame)
    left.elbow.set(0.85, -0.5, 0.1)
    left.snap = right.snap = 60
    return
  }
  pose.lean = -0.03
  fromShoulder(right, situation, 1, -0.03, 0.5, 0.3)
  right.fingers.set(0, -0.5, 0.87)
  right.palm.set(0, -0.87, -0.5)
  right.elbow.set(-0.3, -0.4, 0.5)
  right.snap = 20
  fromShoulder(left, situation, 0, -0.05, 0.3, 0.22)
  left.fingers.set(0, 1, 0.25)
  left.palm.set(-1, 0, 0.1)
  left.elbow.set(0.8, -0.5, 0)
  left.snap = 13
}

/** 上篮：外侧手托球举起，同侧膝盖提起，另一条腿蹬地后伸直；出手后手指向篮筐。 */
function layup(pose: Pose, situation: Situation): void {
  const { athlete, frame, ball } = situation
  const unit = frame.unit
  const time = athlete.actionTime
  const index = situation.ballHand >= 0 ? 1 : 0
  const side = sideOf(index)
  const rise = smooth(0, 0.22, time)
  const land = smooth(MOVES.layupRelease + 0.08, MOVES.layupSeconds + 0.1, time)
  pose.crouch = dip(time, 0.16, unit)
  pose.lean = 0.14 - 0.1 * rise
  pose.twist = -side * 0.25 * rise * (1 - land)
  pose.roll = 0
  pose.look.copy(situation.hoop)
  const leg = frame.thigh + frame.shin
  pose.early[index] = true
  pose.airFeet[index].set(side * 0.02 * unit, (-0.5 - 0.4 * land) * unit, 0.3 * unit * (1 - land))
  pose.airPitch[index] = 0.3
  pose.airFeet[1 - index].set(-side * 0.02 * unit, -leg * 0.96, -0.12 * unit * (1 - land))
  pose.airPitch[1 - index] = 0.8
  const goal = pose.hands[index]
  if (situation.hasBall) {
    grip(goal, ball, toward.set(0, 1, 0.12), fingers.set(-side * 0.1, 0.1, 1), frame)
    goal.elbow.set(side * 0.5, -1, -0.2)
    goal.snap = 60
  } else {
    fromShoulder(goal, situation, index, 0.02, 0.54 - 0.5 * land, 0.24)
    goal.fingers.set(0, 0.6, 0.8)
    goal.palm.set(0, 0.8, -0.6)
    goal.elbow.set(side * 0.4, -0.8, -0.3)
    goal.snap = 18
  }
  const off = pose.hands[1 - index]
  fromShoulder(off, situation, 1 - index, 0.16, -0.12 + 0.1 * rise, 0.26)
  off.fingers.set(side * 0.3, 0.6, 0.7)
  off.palm.set(side, 0, 0.6)
  off.elbow.set(-side * 0.9, -0.4, -0.3)
  off.snap = 16
}

/** 扣篮：上升时收腿、把球举过头顶（内线双手，其他人单手），砸进篮筐后手挂在筐沿上，双腿随惯性前摆。 */
function dunk(pose: Pose, situation: Situation): void {
  const { athlete, frame, ball, hoop } = situation
  const unit = frame.unit
  const time = athlete.actionTime
  const both = athlete.role === 2
  const index = situation.ballHand >= 0 ? 1 : 0
  const wind = smooth(0, MOVES.dunkSlam * 0.8, time)
  const since = time - MOVES.dunkSlam
  const slammed = athlete.released
  const hanging = slammed && since < 0.24
  pose.crouch = dip(time, 0.2, unit)
  pose.lean = slammed ? 0.22 : 0.05 - 0.2 * wind
  pose.twist = both || slammed ? 0 : -sideOf(index) * 0.3 * wind
  pose.roll = 0
  pose.look.copy(hoop)
  const tuck = smooth(0.04, 0.24, time) * (1 - (slammed ? smooth(0, 0.16, since) : 0))
  const swing = slammed ? smooth(0, 0.16, since) * (1 - smooth(0.2, 0.36, since)) : 0
  const leg = frame.thigh + frame.shin
  for (let side = 0; side < 2; side += 1) {
    pose.airFeet[side].set(sideOf(side) * 0.04 * unit, -leg * 0.94 + (leg * 0.94 - 0.52 * unit) * tuck, (-0.03 - 0.19 * tuck + 0.26 * swing) * unit)
    pose.airPitch[side] = 0.5 + 0.4 * tuck
  }
  for (let side = 0; side < 2; side += 1) {
    const goal = pose.hands[side]
    const out = sideOf(side)
    const dunking = both || side === index
    if (dunking && situation.hasBall) {
      if (both) grip(goal, ball, toward.set(-out * 0.75, -0.35, 0.55), fingers.set(0, 0.85, 0.5), frame)
      else grip(goal, ball, toward.set(0, -0.25, 0.97), fingers.set(0, 0.97, 0.25), frame)
      goal.elbow.set(out * 0.7, -0.3, -0.7)
      goal.snap = 60
    } else if (dunking && hanging) {
      // 筐沿上离自己最近的一点；双手扣篮时两只手分开一点。
      const flat = Math.max(0.01, Math.hypot(hoop.x, hoop.z))
      goal.fingers.set(0, -0.35, 0.94).normalize()
      goal.palm.set(0, -0.94, -0.35)
      goal.wrist.set(hoop.x - (hoop.x / flat) * COURT.rimRadius + (both ? out * 0.11 : 0), hoop.y + 0.025, hoop.z - (hoop.z / flat) * COURT.rimRadius)
      goal.wrist.addScaledVector(goal.fingers, -frame.palm)
      withinReach(goal, situation, side, 1)
      goal.elbow.set(out * 0.7, -0.3, -0.7)
      goal.snap = 70
    } else if (dunking) {
      fromShoulder(goal, situation, side, 0.2, -0.28, 0.16)
      goal.fingers.set(0, -0.8, 0.6)
      goal.palm.set(-out, 0, 0.2)
      goal.elbow.set(out * 0.6, -0.3, -0.8)
      goal.snap = 12
    } else {
      // 单手扣篮时另一只手向外张开保持平衡。
      fromShoulder(goal, situation, side, 0.34, -0.12, 0.08)
      goal.fingers.set(out * 0.8, -0.5, 0.2)
      goal.palm.set(0, -1, 0)
      goal.elbow.set(out, -0.3, -0.6)
      goal.snap = 16
    }
  }
}

/** 胸前传球：双手从胸口向前推出，拇指朝下翻腕。 */
function pass(pose: Pose, situation: Situation): void {
  const unit = situation.frame.unit
  const push = smooth(0, 0.09, situation.athlete.actionTime)
  const chestY = (situation.shoulders[0].y + situation.shoulders[1].y) * 0.5 - 0.14 * unit
  pose.lean = 0.12 + 0.14 * push
  pose.crouch += 0.02 * unit
  for (let index = 0; index < 2; index += 1) {
    const side = sideOf(index)
    const goal = pose.hands[index]
    goal.wrist.set(side * 0.1 * unit, chestY, (0.26 + 0.3 * push) * unit)
    goal.fingers.set(side * 0.25, 0, 1)
    goal.palm.set(side * 0.9, -0.3, 0.2)
    goal.elbow.set(side, -0.6, -0.4)
    goal.snap = 40
  }
  pose.look.set(0, chestY, 6)
}

/** 抢断：压低身体向前探，靠球一侧的手伸出去掏球再收回，另一只手向后摆保持平衡。 */
function steal(pose: Pose, situation: Situation): void {
  const { frame, ball } = situation
  const unit = frame.unit
  const out = Math.pow(Math.sin(Math.PI * clamp(situation.athlete.actionTime / MOVES.stealSeconds, 0, 1)), 0.7)
  const index = ball.x > 0 ? 0 : 1
  const side = sideOf(index)
  pose.crouch = 0.2 * unit
  pose.lean = 0.34 + 0.16 * out
  pose.twist = -side * 0.3 * out
  pose.width = 0.6 * unit
  pose.splay = 0.4
  pose.look.copy(ball)
  const goal = pose.hands[index]
  fromShoulder(goal, situation, index, 0.2, -0.3, 0.2)
  rest.copy(goal.wrist)
  const near = Math.hypot(ball.x, ball.z) < 2.2
  spot.set(near ? ball.x : 0, near ? ball.y : 0.9 * unit, near ? ball.z : 0.7 * unit)
  goal.fingers.subVectors(spot, situation.shoulders[index]).normalize()
  goal.wrist.copy(spot).addScaledVector(goal.fingers, -frame.palm)
  withinReach(goal, situation, index, 0.99)
  goal.wrist.lerpVectors(rest, goal.wrist, out)
  goal.palm.set(0, -0.8, 0.3)
  goal.elbow.set(side * 0.8, -0.3, -0.5)
  goal.snap = 40
  const other = pose.hands[1 - index]
  fromShoulder(other, situation, 1 - index, 0.3, -0.25, -0.12)
  other.fingers.set(-side * 0.5, -0.8, -0.2)
  other.palm.set(0, 0, -1)
  other.elbow.set(-side * 0.6, 0.2, -1)
  other.snap = 16
}

/** 起跳封盖、抢板：双臂上举；球就在够得着的地方时，手直接伸向球。 */
function jump(pose: Pose, situation: Situation): void {
  const { frame, ball } = situation
  const unit = frame.unit
  pose.crouch = dip(situation.athlete.actionTime, 0.2, unit)
  pose.lean = 0.02
  pose.roll = 0
  pose.twist = 0
  pose.width = 0.36 * unit
  pose.look.copy(ball)
  for (let index = 0; index < 2; index += 1) {
    const side = sideOf(index)
    const goal = pose.hands[index]
    pose.airFeet[index].set(side * 0.03 * unit, -(frame.thigh + frame.shin) * 0.93, -0.03 * unit)
    pose.airPitch[index] = 0.6
    fromShoulder(goal, situation, index, 0.05, 0.56, 0.12)
    goal.fingers.set(0, 1, 0.1)
    goal.palm.set(0, 0.1, 1)
    goal.elbow.set(side, -0.2, -0.8)
    goal.snap = 24
    const shoulder = situation.shoulders[index]
    const distance = ball.distanceTo(shoulder)
    if (situation.hasBall || ball.y < shoulder.y - 0.1 || distance > 1.5 * unit) continue
    // 手掌迎着球：掌心朝向球心。
    rest.copy(goal.wrist)
    toward.subVectors(ball, shoulder).normalize()
    grip(goal, ball, toward, fingers.set(0, 1, 0.2).addScaledVector(toward, -toward.y), frame, 0.02)
    withinReach(goal, situation, index, 0.99)
    goal.wrist.lerpVectors(rest, goal.wrist, smooth(1.5 * unit, 0.9 * unit, distance))
    goal.snap = 40
  }
}

/** 被掏掉球、被撞开：上身后仰，双臂张开找平衡。 */
function stun(pose: Pose, situation: Situation): void {
  const unit = situation.frame.unit
  pose.lean = -0.26
  pose.crouch = 0.07 * unit
  pose.width = 0.5 * unit
  for (let index = 0; index < 2; index += 1) {
    const side = sideOf(index)
    const goal = pose.hands[index]
    fromShoulder(goal, situation, index, 0.4, 0.02 + 0.08 * Math.sin(situation.time * 18 + index * 2), -0.04)
    goal.fingers.set(side * 0.8, 0.5, 0)
    goal.palm.set(0, -0.3, 1)
    goal.elbow.set(side * 0.6, -0.8, -0.2)
    goal.snap = 22
  }
  if (situation.hasBall) cradle(pose, situation)
}

/** 把当前动作的姿势叠加到基础姿势上。 */
export function applyMove(pose: Pose, situation: Situation): void {
  const unit = situation.frame.unit
  switch (situation.athlete.action) {
    case 'shoot':
      return shoot(pose, situation)
    case 'layup':
      return layup(pose, situation)
    case 'dunk':
      return dunk(pose, situation)
    case 'pass':
      return pass(pose, situation)
    case 'steal':
      return steal(pose, situation)
    case 'jump':
      return jump(pose, situation)
    case 'stun':
      return stun(pose, situation)
    case 'dash':
      // 变向：身体压低，整个人朝蹿出去的方向倾斜。
      pose.crouch = Math.max(pose.crouch, 0.16 * unit)
      pose.lean = 0.3
      pose.roll = clamp(situation.across / 6, -1, 1) * 0.34
      return
    default:
  }
}

/** 进球后的庆祝，按球员编号固定分配三种：挥拳、张开双臂仰头、轮流捶胸。 */
export function celebrate(pose: Pose, situation: Situation): void {
  const unit = situation.frame.unit
  const beat = situation.time * 7.5
  const kind = situation.athlete.id % 3
  const chestY = (situation.shoulders[0].y + situation.shoulders[1].y) * 0.5
  pose.width = 0.42 * unit
  pose.twist = 0
  pose.roll = 0
  pose.look.set(0, 1.85 * unit, 5)
  const [left, right] = pose.hands
  if (kind === 0) {
    // 挥拳：每挥一下身体跟着一沉一挺，上身带一点转动。
    pose.lean = -0.08 + 0.07 * Math.sin(beat)
    pose.twist = 0.14 * Math.sin(beat * 0.5)
    pose.crouch = (0.05 + 0.09 * Math.abs(Math.sin(beat * 0.5))) * unit
    fromShoulder(right, situation, 1, 0.1, 0.2 + 0.16 * Math.sin(beat), 0.2)
    right.fingers.set(0, 1, 0)
    right.palm.set(1, 0, 0)
    right.elbow.set(-0.5, -1, 0.2)
    fromShoulder(left, situation, 0, 0.16, -0.42, 0.02)
    left.fingers.set(0, -0.6, 0.8)
    left.palm.set(-1, 0, 0)
    left.elbow.set(0.7, 0, -0.7)
  } else if (kind === 1) {
    // 张开双臂仰头：手臂一起一落地向上扬，身体缓缓左右转，像在向全场示意。
    pose.lean = -0.2
    pose.twist = 0.3 * Math.sin(beat * 0.22)
    pose.crouch = (0.03 + 0.05 * Math.abs(Math.sin(beat * 0.45))) * unit
    pose.look.set(Math.sin(beat * 0.22) * 2, 4, 3)
    for (let index = 0; index < 2; index += 1) {
      const side = sideOf(index)
      const goal = pose.hands[index]
      fromShoulder(goal, situation, index, 0.44, 0.2 + 0.1 * Math.sin(beat * 0.45), 0.02)
      goal.fingers.set(side * 0.9, 0.45, 0)
      goal.palm.set(0, 0.8, 0.6)
      goal.elbow.set(side * 0.2, -1, -0.3)
    }
  } else {
    pose.lean = -0.05
    pose.crouch = (0.04 + 0.07 * Math.abs(Math.sin(beat))) * unit
    const hitting = Math.sin(beat) > 0 ? 1 : 0
    for (let index = 0; index < 2; index += 1) {
      const side = sideOf(index)
      const goal = pose.hands[index]
      if (index === hitting) goal.wrist.set(side * 0.07 * unit, chestY - 0.17 * unit, 0.19 * unit)
      else fromShoulder(goal, situation, index, 0.3, -0.12, 0.14)
      goal.fingers.set(-side * 0.9, 0.2, -0.2)
      goal.palm.set(0, 0, -1)
      goal.elbow.set(side, -0.5, -0.2)
    }
  }
  left.snap = right.snap = 20
}

/** 终场输球的一方：低头、微微弓背，双手叉腰。 */
export function dejected(pose: Pose, situation: Situation): void {
  const { frame } = situation
  const unit = frame.unit
  pose.lean = 0.2
  pose.crouch = 0.03 * unit
  pose.width = 0.36 * unit
  pose.twist = 0
  pose.look.set(0, 0.2, 1.6)
  for (let index = 0; index < 2; index += 1) {
    const side = sideOf(index)
    const goal = pose.hands[index]
    goal.wrist.set(side * (frame.hipHalf + 0.1 * unit), frame.hipHeight - pose.crouch + 0.07 * unit, 0.03 * unit)
    goal.fingers.set(-side * 0.3, -0.8, 0.5)
    goal.palm.set(-side, 0, 0)
    goal.elbow.set(side, 0, -0.5)
    goal.snap = 10
  }
}
