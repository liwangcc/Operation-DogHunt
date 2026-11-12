// 演示数据用的虚构“沙盘联赛”：球队、报价平台和可复现的随机数。与任何真实球队、平台、比赛无关。
// 队名沿用启动页战术桌小游戏里的“猎犬”“赤狐”，其余同样是虚构的。

export interface DemoTeam {
  /** 当作接口里的球队英文名使用，带 Sandbox 前缀，不会与真实球队重名。 */
  key: string
  name: string
  code: string
  color: string
}

export const DEMO_TEAMS: DemoTeam[] = [
  { key: 'Sandbox Hounds', name: '猎犬', code: 'HND', color: '#3fb6c8' },
  { key: 'Sandbox Foxes', name: '赤狐', code: 'FOX', color: '#d9924c' },
  { key: 'Sandbox Falcons', name: '灰隼', code: 'FLC', color: '#8b9bb3' },
  { key: 'Sandbox Belugas', name: '白鲸', code: 'BLG', color: '#7db4dc' },
  { key: 'Sandbox Obsidian', name: '黑曜', code: 'OBS', color: '#8f84c4' },
  { key: 'Sandbox Leopards', name: '云豹', code: 'LPD', color: '#c7ae52' },
  { key: 'Sandbox Hemlocks', name: '铁杉', code: 'HMK', color: '#5cae86' },
  { key: 'Sandbox Tides', name: '潮汐', code: 'TDE', color: '#4f9bd1' },
  { key: 'Sandbox Auroras', name: '极光', code: 'AUR', color: '#b481d2' },
  { key: 'Sandbox Magma', name: '熔岩', code: 'MGM', color: '#d0695b' },
]

export const DEMO_BOOKS = [
  { key: 'demo_a', title: '演示平台 A' },
  { key: 'demo_b', title: '演示平台 B' },
  { key: 'demo_c', title: '演示平台 C' },
  { key: 'demo_d', title: '演示平台 D' },
  { key: 'demo_e', title: '演示平台 E' },
  { key: 'demo_f', title: '演示平台 F' },
]

export const DEMO_PROVIDER = '演示数据 · 沙盘联赛'

const byKey = new Map(DEMO_TEAMS.map((team) => [team.key, team]))

export function demoTeam(key: string): DemoTeam | undefined {
  return byKey.get(key)
}

/** 固定种子的随机数：每次打开生成的演示数据都一样，页面之间的数字才对得上。 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY_MS = 86400000
const BEIJING_OFFSET_MS = 8 * 3600000

/** 北京时间某一天零点对应的时间戳；offsetDays 为 0 是今天，负数是过去。 */
export function beijingMidnight(reference: number, offsetDays = 0): number {
  return Math.floor((reference + BEIJING_OFFSET_MS) / DAY_MS) * DAY_MS - BEIJING_OFFSET_MS + offsetDays * DAY_MS
}

/** 把数值取整到 0.5 的倍数。 */
export function half(value: number): number {
  return Math.round(value * 2) / 2
}
