// 球员动画：每帧根据比赛里球员的状态选出姿势，再用步态和逆向运动学把骨架摆出来。全部现场计算，不使用预制动画。
import { Euler, Quaternion, Vector3 } from 'three'
import { COURT } from '../../sim/constants'
import type { Athlete, MatchState } from '../../sim/types'
import { advanceGait, createGait, plantFeet, type Gait, type GaitInput } from './gait'
import { aim, createLimbPose, solveLimb } from './ik'
import { applyMove, celebrate, dejected } from './moves'
import { createPose, sideOf, type Pose, type Situation } from './pose'
import { basePose, beckon, clamp, cradle, dribble, guard, receive, smooth } from './posture'
import type { Skeleton } from './skeleton'

export type Mood = Situation['mood']

interface Hand {
  /** 手腕位置（本体坐标，但高度不含起跳的高度，这样跳起来时手不会滞后）。 */
  wrist: Vector3
  fingers: Vector3
  palm: Vector3
  elbow: Vector3
}

/** 一名球员的动画状态：步态、目标姿势，以及各项正在平滑过渡的量。 */
export interface Motion {
  gait: Gait
  pose: Pose
  situation: Situation
  started: boolean
  crouch: number
  lean: number
  roll: number
  twist: number
  splay: number
  /** 骨盆相对“站立高度 + 起跳高度”的偏移。 */
  sink: number
  hands: [Hand, Hand]
  headYaw: number
  headPitch: number
  airborne: boolean
  /** 两只脚各自脱离落脚点的程度（0 踩在地上，1 完全由腾空姿势决定），以及是否已经蹬离地面。 */
  air: [number, number]
  released: [boolean, boolean]
  /** 落地缓冲的强度，落地瞬间为 1，随后衰减。 */
  landing: number
  lastX: number
  lastZ: number
  lastY: number
}

function createHand(): Hand {
  return { wrist: new Vector3(), fingers: new Vector3(0, -1, 0), palm: new Vector3(1, 0, 0), elbow: new Vector3(0, 0, -1) }
}

export function createMotion(athlete: Athlete, skeleton: Skeleton): Motion {
  const gait = createGait()
  const point = (): Vector3 => new Vector3()
  const situation: Situation = {
    athlete, frame: skeleton.frame, gait,
    shoulders: [point(), point()], hips: [point(), point()],
    speed: 0, ahead: 0, across: 0, hasBall: false, ball: point(), ballState: 'dead', ballHand: 1, receiving: false,
    defending: false, marking: false, mark: point(), contesting: false, hoop: point(), pressure: 9, mood: 'play', time: 0,
  }
  return {
    gait, pose: createPose(), situation, started: false,
    crouch: 0, lean: 0, roll: 0, twist: 0, splay: 0.1, sink: 0,
    hands: [createHand(), createHand()], headYaw: 0, headPitch: 0,
    airborne: false, air: [0, 0], released: [false, false], landing: 0, lastX: athlete.x, lastZ: athlete.z, lastY: 0,
  }
}

const euler = new Euler()
const pelvisTurn = new Quaternion()
const chestLocal = new Quaternion()
const chestTurn = new Quaternion()
const inverse = new Quaternion()
const endTurn = new Quaternion()
const pelvisAt = new Vector3()
const chestAt = new Vector3()
const ground = new Vector3()
const ankle = new Vector3()
const wrist = new Vector3()
const pole = new Vector3()
const gaze = new Vector3()
const offset = new Vector3()
const limbPose = createLimbPose()

/** 场上的一点换算到球员的本体坐标（+z 面朝方向，+x 左侧）。 */
function toLocal(out: Vector3, athlete: Athlete, x: number, y: number, z: number): Vector3 {
  const dx = x - athlete.x
  const dz = z - athlete.z
  const cos = Math.cos(athlete.facing)
  const sin = Math.sin(athlete.facing)
  return out.set(dx * sin - dz * cos, y, dx * cos + dz * sin)
}

function rate(speed: number, dt: number): number {
  return 1 - Math.exp(-speed * dt)
}

/** 收集这一帧摆姿势要用到的场上信息。 */
function describe(motion: Motion, athlete: Athlete, match: MatchState, mood: Mood, time: number): Situation {
  const situation = motion.situation
  const ball = match.ball
  const cos = Math.cos(athlete.facing)
  const sin = Math.sin(athlete.facing)
  situation.athlete = athlete
  situation.speed = Math.hypot(athlete.vx, athlete.vz)
  situation.ahead = athlete.vx * cos + athlete.vz * sin
  situation.across = -athlete.vx * sin + athlete.vz * cos
  situation.hasBall = ball.holder === athlete.id
  toLocal(situation.ball, athlete, ball.x, ball.y, ball.z)
  situation.ballState = ball.state
  situation.ballHand = ball.handBlend
  situation.receiving = ball.state === 'pass' && ball.passTarget === athlete.id
  situation.defending = athlete.team !== match.offense && match.phase === 'live'
  const man = match.athletes[(1 - athlete.team) * 3 + athlete.role]
  toLocal(situation.mark, athlete, man.x, man.y + man.height * 0.78, man.z)
  const holder = match.athletes[ball.holder]
  const threat = holder && holder.team !== athlete.team ? holder : man
  const gap = Math.hypot(threat.x - athlete.x, threat.z - athlete.z)
  situation.marking = situation.defending && (gap < 3.4 || Math.hypot(man.x - athlete.x, man.z - athlete.z) < 2.6)
  situation.contesting = situation.defending && threat.action === 'shoot' && !threat.released && gap < 2.4
  situation.hoop.set(0, 0, 0)
  toLocal(situation.hoop, athlete, match.attack[athlete.team] * COURT.hoopX, COURT.rimHeight, 0)
  let pressure = 9
  for (const other of match.athletes) {
    if (other.team !== athlete.team) pressure = Math.min(pressure, Math.hypot(other.x - athlete.x, other.z - athlete.z))
  }
  situation.pressure = pressure
  situation.mood = mood
  situation.time = time
  // 上一帧算出的肩、髋位置跟着这一帧的起跳高度走，手脚的目标才不会慢半拍。
  const rise = athlete.y - motion.lastY
  for (let index = 0; index < 2; index += 1) {
    situation.shoulders[index].y += rise
    situation.hips[index].y += rise
  }
  return situation
}

/** 按球员当前在做什么，选出这一帧的目标姿势。 */
function choosePose(pose: Pose, situation: Situation): void {
  const { athlete } = situation
  const grounded = athlete.y <= 1e-4
  basePose(pose, situation)
  const idle = athlete.action === 'free' || athlete.action === 'celebrate'
  if (situation.mood === 'celebrate' && idle && grounded) return celebrate(pose, situation)
  if (situation.mood === 'dejected' && idle && grounded) return dejected(pose, situation)
  if (athlete.action === 'free' || athlete.action === 'dash') {
    if (situation.hasBall) {
      if (grounded) dribble(pose, situation)
      else cradle(pose, situation)
    } else if (situation.defending && (situation.marking || athlete.squared)) guard(pose, situation)
    else if (!situation.defending && situation.ballState === 'held' && grounded) beckon(pose, situation)
    if (situation.receiving) receive(pose, situation)
  }
  applyMove(pose, situation)
}

function easeToward(motion: Motion, dt: number): void {
  const pose = motion.pose
  if (!motion.started) {
    motion.crouch = pose.crouch
    motion.lean = pose.lean
    motion.roll = pose.roll
    motion.twist = pose.twist
    motion.splay = pose.splay
  }
  motion.crouch += (pose.crouch - motion.crouch) * rate(24, dt)
  motion.lean += (pose.lean - motion.lean) * rate(13, dt)
  motion.roll += (pose.roll - motion.roll) * rate(11, dt)
  motion.twist += (pose.twist - motion.twist) * rate(13, dt)
  motion.splay += (pose.splay - motion.splay) * rate(10, dt)
}

/** 推进步态；刚落地时把脚重新踩到站位上并记下落地缓冲。 */
function stepFeet(motion: Motion, athlete: Athlete, skeleton: Skeleton, dt: number, teleported: boolean): void {
  const { frame } = skeleton
  const grounded = athlete.y <= 1e-4
  const input: GaitInput = {
    x: athlete.x, z: athlete.z, vx: athlete.vx, vz: athlete.vz, facing: athlete.facing,
    width: motion.pose.width, toeOut: motion.pose.toeOut, hipHeight: frame.hipHeight - motion.crouch - 0.06 * frame.unit, frame,
  }
  if (teleported || (grounded && motion.airborne)) {
    plantFeet(motion.gait, input)
    motion.released = [false, false]
    if (!teleported) motion.landing = 1
  }
  motion.airborne = !grounded
  motion.landing *= Math.exp(-dt * 9)
  if (grounded) advanceGait(motion.gait, input, dt)
}

/** 骨盆和躯干：高度受支撑腿的长度限制（腿伸直了还够不着就得降低重心），再按姿势前倾、侧倾、扭转。 */
function placeTorso(motion: Motion, athlete: Athlete, skeleton: Skeleton, dt: number): void {
  const { frame } = skeleton
  const { gait, situation } = motion
  const unit = frame.unit
  const grounded = athlete.y <= 1e-4
  // 跑动时在两步之间腾起、支撑中段最低。
  const bob = gait.stepping ? gait.run * 0.022 * unit * (2 * gait.swing[0] * gait.swing[0] - 1) : 0
  let sink = -motion.crouch - motion.landing * 0.11 * unit + bob
  if (grounded) {
    // 支撑腿始终留一点弯曲，不会把膝盖锁死。
    const leg = (frame.thigh + frame.shin) * 0.975
    for (let index = 0; index < 2; index += 1) {
      const foot = gait.feet[index]
      if (!foot.planted) continue
      toLocal(ground, athlete, foot.x, 0, foot.z)
      const flat = Math.hypot(ground.x - sideOf(index) * frame.hipHalf, ground.z)
      const heel = Math.max(0, foot.pitch)
      const ankleY = frame.ankle * Math.cos(heel) + frame.footBall * Math.sin(heel)
      const highest = ankleY + Math.sqrt(Math.max(0.01, leg * leg - flat * flat)) - frame.hipHeight
      sink = Math.max(Math.min(sink, highest), sink - 0.1 * unit)
    }
  }
  motion.sink = motion.started ? motion.sink + (sink - motion.sink) * rate(30, dt) : sink
  const stride = 0.16 * gait.run * (gait.swing[1] - gait.swing[0]) * 0.5
  pelvisAt.set(0, frame.hipHeight + motion.sink + athlete.y, -motion.lean * 0.1 * unit)
  pelvisTurn.setFromEuler(euler.set(motion.lean * 0.3, stride + motion.twist * 0.25, motion.roll * 0.5, 'YXZ'))
  chestLocal.setFromEuler(euler.set(motion.lean * 0.7, motion.twist * 0.75 - stride * 1.7, motion.roll * 0.5, 'YXZ'))
  chestTurn.multiplyQuaternions(pelvisTurn, chestLocal)
  skeleton.pelvis.position.copy(pelvisAt)
  skeleton.pelvis.quaternion.copy(pelvisTurn)
  skeleton.chest.quaternion.copy(chestLocal)
  chestAt.set(0, frame.waist, 0).applyQuaternion(pelvisTurn).add(pelvisAt)
  for (let index = 0; index < 2; index += 1) {
    const side = sideOf(index)
    situation.hips[index].set(side * frame.hipHalf, 0, 0).applyQuaternion(pelvisTurn).add(pelvisAt)
    situation.shoulders[index].set(side * frame.shoulderHalf, frame.shoulderRise, 0).applyQuaternion(chestTurn).add(chestAt)
  }
}

/** 一条腿：脚踩在落脚点上；腾空时（腿伸直了还够不着地面，或者是上篮提膝的那条腿）改由姿势决定脚的位置。 */
function placeLeg(motion: Motion, athlete: Athlete, skeleton: Skeleton, index: number, dt: number): void {
  const { frame } = skeleton
  const { pose, situation } = motion
  const foot = motion.gait.feet[index]
  const hip = situation.hips[index]
  const grounded = athlete.y <= 1e-4
  const leg = frame.thigh + frame.shin
  toLocal(ground, athlete, foot.x, 0, foot.z)
  const yaw = athlete.facing - foot.yaw
  // 起跳蹬伸：腿快伸直时脚跟抬起，最后只有前脚掌着地。
  const stretch = grounded ? 0 : smooth(leg * 0.9, leg, Math.hypot(ground.x - hip.x, hip.y - frame.ankle, ground.z - hip.z)) * 0.8
  const heel = Math.max(0, foot.pitch) + stretch
  const forward = frame.footBall * (1 - Math.cos(heel)) + frame.ankle * Math.sin(heel)
  ground.x += Math.sin(yaw) * forward
  ground.z += Math.cos(yaw) * forward
  ground.y = foot.lift + frame.ankle * Math.cos(heel) + frame.footBall * Math.sin(heel) + 0.06 * frame.unit * Math.sin(Math.max(0, -foot.pitch))
  if (!grounded && (pose.early[index] || ground.distanceTo(hip) > leg * 0.995)) motion.released[index] = true
  const lifted = !grounded && motion.released[index] ? 1 : 0
  motion.air[index] += (lifted - motion.air[index]) * rate(lifted ? 18 : 32, dt)
  const air = motion.air[index]
  ankle.copy(hip).add(pose.airFeet[index]).lerpVectors(ground, ankle, air)
  pole.set(sideOf(index) * motion.splay, 0, 1)
  solveLimb(hip, ankle, pole, frame.thigh, frame.shin, true, limbPose)
  const bones = skeleton.legs[index]
  bones.upper.quaternion.copy(inverse.copy(pelvisTurn).invert()).multiply(limbPose.upper)
  bones.lower.quaternion.copy(inverse.copy(limbPose.upper).invert()).multiply(limbPose.lower)
  const pitch = (foot.pitch + stretch) * (1 - air) + pose.airPitch[index] * air
  endTurn.setFromEuler(euler.set(pitch, yaw * (1 - air), 0, 'YXZ'))
  bones.end.quaternion.copy(inverse.copy(limbPose.lower).invert()).multiply(endTurn)
}

/** 一条手臂：手腕平滑地移向目标（手在球上时跟得很紧），肘尖朝姿势指定的方向。 */
function placeArm(motion: Motion, athlete: Athlete, skeleton: Skeleton, index: number, dt: number): void {
  const { frame } = skeleton
  const goal = motion.pose.hands[index]
  const hand = motion.hands[index]
  offset.copy(goal.wrist)
  offset.y -= athlete.y
  if (!motion.started) {
    hand.wrist.copy(offset)
    hand.fingers.copy(goal.fingers).normalize()
    hand.palm.copy(goal.palm).normalize()
    hand.elbow.copy(goal.elbow).normalize()
  }
  hand.wrist.lerp(offset, rate(goal.snap, dt))
  const turn = rate(Math.max(14, goal.snap * 0.6), dt)
  hand.fingers.lerp(offset.copy(goal.fingers).normalize(), turn).normalize()
  hand.palm.lerp(offset.copy(goal.palm).normalize(), turn).normalize()
  hand.elbow.lerp(offset.copy(goal.elbow).normalize(), rate(12, dt)).normalize()
  wrist.copy(hand.wrist)
  wrist.y += athlete.y
  solveLimb(motion.situation.shoulders[index], wrist, hand.elbow, frame.upperArm, frame.forearm, false, limbPose)
  const bones = skeleton.arms[index]
  bones.upper.quaternion.copy(inverse.copy(chestTurn).invert()).multiply(limbPose.upper)
  bones.lower.quaternion.copy(inverse.copy(limbPose.upper).invert()).multiply(limbPose.lower)
  aim(hand.fingers, hand.palm, endTurn)
  bones.end.quaternion.copy(inverse.copy(limbPose.lower).invert()).multiply(endTurn)
}

/** 头转向视线目标，转动范围不超过脖子能转的角度。 */
function placeHead(motion: Motion, skeleton: Skeleton, dt: number): void {
  const { frame } = skeleton
  gaze.set(0, frame.neckRise + frame.headRise, 0).applyQuaternion(chestTurn).add(chestAt)
  gaze.subVectors(motion.pose.look, gaze)
  if (gaze.lengthSq() < 1e-6) gaze.set(0, 0, 1)
  gaze.normalize().applyQuaternion(inverse.copy(chestTurn).invert())
  const yaw = clamp(Math.atan2(gaze.x, gaze.z), -1.25, 1.25)
  const pitch = clamp(Math.asin(clamp(gaze.y, -1, 1)), -0.7, 0.6)
  const k = motion.started ? rate(9, dt) : 1
  motion.headYaw += (yaw - motion.headYaw) * k
  motion.headPitch += (pitch - motion.headPitch) * k
  skeleton.head.rotation.set(-motion.headPitch, motion.headYaw, 0, 'YXZ')
}

/** 第一帧，或者球员被整个挪了位置（重新开球）：把肩、髋放回站立的位置，各项过渡量从头开始。 */
function seed(motion: Motion, skeleton: Skeleton, athlete: Athlete): void {
  const { frame } = skeleton
  motion.started = false
  motion.lastY = athlete.y
  motion.air = [0, 0]
  for (let index = 0; index < 2; index += 1) {
    const side = sideOf(index)
    motion.situation.hips[index].set(side * frame.hipHalf, frame.hipHeight + athlete.y, 0)
    motion.situation.shoulders[index].set(side * frame.shoulderHalf, frame.hipHeight + frame.waist + frame.shoulderRise + athlete.y, 0)
  }
}

/**
 * 把骨架摆到球员当前的位置和姿势。
 * @param dt 模拟经过的秒数（慢动作时变小，暂停时为 0）
 */
export function animateAthlete(skeleton: Skeleton, motion: Motion, athlete: Athlete, match: MatchState, mood: Mood, time: number, dt: number): void {
  skeleton.root.position.set(athlete.x, 0, athlete.z)
  // 模拟里的朝向 0 指向 +x，模型朝向本地 +z。
  skeleton.root.rotation.y = Math.PI / 2 - athlete.facing
  const teleported = !motion.started || Math.hypot(athlete.x - motion.lastX, athlete.z - motion.lastZ) > 1.5
  if (teleported) seed(motion, skeleton, athlete)
  const situation = describe(motion, athlete, match, mood, time)
  choosePose(motion.pose, situation)
  easeToward(motion, dt)
  stepFeet(motion, athlete, skeleton, dt, teleported)
  placeTorso(motion, athlete, skeleton, dt)
  for (let index = 0; index < 2; index += 1) {
    placeLeg(motion, athlete, skeleton, index, dt)
    placeArm(motion, athlete, skeleton, index, dt)
  }
  placeHead(motion, skeleton, dt)
  motion.started = true
  motion.lastX = athlete.x
  motion.lastZ = athlete.z
  motion.lastY = athlete.y
}
