<script setup lang="ts">
// 按周表现：每周的模拟净盈亏画成一根柱子，赚在零线上方、亏在下方，用来看表现是否持续，而不是只看最好的一段。
import { computed } from 'vue'
import { units } from '@/components/records/labels'
import type { Bucket } from '@/domain/metrics'

const props = defineProps<{ weeks: Bucket[] }>()

const scale = computed(() => Math.max(1, ...props.weeks.map((week) => Math.abs(week.summary.net))))
</script>

<template>
  <div v-if="weeks.length" class="weekly" role="list" aria-label="每周模拟净盈亏">
    <div v-for="week in weeks" :key="week.key" class="week" role="listitem" :title="`${week.label} 起一周：${units(week.summary.net)} 单位，已结算 ${week.summary.staked}`">
      <div class="week-plot">
        <i :class="week.summary.net >= 0 ? 'up' : 'down'" :style="{ height: `${(Math.abs(week.summary.net) / scale) * 50}%` }"></i>
      </div>
      <span class="week-value num" :class="{ pos: week.summary.net > 0, neg: week.summary.net < 0 }">{{ units(week.summary.net) }}</span>
      <span class="week-label num">{{ week.label }}</span>
      <span class="sr-only">，已结算 {{ week.summary.staked }} 个选择</span>
    </div>
  </div>
  <p v-else class="weekly-none">当前筛选下还没有已结算的记录。</p>
</template>

<style scoped>
.weekly { display: flex; align-items: stretch; gap: 6px; min-height: 190px; }
.week { display: flex; flex: 1 1 0; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
/* 柱子所在的区域中间有一条零线：盈利的柱子从零线往上长，亏损的往下长。 */
.week-plot { position: relative; flex: 1; width: 100%; min-height: 120px; background: linear-gradient(var(--line-2), var(--line-2)) center / 100% 1px no-repeat; }
.week-plot i { position: absolute; left: 18%; right: 18%; min-height: 2px; border-radius: 2px; transition: height .7s var(--ease-out); }
.week-plot .up { bottom: 50%; background: linear-gradient(180deg, var(--green), rgba(94, 212, 162, .35)); }
.week-plot .down { top: 50%; background: linear-gradient(0deg, var(--red), rgba(242, 131, 119, .35)); }
.week-value { font-size: 12px; font-weight: 700; }
.week-label { font-size: 11px; color: var(--text-3); white-space: nowrap; }
.weekly-none { display: grid; place-items: center; min-height: 190px; margin: 0; font-size: 13px; color: var(--text-3); }
@media (max-width: 560px) {
  .weekly { gap: 2px; }
  .week-value { font-size: 10px; letter-spacing: -.02em; }
  .week-label { font-size: 10px; letter-spacing: -.02em; }
}
</style>
