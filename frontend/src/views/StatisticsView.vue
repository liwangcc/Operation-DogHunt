<script setup lang="ts">
// 效果统计：从预测记录汇总命中率、模拟盈亏、ROI 和覆盖率；让分、大小分分开看，三种记录来源分开统计，所有比例都带样本数。
import { computed, ref } from 'vue'
import DemoRibbon from '@/components/common/DemoRibbon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { beijingDay } from '@/components/odds/format'
import { percent, signedPercent, units } from '@/components/records/labels'
import EquityChart, { type EquitySeries } from '@/components/stats/EquityChart.vue'
import HitRing from '@/components/stats/HitRing.vue'
import OutcomeBars from '@/components/stats/OutcomeBars.vue'
import WeeklyBars from '@/components/stats/WeeklyBars.vue'
import { equityCurve, groupSummaries, summarize } from '@/domain/metrics'
import { settle } from '@/domain/settlement'
import { useCountUp } from '@/shell/countUp'
import { demoEnabled, setDemo } from '@/stores/demo'
import { predictionRecords } from '@/stores/records'
import { now } from '@/stores/system'
import type { PredictionRecord, RecordSource } from '@/types/records'

const DAY_MS = 86400000
const WEEK_MS = 7 * DAY_MS
/** 已分出输赢的样本少于这个数时，提醒区间很宽。 */
const SMALL_SAMPLE = 100

const source = ref<RecordSource>('live')
const market = ref<'all' | 'spreads' | 'totals'>('all')
const range = ref<'30' | 'all'>('all')
const strategy = ref('all')
const author = ref<'system' | 'user'>('system')

const strategies = computed(() => Array.from(new Set(predictionRecords.value.map((record) => record.strategy))).sort())

/** 除“玩法”以外的筛选；玩法另外处理，因为分布和曲线要同时用到两个玩法。 */
const scoped = computed(() => {
  const since = range.value === 'all' ? 0 : now.value - 30 * DAY_MS
  return predictionRecords.value.filter((record) => record.source === source.value && record.author === author.value
    && (strategy.value === 'all' || record.strategy === strategy.value) && Date.parse(record.commenceTime) >= since)
})
const byMarket = (key: 'spreads' | 'totals') => scoped.value.filter((record) => record.market === key)
const selected = computed(() => (market.value === 'all' ? scoped.value : byMarket(market.value)))
const summary = computed(() => summarize(selected.value))

const series = computed<EquitySeries[]>(() => {
  const main: EquitySeries = { key: market.value, label: market.value === 'all' ? '总体' : market.value === 'spreads' ? '让分' : '大小分', color: '#49ddeb', points: equityCurve(selected.value) }
  if (market.value !== 'all') return [main]
  return [main, { key: 'spreads', label: '让分', color: '#a99df6', points: equityCurve(byMarket('spreads')) }, { key: 'totals', label: '大小分', color: '#e7aa62', points: equityCurve(byMarket('totals')) }]
})
const distribution = computed(() => [
  { key: 'spreads', label: '让分', summary: summarize(byMarket('spreads')) },
  { key: 'totals', label: '大小分', summary: summarize(byMarket('totals')) },
])

/** 只取已经结算出输赢或走盘的记录，按北京时间的自然周（周一起）分组。 */
function settledOnly(records: PredictionRecord[]): PredictionRecord[] {
  return records.filter((record) => {
    const outcome = settle(record)?.outcome
    return outcome === 'win' || outcome === 'loss' || outcome === 'push'
  })
}
const weeks = computed(() => groupSummaries(
  settledOnly(selected.value).sort((a, b) => Date.parse(a.commenceTime) - Date.parse(b.commenceTime)),
  (record) => {
    // 1970-01-05 是周一；加 8 小时换成北京时间再取整到周。
    const monday = Math.floor((Date.parse(record.commenceTime) + 8 * 3600000 - 4 * DAY_MS) / WEEK_MS) * WEEK_MS + 4 * DAY_MS - 8 * 3600000
    return { key: String(monday), label: beijingDay(new Date(monday)).slice(5).replace('-', '/') }
  },
).slice(-12))
const versions = computed(() => groupSummaries([...selected.value].sort((a, b) => a.strategy.localeCompare(b.strategy)), (record) => ({ key: record.strategy, label: record.strategy })))

const decided = computed(() => summary.value.wins + summary.value.losses)
const hitShown = useCountUp(() => summary.value.hitRate)
const netShown = useCountUp(() => (summary.value.staked ? summary.value.net : null))
const roiShown = useCountUp(() => summary.value.roi)
const coverageShown = useCountUp(() => summary.value.coverage)
</script>

<template>
  <section class="page statistics" aria-labelledby="statistics-heading">
    <header class="page-head reveal">
      <div>
        <p class="overline">Station 04 · Performance</p>
        <h1 id="statistics-heading" class="page-title">效果统计</h1>
        <p class="page-sub">在积累真实赛前记录后，分别观察让分和大小分的表现。</p>
      </div>
    </header>

    <DemoRibbon v-if="demoEnabled" class="reveal" reason="后端还没有预测记录和赛果结算，下面的数字都由演示记录现算。" />

    <EmptyState v-if="!predictionRecords.length" title="暂无数据">
      <p>效果统计从正式的赛前预测记录计算。后端还没有保存预测和结算赛果，所以这里不显示任何成绩。</p>
      <template #actions>
        <button type="button" class="btn btn--amber" @click="setDemo(true)">用演示数据预览界面</button>
      </template>
    </EmptyState>

    <template v-else>
      <div class="filters reveal" style="--i: 1">
        <div class="seg" role="group" aria-label="记录来源">
          <button v-for="option in [['live', '赛前记录'], ['backtest', '历史模拟'], ['manual', '人工补录']] as const" :key="option[0]" type="button" :aria-pressed="source === option[0]" @click="source = option[0]">{{ option[1] }}</button>
        </div>
        <div class="seg" role="group" aria-label="玩法">
          <button v-for="option in [['all', '总体'], ['spreads', '让分'], ['totals', '大小分']] as const" :key="option[0]" type="button" :aria-pressed="market === option[0]" @click="market = option[0]">{{ option[1] }}</button>
        </div>
        <div class="seg" role="group" aria-label="时间范围">
          <button v-for="option in [['30', '近 30 天'], ['all', '全部']] as const" :key="option[0]" type="button" :aria-pressed="range === option[0]" @click="range = option[0]">{{ option[1] }}</button>
        </div>
        <div class="seg" role="group" aria-label="判断来源">
          <button v-for="option in [['system', '系统判断'], ['user', '个人判断']] as const" :key="option[0]" type="button" :aria-pressed="author === option[0]" @click="author = option[0]">{{ option[1] }}</button>
        </div>
        <label class="field">策略版本
          <select v-model="strategy" class="select">
            <option value="all">全部版本</option>
            <option v-for="item in strategies" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
      </div>

      <p v-if="source !== 'live'" class="alert alert--warn reveal">{{ source === 'backtest' ? '历史模拟只是辅助参考：模型可能已经知道过去比赛的结果，不能当作赛前验证。' : '人工补录是开赛后补上的记录，不算按时产生的赛前判断，单独统计。' }}</p>

      <div class="kpis reveal" style="--i: 2">
        <article class="kpi panel panel--ticks hit">
          <HitRing :rate="hitShown" :range="summary.hitRange" :break-even="summary.breakEven" />
          <div>
            <h2 class="label">命中率</h2>
            <p class="kpi-value num">{{ hitShown === null ? '—' : (hitShown * 100).toFixed(1) }}<small v-if="hitShown !== null">%</small></p>
            <p class="kpi-note num">赢 {{ summary.wins }} · 输 {{ summary.losses }} · 样本 {{ decided }}<br />走盘 {{ summary.pushes }}、取消 {{ summary.voids }} 另列</p>
          </div>
          <ul class="hit-legend">
            <li><i class="band"></i>95% 区间 <span class="num">{{ summary.hitRange ? `${percent(summary.hitRange[0], 0)} – ${percent(summary.hitRange[1], 0)}` : '—' }}</span></li>
            <li><i class="tick"></i>不赚不亏需要 <span class="num">{{ percent(summary.breakEven) }}</span></li>
          </ul>
        </article>
        <article class="kpi panel">
          <h2 class="label">模拟盈亏</h2>
          <p class="kpi-value num" :class="{ pos: (netShown ?? 0) > 0, neg: (netShown ?? 0) < 0 }">{{ netShown === null ? '—' : units(netShown) }}<small v-if="netShown !== null">单位</small></p>
          <p class="kpi-note num">已结算 {{ summary.staked }} 个选择<br />每个固定投入 1 单位</p>
        </article>
        <article class="kpi panel">
          <h2 class="label">模拟 ROI</h2>
          <p class="kpi-value num" :class="{ pos: (roiShown ?? 0) > 0, neg: (roiShown ?? 0) < 0 }">{{ signedPercent(roiShown) }}</p>
          <p class="kpi-note num">净盈亏 ÷ 已结算投入 {{ summary.staked }}<br />含走盘，不含取消与待结算</p>
        </article>
        <article class="kpi panel">
          <h2 class="label">选择覆盖率</h2>
          <p class="kpi-value num">{{ coverageShown === null ? '—' : (coverageShown * 100).toFixed(0) }}<small v-if="coverageShown !== null">%</small></p>
          <p class="kpi-note num">有效选择 {{ summary.picks }} / 符合条件 {{ summary.analyzed }}<br />观望 {{ summary.passes }} · 数据不足 {{ summary.insufficient }}</p>
        </article>
      </div>

      <p v-if="decided > 0 && decided < SMALL_SAMPLE" class="alert reveal" style="--i: 3">样本只有 {{ decided }} 个，命中率的 95% 区间有 {{ summary.hitRange ? Math.round((summary.hitRange[1] - summary.hitRange[0]) * 100) : 0 }} 个百分点宽，目前还看不出这套方法是否有效。</p>

      <div class="grid-main reveal" style="--i: 4">
        <article class="panel panel-pad chart">
          <header class="panel-head">
            <h2 class="section-title">累计模拟盈亏<small>单位 · 按开赛时间</small></h2>
            <ul class="series-legend"><li v-for="item in series" :key="item.key"><i :style="{ background: item.color }"></i>{{ item.label }}</li></ul>
          </header>
          <EquityChart :series="series" />
        </article>
        <article class="panel panel-pad">
          <header class="panel-head"><h2 class="section-title">结算分布</h2></header>
          <OutcomeBars :rows="distribution" :total="summary" />
        </article>
      </div>

      <div class="grid-sub reveal" style="--i: 5">
        <article class="panel panel-pad">
          <header class="panel-head"><h2 class="section-title">按周表现<small>每周模拟净盈亏 · 最近 12 周</small></h2></header>
          <WeeklyBars :weeks="weeks" />
        </article>
        <article class="panel panel-pad">
          <header class="panel-head"><h2 class="section-title">按策略版本<small>规则变了就另存一版，分开比较</small></h2></header>
          <div class="table-wrap">
            <table class="table versions">
              <thead><tr><th>版本</th><th class="right">有效选择</th><th class="right">命中率</th><th class="right">模拟盈亏</th><th class="right">ROI</th></tr></thead>
              <tbody>
                <tr v-for="item in versions" :key="item.key">
                  <th scope="row">{{ item.label }}</th>
                  <td class="right num">{{ item.summary.picks }}</td>
                  <td class="right num">{{ percent(item.summary.hitRate) }}<small>样本 {{ item.summary.wins + item.summary.losses }}</small></td>
                  <td class="right num" :class="{ pos: item.summary.net > 0, neg: item.summary.net < 0 }">{{ item.summary.staked ? units(item.summary.net) : '—' }}</td>
                  <td class="right num" :class="{ pos: (item.summary.roi ?? 0) > 0, neg: (item.summary.roi ?? 0) < 0 }">{{ signedPercent(item.summary.roi) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <ul class="notes">
        <li>以上是按记录时的盘口和赔率计算的模拟表现，不代表真实成交，也不与个人实际盈亏混在一起。</li>
        <li>赔率不同，不赚不亏所需的命中率也不同，不能把“超过 50%”直接当作盈利；圆环上的琥珀色刻度就是这条线。</li>
        <li>观望和数据不足不产生投入；取消的比赛盈亏为 0，且不计入 ROI 的分母。</li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.filters { display: flex; align-items: center; gap: 10px 12px; flex-wrap: wrap; margin-bottom: 18px; }
.field { display: flex; align-items: center; gap: 8px; font-size: 12px; letter-spacing: .1em; color: var(--text-3); white-space: nowrap; }
.statistics > .alert { margin-bottom: 18px; }

.kpis { display: grid; grid-template-columns: minmax(0, 1.5fr) repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 18px; }
.kpi { padding: 20px 22px; }
.kpi h2 { margin: 0; font-weight: 400; }
.kpi-value { margin: 8px 0 8px; font-size: clamp(34px, 3.4vw, 46px); font-style: italic; font-weight: 800; letter-spacing: -.01em; line-height: 1; }
.kpi-value small { margin-left: 6px; font-size: 14px; font-style: normal; font-weight: 500; color: var(--text-3); }
.kpi-note { margin: 0; font-size: 12px; line-height: 1.7; color: var(--text-3); }
.kpi.hit { display: grid; grid-template-columns: auto 1fr; gap: 6px 22px; align-items: center; }
.hit-legend { grid-column: 1 / -1; display: flex; gap: 6px 20px; flex-wrap: wrap; margin: 6px 0 0; padding: 10px 0 0; border-top: 1px solid var(--line); list-style: none; font-size: 12px; color: var(--text-2); }
.hit-legend li { display: flex; align-items: center; gap: 8px; }
.hit-legend .band { width: 16px; height: 2px; background: rgba(148, 180, 210, .6); }
.hit-legend .tick { width: 3px; height: 12px; border-radius: 2px; background: var(--amber); }
.hit-legend span { color: var(--text); }

.grid-main { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 16px; margin-bottom: 16px; }
.grid-sub { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.series-legend { display: flex; gap: 16px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--text-2); }
.series-legend li { display: flex; align-items: center; gap: 7px; }
.series-legend i { width: 14px; height: 3px; border-radius: 2px; }
.chart { min-width: 0; }

.versions th[scope='row'] { padding: 11px 12px; border-bottom: 1px solid var(--line); font-size: 15px; font-style: italic; font-weight: 800; letter-spacing: 0; color: var(--text); }
.versions td { font-size: 15px; font-weight: 600; white-space: nowrap; }
.versions td small { display: block; font-size: 11px; font-weight: 400; color: var(--text-3); }

.notes { display: grid; gap: 6px; margin: 26px 0 0; padding: 16px 0 0 18px; border-top: 1px solid var(--line); font-size: 12px; line-height: 1.8; color: var(--text-3); }
@media (max-width: 1200px) {
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kpi.hit { grid-column: 1 / -1; }
  .grid-main, .grid-sub { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .kpis { grid-template-columns: minmax(0, 1fr); }
}
</style>
