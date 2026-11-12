// 赛后结算与模拟盈亏：按需求文档第 13 节的规则计算，不依赖界面，也不区分演示还是真实记录。
import type { Outcome, PredictionRecord } from '@/types/records'

export interface Settlement {
  outcome: Outcome
  /** 结算差值：大于 0 赢盘，小于 0 输盘，等于 0 走盘；未结算时为 null。 */
  margin: number | null
  /** 固定投入 1 单位时的净盈亏；未结算时为 null。 */
  pnl: number | null
}

/** 让分：结算差值 = 被选球队得分 + 该球队盘口数值 − 对手得分。 */
export function spreadMargin(teamScore: number, line: number, opponentScore: number): number {
  return teamScore + line - opponentScore
}

/** 大小分：选大分时为总分 − 总分线，选小分时相反。 */
export function totalMargin(side: 'Over' | 'Under', line: number, total: number): number {
  return side === 'Over' ? total - line : line - total
}

/** 固定 1 单位的模拟净盈亏：赢盘为十进制赔率 − 1，输盘 −1，走盘和取消为 0。 */
export function unitPnl(outcome: Outcome, price: number): number | null {
  if (outcome === 'win') return price - 1
  if (outcome === 'loss') return -1
  if (outcome === 'push' || outcome === 'void') return 0
  return null
}

/** 只有给出方向的记录才会结算；观望和数据不足返回 null。 */
export function settle(record: PredictionRecord): Settlement | null {
  if (record.decision !== 'pick' || record.selection === null || record.line === null || record.price === null) return null
  if (record.voided) return { outcome: 'void', margin: null, pnl: 0 }
  if (!record.final) return { outcome: 'pending', margin: null, pnl: null }
  const { home, away } = record.final
  const margin = record.market === 'spreads'
    ? (record.selection === record.homeTeam ? spreadMargin(home, record.line, away) : spreadMargin(away, record.line, home))
    : totalMargin(record.selection === 'Over' ? 'Over' : 'Under', record.line, home + away)
  const outcome: Outcome = margin > 0 ? 'win' : margin < 0 ? 'loss' : 'push'
  return { outcome, margin, pnl: unitPnl(outcome, record.price) }
}
