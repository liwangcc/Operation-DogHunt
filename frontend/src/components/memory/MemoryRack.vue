<script setup lang="ts">
// 一个父块画成一台机柜：柜头是父块的标题和摘要，柜里每一条插槽是一个子块，指示灯的颜色表示它的状态。
import { computed } from 'vue'
import type { MemoryChild, MemoryParent } from '@/types/memory'
import { STATUS_LABEL } from './labels'

const props = defineProps<{
  parent: MemoryParent
  index: number
  children: MemoryChild[]
  /** 当前选中的子块编号。 */
  selected: string | null
  /** 不符合筛选条件的子块编号，显示时压暗。 */
  dimmed: Set<string>
}>()
const emit = defineEmits<{ select: [id: string] }>()

const counts = computed(() => ({
  active: props.children.filter((child) => child.status === 'active').length,
  candidate: props.children.filter((child) => child.status === 'candidate').length,
  idle: props.children.filter((child) => child.status !== 'active' && child.status !== 'candidate').length,
}))
</script>

<template>
  <section class="rack panel" :class="{ current: children.some((child) => child.id === selected) }" :aria-label="`父块：${parent.title}`">
    <header class="rack-head">
      <span class="rack-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
      <h2>{{ parent.title }}</h2>
      <span class="rack-count num">{{ children.length }} 条</span>
    </header>
    <p class="rack-summary">{{ parent.summary }}</p>
    <ul class="rack-bay">
      <li v-for="child in children" :key="child.id">
        <button type="button" class="slot" :class="[child.status, { on: child.id === selected, dim: dimmed.has(child.id) }]" :aria-pressed="child.id === selected" @click="emit('select', child.id)">
          <i class="led" aria-hidden="true"></i>
          <span class="slot-id">{{ child.id }}</span>
          <span class="slot-title">{{ child.title }}</span>
          <span v-if="child.status !== 'active'" class="slot-state">{{ STATUS_LABEL[child.status] }}</span>
        </button>
      </li>
      <li v-if="!children.length" class="rack-empty">这个父块下没有子块了</li>
    </ul>
    <p class="rack-foot num">生效中 {{ counts.active }} · 候选 {{ counts.candidate }} · 不再召回 {{ counts.idle }}</p>
  </section>
</template>

<style scoped>
.rack { display: flex; flex-direction: column; min-width: 0; padding: 16px 16px 12px; transition: border-color .14s; }
/* 选中的子块所在的机柜：外框亮一级。 */
.rack.current { border-color: var(--cyan-line); }
.rack-head { display: flex; align-items: baseline; gap: 10px; }
.rack-index { font-family: var(--font-num); font-size: 15px; font-weight: 500; letter-spacing: .04em; color: var(--cyan); }
.rack-head h2 { flex: 1; min-width: 0; margin: 0; font-size: 15px; font-weight: 600; letter-spacing: .04em; }
.rack-count { font-size: 12px; color: var(--text-3); }
.rack-summary { min-height: 3.4em; margin: 6px 0 12px; font-size: 12px; line-height: 1.7; color: var(--text-2); }

/* 机柜内部：一条条插槽，槽与槽之间只有发丝线。 */
.rack-bay { display: grid; grid-template-columns: minmax(0, 1fr); flex: 1; align-content: start; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--well); list-style: none; }
.rack-bay li + li { border-top: 1px solid var(--line); }
.slot {
  display: flex; align-items: center; gap: 9px; width: 100%; height: 36px; padding: 0 12px; border: 0; border-radius: 0;
  background: transparent; color: var(--text-2); font-size: 13px; text-align: left;
  transition: color .14s, background .14s, opacity .16s;
}
.slot:hover { background: rgba(160, 190, 202, .05); color: var(--text); }
.slot.on { background: var(--cyan-soft); color: var(--text); box-shadow: inset 2px 0 0 var(--cyan); }
.slot.dim { opacity: .28; }
/* 指示灯：只用颜色和空心、实心区分状态，不闪、不发光。 */
.led { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); }
.active .led { background: var(--green); }
.candidate .led { background: transparent; box-shadow: inset 0 0 0 1.5px var(--amber); }
.superseded .led { background: var(--violet); }
.disabled .led { background: transparent; box-shadow: inset 0 0 0 1.5px var(--red); }
.slot-id { flex: 0 0 auto; font-family: var(--font-mono); font-size: 11px; color: var(--text-3); }
.slot-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.superseded .slot-title, .expired .slot-title, .archived .slot-title, .disabled .slot-title { color: var(--text-3); }
.superseded .slot-title { text-decoration: line-through; text-decoration-color: rgba(160, 190, 202, .5); }
.slot-state { flex: 0 0 auto; font-size: 11px; color: var(--text-3); }
.candidate .slot-state { color: var(--amber); }
.rack-empty { padding: 14px 4px; font-size: 12px; text-align: center; color: var(--text-3); }
.rack-foot { margin: 10px 0 0; font-size: 11px; letter-spacing: .02em; color: var(--text-3); }
</style>
