// 电脑球员的决策：持球时突破、投篮还是传球，无球时怎么跑位，防守时怎么盯人、封盖和抢断，以及争抢篮板。
import { speedOf, standingReach } from './athlete'
import { closingSpeed, hoopDistance, hoopSide, tryDash, tryJump, tryPass, tryShoot, trySteal } from './actions'
import { COURT, EDGE, MOVES, SHOT } from './constants'
import { isThree } from './shooting'
import type { Athlete, MatchState } from './types'

/** 想往哪个方向跑（长度不超过 1），以及是否加速。 */
export interface Move {
  x: number
  z: number
  sprint: boolean
  /** 给出时身体保持朝向这个角度，靠滑步移动（防守姿态）；不给则转身朝跑动方向。 */
  face?: number
}

const STAY: Move = { x: 0, z: 0, sprint: false }

function toward(athlete: Athlete, goalX: number, goalZ: number, sprint?: boolean): Move {
  const dx = goalX - athlete.x
  const dz = goalZ - athlete.z
  const gap = Math.hypot(dx, dz)
  if (gap < 0.2) return STAY
  // 快到位时减速，避免在目标点上来回抖动。
  const push = Math.min(1, gap / 0.7)
  return { x: (dx / gap) * push, z: (dz / gap) * push, sprint: sprint ?? gap > 3.2 }
}

/** 电脑起跳（封盖、抢板）时收住脚步，直上直下，不会带着助跑的惯性冲出底线。 */
function leap(athlete: Athlete): void {
  if (!tryJump(athlete)) return
  athlete.vx *= 0.35
  athlete.vz *= 0.35
}

function opponents(match: MatchState, athlete: Athlete): Athlete[] {
  return match.athletes.filter((other) => other.team !== athlete.team)
}

function nearestOpponentGap(match: MatchState, athlete: Athlete): number {
  return Math.min(...opponents(match, athlete).map((other) => Math.hypot(other.x - athlete.x, other.z - athlete.z)))
}

/** 点到线段的距离，用来判断传球路线、突破路线上有没有人。 */
function gapToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const lengthSquared = (bx - ax) ** 2 + (bz - az) ** 2
  const t = lengthSquared > 1e-6 ? Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / lengthSquared)) : 0
  return Math.hypot(px - (ax + (bx - ax) * t), pz - (az + (bz - az) * t))
}

function laneOpen(match: MatchState, athlete: Athlete, toX: number, toZ: number, width: number): boolean {
  return !opponents(match, athlete).some((other) => gapToSegment(other.x, other.z, athlete.x, athlete.z, toX, toZ) < width)
}

/** 进攻时各位置的落位：后卫在弧顶，锋线在弱侧 45°，内线在强侧低位；轮到谁空切时改为切向篮下。 */
function offenseSpot(match: MatchState, athlete: Athlete): { x: number; z: number; cutting: boolean } {
  const side = hoopSide(match, athlete)
  const hoopX = side * COURT.hoopX
  const ballSide = match.ball.z >= 0 ? 1 : -1
  const slot = Math.floor(match.time / 4.5)
  const cutting = (slot * 7 + athlete.team * 3) % 3 === athlete.role && match.time % 4.5 < 1.4
  if (cutting) return { x: hoopX - side * 1.5, z: -ballSide * 0.9, cutting }
  if (athlete.role === 0) return { x: hoopX - side * 7.6, z: -ballSide * 1.5, cutting }
  if (athlete.role === 1) return { x: hoopX - side * 5.2, z: -ballSide * 5.9, cutting }
  return { x: hoopX - side * 2.7, z: ballSide * 2.4, cutting }
}

function bestReceiver(match: MatchState, passer: Athlete): Athlete | null {
  let best: Athlete | null = null
  let bestGap = 1.7
  for (const mate of match.athletes) {
    if (mate.team !== passer.team || mate.id === passer.id) continue
    const open = nearestOpponentGap(match, mate)
    if (open > bestGap && laneOpen(match, passer, mate.x, mate.z, 0.85)) {
      bestGap = open
      best = mate
    }
  }
  return best
}

/** 电脑起跳投篮时，预先决定在第几秒出手：多数时候接近最佳出手点，偶尔偏早或偏晚。 */
function planRelease(match: MatchState, athlete: Athlete): void {
  const spread = (match.random() + match.random() + match.random() - 1.5) * 0.14
  athlete.plannedRelease = SHOT.idealRelease + spread * (athlete.team === 1 ? EDGE.timing : 1)
}

function shootNow(match: MatchState, athlete: Athlete): void {
  if (tryShoot(match, athlete)) planRelease(match, athlete)
}

/** 决定跳投：跑动中先收步站稳（随后在 withBall 里起跳），已经站稳就直接出手。 */
function pullUp(match: MatchState, athlete: Athlete): void {
  athlete.driving = false
  if (speedOf(athlete) < 1.4) return shootNow(match, athlete)
  athlete.settling = true
  athlete.nextThink = match.time + 0.3
}

/** 后撤步：朝远离防守人的一侧横撤一步（略微向后），落地后收步跳投。 */
function stepBack(match: MatchState, athlete: Athlete): boolean {
  const side = hoopSide(match, athlete)
  const hoopX = side * COURT.hoopX
  const away = Math.max(0.01, Math.hypot(athlete.x - hoopX, athlete.z))
  const backX = (athlete.x - hoopX) / away
  const backZ = athlete.z / away
  let guard: Athlete | null = null
  for (const other of opponents(match, athlete)) {
    if (!guard || Math.hypot(other.x - athlete.x, other.z - athlete.z) < Math.hypot(guard.x - athlete.x, guard.z - athlete.z)) guard = other
  }
  // 防守人偏在哪一侧，就往另一侧撤；同时别把自己撤出边线。
  const lean = guard ? (guard.x - athlete.x) * -backZ + (guard.z - athlete.z) * backX : 0
  let turn = lean > 0 ? -1 : 1
  if (Math.abs(athlete.z + backX * turn * 2.2) > COURT.halfWidth - 0.8) turn = -turn
  if (!tryDash(match, athlete, -backZ * turn + backX * 0.4, backX * turn + backZ * 0.4)) return false
  athlete.settling = true
  athlete.nextThink = match.time + MOVES.dashSeconds + 0.3
  return true
}

/** 持球人每隔零点几秒重新考虑一次：时间快到就出手，篮下有机会就攻筐，空位就投，被贴防就传或者变向。 */
function chooseBallPlan(match: MatchState, athlete: Athlete): void {
  const side = hoopSide(match, athlete)
  const hoopX = side * COURT.hoopX
  const distance = hoopDistance(match, athlete)
  const guardGap = nearestOpponentGap(match, athlete)
  athlete.driving = false
  if (side * athlete.x < -1.5) {
    athlete.goalX = side * 3.5
    athlete.goalZ = athlete.z * 0.6
    return
  }
  if (distance < 2.5) return shootNow(match, athlete)
  if (match.shotClock < 3.4) return pullUp(match, athlete)
  const three = isThree(athlete.x, athlete.z, side)
  // 防守人离得越远越敢投：接球就是大空位时基本不会放过，只有半步空间时多半再等等。
  const open = Math.min(1, Math.max(0, (guardGap - 1.6) / 1.2))
  // 三分只有投得准的人才爱投（按能力的平方），而且尽量贴着线投，不在线外一大步出手。
  const eagerness = (three ? athlete.ratings.three ** 2 * 0.75 : 0.25 + athlete.ratings.mid * 0.3) * (0.35 + open)
  if (distance < 7.95 && guardGap > 1.6 && match.random() < eagerness) return pullUp(match, athlete)
  // 在射程内被贴住：有时用后撤步自己造一个出手空间。
  const touch = three ? athlete.ratings.three : athlete.ratings.mid
  if (distance > 3.6 && distance < 7.9 && guardGap < 1.5 && match.random() < 0.05 + touch * 0.16 && stepBack(match, athlete)) return
  if (distance < 10 && laneOpen(match, athlete, hoopX, 0, 1.05) && match.random() < 0.6) {
    athlete.driving = true
    athlete.goalX = hoopX - side * 0.9
    athlete.goalZ = 0
    return
  }
  const mate = match.random() < 0.45 ? bestReceiver(match, athlete) : null
  if (mate && tryPass(match, athlete, 0, 0, mate)) return
  // 持球游走时留在界内一米左右，免得自己踩出边线。
  const spot = offenseSpot(match, athlete)
  const limitX = COURT.halfLength - 1
  const limitZ = COURT.halfWidth - 1
  athlete.goalX = Math.min(limitX, Math.max(-limitX, spot.x + (match.random() - 0.5) * 3))
  athlete.goalZ = Math.min(limitZ, Math.max(-limitZ, spot.z + (match.random() - 0.5) * 3))
  if (guardGap < 1.35 && match.random() < 0.3) tryDash(match, athlete, -Math.sin(athlete.facing) * (match.random() < 0.5 ? 1 : -1), Math.cos(athlete.facing))
}

/** 持球人快要冲出边线、底线时往回带，免得自己踩出界。 */
function stayInbounds(athlete: Athlete, move: Move): Move {
  const aheadX = athlete.x + athlete.vx * 0.3
  const aheadZ = athlete.z + athlete.vz * 0.3
  const overX = Math.abs(aheadX) > COURT.halfLength - 0.4
  const overZ = Math.abs(aheadZ) > COURT.halfWidth - 0.4
  if (!overX && !overZ) return move
  return { x: overX ? -Math.sign(aheadX) : move.x, z: overZ ? -Math.sign(aheadZ) : move.z, sprint: false }
}

function withBall(match: MatchState, athlete: Athlete): Move {
  if (athlete.action !== 'free') return STAY
  if (athlete.settling) {
    if (speedOf(athlete) < 1.4 || match.time >= athlete.nextThink) {
      athlete.settling = false
      // 收步时防守人已经贴上来了就不硬投，除非进攻时间快到了。
      if (nearestOpponentGap(match, athlete) > 0.95 || match.shotClock < 4) shootNow(match, athlete)
    }
    return STAY
  }
  if (match.time >= athlete.nextThink) {
    athlete.nextThink = match.time + 0.26 + match.random() * 0.14
    chooseBallPlan(match, athlete)
    if (athlete.action !== 'free' || match.ball.holder !== athlete.id) return STAY
  }
  if (athlete.driving) {
    const distance = hoopDistance(match, athlete)
    // 冲起来了就直接起跳扣篮，否则再往里一步上篮。
    if (distance < 2.45 || (distance < 3.3 && closingSpeed(match, athlete) > 3.7)) {
      shootNow(match, athlete)
      return STAY
    }
  }
  return stayInbounds(athlete, toward(athlete, athlete.goalX, athlete.goalZ, athlete.driving ? true : undefined))
}

function offBall(match: MatchState, athlete: Athlete): Move {
  const ball = match.ball
  // 球正朝自己飞来：迎上去接。
  if (ball.state === 'pass' && ball.passTarget === athlete.id) return toward(athlete, ball.x + ball.vx * 0.15, ball.z + ball.vz * 0.15)
  const spot = offenseSpot(match, athlete)
  return toward(athlete, spot.x, spot.z, spot.cutting ? true : undefined)
}

/** 盯防对象：对方同位置的球员。 */
function matchup(match: MatchState, athlete: Athlete): Athlete {
  return match.athletes[(1 - athlete.team) * 3 + athlete.role]
}

function contestShot(match: MatchState, defender: Athlete, shooter: Athlete, gap: number): void {
  // 每次投篮只决定一次要不要起跳：不是每球都扑，扑也有反应时间，否则跳投几乎全被盖掉。
  const reaction = 0.2 + (1 - defender.ratings.block) * 0.2
  if (shooter.action === 'shoot' && !shooter.released && gap < 1.8 && shooter.actionTime > reaction && match.time >= defender.nextThink) {
    defender.nextThink = match.time + 0.9
    if (match.random() < 0.3 + defender.ratings.block * 0.4) leap(defender)
  }
  const attackingRim = shooter.action === 'layup' || shooter.action === 'dunk'
  if (attackingRim && !shooter.released && gap < 2.2 && match.time >= defender.nextThink) {
    defender.nextThink = match.time + 0.6
    if (match.random() < 0.3 + defender.ratings.block * 0.45) leap(defender)
  }
}

function pressBall(match: MatchState, defender: Athlete, holder: Athlete, gap: number): void {
  if (gap > 1.35 || holder.action !== 'free' || defender.stealCooldown > 0 || match.time < defender.nextThink) return
  // 贴身时每隔一两秒考虑一次要不要下手，抢断能力越强越爱出手；掏空了会失去重心，所以不会一直伸手。
  defender.nextThink = match.time + 1 + match.random() * 0.8
  if (match.random() < 0.14 + defender.ratings.steal * 0.2) trySteal(match, defender)
}

/**
 * 人盯人：站在对位球员和篮筐之间。防持球人贴近，防无球人收缩并略微偏向球；
 * 对手还在后场时不上抢，退到三分线一带等。ballX、ballZ 是球（或发球点）的位置。
 */
function defend(match: MatchState, athlete: Athlete, ballX: number, ballZ: number): Move {
  const man = matchup(match, athlete)
  const hoopX = hoopSide(match, man) * COURT.hoopX
  const distance = Math.max(0.01, Math.hypot(man.x - hoopX, man.z))
  const onBall = match.ball.holder === man.id || (match.ball.state === 'pass' && match.ball.passTarget === man.id)
  const stand = Math.min(distance - (onBall ? 1.1 : 2.3), onBall ? 9.5 : 7)
  let goalX = hoopX + ((man.x - hoopX) / distance) * Math.max(0.6, stand)
  let goalZ = (man.z / distance) * Math.max(0.6, stand)
  if (!onBall) {
    goalX += (ballX - goalX) * 0.18
    goalZ += (ballZ - goalZ) * 0.18
  }
  const holder = match.athletes[match.ball.holder]
  // 内线协防：持球人已经杀到篮下而自己的人离球还远，就回去护筐。
  if (athlete.role === 2 && holder && holder.team !== athlete.team && holder.id !== man.id && Math.hypot(holder.x - hoopX, holder.z) < 4) {
    goalX = hoopX - Math.sign(hoopX) * 1.3
    goalZ = holder.z * 0.4
  }
  const gap = Math.hypot(man.x - athlete.x, man.z - athlete.z)
  if (match.phase === 'live' && athlete.action === 'free') {
    contestShot(match, athlete, man, gap)
    if (onBall && holder) pressBall(match, athlete, holder, gap)
  }
  const move = toward(athlete, goalX, goalZ)
  // 离该站的位置不远时保持面向对位球员滑步；被甩开了才转身加速去追。
  if (move.sprint) return move
  const watch = onBall || !holder ? man : holder
  return { ...move, face: Math.atan2(watch.z - athlete.z, watch.x - athlete.x) }
}

/** 球在空中或成了无主球：离落点最近的两个人去抢，够得着时起跳；其余人留在外线或回防。 */
function chase(match: MatchState, athlete: Athlete): Move {
  const ball = match.ball
  const tipoff = match.phase === 'tipoff'
  const flying = ball.state === 'shot' && !ball.touchedIron
  const side = Math.sign(ball.x) || 1
  // 投篮还在飞向篮筐时，内线和锋线先卡到篮下的位置，后卫留在外面。
  if (flying && !tipoff) {
    if (athlete.role === 0) return toward(athlete, side * (COURT.hoopX - 8), athlete.z * 0.5)
    return toward(athlete, side * (COURT.hoopX - 1.5), (athlete.role === 1 ? 1.3 : -1.1) * (athlete.team === 0 ? 1 : -1), true)
  }
  const landX = Math.min(COURT.halfLength, Math.max(-COURT.halfLength, ball.x + ball.vx * 0.35))
  const landZ = Math.min(COURT.halfWidth, Math.max(-COURT.halfWidth, ball.z + ball.vz * 0.35))
  const mine = Math.hypot(landX - athlete.x, landZ - athlete.z)
  const closer = match.athletes.filter((mate) => mate.team === athlete.team && mate.id !== athlete.id && Math.hypot(landX - mate.x, landZ - mate.z) < mine).length
  const going = tipoff ? athlete.role === 2 : closer < 2
  if (!going) {
    const spot = offenseSpot(match, athlete)
    return athlete.team === match.offense ? toward(athlete, spot.x, spot.z) : defend(match, athlete, ball.x, ball.z)
  }
  const above = ball.y - standingReach(athlete)
  if (mine < 1.1 && ball.vy < 0 && above > 0.05 && above < 0.95 && athlete.action === 'free') leap(athlete)
  return toward(athlete, landX, landZ, true)
}

/** 死球期间：发球人走到发球点，进攻方散开落位，防守方退回去找人。 */
function deadBall(match: MatchState, athlete: Athlete): Move {
  if (athlete.id === match.inbounder) return toward(athlete, match.inboundX, match.inboundZ, true)
  if (athlete.team !== match.inboundTeam) return defend(match, athlete, match.inboundX, match.inboundZ)
  const spot = offenseSpot(match, athlete)
  return toward(athlete, spot.x, spot.z)
}

/** 一名电脑球员这一步想怎么跑。出手、传球、抢断等动作在这里直接发起。 */
export function decide(match: MatchState, athlete: Athlete): Move {
  if (match.phase === 'final') return STAY
  if (match.ball.holder !== athlete.id) athlete.settling = false
  if (match.phase === 'dead') return deadBall(match, athlete)
  const ball = match.ball
  if (match.phase === 'tipoff' || ball.state === 'loose' || ball.state === 'shot') return chase(match, athlete)
  if (athlete.team !== match.offense) return defend(match, athlete, ball.x, ball.z)
  return ball.holder === athlete.id ? withBall(match, athlete) : offBall(match, athlete)
}

/** 电脑的跳投到了预定时间就出手。 */
export function shouldRelease(athlete: Athlete): boolean {
  return athlete.action === 'shoot' && !athlete.released && athlete.actionTime >= athlete.plannedRelease
}
