<script setup lang="ts">
// 侧边导航：六个工位的入口，样式与启动页的模块菜单一脉相承；窄屏时变成底部的一排标签。
import StationIcon from '@/components/common/StationIcon.vue'
import { STARTUP_MODULES } from '@/startup/modules'

const emit = defineEmits<{ palette: [] }>()
const mac = /Mac|iPhone|iPad/.test(navigator.platform)
</script>

<template>
  <aside class="rail">
    <RouterLink to="/" class="brand" aria-label="DogHunt 首页">
      <span class="brand-top">OPERATION</span>
      <span class="brand-main">DOGHUNT</span>
      <span class="brand-compact" aria-hidden="true">DH</span>
    </RouterLink>
    <p class="rail-heading">工位</p>
    <nav aria-label="主导航">
      <RouterLink
        v-for="item in STARTUP_MODULES"
        :key="item.id"
        :to="item.route"
        class="station"
        exact-active-class="active"
        :title="`${item.label} · ${item.place}`"
      >
        <StationIcon :id="item.id" />
        <span class="station-text">
          <span class="station-label">{{ item.label }}</span>
          <span class="station-place">{{ item.place }}</span>
        </span>
        <span v-if="item.planned" class="station-tag">预览</span>
        <span v-else class="station-mark" aria-hidden="true">{{ item.mark }}</span>
      </RouterLink>
    </nav>
    <div class="rail-foot">
      <button type="button" class="rail-action" @click="emit('palette')">
        <span>快速前往</span>
        <span class="rail-keys" aria-hidden="true"><kbd class="kbd">{{ mac ? '⌘' : 'Ctrl' }}</kbd><kbd class="kbd">K</kbd></span>
      </button>
      <RouterLink to="/welcome" class="rail-action rail-return">
        <span>返回指挥室</span>
        <span class="rail-return-tag" aria-hidden="true">3D</span>
      </RouterLink>
    </div>
  </aside>
</template>

<style scoped>
.rail {
  position: sticky; top: 0; z-index: 30; display: flex; flex-direction: column; width: var(--rail-width); height: 100dvh; padding: 22px 14px 16px;
  border-right: 1px solid var(--line); background: rgba(5, 8, 11, .9);
}
/* 行动代号：正体、拉开字距，像文件封面上的一行编号。 */
.brand { display: block; padding: 0 12px; line-height: 1; }
.brand-top { display: block; font-size: 10px; letter-spacing: .44em; color: var(--text-3); }
.brand-main { display: block; margin-top: 8px; font-family: var(--font-num); font-size: 21px; font-weight: 600; letter-spacing: .22em; color: var(--text); }
.brand-compact { display: none; font-family: var(--font-num); font-size: 18px; font-weight: 600; letter-spacing: .08em; color: var(--text); }
.rail-heading { margin: 34px 12px 10px; font-size: 11px; letter-spacing: .2em; color: var(--text-3); }

.station {
  position: relative; display: flex; align-items: center; gap: 12px; padding: 9px 10px 9px 13px;
  border-left: 1px solid var(--line-2); color: var(--text-2);
  transition: color .14s, background .14s, border-color .14s;
}
.station:hover { border-left-color: var(--line-3); background: rgba(160, 190, 202, .05); color: var(--text); }
/* 当前工位：左侧一道亮线，底上一层很淡的光。 */
.station.active { border-left-color: var(--cyan); background: var(--cyan-soft); color: var(--text); box-shadow: inset 1px 0 0 var(--cyan); }
.station .station-icon { flex: 0 0 auto; color: var(--text-3); transition: color .14s; }
.station:hover .station-icon { color: var(--text-2); }
.station.active .station-icon { color: var(--cyan); }
.station-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.4; }
.station-label { font-size: 14px; letter-spacing: .06em; white-space: nowrap; }
.station-place { font-size: 11px; letter-spacing: .1em; color: var(--text-3); }
.station-mark { margin-left: auto; font-family: var(--font-num); font-size: 12px; letter-spacing: .04em; font-variant-numeric: tabular-nums; color: var(--text-3); }
.station.active .station-mark { color: var(--cyan); }
.station-tag { margin-left: auto; padding: 0 5px; border: 1px solid var(--amber-line); border-radius: var(--radius); font-size: 10px; line-height: 16px; letter-spacing: .06em; color: var(--amber); }

.rail-foot { display: grid; gap: 6px; margin-top: auto; padding-top: 20px; }
.rail-action {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; height: 34px; padding: 0 12px;
  border: 1px solid var(--line); border-radius: var(--radius); background: transparent; color: var(--text-2); font-size: 12px; letter-spacing: .08em;
  transition: color .14s, border-color .14s, background .14s;
}
.rail-action:hover { border-color: var(--line-3); background: rgba(160, 190, 202, .05); color: var(--text); }
.rail-keys { display: flex; gap: 3px; }
.rail-return-tag { font-family: var(--font-num); font-size: 11px; font-weight: 500; letter-spacing: .1em; color: var(--text-3); }

/* 中等宽度：只留图标。 */
@media (max-width: 1000px) {
  .rail { width: 68px; padding: 20px 10px 14px; align-items: stretch; }
  .brand { padding: 0; text-align: center; }
  .brand-top, .brand-main, .rail-heading, .station-text, .station-mark, .station-tag, .rail-action span:first-child, .rail-keys { display: none; }
  .brand-compact { display: block; }
  nav { margin-top: 28px; }
  .station, .station:hover, .station.active { justify-content: center; padding: 12px 0; }
  .rail-action { justify-content: center; padding: 0; }
  .rail-action:first-child { display: none; }
}
/* 手机：固定在底部的一排标签。 */
@media (max-width: 700px) {
  .rail { position: fixed; inset: auto 0 0 0; z-index: 40; flex-direction: row; width: auto; height: auto; padding: 0 4px env(safe-area-inset-bottom, 0px); border-top: 1px solid var(--line-2); border-right: 0; background: rgba(5, 8, 11, .96); }
  .brand, .rail-foot { display: none; }
  nav { display: flex; flex: 1; margin: 0; }
  .station, .station:hover, .station.active { flex: 1; flex-direction: column; gap: 3px; min-width: 0; margin: 0; padding: 9px 0 7px; border-top: 1px solid transparent; border-left: 0; background: none; box-shadow: none; }
  .station.active { border-top-color: var(--cyan); background: var(--cyan-soft); }
  .station-text { display: flex; }
  .station-label { font-size: 11px; letter-spacing: 0; }
  .station-place { display: none; }
}
</style>
