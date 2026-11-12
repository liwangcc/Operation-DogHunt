// 预测记录在界面上的叫法：结果、决定、来源的中文名与颜色，以及“方向 + 盘口”“盈亏”的写法。
import { signed, team } from '@/components/odds/format'
import type { Settlement } from '@/domain/settlement'
import type { Outcome, PredictionRecord, RecordSource } from '@/types/records'

/** 一条记录最终显示成哪种状态：五种结算结果，加上观望和数据不足。 */
export type RecordState = Outcome | 'pass' | 'insufficient'

export const STATE_LABEL: Record<RecordState, string> = { win: '赢盘', loss: '输盘', push: '走盘', void: '取消', pending: '待结算', pass: '观望', insufficient: '数据不足' }
export const STATE_TONE: Record<RecordState, string> = { win: 'tag--ok', loss: 'tag--bad', push: 'tag--violet', void: '', pending: 'tag--info', pass: '', insufficient: 'tag--warn' }
export const SOURCE_LABEL: Record<RecordSource, string> = { live: '赛前记录', backtest: '历史模拟', manual: '人工补录' }
export const MARKET_LABEL = { spreads: '让分', totals: '大小分' } as const

export function stateOf(record: PredictionRecord, settlement: Settlement | null): RecordState {
  if (record.decision !== 'pick') return record.decision
  return settlement?.outcome ?? 'pending'
}

/** 判断的方向和盘口，例如“猎犬 −4.5”“大分 221.5”；没有方向时是“观望”或“数据不足”。 */
export function pickText(record: PredictionRecord): string {
  if (record.decision === 'pass') return '观望'
  if (record.decision === 'insufficient' || record.selection === null || record.line === null) return '数据不足'
  if (record.market === 'spreads') return `${team(record.selection)[0]} ${signed(record.line)}`
  return `${record.selection === 'Over' ? '大分' : '小分'} ${record.line}`
}

export function matchup(record: PredictionRecord): string {
  return `${team(record.awayTeam)[0]} vs ${team(record.homeTeam)[0]}`
}

/** 带正负号、保留两位小数的单位数；用真正的减号。 */
export function units(value: number): string {
  const text = Math.abs(value).toFixed(2)
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text
}

export function percent(value: number | null, digits = 1): string {
  return value === null ? '—' : `${(value * 100).toFixed(digits)}%`
}

export function signedPercent(value: number | null): string {
  if (value === null) return '—'
  const text = `${Math.abs(value * 100).toFixed(1)}%`
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text
}
