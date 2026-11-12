// 演示用的长期记忆：四个父块、若干子块和一份维护记录，内容围绕虚构联赛编写，用来预览记忆管理界面。
import type { MaintenanceEntry, MemoryChild, MemoryParent } from '@/types/memory'

const HOUR = 3600000

export const DEMO_PARENTS: MemoryParent[] = [
  { id: 'output', title: '用户输出偏好', summary: '回答的顺序、长度和数字的显示方式。跨聊天生效。' },
  { id: 'analysis', title: 'NBA 分析偏好', summary: '关注哪些玩法和因素。只影响关注范围，不改变客观结论。' },
  { id: 'research', title: '比赛研究', summary: '围绕具体比赛的假设、待核实问题和引用过的分析版本。赛后转为历史资料。' },
  { id: 'review', title: '复盘笔记', summary: '赛后的观察和待检验的经验，与已核实的事实分开。' },
]

interface Seed extends Omit<MemoryChild, 'updatedAt' | 'expiresAt'> {
  /** 多少小时前更新。 */
  ago: number
  /** 多少小时后过期；负数表示已经过期，null 表示长期有效。 */
  expiresIn: number | null
}

const CHILDREN: Seed[] = [
  { id: 'M-101', parentId: 'output', title: '先给结论，再讲原因', body: '回答时先用一两句话给出两个玩法各自的结论，再展开依据和不确定因素。', kind: 'explicit', status: 'active', source: { kind: 'chat', label: '聊天「周二赛前」' }, scope: '所有聊天', ago: 30, expiresIn: null, version: 2, supersededBy: null, recalls: 41 },
  { id: 'M-100', parentId: 'output', title: '先讲原因，再给结论', body: '按分析过程的顺序写，结论放在最后。', kind: 'explicit', status: 'superseded', source: { kind: 'chat', label: '聊天「第一次试用」' }, scope: '所有聊天', ago: 19 * 24, expiresIn: null, version: 1, supersededBy: 'M-101', recalls: 6 },
  { id: 'M-102', parentId: 'output', title: '赔率用十进制显示', body: '赔率一律写成十进制，例如 1.90；不要换算成其他格式。', kind: 'explicit', status: 'active', source: { kind: 'chat', label: '聊天「第一次试用」' }, scope: '所有聊天', ago: 19 * 24, expiresIn: null, version: 1, supersededBy: null, recalls: 38 },
  { id: 'M-103', parentId: 'output', title: '时间按北京时间', body: '开赛时间、报价时间都按北京时间说明，并写明日期。', kind: 'explicit', status: 'active', source: { kind: 'chat', label: '聊天「第一次试用」' }, scope: '所有聊天', ago: 19 * 24, expiresIn: null, version: 1, supersededBy: null, recalls: 40 },
  { id: 'M-104', parentId: 'output', title: '回答控制在一屏以内', body: '有一次要求“说短一点”。只出现过一次，还不能当作固定要求。', kind: 'inferred', status: 'candidate', source: { kind: 'chat', label: '聊天「周五晚间」' }, scope: '所有聊天', ago: 4 * 24, expiresIn: 26 * 24, version: 1, supersededBy: null, recalls: 0 },

  { id: 'M-201', parentId: 'analysis', title: '只看全场让分和大小分', body: '默认只分析赛前全场让分与全场大小分，不展开半场、单节和球员个人数据。', kind: 'explicit', status: 'active', source: { kind: 'chat', label: '聊天「第一次试用」' }, scope: '所有聊天', ago: 19 * 24, expiresIn: null, version: 1, supersededBy: null, recalls: 44 },
  { id: 'M-202', parentId: 'analysis', title: '比较时看节奏和背靠背', body: '两场比赛做对比时，先说明双方的节奏差异和是否处于背靠背。', kind: 'explicit', status: 'active', source: { kind: 'chat', label: '聊天「两场对比」' }, scope: '比较类问题', ago: 9 * 24, expiresIn: null, version: 1, supersededBy: null, recalls: 7 },
  { id: 'M-203', parentId: 'analysis', title: '可能偏好小分', body: '最近三次追问都落在小分方向。属于从行为推断的候选，不能因此把结论往小分上靠。', kind: 'inferred', status: 'candidate', source: { kind: 'maintenance', label: '后台整理' }, scope: '大小分', ago: 2 * 24, expiresIn: 28 * 24, version: 1, supersededBy: null, recalls: 0 },
  { id: 'M-204', parentId: 'analysis', title: '优势不足时允许观望', body: '盘口附近看不出明显优势时直接给“观望”，不必每场每个玩法都选方向。', kind: 'explicit', status: 'active', source: { kind: 'chat', label: '聊天「周二赛前」' }, scope: '所有聊天', ago: 30, expiresIn: null, version: 1, supersededBy: null, recalls: 23 },

  { id: 'M-301', parentId: 'research', title: '赤狐 对 猎犬：假设主力后卫缺阵', body: '用户提出的假设：赤狐首发后卫不上场时，大小分怎么看。这是假设，不是已确认的伤病。', kind: 'hypothesis', status: 'active', source: { kind: 'chat', label: '聊天「赤狐 对 猎犬」' }, scope: '赤狐 对 猎犬（开赛前）', ago: 3, expiresIn: 5, version: 1, supersededBy: null, recalls: 2 },
  { id: 'M-302', parentId: 'research', title: '潮汐的背靠背第二场', body: '待核实：潮汐上一场是否打了加时。当时没有取得可靠资料。', kind: 'observation', status: 'expired', source: { kind: 'chat', label: '聊天「潮汐 对 铁杉」' }, scope: '潮汐 对 铁杉', ago: 3 * 24, expiresIn: -2 * 24, version: 1, supersededBy: null, recalls: 1 },
  { id: 'M-303', parentId: 'research', title: '极光 对 熔岩：引用过的分析', body: '这场比赛引用过预测记录里的让分分析，赛后已转为历史资料。', kind: 'ai', status: 'archived', source: { kind: 'record', label: '一条赛前预测记录' }, scope: '极光 对 熔岩', ago: 11 * 24, expiresIn: -9 * 24, version: 1, supersededBy: null, recalls: 3 },

  { id: 'M-401', parentId: 'review', title: '大比分领先后的垃圾时间', body: '用户的观察：领先 20 分以上的比赛，末节替补上场后总分容易偏离预期。尚未用足够样本检验。', kind: 'observation', status: 'active', source: { kind: 'chat', label: '聊天「上周复盘」' }, scope: '大小分复盘', ago: 6 * 24, expiresIn: null, version: 1, supersededBy: null, recalls: 5 },
  { id: 'M-402', parentId: 'review', title: '让分一分以内的比赛观望偏少', body: 'AI 判断：旧策略在盘口 ±1 以内的比赛里给方向的次数偏多，结果接近随机。待更多样本验证。', kind: 'ai', status: 'active', source: { kind: 'maintenance', label: '后台整理' }, scope: '让分复盘', ago: 8 * 24, expiresIn: null, version: 1, supersededBy: null, recalls: 4 },
  { id: 'M-403', parentId: 'review', title: '连续客场第三场', body: '用户的观察：连续客场的第三场，球队下半场得分下滑。已被用户停用，等有数据再说。', kind: 'observation', status: 'disabled', source: { kind: 'chat', label: '聊天「上周复盘」' }, scope: '让分复盘', ago: 5 * 24, expiresIn: null, version: 1, supersededBy: null, recalls: 1 },
]

interface LogSeed extends Omit<MaintenanceEntry, 'time'> {
  ago: number
}

const LOG: LogSeed[] = [
  { id: 'L-9', ago: 20, action: 'conflict', detail: '“先给结论，再讲原因”与旧的“先讲原因，再给结论”冲突：以用户较新的明确要求为准，旧条目标为已替代并保留来源。', blockIds: ['M-101', 'M-100'] },
  { id: 'L-8', ago: 44, action: 'expire', detail: '“潮汐的背靠背第二场”对应的比赛已结束，不再作为赛前现状召回。', blockIds: ['M-302'] },
  { id: 'L-7', ago: 44, action: 'merge', detail: '合并两条意思相同的“时间按北京时间”，保留较早的来源。', blockIds: ['M-103'] },
  { id: 'L-6', ago: 9 * 24, action: 'archive', detail: '“极光 对 熔岩”的比赛研究在赛后转为历史资料并归档，可以恢复。', blockIds: ['M-303'] },
  { id: 'L-5', ago: 9 * 24 + 1, action: 'split', detail: '“复盘笔记”里一条同时讲了让分和大小分的条目，拆成两条分别保存。', blockIds: ['M-401', 'M-402'] },
]

function iso(now: number, hoursFromNow: number): string {
  return new Date(now + hoursFromNow * HOUR).toISOString()
}

export function demoMemory(): { parents: MemoryParent[]; children: MemoryChild[]; log: MaintenanceEntry[] } {
  const now = Date.now()
  return {
    parents: DEMO_PARENTS,
    children: CHILDREN.map(({ ago, expiresIn, ...child }) => ({ ...child, updatedAt: iso(now, -ago), expiresAt: expiresIn === null ? null : iso(now, expiresIn) })),
    log: LOG.map(({ ago, ...entry }) => ({ ...entry, time: iso(now, -ago) })),
  }
}
