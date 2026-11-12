<script setup lang="ts">
// 站点卡片：镜头停靠到某个站点后，说明它对应哪个模块，并提供“从这里进入”和“返回”。
import type { StartupModule } from '@/startup/modules'

defineProps<{ module: StartupModule; disabled: boolean }>()
const emit = defineEmits<{ enter: []; back: [] }>()
</script>

<template>
  <section class="station-card" :aria-label="`${module.label}站点`">
    <p class="card-place">{{ module.mark }} · {{ module.place }}</p>
    <h2>{{ module.label }}<span v-if="module.planned" class="card-tag">界面预览</span></h2>
    <p class="card-summary">{{ module.summary }}</p>
    <p v-if="module.id === 'assistant'" class="card-note">再点一下战术桌，可以换一套战术演示。</p>
    <p v-else-if="module.planned" class="card-note">这个模块目前是界面预览，用虚构的演示数据展示，尚未连接业务数据。</p>
    <div class="card-actions">
      <button type="button" class="card-enter" :disabled="disabled" @click="emit('enter')">进入{{ module.label }} <span aria-hidden="true">→</span></button>
      <button type="button" class="card-back" :disabled="disabled" @click="emit('back')">返回</button>
    </div>
  </section>
</template>

<style scoped>
.station-card {
  width: 340px; max-width: 100%; padding: 20px 22px 18px; pointer-events: auto;
  border: 1px solid rgba(73, 221, 235, .45); border-radius: 4px; background: rgba(8, 19, 33, .84);
  box-shadow: 0 0 30px rgba(73, 221, 235, .16), inset 0 0 26px rgba(73, 221, 235, .07); backdrop-filter: blur(8px);
}
.card-place { margin: 0; font-size: 11px; letter-spacing: .3em; color: #49ddeb; }
h2 { display: flex; align-items: center; gap: 10px; margin: 8px 0 10px; font-size: 24px; font-weight: 600; letter-spacing: .12em; color: #edf5fa; }
.card-tag { padding: 2px 7px; border: 1px solid rgba(231, 170, 98, .55); border-radius: 2px; font-size: 11px; font-weight: 400; letter-spacing: .08em; color: #e7aa62; }
.card-summary { margin: 0; font-size: 13px; line-height: 1.8; color: #c9d6e2; }
.card-note { margin: 8px 0 0; font-size: 12px; line-height: 1.7; color: #8fa3b6; }
.card-actions { display: flex; gap: 10px; margin-top: 16px; }
.card-enter { flex: 1; padding: 10px 14px; border: 1.5px solid #49ddeb; border-radius: 3px; background: rgba(21, 62, 82, .7); color: #edf5fa; font-size: 14px; letter-spacing: .14em; transition: background .2s; }
.card-enter:hover:not(:disabled) { background: rgba(31, 96, 120, .9); }
.card-back { padding: 10px 16px; border: 1px solid rgba(167, 185, 202, .45); border-radius: 3px; background: transparent; color: #a7b9ca; font-size: 13px; letter-spacing: .14em; transition: color .2s, border-color .2s; }
.card-back:hover:not(:disabled) { border-color: #a7b9ca; color: #edf5fa; }
@media (prefers-reduced-motion: reduce) {
  .card-enter, .card-back { transition: none; }
}
</style>
