// UI 示例，不读取真实比赛，也不用于预测或效果统计。
export type RecordResult = 'pending' | 'win' | 'loss' | 'push' | 'void'
export type RecordMarket = 'spread' | 'total'

export interface RecordPreview {
  id: string
  day: string
  time: string
  away: string
  home: string
  market: RecordMarket
  pick: string
  odds: string
  platform: string
  recordedAt: string
  result: RecordResult
  score: string | null
  reason: string
  uncertainty: string
  note: string
}

export const marketLabels: Record<RecordMarket, string> = { spread: '让分', total: '大小分' }
export const resultLabels: Record<RecordResult, string> = {
  pending: '待结算', win: '赢盘', loss: '输盘', push: '走盘', void: '取消',
}

export const recordPreview: RecordPreview[] = [
  {
    id: 'DEMO-006', day: '2026-11-12', time: '11:00', away: '湖人', home: '勇士',
    market: 'total', pick: '小分 224.5', odds: '1.91', platform: 'DraftKings',
    recordedAt: '2026-11-11 21:30', result: 'pending', score: null,
    reason: '示例：预计双方更偏向半场进攻，因此选择小分，等待赛后对照实际节奏。',
    uncertainty: '示例：临场阵容与比赛节奏仍有不确定性。', note: '',
  },
  {
    id: 'DEMO-005', day: '2026-11-12', time: '08:30', away: '凯尔特人', home: '猛龙',
    market: 'spread', pick: '凯尔特人 -5.5', odds: '1.90', platform: 'DraftKings',
    recordedAt: '2026-11-11 20:15', result: 'pending', score: null,
    reason: '示例：看好客队的阵地进攻，但需要区分比赛获胜和赢下让分盘口。',
    uncertainty: '示例：核心球员上场时间尚不明确。', note: '',
  },
  {
    id: 'DEMO-004', day: '2026-11-11', time: '10:00', away: '掘金', home: '太阳',
    market: 'spread', pick: '掘金 -3.5', odds: '1.92', platform: 'FanDuel',
    recordedAt: '2026-11-10 22:10', result: 'win', score: '掘金 112 : 105 太阳',
    reason: '示例：选择客队让分，重点观察内线优势能否转化为稳定得分。',
    uncertainty: '示例：替补时段的失分可能影响分差。', note: '',
  },
  {
    id: 'DEMO-003', day: '2026-11-11', time: '09:00', away: '雄鹿', home: '公牛',
    market: 'total', pick: '大分 228.5', odds: '1.91', platform: 'DraftKings',
    recordedAt: '2026-11-10 21:45', result: 'loss', score: '雄鹿 110 : 108 公牛',
    reason: '示例：赛前预期转换进攻较多，选择大分。',
    uncertainty: '示例：若外线手感不佳，总分可能低于预期。',
    note: '示例复盘：高估了转换回合数。下次分析先核对两队近期节奏，再看得分表现。',
  },
  {
    id: 'DEMO-002', day: '2026-11-10', time: '08:30', away: '尼克斯', home: '热火',
    market: 'spread', pick: '尼克斯 -4', odds: '1.90', platform: 'FanDuel',
    recordedAt: '2026-11-09 20:00', result: 'push', score: '尼克斯 104 : 100 热火',
    reason: '示例：选择客队让分，比赛分差最终与记录盘口相同。',
    uncertainty: '示例：整数盘口可能出现走盘。', note: '',
  },
  {
    id: 'DEMO-001', day: '2026-11-10', time: '09:00', away: '独行侠', home: '火箭',
    market: 'total', pick: '小分 221.5', odds: '1.91', platform: 'DraftKings',
    recordedAt: '2026-11-09 19:30', result: 'void', score: null,
    reason: '示例：原有赛前判断保留，取消的记录单独展示。',
    uncertainty: '示例：取消原因与具体结算规则需要后续核对。', note: '',
  },
]
