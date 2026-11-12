// 球馆的布局：下层、上层看台各有几排、离球场多远，以及由此排出的每个座位的位置和朝向。
import { COURT } from '../../sim/constants'

export interface Tier {
  rows: number
  /** 每排的进深与升高。 */
  depth: number
  rise: number
  /** 第一排座位前沿离球场边线（或底线）的水平距离，以及它的地面高度。 */
  setback: number
  base: number
}

/** 下层看台紧贴球场；上层看台在它后上方，中间隔着一圈走道和环形屏。 */
export const LOWER: Tier = { rows: 10, depth: 0.85, rise: 0.42, setback: 3.4, base: 0.75 }
export const UPPER: Tier = { rows: 9, depth: 0.9, rise: 0.5, setback: 13.6, base: 6.4 }

/** 底线后的看台比边线外的再退后一点，给篮架留出位置。 */
export const END_EXTRA = 1.6
export const SEAT_WIDTH = 0.58

export interface Seat {
  x: number
  /** 这一排台阶面的高度。 */
  y: number
  z: number
  /** 面朝球场的方向（绕竖轴的转角，0 朝 +z）。 */
  turn: number
}

/** 一面看台：沿球场的哪一边、向外是哪个方向。 */
export interface Bank {
  /** along 是沿看台长边的单位方向，out 是背离球场的单位方向（都在水平面内）。 */
  along: [number, number]
  out: [number, number]
  /** 看台长边的半长，以及第一排到球场中心的距离。 */
  half: number
  reach: number
  turn: number
}

export function banksOf(tier: Tier, includeNear: boolean): Bank[] {
  const sideReach = COURT.halfWidth + tier.setback
  const endReach = COURT.halfLength + tier.setback + END_EXTRA
  const sideHalf = COURT.halfLength + tier.setback * 0.5 + 1
  const endHalf = COURT.halfWidth + tier.setback * 0.5 + 1
  const banks: Bank[] = [
    // 远侧（转播镜头正对的一面）。
    { along: [1, 0], out: [0, -1], half: sideHalf, reach: sideReach, turn: 0 },
    { along: [0, 1], out: [1, 0], half: endHalf, reach: endReach, turn: -Math.PI / 2 },
    { along: [0, 1], out: [-1, 0], half: endHalf, reach: endReach, turn: Math.PI / 2 },
  ]
  // 近侧是转播机位所在的一面：上层不设看台，免得挡住镜头。
  if (includeNear) banks.push({ along: [1, 0], out: [0, 1], half: sideHalf, reach: sideReach, turn: Math.PI })
  return banks
}

/** 一面看台上所有座位的位置；每隔一段留出一条过道，篮架正后方的前两排留空。 */
export function seatsOf(tier: Tier, bank: Bank): Seat[] {
  const seats: Seat[] = []
  const behindHoop = bank.out[0] !== 0
  for (let row = 0; row < tier.rows; row += 1) {
    const out = bank.reach + (row + 0.5) * tier.depth
    const y = tier.base + row * tier.rise
    for (let across = -bank.half + SEAT_WIDTH; across <= bank.half - SEAT_WIDTH; across += SEAT_WIDTH) {
      const aisle = Math.abs(((across + 200) % 7.2) - 3.6) < 0.5
      if (aisle || (behindHoop && row < 2 && Math.abs(across) < 1.7)) continue
      seats.push({ x: bank.along[0] * across + bank.out[0] * out, y, z: bank.along[1] * across + bank.out[1] * out, turn: bank.turn })
    }
  }
  return seats
}
