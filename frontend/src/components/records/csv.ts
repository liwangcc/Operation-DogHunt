// 把预测记录导出成 CSV（可以用 Excel 打开的表格文件），内容与页面上筛选后的列表一致。
import { dateTime, team } from '@/components/odds/format'
import { settle } from '@/domain/settlement'
import type { PredictionRecord } from '@/types/records'
import { MARKET_LABEL, SOURCE_LABEL, STATE_LABEL, pickText, stateOf } from './labels'

/** 文件开头的字节顺序标记（BOM）和表格文件惯用的换行。 */
const BOM = String.fromCharCode(0xfeff)
const LINE_BREAK = String.fromCharCode(13, 10)

function cell(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function recordsToCsv(records: PredictionRecord[], demo: boolean): string {
  const header = ['数据性质', '记录编号', '开赛时间（北京）', '客队', '主队', '玩法', '判断', '盘口数值', '十进制赔率', '参考平台', '生成时间（北京）', '锁定时间（北京）', '策略版本', '记录来源', '判断来源', '客队得分', '主队得分', '结果', '模拟盈亏（单位）']
  const rows = records.map((record) => {
    const settlement = settle(record)
    return [
      demo ? '演示数据（虚构）' : '真实记录',
      record.id,
      dateTime(record.commenceTime),
      team(record.awayTeam)[0],
      team(record.homeTeam)[0],
      MARKET_LABEL[record.market],
      pickText(record),
      record.line,
      record.price,
      record.bookmaker,
      dateTime(record.generatedAt),
      record.lockedAt ? dateTime(record.lockedAt) : '未锁定',
      record.strategy,
      SOURCE_LABEL[record.source],
      record.author === 'system' ? '系统判断' : '个人判断',
      record.final?.away ?? null,
      record.final?.home ?? null,
      STATE_LABEL[stateOf(record, settlement)],
      settlement?.pnl == null ? null : settlement.pnl.toFixed(2),
    ].map(cell).join(',')
  })
  // 开头的 BOM 让 Excel 按 UTF-8 打开，中文不会乱码。
  return BOM + [header.join(','), ...rows].join(LINE_BREAK)
}

export function downloadCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
