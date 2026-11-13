<script setup lang="ts">
// 聊天首页的装饰：一块斜放的全息战术板，上面是一套示意的挡拆——○ 是进攻，× 是防守，实线是跑位，虚线是传球。
// 呼应启动页里的战术桌。画面是静止的，只在出现时把跑位线画出来一次；纯装饰，不代表任何真实数据。

/** 进攻五人与防守五人在左半场的站位，坐标对应下面球场的画布（300 × 160）。 */
const OFFENSE: [number, number][] = [[114, 82], [86, 32], [86, 130], [66, 66], [34, 106]]
const DEFENSE: [number, number][] = [[102, 84], [74, 42], [76, 120], [56, 74], [28, 94]]
</script>

<template>
  <div class="holo" aria-hidden="true">
    <div class="holo-plane">
      <svg viewBox="0 0 300 160" fill="none">
        <g class="holo-court" stroke="currentColor" stroke-width="1">
          <rect x="2" y="2" width="296" height="156" rx="1" />
          <path d="M150 2v156" />
          <circle cx="150" cy="80" r="22" />
          <path d="M2 54h44v52H2M298 54h-44v52h44" />
          <path d="M46 62a18 18 0 0 1 0 36M254 62a18 18 0 0 0 0 36" />
          <path d="M2 18h30a70 70 0 0 1 0 124H2M298 18h-30a70 70 0 0 0 0 124h30" opacity=".55" />
          <circle cx="16" cy="80" r="4" /><circle cx="284" cy="80" r="4" />
        </g>
        <g class="holo-play" stroke-linecap="round" stroke-linejoin="round">
          <!-- 内线上提做掩护：线的尽头一小横。 -->
          <path class="holo-move" pathLength="1" d="M70 68L98 74M97 68l-2 12" />
          <!-- 持球人绕过掩护切入。 -->
          <path class="holo-move late" pathLength="1" d="M110 78C100 58 78 50 58 58M65 53l-7 5 8 3" />
          <!-- 分球到底角。 -->
          <path class="holo-pass" d="M58 62C64 92 74 112 84 126" />
        </g>
        <g class="holo-defense" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">
          <path v-for="([x, y], index) in DEFENSE" :key="index" :d="`M${x - 3.2} ${y - 3.2}l6.4 6.4M${x + 3.2} ${y - 3.2}l-6.4 6.4`" />
        </g>
        <g class="holo-offense" stroke="currentColor" stroke-width="1.2">
          <circle v-for="([x, y], index) in OFFENSE" :key="index" :cx="x" :cy="y" r="4.4" />
        </g>
        <circle class="holo-ball" cx="114" cy="82" r="1.7" />
      </svg>
    </div>
    <div class="holo-base"></div>
  </div>
</template>

<style scoped>
.holo { position: relative; width: 400px; height: 256px; perspective: 900px; pointer-events: none; }
/* 球场平面向后倾倒，再稍微转一点角度，像从战术桌斜上方看过去。 */
.holo-plane { position: absolute; left: 24px; top: 36px; width: 352px; height: 188px; transform: rotateX(58deg) rotateZ(-14deg); transform-style: preserve-3d; color: var(--cyan); }
.holo-plane svg { display: block; width: 100%; height: 100%; overflow: visible; background: var(--scan), linear-gradient(90deg, rgba(134, 212, 221, .09), rgba(134, 212, 221, .02) 55%, rgba(134, 212, 221, 0)); }
.holo-court { opacity: .62; }
.holo-play { stroke: #dff3f6; stroke-width: 1.3; }
/* 跑位线出现时画一次，之后不再动。 */
.holo-move { stroke-dasharray: 1; stroke-dashoffset: 1; animation: holo-draw .9s var(--ease-out) .3s forwards; }
.holo-move.late { animation-delay: .8s; animation-duration: 1.1s; }
.holo-pass { stroke: var(--amber); stroke-dasharray: 3 4; opacity: 0; animation: holo-show .5s ease 1.7s forwards; }
@keyframes holo-draw { to { stroke-dashoffset: 0; } }
@keyframes holo-show { to { opacity: .9; } }
.holo-defense { color: var(--amber); opacity: .8; }
.holo-offense { color: #dff3f6; }
.holo-offense circle { fill: rgba(8, 12, 16, .6); }
.holo-ball { fill: var(--amber); }
/* 桌面投上来的一片光。 */
.holo-base { position: absolute; left: 50%; bottom: 10px; width: 300px; height: 40px; border-radius: 50%; background: radial-gradient(closest-side, rgba(134, 212, 221, .2), transparent); transform: translateX(-50%); filter: blur(8px); }
</style>
