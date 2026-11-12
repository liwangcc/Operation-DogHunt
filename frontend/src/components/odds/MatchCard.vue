<script setup lang="ts">
// 比赛卡片：对阵、开赛时间与倒计时、所选平台的让分和大小分、各平台的盘口分布，以及“交给 AI 分析”。
import { ref, toRef } from 'vue'
import TeamMark from '@/components/common/TeamMark.vue'
import type { OddsEvent } from '@/types/odds'
import { clockTime, countdown } from './format'
import LineStrip from './LineStrip.vue'
import { marketOf } from './lines'
import MarketQuote from './MarketQuote.vue'
import MatchDrawer from './MatchDrawer.vue'
import { useMatch } from './useMatch'

const props = defineProps<{ event: OddsEvent; now: number }>()
const { selectedBook, bookmaker, started, away, home, spreads, totals, analyze } = useMatch(toRef(props, 'event'))
const drawerOpen = ref(false)
</script>

<template>
  <article class="match-card panel" :style="{ '--away': away[2], '--home': home[2] }">
    <header class="card-top">
      <time class="card-time" :datetime="event.commence_time">{{ clockTime(event.commence_time) }}</time>
      <span v-if="started" class="tag tag--warn">已到开赛时间</span>
      <span v-else class="tag tag--info"><span class="tag-key">距开赛</span><span class="num">{{ countdown(event.commence_time, now) }}</span></span>
    </header>

    <div class="face-off">
      <div class="side">
        <TeamMark :name="event.away_team" />
        <div class="side-text"><strong>{{ away[0] }}</strong><small>客 · {{ event.away_team }}</small></div>
      </div>
      <span class="versus" aria-hidden="true">VS</span>
      <div class="side home">
        <div class="side-text"><strong>{{ home[0] }}</strong><small>{{ event.home_team }} · 主</small></div>
        <TeamMark :name="event.home_team" />
      </div>
    </div>

    <p v-if="started" class="pregame-note">以下是赛前记录，当前比赛状态与比分未接入。</p>

    <div class="markets">
      <div class="market">
        <MarketQuote :market="marketOf(bookmaker, 'spreads')" kind="spreads" :away="event.away_team" :home="event.home_team" :now="now" />
        <LineStrip :spread="spreads" kind="spreads" :selected="bookmaker?.key" />
      </div>
      <div class="market">
        <MarketQuote :market="marketOf(bookmaker, 'totals')" kind="totals" :away="event.away_team" :home="event.home_team" :now="now" />
        <LineStrip :spread="totals" kind="totals" :selected="bookmaker?.key" />
      </div>
    </div>

    <footer class="card-foot">
      <div class="book-field">
        <label :for="`book-${event.id}`">报价平台</label>
        <select v-if="event.bookmakers.length" :id="`book-${event.id}`" class="select" :value="bookmaker?.key" :aria-label="`${away[0]}对${home[0]}报价平台`" @change="selectedBook = ($event.target as HTMLSelectElement).value">
          <option v-for="book in event.bookmakers" :key="book.key" :value="book.key">{{ book.title }}</option>
        </select>
        <span v-else class="text-3">暂无平台报价</span>
      </div>
      <button type="button" class="btn btn--sm" :disabled="!event.bookmakers.length" @click="drawerOpen = true">全部报价<span class="num text-3">{{ event.bookmakers.length }}</span></button>
      <button type="button" class="btn btn--sm btn--primary" :disabled="!bookmaker" @click="analyze">交给 AI 分析 <span aria-hidden="true">↗</span></button>
    </footer>

    <MatchDrawer v-model:open="drawerOpen" :event="event" :selected="bookmaker?.key" :started="started" @select="selectedBook = $event" @analyze="analyze" />
  </article>
</template>

<style scoped>
.match-card { container-type: inline-size; min-width: 0; padding: 18px 20px 16px; overflow: hidden; transition: border-color .2s, box-shadow .2s, transform .2s; }
/* 卡片顶上一条细线：左边是客队队色，右边是主队队色。 */
.match-card::before { content: ''; position: absolute; inset: 0 0 auto; height: 2px; background: linear-gradient(90deg, var(--away), transparent 42%, transparent 58%, var(--home)); opacity: .9; }
.match-card:hover { border-color: var(--line-3); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .05), 0 14px 40px rgba(2, 6, 12, .45); transform: translateY(-2px); }

.card-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.card-time { font-size: 24px; font-style: italic; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: .01em; line-height: 1; }
.tag-key { letter-spacing: .14em; opacity: .85; }

.face-off { display: flex; align-items: center; gap: 12px; padding: 18px 0 16px; }
.side { display: flex; flex: 1 1 0; align-items: center; gap: 12px; min-width: 0; }
.side.home { justify-content: flex-end; text-align: right; }
.side-text { min-width: 0; }
.side-text strong { display: block; overflow: hidden; font-size: 18px; font-weight: 600; letter-spacing: .06em; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.side-text small { display: block; overflow: hidden; font-size: 11px; letter-spacing: .04em; color: var(--text-3); text-overflow: ellipsis; white-space: nowrap; }
.versus { flex: 0 0 auto; font-size: 11px; font-style: italic; font-weight: 800; letter-spacing: .14em; color: var(--text-3); }
.pregame-note { margin: -6px 0 12px; font-size: 12px; color: var(--amber); }

.markets { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.market { display: grid; gap: 8px; align-content: start; min-width: 0; }

.card-foot { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); }
.book-field { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; font-size: 12px; color: var(--text-3); }
.book-field label { white-space: nowrap; letter-spacing: .1em; }
.book-field .select { flex: 0 1 190px; min-width: 0; height: 30px; }
.card-foot .btn .num { margin-left: 2px; font-size: 11px; }

@container (max-width: 470px) {
  .markets { grid-template-columns: 1fr; gap: 16px; }
  .card-foot { flex-wrap: wrap; }
  .book-field { flex-basis: 100%; }
  .card-foot .btn { flex: 1; }
  .side-text small { display: none; }
}
</style>
