// 示例对话：用演示盘口里“赤狐 对 猎犬”这一场拼出来的两轮问答，用来预览聊天的排版。没有调用模型。
import type { ChatMessage } from '@/types/api'
import type { OddsOutcome } from '@/types/odds'
import { signed } from '@/components/odds/format'
import { demoBoard } from './board'
import { demoTeam } from './league'

function odds(outcome: OddsOutcome | undefined): string {
  return outcome?.price?.toFixed(2) ?? '—'
}

export function demoTranscript(): ChatMessage[] {
  const event = demoBoard().events.find((item) => item.id === 'demo-2') ?? demoBoard().events[0]
  const book = event.bookmakers[0]
  const spreads = book.markets.find((market) => market.key === 'spreads')?.outcomes ?? []
  const totals = book.markets.find((market) => market.key === 'totals')?.outcomes ?? []
  const away = demoTeam(event.away_team)?.name ?? event.away_team
  const home = demoTeam(event.home_team)?.name ?? event.home_team
  const awaySpread = spreads.find((outcome) => outcome.selection === event.away_team)
  const homeSpread = spreads.find((outcome) => outcome.selection === event.home_team)
  const over = totals.find((outcome) => outcome.selection === 'Over')
  const under = totals.find((outcome) => outcome.selection === 'Under')
  const total = over?.point ?? 0

  return [
    { role: 'user', content: `帮我看看这场，让分和大小分分别怎么看？\n\n本次选场：${away} vs ${home} · ${book.title}` },
    {
      role: 'assistant',
      content: [
        `**先说结论**`,
        '',
        `- **让分**：观望。${home} ${signed(homeSpread?.point ?? 0)} 附近，正反两面的依据大致相当。`,
        `- **大小分**：倾向小分 ${total}，把握有限。`,
        '',
        `### 本次读取的报价（${book.title}）`,
        '',
        '| 玩法 | 方向 | 盘口 | 赔率 |',
        '| --- | --- | --- | --- |',
        `| 全场让分 | ${away}（客） | ${signed(awaySpread?.point ?? 0)} | ${odds(awaySpread)} |`,
        `| 全场让分 | ${home}（主） | ${signed(homeSpread?.point ?? 0)} | ${odds(homeSpread)} |`,
        `| 全场大小分 | 大分 | ${total} | ${odds(over)} |`,
        `| 全场大小分 | 小分 | ${total} | ${odds(under)} |`,
        '',
        '### 主要依据',
        '',
        `1. 两队近期的回合数都偏少，${home}主场更愿意打阵地战。`,
        `2. ${away}的外线出手占比高，命中率起伏大，这是让分方向最难判断的一点。`,
        `3. 总分线 ${total} 高于两队近 5 场的场均合计。`,
        '',
        '### 不确定因素',
        '',
        '- 保存的快照里没有伤病和出场资料，以上判断没有考虑轮换变化。',
        '- 报价来自保存的快照，不是实时行情；临场盘口可能已经变化。',
        '',
        '> 这是一段示例回答，用来预览排版。没有调用模型，球队和数字都是虚构的。',
      ].join('\n'),
    },
    { role: 'user', content: `只看大小分。如果${away}的主力后卫不上呢？` },
    {
      role: 'assistant',
      content: [
        '下面是**假设分析**，不是已确认的伤病信息：',
        '',
        `- ${away}少一个主要持球点，回合数大概率进一步下降，这一点支持小分。`,
        `- 但替补后卫的防守更弱，${home}的突破得分可能增加，会抵消一部分。`,
        '',
        `在这个假设下，我仍然倾向**小分 ${total}**，理由比刚才略充分一些；一旦确认他正常出场，就回到上一条的判断。`,
      ].join('\n'),
    },
  ]
}
