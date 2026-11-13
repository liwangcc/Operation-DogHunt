// 记录与统计共用筛选口径，跨页查看时通过地址携带筛选条件。
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { beijingMidnight } from '@/demo/league'
import { predictionRecords } from '@/stores/records'
import { now } from '@/stores/system'
import type { Market, RecordSource } from '@/types/records'

export interface RecordScope {
  period: '7' | '30' | '90' | 'all'
  market: 'all' | Market
  source: RecordSource
  author: 'system' | 'user'
  strategy: string
}

const defaults: RecordScope = { period: '30', market: 'all', source: 'live', author: 'system', strategy: 'all' }

export function useRecordScope() {
  const route = useRoute()
  const filters = ref<RecordScope>({ ...defaults })
  for (const key of ['period', 'market', 'source', 'author'] as const) {
    const allowed = { period: ['7', '30', '90', 'all'], market: ['all', 'spreads', 'totals'], source: ['live', 'backtest', 'manual'], author: ['system', 'user'] }[key]
    const value = route.query[key]
    if (typeof value === 'string' && allowed.includes(value)) Object.assign(filters.value, { [key]: value })
  }
  const strategies = computed(() => [...new Set(predictionRecords.value.map(record => record.strategy))].sort())
  const requestedStrategy = route.query.strategy
  if (typeof requestedStrategy === 'string' && strategies.value.includes(requestedStrategy)) filters.value.strategy = requestedStrategy
  const records = computed(() => {
    const filter = filters.value
    const start = filter.period === 'all' ? -Infinity : beijingMidnight(now.value, 1 - Number(filter.period))
    const end = beijingMidnight(now.value, 1)
    return predictionRecords.value.filter(record => {
      const time = Date.parse(record.commenceTime)
      return time >= start && (filter.period === 'all' || time < end)
        && (filter.market === 'all' || record.market === filter.market)
        && record.source === filter.source && record.author === filter.author
        && (filter.strategy === 'all' || record.strategy === filter.strategy)
    })
  })
  const query = computed(() => ({ ...filters.value }))
  function reset() { filters.value = { ...defaults } }
  return { filters, records, strategies, query, reset }
}
