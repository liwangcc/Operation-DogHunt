<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { oddsSelection } from '@/stores/oddsSelection'
import type { OddsEvent } from '@/types/odds'
import MarketQuote from './MarketQuote.vue'
import { dateTime, team } from './format'

const props = defineProps<{ event: OddsEvent; now: number }>()
const router = useRouter()
const selectedBook = ref('')
const bookmaker = computed(() => props.event.bookmakers.find(book => book.key === selectedBook.value) ?? props.event.bookmakers[0])
const started = computed(() => Date.parse(props.event.commence_time) <= props.now)

function analyze() {
  if (!bookmaker.value) return
  oddsSelection.value = {
    event_id: props.event.id,
    bookmaker_key: bookmaker.value.key,
    label: `${team(props.event.away_team)[0]} vs ${team(props.event.home_team)[0]} · ${dateTime(props.event.commence_time)} · ${bookmaker.value.title}`,
  }
  void router.push('/')
}
</script>

<template>
  <article class="match-card">
    <div class="match-top"><time :datetime="event.commence_time">{{ dateTime(event.commence_time) }}</time><span :class="{ started }">{{ started ? '已到开赛时间' : '赛前' }}</span></div>
    <div class="match-teams">
      <div v-for="(name, index) in [event.away_team, event.home_team]" :key="name" class="team-row">
        <span class="team-badge" :style="{ '--team-color': team(name)[2] }" aria-hidden="true">{{ team(name)[1] }}</span>
        <div><strong>{{ team(name)[0] }}</strong><small>{{ name }}</small></div>
        <span class="venue-label">{{ index === 0 ? '客' : '主' }}</span>
      </div>
    </div>
    <div class="bookmaker-row">
      <label :for="`book-${event.id}`">报价平台</label>
      <select v-if="event.bookmakers.length" :id="`book-${event.id}`" :value="bookmaker?.key" @change="selectedBook = ($event.target as HTMLSelectElement).value" :aria-label="`${team(event.away_team)[0]}对${team(event.home_team)[0]}报价平台`">
        <option v-for="book in event.bookmakers" :key="book.key" :value="book.key">{{ book.title }}</option>
      </select>
      <span v-else>暂无平台报价</span>
    </div>
    <p v-if="started" class="pregame-note">以下是赛前记录，当前比赛状态与比分未接入。</p>
    <div class="match-markets">
      <MarketQuote :market="bookmaker?.markets.find(market => market.key === 'spreads')" kind="spreads" :away="event.away_team" :home="event.home_team" :now="now" />
      <MarketQuote :market="bookmaker?.markets.find(market => market.key === 'totals')" kind="totals" :away="event.away_team" :home="event.home_team" :now="now" />
    </div>
    <button class="analyze-button" :disabled="!bookmaker" @click="analyze">交给 AI 分析 <span aria-hidden="true">↗</span></button>
  </article>
</template>

<style scoped>
.match-card { background: #fff; border: 1px solid #dfe7df; border-radius: 13px; padding: 18px 20px 16px; min-width: 0; }
.match-top { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #708476; }
.match-top time { font-variant-numeric: tabular-nums; letter-spacing: .4px; }
.match-top > span { color: #47745b; background: #edf4ec; border-radius: 4px; padding: 2px 7px; font-size: 10px; }
.match-top > span.started { background: #f4edde; color: #8d7043; }
.match-teams { display: grid; gap: 14px; padding: 20px 0; }
.team-row { display: flex; align-items: center; gap: 12px; }
.team-badge { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; background: color-mix(in srgb, var(--team-color) 11%, white); color: var(--team-color); font-size: 10px; font-weight: 750; letter-spacing: .2px; }
.team-row strong { font-size: 16px; font-weight: 600; line-height: 1.3; }
.team-row small { display: block; font-size: 10px; color: #87958d; margin-top: 2px; }
.venue-label { margin-left: auto; color: #8c9a90; font-size: 10px; }
.bookmaker-row { position: relative; border-top: 1px solid #edf0eb; padding: 11px 0; display: flex; justify-content: space-between; gap: 10px; align-items: center; font-size: 10px; color: #839287; }
.bookmaker-row select { background: #f6f8f4; border: 1px solid #e5ebe1; border-radius: 5px; padding: 4px 8px; color: #42624e; font: inherit; font-size: 11px; max-width: 65%; cursor: pointer; }
.match-markets { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding-top: 8px; }
.match-markets > :last-child { border-left: 1px solid #e8ede6; padding-left: 18px; }
.pregame-note { color: #99743c; font-size: 10px; margin: 2px 0 8px; }
.analyze-button { width: 100%; margin-top: 16px; padding: 9px 12px; border: 1px solid #dbe5d9; border-radius: 6px; color: #35583d; background: #f3f7ef; font-size: 12px; }
.analyze-button span { margin-left: 6px; }
@media (max-width: 400px) { .match-card { padding: 16px; } .match-markets { gap: 12px; } .match-markets > :last-child { padding-left: 12px; } }
</style>
