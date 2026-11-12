// 长期记忆的数据结构，对应需求文档第 9 节的“父块目录 → 子块条目”。后端还没有这组接口，目前只有演示数据在用。

/** 子块的状态：生效中、候选（从单次行为推断，未经确认）、已被替代、已过期、已停用、已归档。 */
export type BlockStatus = 'active' | 'candidate' | 'superseded' | 'expired' | 'disabled' | 'archived'
/** 内容的性质：用户明确要求、从行为推断、用户提出的假设、AI 的判断、用户的观察。 */
export type BlockKind = 'explicit' | 'inferred' | 'hypothesis' | 'ai' | 'observation'

export interface MemoryParent {
  id: string
  title: string
  summary: string
}

export interface MemoryChild {
  id: string
  parentId: string
  title: string
  body: string
  kind: BlockKind
  status: BlockStatus
  /** 这条记忆来自哪里：某次聊天、某条预测记录，或后台维护。 */
  source: { kind: 'chat' | 'record' | 'maintenance'; label: string }
  /** 适用范围，例如“所有聊天”或某一场比赛。 */
  scope: string
  updatedAt: string
  /** 有效期；长期有效为 null。 */
  expiresAt: string | null
  version: number
  /** 被哪一条子块替代。 */
  supersededBy: string | null
  /** 被回答引用的次数。 */
  recalls: number
}

export type MaintenanceAction = 'merge' | 'expire' | 'conflict' | 'archive' | 'split'

export interface MaintenanceEntry {
  id: string
  time: string
  action: MaintenanceAction
  detail: string
  blockIds: string[]
}
