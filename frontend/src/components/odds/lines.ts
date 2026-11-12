// 一场比赛的报价整理：取某家平台某个玩法的报价，以及同一玩法在各家平台的盘口数值分布。
// 只做归类和计数，不求平均、不拼接出任何一家平台都没有开过的报价。
import type { OddsBookmaker, OddsEvent, OddsMarket, OddsOutcome } from '@/types/odds'

export type MarketKind = 'spreads' | 'totals'

export function marketOf(book: OddsBookmaker | undefined, kind: MarketKind): OddsMarket | undefined {
  return book?.markets.find((market) => market.key === kind)
}

export function outcomeOf(market: OddsMarket | undefined, selection: string): OddsOutcome | undefined {
  return market?.outcomes.find((outcome) => outcome.selection === selection)
}

export interface LineColumn {
  /** 盘口数值：让分是主队的数值，大小分是总分线。 */
  point: number
  books: { key: string; title: string }[]
}

export interface LineSpread {
  /** 按数值从小到大排列，只包含至少有一家平台开出的数值。 */
  columns: LineColumn[]
  /** 开出这个玩法的平台数。 */
  count: number
  /** 平台数最多的那个数值；并列时取数值较小的。 */
  mode: LineColumn | null
}

export function lineSpread(event: OddsEvent, kind: MarketKind): LineSpread {
  const byPoint = new Map<number, LineColumn>()
  for (const book of event.bookmakers) {
    const market = marketOf(book, kind)
    const outcome = kind === 'spreads' ? outcomeOf(market, event.home_team) : outcomeOf(market, 'Over') ?? market?.outcomes[0]
    if (!outcome) continue
    if (!byPoint.has(outcome.point)) byPoint.set(outcome.point, { point: outcome.point, books: [] })
    byPoint.get(outcome.point)!.books.push({ key: book.key, title: book.title })
  }
  const columns = Array.from(byPoint.values()).sort((a, b) => a.point - b.point)
  let mode: LineColumn | null = null
  for (const column of columns) if (!mode || column.books.length > mode.books.length) mode = column
  return { columns, count: columns.reduce((sum, column) => sum + column.books.length, 0), mode }
}
