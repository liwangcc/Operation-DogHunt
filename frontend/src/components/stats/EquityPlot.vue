<script setup lang="ts">
// 一条累计盈亏曲线的图面：零线与刻度、盈利区和亏损区的底色、阶梯线、右端的期末点，以及当前查看时刻的十字线。
// 只负责画；范围、刻度和当前时刻由外面给，几张图才能对齐。
import { computed, useId } from 'vue'
import { units } from '@/components/records/labels'
import { dayLabel, extremesOf, scaleOf, stepPath, valueAt, type Domain, type EquityStep, type Frame } from './equity'

const props = defineProps<{
  steps: EquityStep[]
  domain: Domain
  frame: Frame
  yTicks: number[]
  xTicks: { time: number; label: string }[]
  /** 小图：线细一些，不标最高最低，右端也不写期末值（标题里已经有了）。 */
  compact?: boolean
  /** 当前查看的时刻；没有时为 null。 */
  activeTime: number | null
}>()
const emit = defineEmits<{ hover: [time: number] }>()

/** 两块裁剪区域的编号要全页唯一，否则几张图会互相裁到。 */
const uid = useId()

const scale = computed(() => scaleOf(props.frame, props.domain))
const zeroY = computed(() => scale.value.y(0))
const line = computed(() => stepPath(props.steps, scale.value))
/** 曲线与零线围成的面：分别裁出零线以上和以下两部分，铺不同的底色。 */
const area = computed(() => `${line.value} V${zeroY.value.toFixed(1)} H${scale.value.left.toFixed(1)} Z`)
const end = computed(() => {
  const last = props.steps[props.steps.length - 1]
  return { x: scale.value.right, y: scale.value.y(last.total), value: last.total }
})

/** 最高点和最低点的标注；正好落在期末那一步时不标，右端已经写了数值。 */
const marks = computed(() => {
  if (props.compact || props.steps.length < 2) return []
  const { high, low } = extremesOf(props.steps)
  const last = props.steps[props.steps.length - 1]
  const list = [{ step: high, name: '最高', above: true }]
  if (low !== high) list.push({ step: low, name: '最低', above: false })
  return list.filter((item) => item.step !== last).map((item) => {
    const x = scale.value.x(item.step.time)
    // 靠近左右边缘时文字往里收，不伸出图面。
    const anchor = x < scale.value.left + 70 ? 'start' : x > scale.value.right - 70 ? 'end' : 'middle'
    return { key: item.name, x, y: scale.value.y(item.step.total), anchor, dy: item.above ? -10 : 19, text: `${item.name} ${units(item.step.total)} · ${dayLabel(item.step.time)}` }
  })
})

const cursor = computed(() => {
  if (props.activeTime === null) return null
  return { x: scale.value.x(props.activeTime), y: scale.value.y(valueAt(props.steps, props.activeTime)) }
})

function tickLabel(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0'
}

/** 指针横向在哪个时刻上，交给外面去找最近的结算时刻。 */
function onPointer(event: PointerEvent): void {
  const box = (event.currentTarget as SVGElement).getBoundingClientRect()
  emit('hover', scale.value.time(event.clientX - box.left))
}
</script>

<template>
  <svg class="plot" :class="{ compact }" :width="frame.width" :height="frame.height" :viewBox="`0 0 ${frame.width} ${frame.height}`" aria-hidden="true" @pointermove="onPointer" @pointerdown="onPointer">
    <defs>
      <clipPath :id="`${uid}-gain`"><rect :x="scale.left" :y="scale.top" :width="scale.right - scale.left" :height="zeroY - scale.top" /></clipPath>
      <clipPath :id="`${uid}-loss`"><rect :x="scale.left" :y="zeroY" :width="scale.right - scale.left" :height="scale.bottom - zeroY" /></clipPath>
    </defs>

    <g class="grid">
      <line v-for="tick in xTicks" :key="`x${tick.time}`" class="day" :x1="scale.x(tick.time)" :x2="scale.x(tick.time)" :y1="scale.top" :y2="scale.bottom" />
      <line v-for="tick in yTicks" :key="`y${tick}`" :class="{ zero: tick === 0 }" :x1="scale.left" :x2="scale.right" :y1="scale.y(tick)" :y2="scale.y(tick)" />
      <text v-for="tick in yTicks" :key="`yl${tick}`" :class="{ zero: tick === 0 }" :x="scale.left - 10" :y="scale.y(tick) + 4" text-anchor="end">{{ tickLabel(tick) }}</text>
      <text v-for="tick in xTicks" :key="`xl${tick.time}`" :x="scale.x(tick.time)" :y="scale.bottom + 18" text-anchor="middle">{{ tick.label }}</text>
    </g>

    <path class="wash gain" :d="area" :clip-path="`url(#${uid}-gain)`" />
    <path class="wash loss" :d="area" :clip-path="`url(#${uid}-loss)`" />
    <path class="line" :d="line" />

    <g v-for="mark in marks" :key="mark.key" class="mark">
      <circle :cx="mark.x" :cy="mark.y" r="3.5" />
      <text :x="mark.x" :y="mark.y + mark.dy" :text-anchor="mark.anchor">{{ mark.text }}</text>
    </g>

    <circle class="end-dot" :cx="end.x" :cy="end.y" r="4.5" />
    <text v-if="!compact" class="end-value" :x="end.x + 11" :y="end.y + 5">{{ units(end.value) }}</text>

    <g v-if="cursor" class="cursor">
      <line :x1="cursor.x" :x2="cursor.x" :y1="scale.top" :y2="scale.bottom" />
      <circle :cx="cursor.x" :cy="cursor.y" r="4.5" />
    </g>
  </svg>
</template>

<style scoped>
.plot { display: block; overflow: visible; cursor: crosshair; }
/* 网格和坐标轴退到最后：实线、发丝粗细，只比底色亮一级；零线再亮一级。 */
.grid line { stroke: var(--line); stroke-width: 1; }
.grid line.day { stroke: rgba(160, 190, 202, .06); }
.grid line.zero { stroke: var(--line-3); }
.grid text { fill: var(--text-3); font-family: var(--font-num); font-size: 11.5px; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.grid text.zero { fill: var(--text-2); }

/* 零线以上是盈利区，以下是亏损区：很淡的一层底色，一眼看出哪些日子在水面上。 */
.wash { stroke: none; opacity: .13; }
.wash.gain { fill: var(--green); }
.wash.loss { fill: var(--red); }
.line { fill: none; stroke: var(--cyan); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.compact .line { stroke-width: 1.6; }

/* 圆点外面一圈底色，压在线和网格上也分得开。 */
.end-dot { fill: var(--cyan); stroke: var(--panel-solid); stroke-width: 2; }
.end-value { fill: var(--text); font-family: var(--font-num); font-size: 14px; font-weight: 600; letter-spacing: .02em; }
.mark circle { fill: var(--panel-solid); stroke: var(--text-2); stroke-width: 1.5; }
/* 标注文字描一圈底色，落在网格线上也读得清。 */
.mark text { fill: var(--text-2); font-size: 11.5px; font-variant-numeric: tabular-nums; paint-order: stroke; stroke: var(--panel-solid); stroke-width: 4px; stroke-linejoin: round; }

.cursor line { stroke: var(--line-3); stroke-width: 1; }
.cursor circle { fill: var(--panel-solid); stroke: #eaf7f9; stroke-width: 2; }
</style>
