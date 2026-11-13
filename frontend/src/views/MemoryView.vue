<script setup lang="ts">
// 长期记忆：父块是目录，子块是具体条目。可以查看来源与有效期，修改、停用、确认、忘记（可撤销），并查看后台维护记录。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DemoRibbon from '@/components/common/DemoRibbon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { ACTION_LABEL, ACTION_TONE, recallable } from '@/components/memory/labels'
import MemoryInspector from '@/components/memory/MemoryInspector.vue'
import MemoryRack from '@/components/memory/MemoryRack.vue'
import { ago, dateTime } from '@/components/odds/format'
import { demoMemory } from '@/demo/memory'
import { demoEnabled, setDemo } from '@/stores/demo'
import { now } from '@/stores/system'
import type { MaintenanceEntry, MemoryChild, MemoryParent } from '@/types/memory'

/** “忘记”之后多久内可以撤销。 */
const UNDO_MS = 8000

const parents = ref<MemoryParent[]>([])
const children = ref<MemoryChild[]>([])
const log = ref<MaintenanceEntry[]>([])
const selectedId = ref<string | null>(null)
const filter = ref<'all' | 'active' | 'candidate' | 'idle'>('all')
const search = ref('')
/** 刚刚被忘记、还能撤销的那一条，以及它原来的位置。 */
const forgotten = ref<{ child: MemoryChild; index: number } | null>(null)
let undoTimer = 0

// 后端还没有记忆接口：演示数据打开时载入一份可以随便操作的演示内容，关闭时清空。
watch(demoEnabled, (enabled) => {
  const data = enabled ? demoMemory() : { parents: [], children: [], log: [] }
  parents.value = data.parents
  children.value = data.children
  log.value = data.log
  selectedId.value = data.children.find((child) => child.status === 'active')?.id ?? null
  forgotten.value = null
}, { immediate: true })

const selected = computed(() => children.value.find((child) => child.id === selectedId.value) ?? null)
const counts = computed(() => ({
  all: children.value.length,
  active: children.value.filter(recallable).length,
  candidate: children.value.filter((child) => child.status === 'candidate').length,
  idle: children.value.filter((child) => child.status !== 'active' && child.status !== 'candidate').length,
}))
const dimmed = computed(() => {
  const words = search.value.trim().toLowerCase()
  return new Set(children.value.filter((child) => {
    const inFilter = filter.value === 'all' || (filter.value === 'idle' ? child.status !== 'active' && child.status !== 'candidate' : child.status === filter.value)
    const inSearch = !words || `${child.id} ${child.title} ${child.body} ${child.source.label} ${child.scope}`.toLowerCase().includes(words)
    return !(inFilter && inSearch)
  }).map((child) => child.id))
})
const matched = computed(() => children.value.length - dimmed.value.size)

function update(patch: Partial<MemoryChild>): void {
  const child = selected.value
  if (!child) return
  Object.assign(child, patch, { updatedAt: new Date().toISOString() })
}

function forget(): void {
  const index = children.value.findIndex((child) => child.id === selectedId.value)
  if (index < 0) return
  const [child] = children.value.splice(index, 1)
  forgotten.value = { child, index }
  selectedId.value = null
  window.clearTimeout(undoTimer)
  undoTimer = window.setTimeout(() => {
    forgotten.value = null
  }, UNDO_MS)
}

function undo(): void {
  if (!forgotten.value) return
  window.clearTimeout(undoTimer)
  children.value.splice(forgotten.value.index, 0, forgotten.value.child)
  selectedId.value = forgotten.value.child.id
  forgotten.value = null
}

onBeforeUnmount(() => window.clearTimeout(undoTimer))
</script>

<template>
  <section class="page memory" aria-labelledby="memory-heading">
    <header class="page-head reveal">
      <div>
        <p class="overline"><b>05</b>机柜区</p>
        <h1 id="memory-heading" class="page-title">长期记忆</h1>
        <p class="page-sub">像一本有目录的笔记：父块组织主题，子块保存具体内容。</p>
      </div>
    </header>

    <DemoRibbon v-if="demoEnabled" class="reveal" reason="后端还没有记忆的保存和召回；这里的修改、停用、忘记只作用于这一页的演示内容，刷新后恢复。" />

    <EmptyState v-if="!parents.length" title="还没有长期记忆">
      <p>自动保存、按父块子块整理和定期维护还没有在后端实现，所以这里没有任何记住的内容。聊天目前不会跨对话记忆。</p>
      <template #actions>
        <button type="button" class="btn btn--amber" @click="setDemo(true)">用演示数据预览界面</button>
      </template>
    </EmptyState>

    <template v-else>
      <div class="toolbar reveal" style="--i: 1">
        <div class="seg" role="group" aria-label="按状态筛选">
          <button v-for="option in [['all', '全部'], ['active', '生效中'], ['candidate', '候选'], ['idle', '不再召回']] as const" :key="option[0]" type="button" :aria-pressed="filter === option[0]" @click="filter = option[0]">{{ option[1] }}<span class="seg-count">{{ counts[option[0]] }}</span></button>
        </div>
        <input v-model="search" class="input search" type="search" placeholder="搜索记住的内容、来源或适用范围" aria-label="搜索记忆" />
        <span class="toolbar-count num" role="status">{{ parents.length }} 个父块 · {{ matched }} / {{ children.length }} 条子块</span>
      </div>

      <div class="racks reveal" style="--i: 2">
        <MemoryRack v-for="(parent, index) in parents" :key="parent.id" :parent="parent" :index="index" :children="children.filter((child) => child.parentId === parent.id)" :selected="selectedId" :dimmed="dimmed" @select="selectedId = $event" />
      </div>

      <div class="detail reveal" style="--i: 3">
        <MemoryInspector
          v-if="selected"
          :child="selected"
          :parent="parents.find((parent) => parent.id === selected!.parentId)"
          :successor="children.find((child) => child.id === selected!.supersededBy)"
          :predecessors="children.filter((child) => child.supersededBy === selected!.id)"
          @save="update({ body: $event, version: selected.version + 1 })"
          @status="update({ status: $event })"
          @confirm="update({ status: 'active', kind: 'explicit', expiresAt: null })"
          @forget="forget"
          @jump="selectedId = $event"
        />
        <div v-else class="detail-none panel"><p>在上面的机柜里点一条子块，查看它的内容、来源和有效期。</p></div>

        <article class="panel panel-pad log" aria-labelledby="log-heading">
          <h2 id="log-heading" class="section-title">维护记录<small>后台整理的动作，不是你的发言</small></h2>
          <ol>
            <li v-for="entry in log" :key="entry.id">
              <div class="log-head"><span class="tag" :class="ACTION_TONE[entry.action]">{{ ACTION_LABEL[entry.action] }}</span><time :datetime="entry.time" :title="dateTime(entry.time)">{{ ago(entry.time, now) }}</time></div>
              <p>{{ entry.detail }}</p>
              <div class="log-blocks">
                <template v-for="id in entry.blockIds" :key="id">
                  <button v-if="children.some((child) => child.id === id)" type="button" class="log-block" @click="selectedId = id">{{ id }}</button>
                  <span v-else class="log-block gone">{{ id }} 已忘记</span>
                </template>
              </div>
            </li>
          </ol>
        </article>
      </div>

      <ul class="notes">
        <li>只有“生效中”的子块会在回答时被取出来用。从单次行为推断出的偏好先作为候选，不会直接当成确定要求。</li>
        <li>有时效的内容（某场比赛的假设、待核实问题）到期后不再作为当前情况使用；盘口和伤病不靠长期记忆缓存。</li>
        <li>正式预测、盘口快照和结算记录独立保存，记忆的整理和忘记不会改写它们。访问密钥不会进入记忆。</li>
      </ul>
    </template>

    <Transition name="toast">
      <div v-if="forgotten" class="toast" role="status">
        <span>已忘记「{{ forgotten.child.title }}」，后续不会再使用。</span>
        <button type="button" class="btn btn--sm btn--primary" @click="undo">撤销</button>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px 12px; flex-wrap: wrap; margin-bottom: 18px; }
.search { flex: 1 1 240px; max-width: 380px; }
.toolbar-count { margin-left: auto; font-size: 12px; color: var(--text-3); white-space: nowrap; }
.racks { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
.detail { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.detail-none { display: grid; place-items: center; min-height: 220px; padding: 24px; border-style: dashed; font-size: 13px; text-align: center; color: var(--text-3); }
.detail-none p { margin: 0; }

/* 维护记录：一条竖线串起来的时间顺序。 */
.log ol { display: grid; gap: 0; margin: 16px 0 0; padding: 0; list-style: none; }
.log li { position: relative; padding: 0 0 18px 20px; border-left: 1px solid var(--line-2); }
.log li:last-child { padding-bottom: 0; }
.log li::before { content: ''; position: absolute; left: -3px; top: 8px; width: 5px; height: 5px; background: var(--text-3); }
.log-head { display: flex; align-items: center; gap: 10px; }
.log-head time { font-size: 12px; color: var(--text-3); }
.log p { margin: 7px 0 8px; font-size: 13px; line-height: 1.75; color: var(--text-2); }
.log-blocks { display: flex; gap: 6px; flex-wrap: wrap; }
.log-block { padding: 1px 8px; border: 1px solid var(--line-2); border-radius: var(--radius); background: transparent; font-family: var(--font-mono); font-size: 11px; color: var(--text-2); transition: color .14s, border-color .14s; }
button.log-block:hover { border-color: var(--cyan-line); color: var(--cyan); }
.log-block.gone { border-style: dashed; font-family: inherit; color: var(--text-3); }

.notes { display: grid; gap: 6px; margin: 28px 0 0; padding: 16px 0 0 18px; border-top: 1px solid var(--line); font-size: 12px; line-height: 1.8; color: var(--text-3); }

.toast { position: fixed; left: 50%; bottom: 28px; z-index: 60; display: flex; align-items: center; gap: 16px; max-width: calc(100vw - 32px); padding: 9px 9px 9px 18px; border: 1px solid var(--line-3); border-radius: var(--radius-lg); background: var(--panel-solid); box-shadow: var(--shadow-panel); font-size: 13px; transform: translateX(-50%); }
.toast-enter-active, .toast-leave-active { transition: opacity .18s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; }

@media (max-width: 1300px) {
  .racks { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 1000px) {
  .detail { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 700px) {
  .racks { grid-template-columns: minmax(0, 1fr); }
  .toolbar-count { margin-left: 0; }
  .toast { bottom: calc(76px + env(safe-area-inset-bottom, 0px)); }
}
</style>
