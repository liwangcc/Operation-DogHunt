// 演示用的盘口快照：格式与后端 GET /api/v1/odds 的返回完全一致，内容是虚构联赛的比赛和报价。
import type { OddsBoard, OddsBookmaker, OddsEvent } from '@/types/odds'
import { DEMO_BOOKS, DEMO_PROVIDER, DEMO_TEAMS, beijingMidnight, half, seeded } from './league'

const MINUTE = 60000
const HOUR = 3600000

let cached: OddsBoard | null = null

/** 每家平台在基准盘口上的偏移：多数一致，少数差半分，个别差一分。 */
function drift(roll: number): number {
  if (roll < 0.68) return 0
  if (roll < 0.81) return 0.5
  if (roll < 0.94) return -0.5
  return roll < 0.97 ? 1 : -1
}

/** 两侧赔率：抽水后合计略低于 2 × 1.95，偶尔向一侧倾斜。 */
function pricePair(rand: () => number): [number, number] {
  const tilt = (rand() - 0.5) * 0.12
  return [Math.round((1.91 + tilt) * 100) / 100, Math.round((1.91 - tilt) * 100) / 100]
}

function quotes(rand: () => number, home: string, away: string, homeLine: number, total: number, base: number): OddsBookmaker[] {
  const count = 4 + Math.floor(rand() * 3)
  const offset = Math.floor(rand() * DEMO_BOOKS.length)
  return Array.from({ length: count }, (_, index): OddsBookmaker => {
    const book = DEMO_BOOKS[(offset + index) % DEMO_BOOKS.length]
    const line = homeLine + drift(rand())
    const sum = total + drift(rand())
    const [homePrice, awayPrice] = pricePair(rand)
    const [overPrice, underPrice] = pricePair(rand)
    const updated = new Date(base - (2 + Math.floor(rand() * 9)) * MINUTE).toISOString()
    return {
      key: book.key,
      title: book.title,
      markets: [
        { key: 'spreads', updated_at: updated, outcomes: [{ selection: away, point: -line, price: awayPrice }, { selection: home, point: line, price: homePrice }] },
        { key: 'totals', updated_at: updated, outcomes: [{ selection: 'Over', point: sum, price: overPrice }, { selection: 'Under', point: sum, price: underPrice }] },
      ],
    }
  }).sort((a, b) => a.key.localeCompare(b.key))
}

/** 开赛时间：一场已到开赛时间、两场在今天稍后，其余排在之后几天的北京时间上午。 */
function schedule(base: number): number[] {
  const nextHalfHour = Math.ceil((base + 100 * MINUTE) / (30 * MINUTE)) * 30 * MINUTE
  const day = (offset: number, hour: number) => beijingMidnight(base, offset) + hour * HOUR
  return [
    Math.floor((base - 35 * MINUTE) / (30 * MINUTE)) * 30 * MINUTE,
    nextHalfHour,
    nextHalfHour + 150 * MINUTE,
    day(1, 8), day(1, 8.5), day(1, 10.5),
    day(2, 7.5), day(2, 10),
    day(3, 8),
    day(5, 9), day(5, 10.5),
  ]
}

export function demoBoard(): OddsBoard {
  if (cached) return cached
  const rand = seeded(20261111)
  const base = Date.now()
  const events: OddsEvent[] = schedule(base).map((time, index) => {
    // 第二场（最近的未开赛比赛）固定为赤狐客场对猎犬，示例对话讲的就是这一场。
    const homeIndex = index === 1 ? 0 : (index * 3 + 2) % DEMO_TEAMS.length
    const awayIndex = index === 1 ? 1 : (index * 3 + 5 + Math.floor(rand() * 3)) % DEMO_TEAMS.length
    const home = DEMO_TEAMS[homeIndex].key
    const away = DEMO_TEAMS[awayIndex === homeIndex ? (awayIndex + 1) % DEMO_TEAMS.length : awayIndex].key
    const homeLine = index === 1 ? -4.5 : half((rand() - 0.5) * 19) || -1.5
    const total = index === 1 ? 221.5 : half(207 + rand() * 30) + (rand() < 0.5 ? 0 : 0.5)
    return { id: `demo-${index + 1}`, commence_time: new Date(time).toISOString(), home_team: home, away_team: away, bookmakers: quotes(rand, home, away, homeLine, total, base) }
  }).sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))
  cached = {
    status: 'available',
    provider: DEMO_PROVIDER,
    fetched_at: new Date(base - 4 * MINUTE).toISOString(),
    stale: false,
    message: '演示数据',
    events,
    quota: null,
  }
  return cached
}
