// 球的物理：重力、落地反弹，以及与篮板、篮圈的碰撞和穿过篮筐的判定。
import { BALL, COURT } from './constants'
import type { Ball, GameEvent } from './types'

export function createBall(): Ball {
  return {
    x: 0, y: 1.2, z: 0, vx: 0, vy: 0, vz: 0,
    state: 'dead', holder: -1, shooter: -1, passTarget: -1,
    shotValue: 2, shotKind: 'jumper', shotPerfect: false, lastTouch: 0,
    touchedIron: false, flight: 0, dribble: 0, hand: 1, handBlend: 1, handCooldown: 0,
  }
}

/** 篮板是一块竖直的平板：球从场内一侧撞上去时按入射方向弹回。 */
function collideBoard(ball: Ball, side: number, events: GameEvent[]): void {
  const depth = ball.x * side + BALL.radius - COURT.boardX
  if (depth <= 0 || depth > 0.3 || ball.vx * side <= 0) return
  if (Math.abs(ball.z) > COURT.boardHalfWidth + BALL.radius * 0.5) return
  if (ball.y < COURT.boardBottom - BALL.radius * 0.5 || ball.y > COURT.boardTop + BALL.radius * 0.5) return
  events.push({ type: 'board', speed: Math.abs(ball.vx), side })
  ball.x = side * (COURT.boardX - BALL.radius)
  ball.vx = -ball.vx * BALL.boardBounce
  ball.vy *= 0.96
  ball.vz *= 0.92
  ball.touchedIron = true
}

/** 篮圈是一个水平的圆环：找出环上离球心最近的点，碰到就沿连线方向弹开。 */
function collideRim(ball: Ball, side: number, events: GameEvent[]): void {
  const dx = ball.x - side * COURT.hoopX
  const dz = ball.z
  const flat = Math.hypot(dx, dz)
  // 球心正好在圆心正上方时，环上各点等距，任取一个方向。
  const ux = flat > 1e-5 ? dx / flat : 1
  const uz = flat > 1e-5 ? dz / flat : 0
  const nx = dx - ux * COURT.rimRadius
  const ny = ball.y - COURT.rimHeight
  const nz = dz - uz * COURT.rimRadius
  const gap = Math.hypot(nx, ny, nz)
  const reach = BALL.radius + BALL.rimTube
  if (gap >= reach || gap < 1e-6) return
  const ax = nx / gap
  const ay = ny / gap
  const az = nz / gap
  const into = ball.vx * ax + ball.vy * ay + ball.vz * az
  ball.x += ax * (reach - gap)
  ball.y += ay * (reach - gap)
  ball.z += az * (reach - gap)
  if (into >= 0) return
  const impulse = -(1 + BALL.rimBounce) * into
  ball.vx += ax * impulse
  ball.vy += ay * impulse
  ball.vz += az * impulse
  ball.touchedIron = true
  if (-into > 0.6) events.push({ type: 'rim', speed: -into, side })
}

function collideFloor(ball: Ball, events: GameEvent[]): void {
  if (ball.y >= BALL.radius) return
  ball.y = BALL.radius
  // 投出的球落了地，这次出手就结束了，变成谁都可以捡的无主球。
  if (ball.state === 'shot') ball.state = 'loose'
  if (ball.vy < -0.9) {
    events.push({ type: 'bounce', speed: -ball.vy, x: ball.x, z: ball.z })
    ball.vy = -ball.vy * BALL.floorBounce
    ball.vx *= 0.8
    ball.vz *= 0.8
    return
  }
  ball.vy = 0
}

/** 球心自上而下穿过篮圈平面，且落点在圈内，才算进球。 */
function passedThroughHoop(ball: Ball, previousY: number, side: number): boolean {
  if (previousY < COURT.rimHeight || ball.y >= COURT.rimHeight || ball.vy >= 0) return false
  return Math.hypot(ball.x - side * COURT.hoopX, ball.z) < COURT.rimRadius - 0.012
}

function substep(ball: Ball, dt: number, events: GameEvent[]): number {
  const previousY = ball.y
  // 位置按匀加速精确推进，否则飞行时间越长落点越偏短，远投会莫名其妙砸前沿。
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt - 0.5 * BALL.gravity * dt * dt
  ball.z += ball.vz * dt
  ball.vy -= BALL.gravity * dt
  let scored = 0
  for (const side of [1, -1]) {
    collideBoard(ball, side, events)
    collideRim(ball, side, events)
    if (scored === 0 && passedThroughHoop(ball, previousY, side)) {
      scored = side
      events.push({ type: 'net', side, clean: !ball.touchedIron })
      // 篮网兜住球：横向速度大减，球几乎垂直落下。
      ball.vx *= 0.25
      ball.vz *= 0.25
      ball.vy *= 0.72
    }
  }
  collideFloor(ball, events)
  // 在地上滚动时逐渐停下。
  if (ball.y <= BALL.radius + 1e-4 && ball.vy === 0) {
    const slow = Math.max(0, 1 - 1.6 * dt)
    ball.vx *= slow
    ball.vz *= slow
  }
  return scored
}

/**
 * 推进不在球员手里的球（传球、投篮、无主球）。
 * 球速快时把一步拆成两小步，避免直接穿过很细的篮圈。返回进球的一侧（+1 或 -1），没进为 0。
 */
export function stepBall(ball: Ball, dt: number, events: GameEvent[]): number {
  const fast = Math.hypot(ball.vx, ball.vy, ball.vz) > 7
  const pieces = fast ? 2 : 1
  let scored = 0
  for (let i = 0; i < pieces; i += 1) {
    const side = substep(ball, dt / pieces, events)
    if (side !== 0) scored = side
  }
  ball.flight += dt
  return scored
}
