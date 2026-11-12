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
      <span class="brand-top">OPERATION<i aria-hidden="true"></i></span>
      <span class="brand-main">DOGHUNT</span>
      <span class="brand-compact" aria-hidden="true">DH</span>
    </RouterLink>
    <p class="rail-heading">工位</p>
    <nav aria-label="主导航">
      <RouterLink
        v-for="(item, index) in STARTUP_MODULES"
        :key="item.id"
        :to="item.route"
        class="station"
        exact-active-class="active"
        :style="{ '--i': index }"
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
  position: sticky; top: 0; z-index: 30; display: flex; flex-direction: column; width: var(--rail-width); height: 100dvh; padding: 24px 14px 16px;
  border-right: 1px solid var(--line); background: linear-gradient(180deg, rgba(5, 11, 20, .9), rgba(5, 11, 20, .7));
}
.brand { display: block; padding: 2px 12px 0; line-height: 1; }
.brand-top { display: flex; align-items: center; gap: 9px; font-size: 12px; font-style: italic; font-weight: 300; letter-spacing: .14em; color: var(--text-2); }
.brand-top i { width: 16px; height: 5px; background: var(--cyan); transform: skewX(-38deg); }
.brand-main { display: block; margin-top: 5px; padding-right: .12em; font-size: 28px; font-style: italic; font-weight: 800; letter-spacing: -.01em; color: transparent; background: linear-gradient(180deg, #fff 10%, #b9c8f6 100%); -webkit-background-clip: text; background-clip: text; }
.brand-compact { display: none; font-size: 22px; font-style: italic; font-weight: 800; color: var(--text); }
.rail-heading { margin: 36px 14px 10px; font-size: 11px; letter-spacing: .32em; color: var(--text-3); }

.station {
  position: relative; display: flex; align-items: center; gap: 12px; margin-bottom: 2px; padding: 9px 10px 9px 14px;
  border-left: 2px solid rgba(148, 180, 210, .16); color: var(--text-2);
  transition: color .18s, background .18s, border-color .18s, padding-left .18s;
  animation: rail-in .5s var(--ease-out) both; animation-delay: calc(140ms + var(--i) * 45ms);
}
@keyframes rail-in { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
.station:hover { padding-left: 18px; border-left-color: var(--cyan-line); background: linear-gradient(90deg, rgba(73, 221, 235, .1), rgba(73, 221, 235, 0)); color: var(--text); }
.station.active { padding-left: 18px; border-left-color: var(--cyan); background: linear-gradient(90deg, rgba(73, 221, 235, .22), rgba(73, 221, 235, 0)); color: var(--text); }
.station .station-icon { flex: 0 0 auto; color: var(--text-3); transition: color .18s; }
.station:hover .station-icon { color: var(--text); }
.station.active .station-icon { color: var(--cyan); filter: drop-shadow(0 0 6px rgba(73, 221, 235, .55)); }
.station-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.35; }
.station-label { font-size: 14px; letter-spacing: .12em; white-space: nowrap; }
.station-place { font-size: 11px; letter-spacing: .16em; color: var(--text-3); }
.station-mark { margin-left: auto; font-size: 10px; letter-spacing: .1em; font-variant-numeric: tabular-nums; color: var(--text-3); }
.station.active .station-mark { color: var(--cyan); }
.station-tag { margin-left: auto; padding: 1px 6px; border: 1px solid var(--amber-line); border-radius: 2px; font-size: 10px; letter-spacing: .08em; color: var(--amber); }

.rail-foot { display: grid; gap: 6px; margin-top: auto; padding-top: 20px; }
.rail-action {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; height: 36px; padding: 0 12px;
  border: 1px solid var(--line); border-radius: var(--radius); background: rgba(8, 19, 33, .5); color: var(--text-2); font-size: 12px; letter-spacing: .14em;
  transition: color .18s, border-color .18s, background .18s;
}
.rail-action:hover { border-color: var(--cyan-line); background: rgba(21, 62, 82, .4); color: var(--text); }
.rail-keys { display: flex; gap: 3px; }
.rail-return-tag { font-size: 10px; font-style: italic; font-weight: 800; letter-spacing: .1em; color: var(--cyan); }

/* 中等宽度：只留图标。 */
@media (max-width: 1000px) {
  .rail { width: 72px; padding: 20px 10px 14px; align-items: stretch; }
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
  .rail { position: fixed; inset: auto 0 0 0; z-index: 40; flex-direction: row; width: auto; height: auto; padding: 4px 4px calc(4px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--line-2); border-right: 0; background: rgba(5, 11, 20, .95); }
  .brand, .rail-foot { display: none; }
  nav { display: flex; flex: 1; margin: 0; }
  .station, .station:hover, .station.active { flex: 1; flex-direction: column; gap: 3px; min-width: 0; margin: 0; padding: 7px 0 5px; border-top: 2px solid transparent; border-left: 0; background: none; animation: none; }
  .station.active { border-top-color: var(--cyan); background: linear-gradient(180deg, rgba(73, 221, 235, .16), rgba(73, 221, 235, 0)); }
  .station-text { display: flex; }
  .station-label { font-size: 11px; letter-spacing: 0; }
  .station-place { display: none; }
}
</style>
