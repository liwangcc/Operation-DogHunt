<script setup lang="ts">
// 命中率圆环：青色弧是命中率，外圈细弧是 95% 区间，琥珀色刻度是按这些记录的赔率不赚不亏所需的命中率。
import { computed } from 'vue'

const props = defineProps<{
  /** 命中率，0–1；没有样本时为 null。 */
  rate: number | null
  range: [number, number] | null
  breakEven: number | null
}>()

const RADIUS = 46
const OUTER = 55
const CIRCLE = 2 * Math.PI * RADIUS
const OUTER_CIRCLE = 2 * Math.PI * OUTER

const dash = computed(() => `${(props.rate ?? 0) * CIRCLE} ${CIRCLE}`)
const rangeDash = computed(() => (props.range ? `${(props.range[1] - props.range[0]) * OUTER_CIRCLE} ${OUTER_CIRCLE}` : ''))
const rangeOffset = computed(() => (props.range ? -props.range[0] * OUTER_CIRCLE : 0))
/** 刻度所在的角度：从正上方顺时针。 */
const tick = computed(() => (props.breakEven === null ? null : props.breakEven * 360))
</script>

<template>
  <svg class="ring" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
    <g transform="rotate(-90 60 60)">
      <circle class="track" cx="60" cy="60" :r="RADIUS" />
      <circle v-if="range" class="band" cx="60" cy="60" :r="OUTER" :stroke-dasharray="rangeDash" :stroke-dashoffset="rangeOffset" />
      <circle v-if="rate !== null" class="value" cx="60" cy="60" :r="RADIUS" :stroke-dasharray="dash" />
    </g>
    <line v-if="tick !== null" class="tick" x1="60" y1="5" x2="60" y2="22" :transform="`rotate(${tick} 60 60)`" />
  </svg>
</template>

<style scoped>
.ring { flex: 0 0 auto; }
circle { fill: none; }
.track { stroke: rgba(148, 180, 210, .14); stroke-width: 8; }
.value { stroke: var(--cyan); stroke-width: 8; stroke-linecap: butt; filter: drop-shadow(0 0 5px rgba(73, 221, 235, .55)); transition: stroke-dasharray .8s var(--ease-out); }
.band { stroke: rgba(148, 180, 210, .5); stroke-width: 2; transition: stroke-dasharray .8s var(--ease-out), stroke-dashoffset .8s var(--ease-out); }
.tick { stroke: var(--amber); stroke-width: 2.5; stroke-linecap: round; transition: transform .8s var(--ease-out); }
</style>
