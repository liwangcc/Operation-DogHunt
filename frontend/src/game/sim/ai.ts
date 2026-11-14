// 电脑球员的决策：持球时突破、投篮还是传球，无球时怎么跑位，争抢篮板，以及每一步该走进攻还是防守（防守在 defense.ts）。
import { speedOf, standingReach } from './athlete'
import { canDunk, hoopDistance, hoopSide, tryDash, tryPass, tryShoot } from './actions'
import { COURT, EDGE, MOVES, SHOT } from './constants'
import { runwayClear } from './contact'
import { defend } from './defense'
import { leap, STAY, toward, type Move } from './footwork'
import { isThree } from './shooting'
import type { Athlete, MatchState } from './types'

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
  const spread = (match.random() + match.random() + match.random() - 1.5) * 0.1
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
  // 刚才在突破、现在路被堵死了：多半有人放了自己的人过来协防，优先找空出来的队友。
  const walled = athlete.driving && !laneOpen(match, athlete, hoopX, 0, 1.05)
  athlete.driving = false
  if (side * athlete.x < -1.5) {
    athlete.goalX = side * 3.5
    athlete.goalZ = athlete.z * 0.6
    return
  }
  if (distance < 2.5) {
    if (match.shotClock < 5 || runwayClear(match, athlete, hoopX)) return shootNow(match, athlete)
    // 篮下被身体挡着：硬上多半被顶歪。有人过来协防就说明有队友空了，先找他；找不到多半退出来重新组织。
    const mate = match.random() < 0.75 ? bestReceiver(match, athlete) : null
    if (mate && tryPass(match, athlete, 0, 0, mate)) return
    if (match.random() < 0.3) return shootNow(match, athlete)
  }
  if (match.shotClock < 3.4) return pullUp(match, athlete)
  const three = isThree(athlete.x, athlete.z, side)
  // 防守人离得越远越敢投：接球就是大空位时基本不会放过，只有半步空间时多半再等等。
  const open = Math.min(1, Math.max(0, (guardGap - 1.6) / 1.2))
  // 三分只有投得准的人才爱投（按能力的平方），要真有空位才出手，而且尽量贴着线投，不在线外一大步出手。
  const eagerness = three ? athlete.ratings.three ** 2 * 0.75 * (0.1 + open * 1.25) : (0.25 + athlete.ratings.mid * 0.3) * (0.35 + open)
  if (distance >= 2.5 && distance < 7.95 && guardGap > 1.6 && match.random() < eagerness) return pullUp(match, athlete)
  // 内线在低位被贴着：有一点空间就转身来一个近距离跳投。
  if (distance >= 2.5 && distance < 4.3 && guardGap > 0.9 && match.random() < athlete.ratings.inside * 0.22) return pullUp(match, athlete)
  // 在射程内被贴住：有时用后撤步自己造一个出手空间。
  const touch = three ? athlete.ratings.three : athlete.ratings.mid
  if (distance > 3.6 && distance < 7.9 && guardGap < 1.5 && match.random() < 0.05 + touch * 0.16 && stepBack(match, athlete)) return
  if (distance < 10 && laneOpen(match, athlete, hoopX, 0, 1.05) && match.random() < 0.6) {
    athlete.driving = true
    athlete.goalX = hoopX - side * 0.9
    athlete.goalZ = 0
    return
  }
  const mate = match.random() < (walled ? 0.85 : 0.45) ? bestReceiver(match, athlete) : null
  if (mate && tryPass(match, athlete, 0, 0, mate)) return
  // 突破被堵在禁区附近又传不出去：与其硬顶，不如急停来一个近距离跳投。
  if (walled && distance < 5.2 && match.random() < 0.5) return pullUp(match, athlete)
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
      // 收步时防守人已经贴上来了就不硬投（三分要的空间更大），除非进攻时间快到了。
      const room = isThree(athlete.x, athlete.z, hoopSide(match, athlete)) ? 1.4 : 0.95
      if (nearestOpponentGap(match, athlete) > room || match.shotClock < 4) shootNow(match, athlete)
    }
    return STAY
  }
  if (match.time >= athlete.nextThink) {
    athlete.nextThink = match.time + 0.26 + match.random() * 0.14
    chooseBallPlan(match, athlete)
    if (athlete.action !== 'free' || match.ball.holder !== athlete.id) return STAY
  }
  if (athlete.driving) {
    // 冲起来了、路上没人挡着就直接起跳扣篮，否则再往里一步上篮。
    const distance = hoopDistance(match, athlete)
    const clear = runwayClear(match, athlete, hoopSide(match, athlete) * COURT.hoopX)
    if ((distance < 2.45 && clear) || canDunk(match, athlete)) {
      shootNow(match, athlete)
      return STAY
    }
    // 前面被身体堵住了：别硬闯，马上重新考虑（分球、急停跳投或者换个方向）。
    if (distance < 5 && !clear) athlete.nextThink = Math.min(athlete.nextThink, match.time)
  }
  const move = toward(athlete, athlete.goalX, athlete.goalZ, athlete.driving ? true : undefined)
  // 不是在突破时，身边有防守人就压着速度运：全速推进护不住球。
  if (!athlete.driving && move.sprint && nearestOpponentGap(match, athlete) < 1.8) return stayInbounds(athlete, { ...move, sprint: false })
  return stayInbounds(athlete, move)
}

function offBall(match: MatchState, athlete: Athlete): Move {
  const ball = match.ball
  // 球正朝自己飞来：迎上去接。
  if (ball.state === 'pass' && ball.passTarget === athlete.id) return toward(athlete, ball.x + ball.vx * 0.15, ball.z + ball.vz * 0.15)
  const spot = offenseSpot(match, athlete)
  return toward(athlete, spot.x, spot.z, spot.cutting ? true : undefined)
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
