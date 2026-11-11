<script setup lang="ts">
import { computed } from 'vue'
import type { OddsMarket } from '@/types/odds'
import { dateTime, signed, team } from './format'

const props = defineProps<{ market?: OddsMarket; kind: 'spreads' | 'totals'; away: string; home: string; now: number }>()
const selections = computed(() => props.kind === 'spreads' ? [props.away, props.home] : ['Over', 'Under'])
const old = computed(() => !props.market?.updated_at || props.now - Date.parse(props.market.updated_at) > 15 * 60 * 1000 || Date.parse(props.market.updated_at) > props.now + 60000)
function outcome(selection: string) { return props.market?.outcomes.find(item => item.selection === selection) }
function label(selection: string) { return props.kind === 'spreads' ? team(selection)[0] : selection === 'Over' ? '大分' : '小分' }
</script>

<template>
  <div class="market-quote">
    <div class="market-caption"><span>{{ kind === 'spreads' ? '全场让分' : '全场大小分' }}</span><span>盘口 / 赔率</span></div>
    <div v-for="selection in selections" :key="selection" class="outcome-row">
      <span>{{ label(selection) }}</span>
      <span v-if="outcome(selection)" class="outcome-number">
        <strong>{{ kind === 'spreads' ? signed(outcome(selection)!.point) : outcome(selection)!.point }}</strong>
        <small>{{ outcome(selection)!.price?.toFixed(2) ?? '—' }}</small>
      </span>
      <span v-else class="quote-missing">暂无报价</span>
    </div>
    <p class="market-time" :class="{ old }">{{ market?.updated_at ? `报价 ${dateTime(market.updated_at)}` : '报价时间未知' }}{{ old && market ? ' · 待更新' : '' }}</p>
  </div>
</template>

<style scoped>
.market-quote { min-width: 0; }
.market-caption { display: flex; justify-content: space-between; gap: 4px; font-size: 11px; color: #64796d; margin-bottom: 12px; }
.market-caption span:last-child { font-size: 10px; color: #8b988f; }
.outcome-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 8px; font-size: 12px; }
.outcome-number { display: flex; align-items: baseline; gap: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.outcome-number strong { font-size: 17px; font-weight: 600; letter-spacing: -.4px; }
.outcome-number small { font-size: 11px; color: #718578; min-width: 24px; text-align: right; }
.quote-missing { font-size: 11px; color: #89978d; }
.market-time { font-size: 9px; color: #87978d; margin: 13px 0 0; }
.market-time.old { color: #926c39; }
</style>
