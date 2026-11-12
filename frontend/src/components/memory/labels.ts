// 长期记忆在界面上的叫法：子块状态、内容性质和维护动作的中文名与颜色。
import type { BlockKind, BlockStatus, MaintenanceAction, MemoryChild } from '@/types/memory'

export const STATUS_LABEL: Record<BlockStatus, string> = { active: '生效中', candidate: '候选', superseded: '已替代', expired: '已过期', disabled: '已停用', archived: '已归档' }
export const STATUS_TONE: Record<BlockStatus, string> = { active: 'tag--ok', candidate: 'tag--warn', superseded: 'tag--violet', expired: '', disabled: 'tag--bad', archived: '' }
export const KIND_LABEL: Record<BlockKind, string> = { explicit: '用户明确要求', inferred: '从行为推断', hypothesis: '用户假设', ai: 'AI 判断', observation: '用户观察' }
export const ACTION_LABEL: Record<MaintenanceAction, string> = { merge: '合并', expire: '过期', conflict: '冲突', archive: '归档', split: '拆分' }
export const ACTION_TONE: Record<MaintenanceAction, string> = { merge: 'tag--info', expire: '', conflict: 'tag--warn', archive: '', split: 'tag--violet' }

/** 只有生效中的子块才会在回答时被取出来用；候选、被替代、过期、停用、归档的都不会。 */
export function recallable(child: MemoryChild): boolean {
  return child.status === 'active'
}

export function recallNote(child: MemoryChild): string {
  switch (child.status) {
    case 'active': return '会在相关的提问里被取出来用。'
    case 'candidate': return '还只是候选：出现的次数不够，不会当作确定要求使用。'
    case 'superseded': return '已被更新的要求替代，不再使用，保留下来只为核对来历。'
    case 'expired': return '已过有效期，不再作为当前情况使用。'
    case 'disabled': return '已被停用，不会使用；可以重新启用。'
    default: return '已归档，不会使用；可以恢复。'
  }
}
