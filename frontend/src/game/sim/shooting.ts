// 投篮：出手时机的评价、命中率的计算，以及让球飞向篮筐（或者差一点）的出手速度。
import { BALL, COURT, SHOT } from './constants'
import type { Athlete, Ball, ReleaseGrade, ShotKind } from './types'

export interface Launch {
  vx: number
  vy: number
  vz: number
}

/** 位置在不在三分线外：弧顶按半径算，底角按离边线的直线算。 */
export function isThree(x: number, z: number, side: number): boolean {
  return Math.abs(z) >= COURT.threeCornerZ || Math.hypot(x - side * COURT.hoopX, z) >= COURT.threeRadius
}

/** 按住投篮键的时长 → 出手评价。 */
export function gradeRelease(heldSeconds: number): ReleaseGrade {
  const offset = heldSeconds - SHOT.idealRelease
  if (Math.abs(offset) <= SHOT.perfectWindow) return 'perfect'
  if (Math.abs(offset) <= SHOT.goodWindow) return 'good'
  return offset < 0 ? 'early' : 'late'
}

/** 出手时机对命中率的影响：完美出手是加成而不是保证，偏早偏晚则大打折扣。 */
const TIMING_FACTOR: Record<ReleaseGrade, number> = { perfect: 1.35, good: 1, early: 0.4, late: 0.48 }

/** 不考虑时机和防守时，在这个距离出手的基础命中率。 */
function baseChance(shooter: Athlete, distance: number, three: boolean): number {
  if (!three) {
    // 中距离：离筐越远越低，从篮下的五成多降到三分线内一步的四成出头。
    return 0.43 - Math.max(0, distance - 2.5) * 0.022 + shooter.ratings.mid * 0.2
  }
  // 三分线上三成多；每再远一米掉八个多点，过了半场基本只剩运气。
  const beyond = Math.max(0, distance - COURT.threeRadius)
  return Math.max(0.008, 0.23 + shooter.ratings.three * 0.2 - beyond * 0.085)
}

/**
 * 这次出手的命中率。
 * @param distance 离篮筐的水平距离
 * @param contest 防守干扰程度，0 为完全空位，1 为贴身封盖
 * @param moving 起跳时的移动速度比例，0 为站定，1 为全速（急停跳投更难）
 */
export function makeChance(shooter: Athlete, distance: number, three: boolean, contest: number, grade: ReleaseGrade, kind: ShotKind, moving: number): number {
  if (kind === 'layup') {
    const open = 0.56 + shooter.ratings.inside * 0.16
    return Math.min(0.88, Math.max(0.08, open * (1 - 0.62 * contest)))
  }
  const chance = baseChance(shooter, distance, three) * TIMING_FACTOR[grade] * (1 - 0.55 * contest) * (1 - 0.3 * moving)
  return Math.min(three ? 0.58 : 0.72, Math.max(0.005, chance))
}

/** 以指定仰角出手，让球正好经过目标点所需的速度。 */
export function solveLaunch(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, angle: number): Launch {
  const dx = toX - fromX
  const dz = toZ - fromZ
  const flat = Math.max(0.05, Math.hypot(dx, dz))
  const rise = toY - fromY
  // 目标比出手点高很多、又离得近时，仰角必须足够陡才够得着。
  let theta = Math.max(angle, Math.atan2(rise, flat) + 0.3)
  let speedSquared = 0
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const cos = Math.cos(theta)
    const denominator = 2 * cos * cos * (flat * Math.tan(theta) - rise)
    if (denominator > 1e-4) {
      speedSquared = (BALL.gravity * flat * flat) / denominator
      break
    }
    theta += 0.1
  }
  const speed = Math.sqrt(speedSquared)
  const along = (speed * Math.cos(theta)) / flat
  return { vx: dx * along, vy: speed * Math.sin(theta), vz: dz * along }
}

/** 距离越远，出手弧线越平。 */
function launchAngle(distance: number): number {
  const degrees = distance < 3 ? 62 : distance < 6 ? 54 : distance < 10 ? 50 : 47
  return (degrees * Math.PI) / 180
}

/** 没进的球瞄准点偏离筐心的距离（米）：最少偏出多少，以及在此之上的随机范围。 */
const MISS = { least: 0.27, range: 0.2 } as const

/**
 * 把球从出手点投向篮筐。made 为 true 时瞄准筐心（只带一两厘米的误差）；
 * 否则把瞄准点从筐心挪开一段（偏短、偏长或偏左右），之后砸筐、打板还是三不沾都由物理决定。
 * 离得越远偏得越多：超远距离的出手大多连筐都碰不到。
 */
export function launchShot(ball: Ball, side: number, made: boolean, random: () => number): void {
  const hoopX = side * COURT.hoopX
  const distance = Math.max(0.05, Math.hypot(hoopX - ball.x, ball.z))
  const alongX = (hoopX - ball.x) / distance
  const alongZ = -ball.z / distance
  let along = (random() - 0.5) * 0.04
  let across = (random() - 0.5) * 0.04
  if (!made) {
    const wild = 1 + Math.max(0, distance - 7.5) * 0.14
    const off = (MISS.least + random() * MISS.range) * wild
    const kind = random()
    if (kind < 0.4) along -= off
    else if (kind < 0.75) along += off
    else across += random() < 0.5 ? -off : off
  }
  const targetX = hoopX + alongX * along - alongZ * across
  const targetZ = alongZ * along + alongX * across
  const launch = solveLaunch(ball.x, ball.y, ball.z, targetX, COURT.rimHeight, targetZ, launchAngle(distance))
  ball.vx = launch.vx
  ball.vy = launch.vy
  ball.vz = launch.vz
}

/** 出手点：举过头顶、略靠身前，偏向投篮手（右手）一侧的额前。 */
export function releasePoint(shooter: Athlete): { x: number; y: number; z: number } {
  const cos = Math.cos(shooter.facing)
  const sin = Math.sin(shooter.facing)
  return {
    x: shooter.x + cos * 0.22 - sin * 0.07,
    y: shooter.y + shooter.height * 1.13,
    z: shooter.z + sin * 0.22 + cos * 0.07,
  }
}
