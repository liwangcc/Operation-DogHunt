<script setup lang="ts">
// 地址不存在时的页面：说明情况，并列出六个工位供选择。
import StationIcon from '@/components/common/StationIcon.vue'
import { STARTUP_MODULES } from '@/startup/modules'
</script>

<template>
  <section class="page lost" aria-labelledby="lost-heading">
    <p class="lost-code" aria-hidden="true">404</p>
    <p class="overline">未知位置</p>
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
/* 背后一个很淡的编号，像图纸角上的页码。 */
.lost-code { position: absolute; top: 5vh; right: 28px; margin: 0; font-family: var(--font-num); font-size: clamp(110px, 18vw, 220px); font-weight: 300; letter-spacing: .04em; line-height: 1; color: rgba(160, 190, 202, .07); pointer-events: none; user-select: none; }
.lost .overline, .lost .page-title, .lost .page-sub { position: relative; }
.lost-grid { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 30px 0 26px; }
.lost-item { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: var(--radius); background: rgba(13, 19, 25, .72); color: var(--text-2); transition: color .14s, border-color .14s, background .14s; }
.lost-item:hover { border-color: var(--line-3); background: rgba(21, 31, 39, .82); color: var(--text); }
.lost-item:hover .station-icon { color: var(--cyan); }
.lost-item strong { display: block; font-size: 14px; font-weight: 600; letter-spacing: .04em; }
.lost-item small { font-size: 11px; letter-spacing: .1em; color: var(--text-3); }
.lost-arrow { margin-left: auto; color: var(--text-3); transition: color .14s; }
.lost-item:hover .lost-arrow { color: var(--cyan); }
@media (max-width: 700px) {
  .lost-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
