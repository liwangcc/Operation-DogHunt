// 比赛卡片和“下一场开赛”共用的逻辑：当前选中的报价平台、是否已到开赛时间，以及把比赛交给 AI。
import { computed, ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { boardIsDemo } from '@/stores/demo'
import { oddsSelection, sampleChatRequested } from '@/stores/oddsSelection'
import { preferences } from '@/stores/preferences'
import { now } from '@/stores/system'
import type { OddsEvent } from '@/types/odds'
import { dateTime, team } from './format'
import { lineSpread } from './lines'

export function useMatch(event: Ref<OddsEvent>) {
  const router = useRouter()
  /** 用户在这张卡片上手动选的平台；没选过时按本机偏好，偏好的平台没有报价就用数据源返回的第一家。 */
  const selectedBook = ref('')
  const bookmaker = computed(() => {
    const books = event.value.bookmakers
    return books.find((book) => book.key === selectedBook.value) ?? books.find((book) => book.key === preferences.bookmaker) ?? books[0]
  })
  const started = computed(() => Date.parse(event.value.commence_time) <= now.value)
  const away = computed(() => team(event.value.away_team))
  const home = computed(() => team(event.value.home_team))
  const spreads = computed(() => lineSpread(event.value, 'spreads'))
  const totals = computed(() => lineSpread(event.value, 'totals'))

  /** 把比赛和平台标识带进聊天；不自动发送，也不调用模型。演示比赛改为打开示例对话。 */
  function analyze(): void {
    if (!bookmaker.value) return
    if (boardIsDemo.value) {
      sampleChatRequested.value = true
    } else {
      oddsSelection.value = {
        event_id: event.value.id,
        bookmaker_key: bookmaker.value.key,
        label: `${away.value[0]} vs ${home.value[0]} · ${dateTime(event.value.commence_time)} · ${bookmaker.value.title}`,
      }
    }
    void router.push('/')
  }

  return { selectedBook, bookmaker, started, away, home, spreads, totals, analyze }
}
