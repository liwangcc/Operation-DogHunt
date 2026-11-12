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
.rack { display: flex; flex-direction: column; min-width: 0; padding: 16px 16px 12px; transition: border-color .2s, box-shadow .2s; }
.rack.current { border-color: var(--cyan-line); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .05), 0 0 30px rgba(73, 221, 235, .1); }
.rack-head { display: flex; align-items: baseline; gap: 10px; }
.rack-index { font-size: 18px; font-style: italic; font-weight: 800; color: var(--cyan); }
.rack-head h2 { flex: 1; min-width: 0; margin: 0; font-size: 15px; font-weight: 600; letter-spacing: .08em; }
.rack-count { font-size: 12px; color: var(--text-3); }
.rack-summary { min-height: 3.4em; margin: 6px 0 12px; font-size: 12px; line-height: 1.7; color: var(--text-2); }

/* 机柜内部：左右两条带安装孔的立柱，中间是一条条插槽。 */
.rack-bay {
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; flex: 1; align-content: start; margin: 0; padding: 8px 18px; border: 1px solid var(--line); border-radius: var(--radius); list-style: none;
  background:
    radial-gradient(circle, rgba(148, 180, 210, .34) 1.2px, transparent 1.6px) 4px 6px / 9px 14px repeat-y,
    radial-gradient(circle, rgba(148, 180, 210, .34) 1.2px, transparent 1.6px) calc(100% - 4px) 6px / 9px 14px repeat-y,
    var(--well);
}
.slot {
  display: flex; align-items: center; gap: 9px; width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 3px;
  background: linear-gradient(180deg, rgba(20, 44, 71, .7), rgba(12, 26, 45, .9)); color: var(--text-2); font-size: 13px; text-align: left;
  transition: color .16s, border-color .16s, background .16s, opacity .2s, transform .16s;
}
.slot:hover { border-color: var(--line-3); color: var(--text); transform: translateX(2px); }
.slot.on { border-color: var(--cyan); background: linear-gradient(90deg, rgba(73, 221, 235, .26), rgba(21, 62, 82, .5)); color: var(--text); }
.slot.dim { opacity: .28; }
.led { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); }
.active .led { background: var(--green); box-shadow: 0 0 7px rgba(94, 212, 162, .9); }
.candidate .led { background: var(--amber); box-shadow: 0 0 7px rgba(231, 170, 98, .9); animation: led-blink 1.8s ease-in-out infinite; }
.superseded .led { background: var(--violet); }
.disabled .led { background: transparent; border: 1.5px solid var(--red); }
@keyframes led-blink { 50% { opacity: .3; } }
.slot-id { flex: 0 0 auto; font-family: var(--font-mono); font-size: 11px; color: var(--text-3); }
.slot-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.superseded .slot-title, .expired .slot-title, .archived .slot-title, .disabled .slot-title { color: var(--text-3); }
.superseded .slot-title { text-decoration: line-through; text-decoration-color: rgba(148, 180, 210, .5); }
.slot-state { flex: 0 0 auto; font-size: 11px; color: var(--text-3); }
.candidate .slot-state { color: var(--amber); }
.rack-empty { padding: 14px 4px; font-size: 12px; text-align: center; color: var(--text-3); }
.rack-foot { margin: 10px 0 0; font-size: 11px; letter-spacing: .04em; color: var(--text-3); }
</style>
