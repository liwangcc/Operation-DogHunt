<script setup lang="ts">
// “下一场开赛”：把最近一场还没到开赛时间的比赛放大展示——两队对阵、倒计时，以及各平台的盘口分布。
import { computed, ref, toRef } from 'vue'
import TeamMark from '@/components/common/TeamMark.vue'
import type { OddsEvent } from '@/types/odds'
import { beijingDay, clockTime, countdown, signed } from './format'
import LineStrip from './LineStrip.vue'
import MatchDrawer from './MatchDrawer.vue'
import { useMatch } from './useMatch'

const props = defineProps<{ event: OddsEvent; now: number }>()
const { selectedBook, bookmaker, started, away, home, spreads, totals, analyze } = useMatch(toRef(props, 'event'))
const drawerOpen = ref(false)

const when = computed(() => {
  const day = beijingDay(props.event.commence_time)
  const label = day === beijingDay(new Date(props.now)) ? '今天' : day === beijingDay(new Date(props.now + 86400000)) ? '明天' : day.slice(5).replace('-', ' / ')
  return `${label} ${clockTime(props.event.commence_time)}`
})
/** 用一句话读出分布：几家平台，多数开在哪个数值。 */
function digest(kind: 'spreads' | 'totals'): string {
  const spread = kind === 'spreads' ? spreads.value : totals.value
  if (!spread.mode) return '暂无平台报价'
  const point = kind === 'spreads' ? `${home.value[0]} ${signed(spread.mode.point)}` : String(spread.mode.point)
  if (spread.columns.length === 1) return `${spread.count} 家平台一致：${point}`
  // 每家都不一样时没有“多数”，只说范围。
  if (spread.mode.books.length === 1) return `${spread.count} 家平台各不相同`
  return `${spread.count} 家平台，${spread.mode.books.length} 家开在 ${point}`
}
</script>

<template>
  <section class="next-tip panel panel--ticks" :style="{ '--away': away[2], '--home': home[2] }" aria-label="下一场开赛">
    <div class="tip-stage">
      <div class="tip-side">
        <TeamMark :name="event.away_team" size="lg" />
        <div class="tip-name"><strong>{{ away[0] }}</strong><small>客场 · {{ event.away_team }}</small></div>
      </div>
      <div class="tip-centre">
        <span class="label">下一场开赛</span>
        <strong class="tip-clock" role="timer" :aria-label="`距开赛 ${countdown(event.commence_time, now)}`">{{ countdown(event.commence_time, now) || '00:00:00' }}</strong>
        <time class="tip-when" :datetime="event.commence_time">{{ when }} · 北京时间</time>
      </div>
      <div class="tip-side home">
        <div class="tip-name"><strong>{{ home[0] }}</strong><small>{{ event.home_team }} · 主场</small></div>
        <TeamMark :name="event.home_team" size="lg" />
      </div>
    </div>

    <div class="tip-foot">
      <div class="tip-line">
        <p class="label">让分 · 主队盘口</p>
        <LineStrip :spread="spreads" kind="spreads" :selected="bookmaker?.key" />
        <p class="tip-digest">{{ digest('spreads') }}</p>
      </div>
      <div class="tip-line">
        <p class="label">大小分 · 总分线</p>
        <LineStrip :spread="totals" kind="totals" :selected="bookmaker?.key" />
        <p class="tip-digest">{{ digest('totals') }}</p>
      </div>
      <div class="tip-actions">
        <button type="button" class="btn" :disabled="!event.bookmakers.length" @click="drawerOpen = true">全部报价</button>
        <button type="button" class="btn btn--solid" :disabled="!bookmaker" @click="analyze">交给 AI 分析 <span aria-hidden="true">↗</span></button>
        <p class="tip-book">{{ bookmaker ? `按 ${bookmaker.title} 的报价带入聊天` : '暂无平台报价' }}</p>
      </div>
    </div>

    <MatchDrawer v-model:open="drawerOpen" :event="event" :selected="bookmaker?.key" :started="started" @select="selectedBook = $event" @analyze="analyze" />
  </section>
</template>

<style scoped>
.next-tip { margin-bottom: 26px; overflow: hidden; }
/* 这一页的主投影：静止的扫描纹，底边一道发光的线和从那里打上来的一片光，两队队色只在左右边缘留一点。 */
.tip-stage {
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 24px; padding: 40px 40px 36px; overflow: hidden;
  background:
    linear-gradient(90deg, transparent 12%, rgba(134, 212, 221, .42) 50%, transparent 88%) bottom / 100% 1px no-repeat,
    var(--scan),
    radial-gradient(ellipse 46% 96% at 50% 122%, rgba(134, 212, 221, .18), transparent 72%),
    linear-gradient(90deg, color-mix(in srgb, var(--away) 12%, transparent) 0, transparent 32%),
    linear-gradient(270deg, color-mix(in srgb, var(--home) 12%, transparent) 0, transparent 32%);
}
/* 中线与中圈：开赛从这里跳球。 */
.tip-stage::before { content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 1px; background: linear-gradient(180deg, transparent, rgba(134, 212, 221, .14) 30%, rgba(134, 212, 221, .14) 70%, transparent); }
.tip-stage::after { content: ''; position: absolute; top: 50%; left: 50%; width: 236px; height: 236px; border: 1px solid rgba(134, 212, 221, .12); border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; }

.tip-side { position: relative; z-index: 1; display: flex; align-items: center; gap: 18px; min-width: 0; }
.tip-side.home { justify-content: flex-end; text-align: right; }
.tip-name { min-width: 0; }
.tip-name strong { display: block; overflow: hidden; font-size: clamp(24px, 2.5vw, 34px); font-weight: 600; letter-spacing: .06em; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.tip-name small { display: block; margin-top: 5px; overflow: hidden; font-size: 12px; letter-spacing: .04em; color: var(--text-3); text-overflow: ellipsis; white-space: nowrap; }

.tip-centre { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 6px 18px; background: radial-gradient(closest-side, rgba(11, 16, 21, .92) 55%, transparent); text-align: center; }
.tip-clock { font-family: var(--font-num); font-size: clamp(34px, 4vw, 54px); font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: .03em; line-height: 1.05; color: #eaf7f9; text-shadow: var(--bloom); white-space: nowrap; }
.tip-when { font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: .06em; color: var(--text-2); }

.tip-foot { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 22px; align-items: start; padding: 18px 24px 20px; border-top: 1px solid var(--line); background: rgba(5, 8, 11, .4); }
.tip-line .label { margin: 0 0 8px; }
.tip-digest { margin: 7px 0 0; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--text-2); }
.tip-actions { display: grid; grid-template-columns: auto auto; gap: 8px; align-content: start; padding-top: 26px; }
.tip-book { grid-column: 1 / -1; margin: 0; font-size: 11px; text-align: right; color: var(--text-3); }

@media (max-width: 1100px) {
  .tip-foot { grid-template-columns: 1fr 1fr; }
  /* 按钮保持自身宽度，不拉成通栏的亮条。 */
  .tip-actions { grid-column: 1 / -1; grid-template-columns: auto auto; justify-content: start; padding-top: 0; }
  .tip-book { text-align: left; }
}
@media (max-width: 700px) {
  .tip-stage { grid-template-columns: 1fr 1fr; gap: 18px 12px; padding: 24px 18px; }
  .tip-stage::before, .tip-stage::after { display: none; }
  .tip-centre { grid-column: 1 / -1; grid-row: 1; background: none; }
  .tip-side { flex-direction: column; align-items: flex-start; gap: 10px; }
  .tip-side.home { flex-direction: column-reverse; align-items: flex-end; }
  .tip-name small { display: none; }
  .tip-foot { grid-template-columns: 1fr; gap: 16px; padding: 16px 18px 18px; }
  .tip-actions { grid-template-columns: 1fr 1fr; justify-content: stretch; }
}
</style>
