// 步态：决定两只脚什么时候抬、落在哪。脚落地后钉在世界坐标上不动（不打滑），身体从它上方经过；
// 向前跑、横向滑步、后撤各有自己的步频、触地时间和站宽，按移动方向与身体朝向的夹角混合。
import type { Frame } from './skeleton'

export interface Foot {
  /** 踝关节在地面上的投影（世界坐标），以及脚尖朝向（与模拟相同的角度制：0 指向 +x）。 */
  x: number
  z: number
  yaw: number
  /** 离地高度；俯仰（正值脚跟抬起、脚尖朝下，负值脚尖翘起）。 */
  lift: number
  pitch: number
  planted: boolean
  /** 落地后经过的秒数，以及落地瞬间的俯仰（脚跟先着地时为负，随后放平）。 */
  plantedFor: number
  landPitch: number
  /** 这一步摆动到了哪里（0 刚抬起，1 落地），以及从哪里抬起的。 */
  progress: number
  fromX: number
  fromZ: number
  fromYaw: number
  fromPitch: number
  /** 最近一次抬脚属于第几个步态周期：每个周期只按节拍迈一步。 */
  cycle: number
}

export interface Gait {
  /** 一个完整步态周期里的位置（0–1）与已经走过的周期数。左脚在周期开头落地，右脚晚半个周期。 */
  phase: number
  turns: number
  feet: [Foot, Foot]
  stepping: boolean
  /** 两条腿各自摆在身体前方多少（-1 在最后，+1 在最前），手臂按它反向摆动。 */
  swing: [number, number]
  /** 向前跑的成分乘以速度比例（0–1）：决定摆臂幅度和身体起伏。 */
  run: number
}

export interface GaitInput {
  x: number
  z: number
  vx: number
  vz: number
  facing: number
  /** 两脚之间的站宽，以及脚尖外撇的角度。 */
  width: number
  toeOut: number
  /** 髋关节当前离地的高度：腿够不着落脚点时提前抬脚。 */
  hipHeight: number
  frame: Frame
}

interface Rhythm {
  /** 一个周期（左右脚各一步）的秒数、每只脚触地的比例。 */
  period: number
  duty: number
  /** 落脚点在髋的正前方多远（占触地期间身体位移的比例）。 */
  lead: number
  height: number
  width: number
  /** 向前跑的成分（0–1），以及它乘以速度比例。 */
  ahead: number
  run: number
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function smooth(from: number, to: number, value: number): number {
  const t = clamp((value - from) / (to - from), 0, 1)
  return t * t * (3 - 2 * t)
}

function turn(from: number, to: number, t: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + delta * t
}

function createFoot(): Foot {
  return { x: 0, z: 0, yaw: 0, lift: 0, pitch: 0, planted: true, plantedFor: 1, landPitch: 0, progress: 0, fromX: 0, fromZ: 0, fromYaw: 0, fromPitch: 0, cycle: -1 }
}

export function createGait(): Gait {
  return { phase: 0, turns: 0, feet: [createFoot(), createFoot()], stepping: false, swing: [0, 0], run: 0 }
}

/** 左脚在身体右方向的负侧，右脚在正侧。 */
function sideOf(index: number): number {
  return index === 0 ? -1 : 1
}

/**
 * 当前速度下的步态节奏。forward 是速度方向与身体朝向夹角的余弦：
 * 接近 1 是向前跑（步子大、有腾空），接近 0 是横向滑步（步子碎、站得宽、脚不交叉），接近 -1 是后撤。
 * 站着不动时用一个小碎步的节奏把脚倒回站位。
 */
function rhythmFor(input: GaitInput, speed: number): Rhythm {
  const unit = input.frame.unit
  if (speed <= 0.35) return { period: 0.4, duty: 0.56, lead: 0.5, height: 0.05 * unit, width: input.width, ahead: 0, run: 0 }
  const forward = (input.vx * Math.cos(input.facing) + input.vz * Math.sin(input.facing)) / speed
  const ahead = Math.max(0, forward) ** 2
  const back = Math.max(0, -forward) ** 2
  const side = Math.max(0, 1 - ahead - back)
  const runPeriod = clamp(0.98 - 0.08 * speed, 0.44, 0.9)
  // 一只脚触地期间身体最多前进 0.9 米，再多腿就够不着了；速度越快触地越短，两步之间有腾空。
  const runDuty = clamp((0.9 * unit) / (speed * runPeriod), 0.24, 0.62)
  const sidePeriod = clamp(0.6 - 0.07 * speed, 0.34, 0.6)
  const sideDuty = clamp(0.62 - 0.075 * speed, 0.36, 0.6)
  const backPeriod = clamp(0.7 - 0.06 * speed, 0.4, 0.7)
  const backDuty = clamp((0.55 * unit) / (speed * backPeriod), 0.3, 0.6)
  const stride = clamp((speed - 1) / 5.5, 0, 1)
  return {
    period: ahead * runPeriod + side * sidePeriod + back * backPeriod,
    duty: ahead * runDuty + side * sideDuty + back * backDuty,
    lead: ahead * 0.36 + (side + back) * 0.5,
    height: unit * (ahead * (0.05 + 0.4 * stride) + side * (0.06 + 0.012 * speed) + back * 0.08),
    // 滑步越快站得越宽，两脚才不会碰到一起。
    width: input.width + unit * side * 0.07 * speed,
    ahead,
    run: ahead * clamp(speed / 7, 0, 1),
  }
}

/** 把两只脚直接放到站位上（开场、落地之后）。 */
export function plantFeet(gait: Gait, input: GaitInput): void {
  const rightX = -Math.sin(input.facing)
  const rightZ = Math.cos(input.facing)
  gait.feet.forEach((foot, index) => {
    const side = sideOf(index)
    foot.x = input.x + rightX * side * input.width * 0.5
    foot.z = input.z + rightZ * side * input.width * 0.5
    foot.yaw = input.facing + side * input.toeOut
    foot.lift = 0
    foot.pitch = 0
    foot.planted = true
    foot.plantedFor = 0
    foot.landPitch = 0
  })
  gait.stepping = false
  gait.swing = [0, 0]
}

/** 两只脚都踩在站位附近、脚尖方向也对，就可以站定不再倒脚。 */
function settled(gait: Gait, input: GaitInput): boolean {
  const rightX = -Math.sin(input.facing)
  const rightZ = Math.cos(input.facing)
  const tolerance = 0.1 * input.frame.unit + 0.08 * input.width
  return gait.feet.every((foot, index) => {
    if (!foot.planted) return false
    const side = sideOf(index)
    const homeX = input.x + rightX * side * input.width * 0.5
    const homeZ = input.z + rightZ * side * input.width * 0.5
    if (Math.hypot(foot.x - homeX, foot.z - homeZ) > tolerance) return false
    const off = foot.yaw - (input.facing + side * input.toeOut)
    return Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) < 0.6
  })
}

function lift(foot: Foot, cycle: number): void {
  foot.planted = false
  foot.progress = 0
  foot.fromX = foot.x
  foot.fromZ = foot.z
  foot.fromYaw = foot.yaw
  foot.fromPitch = foot.pitch
  foot.cycle = cycle
}

/** 这只脚当前所在的步态周期，以及在周期里的位置（0–1）。 */
function beat(gait: Gait, index: number): { cycle: number; local: number } {
  const total = gait.turns + gait.phase + (index === 0 ? 0 : 0.5)
  const cycle = Math.floor(total)
  return { cycle, local: total - cycle }
}

/** 从站定起步：向前跑先迈落在后面的脚，横向滑步先迈移动方向一侧的脚。 */
function firstStep(gait: Gait, input: GaitInput, rhythm: Rhythm, speed: number): void {
  let pick = 0
  if (speed > 0.05) {
    const along = gait.feet.map((foot) => ((foot.x - input.x) * input.vx + (foot.z - input.z) * input.vz) / speed)
    const leading = along[0] > along[1] ? 0 : 1
    pick = rhythm.ahead > 0.5 ? 1 - leading : leading
  }
  // 把节拍拨到“这只脚刚好该抬”的位置；周期数跳过两格，之前迈过的步子不再算数。
  gait.turns += 2
  gait.phase = (rhythm.duty + 0.001 - (pick === 0 ? 0 : 0.5) + 1) % 1
  gait.stepping = true
}

/** 踩着地的脚离髋太远、腿已经伸直了：这只脚必须马上抬起来，否则会被身体拖着走。 */
function overstretched(foot: Foot, index: number, input: GaitInput): boolean {
  if (!foot.planted || foot.plantedFor < 0.05) return false
  const { frame } = input
  const side = sideOf(index)
  const hipX = input.x - Math.sin(input.facing) * side * frame.hipHalf
  const hipZ = input.z + Math.cos(input.facing) * side * frame.hipHalf
  // 脚跟抬起后脚踝会升高、前移，腿能多够出一截。
  const heel = Math.max(0, foot.pitch)
  const ankleY = frame.ankle * Math.cos(heel) + frame.footBall * Math.sin(heel)
  const shift = frame.footBall * (1 - Math.cos(heel)) + frame.ankle * Math.sin(heel)
  const flat = Math.max(0, Math.hypot(foot.x - hipX, foot.z - hipZ) - shift)
  return Math.hypot(flat, input.hipHeight - ankleY) > (frame.thigh + frame.shin) * 1.01
}

/**
 * 摆动中的脚：朝落脚点移动，沿一条弧线抬起再放下。
 * @param remaining 离这只脚的节拍走完还有多少秒：不管是什么时候抬的脚，都在那一刻落地，两只脚才不会乱了先后
 */
function swingFoot(foot: Foot, index: number, input: GaitInput, rhythm: Rhythm, remaining: number, dt: number): void {
  const side = sideOf(index)
  foot.progress = remaining > dt ? Math.min(1, foot.progress + ((1 - foot.progress) * dt) / remaining) : 1
  // 落脚点：落地那一刻身体所在的位置、自己这一侧，再往前探出触地期间位移的一部分。
  const ahead = Math.max(0, remaining) + rhythm.period * rhythm.duty * rhythm.lead
  const landX = input.x + input.vx * ahead - Math.sin(input.facing) * side * rhythm.width * 0.5
  const landZ = input.z + input.vz * ahead + Math.cos(input.facing) * side * rhythm.width * 0.5
  const u = foot.progress
  // 抬脚的一瞬间脚已经带着速度：一部分匀速、一部分缓起缓停，脚不会在身后拖着。
  const eased = u * 0.35 + u * u * (3 - 2 * u) * 0.65
  foot.x = foot.fromX + (landX - foot.fromX) * eased
  foot.z = foot.fromZ + (landZ - foot.fromZ) * eased
  foot.yaw = turn(foot.fromYaw, input.facing + side * input.toeOut, eased)
  // 跑得越快，蹬地后脚跟收得越早、越高（向臀部折叠），再随大腿前摆落下。
  foot.lift = rhythm.height * Math.sin(Math.PI * Math.pow(u, 0.85 - 0.12 * rhythm.run))
  // 蹬地后脚尖朝下拖在后面，落地前脚尖翘起、脚跟先着地（跑得越快越接近全脚掌着地）。
  foot.pitch = (foot.fromPitch + 0.3 * rhythm.run) * (1 - smooth(0.15, 0.7, u)) - 0.26 * rhythm.ahead * (1 - 0.7 * rhythm.run) * smooth(0.6, 1, u)
  if (foot.progress < 0.999) return
  foot.planted = true
  foot.plantedFor = 0
  foot.landPitch = foot.pitch
  foot.lift = 0
}

/** 支撑脚：位置不动；身体越过它之后脚跟逐渐抬起，最后用前脚掌蹬地。 */
function standFoot(foot: Foot, index: number, input: GaitInput, rhythm: Rhythm, dt: number): void {
  const { frame } = input
  const side = sideOf(index)
  const cos = Math.cos(input.facing)
  const sin = Math.sin(input.facing)
  foot.plantedFor += dt
  const hipX = input.x - sin * side * frame.hipHalf
  const hipZ = input.z + cos * side * frame.hipHalf
  const behind = (hipX - foot.x) * cos + (hipZ - foot.z) * sin
  const heel = clamp((behind - 0.08 * frame.unit) / (0.45 * frame.unit), 0, 1) * 1.2 * rhythm.ahead
  const flatten = Math.min(0, foot.landPitch) * Math.max(0, 1 - foot.plantedFor / 0.07)
  foot.pitch = heel + flatten
}

/** 推进步态。只在双脚可以着地时调用；腾空期间由动画直接摆腿。 */
export function advanceGait(gait: Gait, input: GaitInput, dt: number): void {
  const speed = Math.hypot(input.vx, input.vz)
  const rhythm = rhythmFor(input, speed)
  if (speed <= 0.35 && settled(gait, input)) gait.stepping = false
  else if (!gait.stepping) firstStep(gait, input, rhythm, speed)
  if (gait.stepping) {
    gait.phase += dt / rhythm.period
    if (gait.phase >= 1) {
      gait.phase -= 1
      gait.turns += 1
    }
  }
  gait.run += (rhythm.run - gait.run) * (1 - Math.exp(-dt * 10))
  gait.feet.forEach((foot, index) => {
    const { cycle, local } = beat(gait, index)
    gait.swing[index] = gait.stepping ? -Math.sin(Math.PI * 2 * (local - rhythm.duty * 0.5)) : 0
    if (foot.planted) {
      const onBeat = gait.stepping && local >= rhythm.duty && foot.cycle !== cycle
      if (onBeat || overstretched(foot, index, input)) lift(foot, cycle)
    }
    if (foot.planted) standFoot(foot, index, input, rhythm, dt)
    else swingFoot(foot, index, input, rhythm, foot.cycle === cycle ? (1 - local) * rhythm.period : 0, dt)
  })
}
