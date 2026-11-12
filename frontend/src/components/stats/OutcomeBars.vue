<script setup lang="ts">
// 结算分布：每个玩法一条横条，按赢盘、输盘、走盘、取消、待结算的数量分段；旁边列出观望和数据不足。
import type { Summary } from '@/domain/metrics'

/** rows 是各玩法各自的汇总；total 是当前筛选下的总汇总，用来画“决定构成”。 */
defineProps<{ rows: { key: string; label: string; summary: Summary }[]; total: Summary }>()

const SEGMENTS = [
  { key: 'wins', label: '赢盘', tone: 'win' },
  { key: 'losses', label: '输盘', tone: 'loss' },
  { key: 'pushes', label: '走盘', tone: 'push' },
  { key: 'voids', label: '取消', tone: 'void' },
  { key: 'pending', label: '待结算', tone: 'pending' },
] as const
</script>

<template>
  <div class="outcomes">
    <div v-for="row in rows" :key="row.key" class="outcome-row">
      <div class="outcome-head"><strong>{{ row.label }}</strong><span class="num">有效选择 {{ row.summary.picks }} · 观望 {{ row.summary.passes }} · 数据不足 {{ row.summary.insufficient }}</span></div>
      <div v-if="row.summary.picks" class="outcome-bar" role="img" :aria-label="`${row.label}：${SEGMENTS.map((segment) => `${segment.label} ${row.summary[segment.key]}`).join('，')}`">
        <template v-for="segment in SEGMENTS" :key="segment.key">
          <i v-if="row.summary[segment.key]" :class="segment.tone" :style="{ flexGrow: row.summary[segment.key] }" :title="`${segment.label} ${row.summary[segment.key]}`"><span class="num">{{ row.summary[segment.key] }}</span></i>
        </template>
      </div>
      <div v-else class="outcome-bar empty">没有给出方向的记录</div>
    </div>
    <ul class="legend" aria-hidden="true">
      <li v-for="segment in SEGMENTS" :key="segment.key"><i :class="segment.tone"></i>{{ segment.label }}</li>
    </ul>

    <div class="outcome-row decisions">
      <div class="outcome-head"><strong>决定构成</strong><span class="num">符合分析条件 {{ total.analyzed }}</span></div>
      <div v-if="total.analyzed" class="outcome-bar" role="img" :aria-label="`有效选择 ${total.picks}，观望 ${total.passes}，数据不足 ${total.insufficient}`">
        <i v-if="total.picks" class="pick" :style="{ flexGrow: total.picks }" :title="`有效选择 ${total.picks}`"><span class="num">{{ total.picks }}</span></i>
        <i v-if="total.passes" class="pass" :style="{ flexGrow: total.passes }" :title="`观望 ${total.passes}`"><span class="num">{{ total.passes }}</span></i>
        <i v-if="total.insufficient" class="lack" :style="{ flexGrow: total.insufficient }" :title="`数据不足 ${total.insufficient}`"><span class="num">{{ total.insufficient }}</span></i>
      </div>
      <ul class="legend" aria-hidden="true">
        <li><i class="pick"></i>有效选择</li><li><i class="pass"></i>观望</li><li><i class="lack"></i>数据不足</li>
      </ul>
      <p class="outcome-note">允许观望：优势不足或资料不全时不强行给方向，这些不计入命中率。</p>
    </div>
  </div>
</template>

<style scoped>
.outcomes { display: grid; gap: 18px; }
.outcome-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.outcome-head strong { font-size: 14px; font-weight: 600; letter-spacing: .1em; }
.outcome-head span { font-size: 12px; color: var(--text-3); }
.outcome-bar { display: flex; gap: 2px; height: 30px; }
.outcome-bar i { display: grid; place-items: center; flex-basis: 0; min-width: 20px; border-radius: 2px; font-style: normal; transition: flex-grow .6s var(--ease-out); }
.outcome-bar i span { font-size: 12px; font-weight: 700; color: #06101c; }
.outcome-bar.empty { align-items: center; padding: 0 12px; border: 1px dashed var(--line-2); border-radius: 2px; font-size: 12px; color: var(--text-3); }
.win { background: var(--green); }
.loss { background: var(--red); }
.push { background: var(--violet); }
.void { background: #6c8097; }
.pending { background: repeating-linear-gradient(-45deg, rgba(73, 221, 235, .75) 0 4px, rgba(73, 221, 235, .45) 4px 8px); }
.pick { background: var(--cyan); }
.pass { background: #7f95a8; }
.lack { background: var(--amber); }
.decisions { display: grid; gap: 0; padding-top: 18px; border-top: 1px solid var(--line); }
.decisions .legend { margin-top: 10px; }
.outcome-note { margin: 10px 0 0; font-size: 12px; line-height: 1.7; color: var(--text-3); }
.legend { display: flex; gap: 6px 16px; flex-wrap: wrap; margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--text-2); }
.legend li { display: flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 2px; }
</style>
