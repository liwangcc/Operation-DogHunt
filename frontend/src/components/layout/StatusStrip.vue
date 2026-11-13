<script setup lang="ts">
// 顶部状态条：当前所在的工位，以及一排真实的运行读数——盘口快照、模型配置、后端连接和北京时间。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { dateTime } from '@/components/odds/format'
import { STARTUP_MODULES } from '@/startup/modules'
import { boardIsDemo, demoEnabled, setDemo } from '@/stores/demo'
import { board, boardStale, checkHealth, health, model, now } from '@/stores/system'

const route = useRoute()

const current = computed(() => STARTUP_MODULES.find((item) => item.route === route.path) ?? null)
/** 当前页面是否正在显示演示数据。 */
const showingDemo = computed(() => {
  if (route.name === 'matches') return boardIsDemo.value
  return ['records', 'statistics', 'memory'].includes(String(route.name)) && demoEnabled.value
})
const clock = computed(() => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now.value))

const snapshot = computed(() => {
  if (board.loading && !board.data) return { tone: 'wait', text: '读取中' }
  const fetched = board.data?.fetched_at
  if (!fetched) return { tone: 'off', text: '尚无数据' }
  return { tone: boardStale.value ? 'warn' : 'ok', text: `${dateTime(fetched)}${boardStale.value ? ' · 待更新' : ''}` }
})
const modelChip = computed(() => {
  if (model.checking && !model.status) return { tone: 'wait', text: '读取中' }
  if (model.status?.configured) return { tone: 'ok', text: model.status.model ?? '已配置' }
  return { tone: 'off', text: model.error ? '状态未知' : '未配置' }
})
const healthChip = computed(() => {
  if (health.status === 'online') return { tone: 'ok', text: '后端已连接' }
  if (health.status === 'checking') return { tone: 'wait', text: '连接检查中' }
  return { tone: 'bad', text: '后端未连接' }
})
</script>

<template>
  <header class="strip">
    <div class="strip-left">
      <RouterLink to="/" class="strip-brand" aria-label="DogHunt 首页">DOGHUNT</RouterLink>
      <ol class="crumbs" aria-label="当前位置">
        <li>指挥室</li>
        <li>{{ current?.place ?? '未知位置' }}</li>
        <li aria-current="page">{{ current?.label ?? '页面不存在' }}</li>
      </ol>
    </div>
    <div class="strip-right">
      <button v-if="showingDemo" type="button" class="chip chip--demo" title="当前页面显示的是虚构的演示数据，点击只看真实状态" @click="setDemo(false)">
        <span class="chip-stripes" aria-hidden="true"></span>演示数据
      </button>
      <RouterLink to="/matches" class="chip chip--snapshot" :title="board.data?.fetched_at ? '最新保存的盘口快照的采集时间（北京时间）' : '后端还没有保存的盘口快照'">
        <i class="dot" :class="`tone-${snapshot.tone}`" aria-hidden="true"></i><span class="chip-key">快照</span><b>{{ snapshot.text }}</b>
      </RouterLink>
      <RouterLink to="/settings" class="chip chip--model" title="只表示模型是否已配置，不是在线探测">
        <i class="dot" :class="`tone-${modelChip.tone}`" aria-hidden="true"></i><span class="chip-key">模型</span><b>{{ modelChip.text }}</b>
      </RouterLink>
      <button type="button" class="chip chip--health" :disabled="health.status === 'checking'" :title="`${health.message}。点击重新检查`" @click="checkHealth">
        <i class="dot" :class="[`tone-${healthChip.tone}`, { 'dot--live': health.status === 'online' }]" aria-hidden="true"></i>
        <span role="status">{{ healthChip.text }}</span>
        <span v-if="health.info" class="chip-version">v{{ health.info.version }}</span>
      </button>
      <div class="clock" :title="`北京时间 ${clock}`">
        <span class="clock-label">北京时间</span>
        <time class="clock-time">{{ clock }}</time>
      </div>
    </div>
  </header>
</template>

<style scoped>
/* 状态条：一行平铺的读数，用竖向发丝线隔开，像仪表台上的一排表头。 */
.strip {
  position: sticky; top: 0; z-index: 20; display: flex; align-items: stretch; justify-content: space-between; gap: 16px; height: var(--strip-height); padding: 0 0 0 40px;
  border-bottom: 1px solid var(--line); background: rgba(5, 8, 11, .92);
}
.strip-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.strip-brand { display: none; font-family: var(--font-num); font-size: 15px; font-weight: 600; letter-spacing: .16em; }
.crumbs { display: flex; align-items: center; margin: 0; padding: 0; list-style: none; font-size: 12px; letter-spacing: .1em; color: var(--text-3); white-space: nowrap; }
.crumbs li + li::before { content: '/'; margin: 0 10px; color: var(--line-3); }
.crumbs li[aria-current] { color: var(--text); }

.strip-right { display: flex; align-items: stretch; min-width: 0; }
.chip {
  display: inline-flex; align-items: center; gap: 8px; padding: 0 16px; border: 0; border-left: 1px solid var(--line); border-radius: 0;
  background: transparent; color: var(--text-2); font-size: 12px; letter-spacing: .02em; white-space: nowrap;
  transition: color .14s, background .14s;
}
.chip:hover:not(:disabled) { background: rgba(160, 190, 202, .05); color: var(--text); }
.chip:focus-visible { outline-offset: -3px; }
.chip-key { color: var(--text-3); letter-spacing: .1em; }
.chip b { max-width: 180px; overflow: hidden; font-weight: 400; font-variant-numeric: tabular-nums; text-overflow: ellipsis; color: var(--text); }
.chip-version { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-3); }
.tone-ok { color: var(--green); }
.tone-warn { color: var(--amber); }
.tone-bad { color: var(--red); }
.tone-off { color: var(--text-3); }
/* 读取中：空心的点，不闪。 */
.tone-wait { color: var(--amber); background: transparent; box-shadow: inset 0 0 0 1.5px currentColor; }

/* 演示数据的提示：黄铜色加一小块斜纹，一眼能和真实读数分开。 */
.chip--demo { color: var(--amber); letter-spacing: .1em; }
.chip--demo:hover:not(:disabled) { background: var(--amber-soft); color: #ecd2a8; }
.chip-stripes { width: 12px; height: 9px; background: repeating-linear-gradient(-45deg, var(--amber) 0 2px, transparent 2px 5px); }

.clock { display: flex; align-items: center; gap: 12px; padding: 0 40px 0 18px; border-left: 1px solid var(--line); white-space: nowrap; }
.clock-label { font-size: 11px; letter-spacing: .14em; color: var(--text-3); }
.clock-time { font-family: var(--font-num); font-size: 17px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: .04em; color: var(--text); }

@media (max-width: 1280px) {
  .chip--model { display: none; }
}
@media (max-width: 1000px) {
  .strip { padding-left: 24px; }
  .clock { padding-right: 24px; }
  .crumbs li:first-child { display: none; }
  .crumbs li:first-child + li::before { display: none; }
  .chip--snapshot, .clock-label { display: none; }
}
@media (max-width: 700px) {
  .strip { padding-left: 16px; gap: 10px; }
  .strip-brand { display: block; }
  .crumbs { display: none; }
  .chip { padding: 0 12px; }
  .chip-version { display: none; }
  .clock { padding: 0 16px 0 12px; }
  .clock-time { font-size: 15px; }
}
@media (max-width: 420px) {
  .clock { display: none; }
  .chip:last-of-type { padding-right: 16px; }
}
</style>
