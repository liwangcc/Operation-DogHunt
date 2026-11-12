// 玩家输入 → 球员动作：同一个键在进攻和防守时含义不同（投篮/封盖、传球/换人、变向/抢断）。
import { releaseJumper, tryDash, tryJump, tryPass, tryShoot, trySteal } from './actions'
import type { Move } from './ai'
import type { Athlete, Intent, MatchState } from './types'

export const NO_INTENT: Intent = {
  moveX: 0, moveZ: 0, sprint: false,
  shootHeld: false, shootPressed: false, shootReleased: false, passPressed: false, stealPressed: false,
}

/** 防守时换人：切到离球最近的队友；已经是最近的就切到第二近的。 */
export function switchControl(match: MatchState): void {
  const ball = match.ball
  const mates = match.athletes
    .filter((athlete) => athlete.team === 0)
    .sort((a, b) => Math.hypot(a.x - ball.x, a.z - ball.z) - Math.hypot(b.x - ball.x, b.z - ball.z))
  const next = mates[0].id === match.controlled ? mates[1] : mates[0]
  match.controlled = next.id
}

/**
 * 防守时不按加速键：身体保持面向持球人，方向键控制滑步和后撤；按住加速键才转身全速追。
 * 离球很远时没必要摆防守姿态，照常跑动。
 */
function defensiveFacing(match: MatchState, athlete: Athlete, intent: Intent): number | undefined {
  if (intent.sprint || athlete.team === match.offense || match.phase !== 'live') return undefined
  const ball = match.ball
  if (Math.hypot(ball.x - athlete.x, ball.z - athlete.z) > 7.5) return undefined
  return Math.atan2(ball.z - athlete.z, ball.x - athlete.x)
}

/** 处理玩家这一步的按键并返回想往哪跑。死球期间只能走动。 */
export function applyIntent(match: MatchState, athlete: Athlete, intent: Intent): Move {
  const move: Move = { x: intent.moveX, z: intent.moveZ, sprint: intent.sprint, face: defensiveFacing(match, athlete, intent) }
  if (match.phase !== 'live' && match.phase !== 'tipoff') return move
  if (match.ball.holder === athlete.id) {
    if (intent.shootPressed) tryShoot(match, athlete)
    // 按住投篮键蓄力，松开的那一刻出手。
    if (intent.shootReleased) releaseJumper(match, athlete)
    if (intent.passPressed) tryPass(match, athlete, intent.moveX, intent.moveZ)
    if (intent.stealPressed) tryDash(match, athlete, intent.moveX, intent.moveZ)
    return move
  }
  if (intent.shootPressed) tryJump(athlete)
  if (intent.passPressed) switchControl(match)
  if (intent.stealPressed && athlete.team !== match.offense) trySteal(match, athlete)
  return move
}
