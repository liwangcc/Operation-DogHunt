// 预测记录的数据结构，对应需求文档第 4.3、5、12 节。后端还没有这组接口，目前只有演示数据在用。

export type Market = 'spreads' | 'totals'
/** 一条记录的决定：给出方向、观望，或因资料不足无法判断。 */
export type Decision = 'pick' | 'pass' | 'insufficient'
/** 结算结果：赢盘、输盘、走盘、取消（无效）、待结算。 */
export type Outcome = 'win' | 'loss' | 'push' | 'void' | 'pending'
/** 记录的来历：上线后的真实赛前记录、历史模拟、人工补录，三者分开统计。 */
export type RecordSource = 'live' | 'backtest' | 'manual'

export interface FinalScore {
  home: number
  away: number
  overtime: boolean
}

export interface PredictionRecord {
  id: string
  eventId: string
  /** 开赛时间（UTC，ISO 格式）；界面按北京时间显示。 */
  commenceTime: string
  homeTeam: string
  awayTeam: string
  market: Market
  decision: Decision
  /** 让分：被选球队的英文名；大小分：Over 或 Under；观望与数据不足时为 null。 */
  selection: string | null
  /** 被选一方的盘口数值：让分带正负号，大小分是总分线。 */
  line: number | null
  /** 十进制赔率。 */
  price: number | null
  bookmaker: string
  generatedAt: string
  /** 正式记录锁定的时间；未锁定为 null。 */
  lockedAt: string | null
  /** 策略版本：一套具体的分析要求和选择规则。 */
  strategy: string
  model: string
  source: RecordSource
  /** 系统判断与个人判断分开保存、分开统计。 */
  author: 'system' | 'user'
  reasons: string[]
  risks: string[]
  /** 最终比分；未完场或取消时为 null。 */
  final: FinalScore | null
  /** 比赛取消或市场无效。 */
  voided: boolean
  note: string
}
