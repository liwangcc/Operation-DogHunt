<script setup lang="ts">
// 聊天记录里的一条发言：用户的问题靠右，助手的回答按 Markdown 排版并附带模型、耗时和用量。
import { computed, h, ref, type FunctionalComponent } from 'vue'
import { blocks } from './markdown'
import { SELECTION_MARK, type Turn } from './types'

const props = defineProps<{ turn: Turn }>()

const parts = computed(() => {
  const split = props.turn.role === 'user' ? props.turn.content.indexOf(SELECTION_MARK) : -1
  return split < 0 ? { text: props.turn.content, selection: '' } : { text: props.turn.content.slice(0, split), selection: props.turn.content.slice(split + SELECTION_MARK.length) }
})

const Markdown: FunctionalComponent<{ text: string }> = (input) => h('div', { class: 'md' }, blocks(input.text))
Markdown.props = ['text']

const copied = ref(false)
let copyTimer = 0
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.turn.content)
    copied.value = true
    window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    // 浏览器不允许写剪贴板时不做任何事，文字仍可手动选中复制。
  }
}
</script>

<template>
  <article class="turn" :class="turn.role">
    <template v-if="turn.role === 'user'">
      <span class="turn-author">你</span>
      <div class="bubble">{{ parts.text }}</div>
      <span v-if="parts.selection" class="turn-selection"><span>选场</span>{{ parts.selection }}</span>
    </template>
    <template v-else>
      <header class="turn-head">
        <span class="turn-badge" aria-hidden="true"></span>
        <span class="turn-author">NBA 助手</span>
        <span v-if="turn.meta" class="turn-meta">
          {{ turn.meta.model }} · {{ turn.meta.seconds.toFixed(1) }} 秒<template v-if="turn.meta.usage"> · 输入 {{ turn.meta.usage.input_tokens }} / 输出 {{ turn.meta.usage.output_tokens }} tokens</template>
        </span>
        <button type="button" class="btn btn--sm btn--quiet turn-copy" @click="copy">{{ copied ? '已复制' : '复制' }}</button>
      </header>
      <Markdown :text="turn.content" />
    </template>
  </article>
</template>

<style scoped>
.turn { display: flex; flex-direction: column; margin-bottom: 26px; animation: turn-in .4s var(--ease-out) both; }
@keyframes turn-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.turn-author { font-size: 11px; letter-spacing: .2em; color: var(--text-3); }

.turn.user { align-items: flex-end; }
.bubble { max-width: min(78%, 640px); margin-top: 6px; padding: 11px 16px; border: 1px solid var(--cyan-line); border-radius: 10px 10px 2px 10px; background: linear-gradient(135deg, rgba(31, 96, 120, .5), rgba(21, 62, 82, .42)); font-size: 14px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.turn-selection { display: inline-flex; align-items: center; gap: 8px; max-width: min(78%, 640px); margin-top: 7px; padding: 3px 10px 3px 3px; border: 1px solid var(--line-2); border-radius: 3px; font-size: 12px; color: var(--text-2); overflow-wrap: anywhere; }
.turn-selection span { flex: 0 0 auto; padding: 1px 6px; border-radius: 2px; background: var(--cyan-soft); font-size: 11px; letter-spacing: .14em; color: var(--cyan); }

.turn.assistant { padding: 16px 20px 18px; border: 1px solid var(--line); border-left: 2px solid var(--cyan); border-radius: var(--radius-lg); background: linear-gradient(180deg, rgba(15, 31, 52, .9), rgba(9, 21, 37, .93)); }
.turn-head { display: flex; align-items: center; gap: 10px; min-height: 30px; margin-bottom: 8px; }
.turn-badge { width: 16px; height: 6px; background: var(--cyan); transform: skewX(-38deg); }
.turn-head .turn-author { color: var(--text); }
.turn-meta { min-width: 0; overflow: hidden; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-3); text-overflow: ellipsis; white-space: nowrap; }
.turn-copy { margin-left: auto; opacity: 0; transition: opacity .18s, color .18s, background .18s, border-color .18s; }
.turn:hover .turn-copy, .turn-copy:focus-visible { opacity: 1; }
@media (hover: none) { .turn-copy { opacity: 1; } }

/* —— 回答正文的排版 —— */
.md { font-size: 14.5px; line-height: 1.85; overflow-wrap: anywhere; }
.md :deep(p) { margin: 0 0 12px; white-space: pre-wrap; }
.md > :deep(:last-child) { margin-bottom: 0; }
.md :deep(h3) { margin: 22px 0 10px; font-size: 16px; font-weight: 600; letter-spacing: .06em; }
.md :deep(h4) { display: flex; align-items: center; gap: 10px; margin: 20px 0 10px; font-size: 14px; font-weight: 600; letter-spacing: .1em; color: var(--text); }
.md :deep(h4)::before { content: ''; width: 10px; height: 4px; background: var(--cyan); transform: skewX(-38deg); }
.md > :deep(:first-child) { margin-top: 0; }
.md :deep(strong) { font-weight: 650; color: #fff; }
.md :deep(ul), .md :deep(ol) { margin: 0 0 12px; padding-left: 22px; }
.md :deep(li) { margin: 3px 0; }
.md :deep(li)::marker { color: var(--cyan); font-variant-numeric: tabular-nums; }
.md :deep(li > ul), .md :deep(li > ol) { margin: 4px 0; }
.md :deep(a) { color: var(--cyan); text-decoration: underline; text-underline-offset: 3px; }
.md :deep(code) { padding: 1px 6px; border: 1px solid var(--line); border-radius: 3px; background: var(--well); font-family: var(--font-mono); font-size: .9em; }
.md :deep(pre) { margin: 0 0 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--well); overflow-x: auto; }
.md :deep(pre code) { padding: 0; border: 0; background: none; }
.md :deep(blockquote) { margin: 0 0 12px; padding: 8px 14px; border-left: 2px solid var(--amber-line); background: rgba(231, 170, 98, .06); color: var(--text-2); }
.md :deep(hr) { margin: 18px 0; border: 0; border-top: 1px solid var(--line-2); }
.md :deep(.md-table) { margin: 0 0 14px; border: 1px solid var(--line); border-radius: var(--radius); overflow-x: auto; }
.md :deep(table) { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.md :deep(th) { padding: 8px 14px; border-bottom: 1px solid var(--line-2); background: rgba(5, 11, 20, .5); font-size: 11px; font-weight: 500; letter-spacing: .14em; text-align: left; color: var(--text-3); white-space: nowrap; }
.md :deep(td) { padding: 8px 14px; border-bottom: 1px solid var(--line); }
.md :deep(tr:last-child td) { border-bottom: 0; }
.md :deep(.md-num) { font-style: italic; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
@media (max-width: 700px) {
  .turn.assistant { padding: 14px 14px 16px; }
  .bubble, .turn-selection { max-width: 90%; }
}
</style>
