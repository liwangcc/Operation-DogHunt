<script setup lang="ts">
// 一场比赛的全部报价：各家平台的让分、大小分并排列出，点一行就把这张卡片切到那家平台。
import { computed } from 'vue'
import SideDrawer from '@/components/common/SideDrawer.vue'
import TeamMark from '@/components/common/TeamMark.vue'
import type { OddsEvent } from '@/types/odds'
import { clockTime, dateTime, price, signed, team } from './format'
import LineStrip from './LineStrip.vue'
import { lineSpread, marketOf, outcomeOf } from './lines'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ event: OddsEvent; selected?: string; started: boolean }>()
const emit = defineEmits<{ select: [key: string]; analyze: [] }>()

const away = computed(() => team(props.event.away_team))
const home = computed(() => team(props.event.home_team))
const spreads = computed(() => lineSpread(props.event, 'spreads'))
const totals = computed(() => lineSpread(props.event, 'totals'))
const selectedTitle = computed(() => props.event.bookmakers.find((book) => book.key === props.selected)?.title)

const rows = computed(() => props.event.bookmakers.map((book) => {
  const spread = marketOf(book, 'spreads')
  const total = marketOf(book, 'totals')
  return {
    key: book.key,
    title: book.title,
    cells: [outcomeOf(spread, props.event.away_team), outcomeOf(spread, props.event.home_team), outcomeOf(total, 'Over'), outcomeOf(total, 'Under')],
    updated: spread?.updated_at ?? total?.updated_at ?? null,
  }
}))
</script>

<template>
  <SideDrawer v-model:open="open" wide :label="`${away[0]}对${home[0]}的全部报价`">
    <template #title>
      <p class="overline">全部报价 · {{ event.bookmakers.length }} 家平台</p>
      <h2 class="drawer-match">
        <TeamMark :name="event.away_team" size="sm" />{{ away[0] }}<span>VS</span>{{ home[0] }}<TeamMark :name="event.home_team" size="sm" />
      </h2>
      <p class="drawer-when">{{ dateTime(event.commence_time) }} 北京时间 · {{ started ? '已到开赛时间，以下是赛前记录' : '赛前' }}</p>
    </template>

    <div class="spread-grid">
      <div>
        <p class="label">让分 · 主队{{ home[0] }}的盘口</p>
        <LineStrip :spread="spreads" kind="spreads" :selected="selected" large />
      </div>
      <div>
        <p class="label">大小分 · 总分线</p>
        <LineStrip :spread="totals" kind="totals" :selected="selected" large />
      </div>
    </div>
    <p class="drawer-note">一个方块是一家平台，亮起的是当前选中的平台。只统计各家各自开出的数值，不做平均。</p>

    <div class="table-wrap">
      <table class="table books">
        <thead>
          <tr><th>平台</th><th class="right">{{ away[0] }} 客</th><th class="right">{{ home[0] }} 主</th><th class="right">大分</th><th class="right">小分</th><th class="right">报价</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key" :class="{ on: row.key === selected }">
            <th scope="row">
              <button type="button" class="book-pick" :aria-pressed="row.key === selected" @click="emit('select', row.key)">
                <i aria-hidden="true"></i>{{ row.title }}
              </button>
            </th>
            <td v-for="(cell, index) in row.cells" :key="index" class="right">
              <template v-if="cell"><strong>{{ index < 2 ? signed(cell.point) : cell.point }}</strong><small>{{ price(cell.price) }}</small></template>
              <span v-else class="text-3">—</span>
            </td>
            <td class="right updated">{{ row.updated ? clockTime(row.updated) : '未知' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="drawer-note">每格上面是盘口数值，下面是赔率。让分的正负号对应各自球队；大小分为全场总分。平台顺序来自数据源，不代表推荐。</p>

    <template #footer>
      <span class="foot-current">{{ selectedTitle ? `当前平台：${selectedTitle}` : '暂无平台报价' }}</span>
      <button type="button" class="btn btn--primary" :disabled="!selectedTitle" @click="emit('analyze')">交给 AI 分析 <span aria-hidden="true">↗</span></button>
    </template>
  </SideDrawer>
</template>

<style scoped>
.drawer-match { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 12px 0 0; font-size: 22px; font-weight: 700; letter-spacing: .06em; }
.drawer-match span { font-size: 12px; font-style: italic; font-weight: 800; letter-spacing: .1em; color: var(--text-3); }
.drawer-when { margin: 8px 0 0; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--text-2); }
.spread-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.spread-grid .label { margin: 0 0 8px; }
.drawer-note { margin: 10px 0 22px; font-size: 12px; line-height: 1.7; color: var(--text-3); }
.books th[scope='row'] { padding: 0; font-weight: 400; }
.books td { font-variant-numeric: tabular-nums; white-space: nowrap; }
.books td strong { display: block; font-size: 15px; font-style: italic; font-weight: 700; line-height: 1.3; }
.books td small { font-size: 12px; color: var(--text-2); }
.books .updated { font-size: 12px; color: var(--text-3); }
.books tbody tr { transition: background .18s; }
.books tbody tr:hover { background: rgba(73, 221, 235, .05); }
.books tbody tr.on { background: linear-gradient(90deg, rgba(73, 221, 235, .16), rgba(73, 221, 235, .03)); }
.book-pick { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; padding: 0 12px; border: 0; background: transparent; color: var(--text); font-size: 13px; text-align: left; white-space: nowrap; }
.book-pick i { width: 10px; height: 10px; border: 1.5px solid var(--line-3); border-radius: 50%; transition: border-color .18s, background .18s, box-shadow .18s; }
.book-pick[aria-pressed='true'] i { border-color: var(--cyan); background: var(--cyan); box-shadow: 0 0 8px rgba(73, 221, 235, .7); }
.foot-current { margin-right: auto; font-size: 13px; color: var(--text-2); }
@media (max-width: 560px) {
  .spread-grid { grid-template-columns: 1fr; }
}
</style>
