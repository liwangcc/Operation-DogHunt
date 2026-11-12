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
      <span class="tip-ghost away" aria-hidden="true">{{ away[1] }}</span>
      <span class="tip-ghost home" aria-hidden="true">{{ home[1] }}</span>

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
        <button type="button" class="btn btn--primary" :disabled="!bookmaker" @click="analyze">交给 AI 分析 <span aria-hidden="true">↗</span></button>
        <p class="tip-book">{{ bookmaker ? `按 ${bookmaker.title} 的报价带入聊天` : '暂无平台报价' }}</p>
      </div>
    </div>

    <MatchDrawer v-model:open="drawerOpen" :event="event" :selected="bookmaker?.key" :started="started" @select="selectedBook = $event" @analyze="analyze" />
  </section>
</template>

<style scoped>
.next-tip { margin-bottom: 26px; overflow: hidden; }
/* 两队的队色从左右两侧斜着照进来，中间留给倒计时。 */
.tip-stage {
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 24px; padding: 34px 36px 30px; overflow: hidden;
  background:
    linear-gradient(105deg, color-mix(in srgb, var(--away) 34%, transparent) 0, color-mix(in srgb, var(--away) 9%, transparent) 26%, transparent 44%),
    linear-gradient(285deg, color-mix(in srgb, var(--home) 34%, transparent) 0, color-mix(in srgb, var(--home) 9%, transparent) 26%, transparent 44%),
    repeating-linear-gradient(90deg, rgba(148, 180, 210, .035) 0 1px, transparent 1px 44px);
}
.tip-ghost { position: absolute; top: 50%; font-size: clamp(110px, 15vw, 200px); font-style: italic; font-weight: 800; letter-spacing: -.04em; line-height: 1; color: transparent; -webkit-text-stroke: 1px rgba(255, 255, 255, .09); transform: translateY(-50%); pointer-events: none; user-select: none; }
.tip-ghost.away { left: -18px; }
.tip-ghost.home { right: -8px; }

.tip-side { position: relative; display: flex; align-items: center; gap: 18px; min-width: 0; }
.tip-side.home { justify-content: flex-end; text-align: right; }
.tip-name { min-width: 0; }
.tip-name strong { display: block; overflow: hidden; font-size: clamp(26px, 2.8vw, 38px); font-weight: 700; letter-spacing: .08em; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.tip-name small { display: block; margin-top: 4px; overflow: hidden; font-size: 12px; letter-spacing: .08em; color: var(--text-2); text-overflow: ellipsis; white-space: nowrap; }

.tip-centre { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0 12px; text-align: center; }
.tip-clock { font-size: clamp(34px, 4.2vw, 56px); font-style: italic; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: .01em; line-height: 1.05; color: transparent; background: linear-gradient(180deg, #fff 20%, #a9ecf4 100%); -webkit-background-clip: text; background-clip: text; filter: drop-shadow(0 0 18px rgba(73, 221, 235, .35)); white-space: nowrap; }
.tip-when { font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: .1em; color: var(--text-2); }

.tip-foot { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 22px; align-items: start; padding: 18px 24px 20px; border-top: 1px solid var(--line); background: rgba(5, 11, 20, .4); }
.tip-line .label { margin: 0 0 8px; }
.tip-digest { margin: 7px 0 0; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--text-2); }
.tip-actions { display: grid; grid-template-columns: auto auto; gap: 8px; align-content: start; padding-top: 22px; }
.tip-book { grid-column: 1 / -1; margin: 0; font-size: 11px; text-align: right; color: var(--text-3); }

@media (max-width: 1100px) {
  .tip-foot { grid-template-columns: 1fr 1fr; }
  .tip-actions { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; padding-top: 0; }
  .tip-book { text-align: left; }
}
@media (max-width: 700px) {
  .tip-stage { grid-template-columns: 1fr 1fr; gap: 18px 12px; padding: 22px 18px; }
  .tip-centre { grid-column: 1 / -1; grid-row: 1; }
  .tip-side { flex-direction: column; align-items: flex-start; gap: 10px; }
  .tip-side.home { flex-direction: column-reverse; align-items: flex-end; }
  .tip-name small { display: none; }
  .tip-ghost { font-size: 96px; top: 66%; }
  .tip-foot { grid-template-columns: 1fr; gap: 16px; padding: 16px 18px 18px; }
}
</style>
