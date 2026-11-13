<script setup lang="ts">
// 聊天的起始画面：一句引导、三步流程、几个可以直接填进输入框的问题，以及从已保存的比赛里选一场开始。
import { computed } from 'vue'
import TeamMark from '@/components/common/TeamMark.vue'
import ChatHologram from './ChatHologram.vue'
import { beijingDay, clockTime, dateTime, team } from '@/components/odds/format'
import { demoEnabled } from '@/stores/demo'
import { oddsSelection } from '@/stores/oddsSelection'
import { preferences } from '@/stores/preferences'
import { board, now } from '@/stores/system'
import type { OddsEvent } from '@/types/odds'

const emit = defineEmits<{ prompt: [text: string]; picked: []; sample: [] }>()

const PROMPTS = [
  { tag: '列比赛', text: '按北京时间列出已保存的比赛，以及每场的让分和大小分。' },
  { tag: '比平台', text: '已保存的比赛里，哪几场各平台开出的让分差别最大？' },
  { tag: '查资料', text: '明天的比赛里，哪些还缺分析需要的资料？缺的是什么？' },
]

/** 只列真实快照里还没到开赛时间的比赛；演示盘口不能交给后端。 */
const upcoming = computed(() => (board.data?.events ?? [])
  .filter((event) => Date.parse(event.commence_time) > now.value && event.bookmakers.length)
  .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))
  .slice(0, 4))

function dayLabel(event: OddsEvent): string {
  const day = beijingDay(event.commence_time)
  if (day === beijingDay(new Date(now.value))) return '今天'
  if (day === beijingDay(new Date(now.value + 86400000))) return '明天'
  return day.slice(5).replace('-', '/')
}

/** 选中一场比赛：平台按本机偏好，没有就用数据源返回的第一家。只是带入选择，不发送。 */
function pick(event: OddsEvent): void {
  const book = event.bookmakers.find((item) => item.key === preferences.bookmaker) ?? event.bookmakers[0]
  oddsSelection.value = {
    event_id: event.id,
    bookmaker_key: book.key,
    label: `${team(event.away_team)[0]} vs ${team(event.home_team)[0]} · ${dateTime(event.commence_time)} · ${book.title}`,
  }
  emit('picked')
}
</script>

<template>
  <div class="welcome">
    <div class="welcome-top">
      <div>
        <p class="overline reveal"><b>01</b>战术桌</p>
        <h1 class="welcome-title reveal" style="--i: 1">从一场比赛开始。</h1>
        <p class="welcome-sub reveal" style="--i: 2">直接询问已保存的比赛，或去<RouterLink to="/matches" class="link">比赛与盘口</RouterLink>选一场再聊。</p>
      </div>
      <ChatHologram class="welcome-holo reveal" style="--i: 2" />
    </div>

    <ol class="flow reveal" style="--i: 3" aria-label="当前可用的聊天流程">
      <li><span>01</span><strong>查看或询问比赛</strong><small>在比赛页选场，或直接问日期和球队</small></li>
      <li><span>02</span><strong>结合盘口分析</strong><small>读取已保存的报价，说明来源与数据时间</small></li>
      <li><span>03</span><strong>继续追问</strong><small>在本页保留对话，讨论条件变化</small></li>
    </ol>

    <div class="starts reveal" style="--i: 4">
      <section aria-labelledby="start-ask">
        <h2 id="start-ask" class="label">直接提问 · 点一下填进输入框</h2>
        <button v-for="prompt in PROMPTS" :key="prompt.tag" type="button" class="start-item" @click="emit('prompt', prompt.text)">
          <span class="start-tag">{{ prompt.tag }}</span><span class="start-text">{{ prompt.text }}</span><span class="start-arrow" aria-hidden="true">→</span>
        </button>
      </section>
      <section aria-labelledby="start-pick">
        <h2 id="start-pick" class="label">从已保存的比赛开始</h2>
        <template v-if="upcoming.length">
          <button v-for="event in upcoming" :key="event.id" type="button" class="start-item match" @click="pick(event)">
            <span class="start-time"><small>{{ dayLabel(event) }}</small>{{ clockTime(event.commence_time) }}</span>
            <span class="start-teams"><TeamMark :name="event.away_team" size="sm" />{{ team(event.away_team)[0] }}<i>VS</i>{{ team(event.home_team)[0] }}<TeamMark :name="event.home_team" size="sm" /></span>
            <span class="start-arrow" aria-hidden="true">→</span>
          </button>
        </template>
        <div v-else class="start-none">
          <p>{{ board.loading ? '正在读取已保存的比赛…' : '后端还没有可选的比赛。去比赛与盘口手动更新一次，这里就会列出最近的几场。' }}</p>
          <div class="start-none-actions">
            <RouterLink to="/matches" class="btn btn--sm">前往比赛与盘口</RouterLink>
            <button v-if="demoEnabled" type="button" class="btn btn--sm btn--amber" @click="emit('sample')">看一段示例对话</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.welcome { container-type: inline-size; width: 100%; max-width: 920px; margin: auto; padding: 28px 0 20px; }
/* 全息战术板垫在标题右后方；地方不够宽时不显示。 */
.welcome-top { position: relative; min-height: 150px; }
.welcome-top > div { position: relative; z-index: 1; }
.welcome-top .welcome-holo { position: absolute; top: -58px; right: -18px; }
.welcome-title { margin: 14px 0 0; font-size: clamp(28px, 3.4vw, 42px); font-weight: 600; letter-spacing: .06em; line-height: 1.2; color: var(--text); }
.welcome-sub { margin: 14px 0 0; font-size: 15px; color: var(--text-2); }

.flow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; margin: 26px 0 0; padding: 0; border-top: 1px solid var(--line-2); border-bottom: 1px solid var(--line); list-style: none; }
.flow li { position: relative; display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; padding: 14px 18px 14px 0; }
.flow li + li { padding-left: 18px; border-left: 1px solid var(--line); }
.flow span { grid-row: span 2; align-self: start; padding-top: 1px; font-family: var(--font-num); font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: .04em; color: var(--cyan); }
.flow strong { font-size: 14px; font-weight: 600; letter-spacing: .04em; }
.flow small { font-size: 12px; line-height: 1.6; color: var(--text-3); }

.starts { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 26px; }
.starts h2 { margin: 0 0 10px; font-weight: 400; }
.start-item {
  display: flex; align-items: center; gap: 12px; width: 100%; margin-bottom: 6px; padding: 11px 12px 11px 14px; border: 1px solid var(--line); border-radius: var(--radius);
  background: rgba(13, 19, 25, .72); color: var(--text-2); font-size: 13px; line-height: 1.6; text-align: left;
  transition: color .14s, background .14s, border-color .14s;
}
.start-item:hover { border-color: var(--line-3); background: rgba(21, 31, 39, .82); color: var(--text); }
.start-tag { flex: 0 0 auto; min-width: 46px; font-size: 12px; letter-spacing: .08em; color: var(--cyan); }
.start-text { flex: 1; min-width: 0; }
.start-arrow { flex: 0 0 auto; color: var(--text-3); transition: color .14s; }
.start-item:hover .start-arrow { color: var(--cyan); }
.start-time { display: flex; flex: 0 0 auto; align-items: baseline; gap: 8px; min-width: 88px; font-family: var(--font-num); font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: .03em; color: var(--text); }
.start-time small { font-family: var(--font-sans); font-size: 11px; font-weight: 400; letter-spacing: .06em; color: var(--text-3); }
.start-teams { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; font-size: 14px; color: var(--text); white-space: nowrap; overflow: hidden; }
.start-teams i { font-family: var(--font-num); font-size: 10px; font-style: normal; font-weight: 500; letter-spacing: .12em; color: var(--text-3); }
.start-none { padding: 16px; border: 1px dashed var(--line-2); border-radius: var(--radius); font-size: 13px; line-height: 1.8; color: var(--text-2); }
.start-none p { margin: 0; }
.start-none-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }

@container (max-width: 780px) {
  .welcome-top { min-height: 0; }
  .welcome-top .welcome-holo { display: none; }
}
@media (max-width: 900px) {
  .starts { grid-template-columns: 1fr; }
}
@media (max-width: 700px) {
  .flow { grid-template-columns: 1fr; }
  .flow li, .flow li + li { padding: 10px 0; border-left: 0; border-bottom: 1px solid var(--line); }
  .flow li:last-child { border-bottom: 0; }
  .start-teams .team-mark { display: none; }
}
</style>
