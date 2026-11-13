<script setup lang="ts">
// 子块详情：记住了什么、从哪里来、何时更新、是否过期，以及修改、停用、确认、恢复、忘记这些操作。
import { computed, ref, watch } from 'vue'
import { ago, dateTime } from '@/components/odds/format'
import { now } from '@/stores/system'
import type { MemoryChild, MemoryParent } from '@/types/memory'
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, recallNote, recallable } from './labels'

const props = defineProps<{
  child: MemoryChild
  parent: MemoryParent | undefined
  /** 替代了这一条的子块，以及被这一条替代的子块。 */
  successor: MemoryChild | undefined
  predecessors: MemoryChild[]
}>()
const emit = defineEmits<{
  save: [body: string]
  status: [status: MemoryChild['status']]
  confirm: []
  forget: []
  jump: [id: string]
}>()

const editing = ref(false)
const draft = ref('')

const expiry = computed(() => {
  if (!props.child.expiresAt) return '长期有效'
  const left = Date.parse(props.child.expiresAt) - now.value
  return `${dateTime(props.child.expiresAt)}${left < 0 ? ' · 已过期' : ''}`
})

function startEdit(): void {
  draft.value = props.child.body
  editing.value = true
}

function save(): void {
  const body = draft.value.trim()
  if (body && body !== props.child.body) emit('save', body)
  editing.value = false
}

// 换了一条就退出编辑。
watch(() => props.child.id, () => {
  editing.value = false
})
</script>

<template>
  <article class="inspector panel panel--ticks" :aria-label="`子块 ${child.id}`">
    <p class="overline">子块 {{ child.id }} · {{ parent?.title ?? '未归类' }}</p>
    <h2 class="inspector-title">{{ child.title }}</h2>
    <div class="inspector-tags">
      <span class="tag" :class="STATUS_TONE[child.status]">{{ STATUS_LABEL[child.status] }}</span>
      <span class="tag">{{ KIND_LABEL[child.kind] }}</span>
      <span class="tag">第 {{ child.version }} 版</span>
    </div>

    <div v-if="editing" class="editor">
      <label :for="`memory-edit-${child.id}`" class="sr-only">修改内容</label>
      <textarea :id="`memory-edit-${child.id}`" v-model="draft" rows="4" maxlength="400"></textarea>
      <div class="editor-actions">
        <button type="button" class="btn btn--sm btn--primary" :disabled="!draft.trim()" @click="save">保存为新版本</button>
        <button type="button" class="btn btn--sm" @click="editing = false">取消</button>
      </div>
    </div>
    <p v-else class="inspector-body">{{ child.body }}</p>

    <p class="recall" :class="{ off: !recallable(child) }"><i aria-hidden="true"></i>{{ recallNote(child) }}</p>

    <p v-if="successor" class="relation">已被 <button type="button" class="link relation-link" @click="emit('jump', successor.id)">{{ successor.id }} {{ successor.title }}</button> 替代</p>
    <p v-for="item in predecessors" :key="item.id" class="relation">替代了 <button type="button" class="link relation-link" @click="emit('jump', item.id)">{{ item.id }} {{ item.title }}</button></p>

    <dl class="facts">
      <div><dt>来源</dt><dd>{{ child.source.label }}</dd></div>
      <div><dt>适用范围</dt><dd>{{ child.scope }}</dd></div>
      <div><dt>更新时间</dt><dd class="num">{{ dateTime(child.updatedAt) }}<small>{{ ago(child.updatedAt, now) }}</small></dd></div>
      <div><dt>有效期</dt><dd class="num">{{ expiry }}</dd></div>
      <div><dt>被回答引用</dt><dd class="num">{{ child.recalls }} 次</dd></div>
    </dl>

    <footer class="inspector-actions">
      <button type="button" class="btn btn--sm" :disabled="editing" @click="startEdit">修改</button>
      <button v-if="child.status === 'candidate'" type="button" class="btn btn--sm btn--primary" @click="emit('confirm')">确认为固定要求</button>
      <button v-if="child.status === 'active' || child.status === 'candidate'" type="button" class="btn btn--sm" @click="emit('status', 'disabled')">停用</button>
      <button v-if="child.status === 'disabled'" type="button" class="btn btn--sm" @click="emit('status', 'active')">重新启用</button>
      <button v-if="child.status === 'archived'" type="button" class="btn btn--sm" @click="emit('status', 'active')">从归档恢复</button>
      <button type="button" class="btn btn--sm forget" @click="emit('forget')">忘记</button>
    </footer>
  </article>
</template>

<style scoped>
.inspector { padding: 22px 24px 20px; }
.inspector-title { margin: 12px 0 0; font-size: 21px; font-weight: 600; letter-spacing: .04em; line-height: 1.35; }
.inspector-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
.inspector-body { margin: 16px 0 0; font-size: 15px; line-height: 1.85; }
.editor { margin-top: 16px; }
.editor textarea { display: block; width: 100%; padding: 12px 14px; border: 1px solid var(--cyan-line); border-radius: var(--radius); outline: 0; resize: vertical; background: var(--well); color: var(--text); font-size: 15px; line-height: 1.8; }
.editor textarea:focus { border-color: var(--cyan); }
.editor-actions { display: flex; gap: 8px; margin-top: 8px; }

.recall { display: flex; align-items: center; gap: 10px; margin: 16px 0 0; padding: 9px 12px; border: 1px solid rgba(116, 197, 158, .24); border-radius: var(--radius); background: var(--green-soft); font-size: 13px; color: #b3dfc9; }
.recall i { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
.recall.off { border-color: var(--line-2); background: rgba(160, 190, 202, .04); color: var(--text-2); }
.recall.off i { background: var(--text-3); }
.relation { margin: 10px 0 0; font-size: 13px; color: var(--text-2); }
.relation-link { padding: 0; border: 0; background: none; font-size: 13px; text-align: left; }

.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px 20px; margin: 20px 0 0; padding-top: 18px; border-top: 1px solid var(--line); }
.facts dt { font-size: 12px; letter-spacing: .06em; color: var(--text-3); }
.facts dd { margin: 3px 0 0; font-size: 14px; }
.facts dd small { display: block; font-size: 12px; color: var(--text-3); }
.inspector-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line); }
.forget { margin-left: auto; border-color: rgba(225, 129, 117, .36); color: var(--red); }
.forget:hover:not(:disabled) { border-color: var(--red); background: var(--red-soft); color: #f0b9b1; }
</style>
