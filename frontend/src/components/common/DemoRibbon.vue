<script setup lang="ts">
// 演示数据提示带：页面正在显示虚构联赛的数据时放在最上方，说明原因，并提供“只看真实状态”。
import { setDemo } from '@/stores/demo'

defineProps<{
  /** 为什么这一页没有真实数据，例如“后端还没有预测记录接口”。 */
  reason: string
}>()
</script>

<template>
  <aside class="demo-ribbon" aria-label="演示数据说明">
    <span class="ribbon-badge"><span class="ribbon-stripes" aria-hidden="true"></span>演示数据</span>
    <p>虚构的“沙盘联赛”，只用来预览界面，不是真实的 NBA 比赛、盘口或战绩。{{ reason }}</p>
    <button type="button" class="btn btn--sm btn--amber" @click="setDemo(false)">只看真实状态</button>
  </aside>
</template>

<style scoped>
/* 演示数据提示带：黄铜色加一条斜纹，和真实内容明确分开，但不抢页面主体。 */
.demo-ribbon { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; padding: 8px 10px 8px 0; border: 1px solid rgba(211, 171, 111, .26); border-radius: var(--radius); background: var(--amber-soft); overflow: hidden; }
.ribbon-badge { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; align-self: stretch; margin: -8px 0; padding: 0 4px 0 0; font-size: 12px; font-weight: 600; letter-spacing: .12em; color: var(--amber); white-space: nowrap; }
.ribbon-stripes { align-self: stretch; width: 16px; background: repeating-linear-gradient(-45deg, var(--amber) 0 3px, transparent 3px 7px); opacity: .75; }
p { flex: 1; min-width: 0; margin: 0; font-size: 13px; line-height: 1.6; color: #dcc9a6; }
@media (max-width: 700px) {
  .demo-ribbon { flex-wrap: wrap; gap: 8px 12px; padding: 0 10px 10px 0; }
  .ribbon-badge { margin: 0; height: 34px; }
  p { flex-basis: 100%; padding-left: 12px; font-size: 12px; }
  .btn { margin-left: 12px; }
}
</style>
