<script setup lang="ts">
// 一条预测记录的详情，按需求文档 4.2 分成四块：当时的盘口、判断、依据、复盘（含结算的算式）。
import { computed } from 'vue'
import SideDrawer from '@/components/common/SideDrawer.vue'
import TeamMark from '@/components/common/TeamMark.vue'
import { dateTime, price, signed, team } from '@/components/odds/format'
import { settle } from '@/domain/settlement'
import type { PredictionRecord } from '@/types/records'
import { MARKET_LABEL, SOURCE_LABEL, STATE_LABEL, STATE_TONE, pickText, stateOf, units } from './labels'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ record: PredictionRecord; demo: boolean }>()

const settlement = computed(() => settle(props.record))
const state = computed(() => stateOf(props.record, settlement.value))
const away = computed(() => team(props.record.awayTeam))
const home = computed(() => team(props.record.homeTeam))
/** 正式记录在开赛前多久锁定。 */
const lockLead = computed(() => (props.record.lockedAt ? Math.round((Date.parse(props.record.commenceTime) - Date.parse(props.record.lockedAt)) / 60000) : null))

/** 把结算过程写成一行算式，方便逐条核对。 */
const formula = computed(() => {
  const { record } = props
  const result = settlement.value
  if (!result || result.margin === null || !record.final || record.line === null || record.selection === null) return ''
  const { home: homeScore, away: awayScore } = record.final
  if (record.market === 'spreads') {
    const pickedHome = record.selection === record.homeTeam
    const mine = pickedHome ? homeScore : awayScore
    const theirs = pickedHome ? awayScore : homeScore
    return `${team(record.selection)[0]} ${mine} ${record.line < 0 ? '−' : '+'} ${Math.abs(record.line)} − ${theirs} = ${signed(result.margin)}`
  }
  const total = homeScore + awayScore
  return record.selection === 'Over' ? `总分 ${total} − 总分线 ${record.line} = ${signed(result.margin)}` : `总分线 ${record.line} − 总分 ${total} = ${signed(result.margin)}`
})
</script>

<template>
  <SideDrawer v-model:open="open" :label="`预测记录 ${record.id}`">
    <template #title>
      <p class="overline">预测记录 {{ record.id }} · {{ MARKET_LABEL[record.market] }}</p>
      <h2 class="record-match"><TeamMark :name="record.awayTeam" size="sm" />{{ away[0] }}<span>VS</span>{{ home[0] }}<TeamMark :name="record.homeTeam" size="sm" /></h2>
      <p class="record-when">{{ dateTime(record.commenceTime) }} 开赛 · 北京时间</p>
      <div class="record-tags">
        <span class="tag" :class="STATE_TONE[state]">{{ STATE_LABEL[state] }}</span>
        <span v-if="record.lockedAt" class="tag tag--info">已锁定 · 赛前 {{ lockLead }} 分钟</span>
        <span v-else class="tag tag--warn">开赛后补录 · 未锁定</span>
        <span class="tag">{{ SOURCE_LABEL[record.source] }}</span>
        <span class="tag">{{ record.author === 'system' ? '系统判断' : '个人判断' }}</span>
        <span v-if="demo" class="tag tag--warn">演示数据</span>
      </div>
    </template>

    <section class="block">
      <h3><span>01</span>判断</h3>
      <p class="verdict" :class="{ muted: record.decision !== 'pick' }">{{ pickText(record) }}</p>
      <dl class="facts">
        <div><dt>策略版本</dt><dd>{{ record.strategy }}</dd></div>
        <div><dt>模型</dt><dd>{{ record.model }}</dd></div>
        <div><dt>生成时间</dt><dd class="num">{{ dateTime(record.generatedAt) }}</dd></div>
      </dl>
    </section>

    <section class="block">
      <h3><span>02</span>当时的盘口</h3>
      <dl v-if="record.decision === 'pick'" class="facts">
        <div><dt>参考平台</dt><dd>{{ record.bookmaker }}</dd></div>
        <div><dt>玩法</dt><dd>全场{{ MARKET_LABEL[record.market] }}</dd></div>
        <div><dt>盘口数值</dt><dd class="num strong">{{ record.market === 'spreads' ? signed(record.line!) : record.line }}</dd></div>
        <div><dt>赔率</dt><dd class="num strong">{{ price(record.price) }}</dd></div>
        <div><dt>锁定时间</dt><dd class="num">{{ record.lockedAt ? dateTime(record.lockedAt) : '未锁定' }}</dd></div>
      </dl>
      <p v-else class="block-note">没有给出方向，所以没有冻结的盘口快照。</p>
      <p class="block-note">盘口、赔率和方向来自同一家平台、同一个玩法、同一份快照；之后盘口变化不会改写这条记录。</p>
    </section>

    <section class="block">
      <h3><span>03</span>依据</h3>
      <ul class="points"><li v-for="reason in record.reasons" :key="reason">{{ reason }}</li></ul>
      <template v-if="record.risks.length">
        <h4>不确定因素</h4>
        <ul class="points risk"><li v-for="risk in record.risks" :key="risk">{{ risk }}</li></ul>
      </template>
    </section>

    <section class="block">
      <h3><span>04</span>复盘</h3>
      <template v-if="record.decision !== 'pick'">
        <p class="block-note">{{ record.decision === 'pass' ? '观望不产生模拟投入，也不参与命中率和 ROI。' : '数据不足时不生成可结算的选择。' }}</p>
        <p v-if="record.final" class="score"><span>{{ away[0] }}</span><strong class="num">{{ record.final.away }} : {{ record.final.home }}</strong><span>{{ home[0] }}</span><small v-if="record.final.overtime">加时</small></p>
      </template>
      <p v-else-if="state === 'void'" class="block-note">比赛取消或市场无效：盈亏记为 0，这笔投入不计入 ROI 的分母。</p>
      <p v-else-if="state === 'pending'" class="block-note">比赛还没有最终比分，结算后这里会出现比分和算式。</p>
      <template v-else-if="record.final && settlement">
        <p class="score"><span>{{ away[0] }}</span><strong class="num">{{ record.final.away }} : {{ record.final.home }}</strong><span>{{ home[0] }}</span><small v-if="record.final.overtime">加时</small></p>
        <div class="settle">
          <p class="settle-row"><span>结算差值</span><code class="num">{{ formula }}</code></p>
          <p class="settle-row"><span>结果</span><strong :class="STATE_TONE[state]" class="tag">{{ STATE_LABEL[state] }}</strong><small>大于 0 赢盘，小于 0 输盘，等于 0 走盘</small></p>
          <p class="settle-row"><span>模拟盈亏</span><strong class="num" :class="{ pos: settlement.pnl! > 0, neg: settlement.pnl! < 0 }">{{ units(settlement.pnl!) }} 单位</strong><small>固定投入 1 单位{{ state === 'win' ? `，净赢 = 十进制赔率 ${record.price!.toFixed(2)} − 1` : '' }}</small></p>
        </div>
      </template>
      <p v-if="record.note" class="note"><span>笔记</span>{{ record.note }}</p>
    </section>
  </SideDrawer>
</template>

<style scoped>
.record-match { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 12px 0 0; font-size: 21px; font-weight: 600; letter-spacing: .04em; }
.record-match span { font-family: var(--font-num); font-size: 11px; font-weight: 500; letter-spacing: .14em; color: var(--text-3); }
.record-when { margin: 8px 0 0; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--text-2); }
.record-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }

.block { padding: 0 0 22px; margin-bottom: 22px; border-bottom: 1px solid var(--line); }
.block:last-child { margin-bottom: 0; border-bottom: 0; }
.block h3 { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; font-size: 14px; font-weight: 600; letter-spacing: .08em; }
.block h3 span { font-family: var(--font-num); font-size: 13px; font-weight: 500; letter-spacing: .04em; color: var(--cyan); }
.block h4 { margin: 14px 0 8px; font-size: 12px; font-weight: 400; letter-spacing: .08em; color: var(--text-3); }
/* 判断本身是这一页最大的字：方向加盘口。 */
.verdict { margin: 0 0 14px; font-family: var(--font-num); font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: .03em; line-height: 1.2; }
.verdict.muted { font-family: var(--font-sans); font-weight: 400; color: var(--text-2); }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px 18px; margin: 0; }
.facts dt { font-size: 12px; letter-spacing: .06em; color: var(--text-3); }
.facts dd { margin: 3px 0 0; font-size: 14px; }
.facts .strong { font-family: var(--font-num); font-size: 18px; font-weight: 500; letter-spacing: .02em; }
.block-note { margin: 12px 0 0; font-size: 12px; line-height: 1.75; color: var(--text-3); }
.points { display: grid; gap: 6px; margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.75; }
.points li::marker { color: var(--cyan); }
.points.risk li::marker { color: var(--amber); }

.score { display: flex; align-items: baseline; gap: 12px; margin: 0 0 14px; font-size: 15px; }
.score strong { font-family: var(--font-num); font-size: 28px; font-weight: 500; letter-spacing: .03em; line-height: 1.1; }
.score small { padding: 1px 6px; border: 1px solid var(--line-2); border-radius: var(--radius); font-size: 11px; color: var(--text-2); }
.settle { display: grid; gap: 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--well); }
.settle-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0; padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 14px; }
.settle-row:last-child { border-bottom: 0; }
.settle-row > span { flex: 0 0 76px; font-size: 12px; letter-spacing: .06em; color: var(--text-3); }
.settle-row code { font-family: inherit; font-size: 15px; font-weight: 600; }
.settle-row small { font-size: 12px; color: var(--text-3); }
.note { margin: 14px 0 0; padding: 10px 14px; border-left: 1px solid var(--line-3); background: rgba(160, 190, 202, .04); font-size: 14px; line-height: 1.75; }
.note span { display: block; font-size: 12px; letter-spacing: .08em; color: var(--text-3); }
</style>
