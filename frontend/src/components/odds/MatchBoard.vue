<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getOdds } from '@/api/odds'
import type { OddsBoard } from '@/types/odds'
import MatchCard from './MatchCard.vue'
import { beijingDay, dateTime } from './format'

const data = ref<OddsBoard | null>(null)
const loading = ref(false)
const refreshing = ref(false)
const error = ref('')
const refreshed = ref(false)
const now = ref(Date.now())
const nextRefreshAt = ref(0)
const filter = ref('week')
const tabs = [{ key: 'today', label: '今天' }, { key: 'tomorrow', label: '明天' }, { key: 'week', label: '近 7 天' }, { key: 'all', label: '全部已开盘' }]
const today = computed(() => beijingDay(new Date(now.value)))
const tomorrow = computed(() => beijingDay(new Date(now.value + 86400000)))
const weekEnd = computed(() => beijingDay(new Date(now.value + 6 * 86400000)))
const busy = computed(() => loading.value || refreshing.value)
const cooldown = computed(() => Math.max(0, Math.ceil((nextRefreshAt.value - now.value) / 1000)))
const stale = computed(() => !!data.value?.fetched_at && (data.value.stale || now.value - Date.parse(data.value.fetched_at) > 15 * 60 * 1000))
const visibleEvents = computed(() => (data.value?.events ?? []).filter(event => {
  const date = beijingDay(event.commence_time)
  if (filter.value === 'today') return date === today.value
  if (filter.value === 'tomorrow') return date === tomorrow.value
  if (filter.value === 'week') return date >= today.value && date <= weekEnd.value
  return true
}))
const upcoming = computed(() => visibleEvents.value.filter(event => Date.parse(event.commence_time) > now.value).length)
const groups = computed(() => {
  const days = new Map<string, typeof visibleEvents.value>()
  for (const event of visibleEvents.value) {
    const day = beijingDay(event.commence_time)
    if (!days.has(day)) days.set(day, [])
    days.get(day)!.push(event)
  }
  return Array.from(days, ([day, events]) => ({ day, events }))
})
function dayLabel(day: string) {
  const label = day === today.value ? '今天' : day === tomorrow.value ? '明天' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long' }).format(new Date(`${day}T12:00:00+08:00`))
  return `${day.slice(5).replace('-', ' / ')} · ${label}`
}
async function load(refresh = false) {
  if (busy.value || (refresh && cooldown.value > 0)) return
  if (refresh) { refreshing.value = true; nextRefreshAt.value = Date.now() + 60000 }
  else loading.value = true
  error.value = ''
  refreshed.value = false
  try {
    data.value = await getOdds(refresh)
    refreshed.value = refresh
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '盘口暂时不可用，请稍后重试。'
  } finally {
    loading.value = false
    refreshing.value = false
    now.value = Date.now()
  }
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  // 只更新日期、过期标记和按钮倒计时，不发起网络取数。
  timer = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <section class="match-board" aria-labelledby="matches-heading" :aria-busy="busy">
    <div class="board-heading">
      <div><span class="board-eyebrow"><i aria-hidden="true"></i> NBA · MATCH CENTER</span><h1 id="matches-heading">比赛与盘口<span>从今天，看到下一场。</span></h1></div>
      <div class="board-actions">
        <button class="read-button" :disabled="busy" @click="load()">{{ loading ? '读取中…' : '重新读取' }}</button>
        <button class="refresh-button" :disabled="busy || cooldown > 0" @click="load(true)"><span aria-hidden="true">↻</span> {{ refreshing ? '正在更新…' : cooldown > 0 ? `${cooldown}s 后可更新` : '更新盘口' }}</button>
      </div>
    </div>
    <div class="board-source"><span>{{ data?.provider ?? 'The Odds API' }}<b>·</b>北京时间 UTC+8</span><span>采集 {{ data?.fetched_at ? dateTime(data.fetched_at) : '尚无数据' }}<em v-if="data?.fetched_at">{{ stale ? '待更新' : '已保存' }}</em></span></div>
    <div class="board-toolbar">
      <div class="date-filters" role="group" aria-label="比赛日期筛选"><button v-for="tab in tabs" :key="tab.key" :aria-pressed="filter === tab.key" :class="{ active: filter === tab.key }" @click="filter = tab.key">{{ tab.label }}</button></div>
      <span class="match-count">{{ visibleEvents.length }} 场<span v-if="visibleEvents.length"> · {{ upcoming }} 场未到开赛时间</span></span>
    </div>
    <p class="quota-hint">手动更新 · 每次通常消耗 2 credits（接口额度）<template v-if="data?.quota?.remaining != null"> · 上次记录剩余 {{ data.quota.remaining }}</template>。打开页面与切换日期不取新数据。</p>
    <p class="quota-hint">选好报价平台后，点击“交给 AI 分析”带入聊天；也可以直接在 NBA 助手里询问已保存的比赛。</p>
    <p v-if="error" class="board-alert error" role="alert">{{ error }}<span v-if="data?.events.length"> 当前仍显示原有快照，采集时间见上方。</span></p>
    <p v-else-if="refreshed" class="board-alert success" role="status">更新成功，已保存 {{ data?.events.length ?? 0 }} 场比赛。<template v-if="data?.quota?.last != null">本次消耗 {{ data.quota.last }} credits。</template></p>
    <p v-if="stale" class="board-alert warning">采集已超过 15 分钟或时间异常，以下为保存的赛前报价，请手动更新。</p>
    <div v-if="!data && loading" class="board-empty" role="status"><span>正在读取比赛数据…</span><p>先看已保存的盘口，不消耗接口额度。</p></div>
    <div v-else-if="!data || data.status === 'unavailable'" class="board-empty"><span>比赛数据暂时不可用</span><p>{{ data?.message ?? '请检查后端连接，然后重新读取。' }}</p></div>
    <div v-else-if="!visibleEvents.length" class="board-empty"><span>当前筛选下暂无已保存的比赛</span><p>数据源只覆盖已开盘比赛，不代表当天没有比赛。可以切换“明天”“近 7 天”，或手动更新。</p></div>
    <div v-else class="match-days">
      <section v-for="group in groups" :key="group.day" :aria-label="`${group.day}的比赛`">
        <div class="day-heading"><h2>{{ dayLabel(group.day) }}</h2><span>{{ group.events.length }} 场比赛</span></div>
        <div class="match-grid"><MatchCard v-for="event in group.events" :key="event.id" :event="event" :now="now" /></div>
      </section>
    </div>
    <p class="board-footnote">仅展示数据源已开盘的比赛，非完整赛程；未接入实时比分。每张卡片可切换报价平台，默认显示数据源首家报价，不代表推荐。让分正负号对应具体球队；大小分为全场总分，赔率为十进制。</p>
  </section>
</template>

<style scoped>
.match-board { max-width: 1160px; margin: 0 auto; padding: 40px 56px 24px; }
.board-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.board-eyebrow { display: flex; gap: 8px; align-items: center; font-size: 9px; letter-spacing: 2px; color: #738b7a; }
.board-eyebrow i { width: 6px; height: 6px; border-radius: 50%; background: #b49a63; }
.board-heading h1 { margin: 12px 0 0; font-size: 27px; font-weight: 600; letter-spacing: -.6px; }
.board-heading h1 span { display: block; margin-top: 7px; font-size: 12px; font-weight: 400; color: #829185; letter-spacing: .2px; }
.board-actions { display: flex; gap: 9px; flex-shrink: 0; align-items: center; }
.board-actions button { font-size: 11px; padding: 9px 12px; border-radius: 6px; }
.read-button { background: transparent; border: 1px solid #dbe5d9; color: #647b68; }
.refresh-button { background: #254f3d; border: 1px solid #254f3d; color: #fff; }
.refresh-button span { margin-right: 3px; }
.board-source { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 10px; color: #7c8c80; padding: 20px 0; }
.board-source b { font-weight: 400; padding: 0 8px; }
.board-source em { font-style: normal; margin-left: 8px; background: #eee8d9; padding: 2px 5px; border-radius: 3px; color: #8a734a; }
.board-toolbar { border-top: 1px solid #dfe6dc; border-bottom: 1px solid #dfe6dc; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 0; }
.date-filters { display: flex; gap: 4px; flex-wrap: wrap; }
.date-filters button { font-size: 12px; color: #6e8172; border: 0; background: transparent; border-radius: 5px; padding: 7px 12px; white-space: nowrap; }
.date-filters button.active { background: #e3ecde; color: #35583d; font-weight: 600; }
.match-count { font-size: 10px; color: #7b8b7d; white-space: nowrap; }
.quota-hint { font-size: 10px; color: #879585; margin: 11px 0 0; }
.day-heading { display: flex; gap: 12px; align-items: baseline; margin: 25px 0 12px; }
.day-heading h2 { font-size: 12px; font-weight: 600; letter-spacing: .5px; margin: 0; }
.day-heading > span { font-size: 10px; color: #879787; }
.match-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.board-alert { padding: 10px 13px; border-radius: 6px; font-size: 11px; line-height: 1.8; margin: 14px 0 0; }
.board-alert.warning { color: #8a6b38; background: #f3eee2; }
.board-alert.error { color: #a14d3e; background: #f8ece7; }
.board-alert.success { color: #426e4f; background: #e8f1e5; }
.board-empty { margin-top: 20px; border: 1px dashed #d7e1d1; border-radius: 12px; padding: 40px 24px; text-align: center; }
.board-empty > span { font-size: 14px; }
.board-empty p { font-size: 12px; color: #7e8e80; margin: 10px auto 0; max-width: 500px; }
.board-footnote { font-size: 10px; line-height: 1.9; color: #859383; margin: 18px 0 0; padding-bottom: 22px; border-bottom: 1px solid #e0e7dc; }
@media (min-width: 1600px) { .match-board { max-width: 1400px; } .match-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1100px) { .match-board { padding: 30px 28px 20px; } .match-count span { display: none; } }
@media (max-width: 850px) { .match-grid { grid-template-columns: 1fr; } .board-heading { align-items: flex-start; } .board-actions { flex-direction: column-reverse; align-items: stretch; } }
@media (max-width: 700px) { .match-board { padding: 28px 20px 14px; } .board-heading h1 { font-size: 24px; } .board-heading { gap: 12px; } .board-heading h1 span { font-size: 11px; } .board-actions button { padding: 7px 10px; } .board-toolbar { align-items: center; } .date-filters button { padding: 6px 9px; font-size: 11px; } .board-source { padding: 17px 0; } }
</style>
