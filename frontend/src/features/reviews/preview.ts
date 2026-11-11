import type { RecordPreview } from '@/data/recordPreview'

export interface ReviewSupplement {
  id: string
  content: string
  createdAt: string
}

export interface ReviewEntry {
  id: string
  matchKey: string
  recordIds: string[]
  summary: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
  supplements: ReviewSupplement[]
}

export interface ReviewDraft {
  summary: string
  content: string
  tags: string[]
}

export const reviewTags = ['比赛节奏', '阵容变化', '盘口判断', '分析依据', '资料不足', '其他观察']

// 仅用于 UI 示例归组；真实数据接入后替换为供应商赛事标识。
export function matchKey(record: RecordPreview) {
  return `${record.day}|${record.away}|${record.home}`
}

export function relatedRecords(records: readonly RecordPreview[], key: string) {
  return records.filter(record => matchKey(record) === key)
}

export function createReview(records: readonly RecordPreview[], record: RecordPreview, draft: ReviewDraft, now: string): ReviewEntry {
  const key = matchKey(record)
  const content = draft.content.trim()
  if (!content) throw new Error('请先写下复盘内容。')
  return {
    id: `REVIEW-${record.id}`,
    matchKey: key,
    recordIds: relatedRecords(records, key).map(item => item.id),
    summary: draft.summary.trim() || content.split('\n')[0]!.slice(0, 60),
    content,
    tags: [...draft.tags],
    createdAt: now,
    updatedAt: now,
    supplements: [],
  }
}

export function appendSupplement(entry: ReviewEntry, content: string, now: string): ReviewEntry {
  const text = content.trim()
  if (!text) throw new Error('请先写下补充内容。')
  return {
    ...entry,
    updatedAt: now,
    supplements: [...entry.supplements, { id: `${entry.id}-${entry.supplements.length + 1}`, content: text, createdAt: now }],
  }
}

export function seedReviews(records: readonly RecordPreview[]): ReviewEntry[] {
  const reviews: ReviewEntry[] = []
  const original = records.find(record => record.note)
  if (original) reviews.push(createReview(records, original, {
    summary: '得分表现之外，也要核对真实的进攻节奏',
    content: original.note,
    tags: ['比赛节奏', '分析依据'],
  }, '2026-11-11 13:20'))
  const win = records.find(record => record.result === 'win')
  if (win) reviews.push(createReview(records, win, {
    summary: '赢盘之后，也要回看替补时段的判断',
    content: '示例复盘：内线优势的判断与比赛表现接近，但赛前对替补时段的观察还比较粗略。这次赢盘不能说明每个分析环节都充分，继续积累相似比赛再比较。',
    tags: ['阵容变化', '分析依据'],
  }, '2026-11-11 12:40'))
  return reviews
}

export function previewTimestamp() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date())
  return parts.replace(',', '')
}
