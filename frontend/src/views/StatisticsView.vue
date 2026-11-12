<script setup lang="ts">
import { computed, ref } from 'vue'
import ProfitChart from '@/features/statistics/ProfitChart.vue'
import { dailyProfits, DEMO_END, demoRecords, offsetDay, summarize } from '@/features/statistics/data'
import type { Market, RecordSource } from '@/features/statistics/data'

const demo = ref(true)
const period = ref('30')
const market = ref<'all' | Market>('all')
const version = ref('all')
const source = ref<RecordSource>('pregame')
const showFilters = ref(false)
const markets = [{ key: 'all', label: '全部' }, { key: 'spreads', label: '让分' }, { key: 'totals', label: '大小分' }] as const
const start = computed(() => offsetDay(DEMO_END, period.value === 'all' ? -59 : 1 - Number(period.value)))
const scopedRecords = computed(() => demo.value ? demoRecords.filter(record => record.date >= start.value && record.date <= DEMO_END
  && record.source === source.value && (version.value === 'all' || record.version === version.value)) : [])
const records = computed(() => scopedRecords.value.filter(record => market.value === 'all' || record.market === market.value))
const summary = computed(() => summarize(records.value))
const points = computed(() => dailyProfits(records.value, start.value, DEMO_END))
const comparison = computed(() => markets.filter(item => item.key !== 'all').map(item => ({ ...item,
  summary: summarize(scopedRecords.value.filter(record => record.market === item.key)),
})))
const extraFilters = computed(() => Number(version.value !== 'all') + Number(source.value !== 'pregame'))
const percent = (value: number | null, sign = false) => value === null ? '—' : `${sign && value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}%`
const amount = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`
const resultItems = computed(() => [
  { label: '赢盘', count: summary.value.wins, color: '#548365' },
  { label: '输盘', count: summary.value.losses, color: '#bd8774' },
  { label: '走盘', count: summary.value.pushes, color: '#baa475' },
  { label: '待结算', count: summary.value.pending, color: '#a4b3bc' },
  { label: '取消 / 无效', count: summary.value.cancelled, color: '#d3d9cd' },
])
const resultCount = computed(() => resultItems.value.reduce((sum, item) => sum + item.count, 0))
function resetFilters() { period.value = '30'; market.value = 'all'; version.value = 'all'; source.value = 'pregame' }
</script>

<template>
  <section class="statistics-page" aria-labelledby="statistics-title">
    <header class="statistics-heading">
      <div>
        <span class="statistics-eyebrow"><i></i> PERFORMANCE REVIEW</span>
        <div class="statistics-title-row"><h1 id="statistics-title">效果统计</h1><span class="statistics-badge">{{ demo ? '演示数据' : '正式数据待接入' }}</span></div>
        <p>从每一次判断，看到长期的表现。</p>
      </div>
      <div class="statistics-controls">
        <label class="sr-only" for="statistics-period">统计时间范围</label>
        <select id="statistics-period" v-model="period" :disabled="!demo"><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="all">全部时间</option></select>
        <button class="statistics-filter-button" :aria-expanded="showFilters && demo" aria-controls="statistics-filters" :disabled="!demo" @click="showFilters = !showFilters"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5h12M2 11h12M6 3v4m4 2v4" /></svg>更多筛选<span v-if="extraFilters" class="filter-count">{{ extraFilters }}</span></button>
      </div>
    </header>

    <div class="statistics-preview-note"><span><i aria-hidden="true"></i>{{ demo ? '示例预览 · 用于体验界面，所有数字均为演示' : '正式统计 · 等待预测记录与赛后结算接入' }}</span><button @click="demo = !demo">{{ demo ? '查看正式数据' : '返回示例预览' }} <span aria-hidden="true">↗</span></button></div>

    <div v-if="showFilters && demo" id="statistics-filters" class="statistics-filter-panel">
      <label>策略版本<select v-model="version" aria-label="策略版本"><option value="all">全部版本</option><option value="v1">基础策略 v1</option><option value="v2">调整策略 v2</option></select></label>
      <label>记录来源<select v-model="source" aria-label="记录来源"><option value="pregame">赛前记录</option><option value="manual">人工补录</option></select></label>
      <button @click="resetFilters">重置筛选</button>
      <p>不同来源分别统计，普通聊天追问不计入样本。</p>
    </div>

    <div class="statistics-scope"><span>{{ demo ? `${start.replaceAll('-', '/')} — ${DEMO_END.replaceAll('-', '/')}` : '尚未读取正式数据' }}<span v-if="demo" class="scope-dot">·</span><span v-if="demo">{{ source === 'pregame' ? '赛前记录' : '人工补录' }} · {{ version === 'all' ? '全部版本' : version === 'v1' ? '基础策略 v1' : '调整策略 v2' }}</span></span><span>我的选场复盘</span></div>

    <template v-if="demo">
      <div class="statistics-market-tabs" role="group" aria-label="统计玩法"><button v-for="item in markets" :key="item.key" :class="{ active: market === item.key }" :aria-pressed="market === item.key" @click="market = item.key">{{ item.label }}</button></div>
      <div class="statistics-metrics" aria-label="整体表现">
        <article class="statistics-metric primary"><span>累计模拟收益<small>CNY</small></span><div :class="{ negative: summary.profit < 0 }">{{ summary.settled ? amount(summary.profit) : '—' }}<small v-if="summary.settled">元</small></div><p>每个有效选择模拟投入 1 元</p></article>
        <article class="statistics-metric"><span>模拟收益率 <abbr title="ROI：模拟净盈亏 ÷ 已结算投入">ROI</abbr></span><div :class="{ positive: summary.roi !== null && summary.roi > 0, negative: summary.roi !== null && summary.roi < 0 }">{{ percent(summary.roi, true) }}</div><p>{{ summary.settled ? `基于 ${summary.settled} 元已结算投入` : '有已结算选择后计算' }}</p></article>
        <article class="statistics-metric"><span>整体命中率</span><div>{{ percent(summary.hitRate) }}</div><p><b class="win-dot"></b>{{ summary.wins }} 赢<span class="metric-divider">/</span><b class="loss-dot"></b>{{ summary.losses }} 输<span class="metric-explanation">不含走盘</span></p></article>
        <article class="statistics-metric"><span>已结算选择</span><div>{{ summary.settled }}<small>笔</small></div><p>另有 {{ summary.pending }} 笔待结算</p></article>
      </div>

      <section v-if="summary.settled" class="statistics-chart-panel" aria-labelledby="statistics-chart-heading">
        <div class="statistics-panel-heading"><div><span class="panel-eyebrow">THE BIG PICTURE</span><h2 id="statistics-chart-heading">累计模拟收益走势</h2><p>按记录盘口与赔率计算，所选区间从 0 开始累计。</p></div><span class="statistics-chart-market">{{ markets.find(item => item.key === market)?.label }}<span> · {{ summary.settled }} 笔已结算</span></span></div>
        <ProfitChart :points="points" />
      </section>
      <div v-else class="statistics-empty" role="status"><span class="empty-symbol" aria-hidden="true">↗</span><h2>{{ records.length ? '这些记录还没有可结算的结果' : '当前筛选下暂无记录' }}</h2><p>{{ records.length ? '待结算、观望和数据不足不会被当作输盘，也不计入模拟收益。' : '试试其他时间范围、策略版本或记录来源。没有样本时，比例显示为横线。' }}</p><button @click="resetFilters">重置筛选</button></div>

      <div class="statistics-section-heading"><div><span class="panel-eyebrow">A CLOSER LOOK</span><h2>拆开看，判断更清楚。</h2></div><RouterLink to="/records">查看预测记录 <span aria-hidden="true">↗</span></RouterLink></div>
      <div class="statistics-comparisons">
        <article v-for="item in comparison" :key="item.key" class="statistics-comparison" :class="{ selected: market === item.key }">
          <div class="comparison-heading"><h3><span aria-hidden="true">{{ item.key === 'spreads' ? '±' : '≷' }}</span>{{ item.label }}表现</h3><button :aria-label="`查看${item.label}走势`" @click="market = item.key">查看走势 <span aria-hidden="true">↗</span></button></div>
          <div class="comparison-values"><div><span>已结算</span><strong>{{ item.summary.settled }}<small>笔</small></strong></div><div><span>命中率</span><strong>{{ percent(item.summary.hitRate) }}</strong></div><div><span>模拟收益</span><strong :class="{ positive: item.summary.profit > 0, negative: item.summary.profit < 0 }">{{ item.summary.settled ? amount(item.summary.profit) : '—' }}<small v-if="item.summary.settled">元</small></strong></div></div>
          <p>{{ item.summary.wins }} 赢 · {{ item.summary.losses }} 输 · {{ item.summary.pushes }} 走盘<span>{{ item.summary.pending }} 笔待结算</span></p>
        </article>
      </div>

      <section class="statistics-distribution" aria-labelledby="statistics-distribution-title"><div class="distribution-label"><h2 id="statistics-distribution-title">记录去向</h2><p>{{ markets.find(item => item.key === market)?.label }} · 当前筛选范围</p></div><div class="distribution-content"><div class="distribution-bar" aria-hidden="true"><span v-for="item in resultItems" :key="item.label" :style="{ width: `${resultCount ? item.count / resultCount * 100 : 0}%`, background: item.color }"></span></div><ul><li v-for="item in resultItems" :key="item.label"><i :style="{ background: item.color }"></i>{{ item.label }}<strong>{{ item.count }}</strong></li></ul></div><div class="distribution-aside"><span>观望 <strong>{{ summary.watch }}</strong></span><span>数据不足 <strong>{{ summary.insufficient }}</strong></span><small>未产生有效选择，不计入投入</small></div></section>
    </template>

    <div v-else class="statistics-empty official-empty" role="status"><span class="empty-symbol" aria-hidden="true">↗</span><span class="panel-eyebrow">YOUR NEXT CHAPTER</span><h2>每一次判断，都值得留下。</h2><p>正式预测记录与赛后结算尚未接入。接入后，这里会汇总你的选场表现和模拟收益走势。</p><div><button @click="demo = true">先看看示例效果</button><RouterLink to="/records">前往预测记录 <span aria-hidden="true">↗</span></RouterLink></div></div>

    <footer class="statistics-footer"><p>按记录盘口和赔率计算的模拟表现，不代表实际成交或个人真实盈亏。</p><details><summary>统计口径说明</summary><ul><li>命中率 = 赢盘数 ÷（赢盘数 + 输盘数）；走盘、取消和待结算不参与计算。</li><li>每个有效选择固定模拟投入 1 元。赢盘收益为十进制赔率 − 1，输盘为 −1，走盘为 0。</li><li>模拟收益率 = 模拟净收益 ÷ 已结算投入；走盘计入投入，取消、待结算、观望和数据不足不计入。</li><li>让分与大小分分别按选择计数，同一场比赛可以有两个选择；策略版本与记录来源以当前筛选为准。</li><li>当前为固定日期的演示记录，时间按记录日期筛选，曲线按演示结算日汇总；未连接预测记录页的示例或真实数据。</li></ul></details></footer>
  </section>
</template>

<style scoped>
.statistics-page { max-width: 1360px; padding: 38px 48px 28px; margin: auto; color: #203a36; }
.statistics-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.statistics-eyebrow { display: flex; align-items: center; gap: 7px; font-size: 9px; letter-spacing: 2px; color: #81917d; }
.statistics-eyebrow i { width: 5px; height: 5px; border-radius: 50%; background: #aa9056; }
.statistics-title-row { display: flex; align-items: center; gap: 14px; margin-top: 9px; }
.statistics-title-row h1 { font-size: 29px; margin: 0; letter-spacing: -.7px; }
.statistics-badge { font-size: 10px; line-height: 1.4; padding: 4px 7px; border: 1px solid #c6b57f; border-radius: 4px; color: #8c7743; background: #f4f0e5; white-space: nowrap; }
.statistics-heading p { font-size: 12px; color: #7b897c; margin: 9px 0 0; letter-spacing: .3px; }
.statistics-controls { display: flex; gap: 9px; align-items: center; }
.statistics-page select, .statistics-filter-button { font: inherit; font-size: 11px; color: #46604f; border: 1px solid #d6dfd1; border-radius: 6px; min-height: 36px; padding: 8px 12px; background: #fcfdfb; }
.statistics-page select { cursor: pointer; max-width: 100%; }
.statistics-page select:disabled { cursor: default; opacity: .5; }
.statistics-filter-button { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.statistics-filter-button:hover, .statistics-page select:hover { border-color: #9caf94; }
.statistics-filter-button svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.3; }
.filter-count { background: #e3ecde; border-radius: 3px; font-size: 10px; padding: 0 4px; }
.statistics-preview-note { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 11px 0; margin-top: 18px; font-size: 10px; color: #8a7c58; border-bottom: 1px solid #e1e7dc; }
.statistics-preview-note i { display: inline-block; width: 5px; height: 5px; background: #b79f63; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.statistics-preview-note button { border: 0; background: transparent; color: #667e63; padding: 4px 0; font-size: 10px; }
.statistics-preview-note button span { margin-left: 5px; }
.statistics-filter-panel { padding: 18px; background: #eef2e9; border: 1px solid #dce5d5; border-radius: 8px; margin-top: 14px; display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
.statistics-filter-panel label { display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: #61745e; }
.statistics-filter-panel select { min-width: 160px; }
.statistics-filter-panel button { background: transparent; border: 0; color: #486d4b; font-size: 11px; padding: 9px 3px; text-decoration: underline; }
.statistics-filter-panel p { margin: 0; width: 100%; color: #7c8b75; font-size: 10px; }
.statistics-scope { display: flex; justify-content: space-between; gap: 12px; margin: 17px 0 15px; color: #82907d; font-size: 10px; font-variant-numeric: tabular-nums; }
.scope-dot { margin: 0 9px; }
.statistics-scope > span:last-child { color: #9a9c86; flex-shrink: 0; }
.statistics-market-tabs { display: flex; gap: 4px; margin-bottom: 16px; }
.statistics-market-tabs button { border: 0; border-radius: 5px; background: transparent; color: #7b8974; font-size: 12px; min-width: 64px; padding: 7px 12px; }
.statistics-market-tabs button.active { color: #315d3f; background: #e5eddf; font-weight: 600; }
.statistics-market-tabs button:hover { background: #ecf1e7; }
.statistics-metrics { display: grid; grid-template-columns: 1.18fr 1fr 1fr 1fr; gap: 13px; }
.statistics-metric { border: 1px solid #dee5d8; border-radius: 9px; background: #fcfdfb; padding: 18px 20px 16px; min-width: 0; }
.statistics-metric.primary { background: linear-gradient(135deg, #eff5ea, #fcfdfb); border-color: #cedcc7; }
.statistics-metric > span { font-size: 11px; color: #61735c; display: flex; align-items: center; gap: 6px; }
.statistics-metric > span small { font-size: 8px; letter-spacing: 1.4px; color: #98a18d; margin-left: auto; }
.statistics-metric abbr { text-decoration: none; border: 1px solid #d7dfd1; font-size: 8px; border-radius: 3px; padding: 0 3px; cursor: help; color: #85907d; }
.statistics-metric > div { margin: 12px 0 8px; font-size: clamp(24px, 2.5vw, 34px); line-height: 1.2; font-weight: 550; letter-spacing: -.7px; font-variant-numeric: tabular-nums; }
.statistics-metric.primary > div { color: #39724b; font-size: clamp(28px, 2.9vw, 39px); }
.statistics-metric > div small { font-weight: 400; font-size: 12px; letter-spacing: 0; margin-left: 7px; }
.statistics-metric p { color: #88927f; font-size: 10px; margin: 0; line-height: 1.6; }
.metric-divider { margin: 0 7px; color: #b9c0b0; }
.metric-explanation { margin-left: 8px; color: #9ba28f; font-size: 9px; white-space: nowrap; }
.statistics-metric p b { display: inline-block; width: 4px; height: 4px; border-radius: 50%; margin: 0 4px 2px 0; }
.win-dot { background: #548365; }.loss-dot { background: #bd8774; }
.statistics-chart-panel { margin-top: 19px; border: 1px solid #dde5d6; border-radius: 10px; background: #fcfdfb; padding: 23px 26px 19px; }
.statistics-panel-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.panel-eyebrow { color: #a0936e; font-size: 8px; letter-spacing: 1.9px; }
.statistics-panel-heading h2 { margin: 5px 0; font-size: 16px; font-weight: 600; letter-spacing: -.2px; }
.statistics-panel-heading p { margin: 0; color: #87917f; font-size: 10px; }
.statistics-chart-market { color: #557351; font-size: 10px; padding: 5px 10px; border-radius: 5px; background: #eff3e9; white-space: nowrap; }
.statistics-chart-market > span { color: #8a967f; }
.statistics-section-heading { margin: 29px 0 13px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.statistics-section-heading h2 { margin: 3px 0 0; font-size: 16px; font-weight: 550; }
.statistics-section-heading > a { color: #8e7b48; font-size: 11px; padding-bottom: 2px; }
.statistics-section-heading > a span { margin-left: 5px; }
.statistics-comparisons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.statistics-comparison { border: 1px solid #dfe5d8; border-radius: 9px; padding: 18px 22px 12px; background: #fcfdfb; }
.statistics-comparison.selected { border-color: #9db491; }
.comparison-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.comparison-heading h3 { margin: 0; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.comparison-heading h3 > span { width: 25px; height: 25px; border-radius: 6px; display: grid; place-items: center; background: #edf2e7; color: #7c9170; font-size: 15px; font-weight: 400; }
.comparison-heading button { font-size: 10px; color: #7f9275; border: 0; background: transparent; padding: 4px 0; }
.comparison-values { display: grid; grid-template-columns: .8fr 1fr 1.1fr; margin: 19px 0 16px; }
.comparison-values > div { display: flex; flex-direction: column; gap: 5px; border-right: 1px solid #e7ebdf; padding-left: 18px; }
.comparison-values > div:first-child { padding-left: 0; }.comparison-values > div:last-child { border: 0; }
.comparison-values span { color: #8b947f; font-size: 10px; }.comparison-values strong { font-size: 21px; font-weight: 550; font-variant-numeric: tabular-nums; line-height: 1.3; white-space: nowrap; }
.comparison-values small { font-size: 10px; font-weight: 400; color: #8c9780; margin-left: 4px; }
.statistics-comparison > p { border-top: 1px solid #ecf0e7; padding-top: 10px; margin: 0; font-size: 10px; color: #8b957f; display: flex; justify-content: space-between; gap: 8px; }
.statistics-distribution { margin-top: 17px; padding: 20px 22px; display: grid; grid-template-columns: 130px 1fr 155px; align-items: center; gap: 24px; border: 1px solid #dfe5d8; border-radius: 9px; }
.distribution-label h2 { font-size: 12px; font-weight: 550; margin: 0 0 4px; }.distribution-label p { font-size: 9px; color: #8b947e; margin: 0; }
.distribution-bar { display: flex; height: 6px; background: #e8ede2; border-radius: 4px; overflow: hidden; gap: 2px; }
.distribution-content ul { list-style: none; padding: 0; margin: 11px 0 0; display: flex; flex-wrap: wrap; gap: 7px 15px; }
.distribution-content li { display: flex; align-items: center; gap: 4px; color: #83917b; font-size: 9px; }.distribution-content i { width: 5px; height: 5px; border-radius: 50%; }.distribution-content strong { color: #526a4a; font-weight: 500; }
.distribution-aside { display: flex; gap: 6px 15px; flex-wrap: wrap; border-left: 1px solid #dfe5d8; padding-left: 20px; color: #89917f; font-size: 10px; }
.distribution-aside strong { font-weight: 500; color: #5a7050; margin-left: 4px; }.distribution-aside small { font-size: 8px; color: #9ba38e; width: 100%; }
.statistics-footer { font-size: 10px; color: #909984; margin-top: 22px; padding-top: 15px; border-top: 1px solid #e2e7db; line-height: 1.8; }
.statistics-footer > p { margin: 0 0 7px; }.statistics-footer summary { cursor: pointer; color: #7f8b73; display: list-item; }.statistics-footer ul { padding-left: 18px; max-width: 850px; }
.statistics-empty { border: 1px dashed #d5dfcb; padding: 45px 24px; margin-top: 20px; background: #fcfdfb; border-radius: 10px; text-align: center; }
.empty-symbol { display: grid; place-items: center; margin: 0 auto 18px; width: 48px; height: 48px; border-radius: 14px; color: #7f9772; background: #edf2e5; font-size: 26px; }
.statistics-empty h2 { font-size: 19px; font-weight: 550; margin: 10px 0; }.statistics-empty p { max-width: 430px; margin: 0 auto 22px; font-size: 12px; color: #88957f; line-height: 1.9; }
.statistics-empty button { border: 1px solid #315a40; background: #315a40; color: white; font-size: 12px; padding: 9px 16px; border-radius: 5px; }
.official-empty { margin: 40px 0 50px; padding-top: 65px; padding-bottom: 65px; }.official-empty > div { display: flex; gap: 20px; justify-content: center; align-items: center; }.official-empty a { color: #6e8260; font-size: 12px; }
.positive { color: #39724b; }.negative, .statistics-metric.primary > div.negative { color: #a06550; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (min-width: 1600px) { .statistics-page { padding-left: 64px; padding-right: 64px; } }
@media (max-width: 1100px) { .statistics-page { padding: 30px 28px 24px; }.statistics-metrics { gap: 10px; }.statistics-metric { padding: 16px 14px; }.statistics-distribution { grid-template-columns: 100px 1fr; gap: 18px; }.distribution-aside { grid-column: 2; border-left: 0; padding-left: 0; }.metric-explanation { display: none; } }
@media (max-width: 850px) { .statistics-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }.statistics-metric > div { font-size: 30px; }.statistics-metric.primary > div { font-size: 34px; }.statistics-heading { align-items: flex-start; }.statistics-controls { flex-wrap: wrap; justify-content: flex-end; }.comparison-values > div { padding-left: 10px; }.statistics-comparison { padding: 16px; }.comparison-values strong { font-size: 19px; } }
@media (max-width: 700px) { .statistics-page { padding: 28px 20px 20px; }.statistics-title-row h1 { font-size: 25px; }.statistics-heading { flex-direction: column; gap: 18px; }.statistics-controls { width: 100%; justify-content: space-between; }.statistics-controls > select { flex: 1; }.statistics-controls > button { flex: 1; justify-content: center; }.statistics-preview-note { margin-top: 12px; }.statistics-scope { flex-wrap: wrap; row-gap: 5px; }.statistics-scope > span:first-child { display: flex; flex-wrap: wrap; gap: 3px 6px; }.scope-dot { display: none; }.statistics-metric { padding: 15px 13px; }.statistics-metric > div { font-size: 29px; }.statistics-metric.primary > div { font-size: 32px; }.statistics-metric p { font-size: 9px; }.statistics-metric > span small { display: none; }.statistics-chart-panel { padding: 18px 15px; }.statistics-panel-heading { align-items: flex-start; flex-direction: column; gap: 10px; }.statistics-comparisons { grid-template-columns: 1fr; gap: 12px; }.comparison-values strong { font-size: 23px; }.statistics-section-heading h2 { font-size: 14px; }.statistics-section-heading > a { font-size: 10px; }.statistics-distribution { padding: 18px 16px; grid-template-columns: 1fr; gap: 14px; }.distribution-aside { grid-column: 1; padding-top: 12px; border-top: 1px solid #e0e6d7; }.distribution-aside small { width: auto; }.statistics-filter-panel { gap: 12px; }.statistics-filter-panel label { flex: 1; min-width: 120px; }.statistics-filter-panel select { min-width: 0; width: 100%; }.official-empty { padding: 45px 18px; }.official-empty > div { flex-direction: column; gap: 15px; } }
</style>
