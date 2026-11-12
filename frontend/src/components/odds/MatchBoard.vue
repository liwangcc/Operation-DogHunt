<script setup lang="ts">
// 比赛与盘口：读取后端保存的最新快照，按北京时间的日期筛选和分组；手动更新盘口；没有真实比赛时可用演示盘口预览。
import { computed, onMounted, ref } from 'vue'
import DemoRibbon from '@/components/common/DemoRibbon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { boardIsDemo, demoEnabled, setDemo, shownBoard } from '@/stores/demo'
import { board, boardBusy, boardStale, loadBoard, now, refreshBoard, refreshCooldown } from '@/stores/system'
import { beijingDay, dateTime } from './format'
import MatchCard from './MatchCard.vue'
import NextTip from './NextTip.vue'

type FilterKey = 'today' | 'tomorrow' | 'week' | 'all'

const filter = ref<FilterKey>('week')
const today = computed(() => beijingDay(new Date(now.value)))
const tomorrow = computed(() => beijingDay(new Date(now.value + 86400000)))
const weekEnd = computed(() => beijingDay(new Date(now.value + 6 * 86400000)))
const events = computed(() => shownBoard.value?.events ?? [])

function inFilter(key: FilterKey, commence: string): boolean {
  const date = beijingDay(commence)
  if (key === 'today') return date === today.value
  if (key === 'tomorrow') return date === tomorrow.value
  if (key === 'week') return date >= today.value && date <= weekEnd.value
  return true
}

const tabs = computed(() => ([['today', '今天'], ['tomorrow', '明天'], ['week', '近 7 天'], ['all', '全部已开盘']] as const)
  .map(([key, label]) => ({ key, label, count: events.value.filter((event) => inFilter(key, event.commence_time)).length })))
const visibleEvents = computed(() => events.value.filter((event) => inFilter(filter.value, event.commence_time)))
const upcoming = computed(() => visibleEvents.value.filter((event) => Date.parse(event.commence_time) > now.value).length)
/** 最近一场还没到开赛时间的比赛，不受日期筛选影响。 */
const nextEvent = computed(() => events.value.filter((event) => Date.parse(event.commence_time) > now.value)
  .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))[0])
const groups = computed(() => {
  const days = new Map<string, typeof visibleEvents.value>()
  for (const event of visibleEvents.value) {
    const day = beijingDay(event.commence_time)
    if (!days.has(day)) days.set(day, [])
    days.get(day)!.push(event)
  }
  return Array.from(days, ([day, list]) => ({ day, events: list }))
})
/** 演示盘口生效时，真实后端到底是什么情况，如实写在提示带里。 */
const realState = computed(() => `真实状态：${board.error || board.data?.message || '后端没有可显示的比赛'}`)
const stale = computed(() => !boardIsDemo.value && boardStale.value)

function dayLabel(day: string) {
  const label = day === today.value ? '今天' : day === tomorrow.value ? '明天' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long' }).format(new Date(`${day}T12:00:00+08:00`))
  return { date: day.slice(5).replace('-', ' / '), label }
}

onMounted(() => {
  // 每次进入页面重新读一遍本机保存的快照，不向供应商取新数据。
  void loadBoard()
})
</script>

<template>
  <section class="page match-board" aria-labelledby="matches-heading" :aria-busy="boardBusy">
    <header class="page-head reveal">
      <div>
        <p class="overline">Station 02 · Match Center</p>
        <h1 id="matches-heading" class="page-title">比赛与盘口</h1>
        <p class="page-sub">从今天，看到下一场。</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn" :disabled="boardBusy" @click="loadBoard()">{{ board.loading ? '读取中…' : '重新读取' }}</button>
        <button type="button" class="btn btn--primary" :disabled="boardBusy || refreshCooldown > 0" @click="refreshBoard()">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="{ spinning: board.refreshing }"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.6h-2.6" /></svg>
          {{ board.refreshing ? '正在更新…' : refreshCooldown > 0 ? `${refreshCooldown}s 后可更新` : '更新盘口' }}
        </button>
      </div>
    </header>

    <DemoRibbon v-if="boardIsDemo" class="reveal" :reason="realState" />

    <dl class="source reveal" style="--i: 1">
      <div><dt>数据源</dt><dd>{{ shownBoard?.provider ?? 'The Odds API' }}</dd></div>
      <div><dt>时区</dt><dd>北京时间 UTC+8</dd></div>
      <div>
        <dt>采集</dt>
        <dd>
          <span class="num">{{ shownBoard?.fetched_at ? dateTime(shownBoard.fetched_at) : '尚无数据' }}</span>
          <span v-if="shownBoard?.fetched_at" class="tag" :class="stale ? 'tag--warn' : 'tag--ok'">{{ stale ? '待更新' : '已保存' }}</span>
        </dd>
      </div>
      <div v-if="!boardIsDemo && board.data?.quota?.remaining != null"><dt>接口额度</dt><dd class="num">剩余 {{ board.data.quota.remaining }}</dd></div>
    </dl>

    <div v-if="!boardIsDemo" class="alerts">
      <p v-if="board.error" class="alert alert--bad" role="alert">{{ board.error }}<template v-if="board.data?.events.length"> 当前仍显示原有快照，采集时间见上方。</template></p>
      <p v-else-if="board.refreshed" class="alert alert--ok" role="status">更新成功，已保存 {{ board.data?.events.length ?? 0 }} 场比赛。<template v-if="board.data?.quota?.last != null">本次消耗 {{ board.data.quota.last }} credits。</template></p>
      <p v-if="stale" class="alert alert--warn">采集已超过 15 分钟或时间异常，以下为保存的赛前报价，请手动更新。</p>
    </div>

    <div v-if="!shownBoard && board.loading" class="match-grid" role="status" aria-label="正在读取比赛数据">
      <div v-for="index in 4" :key="index" class="card-skeleton panel"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    </div>
    <EmptyState v-else-if="!shownBoard || shownBoard.status === 'unavailable'" title="比赛数据暂时不可用" tone="warn">
      <p>{{ board.data?.message ?? '请检查后端连接，然后重新读取。' }}</p>
      <template #actions>
        <button type="button" class="btn" :disabled="boardBusy" @click="loadBoard()">重新读取</button>
        <button v-if="!demoEnabled" type="button" class="btn btn--amber" @click="setDemo(true)">用演示数据预览界面</button>
      </template>
    </EmptyState>
    <template v-else>
      <NextTip v-if="nextEvent" :key="nextEvent.id" class="reveal" style="--i: 2" :event="nextEvent" :now="now" />

      <div class="toolbar reveal" style="--i: 3">
        <div class="seg" role="group" aria-label="比赛日期筛选">
          <button v-for="tab in tabs" :key="tab.key" type="button" :aria-pressed="filter === tab.key" @click="filter = tab.key">{{ tab.label }}<span class="seg-count">{{ tab.count }}</span></button>
        </div>
        <span class="match-count num">{{ visibleEvents.length }} 场<template v-if="visibleEvents.length"> · {{ upcoming }} 场未到开赛时间</template></span>
      </div>

      <EmptyState v-if="!visibleEvents.length" title="当前筛选下暂无已保存的比赛">
        <p>数据源只覆盖已开盘比赛，不代表当天没有比赛。可以切换“明天”“近 7 天”，或手动更新。</p>
      </EmptyState>
      <div v-else class="match-days">
        <section v-for="group in groups" :key="group.day" :aria-label="`${group.day}的比赛`">
          <h2 class="day-heading"><span class="day-date">{{ dayLabel(group.day).date }}</span>{{ dayLabel(group.day).label }}<small>{{ group.events.length }} 场比赛</small></h2>
          <div class="match-grid"><MatchCard v-for="event in group.events" :key="event.id" :event="event" :now="now" /></div>
        </section>
      </div>
    </template>

    <ul class="notes">
      <li>手动更新，每次通常消耗 2 credits（接口额度）。打开页面与切换日期不取新数据。</li>
      <li>选好报价平台后点“交给 AI 分析”带入聊天；也可以直接在 NBA 助手里询问已保存的比赛。</li>
      <li>仅展示数据源已开盘的比赛，非完整赛程；未接入实时比分。默认平台来自本机偏好或数据源的第一家，不代表推荐。让分正负号对应具体球队；大小分为全场总分；赔率内部为十进制，显示方式可在设置里切换。</li>
    </ul>
  </section>
</template>

<style scoped>
.source { display: flex; flex-wrap: wrap; gap: 0; margin: 0 0 22px; border: 1px solid var(--line); border-radius: var(--radius); background: rgba(8, 19, 33, .55); }
.source > div { display: flex; align-items: center; gap: 12px; padding: 9px 18px; border-right: 1px solid var(--line); }
.source > div:last-child { border-right: 0; }
.source dt { font-size: 11px; letter-spacing: .2em; color: var(--text-3); white-space: nowrap; }
.source dd { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 13px; white-space: nowrap; }
.alerts { display: grid; gap: 8px; margin-bottom: 22px; }
.alerts:empty { display: none; }

.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
.match-count { font-size: 12px; color: var(--text-3); white-space: nowrap; }
.day-heading { display: flex; align-items: baseline; gap: 12px; margin: 26px 0 14px; font-size: 15px; font-weight: 600; letter-spacing: .1em; }
.day-date { font-size: 22px; font-style: italic; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: 0; }
.day-heading small { font-size: 12px; font-weight: 400; letter-spacing: .06em; color: var(--text-3); }
.day-heading::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--line-2), transparent); }
.match-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.card-skeleton { display: grid; gap: 14px; padding: 20px; }
.card-skeleton .skeleton { height: 22px; }
.card-skeleton .skeleton:nth-child(2) { height: 54px; }
.card-skeleton .skeleton:nth-child(3) { height: 120px; }
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.notes { display: grid; gap: 6px; margin: 34px 0 0; padding: 16px 0 0 18px; border-top: 1px solid var(--line); font-size: 12px; line-height: 1.8; color: var(--text-3); }
@media (min-width: 1700px) {
  .match-board { max-width: 1680px; }
  .match-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .match-grid { grid-template-columns: 1fr; }
}
@media (max-width: 700px) {
  .source > div { flex: 1 1 100%; justify-content: space-between; border-right: 0; border-bottom: 1px solid var(--line); padding: 8px 14px; }
  .source > div:last-child { border-bottom: 0; }
  .page-actions { width: 100%; }
  .page-actions .btn { flex: 1; }
}
</style>
