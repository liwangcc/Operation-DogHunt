<script setup lang="ts">
// 内页背景：能用 WebGL 时画落雨的城市夜景，否则是一张静态的渐变底图；上面再压一层暗色，保证文字清楚。
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createBackdrop, type Backdrop } from '@/shell/backdrop'
import { preferences } from '@/stores/preferences'

const canvas = ref<HTMLCanvasElement | null>(null)
/** 画布是否在用；关闭动态背景或 WebGL 不可用时为 false。 */
const live = ref(false)
/** 每次重新打开换一块画布：丢失过显卡上下文的画布不能再用。 */
const attempt = ref(0)

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
let backdrop: Backdrop | null = null

function close(): void {
  backdrop?.dispose()
  backdrop = null
  live.value = false
}

async function open(): Promise<void> {
  close()
  if (preferences.backdrop !== 'on') return
  attempt.value += 1
  live.value = true
  await nextTick()
  if (!canvas.value) return
  try {
    backdrop = createBackdrop(canvas.value, { still: reducedMotion, onLost: close })
  } catch (error) {
    console.warn('[shell] 动态背景无法显示，改用静态底图', error)
    close()
  }
}

watch(() => preferences.backdrop, open)
onMounted(open)
onBeforeUnmount(close)
</script>

<template>
  <div class="backdrop" aria-hidden="true">
    <canvas v-if="live" :key="attempt" ref="canvas"></canvas>
    <div class="backdrop-shade"></div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none;
  /* 静态底图：暗室上方远处的一点窗光，和动态背景停下来时的样子一致。 */
  background:
    radial-gradient(ellipse 60% 16% at 58% 14%, rgba(70, 130, 145, .16), transparent 72%),
    radial-gradient(ellipse 80% 10% at 46% 24%, rgba(120, 90, 50, .08), transparent 70%),
    linear-gradient(#0a1015 0%, #080c10 40%, #06090c 100%);
}
canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; animation: backdrop-in 1.2s ease both; }
@keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }
/* 窗外的夜色只留在页面最上面一条；往下很快沉进底色，面板和文字后面是安静的。 */
.backdrop-shade {
  position: absolute; inset: 0;
  background:
    linear-gradient(90deg, rgba(8, 12, 16, .6) 0, rgba(8, 12, 16, 0) 30%),
    linear-gradient(180deg, rgba(8, 12, 16, .25) 0, rgba(8, 12, 16, .7) 26%, rgba(8, 12, 16, .94) 48%, var(--bg-1) 70%);
}
</style>
