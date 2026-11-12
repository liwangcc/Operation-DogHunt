<script setup lang="ts">
// 聊天右侧的资料栏：这次提问后端会读到什么（盘口快照、当前选场）、本轮对话用了多少，以及使用边界。
import { computed } from 'vue'
import { dateTime } from '@/components/odds/format'
import { marketOf } from '@/components/odds/lines'
import MarketQuote from '@/components/odds/MarketQuote.vue'
import { oddsSelection } from '@/stores/oddsSelection'
import { board, boardStale, model, now } from '@/stores/system'
import { MAX_QUESTIONS, type Turn } from './types'

const props = defineProps<{ turns: Turn[]; loading: boolean; sample: boolean }>()

const questions = computed(() => props.turns.filter((turn) => turn.role === 'user').length)
const tokens = computed(() => props.turns.reduce((sum, turn) => ({
  input: sum.input + (turn.meta?.usage?.input_tokens ?? 0),
  output: sum.output + (turn.meta?.usage?.output_tokens ?? 0),
}), { input: 0, output: 0 }))

/** 当前选场在已读取的快照里对应的比赛和平台；只用于在这里显示，发送时后端会重新读取。 */
const selected = computed(() => {
  const selection = oddsSelection.value
  if (!selection) return null
  const event = board.data?.events.find((item) => item.id === selection.event_id)
  const book = event?.bookmakers.find((item) => item.key === selection.bookmaker_key)
  return { label: selection.label, event, book }
})
</script>

<template>
  <div class="context">
    <section class="context-block">
      <h2 class="label">本次会读取的资料</h2>
      <div class="snapshot">
        <div class="snapshot-row"><span>盘口快照</span>
          <strong v-if="board.data?.fetched_at" class="num">{{ dateTime(board.data.fetched_at) }}</strong>
          <strong v-else>{{ board.loading ? '读取中…' : '尚无数据' }}</strong>
        </div>
        <div class="snapshot-row"><span>数据源</span><strong>{{ board.data?.provider ?? '—' }}</strong></div>
        <div class="snapshot-row"><span>已保存比赛</span><strong class="num">{{ board.data?.events.length ?? 0 }} 场</strong></div>
        <div class="snapshot-row"><span>状态</span>
          <span v-if="!board.data?.fetched_at" class="tag">没有可读的快照</span>
          <span v-else class="tag" :class="boardStale ? 'tag--warn' : 'tag--ok'">{{ boardStale ? '待更新' : '已保存' }}</span>
        </div>
      </div>
      <p class="context-note">发送时由后端读取最新保存的快照，不会自动更新盘口。<RouterLink to="/matches" class="link">前往比赛与盘口 →</RouterLink></p>
    </section>

    <section class="context-block">
      <h2 class="label">当前选场</h2>
      <template v-if="selected">
        <p class="selection-label">{{ selected.label }}</p>
        <div v-if="selected.event && selected.book" class="selection-quotes">
          <MarketQuote :market="marketOf(selected.book, 'spreads')" kind="spreads" :away="selected.event.away_team" :home="selected.event.home_team" :now="now" />
          <MarketQuote :market="marketOf(selected.book, 'totals')" kind="totals" :away="selected.event.away_team" :home="selected.event.home_team" :now="now" />
        </div>
        <p class="context-note">只使用这场比赛、这家平台的报价。</p>
        <button type="button" class="btn btn--sm" :disabled="loading" @click="oddsSelection = null">取消选场</button>
      </template>
      <p v-else class="context-note">未选场：提问会参考全部已保存的比赛。</p>
    </section>

    <section class="context-block">
      <h2 class="label">本轮对话</h2>
      <template v-if="sample">
        <p class="context-note">正在显示示例对话，没有调用模型，也不计入提问次数。</p>
      </template>
      <template v-else>
        <div class="meter" role="img" :aria-label="`本轮已提问 ${questions} 次，最多 ${MAX_QUESTIONS} 次`">
          <div class="meter-head"><span>提问</span><strong class="num">{{ questions }}<small> / {{ MAX_QUESTIONS }}</small></strong></div>
          <div class="meter-bar"><i :style="{ transform: `scaleX(${questions / MAX_QUESTIONS})` }"></i></div>
        </div>
        <div class="snapshot">
          <div class="snapshot-row"><span>模型</span><strong>{{ model.status?.configured ? model.status.model : '未配置' }}</strong></div>
          <div class="snapshot-row"><span>单次最长等待</span><strong class="num">{{ model.status ? `${model.status.timeout_seconds} 秒` : '—' }}</strong></div>
          <div v-if="tokens.input + tokens.output" class="snapshot-row"><span>累计 tokens</span><strong class="num">输入 {{ tokens.input }} · 输出 {{ tokens.output }}</strong></div>
        </div>
      </template>
    </section>

    <section class="context-block">
      <h2 class="label">使用边界</h2>
      <ul class="limits">
        <li>保存的报价可能过期，不含实时比分或伤病。</li>
        <li>切换页面保留对话；刷新或关闭网站后清空，尚未长期保存。</li>
        <li>请求不会自动重试；等待超时后，中转站可能仍已计费。</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.context { display: grid; gap: 0; align-content: start; }
.context-block { padding: 18px 20px; border-bottom: 1px solid var(--line); }
.context-block:last-child { border-bottom: 0; }
.context-block h2 { margin: 0 0 12px; font-weight: 400; }
.snapshot { display: grid; gap: 7px; }
.snapshot-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }
.snapshot-row > span:first-child { color: var(--text-3); white-space: nowrap; }
.snapshot-row strong { min-width: 0; overflow: hidden; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.context-note { margin: 10px 0 0; font-size: 12px; line-height: 1.75; color: var(--text-3); }
.context-note .link { white-space: nowrap; }
.selection-label { margin: 0; padding: 9px 12px; border: 1px solid var(--cyan-line); border-radius: var(--radius); background: var(--cyan-soft); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.selection-quotes { display: grid; gap: 12px; margin-top: 12px; }
.context-block .btn { margin-top: 10px; }
.meter { margin-bottom: 12px; }
.meter-head { display: flex; align-items: baseline; justify-content: space-between; font-size: 13px; color: var(--text-3); }
.meter-head strong { font-size: 22px; font-style: italic; font-weight: 800; color: var(--text); }
.meter-head small { font-size: 12px; font-style: normal; font-weight: 400; color: var(--text-3); }
.meter-bar { height: 3px; margin-top: 6px; background: var(--line-2); overflow: hidden; }
.meter-bar i { display: block; height: 100%; background: var(--cyan); transform-origin: left; transition: transform .4s var(--ease-out); }
.limits { display: grid; gap: 6px; margin: 0; padding-left: 16px; font-size: 12px; line-height: 1.7; color: var(--text-3); }
</style>
