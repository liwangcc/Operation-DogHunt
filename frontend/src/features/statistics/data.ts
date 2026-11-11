// UI 演示专用，不能写入正式预测；接入后端时替换数据入口。
export type Market = 'spreads' | 'totals'
export type Outcome = 'win' | 'loss' | 'push' | 'pending' | 'cancelled' | 'watch' | 'insufficient'
export type RecordSource = 'pregame' | 'manual'
export interface StatisticsRecord {
  id: string
  date: string
  market: Market
  outcome: Outcome
  odds: number
  version: 'v1' | 'v2'
  source: RecordSource
}
export interface DailyProfit { date: string; profit: number; cumulative: number; settled: number }

export const DEMO_END = '2026-11-12'
export function offsetDay(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
const round = (value: number) => Math.round(value * 10000) / 10000

export function profitOf(record: StatisticsRecord) {
  return record.outcome === 'win' ? round(record.odds - 1) : record.outcome === 'loss' ? -1 : 0
}

export function summarize(records: readonly StatisticsRecord[]) {
  const count = (outcome: Outcome) => records.filter(record => record.outcome === outcome).length
  const wins = count('win'), losses = count('loss'), pushes = count('push')
  const settled = wins + losses + pushes
  const profit = round(records.reduce((total, record) => total + profitOf(record), 0))
  return {
    wins, losses, pushes, settled, profit,
    pending: count('pending'), cancelled: count('cancelled'), watch: count('watch'), insufficient: count('insufficient'),
    hitRate: wins + losses ? wins / (wins + losses) * 100 : null,
    roi: settled ? profit / settled * 100 : null,
  }
}

export function dailyProfits(records: readonly StatisticsRecord[], start: string, end: string): DailyProfit[] {
  const byDate = new Map<string, StatisticsRecord[]>()
  for (const record of records) {
    if (!byDate.has(record.date)) byDate.set(record.date, [])
    byDate.get(record.date)!.push(record)
  }
  const points: DailyProfit[] = []
  let cumulative = 0
  for (let day = start; day <= end; day = offsetDay(day, 1)) {
    const summary = summarize(byDate.get(day) ?? [])
    cumulative = round(cumulative + summary.profit)
    points.push({ date: day, profit: summary.profit, cumulative, settled: summary.settled })
  }
  return points
}

function createDemoRecords(): StatisticsRecord[] {
  const records: StatisticsRecord[] = []
  for (const market of ['spreads', 'totals'] as const) {
    let winCount = 0
    for (let index = 0; index < 50; index++) {
      const win = (index * 17 + (market === 'spreads' ? 21 : 23)) % 50 < (market === 'spreads' ? 30 : 28)
      if (win) winCount++
      records.push({
        id: `demo-${market}-${index}`, date: offsetDay(DEMO_END, -29 + Math.floor(index * 30 / 50)), market,
        outcome: win ? 'win' : 'loss', odds: win && winCount <= 4 ? 1.7 : 1.9,
        version: index % 3 === 0 ? 'v2' : 'v1', source: 'pregame',
      })
    }
  }
  // 更早的样本及特殊状态用于预览时间筛选、走盘和零样本。
  for (let index = 0; index < 60; index++) {
    records.push({ id: `demo-older-${index}`, date: offsetDay(DEMO_END, -59 + Math.floor(index / 2)),
      market: index % 2 ? 'totals' : 'spreads', outcome: index % 7 === 0 ? 'push' : index % 3 === 0 ? 'win' : 'loss',
      odds: 1.9, version: 'v1', source: index % 8 === 0 ? 'manual' : 'pregame' })
  }
  const states: Outcome[] = ['pending', 'pending', 'pending', 'pending', 'pending', 'cancelled', 'cancelled',
    'watch', 'watch', 'watch', 'watch', 'watch', 'watch', 'watch', 'watch', 'insufficient', 'insufficient', 'insufficient']
  states.forEach((outcome, index) => records.push({
    id: `demo-state-${index}`, date: offsetDay(DEMO_END, -index % 5), market: index % 2 ? 'totals' : 'spreads',
    outcome, odds: 1.9, version: 'v1', source: 'pregame',
  }))
  return records.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

export const demoRecords = createDemoRecords()
