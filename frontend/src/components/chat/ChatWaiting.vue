<script setup lang="ts">
// 等待回答时的占位：只显示真实的信息——已经等了多久、最长等多久。小球场上的传球只是装饰，不代表任何处理阶段。
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
    <svg class="waiting-court" viewBox="0 0 120 76" width="120" height="76" fill="none" aria-hidden="true">
      <g stroke="rgba(73, 221, 235, .5)" stroke-width="1">
        <rect x="1" y="1" width="118" height="74" rx="2" />
        <path d="M42 75V46a18 18 0 0 1 36 0v29M48 75V52h24v23" />
        <path d="M10 75V40a50 50 0 0 1 100 0v35" opacity=".5" />
        <circle cx="60" cy="66" r="3" />
      </g>
      <circle class="player p1" cx="26" cy="34" r="3.2" />
      <circle class="player p2" cx="60" cy="18" r="3.2" />
      <circle class="player p3" cx="94" cy="34" r="3.2" />
      <circle class="ball" cx="0" cy="0" r="2.6" />
    </svg>
    <div class="waiting-text">
      <p class="waiting-title">已发送，正在等待模型的完整回答</p>
      <p class="waiting-clock"><span class="waiting-elapsed">{{ clock }}</span><span>最长等待 {{ timeoutSeconds }} 秒 · 本次请求不会自动重试</span></p>
      <div class="waiting-bar" aria-hidden="true"><i :style="{ transform: `scaleX(${progress})` }"></i></div>
    </div>
    <span class="sr-only">正在等待模型回答，最长 {{ timeoutSeconds }} 秒</span>
  </article>
</template>

<style scoped>
.waiting { display: flex; align-items: center; gap: 20px; margin-bottom: 26px; padding: 16px 20px; border: 1px solid var(--line); border-left: 2px solid var(--cyan); border-radius: var(--radius-lg); background: linear-gradient(180deg, rgba(15, 31, 52, .9), rgba(9, 21, 37, .93)); animation: waiting-in .4s var(--ease-out) both; }
@keyframes waiting-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.waiting-court { flex: 0 0 auto; }
.player { fill: var(--cyan); animation: breathe 1.8s ease-in-out infinite; }
.p2 { animation-delay: .3s; }
.p3 { animation-delay: .6s; }
@keyframes breathe { 50% { opacity: .45; } }
/* 球在三个人之间传一圈。 */
.ball { fill: var(--amber); filter: drop-shadow(0 0 4px rgba(231, 170, 98, .9)); animation: pass 2.7s cubic-bezier(.5, 0, .5, 1) infinite; }
@keyframes pass {
  0%, 12% { transform: translate(26px, 28px); }
  33%, 45% { transform: translate(60px, 12px); }
  66%, 78% { transform: translate(94px, 28px); }
  100% { transform: translate(26px, 28px); }
}
.waiting-text { flex: 1; min-width: 0; }
.waiting-title { margin: 0; font-size: 14px; letter-spacing: .06em; }
.waiting-clock { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin: 6px 0 10px; font-size: 12px; color: var(--text-3); }
.waiting-elapsed { font-size: 24px; font-style: italic; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; color: var(--text); }
.waiting-bar { height: 2px; background: var(--line-2); overflow: hidden; }
.waiting-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--cyan), var(--amber)); transform-origin: left; transition: transform 1s linear; }
@media (max-width: 560px) {
  .waiting-court { display: none; }
}
</style>
