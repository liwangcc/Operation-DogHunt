// 球员的身体：三种体型的能力值，以及跑动与起跳的运动学。球员之间的碰撞在 contact.ts。
import { BALL, COURT, EDGE, STRAFE } from './constants'
import type { Athlete, GameEvent, Ratings, Role, TeamId } from './types'

/** 后卫快而准，锋线均衡，内线高大、篮下强但慢。 */
const BODIES: Array<{ height: number; radius: number; ratings: Ratings }> = [
  { height: 1.88, radius: 0.34, ratings: { speed: 7.0, three: 0.8, mid: 0.72, inside: 0.55, steal: 0.75, block: 0.3, dunk: true } },
  { height: 1.99, radius: 0.36, ratings: { speed: 6.7, three: 0.62, mid: 0.7, inside: 0.72, steal: 0.5, block: 0.55, dunk: true } },
  { height: 2.11, radius: 0.4, ratings: { speed: 6.2, three: 0.3, mid: 0.56, inside: 0.9, steal: 0.3, block: 0.85, dunk: true } },
]

/** 玩家操作的球员加速很快、刹车更快：方向键一按就走、一松就停，是“跟手”的来源。 */
const ACCELERATION = 46
const BRAKING = 64
/** 电脑球员有体重：起步、急停都要一点时间，所以变向和后撤步能把他们甩开半步。 */
const AI_ACCELERATION = 22
const AI_BRAKING = 34
const TURN_RATE = 15

/** 电脑控制的对手（1 队）各项能力比玩家一方略高一档，否则比赛太容易。 */
function ratingsFor(team: TeamId, base: Ratings): Ratings {
  if (team === 0) return base
  return {
    speed: base.speed * EDGE.speed,
    three: Math.min(1, base.three + EDGE.shooting),
    mid: Math.min(1, base.mid + EDGE.shooting),
    inside: Math.min(1, base.inside + EDGE.shooting),
    steal: Math.min(1, base.steal + EDGE.steal),
    block: Math.min(1, base.block + EDGE.block),
    dunk: base.dunk,
  }
}

export function createAthlete(id: number, team: TeamId, role: Role): Athlete {
  const body = BODIES[role]
  return {
    id, team, role, height: body.height, radius: body.radius, ratings: ratingsFor(team, body.ratings),
    x: 0, z: 0, vx: 0, vz: 0, y: 0, vy: 0, facing: 0,
    action: 'free', actionTime: 0, released: false,
    fromX: 0, fromZ: 0, toX: 0, toZ: 0,
    stealCooldown: 0, dashCooldown: 0, squeakCooldown: 0, lag: 0,
    nextThink: 0, goalX: 0, goalZ: 0, plannedRelease: 0, driving: false,
    settling: false, manual: false, shotMoving: 0, shotWindow: 0, squared: false, bump: 0,
  }
}

/** 站立时手能够到的高度。 */
export function standingReach(athlete: Athlete): number {
  return athlete.height * 1.32
}

export function speedOf(athlete: Athlete): number {
  return Math.hypot(athlete.vx, athlete.vz)
}

/** 把朝向平滑地转向目标角度。 */
export function turnToward(athlete: Athlete, angle: number, dt: number, rate = TURN_RATE): void {
  let delta = angle - athlete.facing
  delta = Math.atan2(Math.sin(delta), Math.cos(delta))
  const step = rate * dt
  athlete.facing += Math.abs(delta) <= step ? delta : Math.sign(delta) * step
}

/**
 * 按期望方向跑动。dirX、dirZ 的长度不超过 1；长度为 0 表示想停下。
 * face 为 null 时身体转向跑动方向（正常跑动）；给出角度时身体始终朝着那个方向，
 * 靠滑步和后撤步移动（防守姿态），这样横移和后退都比正面跑慢。
 * 高速中急转或急停时发出鞋底摩擦声。
 */
export function steer(athlete: Athlete, dirX: number, dirZ: number, sprint: boolean, hasBall: boolean, face: number | null, dt: number, events: GameEvent[]): void {
  const push = Math.min(1, Math.hypot(dirX, dirZ))
  let top = athlete.ratings.speed * (sprint ? 1 : 0.7) * (hasBall ? 0.93 : 1) * (athlete.lag > 0 ? 0.45 : 1)
  athlete.squared = face !== null
  if (face !== null) {
    turnToward(athlete, face, dt, 11)
    if (push > 0.05) {
      const forward = (dirX * Math.cos(athlete.facing) + dirZ * Math.sin(athlete.facing)) / push
      top *= forward >= 0 ? STRAFE.side + (1 - STRAFE.side) * forward : STRAFE.side + (STRAFE.side - STRAFE.back) * forward
    }
  }
  const wantX = push > 0.05 ? (dirX / Math.max(push, 1e-6)) * push * top : 0
  const wantZ = push > 0.05 ? (dirZ / Math.max(push, 1e-6)) * push * top : 0
  const speed = speedOf(athlete)
  const along = speed > 0.01 ? (athlete.vx * wantX + athlete.vz * wantZ) / (speed * Math.max(top, 0.01)) : 1
  const sharp = push <= 0.05 || along < 0.3
  if (sharp && speed > 4.2 && athlete.squeakCooldown <= 0 && athlete.y === 0) {
    events.push({ type: 'squeak', x: athlete.x, z: athlete.z })
    athlete.squeakCooldown = 0.28
  }
  const deltaX = wantX - athlete.vx
  const deltaZ = wantZ - athlete.vz
  const change = Math.hypot(deltaX, deltaZ)
  const limit = (athlete.manual ? (sharp ? BRAKING : ACCELERATION) : sharp ? AI_BRAKING : AI_ACCELERATION) * dt
  const scale = change > limit ? limit / change : 1
  athlete.vx += deltaX * scale
  athlete.vz += deltaZ * scale
  if (face === null && speedOf(athlete) > 0.6) turnToward(athlete, Math.atan2(athlete.vz, athlete.vx), dt)
}

/** 位移、起跳落地，以及各种冷却计时。holdsBall 的球员可以踩出界（由规则判违例），其他人被挡在场地外沿。 */
export function integrate(athlete: Athlete, dt: number, holdsBall: boolean): void {
  athlete.x += athlete.vx * dt
  athlete.z += athlete.vz * dt
  if (athlete.y > 0 || athlete.vy > 0) {
    athlete.vy -= BALL.gravity * dt
    athlete.y += athlete.vy * dt
    if (athlete.y <= 0) {
      athlete.y = 0
      athlete.vy = 0
    }
  }
  athlete.stealCooldown = Math.max(0, athlete.stealCooldown - dt)
  athlete.dashCooldown = Math.max(0, athlete.dashCooldown - dt)
  athlete.squeakCooldown = Math.max(0, athlete.squeakCooldown - dt)
  athlete.lag = Math.max(0, athlete.lag - dt)
  if (holdsBall) return
  const limitX = COURT.halfLength + COURT.apron
  const limitZ = COURT.halfWidth + COURT.apron
  athlete.x = Math.min(limitX, Math.max(-limitX, athlete.x))
  athlete.z = Math.min(limitZ, Math.max(-limitZ, athlete.z))
}
