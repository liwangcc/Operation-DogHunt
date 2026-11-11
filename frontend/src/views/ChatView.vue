<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { getModelStatus, sendChat } from '@/api/chat'
import type { ChatMessage, ModelStatus } from '@/types/api'
import { oddsSelection } from '@/stores/oddsSelection'

defineOptions({ name: 'ChatView' })

const model = ref<ModelStatus | null>(null)
const loading = ref(false)
const checking = ref(false)
const input = ref('')
const pendingQuestion = ref('')
const error = ref('')
const messages = ref<ChatMessage[]>([])
const transcript = ref<HTMLElement | null>(null)

async function checkModel() {
  checking.value = true
  error.value = ''
  try { model.value = await getModelStatus() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '读取模型配置失败。' }
  finally { checking.value = false }
}

async function scrollToReply() {
  await nextTick()
  transcript.value?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

async function send() {
  const question = input.value.trim()
  if (!question || loading.value || !model.value?.configured) return
  if (messages.value.length >= 40) {
    error.value = '本轮已达到 20 次提问，请开始新对话。'
    return
  }
  loading.value = true
  error.value = ''
  pendingQuestion.value = question
  await scrollToReply()
  try {
    const selection = oddsSelection.value
    const userMessage: ChatMessage = { role: 'user', content: selection ? `${question}\n\n本次选场：${selection.label}` : question }
    const result = await sendChat([...messages.value, userMessage], model.value.timeout_seconds,
      selection ? { event_id: selection.event_id, bookmaker_key: selection.bookmaker_key } : null)
    messages.value.push(userMessage, { role: 'assistant', content: result.reply })
    input.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '发送失败，请手动重试。'
  } finally {
    loading.value = false
    pendingQuestion.value = ''
    await scrollToReply()
  }
}

function newChat() {
  if (loading.value) return
  messages.value = []
  oddsSelection.value = null
  input.value = ''
  error.value = ''
}

onMounted(checkModel)
</script>

<template>
  <section class="chat-page">
    <div class="chat-heading">
      <span class="eyebrow">NBA 分析工作空间</span>
      <span class="stage-badge">模型聊天</span>
    </div>
    <div class="model-toolbar">
      <span>{{ checking ? '读取模型配置…' : model?.configured ? `已配置 · ${model.model}` : '模型尚未配置' }}</span>
      <div>
        <button class="text-button" :disabled="checking || loading" @click="checkModel">检查配置</button>
        <button class="text-button" :disabled="loading || !messages.length" @click="newChat">新对话</button>
      </div>
    </div>
    <div v-if="!messages.length && !loading" class="chat-welcome">
      <div class="court-mark" aria-hidden="true">↗</div>
      <h1>从一场比赛开始。</h1>
      <p class="page-description">直接询问已保存的比赛，或去<RouterLink to="/matches">比赛与盘口</RouterLink>选一场再聊。</p>
      <div class="workflow-cards" aria-label="当前可用的聊天流程">
        <article><span>01</span><h2>查看或询问比赛</h2><p>在独立比赛页选场，或直接问日期和球队</p></article>
        <article><span>02</span><h2>结合盘口分析</h2><p>读取已保存的报价，说明来源与数据时间</p></article>
        <article><span>03</span><h2>继续追问</h2><p>在本页保留对话，讨论条件变化</p></article>
      </div>
    </div>
    <div v-else ref="transcript" class="chat-transcript" aria-live="polite" aria-label="聊天记录" :aria-busy="loading">
      <article v-for="(message, index) in messages" :key="index" class="chat-message" :class="message.role">
        <span class="message-author">{{ message.role === 'user' ? '你' : 'NBA 助手' }}</span>
        <div class="message-content">{{ message.content }}</div>
      </article>
      <template v-if="loading">
        <article class="chat-message user"><span class="message-author">你</span><div class="message-content">{{ pendingQuestion }}</div></article>
        <article class="chat-message assistant"><span class="message-author">NBA 助手</span><div class="message-content">正在等待模型回答，最长 {{ model?.timeout_seconds }} 秒…</div></article>
      </template>
    </div>
    <div v-if="oddsSelection" class="selected-match" role="status">
      <div><strong>当前分析比赛</strong><span>{{ oddsSelection.label }}</span><small>发送时读取该平台最新保存的报价，不会自动更新盘口。</small></div>
      <button class="text-button" :disabled="loading" @click="oddsSelection = null">取消选场</button>
    </div>
    <p v-else class="chat-limit-note">每次提问会参考最新保存的比赛与盘口；<RouterLink to="/matches">前往比赛与盘口 →</RouterLink></p>
    <p class="chat-limit-note">保存的报价可能过期，不含实时比分或伤病。切换页面保留对话，刷新或关闭网站后清空，尚未长期保存。</p>
    <p v-if="error" class="chat-error" role="alert">{{ error }}</p>
    <form class="composer-preview" @submit.prevent="send">
      <label for="chat-input">向 NBA 助手提问</label>
      <textarea id="chat-input" v-model="input" :disabled="loading || !model?.configured" maxlength="12000" :placeholder="oddsSelection ? '例如：按选中的平台，分析这场的让分和大小分，还缺什么资料？' : '例如：明天有哪些已保存的 NBA 比赛？凯尔特人的让分和大小分是多少？'" rows="3"></textarea>
      <div class="composer-footer"><span>{{ loading ? '本次请求不会自动重试' : '发送后会调用模型并消耗中转站额度' }}</span><button type="submit" :disabled="loading || !model?.configured || !input.trim()">{{ loading ? '分析中…' : '发送 ↑' }}</button></div>
    </form>
  </section>
</template>

<style scoped>
.model-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 12px; color: #61736a; font-size: 12px; flex-wrap: wrap; }
.chat-transcript { width: 100%; max-width: 850px; margin: 24px auto; }
.chat-message { margin: 0 0 20px; border: 1px solid #e1e7de; border-radius: 12px; padding: 18px 20px; background: #fff; }
.chat-message.user { background: #edf3e9; margin-left: 32px; }
.message-author { color: #61736a; font-size: 11px; }
.message-content { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 8px; font-size: 14px; line-height: 1.9; }
.chat-limit-note { max-width: 850px; width: 100%; margin: 12px auto; color: #77857b; font-size: 11px; }
.chat-error { width: 100%; max-width: 850px; margin: 0 auto 14px; color: #a04d37; font-size: 13px; }
.selected-match { width: 100%; max-width: 850px; margin: 12px auto; padding: 14px 16px; border: 1px solid #dbe5d9; border-radius: 10px; background: #edf3e9; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.selected-match strong { font-size: 12px; }
.selected-match span, .selected-match small { display: block; margin-top: 6px; font-size: 12px; overflow-wrap: anywhere; }
.selected-match small { font-size: 10px; color: #77857b; }
.selected-match button { flex-shrink: 0; }
</style>
