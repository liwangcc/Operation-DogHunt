// 电脑球员共用的走位：一步里想往哪跑（Move）、朝目标点走过去、收住脚步起跳。进攻和防守的决策都用它。
import { tryJump } from './actions'
import type { Athlete } from './types'

/** 想往哪个方向跑（长度不超过 1），以及是否加速。 */
export interface Move {
  x: number
  z: number
  sprint: boolean
  /** 给出时身体保持朝向这个角度，靠滑步移动（防守姿态）；不给则转身朝跑动方向。 */
  face?: number
}

export const STAY: Move = { x: 0, z: 0, sprint: false }

export function toward(athlete: Athlete, goalX: number, goalZ: number, sprint?: boolean): Move {
  const dx = goalX - athlete.x
  const dz = goalZ - athlete.z
  const gap = Math.hypot(dx, dz)
  if (gap < 0.2) return STAY
  // 快到位时减速，避免在目标点上来回抖动。
  const push = Math.min(1, gap / 0.7)
  return { x: (dx / gap) * push, z: (dz / gap) * push, sprint: sprint ?? gap > 3.2 }
}

/** 电脑起跳（封盖、抢板）时收住脚步，直上直下，不会带着助跑的惯性冲出底线。 */
export function leap(athlete: Athlete): void {
  if (!tryJump(athlete)) return
  athlete.vx *= 0.35
  athlete.vz *= 0.35
}
