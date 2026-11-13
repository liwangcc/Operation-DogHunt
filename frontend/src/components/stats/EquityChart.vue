<script setup lang="ts">
// 累计模拟盈亏：上面一张整体的走势，下面每个组成部分各一张小图，不把几条线叠在一起。曲线按结算日累计。
// 不用悬停就能读到的：期末、最高、最低、最大回撤。鼠标移到任意一张图上，或用左右方向键，逐个结算日查看。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { matchup, pickText, units } from '@/components/records/labels'
import EquityPlot from './EquityPlot.vue'
import { dayLabel, domainOf, extremesOf, nearestStep, scaleOf, toSteps, valueAt, xTicksOf, yTicksOf, type Domain, type EquitySeries, type Frame } from './equity'

/** 第一条是整体；其余是它的组成部分，各画一张小图。 */
const props = defineProps<{ series: EquitySeries[] }>()

/** 提示框里最多列几条同一天结算的记录。 */
const TIP_RECORDS = 4
/** 两张小图并排时中间的间隔。 */
const PART_GAP = 28
/** 提示框的宽度，以及它和十字线之间的距离。 */
const TIP_WIDTH = 256
const TIP_GAP = 16
/** 横轴上每隔大约多少像素放一个日期。 */
const TICK_SPACING = 96
const EMPTY_DOMAIN: Domain = { start: 0, end: 1, low: -1, high: 1 }

const host = ref<HTMLElement | null>(null)
const width = ref(800)
/** 当前查看的是整体曲线的第几个结算日。 */
const active = ref<number | null>(null)
let observer: ResizeObserver | null = null

const lines = computed(() => props.series.map((item) => ({ ...item, steps: toSteps(item.points) })))
const main = computed(() => lines.value[0])
const parts = computed(() => lines.value.slice(1))
const hasData = computed(() => !!main.value?.steps.length)
/** 整体那张图的范围。 */
const domain = computed(() => (hasData.value ? domainOf([main.value.steps]) : EMPTY_DOMAIN))
/**
 * 小图的范围：时间轴和上图对齐；纵轴由几张小图共用一套，彼此的高低可以直接比。
 * 不沿用上图的纵轴——各部分的起伏比整体小，套用整体的刻度会被压成一条平线。
 */
const partDomain = computed(() => {
  const filled = parts.value.map((item) => item.steps).filter((steps) => steps.length)
  return filled.length ? { ...domainOf(filled), start: domain.value.start, end: domain.value.end } : domain.value
})

const narrow = computed(() => width.value < 560)
const columns = computed(() => (parts.value.length > 1 && width.value >= 640 ? 2 : 1))
const mainFrame = computed<Frame>(() => ({ width: width.value, height: narrow.value ? 240 : 320, top: 28, right: narrow.value ? 56 : 66, bottom: 28, left: 40 }))
const partFrame = computed<Frame>(() => ({ width: columns.value === 2 ? Math.floor((width.value - PART_GAP) / 2) : width.value, height: 156, top: 14, right: 16, bottom: 26, left: 40 }))
const mainScale = computed(() => scaleOf(mainFrame.value, domain.value))

function ticksFor(frame: Frame, range: Domain, rows: number) {
  const inner = frame.width - frame.left - frame.right
  return { y: yTicksOf(range, rows), x: xTicksOf(range, Math.max(2, Math.floor(inner / TICK_SPACING))) }
}
const mainTicks = computed(() => ticksFor(mainFrame.value, domain.value, 8))
const partTicks = computed(() => ticksFor(partFrame.value, partDomain.value, 5))

/** 不用悬停就能读到的几个数。 */
const facts = computed(() => {
  const steps = main.value.steps
  return { last: steps[steps.length - 1], settled: main.value.points.length, ...extremesOf(steps) }
})

const focus = computed(() => {
  if (active.value === null || !hasData.value) return null
  const step = main.value.steps[active.value]
  if (!step) return null
  const x = mainScale.value.x(step.time)
  // 提示框贴着图面顶部，放在十字线旁边空间够的一侧，不盖住所指的点，也不伸出图面。窄屏上图面放不下它，改为停在图的下方。
  const tipWidth = Math.min(TIP_WIDTH, width.value)
  const side = x + TIP_GAP + tipWidth <= width.value || x < width.value / 2 ? x + TIP_GAP : x - TIP_GAP - tipWidth
  return {
    step,
    tipWidth,
    tipLeft: Math.max(0, Math.min(width.value - tipWidth, side)),
    values: lines.value.map((item) => ({ key: item.key, label: item.label, value: valueAt(item.steps, step.time) })),
    records: step.points.slice(0, TIP_RECORDS),
    more: Math.max(0, step.points.length - TIP_RECORDS),
  }
})
const activeTime = computed(() => focus.value?.step.time ?? null)

function tone(value: number): string {
  return value > 0 ? 'pos' : value < 0 ? 'neg' : ''
}

/** 任意一张图上的指针位置，都换成整体曲线上离它最近的结算日。 */
function hover(time: number): void {
  if (hasData.value) active.value = nearestStep(main.value.steps, time)
}

function onKeydown(event: KeyboardEvent): void {
  const last = main.value ? main.value.steps.length - 1 : -1
  if (last < 0) return
  let next: number | null
  if (event.key === 'Escape') next = null
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = last
  // 还没选中任何一天时，第一次按键落在最近的一个结算日上。
  else if (event.key === 'ArrowLeft') next = active.value === null ? last : Math.max(0, active.value - 1)
  else if (event.key === 'ArrowRight') next = active.value === null ? last : Math.min(last, active.value + 1)
  else return
  event.preventDefault()
  active.value = next
}

const summary = computed(() => {
  if (!hasData.value) return '累计模拟盈亏：没有已结算的记录'
  const { last, high, low, drawdown, settled } = facts.value
  const fall = drawdown ? `最大回撤 ${drawdown.depth.toFixed(2)} 单位` : '没有出现回撤'
  return `累计模拟盈亏：共 ${settled} 次结算，期末 ${units(last.total)} 单位，最高 ${units(high.total)}（${dayLabel(high.time)}），最低 ${units(low.total)}（${dayLabel(low.time)}），${fall}。按左右方向键逐个结算日查看。`
})
/** 读屏用：当前查看的这一天的全部内容。 */
const spoken = computed(() => {
  if (!focus.value) return ''
  const values = focus.value.values.map((item) => `${item.label}累计 ${units(item.value)} 单位`).join('，')
  const records = focus.value.step.points.map((point) => `${matchup(point.record)}，${pickText(point.record)}，${units(point.pnl)}`).join('；')
  return `${dayLabel(focus.value.step.time)}，${values}。当天结算 ${focus.value.step.points.length} 条，合计 ${units(focus.value.step.pnl)}：${records}`
})

// 换了数据就收起读数，免得指到别的记录上。
watch(() => props.series, () => {
  active.value = null
})

onMounted(() => {
  if (!host.value) return
  observer = new ResizeObserver(([entry]) => {
    width.value = Math.max(280, Math.round(entry.contentRect.width))
  })
  observer.observe(host.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="host" class="equity" tabindex="0" role="group" aria-roledescription="图表" :aria-label="summary" @keydown="onKeydown" @pointerleave="active = null" @blur="active = null">
    <template v-if="hasData">
      <dl class="facts">
        <div><dt>期末</dt><dd><strong class="num-display" :class="tone(facts.last.total)">{{ units(facts.last.total) }}</strong><small>单位</small></dd></div>
        <div><dt>最高</dt><dd><strong class="num-display" :class="tone(facts.high.total)">{{ units(facts.high.total) }}</strong><small>{{ dayLabel(facts.high.time) }}</small></dd></div>
        <div><dt>最低</dt><dd><strong class="num-display" :class="tone(facts.low.total)">{{ units(facts.low.total) }}</strong><small>{{ dayLabel(facts.low.time) }}</small></dd></div>
        <div title="从此前的最高点回落得最深的一次，按结算日计；起点的 0 也算高点">
          <dt>最大回撤</dt>
          <dd v-if="facts.drawdown"><strong class="num-display">−{{ facts.drawdown.depth.toFixed(2) }}</strong><small>{{ facts.drawdown.from ? dayLabel(facts.drawdown.from.time) : '起点' }} → {{ dayLabel(facts.drawdown.to.time) }}</small></dd>
          <dd v-else><strong class="num-display">0.00</strong><small>没有回落</small></dd>
        </div>
        <div><dt>已结算</dt><dd><strong class="num-display">{{ facts.settled }}</strong><small>次</small></dd></div>
      </dl>

      <div class="equity-main">
        <EquityPlot :steps="main.steps" :domain="domain" :frame="mainFrame" :y-ticks="mainTicks.y" :x-ticks="mainTicks.x" :active-time="activeTime" @hover="hover" />
        <div v-if="focus" class="tip" aria-hidden="true" :class="{ docked: narrow }" :style="narrow ? undefined : { left: `${focus.tipLeft}px`, width: `${focus.tipWidth}px` }">
          <p class="tip-when num">{{ dayLabel(focus.step.time) }} · 第 {{ (active ?? 0) + 1 }} / {{ main.steps.length }} 个结算日</p>
          <p class="tip-caption">截至当天的累计</p>
          <ul class="tip-values">
            <li v-for="item in focus.values" :key="item.key"><span>{{ item.label }}</span><strong class="num-display" :class="tone(item.value)">{{ units(item.value) }}</strong></li>
          </ul>
          <ul class="tip-records">
            <li class="tip-day"><span>当天结算 {{ focus.step.points.length }} 条</span><b class="num-display" :class="tone(focus.step.pnl)">{{ units(focus.step.pnl) }}</b></li>
            <li v-for="point in focus.records" :key="point.record.id"><span>{{ matchup(point.record) }} · {{ pickText(point.record) }}</span><b class="num-display" :class="tone(point.pnl)">{{ units(point.pnl) }}</b></li>
            <li v-if="focus.more" class="tip-more">另有 {{ focus.more }} 条，见预测记录</li>
          </ul>
        </div>
      </div>

      <div v-if="parts.length" class="equity-parts" :class="{ two: columns === 2 }">
        <section v-for="part in parts" :key="part.key" class="part">
          <header class="part-head">
            <h3>{{ part.label }}</h3>
            <template v-if="part.steps.length">
              <strong class="num-display" :class="tone(part.steps[part.steps.length - 1].total)">{{ units(part.steps[part.steps.length - 1].total) }}</strong>
              <small>期末 · {{ part.points.length }} 次结算</small>
            </template>
          </header>
          <EquityPlot v-if="part.steps.length" compact :steps="part.steps" :domain="partDomain" :frame="partFrame" :y-ticks="partTicks.y" :x-ticks="partTicks.x" :active-time="activeTime" @hover="hover" />
          <p v-else class="part-none">没有已结算的记录</p>
        </section>
      </div>

      <p class="equity-hint">曲线按结算日累计：每天取当天全部结算之后的数。<template v-if="parts.length">下面几张小图和上图共用时间轴，彼此共用一套纵轴刻度。</template>鼠标移到图上，或点一下图再按 ← → 键，逐天查看。</p>
    </template>
    <p v-else class="equity-none">当前筛选下还没有已结算的记录。</p>

    <p class="sr-only" aria-live="polite">{{ spoken }}</p>
  </div>
</template>

<style scoped>
.equity { position: relative; min-height: 240px; outline-offset: 6px; touch-action: pan-y; }

/* 直接读数：不用把鼠标移到图上也能知道的几个数。 */
.facts { display: flex; flex-wrap: wrap; gap: 12px 0; margin: 0 0 14px; }
.facts > div { display: grid; gap: 4px; min-width: 0; padding: 0 26px; border-left: 1px solid var(--line-2); }
.facts > div:first-child { padding-left: 0; border-left: 0; }
.facts dt { font-size: 12px; letter-spacing: .08em; color: var(--text-3); white-space: nowrap; }
.facts dd { display: flex; align-items: baseline; gap: 8px; margin: 0; white-space: nowrap; }
.facts strong { font-size: 20px; font-weight: 500; line-height: 1.1; }
.facts small { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--text-3); }

.equity-main { position: relative; }

.equity-parts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px 28px; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
.equity-parts.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.part { min-width: 0; }
.part-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
.part-head h3 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: .06em; }
.part-head strong { font-size: 17px; font-weight: 500; }
.part-head small { font-size: 12px; color: var(--text-3); }
.part-none { display: grid; place-items: center; height: 156px; margin: 0; font-size: 12px; color: var(--text-3); }

.equity-hint { margin: 14px 0 0; font-size: 12px; line-height: 1.7; color: var(--text-3); }
.equity-none { display: grid; place-items: center; min-height: 240px; margin: 0; font-size: 13px; color: var(--text-3); }

/* 提示框：贴着图面顶部、放在十字线旁边，位置由脚本算好；不跟着所指的点上下跳。 */
.tip { position: absolute; top: 0; z-index: 2; padding: 10px 12px; border: 1px solid var(--line-3); border-radius: var(--radius); background: var(--panel-solid); box-shadow: 0 12px 30px rgba(0, 0, 0, .5); pointer-events: none; white-space: nowrap; }
/* 窄屏：浮在图上会把图整个盖住，所以停在图的下方，跟着所选的那一天换内容。 */
.tip.docked { position: static; margin-top: 8px; box-shadow: none; white-space: normal; }
.tip p, .tip ul { margin: 0; padding: 0; list-style: none; }
.tip-when { font-size: 11.5px; color: var(--text-3); }
.tip-caption { margin-top: 9px !important; font-size: 11.5px; letter-spacing: .06em; color: var(--text-3); }
/* 数值在前：这一行里最醒目的是数，名称退后。 */
.tip-values { display: grid; gap: 3px; margin-top: 4px !important; }
.tip-values li { display: flex; align-items: baseline; justify-content: space-between; gap: 22px; font-size: 12px; color: var(--text-2); }
.tip-values strong { font-size: 15px; font-weight: 500; color: var(--text); }
.tip-values li:first-child strong { font-size: 18px; }
.tip-values strong.pos, .tip-records b.pos { color: var(--green); }
.tip-values strong.neg, .tip-records b.neg { color: var(--red); }
.tip-records { display: grid; gap: 3px; margin-top: 9px !important; padding-top: 9px !important; border-top: 1px solid var(--line); }
.tip-records li { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; font-size: 12px; color: var(--text-2); }
.tip-records span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tip-records b { font-size: 13px; font-weight: 500; color: var(--text); }
.tip-day { margin-bottom: 2px; color: var(--text-3) !important; }
.tip-more { color: var(--text-3) !important; }

@media (max-width: 700px) {
  .facts { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; gap: 12px 22px; }
  .facts > div { padding: 0; border-left: 0; }
  .facts strong { font-size: 17px; }
}
</style>
