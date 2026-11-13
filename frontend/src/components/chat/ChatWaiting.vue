<script setup lang="ts">
// 等待回答时的占位：只显示真实的信息——已经等了多久、最长等多久。计时和进度条之外，没有别的动效。
import { computed } from 'vue'

const props = defineProps<{
  /** 已经等待的毫秒数。 */
  elapsedMs: number
  timeoutSeconds: number
}>()

const seconds = computed(() => Math.max(0, Math.floor(props.elapsedMs / 1000)))
const clock = computed(() => `${String(Math.floor(seconds.value / 60)).padStart(2, '0')}:${String(seconds.value % 60).padStart(2, '0')}`)
const progress = computed(() => Math.min(1, props.elapsedMs / (props.timeoutSeconds * 1000)))
</script>

<template>
  <article class="waiting" role="status" aria-live="off">
    <span class="waiting-elapsed" aria-hidden="true">{{ clock }}</span>
    <div class="waiting-text">
      <p class="waiting-title">已发送，正在等待模型的完整回答</p>
      <p class="waiting-note">最长等待 {{ timeoutSeconds }} 秒 · 本次请求不会自动重试</p>
      <div class="waiting-bar" aria-hidden="true"><i :style="{ transform: `scaleX(${progress})` }"></i></div>
    </div>
    <span class="sr-only">正在等待模型回答，最长 {{ timeoutSeconds }} 秒</span>
  </article>
</template>

<style scoped>
.waiting { display: flex; align-items: center; gap: 22px; margin-bottom: 26px; padding: 16px 22px 18px; border: 1px solid var(--line); border-left: 1px solid var(--cyan-line); border-radius: var(--radius-lg); background: linear-gradient(180deg, rgba(17, 25, 32, .86), rgba(11, 16, 21, .86)); animation: waiting-in .22s ease both; }
@keyframes waiting-in { from { opacity: 0; } to { opacity: 1; } }
/* 已等时间是这张卡片上唯一在走的东西。 */
.waiting-elapsed { flex: 0 0 auto; min-width: 86px; font-family: var(--font-num); font-size: 30px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: .03em; line-height: 1; color: #eaf7f9; }
.waiting-text { flex: 1; min-width: 0; padding-left: 22px; border-left: 1px solid var(--line-2); }
.waiting-title { margin: 0; font-size: 14px; letter-spacing: .04em; }
.waiting-note { margin: 4px 0 12px; font-size: 12px; color: var(--text-3); }
.waiting-bar { height: 2px; background: var(--line-2); overflow: hidden; }
.waiting-bar i { display: block; height: 100%; background: var(--cyan); transform-origin: left; transition: transform 1s linear; }
@media (max-width: 560px) {
  .waiting { gap: 14px; padding: 14px; }
  .waiting-elapsed { min-width: 70px; font-size: 24px; }
  .waiting-text { padding-left: 14px; }
}
</style>
