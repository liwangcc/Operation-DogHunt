<script setup lang="ts">
// 盘口分布条：同一个玩法，各家平台分别开在哪个数值上。一个方块代表一家平台，当前选中的平台高亮。
import { computed } from 'vue'
import { signed } from './format'
import type { LineSpread, MarketKind } from './lines'

const props = defineProps<{
  spread: LineSpread
  kind: MarketKind
  /** 当前选中的平台标识。 */
  selected?: string
  large?: boolean
}>()

function label(point: number): string {
  return props.kind === 'spreads' ? signed(point) : String(point)
}

const summary = computed(() => {
  if (!props.spread.count) return '没有平台开出这个玩法'
  const parts = props.spread.columns.map((column) => `${label(column.point)} 有 ${column.books.length} 家`)
  return `${props.kind === 'spreads' ? '主队让分' : '总分线'}在 ${props.spread.count} 家平台的分布：${parts.join('，')}`
})
</script>

<template>
  <div class="line-strip" :class="{ large }" role="img" :aria-label="summary">
    <template v-if="spread.count">
      <div v-for="column in spread.columns" :key="column.point" class="line-col" :class="{ mode: column === spread.mode }">
        <div class="line-dots">
          <i v-for="book in column.books" :key="book.key" :class="{ on: book.key === selected }" :title="`${book.title}：${label(column.point)}`"></i>
        </div>
        <span class="line-value">{{ label(column.point) }}</span>
      </div>
    </template>
    <span v-else class="line-none">暂无平台报价</span>
  </div>
</template>

<style scoped>
.line-strip { display: flex; align-items: flex-end; gap: 4px; min-height: 40px; padding: 6px 8px 5px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--well); }
.line-col { display: flex; flex: 1 1 0; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.line-dots { display: flex; flex-wrap: wrap-reverse; justify-content: center; gap: 2px; max-width: 46px; }
.line-dots i { width: 6px; height: 6px; border-radius: 1px; background: rgba(148, 180, 210, .34); transition: background .18s, box-shadow .18s; }
.line-col.mode .line-dots i { background: rgba(148, 180, 210, .62); }
.line-dots i.on { background: var(--cyan); box-shadow: 0 0 6px rgba(73, 221, 235, .8); }
.line-value { font-size: 11px; font-variant-numeric: tabular-nums; line-height: 1; color: var(--text-3); white-space: nowrap; }
.line-col.mode .line-value { color: var(--text); font-weight: 600; }
.line-none { align-self: center; font-size: 11px; color: var(--text-3); }
.large { min-height: 64px; gap: 8px; padding: 12px 14px 10px; }
.large .line-dots { gap: 3px; max-width: 70px; }
.large .line-dots i { width: 9px; height: 9px; }
.large .line-value { font-size: 13px; }
</style>
