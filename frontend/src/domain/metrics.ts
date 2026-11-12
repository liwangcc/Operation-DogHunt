// 效果统计的指标：按需求文档第 14 节的定义从预测记录汇总，所有比例都带着样本数一起返回。
import type { PredictionRecord } from '@/types/records'
import { settle } from './settlement'

export interface Summary {
  /** 符合分析条件的比赛玩法数（给出方向 + 观望 + 数据不足）。 */
  analyzed: number
  picks: number
  passes: number
  insufficient: number
  wins: number
  losses: number
  pushes: number
  voids: number
  pending: number
  /** 已结算投入：赢、输、走盘各算 1 单位；取消和待结算不计。 */
  staked: number
  net: number
  /** 命中率 = 赢盘 ÷（赢盘 + 输盘）；没有样本时为 null。 */
  hitRate: number | null
  /** 命中率的 95% 区间（威尔逊区间），样本越少越宽。 */
  hitRange: [number, number] | null
  /** 模拟 ROI = 净盈亏 ÷ 已结算投入。 */
  roi: number | null
  /** 按这些记录的赔率，不赚不亏需要的命中率（各条 1 ÷ 十进制赔率的平均）。 */
  breakEven: number | null
  /** 选择覆盖率 = 给出方向的数量 ÷ 符合分析条件的数量。 */
  coverage: number | null
}

export interface EquityPoint {
  record: PredictionRecord
  pnl: number
  total: number
}

/** 威尔逊区间：小样本时比“比例 ± 误差”更稳妥。 */
function wilson(wins: number, decided: number): [number, number] | null {
  if (!decided) return null
  const z = 1.96
  const p = wins / decided
  const denominator = 1 + (z * z) / decided
  const centre = p + (z * z) / (2 * decided)
  const spread = z * Math.sqrt((p * (1 - p)) / decided + (z * z) / (4 * decided * decided))
  return [Math.max(0, (centre - spread) / denominator), Math.min(1, (centre + spread) / denominator)]
}

export function summarize(records: PredictionRecord[]): Summary {
  const summary: Summary = { analyzed: records.length, picks: 0, passes: 0, insufficient: 0, wins: 0, losses: 0, pushes: 0, voids: 0, pending: 0, staked: 0, net: 0, hitRate: null, hitRange: null, roi: null, breakEven: null, coverage: null }
  let breakEvenSum = 0
  for (const record of records) {
    if (record.decision === 'pass') summary.passes += 1
    else if (record.decision === 'insufficient') summary.insufficient += 1
    const result = settle(record)
    if (!result) continue
    summary.picks += 1
    if (result.outcome === 'void') summary.voids += 1
    else if (result.outcome === 'pending') summary.pending += 1
    else {
      if (result.outcome === 'win') summary.wins += 1
      else if (result.outcome === 'loss') summary.losses += 1
      else summary.pushes += 1
      summary.staked += 1
      summary.net += result.pnl ?? 0
      breakEvenSum += 1 / record.price!
    }
  }
  const decided = summary.wins + summary.losses
  summary.hitRate = decided ? summary.wins / decided : null
  summary.hitRange = wilson(summary.wins, decided)
  summary.roi = summary.staked ? summary.net / summary.staked : null
  summary.breakEven = summary.staked ? breakEvenSum / summary.staked : null
  summary.coverage = summary.analyzed ? summary.picks / summary.analyzed : null
  return summary
}

/** 累计模拟盈亏：只取已结算（赢、输、走盘）的记录，按开赛时间先后累加。 */
export function equityCurve(records: PredictionRecord[]): EquityPoint[] {
  const settled = records
    .map((record) => ({ record, result: settle(record) }))
    .filter((item) => item.result && item.result.pnl !== null && item.result.outcome !== 'void')
    .sort((a, b) => Date.parse(a.record.commenceTime) - Date.parse(b.record.commenceTime))
  let total = 0
  return settled.map(({ record, result }) => {
    total += result!.pnl!
    return { record, pnl: result!.pnl!, total }
  })
}

export interface Bucket {
  key: string
  label: string
  summary: Summary
}

/** 把记录按某个键分组后分别汇总，保持分组第一次出现的顺序。 */
export function groupSummaries(records: PredictionRecord[], keyOf: (record: PredictionRecord) => { key: string; label: string }): Bucket[] {
  const groups = new Map<string, { label: string; records: PredictionRecord[] }>()
  for (const record of records) {
    const { key, label } = keyOf(record)
    if (!groups.has(key)) groups.set(key, { label, records: [] })
    groups.get(key)!.records.push(record)
  }
  return Array.from(groups, ([key, group]) => ({ key, label: group.label, summary: summarize(group.records) }))
}
