// 演示用的预测记录：虚构联赛约四个月的赛前判断。比分、盘口、方向都由固定种子的随机数生成，
// 赢输走盘与盈亏不写在数据里，统一由 domain/settlement.ts 现算，记录、统计、导出才对得上。
import type { Decision, Market, PredictionRecord, RecordSource } from '@/types/records'
import { DEMO_TEAMS, beijingMidnight, half, seeded } from './league'

const MINUTE = 60000
const HOUR = 3600000
/** 演示数据里，上线记录从多少天前开始；更早的算历史模拟。 */
const LIVE_DAYS = 56
/** 策略 v1.1 从多少天前启用。 */
const V11_DAYS = 26

/** 演示记录用的随机种子：挑了一组先跌后涨、总体小幅盈利的结果，方便看清每张图的样子；数字本身没有任何含义。 */
const DEMO_SEED = 565

export const DEMO_BOOKMAKER = '演示平台 A'
export const DEMO_MODEL = '演示模型'

type Rand = () => number

function choose<T>(rand: Rand, items: T[]): T {
  return items[Math.floor(rand() * items.length)]
}

function price(rand: Rand): number {
  return Math.round((1.84 + rand() * 0.14) * 100) / 100
}

function spreadReasons(rand: Rand, picked: string, other: string, line: number): string[] {
  const pool = [
    `${picked}近 5 场场均净胜 ${(2 + rand() * 6).toFixed(1)} 分，${other}同期为 ${(rand() * 4 - 2).toFixed(1)} 分`,
    `${other}处于背靠背第二场，上一场打到加时`,
    `盘口 ${line > 0 ? '+' : ''}${line}，${picked}近 10 场有 ${5 + Math.floor(rand() * 4)} 场的分差覆盖这个数值`,
    `两队节奏接近，替补得分的差距偏向${picked}`,
    `${picked}本季对阵同类防守体系的进攻效率高于自身均值`,
  ]
  const first = Math.floor(rand() * pool.length)
  return [pool[first], pool[(first + 1 + Math.floor(rand() * 3)) % pool.length]]
}

function totalReasons(rand: Rand, home: string, away: string, side: 'Over' | 'Under', line: number): string[] {
  const high = side === 'Over'
  const pool = [
    `两队近 5 场场均合计 ${(line + (high ? 1 : -1) * (2 + rand() * 6)).toFixed(1)} 分，${high ? '高于' : '低于'}本场总分线 ${line}`,
    `${home}的回合数排在联赛${high ? '前列' : '后段'}，预计本场回合${high ? '偏多' : '偏少'}`,
    `${away}近期防守效率${high ? '下滑' : '回升'}`,
    `双方上次交手合计 ${Math.round(line + (high ? 1 : -1) * (3 + rand() * 9))} 分`,
  ]
  const first = Math.floor(rand() * pool.length)
  return [pool[first], pool[(first + 1 + Math.floor(rand() * 2)) % pool.length]]
}

function risks(rand: Rand, team: string): string[] {
  return [choose(rand, [
    `${team}一名主力的出场状态尚未确认`,
    '报价采集时间距开赛较远，临场盘口可能变化',
    '没有取得伤病资料，只按已有信息判断',
    '近期样本只有 5 场，波动较大',
    '两队本季首次交手，没有可比的交手记录',
  ])]
}

const NOTES = [
  '第三节后段领先被追近，垃圾时间影响了最终分差。',
  '节奏比预想的慢，下半场双方都在打阵地战。',
  '主力提前休息，末节替补得分偏离了预期。',
  '加时把总分推高，常规时间其实低于总分线。',
  '判断方向没错，但盘口留的余量太少。',
]

interface Game {
  id: string
  day: number
  commence: number
  home: (typeof DEMO_TEAMS)[number]
  away: (typeof DEMO_TEAMS)[number]
  homeScore: number
  awayScore: number
  overtime: boolean
  finished: boolean
  cancelled: boolean
}

function makeGame(rand: Rand, base: number, day: number, index: number): Game {
  const homeIndex = Math.floor(rand() * DEMO_TEAMS.length)
  const awayRoll = Math.floor(rand() * (DEMO_TEAMS.length - 1))
  const awayIndex = awayRoll >= homeIndex ? awayRoll + 1 : awayRoll
  const commence = beijingMidnight(base, day) + (7.5 + Math.floor(rand() * 8) * 0.5) * HOUR
  const homeScore = 96 + Math.floor(rand() * 31)
  let awayScore = 96 + Math.floor(rand() * 31)
  // 常规时间打平就进加时，由客队多拿几分分出胜负。
  const overtime = homeScore === awayScore
  if (overtime) awayScore += 2 + Math.floor(rand() * 6)
  const finished = commence + 3 * HOUR < base
  return { id: `demo-g${day + 200}-${index}`, day, commence, home: DEMO_TEAMS[homeIndex], away: DEMO_TEAMS[awayIndex], homeScore, awayScore, overtime, finished, cancelled: finished && rand() < 0.025 }
}

function makeRecord(rand: Rand, game: Game, market: Market, sequence: number): PredictionRecord {
  const source: RecordSource = game.day < -LIVE_DAYS ? 'backtest' : rand() < 0.04 ? 'manual' : 'live'
  const strategy = game.day >= -V11_DAYS ? 'v1.1' : 'v1.0'
  const decisionRoll = rand()
  const decision: Decision = decisionRoll < 0.62 ? 'pick' : decisionRoll < 0.92 ? 'pass' : 'insufficient'
  // 演示数据里新策略略好于旧策略，只是为了让“按策略版本对比”有东西可看。
  const correct = rand() < (strategy === 'v1.1' ? 0.57 : 0.53)
  const homeLine = half((rand() - 0.5) * 18) || 1
  const totalLine = half(game.homeScore + game.awayScore + (rand() - 0.5) * 26)

  let selection: string | null = null
  let line: number | null = null
  let reasons: string[]
  let riskList: string[] = []
  if (decision === 'pick' && market === 'spreads') {
    const homeCovers = game.homeScore + homeLine - game.awayScore > 0
    const pickHome = correct === homeCovers
    const picked = pickHome ? game.home : game.away
    const other = pickHome ? game.away : game.home
    selection = picked.key
    line = pickHome ? homeLine : -homeLine
    reasons = spreadReasons(rand, picked.name, other.name, line)
    riskList = risks(rand, other.name)
  } else if (decision === 'pick') {
    const overWins = game.homeScore + game.awayScore > totalLine
    const side = correct === overWins ? 'Over' : 'Under'
    selection = side
    line = totalLine
    reasons = totalReasons(rand, game.home.name, game.away.name, side, totalLine)
    riskList = risks(rand, game.home.name)
  } else if (decision === 'pass') {
    reasons = [choose(rand, ['盘口附近看不出足够的优势，选择观望', '关键球员出场未定，暂不给方向', '正反两面的依据大致相当，不强行选择'])]
  } else {
    reasons = [choose(rand, ['参考平台没有开出这个玩法的报价', '没有取得可用的赛前资料'])]
  }

  const picked = decision === 'pick'
  const manual = source === 'manual'
  return {
    id: `P-${String(sequence).padStart(4, '0')}`,
    eventId: game.id,
    commenceTime: new Date(game.commence).toISOString(),
    homeTeam: game.home.key,
    awayTeam: game.away.key,
    market,
    decision,
    selection,
    line,
    price: picked ? price(rand) : null,
    bookmaker: DEMO_BOOKMAKER,
    // 人工补录是开赛后补上的，不算按时生成的赛前记录。
    generatedAt: new Date(game.commence + (manual ? 26 * HOUR : -(70 + Math.floor(rand() * 130)) * MINUTE)).toISOString(),
    lockedAt: manual ? null : new Date(game.commence - 60 * MINUTE).toISOString(),
    strategy,
    model: DEMO_MODEL,
    source,
    author: source === 'live' && picked && rand() < 0.08 ? 'user' : 'system',
    reasons,
    risks: riskList,
    final: game.finished && !game.cancelled ? { home: game.homeScore, away: game.awayScore, overtime: game.overtime } : null,
    voided: game.cancelled,
    note: picked && game.finished && !game.cancelled && rand() < 0.16 ? choose(rand, NOTES) : '',
  }
}

/** 用给定的种子生成一整套记录，按开赛时间从新到旧排列。 */
export function buildDemoRecords(seed: number): PredictionRecord[] {
  const rand = seeded(seed)
  const base = Date.now()
  const list: PredictionRecord[] = []
  let sequence = 0
  for (let day = -120; day <= 1; day += 1) {
    if (rand() < 0.3) continue
    const games = 1 + Math.floor(rand() * 3)
    for (let index = 0; index < games; index += 1) {
      const game = makeGame(rand, base, day, index)
      for (const market of ['spreads', 'totals'] as const) {
        sequence += 1
        list.push(makeRecord(rand, game, market, sequence))
      }
    }
  }
  return list.sort((a, b) => Date.parse(b.commenceTime) - Date.parse(a.commenceTime) || b.id.localeCompare(a.id))
}

let cached: PredictionRecord[] | null = null

export function demoRecords(): PredictionRecord[] {
  cached ??= buildDemoRecords(DEMO_SEED)
  return cached
}
