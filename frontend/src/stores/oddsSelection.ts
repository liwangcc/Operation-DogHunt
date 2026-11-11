import { ref } from 'vue'

// 只在本次打开的网站中保留选择；报价始终由后端读取最新快照。
export const oddsSelection = ref<{
  event_id: string
  bookmaker_key: string
  label: string
} | null>(null)
