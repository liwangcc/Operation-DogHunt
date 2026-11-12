// 球权：球在手里时跟着球员走（运球），不在手里时判断谁接到、谁断到、谁抢到，以及有没有出界。
import { speedOf, standingReach } from './athlete'
import { BALL, COURT, MOVES, RULES, SHOT } from './constants'
import { releasePoint } from './shooting'
import type { Athlete, BallState, MatchState, TeamId } from './types'

/** 球在持球人手里时应该在的位置：运球时在身侧上下弹，准备出手时举过头顶。 */
function heldPoint(match: MatchState, holder: Athlete): { x: number; y: number; z: number } {
  const forwardX = Math.cos(holder.facing)
  const forwardZ = Math.sin(holder.facing)
  if (holder.action === 'shoot') {
    // 从胸前抬到出手点。
    const lift = Math.min(1, holder.actionTime / (SHOT.idealRelease * 0.8))
    const top = releasePoint(holder)
    const chestX = holder.x + forwardX * 0.3
    const chestY = holder.y + holder.height * 0.62
    const chestZ = holder.z + forwardZ * 0.3
    return { x: chestX + (top.x - chestX) * lift, y: chestY + (top.y - chestY) * lift, z: chestZ + (top.z - chestZ) * lift }
  }
  if (holder.action === 'layup' || holder.action === 'dunk') {
    // 举到手臂伸直刚好够得着的高度；球在终结的那只手一侧。
    const raise = Math.min(1, holder.actionTime / 0.25)
    const y = holder.y + holder.height * (0.7 + (holder.action === 'dunk' ? 0.49 : 0.45) * raise)
    const off = match.ball.hand * 0.13
    return { x: holder.x + forwardX * 0.3 - forwardZ * off, y, z: holder.z + forwardZ * 0.3 + forwardX * off }
  }
  // 球在运球手一侧；换手时 handBlend 从一边滑到另一边，球从身前横拉过去。
  const side = match.ball.handBlend
  const sideX = Math.cos(holder.facing + 1) * Math.max(0, side) + Math.cos(holder.facing - 1) * Math.max(0, -side)
  const sideZ = Math.sin(holder.facing + 1) * Math.max(0, side) + Math.sin(holder.facing - 1) * Math.max(0, -side)
  if (holder.y > 0 || holder.action === 'stun') return { x: holder.x + forwardX * 0.3, y: holder.y + holder.height * 0.6, z: holder.z + forwardZ * 0.3 }
  const bounce = Math.abs(Math.sin(match.ball.dribble))
  // 跑得越快，球推得越靠前：高速运球时球在身体前方，不会绊到自己的腿。
  const ahead = 0.12 + Math.min(0.3, speedOf(holder) * 0.045)
  return { x: holder.x + sideX * 0.44 + forwardX * ahead, y: BALL.radius + bounce * holder.height * 0.42, z: holder.z + sideZ * 0.44 + forwardZ * ahead }
}

/** 运球时自动用远离最近防守人的那只手，换手有冷却，不会来回乱换。 */
function protectDribble(match: MatchState, holder: Athlete, dt: number): void {
  const ball = match.ball
  ball.handCooldown = Math.max(0, ball.handCooldown - dt)
  ball.handBlend += Math.sign(ball.hand - ball.handBlend) * Math.min(Math.abs(ball.hand - ball.handBlend), dt * 9)
  if (ball.handCooldown > 0 || holder.action !== 'free') return
  let threat: Athlete | null = null
  let nearest = 2.2
  for (const other of match.athletes) {
    if (other.team === holder.team) continue
    const gap = Math.hypot(other.x - holder.x, other.z - holder.z)
    if (gap < nearest) {
      nearest = gap
      threat = other
    }
  }
  if (!threat) return
  // 防守人在身体右侧（朝向顺时针一侧）时换到左手，反之亦然。
  const across = -(threat.x - holder.x) * Math.sin(holder.facing) + (threat.z - holder.z) * Math.cos(holder.facing)
  const safer = across > 0.15 ? -1 : across < -0.15 ? 1 : ball.hand
  if (safer !== ball.hand) {
    ball.hand = safer
    ball.handCooldown = 0.9
  }
}

/** 球在手里：位置跟随持球人；运球每次触地发出一声拍球声。 */
export function carryBall(match: MatchState, dt: number): void {
  const ball = match.ball
  const holder = match.athletes[ball.holder]
  if (!holder) return
  const dribbling = holder.action === 'free' || holder.action === 'dash'
  if (dribbling && holder.y === 0) {
    const before = Math.floor(ball.dribble / Math.PI)
    ball.dribble += dt * Math.PI * (2.3 + speedOf(holder) * 0.22)
    if (Math.floor(ball.dribble / Math.PI) !== before) match.events.push({ type: 'dribble', x: ball.x, z: ball.z })
  }
  protectDribble(match, holder, dt)
  const point = heldPoint(match, holder)
  ball.x = point.x
  ball.y = point.y
  ball.z = point.z
  ball.vx = holder.vx
  ball.vz = holder.vz
  ball.vy = 0
}

/**
 * 某个球员拿到了球。球权换边时重置 24 秒；进攻方抢到碰过篮筐的球则重置为 14 秒。
 * previous 是拿到之前球所处的状态。
 */
export function gainPossession(match: MatchState, athlete: Athlete, previous: BallState): void {
  const ball = match.ball
  const afterShot = previous === 'shot' || (previous === 'loose' && ball.shooter >= 0)
  if (athlete.team !== match.offense || match.phase === 'tipoff') {
    match.offense = athlete.team
    match.shotClock = RULES.shotClock
    match.events.push({ type: 'possession', team: athlete.team })
  } else if (afterShot && ball.touchedIron) {
    match.shotClock = RULES.reboundShotClock
  }
  Object.assign(ball, { state: 'held', holder: athlete.id, passTarget: -1, shooter: -1, touchedIron: false, lastTouch: athlete.team, vx: 0, vy: 0, vz: 0 })
  athlete.driving = false
  // 刚拿到球的电脑马上考虑一次：接球时的空位转瞬即逝。
  athlete.nextThink = Math.min(athlete.nextThink, match.time + 0.14)
  if (match.phase === 'tipoff') match.phase = 'live'
  // 玩家一方拿到球时，控制权自动交给持球人。
  if (athlete.team === 0 && match.controlled >= 0) match.controlled = athlete.id
  match.events.push({ type: 'catch', player: athlete.id })
}

function canGrab(athlete: Athlete): boolean {
  return athlete.action === 'free' || athlete.action === 'jump' || athlete.action === 'dash'
}

function withinReach(match: MatchState, athlete: Athlete, radius: number): boolean {
  const ball = match.ball
  if (Math.hypot(ball.x - athlete.x, ball.z - athlete.z) > radius) return false
  return ball.y < athlete.y + standingReach(athlete) + 0.12
}

/** 传球途中：目标队友接球，或者被路线上的防守人断掉；落地还没人接就成了无主球。 */
function resolvePass(match: MatchState, dt: number): void {
  const ball = match.ball
  const receiver = match.athletes[ball.passTarget]
  if (receiver && canGrab(receiver) && withinReach(match, receiver, MOVES.catchRadius)) {
    gainPossession(match, receiver, 'pass')
    return
  }
  if (ball.flight > 0.08) {
    for (const other of match.athletes) {
      if (other.team === ball.lastTouch || !canGrab(other) || !withinReach(match, other, 0.62) || ball.y < 0.35) continue
      // 手够得着不等于一定断得下来：按抢断能力折算成每 0.1 秒的成功率。
      const chance = 1 - Math.pow(1 - (0.14 + other.ratings.steal * 0.3), dt / 0.1)
      if (match.random() < chance) {
        match.events.push({ type: 'steal', player: other.id })
        gainPossession(match, other, 'pass')
        return
      }
    }
  }
  if (ball.y <= BALL.radius + 0.02) ball.state = 'loose'
}

/** 投篮刚出手、球还在上升时，跳起来的防守人手碰到球就是盖帽。球开始下落后不能再碰（干扰球）。 */
function resolveBlock(match: MatchState): void {
  const ball = match.ball
  if (ball.state !== 'shot' || ball.shotKind === 'dunk' || ball.flight > 0.32 || ball.vy <= 0) return
  for (const other of match.athletes) {
    if (other.team === ball.lastTouch || other.action !== 'jump' || other.y < 0.12) continue
    const handX = other.x + Math.cos(other.facing) * 0.25
    const handZ = other.z + Math.sin(other.facing) * 0.25
    const handY = other.y + standingReach(other)
    if (Math.hypot(ball.x - handX, ball.y - handY, ball.z - handZ) > 0.3) continue
    Object.assign(ball, { state: 'loose', lastTouch: other.team, touchedIron: true })
    ball.vx = -ball.vx * 0.5 + (match.random() - 0.5) * 3
    ball.vz = -ball.vz * 0.5 + (match.random() - 0.5) * 3
    ball.vy = 1.8
    match.events.push({ type: 'block', player: other.id })
    return
  }
}

/** 无主球和弹框而出的球：够得着的人里离球最近的那个拿到。投出的球要先碰到篮筐、篮板，或者已经落到够得着的高度才算可以抢。 */
function resolveLoose(match: MatchState): void {
  const ball = match.ball
  if (ball.state === 'shot' && !ball.touchedIron && !(ball.vy < 0 && ball.y < 2.5)) return
  let best: Athlete | null = null
  let bestGap = Infinity
  for (const athlete of match.athletes) {
    if (!canGrab(athlete) || !withinReach(match, athlete, MOVES.pickupRadius)) continue
    const gap = Math.hypot(ball.x - athlete.x, ball.z - athlete.z)
    if (gap < bestGap) {
      bestGap = gap
      best = athlete
    }
  }
  if (best) gainPossession(match, best, ball.state)
}

/** 球不在任何人手里时，每一步调用：依次判断接球、盖帽、争抢。 */
export function resolveFreeBall(match: MatchState, dt: number): void {
  const state = match.ball.state
  if (state === 'pass') resolvePass(match, dt)
  if (state === 'shot') resolveBlock(match)
  if (match.ball.state === 'shot' || match.ball.state === 'loose') resolveLoose(match)
}

export interface OutOfBounds {
  /** 获得球权的一方。 */
  team: TeamId
  x: number
  z: number
}

/** 发球点：出界位置最近的边线或底线上，略微靠里，并避开篮架正下方。 */
function inboundSpot(x: number, z: number): { x: number; z: number } {
  const overSide = Math.abs(z) - COURT.halfWidth
  const overEnd = Math.abs(x) - COURT.halfLength
  if (overSide >= overEnd) {
    return { x: Math.min(COURT.halfLength - 1.2, Math.max(-COURT.halfLength + 1.2, x)), z: Math.sign(z) * (COURT.halfWidth - 0.45) }
  }
  const side = Math.abs(z) < 2.6 ? (z >= 0 ? 2.6 : -2.6) : z
  return { x: Math.sign(x) * (COURT.halfLength - 0.45), z: Math.min(COURT.halfWidth - 1, Math.max(-COURT.halfWidth + 1, side)) }
}

/** 出界判定：持球人踩线，或者球落在界外。球权判给最后没碰球的一方。 */
export function checkBounds(match: MatchState): OutOfBounds | null {
  const ball = match.ball
  const holder = match.athletes[ball.holder]
  const outside = (x: number, z: number, margin: number) => Math.abs(x) > COURT.halfLength + margin || Math.abs(z) > COURT.halfWidth + margin
  let x = ball.x
  let z = ball.z
  if (ball.state === 'held' && holder) {
    if (!outside(holder.x, holder.z, 0)) return null
    x = holder.x
    z = holder.z
  } else {
    const landed = ball.y <= BALL.radius + 0.03 && outside(ball.x, ball.z, 0)
    if (!landed && !outside(ball.x, ball.z, 4)) return null
  }
  const spot = inboundSpot(x, z)
  return { team: ball.lastTouch === 0 ? 1 : 0, x: spot.x, z: spot.z }
}
