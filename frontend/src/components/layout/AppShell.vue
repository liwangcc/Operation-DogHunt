<script setup lang="ts">
// 内页外壳：动态背景、侧边导航、顶部状态条和页面区域；负责在进入系统时做一轮只读的运行状态检查。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import CommandPalette from './CommandPalette.vue'
import ShellBackdrop from './ShellBackdrop.vue'
import StationRail from './StationRail.vue'
import StatusStrip from './StatusStrip.vue'
import { checkHealth, checkModel, health, loadBoard, startClock, stopClock } from '@/stores/system'

/** 回到这个标签页时，距上次检查超过这么久才重新检查后端连接。 */
const RECHECK_AFTER_MS = 60 * 1000

const paletteOpen = ref(false)

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    paletteOpen.value = !paletteOpen.value
  }
}

function onFocus(): void {
  if (Date.now() - health.checkedAt > RECHECK_AFTER_MS) void checkHealth()
}

onMounted(() => {
  startClock()
  // 三项都只读本机后端：连接检查、模型是否已配置、最新保存的盘口快照。不调用模型，也不向供应商取数。
  void checkHealth()
  void checkModel()
  void loadBoard()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('focus', onFocus)
})

onBeforeUnmount(() => {
  stopClock()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('focus', onFocus)
})
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="shell">
    <ShellBackdrop />
    <StationRail @palette="paletteOpen = true" />
    <div class="deck">
      <StatusStrip />
      <main id="main-content" tabindex="-1"><slot /></main>
    </div>
    <CommandPalette v-model:open="paletteOpen" />
  </div>
</template>

<style scoped>
.shell { position: relative; z-index: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); min-height: 100dvh; }
.deck { display: flex; flex-direction: column; min-width: 0; min-height: 100dvh; }
main { flex: 1; min-width: 0; outline: 0; }
@media (max-width: 700px) {
  .shell { display: block; }
  /* 给底部的标签栏留出位置。 */
  .deck { padding-bottom: calc(62px + env(safe-area-inset-bottom, 0px)); }
}
</style>
