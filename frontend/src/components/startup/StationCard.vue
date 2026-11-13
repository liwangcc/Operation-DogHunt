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
/* 站点说明卡：一块压在场景上的深色面，发丝线描边，不发光。 */
.station-card {
  width: 340px; max-width: 100%; padding: 20px 22px 18px; pointer-events: auto;
  border: 1px solid rgba(134, 212, 221, .4); border-radius: var(--radius-lg); background: rgba(6, 10, 14, .86);
  box-shadow: 0 18px 44px rgba(0, 0, 0, .45), inset 0 1px 0 rgba(200, 232, 238, .06); backdrop-filter: blur(6px);
}
.card-place { margin: 0; font-size: 12px; letter-spacing: .16em; color: var(--cyan); }
h2 { display: flex; align-items: center; gap: 10px; margin: 8px 0 10px; font-size: 22px; font-weight: 600; letter-spacing: .08em; color: #eef4f6; }
.card-tag { padding: 1px 6px; border: 1px solid rgba(211, 171, 111, .46); border-radius: var(--radius); font-size: 11px; font-weight: 400; letter-spacing: .06em; color: var(--amber); }
.card-summary { margin: 0; font-size: 13px; line-height: 1.8; color: #c5d2d8; }
.card-note { margin: 8px 0 0; font-size: 12px; line-height: 1.7; color: #8d9da5; }
.card-actions { display: flex; gap: 8px; margin-top: 16px; }
.card-enter { flex: 1; height: 38px; padding: 0 14px; border: 1px solid var(--cyan-line); border-radius: var(--radius); background: rgba(134, 212, 221, .12); color: #eef6f8; font-size: 13px; letter-spacing: .1em; transition: background .16s, border-color .16s; }
.card-enter:hover:not(:disabled) { border-color: var(--cyan); background: rgba(134, 212, 221, .2); }
.card-back { height: 38px; padding: 0 16px; border: 1px solid rgba(160, 190, 202, .36); border-radius: var(--radius); background: transparent; color: #a9b7be; font-size: 13px; letter-spacing: .1em; transition: color .16s, border-color .16s; }
.card-back:hover:not(:disabled) { border-color: rgba(160, 190, 202, .7); color: #eef4f6; }
@media (prefers-reduced-motion: reduce) {
  .card-enter, .card-back { transition: none; }
}
</style>
