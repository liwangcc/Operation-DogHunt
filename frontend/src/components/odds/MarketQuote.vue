<script setup lang="ts">
// 一个玩法在一家平台的报价：两个方向各一行，盘口数值在前、赔率在后，下面是报价时间。
import { computed } from 'vue'
import { STALE_AFTER_MS } from '@/stores/system'
import type { OddsMarket } from '@/types/odds'
import { dateTime, price, signed, team } from './format'
import { outcomeOf } from './lines'

const props = defineProps<{ market?: OddsMarket; kind: 'spreads' | 'totals'; away: string; home: string; now: number }>()

const rows = computed(() => {
  const selections = props.kind === 'spreads' ? [props.away, props.home] : ['Over', 'Under']
  return selections.map((selection, index) => {
    const outcome = outcomeOf(props.market, selection)
    return {
      selection,
      label: props.kind === 'spreads' ? team(selection)[0] : selection === 'Over' ? '大分' : '小分',
      side: props.kind === 'spreads' ? (index === 0 ? '客' : '主') : '',
      point: outcome ? (props.kind === 'spreads' ? signed(outcome.point) : String(outcome.point)) : null,
      price: outcome ? price(outcome.price) : null,
    }
  })
})
/** 报价时间太久、缺失，或者比现在还晚（时间异常），都标为待更新。 */
const old = computed(() => !props.market?.updated_at || props.now - Date.parse(props.market.updated_at) > STALE_AFTER_MS || Date.parse(props.market.updated_at) > props.now + 60000)
</script>

<template>
  <div class="quote">
    <div class="quote-head">
      <span class="quote-title">{{ kind === 'spreads' ? '全场让分' : '全场大小分' }}</span>
      <span class="quote-caption">盘口 / 赔率</span>
    </div>
    <div v-for="row in rows" :key="row.selection" class="quote-row" :class="{ missing: !row.point }">
      <span class="quote-side">{{ row.label }}<small v-if="row.side">{{ row.side }}</small></span>
      <template v-if="row.point">
        <strong class="quote-point">{{ row.point }}</strong>
        <span class="quote-price">{{ row.price }}</span>
      </template>
      <span v-else class="quote-none">暂无报价</span>
    </div>
    <p class="quote-time" :class="{ old }">{{ market?.updated_at ? `报价 ${dateTime(market.updated_at)}` : '报价时间未知' }}{{ old && market ? ' · 待更新' : '' }}</p>
  </div>
</template>

<style scoped>
/* 报价写成账页：表头一条线，每个方向一行，行间只有发丝线，不套盒子。 */
.quote { min-width: 0; }
.quote-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding-bottom: 7px; border-bottom: 1px solid var(--line-2); }
.quote-title { font-size: 12px; letter-spacing: .08em; color: var(--text-2); }
.quote-caption { font-size: 11px; color: var(--text-3); }
.quote-row { display: flex; align-items: baseline; gap: 10px; padding: 8px 0 7px; border-bottom: 1px solid var(--line); }
.quote-side { flex: 1; min-width: 0; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.quote-side small { margin-left: 6px; font-size: 11px; color: var(--text-3); }
.quote-point { font-family: var(--font-num); font-size: 19px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: .01em; line-height: 1.2; white-space: nowrap; }
.quote-price { min-width: 38px; font-family: var(--font-num); font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: .02em; text-align: right; color: var(--text-2); }
.quote-none { font-size: 12px; color: var(--text-3); }
.quote-row.missing { border-bottom-style: dashed; }
.quote-time { margin: 7px 0 0; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-3); }
.quote-time.old { color: var(--amber); }
</style>
