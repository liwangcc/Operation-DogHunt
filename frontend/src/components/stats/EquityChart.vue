<script setup lang="ts">
// 累计模拟盈亏曲线：横轴是开赛时间，纵轴是累计单位数。鼠标移到图上或用左右方向键，可以逐条查看每一次结算。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { beijingDay, dateTime } from '@/components/odds/format'
import { matchup, pickText, units } from '@/components/records/labels'
import type { EquityPoint } from '@/domain/metrics'

export interface EquitySeries {
  key: string
  label: string
  color: string
  points: EquityPoint[]
}

/** 第一条是主曲线：画得更粗、带面积，悬停读数也读它。 */
const props = defineProps<{ series: EquitySeries[] }>()

const MARGIN = { top: 18, right: 18, bottom: 30, left: 46 }
const host = ref<HTMLElement | null>(null)
const width = ref(800)
const height = ref(380)
const active = ref<number | null>(null)
let observer: ResizeObserver | null = null

const primary = computed(() => props.series[0]?.points ?? [])
const innerWidth = computed(() => Math.max(10, width.value - MARGIN.left - MARGIN.right))
const innerHeight = computed(() => height.value - MARGIN.top - MARGIN.bottom)

const domain = computed(() => {
  const all = props.series.flatMap((item) => item.points)
  const times = all.map((point) => Date.parse(point.record.commenceTime))
  const totals = all.map((point) => point.total)
  const start = Math.min(...times)
  const end = Math.max(...times)
  const low = Math.min(0, ...totals)
  const high = Math.max(0, ...totals)
  const pad = Math.max(1, (high - low) * 0.12)
  return { start, end: end === start ? start + 1 : end, low: low - pad, high: high + pad }
})

function x(time: number): number {
  return MARGIN.left + ((time - domain.value.start) / (domain.value.end - domain.value.start)) * innerWidth.value
}
function y(value: number): number {
  return MARGIN.top + (1 - (value - domain.value.low) / (domain.value.high - domain.value.low)) * innerHeight.value
}

/** 阶梯线：每结算一次，曲线先横着走到那个时刻，再竖着跳到新的累计值。 */
function path(points: EquityPoint[]): string {
  if (!points.length) return ''
  let d = `M${MARGIN.left.toFixed(1)} ${y(0).toFixed(1)}`
  for (const point of points) d += ` H${x(Date.parse(point.record.commenceTime)).toFixed(1)} V${y(point.total).toFixed(1)}`
  return d
}

const lines = computed(() => props.series.map((item) => ({ ...item, d: path(item.points) })))
const area = computed(() => {
  const points = primary.value
  if (!points.length) return ''
  return `${path(points)} V${y(0).toFixed(1)} H${MARGIN.left} Z`
})

const yTicks = computed(() => {
  const span = domain.value.high - domain.value.low
  const step = [1, 2, 5, 10, 20, 50].find((size) => span / size <= 6) ?? 100
  const ticks: number[] = []
  for (let value = Math.ceil(domain.value.low / step) * step; value <= domain.value.high; value += step) ticks.push(value)
  return ticks
})
const xTicks = computed(() => {
  const count = Math.max(2, Math.min(7, Math.floor(innerWidth.value / 120)))
  return Array.from({ length: count }, (_, index) => {
    const time = domain.value.start + ((domain.value.end - domain.value.start) * index) / (count - 1)
    return { time, label: beijingDay(new Date(time)).slice(5).replace('-', '/') }
  })
})

const focus = computed(() => {
  if (active.value === null) return null
  const point = primary.value[active.value]
  if (!point) return null
  const px = x(Date.parse(point.record.commenceTime))
  return { point, px, py: y(point.total), flip: px > width.value * 0.62 }
})

function nearest(clientX: number): void {
  const box = host.value?.getBoundingClientRect()
  if (!box || !primary.value.length) return
  const target = clientX - box.left
  let best = 0
  let gap = Infinity
  primary.value.forEach((point, index) => {
    const distance = Math.abs(x(Date.parse(point.record.commenceTime)) - target)
    if (distance <= gap) {
      gap = distance
      best = index
    }
  })
  active.value = best
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const last = primary.value.length - 1
  if (last < 0) return
  const current = active.value ?? last
  active.value = Math.max(0, Math.min(last, current + (event.key === 'ArrowRight' ? 1 : -1)))
}

const summary = computed(() => {
  const points = primary.value
  if (!points.length) return '没有已结算的记录'
  return `累计模拟盈亏曲线，共 ${points.length} 次结算，最终 ${units(points[points.length - 1].total)} 单位。按左右方向键逐条查看。`
})

// 换了数据就收起读数，免得指到别的记录上。
watch(() => props.series, () => {
  active.value = null
})

onMounted(() => {
  if (!host.value) return
  observer = new ResizeObserver(([entry]) => {
    width.value = Math.max(280, Math.round(entry.contentRect.width))
    height.value = width.value < 520 ? 240 : 380
  })
  observer.observe(host.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="host" class="equity" tabindex="0" role="group" aria-roledescription="图表" :aria-label="summary" @pointermove="nearest($event.clientX)" @pointerdown="nearest($event.clientX)" @pointerleave="active = null" @keydown="onKeydown" @blur="active = null">
    <svg v-if="primary.length" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true">
      <defs>
        <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="series[0].color" stop-opacity=".26" />
          <stop offset="1" :stop-color="series[0].color" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g class="grid">
        <template v-for="tick in yTicks" :key="tick">
          <line :x1="MARGIN.left" :x2="width - MARGIN.right" :y1="y(tick)" :y2="y(tick)" :class="{ zero: tick === 0 }" />
          <text :x="MARGIN.left - 10" :y="y(tick) + 4" text-anchor="end">{{ tick > 0 ? `+${tick}` : tick < 0 ? `−${Math.abs(tick)}` : '0' }}</text>
        </template>
        <text v-for="(tick, index) in xTicks" :key="tick.time" :x="x(tick.time)" :y="height - 8" :text-anchor="index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'">{{ tick.label }}</text>
      </g>
      <path class="area" :d="area" fill="url(#equity-fill)" />
      <path v-for="(line, index) in lines.slice(1)" :key="line.key" class="line minor" :d="line.d" :stroke="line.color" :style="{ '--i': index + 1 }" />
      <path :key="`${lines[0].key}-${primary.length}`" class="line major" :d="lines[0].d" :stroke="lines[0].color" pathLength="1" />
      <g v-if="focus">
        <line class="cross" :x1="focus.px" :x2="focus.px" :y1="MARGIN.top" :y2="height - MARGIN.bottom" />
        <circle class="focus-dot" :cx="focus.px" :cy="focus.py" r="5" :stroke="series[0].color" />
      </g>
    </svg>
    <p v-else class="equity-none">当前筛选下还没有已结算的记录。</p>

    <p class="sr-only" aria-live="polite">{{ focus ? `${dateTime(focus.point.record.commenceTime)}，${matchup(focus.point.record)}，${pickText(focus.point.record)}，本次 ${units(focus.point.pnl)}，累计 ${units(focus.point.total)} 单位` : '' }}</p>
    <div v-if="focus" class="tip" aria-hidden="true" :class="{ flip: focus.flip }" :style="{ left: `${focus.px}px`, top: `${Math.max(8, focus.py - 12)}px` }">
      <p class="tip-when num">{{ dateTime(focus.point.record.commenceTime) }} · 第 {{ (active ?? 0) + 1 }} / {{ primary.length }} 次结算</p>
      <p class="tip-match">{{ matchup(focus.point.record) }}</p>
      <p class="tip-pick">{{ pickText(focus.point.record) }}<span class="num" :class="{ pos: focus.point.pnl > 0, neg: focus.point.pnl < 0 }">{{ units(focus.point.pnl) }}</span></p>
      <p class="tip-total">累计<strong class="num" :class="{ pos: focus.point.total > 0, neg: focus.point.total < 0 }">{{ units(focus.point.total) }}</strong>单位</p>
    </div>
  </div>
</template>

<style scoped>
.equity { position: relative; min-height: 240px; outline-offset: 4px; touch-action: pan-y; cursor: crosshair; }
svg { display: block; }
.grid line { stroke: var(--line); stroke-width: 1; }
.grid line.zero { stroke: var(--line-3); stroke-dasharray: 3 4; }
.grid text { fill: var(--text-3); font-family: var(--font-num); font-size: 11.5px; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.line { fill: none; stroke-linejoin: round; }
/* 主曲线出现时从左到右画一次，之后不再动。 */
.line.major { stroke-width: 1.8; stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .7s var(--ease-out) .05s forwards; }
.line.minor { stroke-width: 1.1; opacity: 0; animation: appear .3s ease .5s forwards; }
.area { opacity: 0; animation: appear .4s ease .5s forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes appear { to { opacity: .8; } }
.cross { stroke: var(--line-3); stroke-width: 1; }
.focus-dot { fill: var(--bg-1); stroke-width: 1.6; }
.equity-none { display: grid; place-items: center; min-height: 240px; margin: 0; font-size: 13px; color: var(--text-3); }

.tip { position: absolute; z-index: 2; min-width: 200px; padding: 10px 12px; border: 1px solid var(--line-3); border-radius: var(--radius); background: var(--panel-solid); box-shadow: 0 12px 30px rgba(0, 0, 0, .5); transform: translate(14px, -100%); pointer-events: none; white-space: nowrap; }
.tip.flip { transform: translate(calc(-100% - 14px), -100%); }
.tip p { margin: 0; }
.tip-when { font-size: 11px; color: var(--text-3); }
.tip-match { margin-top: 4px !important; font-size: 13px; }
.tip-pick { display: flex; justify-content: space-between; gap: 16px; margin-top: 2px !important; font-family: var(--font-num); font-size: 15px; font-weight: 500; letter-spacing: .02em; }
.tip-total { display: flex; align-items: baseline; gap: 8px; margin-top: 8px !important; padding-top: 8px; border-top: 1px solid var(--line); font-size: 12px; color: var(--text-3); }
.tip-total strong { font-family: var(--font-num); font-size: 18px; font-weight: 500; letter-spacing: .02em; color: var(--text); }
.tip-total strong.pos { color: var(--green); }
.tip-total strong.neg { color: var(--red); }
</style>
