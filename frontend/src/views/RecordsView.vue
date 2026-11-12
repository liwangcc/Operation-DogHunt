<script setup lang="ts">
// 预测记录：赛前保存的每一次判断。按时间、玩法、结果、来源、策略版本和球队筛选，点开看当时的盘口与结算算式，可导出 CSV。
import { computed, ref, watch } from 'vue'
import DemoRibbon from '@/components/common/DemoRibbon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import TeamMark from '@/components/common/TeamMark.vue'
import { beijingDay, clockTime, price, team } from '@/components/odds/format'
import { downloadCsv, recordsToCsv } from '@/components/records/csv'
import { MARKET_LABEL, SOURCE_LABEL, STATE_LABEL, STATE_TONE, pickText, stateOf, units, type RecordState } from '@/components/records/labels'
import RecordDrawer from '@/components/records/RecordDrawer.vue'
import { summarize } from '@/domain/metrics'
import { settle } from '@/domain/settlement'
import { demoEnabled, setDemo } from '@/stores/demo'
import { predictionRecords } from '@/stores/records'
import { now } from '@/stores/system'
import type { PredictionRecord } from '@/types/records'

const PAGE_SIZE = 30
const DAY_MS = 86400000

const range = ref<'7' | '30' | 'all'>('30')
const market = ref<'all' | 'spreads' | 'totals'>('all')
const state = ref<'all' | RecordState>('all')
const source = ref<'live' | 'backtest' | 'manual' | 'all'>('live')
const strategy = ref('all')
const author = ref<'all' | 'system' | 'user'>('all')
const search = ref('')
const shown = ref(PAGE_SIZE)
const opened = ref<PredictionRecord | null>(null)
const drawerOpen = ref(false)

const rows = computed(() => predictionRecords.value.map((record) => {
  const settlement = settle(record)
  return { record, settlement, state: stateOf(record, settlement) }
}))
const strategies = computed(() => Array.from(new Set(predictionRecords.value.map((record) => record.strategy))).sort())

const filtered = computed(() => {
  const since = range.value === 'all' ? 0 : now.value - Number(range.value) * DAY_MS
  const words = search.value.trim().toLowerCase()
  return rows.value.filter(({ record, state: rowState }) => {
    if (Date.parse(record.commenceTime) < since) return false
    if (market.value !== 'all' && record.market !== market.value) return false
    if (state.value !== 'all' && rowState !== state.value) return false
    if (source.value !== 'all' && record.source !== source.value) return false
    if (strategy.value !== 'all' && record.strategy !== strategy.value) return false
    if (author.value !== 'all' && record.author !== author.value) return false
    if (words) {
      const names = `${team(record.awayTeam).join(' ')} ${team(record.homeTeam).join(' ')} ${record.awayTeam} ${record.homeTeam} ${record.id}`.toLowerCase()
      if (!names.includes(words)) return false
    }
    return true
  })
})
const summary = computed(() => summarize(filtered.value.map((row) => row.record)))
const visible = computed(() => filtered.value.slice(0, shown.value))

// 换了筛选条件就回到第一页。
watch([range, market, state, source, strategy, author, search], () => {
  shown.value = PAGE_SIZE
})

function dayText(value: string): string {
  return beijingDay(value).slice(5).replace('-', '/')
}

function openRecord(record: PredictionRecord): void {
  opened.value = record
  drawerOpen.value = true
}

function exportCsv(): void {
  const stamp = beijingDay(new Date(now.value)).replace(/-/g, '')
  downloadCsv(`doghunt-预测记录${demoEnabled.value ? '-演示数据' : ''}-${stamp}.csv`, recordsToCsv(filtered.value.map((row) => row.record), demoEnabled.value))
}
</script>

<template>
  <section class="page records" aria-labelledby="records-heading">
    <header class="page-head reveal">
      <div>
        <p class="overline">Station 03 · Prediction Ledger</p>
        <h1 id="records-heading" class="page-title">预测记录</h1>
        <p class="page-sub">留住每次判断及当时的盘口，让后续复盘有据可查。</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn" :disabled="!filtered.length" @click="exportCsv">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M4.5 7L8 10.5 11.5 7M2.5 13.5h11" /></svg>
          导出 CSV<span class="num text-3">{{ filtered.length }}</span>
        </button>
      </div>
    </header>

    <DemoRibbon v-if="demoEnabled" class="reveal" reason="后端还没有保存正式预测的接口。" />

    <EmptyState v-if="!predictionRecords.length" title="还没有预测记录">
      <p>正式预测的保存、锁定和赛后结算还没有在后端实现，所以这里没有真实记录。聊天里的分析目前只保留在当次对话中。</p>
      <template #actions>
        <button type="button" class="btn btn--amber" @click="setDemo(true)">用演示数据预览界面</button>
        <RouterLink to="/" class="btn">去 NBA 助手</RouterLink>
      </template>
    </EmptyState>

    <template v-else>
      <div class="filters panel reveal" style="--i: 1">
        <div class="filter-row">
          <div class="seg" role="group" aria-label="时间范围">
            <button v-for="option in [['7', '近 7 天'], ['30', '近 30 天'], ['all', '全部']] as const" :key="option[0]" type="button" :aria-pressed="range === option[0]" @click="range = option[0]">{{ option[1] }}</button>
          </div>
          <div class="seg" role="group" aria-label="玩法">
            <button v-for="option in [['all', '全部玩法'], ['spreads', '让分'], ['totals', '大小分']] as const" :key="option[0]" type="button" :aria-pressed="market === option[0]" @click="market = option[0]">{{ option[1] }}</button>
          </div>
          <div class="seg" role="group" aria-label="记录来源">
            <button v-for="option in [['live', '赛前记录'], ['backtest', '历史模拟'], ['manual', '人工补录'], ['all', '全部来源']] as const" :key="option[0]" type="button" :aria-pressed="source === option[0]" @click="source = option[0]">{{ option[1] }}</button>
          </div>
        </div>
        <div class="filter-row">
          <label class="field">结果
            <select v-model="state" class="select">
              <option value="all">全部结果</option>
              <option v-for="(label, key) in STATE_LABEL" :key="key" :value="key">{{ label }}</option>
            </select>
          </label>
          <label class="field">策略版本
            <select v-model="strategy" class="select">
              <option value="all">全部版本</option>
              <option v-for="item in strategies" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label class="field">判断来源
            <select v-model="author" class="select">
              <option value="all">系统与个人</option>
              <option value="system">系统判断</option>
              <option value="user">个人判断</option>
            </select>
          </label>
          <label class="field grow">球队
            <input v-model="search" class="input" type="search" placeholder="输入球队名或记录编号" />
          </label>
        </div>
      </div>

      <dl class="tally reveal" style="--i: 2" aria-label="当前筛选下的汇总">
        <div><dt>记录</dt><dd class="num">{{ filtered.length }}</dd></div>
        <div><dt>给出方向</dt><dd class="num">{{ summary.picks }}</dd></div>
        <div><dt>赢盘</dt><dd class="num pos">{{ summary.wins }}</dd></div>
        <div><dt>输盘</dt><dd class="num neg">{{ summary.losses }}</dd></div>
        <div><dt>走盘</dt><dd class="num">{{ summary.pushes }}</dd></div>
        <div><dt>待结算</dt><dd class="num">{{ summary.pending }}</dd></div>
        <div><dt>观望</dt><dd class="num">{{ summary.passes }}</dd></div>
        <div><dt>数据不足</dt><dd class="num">{{ summary.insufficient }}</dd></div>
        <div class="tally-net"><dt>模拟盈亏</dt><dd class="num" :class="{ pos: summary.net > 0, neg: summary.net < 0 }">{{ units(summary.net) }}<small>单位</small></dd></div>
      </dl>

      <EmptyState v-if="!filtered.length" title="当前筛选下没有记录"><p>换一个时间范围、来源或结果试试。</p></EmptyState>
      <div v-else class="ledger panel reveal" style="--i: 3">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>开赛 · 北京时间</th><th>对阵</th><th>玩法</th><th>判断</th><th class="right">赔率</th><th>结果</th><th class="right">模拟盈亏</th><th>策略 / 来源</th><th><span class="sr-only">操作</span></th></tr>
            </thead>
            <tbody>
              <tr v-for="row in visible" :key="row.record.id" @click="openRecord(row.record)">
                <td class="when"><strong class="num">{{ dayText(row.record.commenceTime) }}</strong><span class="num">{{ clockTime(row.record.commenceTime) }}</span></td>
                <td>
                  <div class="teams"><TeamMark :name="row.record.awayTeam" size="sm" /><span>{{ team(row.record.awayTeam)[0] }}</span><i>VS</i><span>{{ team(row.record.homeTeam)[0] }}</span><TeamMark :name="row.record.homeTeam" size="sm" /></div>
                </td>
                <td>{{ MARKET_LABEL[row.record.market] }}</td>
                <td class="pick" :class="{ muted: row.record.decision !== 'pick' }">{{ pickText(row.record) }}<span v-if="row.record.author === 'user'" class="tag">个人</span></td>
                <td class="right num">{{ row.record.price === null ? '—' : price(row.record.price) }}</td>
                <td><span class="tag" :class="STATE_TONE[row.state]">{{ STATE_LABEL[row.state] }}</span></td>
                <td class="right num pnl" :class="{ pos: (row.settlement?.pnl ?? 0) > 0, neg: (row.settlement?.pnl ?? 0) < 0 }">{{ row.settlement?.pnl == null ? '—' : units(row.settlement.pnl) }}</td>
                <td class="origin">{{ row.record.strategy }}<span>{{ SOURCE_LABEL[row.record.source] }}</span></td>
                <td class="right"><button type="button" class="btn btn--sm btn--quiet" :aria-label="`查看记录 ${row.record.id}`" @click.stop="openRecord(row.record)">详情 <span aria-hidden="true">→</span></button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="filtered.length > shown" class="more">
          <button type="button" class="btn" @click="shown += PAGE_SIZE">再显示 {{ Math.min(PAGE_SIZE, filtered.length - shown) }} 条<span class="num text-3">{{ shown }} / {{ filtered.length }}</span></button>
        </div>
      </div>
      <p class="footnote">模拟盈亏按记录时的盘口和赔率、每个有效选择固定投入 1 单位计算，不代表真实成交。观望、数据不足不产生投入；取消的比赛盈亏为 0 且不计入 ROI。</p>
    </template>

    <RecordDrawer v-if="opened" v-model:open="drawerOpen" :record="opened" :demo="demoEnabled" />
  </section>
</template>

<style scoped>
.filters { display: grid; gap: 12px; margin-bottom: 16px; padding: 14px 16px; }
.filter-row { display: flex; align-items: center; gap: 10px 12px; flex-wrap: wrap; }
.field { display: flex; align-items: center; gap: 8px; font-size: 12px; letter-spacing: .1em; color: var(--text-3); white-space: nowrap; }
.field.grow { flex: 1; min-width: 220px; }
.field.grow .input { flex: 1; min-width: 0; }

.tally { display: flex; flex-wrap: wrap; margin: 0 0 16px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: rgba(8, 19, 33, .6); }
.tally > div { flex: 1 1 96px; padding: 12px 16px; border-right: 1px solid var(--line); }
.tally > div:last-child { border-right: 0; }
.tally dt { font-size: 11px; letter-spacing: .16em; color: var(--text-3); white-space: nowrap; }
.tally dd { margin: 2px 0 0; font-size: 24px; font-style: italic; font-weight: 800; line-height: 1.2; }
.tally dd small { margin-left: 6px; font-size: 11px; font-style: normal; font-weight: 400; color: var(--text-3); }
.tally-net { flex-basis: 150px !important; background: rgba(73, 221, 235, .05); }

.ledger { overflow: hidden; }
.ledger .table { min-width: 940px; }
.ledger tbody tr { cursor: pointer; transition: background .16s; }
.ledger tbody tr:hover { background: rgba(73, 221, 235, .06); }
.ledger td { white-space: nowrap; }
.when strong { display: block; font-size: 15px; font-style: italic; font-weight: 800; line-height: 1.2; }
.when span { font-size: 12px; color: var(--text-3); }
.teams { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.teams i { font-size: 10px; font-weight: 800; letter-spacing: .1em; color: var(--text-3); }
.pick { font-size: 15px; font-style: italic; font-weight: 700; font-variant-numeric: tabular-nums; }
.pick.muted { font-style: normal; font-weight: 400; font-size: 13px; color: var(--text-3); }
.pick .tag { margin-left: 8px; font-style: normal; font-weight: 400; }
.pnl { font-size: 15px; font-style: italic; font-weight: 700; }
.origin { font-size: 13px; }
.origin span { display: block; font-size: 11px; color: var(--text-3); }
.more { display: flex; justify-content: center; padding: 14px; border-top: 1px solid var(--line); }
.footnote { margin: 16px 0 0; font-size: 12px; line-height: 1.8; color: var(--text-3); }
@media (max-width: 700px) {
  .tally > div { flex-basis: 30%; border-bottom: 1px solid var(--line); }
  .field { flex: 1 1 100%; justify-content: space-between; }
  .field .select { flex: 0 1 60%; }
}
</style>
