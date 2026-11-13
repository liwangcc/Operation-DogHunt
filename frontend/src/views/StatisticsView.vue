<script setup lang="ts">
import { computed } from 'vue'
import DemoRibbon from '@/components/common/DemoRibbon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import RecordFilters from '@/components/records/RecordFilters.vue'
import EquityChart from '@/components/stats/EquityChart.vue'
import HitRing from '@/components/stats/HitRing.vue'
import OutcomeBars from '@/components/stats/OutcomeBars.vue'
import WeeklyBars from '@/components/stats/WeeklyBars.vue'
import { MARKET_LABEL, percent, signedPercent, units } from '@/components/records/labels'
import { beijingDay } from '@/components/odds/format'
import { useRecordScope } from '@/composables/useRecordScope'
import { equityCurve, groupSummaries, summarize } from '@/domain/metrics'
import { demoEnabled, setDemo } from '@/stores/demo'

const { filters, records, strategies, query, reset } = useRecordScope()
const summary = computed(() => summarize(records.value))
const markets = computed(() => (['spreads', 'totals'] as const).map(key => ({ key, label: MARKET_LABEL[key], summary: summarize(records.value.filter(record => record.market === key)) })))
// 曲线颜色与 tokens.css 里的冷光、紫、黄铜一致。
const series = computed(() => [{ key: 'all', label: '当前筛选', color: '#86d4dd', points: equityCurve(records.value) },
  ...(['spreads', 'totals'] as const).filter(key => filters.value.market === 'all' || filters.value.market === key).map(key => ({ key, label: MARKET_LABEL[key], color: key === 'spreads' ? '#a7a0de' : '#d3ab6f', points: equityCurve(records.value.filter(record => record.market === key)) }))])
const versions = computed(() => groupSummaries(records.value, record => ({ key: record.strategy, label: record.strategy })).sort((a, b) => a.key.localeCompare(b.key)))
const weeks = computed(() => groupSummaries(records.value, record => {
  const day = new Date(`${beijingDay(record.commenceTime)}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7)
  const key = day.toISOString().slice(0, 10)
  return { key, label: key.slice(5).replace('-', '/') }
}).filter(week => week.summary.staked > 0).sort((a, b) => a.key.localeCompare(b.key)))
</script>

<template>
  <section class="page statistics-page">
    <header class="page-head"><div><p class="overline"><b>04</b>三号工位</p><h1 class="page-title">效果统计</h1><p class="page-sub">把每一次判断放回整体，观察表现与波动。</p></div><RouterLink class="btn" :to="{ path: '/records', query }">查看对应记录 ↗</RouterLink></header>
    <DemoRibbon v-if="demoEnabled" reason="所有指标由演示记录计算，不能代表真实策略表现。" />
    <EmptyState v-else title="暂无正式统计数据"><p>正式预测与赛果尚未接入，当前没有真实战绩可统计。</p><template #actions><button class="btn btn--primary" @click="setDemo(true)">查看演示数据</button></template></EmptyState>
    <template v-if="demoEnabled">
      <RecordFilters v-model="filters" :strategies="strategies" @reset="reset" />
      <p class="scope-note">当前 {{ records.length }} 条记录 · 时间按北京时间 · 记录来源与判断来源分别统计</p>
      <EmptyState v-if="!records.length" title="当前筛选暂无记录"><p>试试切换时间范围或记录来源。</p><template #actions><button class="btn" @click="reset">重置筛选</button></template></EmptyState>
      <template v-else>
        <div class="metrics">
          <article class="panel panel-pad hit-card"><span class="label">整体命中率</span><div class="hit-display"><HitRing :rate="summary.hitRate" :range="summary.hitRange" :break-even="summary.breakEven" /><strong class="num-display">{{ percent(summary.hitRate) }}</strong></div><p>{{ summary.wins }} 赢 / {{ summary.losses }} 输 · 不含走盘</p><small>95% 区间 {{ summary.hitRange ? `${percent(summary.hitRange[0])}–${percent(summary.hitRange[1])}` : '—' }}</small></article>
          <article class="panel panel-pad"><span class="label">模拟净盈亏</span><strong class="metric-number num-display" :class="{ pos: summary.net > 0, neg: summary.net < 0 }" data-metric="net">{{ units(summary.net) }}</strong><p>单位 · 每次固定投入 1 单位</p><small>已结算投入 {{ summary.staked }} 单位</small></article>
          <article class="panel panel-pad"><span class="label">模拟收益率 ROI</span><strong class="metric-number num-display" :class="{ pos: (summary.roi ?? 0) > 0, neg: (summary.roi ?? 0) < 0 }">{{ signedPercent(summary.roi) }}</strong><p>净盈亏 ÷ 已结算投入</p><small>盈亏平衡命中率 {{ percent(summary.breakEven) }}</small></article>
          <article class="panel panel-pad"><span class="label">选择覆盖率</span><strong class="metric-number num-display">{{ percent(summary.coverage) }}</strong><p>{{ summary.picks }} 次选择 / <span data-metric="analyzed">{{ summary.analyzed }}</span> 次分析</p><small>观望 {{ summary.passes }} · 资料不足 {{ summary.insufficient }}</small></article>
        </div>
        <p v-if="summary.wins + summary.losses < 100" class="alert alert--warn sample-note">已分出输赢的样本不足 100 个，比例容易波动；命中率旁的区间显示这种不确定性。</p>
        <section class="panel panel--ticks panel-pad curve-panel"><div class="section-head"><h2 class="section-title">累计模拟盈亏</h2><span class="tag">每次结算后累计 · 单位</span></div><EquityChart :series="series" /><div class="chart-legend"><span v-for="line in series" :key="line.key"><i :style="{ background: line.color }"></i>{{ line.label }}</span><small>悬停或按左右方向键查看记录</small></div></section>
        <div class="detail-grid"><section class="panel panel-pad"><h2 class="section-title">结算分布</h2><OutcomeBars :rows="markets" :total="summary" /></section><section class="panel panel-pad"><h2 class="section-title">每周表现 <small>周一开始 · 单位</small></h2><div class="weekly-scroll"><WeeklyBars :weeks="weeks" /></div></section></div>
        <section class="panel versions"><div class="section-head"><h2 class="section-title">按策略版本对比</h2><span class="text-3">每个比例都对应自己的样本</span></div><div class="table-wrap"><table class="table"><thead><tr><th>策略版本</th><th>分析数</th><th>已结算投入</th><th>命中率</th><th>模拟净盈亏</th><th>模拟 ROI</th></tr></thead><tbody><tr v-for="version in versions" :key="version.key"><td class="mono">{{ version.label }}</td><td>{{ version.summary.analyzed }}</td><td>{{ version.summary.staked }}</td><td>{{ percent(version.summary.hitRate) }}<small>（{{ version.summary.wins }} 赢 / {{ version.summary.losses }} 输）</small></td><td :class="{ pos: version.summary.net > 0, neg: version.summary.net < 0 }">{{ units(version.summary.net) }}</td><td>{{ signedPercent(version.summary.roi) }}</td></tr></tbody></table></div></section>
        <p class="scope-note">走盘计入已结算投入；取消和待结算不计入收益率分母。观望与资料不足不参与命中率。演示数据由固定种子生成，走势图形仅用于体验界面。</p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.scope-note { margin: 0 0 18px; font-size: 12px; line-height: 1.8; color: var(--text-3); }

/* 四个指标排成一条仪表带：一个外框，中间用发丝线隔开；命中率带圆环，占得宽一些。 */
.metrics { display: grid; grid-template-columns: 1.35fr 1fr 1fr 1fr; border: 1px solid var(--line); border-radius: var(--radius-lg); background: linear-gradient(180deg, rgba(17, 25, 32, .86), rgba(11, 16, 21, .86)); box-shadow: inset 0 1px 0 rgba(200, 232, 238, .045); }
.metrics article.panel { min-width: 0; padding: 20px 22px 18px; border: 0; border-left: 1px solid var(--line); border-radius: 0; background: none; box-shadow: none; }
.metrics article.panel:first-child { border-left: 0; }
.metrics p { margin: 0 0 4px; font-size: 12px; color: var(--text-2); }
.metrics small { font-size: 12px; color: var(--text-3); }
.metric-number { display: block; margin: 22px 0 20px; font-size: clamp(28px, 2.8vw, 38px); line-height: 1; }
.hit-card { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: 'ring label' 'ring text' 'ring note'; column-gap: 20px; align-content: center; }
.hit-card .label { grid-area: label; align-self: end; margin-bottom: 8px; }
.hit-display { position: relative; display: grid; grid-area: ring; place-items: center; width: 120px; }
.hit-display strong { position: absolute; font-size: 25px; font-weight: 500; color: #eaf7f9; text-shadow: var(--bloom); }
.hit-card p { grid-area: text; }
.hit-card > small { grid-area: note; align-self: start; }
.sample-note { margin-top: 14px; }

/* 累计曲线是这一页的主投影：四角定位标记，底上一层静止的扫描纹。 */
.curve-panel { margin-top: 22px; background: var(--scan), linear-gradient(180deg, rgba(17, 25, 32, .86), rgba(11, 16, 21, .86)); }
.section-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 18px; }
.chart-legend { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-top: 4px; font-size: 12px; color: var(--text-2); }
.chart-legend span { display: inline-flex; align-items: center; gap: 7px; }
.chart-legend i { width: 14px; height: 2px; }
.chart-legend small { margin-left: auto; color: var(--text-3); }

.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
.detail-grid > section { min-width: 0; }
.detail-grid .section-title { margin-bottom: 22px; }
.weekly-scroll { overflow-x: auto; }
.weekly-scroll :deep(.weekly) { min-width: 360px; }
.versions { overflow: hidden; }
.versions .section-head { margin-bottom: 0; padding: 16px 22px; border-bottom: 1px solid var(--line); }
.versions .text-3 { font-size: 12px; }
.versions table { min-width: 700px; }
.versions th:first-child, .versions td:first-child { padding-left: 22px; }
.versions td { font-variant-numeric: tabular-nums; }
.versions small { display: block; font-size: 11px; color: var(--text-3); }
.versions + .scope-note { margin-top: 18px; }

@media (max-width: 1100px) {
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metrics article.panel:nth-child(odd) { border-left: 0; }
  .metrics article.panel:nth-child(n + 3) { border-top: 1px solid var(--line); }
  .detail-grid { grid-template-columns: 1fr; }
}
@media (max-width: 700px) {
  .metrics article.panel { padding: 16px 14px 14px; }
  .metric-number { margin: 16px 0 14px; font-size: 27px; }
  .hit-card { grid-template-columns: 1fr; grid-template-areas: 'label' 'ring' 'text' 'note'; justify-items: start; }
  .hit-display { width: 96px; margin: 2px 0 8px; }
  .hit-display :deep(.ring) { width: 96px; height: 96px; }
  .hit-display strong { font-size: 20px; }
  .curve-panel { padding: 18px 12px; }
  .chart-legend { gap: 12px; }
  .chart-legend small { width: 100%; margin: 0; }
  .section-head .tag { height: auto; white-space: normal; }
}
</style>
