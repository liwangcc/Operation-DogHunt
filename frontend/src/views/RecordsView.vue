<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { marketLabels, recordPreview, resultLabels } from '@/data/recordPreview'
import type { RecordMarket, RecordPreview, RecordResult } from '@/data/recordPreview'
import ReviewComposer from '@/features/reviews/ReviewComposer.vue'
import ReviewArchive from '@/features/reviews/ReviewArchive.vue'
import { appendSupplement, createReview, matchKey, previewTimestamp, seedReviews } from '@/features/reviews/preview'
import type { ReviewDraft } from '@/features/reviews/preview'

const preview = ref(true)
const query = ref('')
const market = ref<'all' | RecordMarket>('all')
const result = ref<'all' | RecordResult>('all')
const day = ref('all')
const needsReview = ref(false)
const selectedId = ref(recordPreview[0]?.id ?? '')
const section = ref<'records' | 'archive'>('records')
const archives = ref(seedReviews(recordPreview))
const visibleArchives = computed(() => preview.value ? archives.value : [])
const archiveFocusId = ref('')
const archiveFocusRequest = ref(0)
const notice = ref('')
const records = computed(() => preview.value ? recordPreview : [])
const days = [...new Set(recordPreview.map(record => record.day))]
const visibleRecords = computed(() => records.value.filter(record => {
  const search = query.value.trim().toLocaleLowerCase()
  return (!search || `${record.away} ${record.home} ${record.pick} ${record.id}`.toLocaleLowerCase().includes(search))
    && (market.value === 'all' || record.market === market.value)
    && (result.value === 'all' || record.result === result.value)
    && (day.value === 'all' || record.day === day.value)
    && (!needsReview.value || reviewable(record.result) && !archiveFor(record))
}).sort((left, right) => `${right.day} ${right.time}`.localeCompare(`${left.day} ${left.time}`)))
const selected = computed(() => visibleRecords.value.find(record => record.id === selectedId.value) ?? visibleRecords.value[0])
const pendingCount = computed(() => records.value.filter(record => record.result === 'pending').length)
const reviewCount = computed(() => records.value.filter(record => reviewable(record.result) && !archiveFor(record)).length)
const reviewedCount = computed(() => records.value.filter(record => archiveFor(record)).length)
const hasFilters = computed(() => !!query.value || market.value !== 'all' || result.value !== 'all' || day.value !== 'all' || needsReview.value)

function archiveFor(record: RecordPreview) { return visibleArchives.value.find(entry => entry.matchKey === matchKey(record)) }
function openArchive(id = '') {
  archiveFocusId.value = id; archiveFocusRequest.value++; section.value = 'archive'
}
function archiveDraft(draft: ReviewDraft) {
  const record = selected.value
  if (!record || !preview.value || !reviewable(record.result) || archiveFor(record) || !draft.content.trim()) return
  const entry = createReview(recordPreview, record, draft, previewTimestamp())
  archives.value = [entry, ...archives.value]
  notice.value = '已加入本次预览的复盘档案；刷新或离开本页后恢复示例。'
  openArchive(entry.id)
}
function addSupplement(id: string, content: string) {
  if (!preview.value || !content.trim()) return
  archives.value = archives.value.map(entry => entry.id === id ? appendSupplement(entry, content, previewTimestamp()) : entry)
  notice.value = '补充已追加到本次预览，原文保留；正式存储尚未接入。'
}
function viewRecord(id: string) { resetFilters(); selectedId.value = id; section.value = 'records'; notice.value = '' }

function reviewable(value: RecordResult) { return value === 'win' || value === 'loss' || value === 'push' }
function resetFilters() {
  query.value = ''; market.value = 'all'; result.value = 'all'; day.value = 'all'; needsReview.value = false
}
watch(preview, () => { resetFilters(); selectedId.value = recordPreview[0]?.id ?? ''; notice.value = '' })
</script>

<template>
  <section class="records-page" aria-labelledby="records-heading">
    <header class="records-heading">
      <div>
        <span class="records-eyebrow"><i aria-hidden="true"></i> MY PICKS · REVIEW JOURNAL</span>
        <h1 id="records-heading">预测记录<span>留住当时的判断，慢慢看清自己的选择。</span></h1>
      </div>
      <RouterLink class="primary-link" to="/matches">去选比赛 <span aria-hidden="true">↗</span></RouterLink>
    </header>

    <div class="preview-banner">
      <div><strong>{{ preview ? '示例预览' : '空白预览' }}</strong><span>{{ preview ? '虚构比赛与复盘示例；新归档和补充仅保留在本页，刷新或离页后重置。' : '尚未接入真实记录，先看看你的复盘本会是什么样子。' }}</span></div>
      <button type="button" :aria-pressed="preview" @click="preview = !preview">{{ preview ? '查看空白状态' : '查看示例记录' }} <span aria-hidden="true">↔</span></button>
    </div>

    <div class="records-navigation" role="group" aria-label="记录与档案切换"><button :class="{ active: section === 'records' }" :aria-pressed="section === 'records'" @click="section = 'records'; notice = ''">选场记录 <span>{{ records.length }}</span></button><button :class="{ active: section === 'archive' }" :aria-pressed="section === 'archive'" @click="section = 'archive'; notice = ''">复盘档案 <span>{{ visibleArchives.length }}</span></button><small>先记录，再积累，最后由你决定怎么调整。</small></div>
    <p v-if="notice" class="archive-notice" role="status">{{ notice }}</p>
    <div v-show="section === 'records'">
    <div class="summary-grid" aria-label="选场记录概览（界面预览）">
      <article><span>选场记录</span><strong>{{ records.length.toString().padStart(2, '0') }}<small>条</small></strong><p>让分与大小分分别记录</p></article>
      <article><span><i class="mini-dot gold"></i>待结算</span><strong>{{ pendingCount.toString().padStart(2, '0') }}<small>条</small></strong><p>等待赛果，对照当时盘口</p></article>
      <article><span><i class="mini-dot rust"></i>待复盘</span><strong>{{ reviewCount.toString().padStart(2, '0') }}<small>条</small></strong><p>已有结果，还没有复盘笔记</p></article>
      <article><span><i class="mini-dot green"></i>已复盘</span><strong>{{ reviewedCount.toString().padStart(2, '0') }}<small>条</small></strong><p>把经验留给下一次判断</p></article>
    </div>

    <div class="journal-heading"><div><h2>我的选场</h2><span>每个选择，都值得回头看。</span></div><span class="journal-tag">个人复盘本</span></div>
    <div class="filter-panel">
      <div class="filter-top">
        <div class="market-tabs" role="group" aria-label="玩法筛选">
          <button v-for="tab in ([{ key: 'all', label: '全部玩法' }, { key: 'spread', label: '让分' }, { key: 'total', label: '大小分' }] as const)" :key="tab.key" :aria-pressed="market === tab.key" :class="{ active: market === tab.key }" @click="market = tab.key">{{ tab.label }}</button>
        </div>
        <label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input v-model="query" type="search" aria-label="搜索球队或记录编号" placeholder="搜索球队 / 记录编号" /></label>
      </div>
      <div class="filter-bottom">
        <div class="select-filters">
          <label>比赛日期<select v-model="day"><option value="all">全部日期</option><option v-for="date in days" :key="date" :value="date">{{ date }}</option></select></label>
          <label>结算状态<select v-model="result"><option value="all">全部状态</option><option v-for="(label, key) in resultLabels" :key="key" :value="key">{{ label }}</option></select></label>
        </div>
        <div class="review-filter"><label><input v-model="needsReview" type="checkbox" />仅看待复盘</label><button v-if="hasFilters" class="clear-button" @click="resetFilters">重置筛选</button></div>
      </div>
    </div>

    <div class="journal-layout" :class="{ 'is-empty': !visibleRecords.length }">
      <section class="record-list" aria-label="选场记录列表">
        <div class="list-caption"><span>{{ preview ? '示例记录' : '全部记录' }} <b>{{ visibleRecords.length }}</b></span><span>按比赛时间 · 从新到旧</span></div>
        <template v-if="visibleRecords.length">
          <div class="list-columns" aria-hidden="true"><span>比赛 / 记录时间</span><span>我的选择</span><span>结果 / 复盘</span></div>
          <button v-for="record in visibleRecords" :key="record.id" class="record-row" :class="{ selected: selected?.id === record.id }" :aria-pressed="selected?.id === record.id" @click="selectedId = record.id">
            <span class="match-cell"><span class="match-date">{{ record.day.slice(5).replace('-', ' / ') }} · {{ record.time }} <small>北京时间</small></span><strong>{{ record.away }} <em>vs</em> {{ record.home }}</strong><span class="record-time">记录于 {{ record.recordedAt }}</span></span>
            <span class="pick-cell"><span class="market-label">{{ marketLabels[record.market] }}</span><strong>{{ record.pick }}</strong><small>{{ record.platform }} · {{ record.odds }}</small></span>
            <span class="result-cell"><span class="result-badge" :class="record.result">{{ resultLabels[record.result] }}</span><small>{{ archiveFor(record) ? '已归档' : reviewable(record.result) ? '待复盘' : record.result === 'pending' ? '等待赛果' : '保留记录' }} <span aria-hidden="true">↗</span></small></span>
          </button>
          <div class="list-footer">已展示全部 {{ visibleRecords.length }} 条示例记录<span>每条对应一个玩法</span></div>
        </template>
        <div v-else class="records-empty">
          <div class="empty-icon" aria-hidden="true">☷</div>
          <h3>{{ records.length ? '没有找到符合条件的记录' : '你的选场复盘，从这里开始' }}</h3>
          <p>{{ records.length ? '试试其他球队、玩法或结算状态。' : '以后选好比赛、确认预测后，就能在这里回看判断、对照赛果，写下自己的复盘。' }}</p>
          <button v-if="records.length" class="outline-button" @click="resetFilters">清除筛选</button>
          <RouterLink v-else class="outline-button" to="/matches">去看看比赛 <span aria-hidden="true">↗</span></RouterLink>
        </div>
      </section>

      <aside v-if="selected" class="record-detail" aria-labelledby="detail-heading">
        <div class="detail-kicker"><span>记录详情 · 示例</span><span>{{ selected.id }}</span></div>
        <h2 id="detail-heading">{{ selected.away }} <span>vs</span> {{ selected.home }}</h2>
        <p class="detail-date">{{ selected.day }} {{ selected.time }} · 北京时间</p>
        <div class="choice-card"><div><span>我的选择 · {{ marketLabels[selected.market] }}</span><strong>{{ selected.pick }}</strong></div><span class="result-badge" :class="selected.result">{{ resultLabels[selected.result] }}</span></div>
        <dl class="record-facts"><div><dt>记录赔率</dt><dd>{{ selected.odds }}<small>十进制</small></dd></div><div><dt>参考平台</dt><dd>{{ selected.platform }}</dd></div><div><dt>记录时间</dt><dd>{{ selected.recordedAt }}</dd></div><div><dt>记录来源</dt><dd>我的选场 · 示例</dd></div></dl>
        <section class="detail-section"><h3><span class="section-number">01</span>当时为什么选</h3><p>{{ selected.reason }}</p><div class="uncertainty"><span>不确定因素</span>{{ selected.uncertainty }}</div></section>
        <section class="detail-section"><h3><span class="section-number">02</span>赛后对照</h3><div class="score-card"><span>{{ selected.score ? '示例最终比分' : selected.result === 'void' ? '比赛已取消 · 示例' : '等待比赛结果' }}</span><strong>{{ selected.score ?? '— : —' }}</strong><p>{{ selected.result === 'pending' ? '赛果接入后，在这里对照记录时的盘口。' : '当前仅展示状态样式，真实赛果与结算后续接入。' }}</p></div></section>
        <ReviewComposer :match-id="matchKey(selected)" :archived="archiveFor(selected)" :can-review="reviewable(selected.result)" @archive="archiveDraft" @open-archive="openArchive(archiveFor(selected)?.id)" />
      </aside>
    </div>
    </div>
    <ReviewArchive v-show="section === 'archive'" :entries="visibleArchives" :records="records" :focus-id="archiveFocusId" :focus-request="archiveFocusRequest" @supplement="addSupplement" @view-record="viewRecord" />
    <footer class="records-footnote"><span aria-hidden="true">◈</span> 记录当时的选择，也保留判断的来由。<span>当前为 UI 预览，真实预测、赛果与存储后续接入。</span></footer>
  </section>
</template>

<style scoped>
.records-navigation { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #dfe6d6; margin: 4px 0 22px; padding-bottom: 11px; flex-wrap: wrap; }
.records-navigation > button { border: 0; border-radius: 6px; padding: 9px 14px; font-size: 12px; color: #87957a; background: transparent; display: flex; align-items: center; gap: 9px; }.records-navigation > button.active { background: #e7efde; color: #4c6d3c; font-weight: 550; }.records-navigation > button > span { color: #91a27e; font-size: 10px; background: #f0f5e9; padding: 0 5px; border-radius: 3px; }.records-navigation > small { margin-left: auto; color: #9ba78b; font-size: 10px; }.archive-notice { color: #618249; background: #eaf2e1; border: 1px solid #dbe7ce; border-radius: 6px; padding: 10px 14px; font-size: 11px; line-height: 1.8; margin-bottom: 18px; }
.records-page { max-width: 1480px; margin: 0 auto; padding: 38px 40px 30px; }
.records-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.records-eyebrow { display: flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: 1.8px; color: #77897c; }
.records-eyebrow i { width: 6px; height: 6px; border-radius: 50%; background: #b5965a; }
.records-heading h1 { margin: 12px 0 0; font-size: 28px; letter-spacing: -.7px; }
.records-heading h1 > span { display: block; font-size: 12px; color: #7b8b80; letter-spacing: .2px; font-weight: 400; margin-top: 9px; }
.primary-link { display: inline-flex; align-items: center; gap: 22px; background: #244e3e; color: #fff; padding: 10px 17px; border-radius: 7px; font-size: 12px; white-space: nowrap; }
.primary-link:hover { background: #163e35; }
.preview-banner { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: #f0ede3; border: 1px solid #e7e1d0; border-radius: 7px; padding: 11px 14px; margin: 26px 0 20px; font-size: 11px; color: #82714c; }
.preview-banner > div { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
.preview-banner strong { color: #75603c; font-weight: 600; white-space: nowrap; }
.preview-banner button { background: transparent; border: 0; padding: 4px 0; color: #75603c; font-size: 11px; white-space: nowrap; }
.preview-banner button span { margin-left: 8px; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.summary-grid article { border: 1px solid #e0e6dc; border-radius: 9px; padding: 18px 20px; background: #fcfdfb; }
.summary-grid article > span { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #667e6d; }
.summary-grid strong { display: block; font-size: 31px; line-height: 1.3; font-weight: 500; margin-top: 11px; font-variant-numeric: tabular-nums; letter-spacing: -1px; }
.summary-grid small { color: #8a978d; font-size: 11px; font-weight: 400; margin-left: 7px; }
.summary-grid p { color: #8a958b; font-size: 10px; margin: 7px 0 0; }
.mini-dot { width: 5px; height: 5px; border-radius: 50%; }
.gold { background: #b29152; }.rust { background: #b77b66; }.green { background: #6d9772; }
.journal-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 30px 0 15px; }
.journal-heading > div { display: flex; align-items: baseline; gap: 14px; }
.journal-heading h2 { font-size: 16px; font-weight: 600; margin: 0; }
.journal-heading span { font-size: 11px; color: #879388; }
.journal-tag { border: 1px solid #dce5d8; padding: 3px 9px; border-radius: 4px; }
.filter-panel { background: #fcfdfb; border: 1px solid #dfe6dc; border-radius: 9px; margin-bottom: 18px; }
.filter-top, .filter-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; }
.filter-bottom { border-top: 1px solid #edf0e9; padding-top: 11px; padding-bottom: 11px; }
.market-tabs { display: flex; gap: 5px; }
.market-tabs button { color: #718475; background: transparent; border: 0; border-radius: 5px; font-size: 12px; padding: 7px 13px; }
.market-tabs button.active { color: #35583e; background: #e7eee2; font-weight: 600; }
.search-field { display: flex; gap: 8px; align-items: center; width: 245px; border: 1px solid #e1e7de; border-radius: 6px; background: #f8faf6; padding: 7px 10px; }
.search-field svg { width: 15px; height: 15px; fill: none; stroke: #8a998b; stroke-width: 1.6; flex-shrink: 0; }
.search-field input { font: inherit; font-size: 11px; color: #375343; width: 100%; min-width: 0; border: 0; background: transparent; }
.search-field:focus-within { outline: 2px solid #b58a40; outline-offset: 2px; }
.search-field input:focus { outline: none; }
.search-field input::placeholder { color: #8d998e; }
.select-filters, .review-filter { display: flex; align-items: center; gap: 18px; }
.select-filters label { color: #839084; font-size: 10px; }
.select-filters select { font: inherit; font-size: 11px; color: #47634f; border: 0; background: transparent; padding: 5px 2px; margin-left: 6px; max-width: 145px; }
.review-filter label { display: flex; align-items: center; gap: 5px; color: #6d8170; font-size: 11px; white-space: nowrap; }
.review-filter input { accent-color: #355b43; }
.clear-button { font-size: 10px; color: #6a7f6d; border: 0; background: transparent; text-decoration: underline; padding: 4px 0; white-space: nowrap; }
.journal-layout { display: grid; grid-template-columns: minmax(0, 1fr) 325px; gap: 20px; align-items: start; }
.journal-layout.is-empty { grid-template-columns: minmax(0, 1fr); }
.record-list { min-width: 0; background: #fcfdfb; border: 1px solid #dfe6dc; border-radius: 9px; overflow: hidden; }
.list-caption { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 16px 18px; font-size: 11px; color: #607865; }
.list-caption b { display: inline-block; margin-left: 6px; background: #eaf0e5; border-radius: 4px; padding: 0 6px; font-weight: 500; }
.list-caption > span:last-child { color: #8c998c; font-size: 10px; }
.list-columns, .record-row { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 78px; gap: 14px; padding: 12px 18px; }
.list-columns { background: #f3f6ef; color: #8b9789; font-size: 10px; border-block: 1px solid #e8ede3; }
.record-row { width: 100%; background: transparent; color: inherit; text-align: left; border: 0; border-bottom: 1px solid #e9ede5; padding-top: 19px; padding-bottom: 19px; position: relative; }
.record-row:hover { background: #f3f7ee; }.record-row.selected { background: #edf3e8; }
.record-row.selected::before { content: ''; position: absolute; left: 0; top: 17px; bottom: 17px; width: 3px; background: #527c54; border-radius: 0 3px 3px 0; }
.record-row:focus-visible { outline-offset: -4px; }
.match-cell, .pick-cell, .result-cell { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.match-date { font-size: 10px; color: #7e8e7c; letter-spacing: .2px; }.match-date small { font-size: 9px; color: #94a08e; margin-left: 3px; }
.match-cell strong { font-size: 13px; font-weight: 550; margin: 7px 0; overflow-wrap: anywhere; }
.match-cell em { color: #9aa68f; font-size: 10px; font-style: normal; font-weight: 400; margin-inline: 4px; }
.record-time { color: #95a08f; font-size: 9px; }
.market-label { font-size: 9px; color: #73856b; border: 1px solid #dce5d4; border-radius: 3px; padding: 0 5px; }
.pick-cell strong { font-size: 12px; font-weight: 550; margin: 5px 0 7px; }
.pick-cell small { color: #879580; font-size: 9px; }
.result-cell { justify-content: center; gap: 10px; }.result-cell > small { color: #8c9b85; font-size: 10px; }.result-cell > small span { margin-left: 6px; }
.result-badge { display: inline-flex; align-items: center; justify-content: center; padding: 3px 9px; font-size: 10px; border-radius: 4px; white-space: nowrap; }
.result-badge.pending { background: #f0e8d5; color: #927741; }.result-badge.win { background: #e1ecdc; color: #49734a; }.result-badge.loss { background: #f3e6de; color: #a46750; }.result-badge.push { background: #e7ece7; color: #6c8170; }.result-badge.void { background: #ededeb; color: #8b9087; }
.list-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 17px 18px; color: #91a087; font-size: 10px; }
.record-detail { min-width: 0; background: #fcfdfb; border: 1px solid #dfe6dc; border-radius: 9px; padding: 20px; }
.detail-kicker { display: flex; align-items: center; justify-content: space-between; color: #8a9982; font-size: 9px; letter-spacing: .5px; }
.record-detail h2 { margin: 17px 0 4px; font-size: 18px; font-weight: 550; letter-spacing: -.4px; }.record-detail h2 > span { color: #a0ac95; font-size: 12px; font-weight: 400; margin-inline: 6px; }
.detail-date { font-size: 10px; color: #88987e; margin: 0 0 18px; }
.choice-card { background: #edf3e7; border-radius: 7px; padding: 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.choice-card > div > span { display: block; font-size: 10px; color: #798d6e; }.choice-card strong { font-size: 18px; font-weight: 550; display: block; margin-top: 4px; }
.record-facts { margin: 17px 0 0; display: grid; gap: 8px; font-size: 10px; }.record-facts > div { display: flex; justify-content: space-between; gap: 10px; }.record-facts dt { color: #8e9b85; }.record-facts dd { margin: 0; color: #5f765a; text-align: right; }.record-facts small { margin-left: 5px; font-size: 9px; color: #9ba78e; }
.detail-section { margin-top: 21px; padding-top: 18px; border-top: 1px solid #e7ecdf; }.detail-section h3 { display: flex; align-items: center; gap: 9px; font-size: 12px; font-weight: 550; margin: 0 0 12px; }.section-number { color: #a4ad97; font-size: 9px; font-weight: 400; }.detail-section > p { color: #7a8c70; font-size: 11px; line-height: 1.9; margin: 0; }
.uncertainty { border-left: 2px solid #d4c5a2; padding-left: 10px; color: #9a8c6a; font-size: 10px; line-height: 1.9; margin-top: 12px; }.uncertainty > span { display: block; color: #8a7952; margin-bottom: 2px; }
.score-card { background: #f5f7f1; border: 1px dashed #dce5d4; border-radius: 6px; padding: 12px; text-align: center; }.score-card > span { font-size: 10px; color: #8e9d83; }.score-card strong { display: block; font-size: 16px; font-weight: 500; margin: 6px 0; color: #63805a; }.score-card p { font-size: 10px; color: #9aa78e; margin: 0; line-height: 1.8; }
.note-tag { margin-left: auto; font-size: 9px; font-weight: 400; color: #94a184; }.detail-section textarea { width: 100%; max-width: 100%; resize: vertical; min-height: 100px; font-size: 11px; line-height: 1.9; color: #5c7755; padding: 11px; border: 1px solid #dfe7d7; background: #f9fbf6; border-radius: 6px; }.detail-section textarea::placeholder { color: #9ca890; }.detail-section .note-hint { font-size: 9px; color: #a1ac96; margin-top: 6px; }
.records-empty { padding: 64px 22px 72px; text-align: center; }.empty-icon { font-size: 25px; color: #8eaa7c; background: #edf3e6; width: 54px; height: 54px; border-radius: 16px; display: grid; place-items: center; margin: 0 auto 22px; }.records-empty h3 { font-size: 17px; font-weight: 500; margin: 0 0 12px; }.records-empty p { font-size: 12px; color: #8a9a80; max-width: 390px; margin: 0 auto 24px; line-height: 1.9; }.outline-button { display: inline-block; background: transparent; border: 1px solid #ceddc4; border-radius: 6px; padding: 8px 16px; color: #638157; font-size: 12px; }
.records-footnote { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: #85967c; font-size: 10px; border-top: 1px solid #e0e7d9; margin-top: 24px; padding-top: 17px; }.records-footnote > span:last-child { margin-left: auto; color: #9aa68f; }.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
@media (min-width: 1500px) { .journal-layout { grid-template-columns: minmax(0, 1fr) 365px; }.record-detail { padding: 24px; }.record-row { padding-top: 22px; padding-bottom: 22px; } }
@media (max-width: 1200px) { .records-page { padding: 30px 28px; }.journal-layout { grid-template-columns: minmax(0, 1fr); }.record-detail { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 24px; }.detail-kicker, .record-detail > h2, .detail-date { grid-column: 1 / -1; }.record-facts { margin-top: 0; }.detail-section:last-child { grid-column: 1 / -1; } }
@media (max-width: 700px) { .records-page { padding: 28px 20px; }.records-heading { align-items: flex-start; gap: 10px; }.records-heading h1 { font-size: 25px; }.records-heading h1 > span { max-width: 210px; font-size: 11px; line-height: 1.8; }.records-eyebrow { font-size: 8px; letter-spacing: 1px; }.primary-link { font-size: 11px; gap: 10px; padding: 9px 12px; margin-top: 25px; }.preview-banner { align-items: flex-start; }.preview-banner > div { gap: 4px; }.preview-banner > div > span { font-size: 10px; line-height: 1.8; }.preview-banner button { font-size: 10px; }.summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.summary-grid article { padding: 15px; }.summary-grid strong { font-size: 28px; }.summary-grid p { font-size: 9px; }.journal-heading > div { display: block; }.journal-heading > div > span { display: block; margin-top: 5px; font-size: 10px; }.filter-top, .filter-bottom { align-items: stretch; flex-direction: column; gap: 12px; padding: 12px; }.search-field { width: 100%; }.market-tabs button { flex: 1; }.select-filters { justify-content: space-between; gap: 8px; flex-wrap: wrap; }.select-filters select { margin-left: 3px; max-width: 125px; }.review-filter { justify-content: space-between; }.list-caption { padding: 14px; }.list-caption > span:last-child { font-size: 9px; }.list-columns, .record-row { grid-template-columns: minmax(0, 1fr) minmax(0, .85fr) 53px; gap: 8px; padding-inline: 12px; }.list-columns { font-size: 9px; }.match-cell strong { font-size: 11px; }.match-cell em { margin-inline: 1px; font-size: 9px; }.match-date { font-size: 9px; }.match-date small { display: none; }.record-time { font-size: 8px; line-height: 1.8; }.pick-cell strong { font-size: 11px; }.pick-cell small { font-size: 8px; }.result-badge { font-size: 9px; padding: 3px 7px; }.result-cell > small { font-size: 9px; }.result-cell > small span { display: none; }.record-detail { display: block; padding: 19px; }.record-facts { margin-top: 18px; }.record-detail h2 { font-size: 20px; }.records-footnote > span:last-child { margin-left: 0; width: 100%; }.records-empty { padding-inline: 18px; }.records-empty h3 { font-size: 16px; } }
@media (max-width: 700px) { .records-navigation > small { margin: 4px 0 0; width: 100%; font-size: 9px; }.records-navigation > button { padding: 8px 12px; font-size: 11px; } }
@media (prefers-reduced-motion: no-preference) { .record-row { transition: background-color .15s ease; } }
</style>
