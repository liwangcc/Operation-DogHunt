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
  /* 静态底图：与启动页加载时的底图同一套颜色。 */
  background:
    radial-gradient(ellipse 70% 22% at 60% 30%, rgba(40, 150, 175, .22), transparent 72%),
    radial-gradient(ellipse 90% 16% at 50% 46%, rgba(120, 70, 30, .16), transparent 70%),
    linear-gradient(#0a1b30 0%, #081526 46%, #050c17 100%);
}
canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; animation: backdrop-in 1.4s ease both; }
@keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }
/* 左侧导航和页面下半部分压得更暗；上方留着亮度，像控制台上方的一排窗。 */
.backdrop-shade {
  position: absolute; inset: 0;
  background:
    linear-gradient(90deg, rgba(5, 11, 20, .7) 0, rgba(5, 11, 20, .2) 24%, rgba(5, 11, 20, 0) 60%),
    linear-gradient(180deg, rgba(5, 11, 20, 0) 0, rgba(5, 11, 20, .25) 38%, rgba(5, 11, 20, .7) 100%);
}
</style>
