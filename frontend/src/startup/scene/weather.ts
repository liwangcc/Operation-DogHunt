// 天气：决定什么时候打闪、每次闪几下、从哪个方位闪，其他模块只读取结果。
import { DEG, seededRandom } from './layout'

export interface Lightning {
  /** 当前闪电亮度，0 表示没有闪电。 */
  level: number
  /** 闪电所在的方位角。 */
  azimuth: number
  /** 这一帧是否刚开始一次新的闪电（用来触发雷声）。 */
  struck: boolean
}

/** 两次闪电之间的间隔范围（秒）。第一次来得早一些，让人知道外面在下雷雨。 */
const FIRST_STRIKE = 9
const MIN_GAP = 16
const GAP_SPREAD = 24

export function createWeather(): { update: (time: number) => Lightning } {
  const random = seededRandom(86)
  const state: Lightning = { level: 0, azimuth: 90 * DEG, struck: false }
  let nextAt = FIRST_STRIKE
  let pulses: Array<{ at: number; strength: number }> = []

  function strike(time: number): void {
    // 落在玻璃幕墙可见的范围内：以正前方为中心，左右各 110°。
    state.azimuth = (90 + (random() - 0.5) * 220) * DEG
    const count = 2 + Math.floor(random() * 2)
    pulses = Array.from({ length: count }, (_, i) => ({ at: time + i * (0.09 + random() * 0.16), strength: i === 0 ? 0.45 : 0.6 + random() * 0.4 }))
    nextAt = time + MIN_GAP + random() * GAP_SPREAD
  }

  return {
    update: (time) => {
      state.struck = time >= nextAt
      if (state.struck) strike(time)
      // 每一下闪光都是瞬间亮起、很快衰减。
      state.level = pulses.reduce((sum, pulse) => (time >= pulse.at ? sum + pulse.strength * Math.exp(-(time - pulse.at) * 9) : sum), 0)
      if (state.level < 0.002) state.level = 0
      return state
    },
  }
}
