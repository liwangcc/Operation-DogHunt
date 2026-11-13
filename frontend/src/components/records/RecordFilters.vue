<script setup lang="ts">
import type { RecordScope } from '@/composables/useRecordScope'
const filters = defineModel<RecordScope>({ required: true })
defineProps<{ strategies: string[] }>()
defineEmits<{ reset: [] }>()
</script>

<template>
  <div class="scope-filters panel panel-pad" aria-label="记录范围筛选">
    <label>时间范围<select v-model="filters.period" class="select" aria-label="时间范围"><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="90">最近 90 天</option><option value="all">全部时间（含待开赛）</option></select></label>
    <label>玩法<select v-model="filters.market" class="select" aria-label="玩法"><option value="all">全部玩法</option><option value="spreads">让分</option><option value="totals">大小分</option></select></label>
    <label>记录来源<select v-model="filters.source" class="select" aria-label="记录来源"><option value="live">赛前记录</option><option value="backtest">历史模拟</option><option value="manual">人工补录</option></select></label>
    <label>判断来源<select v-model="filters.author" class="select" aria-label="判断来源"><option value="system">系统判断</option><option value="user">个人判断</option></select></label>
    <label>策略版本<select v-model="filters.strategy" class="select" aria-label="策略版本"><option value="all">全部版本</option><option v-for="version in strategies" :key="version" :value="version">{{ version }}</option></select></label>
    <button class="btn btn--quiet" @click="$emit('reset')">重置筛选</button>
  </div>
</template>

<style scoped>
/* 筛选是操作，不是内容：平铺成一行，下面一条线，不装进面板。 */
.scope-filters.panel { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px; margin-bottom: 18px; padding: 0 0 18px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: none; box-shadow: none; }
label { display: grid; flex: 1 1 130px; gap: 7px; font-size: 12px; letter-spacing: .08em; color: var(--text-3); }
select { width: 100%; }
@media (max-width: 700px) {
  .scope-filters.panel { gap: 12px; padding-bottom: 16px; }
  label { flex-basis: 120px; min-width: 0; }
}
</style>
