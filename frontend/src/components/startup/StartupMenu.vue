<script setup lang="ts">
// 启动页的模块菜单：像游戏主菜单一样的一列入口，悬停或聚焦时镜头转向对应站点，点击直接进入该模块。
import { STARTUP_MODULES } from '@/startup/modules'
import type { StationId } from '@/startup/scene/stations'

defineProps<{
  /** 当前高亮的模块（来自菜单悬停、键盘聚焦或场景里的点选）。 */
  active: StationId | null
  disabled: boolean
}>()

const emit = defineEmits<{
  preview: [id: StationId | null]
  enter: [id: StationId]
}>()
</script>

<template>
  <nav class="startup-menu" aria-label="快速前往" @mouseleave="emit('preview', null)">
    <p class="menu-heading">快速前往</p>
    <ul>
      <li v-for="item in STARTUP_MODULES" :key="item.id">
        <button
          type="button"
          class="menu-item"
          :class="{ active: active === item.id }"
          :disabled="disabled"
          :aria-label="`${item.label}，位于${item.place}${item.planned ? '，界面预览，尚未接入数据' : ''}`"
          @mouseenter="emit('preview', item.id)"
          @focus="emit('preview', item.id)"
          @blur="emit('preview', null)"
          @click="emit('enter', item.id)"
        >
          <span class="menu-mark" aria-hidden="true">{{ item.mark }}</span>
          <span class="menu-label">{{ item.label }}</span>
          <span v-if="item.planned" class="menu-tag" aria-hidden="true">预览</span>
          <span class="menu-arrow" aria-hidden="true">→</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.startup-menu { width: 264px; max-width: 100%; pointer-events: auto; }
.menu-heading { margin: 6px 0 8px; font-size: 11px; letter-spacing: .2em; color: #8697a0; }
ul { margin: 0; padding: 0; list-style: none; }
.menu-item {
  position: relative; display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 10px 8px 14px;
  border: 0; border-left: 1px solid rgba(160, 190, 202, .26); background: transparent; color: #a9b7be;
  font-size: 14px; letter-spacing: .1em; text-align: left; white-space: nowrap; text-shadow: 0 1px 8px rgba(4, 8, 12, .95);
  transition: color .14s, background .14s, border-color .14s;
}
/* 悬停、聚焦或场景里点中的那一项：左边一道亮线，位置不动。 */
.menu-item:hover:not(:disabled), .menu-item:focus-visible, .menu-item.active {
  border-left-color: var(--cyan); color: #eef4f6;
  background: rgba(134, 212, 221, .1); box-shadow: inset 1px 0 0 var(--cyan);
}
.menu-mark { font-family: var(--font-num); font-size: 12px; letter-spacing: .06em; color: var(--cyan); }
.menu-label { flex: 1; }
.menu-tag { padding: 0 5px; border: 1px solid rgba(211, 171, 111, .46); border-radius: var(--radius); font-size: 10px; line-height: 16px; letter-spacing: .06em; color: var(--amber); }
.menu-arrow { color: var(--cyan); opacity: 0; transition: opacity .14s; }
.menu-item:hover:not(:disabled) .menu-arrow, .menu-item:focus-visible .menu-arrow, .menu-item.active .menu-arrow { opacity: 1; }
@media (max-width: 700px) {
  .startup-menu { width: 100%; }
  .menu-heading { display: none; }
  ul { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
  ul::-webkit-scrollbar { display: none; }
  .menu-item { flex: 0 0 auto; width: auto; padding: 7px 12px; border: 1px solid rgba(160, 190, 202, .3); border-radius: var(--radius); background: rgba(5, 9, 12, .7); font-size: 13px; letter-spacing: .06em; }
  .menu-item:hover:not(:disabled), .menu-item:focus-visible, .menu-item.active { border-color: var(--cyan); background: rgba(22, 46, 54, .86); box-shadow: none; }
  .menu-label { flex: 0 0 auto; }
  .menu-arrow { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .menu-item, .menu-arrow { transition: none; }
}
</style>
