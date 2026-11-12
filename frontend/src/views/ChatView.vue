<script setup lang="ts">
// NBA 助手：聊天记录、发送与等待、新对话；右侧是这次提问会读到的资料。对话只保存在本次打开的网站里。
import { computed, nextTick, onActivated, onMounted, ref, watch } from 'vue'
import { sendChat } from '@/api/chat'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatContext from '@/components/chat/ChatContext.vue'
import ChatTurn from '@/components/chat/ChatTurn.vue'
import ChatWaiting from '@/components/chat/ChatWaiting.vue'
import ChatWelcome from '@/components/chat/ChatWelcome.vue'
import { MAX_QUESTIONS, SELECTION_MARK, type Turn } from '@/components/chat/types'
import SideDrawer from '@/components/common/SideDrawer.vue'
import { demoTranscript } from '@/demo/transcript'
import { oddsSelection, sampleChatRequested } from '@/stores/oddsSelection'
import { checkModel, health, model, now } from '@/stores/system'

defineOptions({ name: 'ChatView' })

const turns = ref<Turn[]>([])
const input = ref('')
const loading = ref(false)
const error = ref('')
/** 正在等待回答的那个问题，以及发出的时刻。 */
const pending = ref<Turn | null>(null)
const startedAt = ref(0)
/** 当前显示的是示例对话（没有调用模型），不能接着提问。 */
const sample = ref(false)
const contextOpen = ref(false)
const scroller = ref<HTMLElement | null>(null)
const composer = ref<InstanceType<typeof ChatComposer> | null>(null)

// 从示例转到真实选场时恢复提问，虚构问答不能进入真实请求的历史。
watch(oddsSelection, (selection) => {
  if (!selection || !sample.value) return
  turns.value = []
  sample.value = false
  error.value = ''
})

const ready = computed(() => !!model.status?.configured && !sample.value)
const blockedReason = computed(() => {
  if (sample.value) return '这是示例对话，不能接着提问；点“新对话”后再开始。'
  if (model.checking) return '正在读取模型配置…'
  if (health.status === 'offline') return '后端未连接，暂时不能提问。'
  return '模型尚未配置，暂时不能提问；在后端填好模型配置后点“检查配置”。'
})
const modelTag = computed(() => {
  if (model.checking) return { tone: '', text: '读取模型配置…' }
  if (model.status?.configured) return { tone: 'tag--ok', text: `已配置 · ${model.status.model}` }
  return { tone: 'tag--warn', text: '模型尚未配置' }
})
const alert = computed(() => error.value || model.error)

async function scrollToEnd(): Promise<void> {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
}

async function send(): Promise<void> {
  const question = input.value.trim()
  if (!question || loading.value || !ready.value || !model.status) return
  if (turns.value.length >= MAX_QUESTIONS * 2) {
    error.value = `本轮已达到 ${MAX_QUESTIONS} 次提问，请开始新对话。`
    return
  }
  const selection = oddsSelection.value
  const userTurn: Turn = { role: 'user', content: selection ? `${question}${SELECTION_MARK}${selection.label}` : question }
  loading.value = true
  error.value = ''
  pending.value = userTurn
  startedAt.value = Date.now()
  await scrollToEnd()
  try {
    const history = [...turns.value, userTurn].map(({ role, content }) => ({ role, content }))
    const result = await sendChat(history, model.status.timeout_seconds, selection ? { event_id: selection.event_id, bookmaker_key: selection.bookmaker_key } : null)
    turns.value.push(userTurn, { role: 'assistant', content: result.reply, meta: { model: result.model, seconds: (Date.now() - startedAt.value) / 1000, usage: result.usage ?? null } })
    input.value = ''
  } catch (cause) {
    // 失败时保留输入，由用户决定是否重发；不自动重试。
    error.value = cause instanceof Error ? cause.message : '发送失败，请手动重试。'
  } finally {
    loading.value = false
    pending.value = null
    await scrollToEnd()
  }
}

function newChat(): void {
  if (loading.value) return
  turns.value = []
  sample.value = false
  oddsSelection.value = null
  input.value = ''
  error.value = ''
}

function usePrompt(text: string): void {
  input.value = text
  composer.value?.focus()
}

/** 载入示例对话；已经有真实对话时不覆盖。 */
function loadSample(): void {
  if (loading.value || (turns.value.length && !sample.value)) return
  turns.value = demoTranscript()
  sample.value = true
  oddsSelection.value = null
  error.value = ''
}

/** 从演示盘口点“交给 AI 分析”过来时，展示示例对话。 */
function consumeSampleRequest(): void {
  if (!sampleChatRequested.value) return
  sampleChatRequested.value = false
  loadSample()
}

onMounted(consumeSampleRequest)
onActivated(consumeSampleRequest)
</script>

<template>
  <section class="chat" aria-label="NBA 助手">
    <div class="chat-main">
      <header class="chat-head">
        <div class="chat-id">
          <h1 class="chat-title">NBA 助手</h1>
          <span class="tag" :class="modelTag.tone">{{ modelTag.text }}</span>
        </div>
        <div class="chat-actions">
          <button type="button" class="btn btn--sm btn--quiet" :disabled="model.checking || loading" @click="checkModel">检查配置</button>
          <button type="button" class="btn btn--sm" :disabled="loading || !turns.length" @click="newChat">新对话</button>
          <button type="button" class="btn btn--sm context-toggle" @click="contextOpen = true">本次资料</button>
        </div>
      </header>

      <div ref="scroller" class="chat-scroll">
        <ChatWelcome v-if="!turns.length && !loading" @prompt="usePrompt" @picked="composer?.focus()" @sample="loadSample" />
        <div v-else class="transcript" aria-live="polite" aria-label="聊天记录" :aria-busy="loading">
          <p v-if="sample" class="sample-note"><span>示例对话</span>没有调用模型；球队、盘口和结论都是虚构的，只用来预览排版。</p>
          <ChatTurn v-for="(turn, index) in turns" :key="index" :turn="turn" />
          <template v-if="loading && pending">
            <ChatTurn :turn="pending" />
            <ChatWaiting :elapsed-ms="Math.max(0, now - startedAt)" :timeout-seconds="model.status?.timeout_seconds ?? 0" />
          </template>
        </div>
      </div>

      <div class="chat-dock">
        <p v-if="alert" class="alert alert--bad" role="alert">{{ alert }}</p>
        <ChatComposer ref="composer" v-model="input" :loading="loading" :ready="ready" :blocked-reason="blockedReason" :selection-label="oddsSelection?.label ?? ''" @send="send" @clear="oddsSelection = null" />
      </div>
    </div>

    <aside class="chat-aside" aria-label="本次资料">
      <ChatContext :turns="turns" :loading="loading" :sample="sample" />
    </aside>
    <SideDrawer v-model:open="contextOpen" label="本次资料">
      <template #title><p class="overline">本次资料</p></template>
      <ChatContext class="drawer-context" :turns="turns" :loading="loading" :sample="sample" />
    </SideDrawer>
  </section>
</template>

<style scoped>
/* 聊天页占满状态条以下的整个高度：记录在中间滚动，输入区固定在底部。 */
.chat { display: grid; grid-template-columns: minmax(0, 1fr) 340px; height: calc(100dvh - var(--strip-height)); }
.chat-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.chat-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 36px; border-bottom: 1px solid var(--line); }
.chat-id { display: flex; align-items: center; gap: 14px; min-width: 0; }
.chat-title { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: .1em; line-height: 1.3; white-space: nowrap; }
.chat-actions { display: flex; align-items: center; gap: 8px; }
.context-toggle { display: none; }

.chat-scroll { display: flex; flex: 1; flex-direction: column; min-height: 0; padding: 0 36px; overflow-y: auto; }
.transcript { width: 100%; max-width: 860px; margin: 0 auto; padding: 26px 0 8px; }
.sample-note { display: flex; align-items: center; gap: 12px; margin: 0 0 22px; padding: 8px 12px; border: 1px solid var(--amber-line); border-radius: var(--radius); background: var(--amber-soft); font-size: 13px; color: #f1cf9f; }
.sample-note span { flex: 0 0 auto; font-size: 12px; font-weight: 600; letter-spacing: .2em; color: var(--amber); }

.chat-dock { padding: 10px 36px 22px; }
.chat-dock > * { max-width: 860px; margin-left: auto; margin-right: auto; }
.chat-dock .alert { margin-bottom: 10px; }

.chat-aside { border-left: 1px solid var(--line); background: rgba(5, 11, 20, .58); overflow-y: auto; }
.drawer-context { margin: -22px -26px; }

@media (max-width: 1180px) {
  .chat { grid-template-columns: minmax(0, 1fr); }
  .chat-aside { display: none; }
  .context-toggle { display: inline-flex; }
}
@media (max-width: 1000px) {
  .chat-head { padding: 12px 24px; }
  .chat-scroll { padding: 0 24px; }
  .chat-dock { padding: 10px 24px 18px; }
}
@media (max-width: 700px) {
  /* 再减去底部标签栏的高度。 */
  .chat { height: calc(100dvh - var(--strip-height) - 62px - env(safe-area-inset-bottom, 0px)); }
  .chat-head { padding: 10px 16px; }
  .chat-id .tag { display: none; }
  .chat-scroll { padding: 0 16px; }
  .chat-dock { padding: 8px 12px 12px; }
  .drawer-context { margin: -18px; }
}
</style>
