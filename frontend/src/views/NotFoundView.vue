<script setup lang="ts">
// 地址不存在时的页面：说明情况，并列出六个工位供选择。
import StationIcon from '@/components/common/StationIcon.vue'
import { STARTUP_MODULES } from '@/startup/modules'
</script>

<template>
  <section class="page lost" aria-labelledby="lost-heading">
    <p class="lost-code" aria-hidden="true">404</p>
    <p class="overline">Signal Lost</p>
    <h1 id="lost-heading" class="page-title">这个页面不存在</h1>
    <p class="page-sub">指挥室里没有这个位置。选一个工位继续，或返回助手首页。</p>
    <nav class="lost-grid" aria-label="可以前往的工位">
      <RouterLink v-for="item in STARTUP_MODULES" :key="item.id" :to="item.route" class="lost-item">
        <StationIcon :id="item.id" />
        <span><strong>{{ item.label }}</strong><small>{{ item.place }}</small></span>
        <span class="lost-arrow" aria-hidden="true">→</span>
      </RouterLink>
    </nav>
    <RouterLink to="/" class="btn btn--primary btn--lg">返回 NBA 助手 <span aria-hidden="true">→</span></RouterLink>
  </section>
</template>

<style scoped>
.lost { position: relative; max-width: 860px; padding-top: 12vh; }
.lost-code { position: absolute; top: 4vh; right: 24px; margin: 0; font-size: clamp(120px, 22vw, 260px); font-style: italic; font-weight: 800; letter-spacing: -.04em; line-height: 1; color: transparent; -webkit-text-stroke: 1px rgba(148, 180, 210, .16); pointer-events: none; user-select: none; }
.lost .overline, .lost .page-title, .lost .page-sub { position: relative; }
.lost-grid { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 30px 0 26px; }
.lost-item { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--line); border-left: 2px solid rgba(148, 180, 210, .22); border-radius: var(--radius); background: rgba(11, 24, 41, .8); color: var(--text-2); transition: color .18s, border-color .18s, background .18s; }
.lost-item:hover { border-color: var(--line-2); border-left-color: var(--cyan); background: linear-gradient(90deg, rgba(73, 221, 235, .14), rgba(11, 24, 41, .8) 70%); color: var(--text); }
.lost-item strong { display: block; font-size: 14px; font-weight: 600; letter-spacing: .08em; }
.lost-item small { font-size: 11px; letter-spacing: .14em; color: var(--text-3); }
.lost-arrow { margin-left: auto; color: var(--cyan); opacity: 0; transition: opacity .18s; }
.lost-item:hover .lost-arrow { opacity: 1; }
@media (max-width: 700px) {
  .lost-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
