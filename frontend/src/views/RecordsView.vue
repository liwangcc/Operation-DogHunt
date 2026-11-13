<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DemoRibbon from '@/components/common/DemoRibbon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import RecordDrawer from '@/components/records/RecordDrawer.vue'
import RecordFilters from '@/components/records/RecordFilters.vue'
import { dateTime, price } from '@/components/odds/format'
import { downloadCsv, recordsToCsv } from '@/components/records/csv'
import { MARKET_LABEL, STATE_LABEL, STATE_TONE, matchup, percent, pickText, stateOf, units } from '@/components/records/labels'
import type { RecordState } from '@/components/records/labels'
import { useRecordScope } from '@/composables/useRecordScope'
import { summarize } from '@/domain/metrics'
import { settle } from '@/domain/settlement'
import { demoEnabled, setDemo } from '@/stores/demo'
import type { PredictionRecord } from '@/types/records'

const { filters, records, strategies, query, reset } = useRecordScope()
const search = ref('')
const result = ref<'all' | RecordState>('all')
const selected = ref<PredictionRecord | null>(null)
const open = ref(false)
const rows = computed(() => records.value.map(record => ({ record, settlement: settle(record), state: stateOf(record, settle(record)) }))
  .filter(row => (result.value === 'all' || row.state === result.value)
    && `${row.record.id} ${matchup(row.record)} ${row.record.homeTeam} ${row.record.awayTeam}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const summary = computed(() => summarize(rows.value.map(row => row.record)))
function resetAll() { reset(); search.value = ''; result.value = 'all' }
function inspect(record: PredictionRecord) { selected.value = record; open.value = true }
function exportRows() { downloadCsv('DogHunt-演示预测记录.csv', recordsToCsv(rows.value.map(row => row.record), demoEnabled.value)) }
watch(demoEnabled, () => { open.value = false; selected.value = null })
</script>

<template>
  <section class="page records-page">
    <header class="page-head">
      <div><p class="overline">STATION 02 / PREDICTION JOURNAL</p><h1 class="page-title">预测记录</h1><p class="page-sub">留下当时的判断、盘口与依据，逐条核对赛后结果。</p></div>
      <div class="page-actions"><RouterLink class="btn" :to="{ path: '/statistics', query }">查看效果统计 ↗</RouterLink><button class="btn btn--primary" :disabled="!rows.length" @click="exportRows">导出筛选结果 CSV</button></div>
    </header>
    <DemoRibbon v-if="demoEnabled" reason="预测记录接口尚未接入；本页与效果统计共用同一套演示记录。" />
    <EmptyState v-else title="暂无正式预测记录"><p>正式记录与赛果存储尚未接入。可以打开演示，查看记录筛选和复盘详情。</p><template #actions><button class="btn btn--primary" @click="setDemo(true)">查看演示数据</button><RouterLink class="btn" to="/matches">去选比赛</RouterLink></template></EmptyState>
    <template v-if="demoEnabled">
      <RecordFilters v-model="filters" :strategies="strategies" @reset="resetAll" />
      <div class="record-search panel panel-pad"><label class="search"><span class="label">搜索记录</span><input v-model="search" class="input" type="search" aria-label="搜索球队或记录编号" placeholder="球队 / 记录编号" /></label><label><span class="label">结算结果</span><select v-model="result" class="select" aria-label="结算结果"><option value="all">全部结果</option><option v-for="(label, key) in STATE_LABEL" :key="key" :value="key">{{ label }}</option></select></label><span class="text-3">时间均为北京时间 · 导出与当前列表一致</span></div>
      <div class="summary-grid">
        <article class="panel panel-pad"><span class="label">当前记录</span><strong class="num-display" data-metric="analyzed">{{ summary.analyzed }}</strong><small>给出方向 {{ summary.picks }} · 观望 {{ summary.passes }}</small></article>
        <article class="panel panel-pad"><span class="label">待结算</span><strong class="num-display">{{ summary.pending }}</strong><small>等待最终比分</small></article>
        <article class="panel panel-pad"><span class="label">命中率</span><strong class="num-display">{{ percent(summary.hitRate) }}</strong><small>{{ summary.wins }} 赢 / {{ summary.losses }} 输 · 不含走盘</small></article>
        <article class="panel panel-pad"><span class="label">模拟净盈亏</span><strong class="num-display" :class="{ pos: summary.net > 0, neg: summary.net < 0 }" data-metric="net">{{ units(summary.net) }}</strong><small>单位 · 每个有效选择固定投入 1 单位</small></article>
      </div>
      <div v-if="rows.length" class="panel records-table">
        <div class="table-caption"><h2 class="section-title">判断日志 <small>{{ rows.length }} 条演示记录</small></h2><span>按开赛时间从新到旧</span></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>比赛 / 开赛时间</th><th>玩法与判断</th><th>赔率</th><th>策略</th><th>结果</th><th class="right">模拟盈亏</th><th><span class="sr-only">详情</span></th></tr></thead><tbody>
          <tr v-for="row in rows" :key="row.record.id"><td><strong>{{ matchup(row.record) }}</strong><small class="record-meta num">{{ dateTime(row.record.commenceTime) }} · {{ row.record.id }}</small></td><td><span class="tag">{{ MARKET_LABEL[row.record.market] }}</span><span class="pick">{{ pickText(row.record) }}</span></td><td class="num">{{ price(row.record.price) }}</td><td class="mono">{{ row.record.strategy }}</td><td><span class="tag" :class="STATE_TONE[row.state]">{{ STATE_LABEL[row.state] }}</span></td><td class="right num" :class="{ pos: (row.settlement?.pnl ?? 0) > 0, neg: (row.settlement?.pnl ?? 0) < 0 }">{{ row.settlement?.pnl == null ? '—' : units(row.settlement.pnl) }}</td><td><button class="btn btn--sm" :aria-label="`查看记录 ${row.record.id}`" @click="inspect(row.record)">详情 ↗</button></td></tr>
        </tbody></table></div>
      </div>
      <EmptyState v-else title="没有符合筛选条件的记录"><p>试试其他时间、记录来源或球队。历史模拟主要分布在更早的日期。</p><template #actions><button class="btn" @click="resetAll">重置筛选</button></template></EmptyState>
      <p class="page-note">赛前记录、历史模拟和人工补录分开查看；系统判断与个人判断分开统计。演示记录仅供查看与导出，不写入正式存储。</p>
    </template>
    <RecordDrawer v-if="selected" v-model:open="open" :record="selected" :demo="demoEnabled" />
  </section>
</template>

<style scoped>
.record-search { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; margin-bottom: 18px; }
.record-search label { display: grid; gap: 7px; }.search { flex: 1; min-width: 180px; }.record-search > span { font-size: 12px; padding-bottom: 6px; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 22px; }
.summary-grid article { min-width: 0; }.summary-grid strong { display: block; font-size: clamp(27px, 3vw, 38px); margin: 8px 0; }.summary-grid small { font-size: 12px; color: var(--text-3); }
.records-table { overflow: hidden; }.table-caption { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 20px 22px; border-bottom: 1px solid var(--line); }.table-caption > span { font-size: 12px; color: var(--text-3); }
.table { min-width: 820px; }.table td { padding-block: 16px; }.table tbody tr:hover { background: var(--cyan-soft); }.table td > strong { font-weight: 600; }.record-meta { display: block; margin-top: 5px; color: var(--text-3); font-size: 11px; }.pick { display: block; margin-top: 6px; }.page-note { margin: 18px 0 0; font-size: 12px; line-height: 1.8; color: var(--text-3); }
@media (max-width: 1000px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .summary-grid { gap: 10px; }.summary-grid article { padding: 16px; }.record-search { padding: 16px; }.record-search > span { width: 100%; }.page-actions { width: 100%; }.page-actions > * { flex: 1; }.summary-grid strong { font-size: 27px; } }
</style>
