import { getJson, postJson } from './client'
import type { ChatMessage, ChatResponse, ModelStatus } from '@/types/api'

export async function getModelStatus(): Promise<ModelStatus> {
  const result = await getJson('/model')
  if (
    typeof result !== 'object' || result === null ||
    !('configured' in result) || typeof result.configured !== 'boolean' ||
    !('model' in result) || (typeof result.model !== 'string' && result.model !== null) ||
    !('timeout_seconds' in result) || typeof result.timeout_seconds !== 'number' ||
    result.timeout_seconds < 5 || result.timeout_seconds > 300
  ) throw new Error('模型配置状态格式不正确，请检查后端。')
  return result as ModelStatus
}

export async function sendChat(messages: ChatMessage[], timeoutSeconds: number, oddsSelection: { event_id: string; bookmaker_key: string } | null = null): Promise<ChatResponse> {
  const result = await postJson('/chat', { messages, odds_selection: oddsSelection }, (timeoutSeconds + 10) * 1000)
  if (
    typeof result !== 'object' || result === null ||
    !('reply' in result) || typeof result.reply !== 'string' || !result.reply.trim() ||
    !('model' in result) || typeof result.model !== 'string'
  ) throw new Error('模型回答格式不正确，请检查后端。')
  return result as ChatResponse
}
