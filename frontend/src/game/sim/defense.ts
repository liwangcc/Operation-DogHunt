// 电脑球员的防守：盯人站位、堵住突破路线、协防补位、对出手起跳封盖，以及看准时机伸手掏球。
import { ballExposure, closingSpeed, hoopSide, trySteal } from './actions'
import { COURT } from './constants'
import { leap, toward, type Move } from './footwork'
import type { Athlete, MatchState } from './types'

const GUARD = {
  /** 防持球人时离他多远，防无球人时往篮下收多远。 */
  onBall: 1.1,
  offBall: 2.3,
  /** 退到离筐这么近就不再让，用身体把持球人挡在外面。 */
  wall: 1.6,
  /** 防持球人时预判他多久之后的位置，提前堵到他要走的路线上。 */
  lead: 0.2,
} as const

const HELP = {
  /** 持球人进到离筐多近才考虑协防；在 paint 以外还要他正朝篮筐冲才补。 */
  range: 6.2,
  paint: 3.8,
  /** 补位点离筐多远（在持球人和篮筐的连线上）。 */
  spot: 1.8,
} as const

interface Spot {
  x: number
  z: number
}

/** 盯防对象：对方同位置的球员。 */
function matchup(match: MatchState, athlete: Athlete): Athlete {
  return match.athletes[(1 - athlete.team) * 3 + athlete.role]
}

/**
 * 盯人时该站的位置：对位球员和篮筐之间。防持球人贴近并预判他的去向，退到筐前就站住不再让；
 * 防无球人往篮下收。对手还在后场时不上抢，退到三分线一带等。
 */
function guardSpot(man: Athlete, hoopX: number, onBall: boolean): Spot {
  const lead = onBall ? GUARD.lead : 0
  const x = man.x + man.vx * lead
  const z = man.z + man.vz * lead
  const distance = Math.max(0.01, Math.hypot(x - hoopX, z))
  // 持球人已经顶到墙里面时贴住他的身体，仍然挡在他和篮筐之间。
  const stand = onBall ? Math.min(distance - 0.7, Math.max(GUARD.wall, distance - GUARD.onBall), 9.5) : Math.min(distance - GUARD.offBall, 7)
  const out = Math.max(0.6, stand)
  return { x: hoopX + ((x - hoopX) / distance) * out, z: (z / distance) * out }
}

/**
 * 协防：持球人正往里杀、而盯他的人没挡在身前时，离补位点最近的无球防守人上去堵（内线优先，一次只上一个）。
 * 返回该补位的人和补位点；不需要协防时为 null。玩家自己操作的球员不会被指派。
 */
function helpCall(match: MatchState, holder: Athlete, hoopX: number): { helper: Athlete; spot: Spot } | null {
  if (holder.action !== 'free' && holder.action !== 'dash' && holder.action !== 'layup' && holder.action !== 'dunk') return null
  const distance = Math.max(0.01, Math.hypot(holder.x - hoopX, holder.z))
  if (distance > HELP.range) return null
  const finishing = holder.action === 'layup' || holder.action === 'dunk'
  if (!finishing) {
    if (distance > HELP.paint && closingSpeed(match, holder) < 2.4) return null
    // 盯他的人还挡在身前就不用补，免得白白放空另一个人。
    const primary = matchup(match, holder)
    const inFront = Math.hypot(primary.x - hoopX, primary.z) < distance - 0.3
    if (inFront && primary.lag <= 0 && Math.hypot(primary.x - holder.x, primary.z - holder.z) < 1.4) return null
  }
  // 持球人已经很深时，补位点贴到他身前。
  const out = Math.max(0.6, Math.min(HELP.spot, distance - 0.9))
  const spot = { x: hoopX + ((holder.x - hoopX) / distance) * out, z: (holder.z / distance) * out }
  let helper: Athlete | null = null
  let least = Infinity
  for (const mate of match.athletes) {
    if (mate.team === holder.team || mate.role === holder.role || mate.id === match.controlled) continue
    if (mate.action !== 'free' && mate.action !== 'jump') continue
    const cost = Math.hypot(mate.x - spot.x, mate.z - spot.z) - (mate.role === 2 ? 0.8 : 0)
    if (cost < least) {
      least = cost
      helper = mate
    }
  }
  return helper ? { helper, spot } : null
}

/** 对出手起跳：跳投只有身边的人会扑；冲筐时身边的人和守在筐下的人都可能起跳。每次出手每人只决定一次。 */
function contestShot(match: MatchState, defender: Athlete, shooter: Athlete, gap: number, hoopX: number): void {
  if (shooter.released || match.time < defender.nextThink) return
  if (shooter.action === 'shoot') {
    // 不是每球都扑，扑也有反应时间，否则跳投几乎全被盖掉。
    const reaction = 0.2 + (1 - defender.ratings.block) * 0.2
    if (gap > 1.8 || shooter.actionTime <= reaction) return
    defender.nextThink = match.time + 0.9
    if (match.random() < 0.3 + defender.ratings.block * 0.4) leap(defender)
    return
  }
  if (shooter.action !== 'layup' && shooter.action !== 'dunk') return
  if (gap > 2.2 && Math.hypot(defender.x - hoopX, defender.z) > 1.5) return
  defender.nextThink = match.time + 0.6
  if (match.random() < 0.3 + defender.ratings.block * 0.45) leap(defender)
}

/**
 * 伸手掏球：持球人进到一臂之内时，每隔一两秒考虑一次要不要下手。
 * 球护得越差（正对着冲过来、全速推进）越敢伸手，对方背身护球时基本不碰；掏空了会失去重心，所以不会一直伸手。
 */
function pressBall(match: MatchState, defender: Athlete, holder: Athlete, gap: number): void {
  if (gap > 1.35 || holder.action !== 'free' || defender.stealCooldown > 0 || match.time < defender.nextThink) return
  defender.nextThink = match.time + 1 + match.random() * 0.8
  const urge = (0.13 + defender.ratings.steal * 0.2) * ballExposure(holder, defender)
  if (match.random() < urge) trySteal(match, defender)
}

/**
 * 一名防守人这一步怎么站：盯自己的人，轮到自己协防时去堵突破路线；顺带决定要不要起跳、伸手。
 * ballX、ballZ 是球（或发球点）的位置。
 */
export function defend(match: MatchState, athlete: Athlete, ballX: number, ballZ: number): Move {
  const man = matchup(match, athlete)
  const hoopX = hoopSide(match, man) * COURT.hoopX
  const holder = match.athletes[match.ball.holder]
  const threat = holder && holder.team !== athlete.team ? holder : null
  const onBall = match.ball.holder === man.id || (match.ball.state === 'pass' && match.ball.passTarget === man.id)
  let goal = guardSpot(man, hoopX, onBall)
  let helping = false
  if (!onBall) {
    // 防无球人时略微偏向球的一侧。
    goal = { x: goal.x + (ballX - goal.x) * 0.18, z: goal.z + (ballZ - goal.z) * 0.18 }
    const call = threat ? helpCall(match, threat, hoopX) : null
    if (call && call.helper.id === athlete.id) {
      goal = call.spot
      helping = true
    }
  }
  if (threat && match.phase === 'live' && athlete.action === 'free') {
    const gap = Math.hypot(threat.x - athlete.x, threat.z - athlete.z)
    contestShot(match, athlete, threat, gap, hoopX)
    pressBall(match, athlete, threat, gap)
  }
  const move = toward(athlete, goal.x, goal.z)
  const watch = (onBall || !threat ? man : threat) as Athlete
  // 离该站的位置不远时保持面向对手滑步；被甩开了、或者持球人已经和自己平行，才转身加速去追。
  const off = Math.hypot(goal.x - athlete.x, goal.z - athlete.z)
  const tight = onBall || helping
  const beaten = onBall && threat !== null && Math.hypot(athlete.x - hoopX, athlete.z) > Math.hypot(threat.x - hoopX, threat.z) - 0.15
  const chase = tight ? off > (athlete.squared ? 1.6 : 0.9) || (beaten && off > 0.5) : move.sprint
  if (chase) return { ...move, sprint: true }
  return { ...move, face: Math.atan2(watch.z - athlete.z, watch.x - athlete.x) }
}
