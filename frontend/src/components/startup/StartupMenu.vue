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
.menu-heading { margin: 4px 0 8px; font-size: 11px; letter-spacing: .32em; color: #7d93a8; }
ul { margin: 0; padding: 0; list-style: none; }
.menu-item {
  position: relative; display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 10px 8px 14px;
  border: 0; border-left: 2px solid rgba(167, 185, 202, .22); background: transparent; color: #a7b9ca;
  font-size: 15px; letter-spacing: .16em; text-align: left; white-space: nowrap; text-shadow: 0 1px 8px rgba(8, 19, 33, .95);
  transition: color .18s, background .18s, border-color .18s, padding-left .18s;
}
.menu-item:hover:not(:disabled), .menu-item:focus-visible, .menu-item.active {
  padding-left: 20px; border-left-color: #49ddeb; color: #edf5fa;
  background: linear-gradient(90deg, rgba(73, 221, 235, .2), rgba(73, 221, 235, 0));
}
.menu-mark { font-size: 10px; letter-spacing: .1em; color: #49ddeb; opacity: .85; }
.menu-label { flex: 1; }
.menu-tag { padding: 1px 6px; border: 1px solid rgba(231, 170, 98, .5); border-radius: 2px; font-size: 10px; letter-spacing: .08em; color: #e7aa62; }
.menu-arrow { opacity: 0; transform: translateX(-6px); transition: opacity .18s, transform .18s; }
.menu-item:hover:not(:disabled) .menu-arrow, .menu-item:focus-visible .menu-arrow, .menu-item.active .menu-arrow { opacity: 1; transform: none; }
@media (max-width: 700px) {
  .startup-menu { width: 100%; }
  .menu-heading { display: none; }
  ul { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
  ul::-webkit-scrollbar { display: none; }
  .menu-item { flex: 0 0 auto; width: auto; padding: 7px 12px; border: 1px solid rgba(167, 185, 202, .3); border-radius: 3px; background: rgba(8, 19, 33, .66); font-size: 13px; letter-spacing: .08em; }
  .menu-item:hover:not(:disabled), .menu-item:focus-visible, .menu-item.active { padding-left: 12px; border-color: #49ddeb; background: rgba(21, 62, 82, .8); }
  .menu-label { flex: 0 0 auto; }
  .menu-arrow { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .menu-item, .menu-arrow { transition: none; }
}
</style>
