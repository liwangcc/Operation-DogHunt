// 比赛主循环：每个物理步里依次处理决策、动作、移动、球，再按规则判定进球、出界、进攻超时和每节结束。
import { hoopSide, releaseJumper, updateAction } from './actions'
import { decide, shouldRelease } from './ai'
import { createAthlete, integrate, separate, speedOf, steer, turnToward } from './athlete'
import { createBall, stepBall } from './ball'
import { COURT, RULES, STEP } from './constants'
import { applyIntent } from './control'
import { carryBall, checkBounds, resolveFreeBall } from './possession'
import type { Athlete, Intent, MatchState, Role, TeamId } from './types'

/** 可复现的随机数：同一个种子打出同一场比赛，方便测试。 */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** 开场站位：两名内线在中圈对峙，其余人在各自半场。 */
function placeForTipoff(athletes: Athlete[], attack: [number, number]): void {
  const spots: Array<[number, number]> = [[-4.2, 0.6], [-2.6, -4], [-0.55, 0]]
  for (const athlete of athletes) {
    const [back, across] = spots[athlete.role]
    const side = attack[athlete.team]
    athlete.x = back * side
    athlete.z = across * side
    athlete.facing = side > 0 ? 0 : Math.PI
  }
}

/**
 * @param userControlled 为 true 时 0 队的一名球员由玩家操作，否则两队都由电脑控制（演示与测试用）
 */
export function createMatch(seed: number, userControlled: boolean): MatchState {
  const athletes: Athlete[] = []
  for (const team of [0, 1] as TeamId[]) for (const role of [0, 1, 2] as Role[]) athletes.push(createAthlete(athletes.length, team, role))
  const attack: [number, number] = [1, -1]
  placeForTipoff(athletes, attack)
  const ball = createBall()
  Object.assign(ball, { state: 'loose', y: 2, vy: 6.6 })
  return {
    athletes, ball, phase: 'tipoff', score: [0, 0], period: 1, clock: RULES.periodSeconds, shotClock: RULES.shotClock,
    offense: 0, attack, pause: 0, inboundTeam: 0, inboundX: 0, inboundZ: 0, controlled: userControlled ? 0 : -1,
    time: 0, lastScorer: -1, inbounder: -1, tipWinner: -1, celebrating: false, random: seeded(seed), events: [{ type: 'tip' }],
  }
}

/** 进入死球：停表，记下之后由哪一队在哪里发球。 */
function stopPlay(match: MatchState, team: TeamId, x: number, z: number, pause: number, inbounder: number): void {
  match.phase = 'dead'
  match.pause = pause
  match.inboundTeam = team
  match.inboundX = x
  match.inboundZ = z
  match.inbounder = inbounder
  match.offense = team
  match.ball.state = 'dead'
  match.ball.holder = -1
}

function nearestOf(match: MatchState, team: TeamId, x: number, z: number): number {
  const mates = match.athletes.filter((athlete) => athlete.team === team)
  return mates.reduce((best, mate) => (Math.hypot(mate.x - x, mate.z - z) < Math.hypot(best.x - x, best.z - z) ? mate : best)).id
}

function score(match: MatchState, side: number): void {
  const ball = match.ball
  const team: TeamId = match.attack[0] === side ? 0 : 1
  const shooter = match.athletes[ball.shooter]
  const credited = ball.state === 'shot' && shooter !== undefined && shooter.team === team
  const points = credited ? ball.shotValue : 2
  match.score[team] += points
  match.lastScorer = credited ? shooter.id : -1
  match.celebrating = credited && (ball.shotKind === 'dunk' || points === 3 || ball.shotPerfect)
  match.events.push({ type: 'score', team, points, player: match.lastScorer, kind: ball.shotKind, perfect: ball.shotPerfect, side })
  const other: TeamId = team === 0 ? 1 : 0
  // 失分的一方由后卫在底线发球。
  stopPlay(match, other, side * (COURT.halfLength - 0.45), match.random() < 0.5 ? 2.7 : -2.7, RULES.scorePause, other * 3)
}

function violation(match: MatchState, reason: 'out' | 'shotclock', team: TeamId, x: number, z: number): void {
  if (reason === 'shotclock') match.events.push({ type: 'buzzer', reason: 'shotclock' })
  match.events.push({ type: 'whistle', reason })
  match.ball.vx *= 0.3
  match.ball.vz *= 0.3
  stopPlay(match, team, x, z, RULES.violationPause, nearestOf(match, team, x, z))
}

/** 一节结束。常规时间打完且分出胜负就终场；平分则加时一分钟，直到分出胜负。 */
function endPeriod(match: MatchState): void {
  const decided = match.period >= RULES.periods && match.score[0] !== match.score[1]
  match.events.push({ type: 'buzzer', reason: decided ? 'final' : 'period' })
  if (decided) {
    match.phase = 'final'
    match.ball.state = 'dead'
    match.ball.holder = -1
    return
  }
  match.period += 1
  if (match.period <= RULES.periods) {
    // 下半场交换场地。
    match.attack = [match.attack[1], match.attack[0]]
    match.clock = RULES.periodSeconds
  } else {
    match.clock = 60
  }
  const first: TeamId = match.tipWinner === 1 ? 1 : 0
  const team: TeamId = match.period % 2 === 0 ? (first === 0 ? 1 : 0) : first
  stopPlay(match, team, 0, COURT.halfWidth - 0.45, 3.2, team * 3)
}

/** 死球结束：发球人拿球，比赛继续。 */
function resume(match: MatchState): void {
  const inbounder = match.athletes[match.inbounder]
  if (Math.hypot(inbounder.x - match.inboundX, inbounder.z - match.inboundZ) > 1.2) {
    inbounder.x = match.inboundX
    inbounder.z = match.inboundZ
  }
  inbounder.vx = 0
  inbounder.vz = 0
  for (const athlete of match.athletes) {
    if (athlete.action === 'celebrate') athlete.action = 'free'
    athlete.driving = false
  }
  Object.assign(match.ball, { state: 'held', holder: inbounder.id, shooter: -1, passTarget: -1, touchedIron: false, lastTouch: inbounder.team })
  match.offense = inbounder.team
  match.shotClock = RULES.shotClock
  match.phase = 'live'
  match.celebrating = false
  if (inbounder.team === 0 && match.controlled >= 0) match.controlled = inbounder.id
  match.events.push({ type: 'possession', team: inbounder.team })
}

function liveRules(match: MatchState, scoredSide: number): void {
  const ball = match.ball
  if (match.tipWinner < 0) match.tipWinner = match.offense
  if (scoredSide !== 0) {
    score(match, scoredSide)
  } else {
    const out = checkBounds(match)
    if (out) {
      violation(match, 'out', out.team, out.x, out.z)
    } else {
      match.clock = Math.max(0, match.clock - STEP)
      // 出手之后进攻计时暂停，等球有了归属再重置。
      if (ball.state === 'held' || ball.state === 'pass') match.shotClock -= STEP
      if (match.shotClock <= 0) {
        const other: TeamId = match.offense === 0 ? 1 : 0
        const sideline = (ball.z >= 0 ? 1 : -1) * (COURT.halfWidth - 0.45)
        violation(match, 'shotclock', other, Math.min(COURT.halfLength - 1.2, Math.max(-COURT.halfLength + 1.2, ball.x)), sideline)
      }
    }
  }
  // 时间到了但球已经出手：等这一球有了结果（压哨球有效）。
  if (match.clock <= 0 && match.ball.state !== 'shot') endPeriod(match)
}

function deadRules(match: MatchState): void {
  match.pause -= STEP
  const scorer = match.athletes[match.lastScorer]
  if (match.celebrating && scorer && scorer.action === 'free' && scorer.y === 0) {
    scorer.action = 'celebrate'
    scorer.actionTime = 0
  }
  if (match.pause <= 0) resume(match)
}

/** 站着不动时面向该看的地方：持球人看篮筐，其他人看球。 */
function faceTheAction(match: MatchState, athlete: Athlete): void {
  if (athlete.action !== 'free' || speedOf(athlete) > 0.6) return
  const ball = match.ball
  if (ball.holder === athlete.id) {
    turnToward(athlete, Math.atan2(-athlete.z, hoopSide(match, athlete) * COURT.hoopX - athlete.x), STEP, 8)
  } else {
    turnToward(athlete, Math.atan2(ball.z - athlete.z, ball.x - athlete.x), STEP, 8)
  }
}

function driveAthlete(match: MatchState, athlete: Athlete, intent: Intent | null): void {
  const user = intent !== null && athlete.id === match.controlled
  athlete.manual = user
  const move = user ? applyIntent(match, athlete, intent) : decide(match, athlete)
  if (athlete.action === 'free' || athlete.action === 'pass') {
    steer(athlete, move.x, move.z, move.sprint, match.ball.holder === athlete.id, move.face ?? null, STEP, match.events)
  }
  if (!user && shouldRelease(athlete)) releaseJumper(match, athlete)
  updateAction(match, athlete, STEP)
}

/** 推进一个物理步（1/120 秒）。intent 是玩家这一步的输入；传 null 表示全部由电脑控制。 */
export function stepMatch(match: MatchState, intent: Intent | null): void {
  match.time += STEP
  if (match.phase === 'final') {
    for (const athlete of match.athletes) {
      steer(athlete, 0, 0, false, false, null, STEP, match.events)
      integrate(athlete, STEP, false)
    }
    if (match.ball.state !== 'held') stepBall(match.ball, STEP, match.events)
    return
  }
  for (const athlete of match.athletes) driveAthlete(match, athlete, intent)
  for (const athlete of match.athletes) integrate(athlete, STEP, match.ball.holder === athlete.id)
  separate(match.athletes)
  for (const athlete of match.athletes) faceTheAction(match, athlete)

  const ball = match.ball
  let scoredSide = 0
  if (ball.state === 'held') {
    carryBall(match, STEP)
  } else {
    const side = stepBall(ball, STEP, match.events)
    if (ball.state !== 'dead') {
      scoredSide = side
      if (side === 0) resolveFreeBall(match, STEP)
    }
  }
  if (match.phase === 'live') liveRules(match, scoredSide)
  else if (match.phase === 'dead') deadRules(match)
}
