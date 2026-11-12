<script setup lang="ts">
// 聊天首页的装饰：一块斜放的全息球场，十个光点缓缓跑位，呼应启动页里的战术桌。纯装饰，不代表任何真实数据。

/** 每个光点的起始位置（百分比）、来回移动的幅度（像素）和一趟的时长（秒）。前五个一队，后五个另一队。 */
const PLAYERS = [
  { x: 24, y: 50, dx: 26, dy: -8, t: 5.2 }, { x: 34, y: 24, dx: 14, dy: 18, t: 6.4 }, { x: 36, y: 76, dx: 18, dy: -20, t: 5.8 },
  { x: 14, y: 34, dx: 22, dy: 10, t: 7.0 }, { x: 15, y: 68, dx: 16, dy: -12, t: 6.1 },
  { x: 30, y: 44, dx: 22, dy: -6, t: 5.5 }, { x: 40, y: 30, dx: 10, dy: 14, t: 6.7 }, { x: 42, y: 70, dx: 14, dy: -16, t: 6.0 },
  { x: 20, y: 40, dx: 18, dy: 8, t: 7.3 }, { x: 21, y: 62, dx: 12, dy: -10, t: 6.3 },
]
</script>

<template>
  <div class="holo" aria-hidden="true">
    <div class="holo-plane">
      <svg viewBox="0 0 300 160" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="2" y="2" width="296" height="156" rx="2" />
        <path d="M150 2v156" />
        <circle cx="150" cy="80" r="22" />
        <path d="M2 54h44v52H2M298 54h-44v52h44" />
        <path d="M46 62a18 18 0 0 1 0 36M254 62a18 18 0 0 0 0 36" />
        <path d="M2 18h30a70 70 0 0 1 0 124H2M298 18h-30a70 70 0 0 0 0 124h30" opacity=".6" />
        <circle cx="16" cy="80" r="4" /><circle cx="284" cy="80" r="4" />
      </svg>
      <i v-for="(player, index) in PLAYERS" :key="index" class="holo-player" :class="index < 5 ? 'home' : 'away'" :style="{ left: `${player.x}%`, top: `${player.y}%`, '--dx': `${player.dx}px`, '--dy': `${player.dy}px`, '--t': `${player.t}s` }"></i>
      <i class="holo-ball"></i>
    </div>
    <div class="holo-base"></div>
  </div>
</template>

<style scoped>
.holo { position: relative; width: 380px; height: 250px; perspective: 900px; pointer-events: none; }
/* 球场平面向后倾倒，再稍微转一点角度，像从战术桌斜上方看过去。 */
.holo-plane { position: absolute; left: 20px; top: 34px; width: 340px; height: 181px; transform: rotateX(58deg) rotateZ(-14deg); transform-style: preserve-3d; color: var(--cyan); filter: drop-shadow(0 0 6px rgba(73, 221, 235, .7)); animation: holo-float 7s ease-in-out infinite; }
@keyframes holo-float { 50% { transform: rotateX(58deg) rotateZ(-11deg) translateZ(8px); } }
.holo-plane svg { display: block; width: 100%; height: 100%; background: linear-gradient(90deg, rgba(73, 221, 235, .12), rgba(73, 221, 235, .03) 50%, rgba(231, 170, 98, .1)); }
.holo-player { position: absolute; width: 9px; height: 9px; margin: -4.5px; border-radius: 50%; animation: holo-run var(--t) ease-in-out infinite alternate; }
.holo-player.home { background: #9af1f8; box-shadow: 0 0 10px 2px rgba(73, 221, 235, .9); }
.holo-player.away { background: #f6d2a3; box-shadow: 0 0 10px 2px rgba(231, 170, 98, .9); }
@keyframes holo-run { to { transform: translate(var(--dx), var(--dy)); } }
.holo-ball { position: absolute; left: 0; top: 0; width: 6px; height: 6px; margin: -3px; border-radius: 50%; background: #fff; box-shadow: 0 0 10px 3px rgba(255, 255, 255, .8); animation: holo-ball 6.5s cubic-bezier(.5, 0, .5, 1) infinite; }
@keyframes holo-ball {
  0%, 10% { transform: translate(88px, 86px); }
  28%, 38% { transform: translate(124px, 50px); }
  56%, 64% { transform: translate(66px, 128px); }
  82%, 90% { transform: translate(20px, 90px); }
  100% { transform: translate(88px, 86px); }
}
/* 桌面投下的一圈光。 */
.holo-base { position: absolute; left: 50%; bottom: 14px; width: 300px; height: 46px; border-radius: 50%; background: radial-gradient(closest-side, rgba(73, 221, 235, .3), transparent); transform: translateX(-50%); filter: blur(6px); }
</style>
