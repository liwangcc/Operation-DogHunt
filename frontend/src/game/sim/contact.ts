// 身体对抗：球员相撞时谁让谁，上篮和扣篮途中吃到的冲撞，以及冲筐的路线有没有被身体挡住。
import type { Athlete, MatchState } from './types'

/** 双脚离地超过这个高度就算腾空。 */
const AIRBORNE = 0.45

/** 对抗中的分量：摆好防守姿态的人最稳，运球的人、探身掏球的人和失去重心的人容易被顶开，腾空的人最轻。 */
function footing(athlete: Athlete, holder: number): number {
  const frame = 1 + (athlete.radius - 0.34) * 4
  if (athlete.y > 0.05) return frame * 0.3
  let weight = frame
  if (athlete.squared && athlete.action === 'free') weight *= 1.7
  if (athlete.id === holder) weight *= 0.55
  if (athlete.lag > 0 || athlete.action === 'stun') weight *= 0.5
  if (athlete.action === 'steal') weight *= 0.7
  return weight
}

function finishing(athlete: Athlete): boolean {
  return (athlete.action === 'layup' || athlete.action === 'dunk') && !athlete.released
}

/**
 * 这两个人是否互不阻挡：都腾空时不挡；跳投、封盖跳起来的人也不会被地面上的人挤开。
 * 只有正在上篮、扣篮的人，腾空后仍然会被对方站在地上的身体挡住。
 */
function passesThrough(a: Athlete, b: Athlete): boolean {
  const aUp = a.y > AIRBORNE
  const bUp = b.y > AIRBORNE
  if (!aUp && !bUp) return false
  if (aUp && bUp) return true
  const flyer = aUp ? a : b
  const other = aUp ? b : a
  return !finishing(flyer) || other.team === flyer.team
}

/** 上篮、扣篮途中撞上对方的身体：撞得越正、对方站得越稳，这次终结受的影响越大。nx、nz 指向对方。 */
function takeBump(flyer: Athlete, wall: Athlete, nx: number, nz: number): void {
  if (!finishing(flyer)) return
  const tx = flyer.toX - flyer.x
  const tz = flyer.toZ - flyer.z
  const far = Math.hypot(tx, tz)
  if (far < 0.05) return
  const headOn = Math.max(0, (tx * nx + tz * nz) / far)
  const firm = wall.y > 0.05 ? 0.5 : wall.squared ? 1 : 0.75
  flyer.bump = Math.max(flyer.bump, headOn * firm)
}

/**
 * 球员之间的碰撞：每人是一个竖直的圆柱，重叠时按各自的分量推开，并抵消朝对方冲的那部分速度。
 * 站稳的防守人几乎不动，撞上去的持球人被顶住，推不动也穿不过去。
 */
export function collide(match: MatchState): void {
  const athletes = match.athletes
  const holder = match.ball.holder
  for (let i = 0; i < athletes.length; i += 1) {
    for (let j = i + 1; j < athletes.length; j += 1) {
      const a = athletes[i]
      const b = athletes[j]
      if (passesThrough(a, b)) continue
      const dx = b.x - a.x
      const dz = b.z - a.z
      const gap = Math.hypot(dx, dz)
      const reach = a.radius + b.radius
      if (gap >= reach || gap < 1e-5) continue
      const nx = dx / gap
      const nz = dz / gap
      const weightA = footing(a, holder)
      const weightB = footing(b, holder)
      // 各自让出的比例：对方越稳，自己退得越多。
      const yieldA = weightB / (weightA + weightB)
      const yieldB = 1 - yieldA
      const push = reach - gap
      a.x -= nx * push * yieldA
      a.z -= nz * push * yieldA
      b.x += nx * push * yieldB
      b.z += nz * push * yieldB
      if (a.team !== b.team) {
        takeBump(a, b, nx, nz)
        takeBump(b, a, -nx, -nz)
      }
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz
      if (closing <= 0) continue
      a.vx -= nx * closing * yieldA
      a.vz -= nz * closing * yieldA
      b.vx += nx * closing * yieldB
      b.vz += nz * closing * yieldB
    }
  }
}

/**
 * 从脚下到篮筐这段冲筐路线上有没有对方的身体挡着。有人挡着就起不了扣篮。
 * 落在身后、身侧，或者站在篮筐后面的人不算。
 */
export function runwayClear(match: MatchState, athlete: Athlete, hoopX: number): boolean {
  const alongX = hoopX - athlete.x
  const alongZ = -athlete.z
  const lengthSquared = alongX * alongX + alongZ * alongZ
  if (lengthSquared < 1e-6) return true
  for (const other of match.athletes) {
    if (other.team === athlete.team || other.y > AIRBORNE) continue
    const t = ((other.x - athlete.x) * alongX + (other.z - athlete.z) * alongZ) / lengthSquared
    if (t < 0.08 || t > 1) continue
    const off = Math.hypot(other.x - (athlete.x + alongX * t), other.z - (athlete.z + alongZ * t))
    if (off < other.radius + 0.2) return false
  }
  return true
}
