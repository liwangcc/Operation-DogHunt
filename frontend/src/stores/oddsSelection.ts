import { ref } from 'vue'

// 只在本次打开的网站中保留选择；报价始终由后端读取最新快照。
export const oddsSelection = ref<{
  event_id: string
  bookmaker_key: string
  label: string
} | null>(null)

// 在演示盘口上点了“交给 AI 分析”：真实后端不认识演示比赛，聊天页改为展示一段示例对话。
export const sampleChatRequested = ref(false)
