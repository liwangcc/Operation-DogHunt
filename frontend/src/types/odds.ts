export interface OddsOutcome { selection: string; point: number; price: number | null }
export interface OddsMarket { key: 'spreads' | 'totals'; updated_at: string | null; outcomes: OddsOutcome[] }
export interface OddsBookmaker { key: string; title: string; markets: OddsMarket[] }
export interface OddsEvent {
  id: string
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: OddsBookmaker[]
}
export interface OddsBoard {
  status: 'available' | 'empty' | 'unavailable'
  provider: string
  fetched_at: string | null
  stale: boolean
  message: string
  events: OddsEvent[]
  quota: { last: string | null; remaining: string | null; used: string | null } | null
}
