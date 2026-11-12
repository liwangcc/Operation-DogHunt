// 球员的各种动作：跳投、上篮、扣篮、传球、抢断、起跳封盖和变向，以及这些动作随时间的推进。
import { standingReach, turnToward } from './athlete'
import { BALL, COURT, MOVES, SHOT } from './constants'
import { gradeRelease, isThree, launchShot, makeChance } from './shooting'
import type { Athlete, MatchState, ReleaseGrade, ShotKind } from './types'

export function hoopSide(match: MatchState, athlete: Athlete): number {
  return match.attack[athlete.team]
}

export function hoopDistance(match: MatchState, athlete: Athlete): number {
  return Math.hypot(hoopSide(match, athlete) * COURT.hoopX - athlete.x, athlete.z)
}

/** 朝篮筐方向的速度分量：冲得够快才能扣篮。 */
export function closingSpeed(match: MatchState, athlete: Athlete): number {
  const hoopX = hoopSide(match, athlete) * COURT.hoopX
  const distance = Math.max(0.01, Math.hypot(hoopX - athlete.x, athlete.z))
  return (athlete.vx * (hoopX - athlete.x) - athlete.vz * athlete.z) / distance
}

function faceHoop(match: MatchState, athlete: Athlete): void {
  athlete.facing = Math.atan2(-athlete.z, hoopSide(match, athlete) * COURT.hoopX - athlete.x)
}

/** 防守干扰程度：投篮人身前最近的对手离得多近、有没有跳起来举手。0 为空位，1 为贴脸封盖。 */
export function contestOn(match: MatchState, shooter: Athlete): number {
  let worst = 0
  for (const other of match.athletes) {
    if (other.team === shooter.team) continue
    const dx = other.x - shooter.x
    const dz = other.z - shooter.z
    const gap = Math.hypot(dx, dz)
    if (gap > 1.9) continue
    const ahead = (dx * Math.cos(shooter.facing) + dz * Math.sin(shooter.facing)) / Math.max(gap, 0.01)
    // 一臂之内才算贴防；拉开到两米就基本不受影响，所以后撤步和接球就投是有用的。
    const closeness = Math.min(1, Math.max(0, 1 - (gap - 0.7) / 1.2))
    const handsUp = other.action === 'jump' && other.y > 0.15 ? 1 : 0.5
    worst = Math.max(worst, closeness * handsUp * (ahead > 0 ? 1 : 0.4))
  }
  return worst
}

function begin(athlete: Athlete, action: Athlete['action']): void {
  athlete.action = action
  athlete.actionTime = 0
  athlete.released = false
}

/** 把球交给物理：从球员手里变成飞行中的投篮。 */
function releaseBall(match: MatchState, shooter: Athlete, kind: ShotKind, grade: ReleaseGrade, chance: number, value: 2 | 3): void {
  // 球就从手里当前的位置飞出去，不会在出手瞬间跳到别处。
  const ball = match.ball
  const side = hoopSide(match, shooter)
  Object.assign(ball, { state: 'shot', holder: -1, shooter: shooter.id, shotValue: value, shotKind: kind })
  Object.assign(ball, { shotPerfect: grade === 'perfect', touchedIron: false, flight: 0, lastTouch: shooter.team })
  launchShot(ball, side, match.random() < chance, match.random)
  shooter.released = true
  match.events.push({ type: 'release', player: shooter.id, grade, kind })
}

/** 跳投出手：玩家松开投篮键、电脑到了预定时间，或者拖得太久被迫出手时调用。 */
export function releaseJumper(match: MatchState, shooter: Athlete): void {
  if (shooter.action !== 'shoot' || shooter.released) return
  const side = hoopSide(match, shooter)
  const grade = gradeRelease(shooter.actionTime)
  const three = isThree(shooter.x, shooter.z, side)
  const chance = makeChance(shooter, hoopDistance(match, shooter), three, contestOn(match, shooter), grade, 'jumper', shooter.shotMoving)
  releaseBall(match, shooter, 'jumper', grade, chance, three ? 3 : 2)
}

function startRunToRim(match: MatchState, athlete: Athlete, action: 'layup' | 'dunk', stopShort: number, jump: number): void {
  const hoopX = hoopSide(match, athlete) * COURT.hoopX
  const gap = Math.max(0.01, Math.hypot(hoopX - athlete.x, athlete.z))
  begin(athlete, action)
  athlete.fromX = athlete.x
  athlete.fromZ = athlete.z
  // 落点在篮筐正前方、朝着来的方向留一小段距离。
  athlete.toX = hoopX - ((hoopX - athlete.x) / gap) * stopShort
  athlete.toZ = (athlete.z / gap) * stopShort
  // 用外侧手终结：从篮筐右侧杀进来用右手，左侧用左手。
  const wing = athlete.z * hoopSide(match, athlete)
  if (Math.abs(wing) > 0.35) match.ball.hand = wing > 0 ? 1 : -1
  match.ball.handBlend = match.ball.hand
  athlete.vy = jump
  faceHoop(match, athlete)
}

/**
 * 持球人按下投篮键：离筐近且正在冲筐就扣篮，离筐近但没有速度就上篮，其余情况起跳投篮。
 * 返回是否开始了某个出手动作。
 */
export function tryShoot(match: MatchState, athlete: Athlete): boolean {
  if (match.ball.holder !== athlete.id || athlete.action !== 'free' || athlete.y > 0) return false
  const distance = hoopDistance(match, athlete)
  if (athlete.ratings.dunk && distance > 1.1 && distance < 3.4 && closingSpeed(match, athlete) > 3.6) {
    startRunToRim(match, athlete, 'dunk', 0.34, BALL.gravity * MOVES.dunkSlam * 0.97)
  } else if (distance < 2.5) {
    startRunToRim(match, athlete, 'layup', 0.8, 4.1)
  } else {
    begin(athlete, 'shoot')
    athlete.shotMoving = Math.min(1, Math.hypot(athlete.vx, athlete.vz) / 5.5)
    athlete.vy = SHOT.jumpSpeed
    athlete.vx *= 0.3
    athlete.vz *= 0.3
    faceHoop(match, athlete)
  }
  return true
}

/** 选传球对象：有方向输入时选最顺着那个方向的队友，否则选离对手最远（最空）的队友。 */
function pickReceiver(match: MatchState, passer: Athlete, dirX: number, dirZ: number): Athlete | null {
  const aimed = Math.hypot(dirX, dirZ) > 0.3
  let best: Athlete | null = null
  let bestScore = -Infinity
  for (const mate of match.athletes) {
    if (mate.team !== passer.team || mate.id === passer.id) continue
    const dx = mate.x - passer.x
    const dz = mate.z - passer.z
    const gap = Math.max(0.01, Math.hypot(dx, dz))
    let score: number
    if (aimed) {
      score = (dx * dirX + dz * dirZ) / gap - gap * 0.015
    } else {
      const guard = Math.min(...match.athletes.filter((o) => o.team !== passer.team).map((o) => Math.hypot(o.x - mate.x, o.z - mate.z)))
      score = guard - gap * 0.1
    }
    if (score > bestScore) {
      bestScore = score
      best = mate
    }
  }
  return best
}

/** 传球：球沿一条略带弧度的线飞向队友将要到达的位置。target 可以指定接球人。 */
export function tryPass(match: MatchState, passer: Athlete, dirX: number, dirZ: number, target?: Athlete): boolean {
  if (match.ball.holder !== passer.id || (passer.action !== 'free' && passer.action !== 'dash')) return false
  const receiver = target ?? pickReceiver(match, passer, dirX, dirZ)
  if (!receiver) return false
  const ball = match.ball
  const fromY = passer.y + passer.height * 0.68
  const flat = Math.hypot(receiver.x - passer.x, receiver.z - passer.z)
  const seconds = Math.max(0.12, flat / BALL.passSpeed)
  const toX = receiver.x + receiver.vx * seconds * 0.8
  const toZ = receiver.z + receiver.vz * seconds * 0.8
  passer.facing = Math.atan2(toZ - passer.z, toX - passer.x)
  const fromX = passer.x + Math.cos(passer.facing) * 0.35
  const fromZ = passer.z + Math.sin(passer.facing) * 0.35
  const toY = receiver.height * 0.66
  Object.assign(ball, { x: fromX, y: fromY, z: fromZ, state: 'pass', holder: -1, passTarget: receiver.id, flight: 0, lastTouch: passer.team })
  ball.vx = (toX - fromX) / seconds
  ball.vz = (toZ - fromZ) / seconds
  ball.vy = (toY - fromY + 0.5 * BALL.gravity * seconds * seconds) / seconds
  begin(passer, 'pass')
  match.events.push({ type: 'pass', from: passer.id, to: receiver.id })
  return true
}

/** 抢断：向前探一步去掏球。成败在动作进行到一半时结算（见 resolveSteal）。 */
export function trySteal(match: MatchState, athlete: Athlete): boolean {
  if (athlete.action !== 'free' || athlete.stealCooldown > 0 || athlete.y > 0) return false
  begin(athlete, 'steal')
  athlete.stealCooldown = MOVES.stealCooldown
  const holder = match.athletes[match.ball.holder]
  if (holder) athlete.facing = Math.atan2(holder.z - athlete.z, holder.x - athlete.x)
  athlete.vx += Math.cos(athlete.facing) * 2.2
  athlete.vz += Math.sin(athlete.facing) * 2.2
  return true
}

function resolveSteal(match: MatchState, thief: Athlete): void {
  thief.released = true
  const ball = match.ball
  const holder = ball.state === 'held' ? match.athletes[ball.holder] : undefined
  if (!holder || holder.team === thief.team) return
  const dx = holder.x - thief.x
  const dz = holder.z - thief.z
  const gap = Math.hypot(dx, dz)
  const aimed = (dx * Math.cos(thief.facing) + dz * Math.sin(thief.facing)) / Math.max(gap, 0.01)
  if (gap > 1.35 || aimed < 0.4) return
  // 持球人背对抢断者时在护球，更难掏到；正在变向时球离身体远，更容易。
  const shielding = Math.cos(holder.facing) * -dx + Math.sin(holder.facing) * -dz < 0
  let chance = 0.1 + thief.ratings.steal * 0.2
  if (shielding) chance *= 0.45
  // 持球人正对着抢断者冲过来时，球完全暴露在身前。
  const charging = (holder.vx * -dx + holder.vz * -dz) / Math.max(gap, 0.01)
  if (!shielding && charging > 3) chance *= 1.35
  if (holder.action === 'dash') chance *= 0.5
  if (holder.action !== 'free' && holder.action !== 'dash') chance *= 0.6
  if (match.random() > chance) return
  Object.assign(ball, { state: 'loose', holder: -1, lastTouch: thief.team, flight: 0, touchedIron: true })
  ball.vx = -dx / Math.max(gap, 0.01) * 2.4 + thief.vx * 0.3
  ball.vz = -dz / Math.max(gap, 0.01) * 2.4 + thief.vz * 0.3
  ball.vy = 2.6
  holder.action = 'stun'
  holder.actionTime = 0
  match.events.push({ type: 'steal', player: thief.id })
}

/** 起跳：封盖、抢篮板都用它。 */
export function tryJump(athlete: Athlete): boolean {
  if (athlete.action !== 'free' || athlete.y > 0) return false
  begin(athlete, 'jump')
  athlete.vy = MOVES.blockJumpSpeed
  return true
}

/** 变向：朝指定方向猛地一蹿，身边的电脑防守人会被晃开一瞬。 */
export function tryDash(match: MatchState, athlete: Athlete, dirX: number, dirZ: number): boolean {
  if (athlete.action !== 'free' || athlete.dashCooldown > 0 || athlete.y > 0) return false
  const push = Math.hypot(dirX, dirZ)
  const ux = push > 0.3 ? dirX / push : Math.cos(athlete.facing)
  const uz = push > 0.3 ? dirZ / push : Math.sin(athlete.facing)
  begin(athlete, 'dash')
  athlete.dashCooldown = MOVES.dashCooldown
  // 持球变向同时把球换到另一只手。
  if (match.ball.holder === athlete.id) {
    match.ball.hand = -match.ball.hand
    match.ball.handCooldown = 0.6
  }
  athlete.vx = ux * athlete.ratings.speed * 1.35
  athlete.vz = uz * athlete.ratings.speed * 1.35
  for (const other of match.athletes) {
    if (other.team !== athlete.team && other.id !== match.controlled && Math.hypot(other.x - athlete.x, other.z - athlete.z) < 2) other.lag = 0.32
  }
  match.events.push({ type: 'squeak', x: athlete.x, z: athlete.z })
  return true
}

/** 上篮与扣篮时，球员沿“起跳点 → 篮下”的路线腾空，方向键不再起作用。 */
function glideToRim(athlete: Athlete, duration: number, dt: number): void {
  const remaining = Math.max(dt, duration - athlete.actionTime)
  athlete.vx = (athlete.toX - athlete.x) / remaining
  athlete.vz = (athlete.toZ - athlete.z) / remaining
  if (athlete.actionTime >= duration) {
    athlete.vx = 0
    athlete.vz = 0
  }
}

/** 封盖者的手离篮筐够不够近、跳得够不够高：扣篮瞬间用它判断有没有被帽。 */
function rimProtected(match: MatchState, dunker: Athlete): Athlete | null {
  const hoopX = hoopSide(match, dunker) * COURT.hoopX
  for (const other of match.athletes) {
    if (other.team === dunker.team || other.action !== 'jump') continue
    const handHeight = standingReach(other) + other.y
    if (Math.hypot(other.x - hoopX, other.z) < 1.1 && handHeight > COURT.rimHeight + 0.12) return other
  }
  return null
}

function slam(match: MatchState, dunker: Athlete): void {
  const ball = match.ball
  const side = hoopSide(match, dunker)
  const blocker = rimProtected(match, dunker)
  dunker.released = true
  if (blocker && match.random() < 0.3 + blocker.ratings.block * 0.25) {
    Object.assign(ball, { state: 'loose', holder: -1, lastTouch: blocker.team, flight: 0, touchedIron: true })
    ball.vx = -side * (3 + match.random() * 2)
    ball.vy = 2.5
    ball.vz = (match.random() - 0.5) * 5
    match.events.push({ type: 'block', player: blocker.id })
    return
  }
  // 身前有人贴防时，扣篮可能被顶歪，砸在筐沿上弹出来。
  if (match.random() < contestOn(match, dunker) * 0.5) {
    Object.assign(ball, { x: side * (COURT.hoopX - 0.2), y: COURT.rimHeight + 0.14, z: 0.05, state: 'shot', holder: -1, shooter: dunker.id, shotValue: 2, shotKind: 'dunk' })
    Object.assign(ball, { shotPerfect: false, touchedIron: true, flight: 0, lastTouch: dunker.team, vx: -side * 2.2, vy: 3.4, vz: (match.random() - 0.5) * 3 })
    match.events.push({ type: 'rim', speed: 6, side })
    return
  }
  Object.assign(ball, { x: side * COURT.hoopX, y: COURT.rimHeight + 0.16, z: 0, vx: 0, vy: -7.5, vz: 0 })
  Object.assign(ball, { state: 'shot', holder: -1, shooter: dunker.id, shotValue: 2, shotKind: 'dunk', shotPerfect: true, touchedIron: false, flight: 0, lastTouch: dunker.team })
  match.events.push({ type: 'dunk', player: dunker.id, side })
}

function layUp(match: MatchState, athlete: Athlete): void {
  const chance = makeChance(athlete, hoopDistance(match, athlete), false, contestOn(match, athlete), 'good', 'layup', 0)
  releaseBall(match, athlete, 'layup', 'good', chance, 2)
}

function finish(athlete: Athlete): void {
  athlete.action = 'free'
  athlete.actionTime = 0
}

/** 推进一名球员当前的动作；每个物理步调用一次。 */
export function updateAction(match: MatchState, athlete: Athlete, dt: number): void {
  if (athlete.action === 'free') return
  athlete.actionTime += dt
  const t = athlete.actionTime
  const grounded = athlete.y === 0
  switch (athlete.action) {
    case 'shoot':
      athlete.vx *= Math.max(0, 1 - 9 * dt)
      athlete.vz *= Math.max(0, 1 - 9 * dt)
      turnToward(athlete, Math.atan2(-athlete.z, hoopSide(match, athlete) * COURT.hoopX - athlete.x), dt, 20)
      if (!athlete.released && t >= SHOT.forcedRelease) releaseJumper(match, athlete)
      if (athlete.released && grounded && t > SHOT.idealRelease + SHOT.followThrough) finish(athlete)
      break
    case 'layup':
      glideToRim(athlete, MOVES.layupSeconds * 0.75, dt)
      if (!athlete.released && t >= MOVES.layupRelease && match.ball.holder === athlete.id) layUp(match, athlete)
      if (t >= MOVES.layupSeconds && grounded) finish(athlete)
      break
    case 'dunk':
      glideToRim(athlete, MOVES.dunkSlam, dt)
      if (!athlete.released && t >= MOVES.dunkSlam && match.ball.holder === athlete.id) slam(match, athlete)
      if (t >= MOVES.dunkSeconds && grounded) finish(athlete)
      break
    case 'pass':
      if (t >= MOVES.passSeconds) finish(athlete)
      break
    case 'steal':
      athlete.vx *= Math.max(0, 1 - 7 * dt)
      athlete.vz *= Math.max(0, 1 - 7 * dt)
      if (!athlete.released && t >= 0.12) resolveSteal(match, athlete)
      if (t >= MOVES.stealSeconds) {
        // 没掏到就会失去重心，短时间内跟不上持球人。
        if (match.ball.lastTouch !== athlete.team || match.ball.state === 'held') athlete.lag = MOVES.stealMissStun
        finish(athlete)
      }
      break
    case 'jump':
      if (grounded && t > 0.15) finish(athlete)
      break
    case 'dash':
      if (t >= MOVES.dashSeconds) {
        // 蹿出去之后脚一蹬地就收住，速度回到正常跑动的范围。
        const speed = Math.hypot(athlete.vx, athlete.vz)
        const keep = Math.min(1, (athlete.ratings.speed * 0.8) / Math.max(speed, 0.01))
        athlete.vx *= keep
        athlete.vz *= keep
        finish(athlete)
      }
      break
    case 'stun':
      athlete.vx *= Math.max(0, 1 - 10 * dt)
      athlete.vz *= Math.max(0, 1 - 10 * dt)
      if (t >= 0.38) finish(athlete)
      break
    case 'celebrate':
      athlete.vx *= Math.max(0, 1 - 8 * dt)
      athlete.vz *= Math.max(0, 1 - 8 * dt)
      break
  }
}
