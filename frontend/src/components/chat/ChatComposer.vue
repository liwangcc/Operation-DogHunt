<script setup lang="ts">
// 聊天输入区：输入框随内容长高，Enter 或按钮发送，Shift + Enter 换行；选了比赛时在输入框上方挂一个标签。
import { computed, nextTick, ref, watch } from 'vue'

const text = defineModel<string>({ required: true })
const props = defineProps<{
  loading: boolean
  /** 模型已配置、可以提问。 */
  ready: boolean
  /** 不能提问时的原因，显示在输入框下方。 */
  blockedReason: string
  selectionLabel: string
}>()
const emit = defineEmits<{ send: []; clear: [] }>()

const MAX_LENGTH = 12000
const area = ref<HTMLTextAreaElement | null>(null)

const disabled = computed(() => props.loading || !props.ready)
const hint = computed(() => {
  if (props.loading) return '本次请求不会自动重试'
  if (!props.ready) return props.blockedReason
  return '发送后会调用模型并消耗中转站额度'
})
/** 手机上输入框只有一行高，放不下完整的示例。 */
const narrow = window.matchMedia('(max-width: 700px)').matches
const placeholder = computed(() => {
  if (narrow) return props.selectionLabel ? '问问选中的这场比赛' : '向 NBA 助手提问'
  return props.selectionLabel
    ? '例如：按选中的平台，分析这场的让分和大小分，还缺什么资料？'
    : '例如：明天有哪些已保存的 NBA 比赛？凯尔特人的让分和大小分是多少？'
})

/** 输入框高度跟着内容走，最多长到 200 像素，再多就在框内滚动。 */
function grow(): void {
  const element = area.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(200, element.scrollHeight)}px`
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) return
  // 输入法正在组字时的回车是在选字，不是发送；Safari 组字结束那一下 isComposing 已是 false，要看 keyCode 229。
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  if (!disabled.value && text.value.trim()) emit('send')
}

watch(text, () => void nextTick(grow))

defineExpose({
  focus: () => void nextTick(() => {
    area.value?.focus()
    grow()
  }),
})
</script>

<template>
  <form class="composer" @submit.prevent="emit('send')">
    <div v-if="selectionLabel" class="composer-selection" role="status">
      <span class="selection-key">当前分析比赛</span>
      <span class="selection-text">{{ selectionLabel }}</span>
      <button type="button" class="icon-btn" aria-label="取消选场" title="取消选场" :disabled="loading" @click="emit('clear')">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
      </button>
    </div>
    <label for="chat-input" class="sr-only">向 NBA 助手提问</label>
    <textarea id="chat-input" ref="area" v-model="text" rows="1" :maxlength="MAX_LENGTH" :disabled="disabled" :placeholder="placeholder" @keydown="onKeydown"></textarea>
    <div class="composer-foot">
      <span class="composer-hint" :class="{ blocked: !ready && !loading }">{{ hint }}</span>
      <span v-if="text.length > MAX_LENGTH - 2000" class="composer-count num">{{ text.length }} / {{ MAX_LENGTH }}</span>
      <span class="composer-keys" aria-hidden="true"><kbd class="kbd">Enter</kbd> 发送 · <kbd class="kbd">Shift</kbd><kbd class="kbd">Enter</kbd> 换行</span>
      <button type="submit" class="btn btn--primary" :disabled="disabled || !text.trim()">{{ loading ? '分析中…' : '发送' }} <span aria-hidden="true">↑</span></button>
    </div>
  </form>
</template>

<style scoped>
.composer { border: 1px solid var(--line-2); border-radius: var(--radius-lg); background: linear-gradient(180deg, rgba(16, 33, 55, .96), rgba(10, 22, 38, .97)); box-shadow: 0 -10px 40px rgba(2, 6, 12, .35); transition: border-color .2s, box-shadow .2s; }
.composer:focus-within { border-color: var(--cyan-line); box-shadow: 0 -10px 40px rgba(2, 6, 12, .35), 0 0 0 3px rgba(73, 221, 235, .08), 0 0 28px rgba(73, 221, 235, .14); }
.composer-selection { display: flex; align-items: center; gap: 10px; margin: 10px 10px 0; padding: 5px 4px 5px 10px; border: 1px solid var(--cyan-line); border-radius: var(--radius); background: var(--cyan-soft); font-size: 13px; }
.selection-key { flex: 0 0 auto; font-size: 11px; letter-spacing: .16em; color: var(--cyan); }
.selection-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer-selection .icon-btn { width: 26px; height: 26px; }
textarea { display: block; width: 100%; min-height: 54px; max-height: 200px; padding: 16px 18px 6px; border: 0; outline: 0; resize: none; background: transparent; color: var(--text); font-size: 15px; line-height: 1.7; }
textarea::placeholder { color: var(--text-3); opacity: 1; }
textarea:disabled { cursor: not-allowed; }
.composer-foot { display: flex; align-items: center; gap: 12px; padding: 6px 10px 10px 18px; }
.composer-hint { flex: 1; min-width: 0; font-size: 12px; color: var(--text-3); }
.composer-hint.blocked { color: var(--amber); }
.composer-count { font-size: 12px; color: var(--amber); }
.composer-keys { display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--text-3); white-space: nowrap; }
@media (max-width: 700px) {
  .composer-keys { display: none; }
  textarea { padding: 12px 14px 4px; font-size: 16px; }
  .composer-foot { padding: 6px 8px 8px 14px; }
}
</style>
