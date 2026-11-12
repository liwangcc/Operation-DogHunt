<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { DailyProfit } from './data'

const props = defineProps<{ points: DailyProfit[] }>()
const selected = ref<number | null>(null)
watch(() => props.points, () => { selected.value = null })
const chartElement = ref<SVGSVGElement | null>(null)
const width = ref(960)
const height = computed(() => width.value < 500 ? 230 : 300)
const left = 36, right = 16, top = 22, bottom = 32
const plotWidth = computed(() => width.value - left - right)
const plotHeight = computed(() => height.value - top - bottom)
let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  if (!chartElement.value) return
  resizeObserver = new ResizeObserver(entries => {
    const measured = entries[0]?.contentRect.width
    if (measured) width.value = Math.max(240, measured)
  })
  resizeObserver.observe(chartElement.value)
})
onUnmounted(() => resizeObserver?.disconnect())
const extent = computed(() => {
  const values = [0, ...props.points.map(point => point.cumulative)]
  const minimum = Math.min(...values), maximum = Math.max(...values)
  const step = Math.max(1, Math.ceil((maximum - minimum) / 4))
  return { min: Math.floor(Math.min(minimum, -step) / step) * step, max: Math.ceil(Math.max(maximum, step) / step) * step, step }
})
const x = (index: number) => left + (props.points.length <= 1 ? 0 : index / (props.points.length - 1) * plotWidth.value)
const y = (value: number) => top + (extent.value.max - value) / (extent.value.max - extent.value.min) * plotHeight.value
const ticks = computed(() => {
  const result: number[] = []
  for (let value = extent.value.min; value <= extent.value.max; value += extent.value.step) result.push(value)
  return result
})
const path = computed(() => props.points.map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point.cumulative)}`).join(' '))
const fill = computed(() => props.points.length ? `${path.value} L${x(props.points.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : '')
const dateTicks = computed(() => [...new Set([0, Math.floor((props.points.length - 1) / 3), Math.floor((props.points.length - 1) * 2 / 3), props.points.length - 1])].filter(index => index >= 0))
const activeIndex = computed(() => selected.value ?? Math.max(0, props.points.length - 1))
const activePoint = computed(() => props.points[activeIndex.value])
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`
function move(event: PointerEvent) {
  const bounds = (event.currentTarget as SVGElement).getBoundingClientRect()
  const chartX = (event.clientX - bounds.left) / bounds.width * width.value
  selected.value = Math.min(props.points.length - 1, Math.max(0, Math.round((chartX - left) / plotWidth.value * (props.points.length - 1))))
}
function key(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  selected.value = event.key === 'Home' ? 0 : event.key === 'End' ? props.points.length - 1
    : Math.max(0, Math.min(props.points.length - 1, activeIndex.value + (event.key === 'ArrowLeft' ? -1 : 1)))
}
</script>

<template>
  <div class="profit-chart">
    <div class="chart-readout" aria-live="polite" aria-atomic="true">
      <span>{{ activePoint?.date.replaceAll('-', '/') }}<small>{{ selected === null ? '最新累计' : '当日明细' }}</small></span>
      <div><span>累计 <strong>{{ signed(activePoint?.cumulative ?? 0) }}</strong></span><span>当日 {{ signed(activePoint?.profit ?? 0) }}</span><span>{{ activePoint?.settled ?? 0 }} 笔结算</span></div>
    </div>
    <svg ref="chartElement" :viewBox="`0 0 ${width} ${height}`" role="img" tabindex="0" aria-label="累计模拟收益曲线。使用左右方向键查看每天的收益，Home 和 End 跳到起点和终点。" @pointermove="move" @pointerleave="selected = null" @keydown="key" @blur="selected = null">
      <title>累计模拟收益走势</title>
      <desc>从零开始累计当前筛选内的收益；{{ points.length }} 天，最新累计 {{ signed(points.at(-1)?.cumulative ?? 0) }} 元。</desc>
      <defs><linearGradient id="statistics-profit-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#75ab7d" stop-opacity=".23" /><stop offset="100%" stop-color="#75ab7d" stop-opacity=".02" /></linearGradient></defs>
      <g v-for="tick in ticks" :key="tick" class="chart-tick"><line :x1="left" :x2="width - right" :y1="y(tick)" :y2="y(tick)" :class="{ 'zero-line': tick === 0 }" /><text :x="left - 12" :y="y(tick) + 4" text-anchor="end">{{ tick > 0 ? `+${tick}` : tick }}</text></g>
      <path :d="fill" fill="url(#statistics-profit-fill)" />
      <path :d="path" fill="none" stroke="#3f805b" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" />
      <g v-for="index in dateTicks" :key="index" class="chart-tick"><text :x="x(index)" :y="height - 12" :text-anchor="index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'">{{ points[index]?.date.slice(5).replace('-', '/') }}</text></g>
      <g v-if="activePoint"><line v-if="selected !== null" :x1="x(activeIndex)" :x2="x(activeIndex)" :y1="top" :y2="height - bottom" stroke="#a9bca7" stroke-dasharray="4 5" /><circle :cx="x(activeIndex)" :cy="y(activePoint.cumulative)" r="7" fill="#3f805b" fill-opacity=".12" /><circle :cx="x(activeIndex)" :cy="y(activePoint.cumulative)" r="4" fill="#3f805b" stroke="#fff" stroke-width="2" /></g>
    </svg>
    <div class="chart-caption"><span><i></i> 累计模拟收益 <span class="caption-unit">· 元</span></span><span>悬停或使用方向键查看每日明细</span></div>
  </div>
</template>

<style scoped>
.chart-readout { min-height: 42px; margin: 22px 0 2px; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #758277; font-size: 11px; }
.chart-readout > span { font-variant-numeric: tabular-nums; }
.chart-readout small { margin-left: 10px; font-size: 10px; color: #8d978b; }
.chart-readout > div { display: flex; align-items: baseline; gap: 18px; font-variant-numeric: tabular-nums; }
.chart-readout strong { font-size: 18px; font-weight: 600; color: #2e6747; margin-left: 5px; }
svg { width: 100%; height: auto; display: block; overflow: visible; touch-action: pan-y; }
.chart-tick line { stroke: #e7ece4; stroke-width: 1; }
.chart-tick line.zero-line { stroke: #b5c4b1; }
.chart-tick text { fill: #859082; font: 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.chart-caption { display: flex; justify-content: space-between; gap: 12px; color: #839080; font-size: 10px; margin-top: 6px; }
.chart-caption i { display: inline-block; width: 14px; height: 2px; background: #3f805b; vertical-align: middle; margin-right: 5px; }
.caption-unit { color: #9aa396; }
@media (max-width: 700px) { .chart-readout { align-items: flex-start; flex-direction: column; margin-top: 14px; gap: 4px; } .chart-readout > div { gap: 12px; } .chart-caption > span:last-child { display: none; } .chart-caption { margin-top: 10px; } }
</style>
