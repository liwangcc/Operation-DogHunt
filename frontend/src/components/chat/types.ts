// 聊天页内部用的一轮发言：在接口的 role / content 之外，多记一点只用于显示的信息。
import type { ChatMessage } from '@/types/api'

export interface Turn extends ChatMessage {
  /** 助手回答附带的信息：用的模型、等了多久、token 用量（后端返回时才有）。 */
  meta?: {
    model: string
    seconds: number
    usage: { input_tokens: number; output_tokens: number } | null
  }
}

/** 选场时附在用户问题末尾的标记；显示时拆出来做成一个标签，发给后端的内容保持原样。 */
export const SELECTION_MARK = '\n\n本次选场：'

/** 同一轮对话最多提问的次数，与后端的消息条数限制一致。 */
export const MAX_QUESTIONS = 20
