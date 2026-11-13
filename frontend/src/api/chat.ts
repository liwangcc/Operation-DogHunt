import { getJson, postStream } from './client'
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

function isChatResponse(result: unknown): result is ChatResponse {
  return typeof result === 'object' && result !== null &&
    'reply' in result && typeof result.reply === 'string' && !!result.reply.trim() &&
    'model' in result && typeof result.model === 'string'
}

/**
 * 逐段接收回答：每段文字交给 onText（用于边收边显示），完整完成后返回最终回答。
 * 中途失败会抛错，已显示的文字不算交付，调用方应丢弃。
 */
export async function streamChat(messages: ChatMessage[], timeoutSeconds: number, oddsSelection: { event_id: string; bookmaker_key: string } | null, onText: (text: string) => void): Promise<ChatResponse> {
  let final: ChatResponse | null = null
  let failure = ''
  await postStream('/chat/stream', { messages, odds_selection: oddsSelection }, (timeoutSeconds + 10) * 1000, ({ event, data }) => {
    if (event === 'delta' && typeof data === 'object' && data !== null && 'text' in data && typeof data.text === 'string') onText(data.text)
    else if (event === 'done' && isChatResponse(data)) final = data
    else if (event === 'error') failure = typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string' ? data.detail : '模型回答失败，本次未交付结果，请手动重试。'
  })
  if (failure) throw new Error(failure)
  if (!final) throw new Error('与后端的连接提前结束，没有收到完整回答，请手动重试。')
  return final
}
