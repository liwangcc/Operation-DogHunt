<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RecordPreview } from '@/data/recordPreview'
import { marketLabels, resultLabels } from '@/data/recordPreview'
import { relatedRecords, reviewTags } from './preview'
import type { ReviewEntry } from './preview'

const props = defineProps<{ entries: ReviewEntry[]; records: RecordPreview[]; focusId: string; focusRequest: number }>()
const emit = defineEmits<{ supplement: [id: string, content: string]; viewRecord: [id: string] }>()
const query = ref('')
const tag = ref('all')
const market = ref('all')
const day = ref('all')
const selectedId = ref('')
const checkedIds = ref<string[]>([])
const collectionOpen = ref(false)
const supplements = ref<Record<string, string>>({})
const visible = computed(() => props.entries.filter(entry => {
  const matches = relatedRecords(props.records, entry.matchKey)
  const record = matches[0]
  if (!record) return false
  const text = [record.away, record.home, entry.summary, entry.content, ...entry.tags, ...entry.supplements.map(item => item.content)].join(' ').toLocaleLowerCase()
  return (!query.value.trim() || text.includes(query.value.trim().toLocaleLowerCase()))
    && (tag.value === 'all' || entry.tags.includes(tag.value))
    && (market.value === 'all' || matches.some(item => item.market === market.value))
    && (day.value === 'all' || record.day === day.value)
}).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
const selected = computed(() => visible.value.find(entry => entry.id === selectedId.value) ?? visible.value[0])
const selectedRecords = computed(() => selected.value ? relatedRecords(props.records, selected.value.matchKey) : [])
const selectedMatch = computed(() => selectedRecords.value[0])
const days = computed(() => [...new Set(props.entries.flatMap(entry => relatedRecords(props.records, entry.matchKey).map(record => record.day)))].sort().reverse())
const checkedEntries = computed(() => props.entries.filter(entry => checkedIds.value.includes(entry.id)))
const supplement = computed({ get: () => selected.value ? supplements.value[selected.value.id] ?? '' : '', set: value => { if (selected.value) supplements.value[selected.value.id] = value } })
const hasFilters = computed(() => !!query.value || tag.value !== 'all' || market.value !== 'all' || day.value !== 'all')
const allVisibleChecked = computed(() => !!visible.value.length && visible.value.every(entry => checkedIds.value.includes(entry.id)))
function match(entry: ReviewEntry) { return relatedRecords(props.records, entry.matchKey)[0] }
function clearFilters() { query.value = ''; tag.value = 'all'; market.value = 'all'; day.value = 'all' }
function toggleChecked(id: string) { checkedIds.value = checkedIds.value.includes(id) ? checkedIds.value.filter(item => item !== id) : [...checkedIds.value, id] }
function toggleVisible() {
  const ids = visible.value.map(entry => entry.id)
  checkedIds.value = allVisibleChecked.value ? checkedIds.value.filter(id => !ids.includes(id)) : [...new Set([...checkedIds.value, ...ids])]
}
function addSupplement() {
  if (!selected.value || !supplement.value.trim()) return
  emit('supplement', selected.value.id, supplement.value)
  supplements.value[selected.value.id] = ''
}
watch(() => props.focusRequest, () => { if (props.focusId) { clearFilters(); selectedId.value = props.focusId; collectionOpen.value = false } }, { immediate: true })
watch(() => props.entries, entries => {
  checkedIds.value = checkedIds.value.filter(id => entries.some(entry => entry.id === id))
  if (!entries.length) { clearFilters(); selectedId.value = ''; collectionOpen.value = false }
})
</script>

<template>
  <section class="archive-page" aria-labelledby="archive-heading">
    <header class="archive-heading"><div><span class="archive-eyebrow">REVIEW ARCHIVE</span><h2 id="archive-heading">复盘档案 <small>{{ entries.length }} 场比赛</small></h2><p>先留下每场的发现，等你准备好了，再一起回头看。</p></div><div class="archive-stamp"><span>归档 ≠ 策略调整</span><small>是否调整，由你决定</small></div></header>
    <div class="archive-flow"><span class="done"><b>01</b> 写下复盘</span><i>→</i><span class="done"><b>02</b> 按比赛归档</span><i>→</i><span><b>03</b> 集中整理</span><i>→</i><span><b>04</b> 确认策略调整</span></div>
    <div class="archive-toolbar">
      <label class="archive-search"><span aria-hidden="true">⌕</span><input v-model="query" type="search" aria-label="搜索复盘档案" placeholder="搜索球队、复盘内容或标签" /></label>
      <div class="archive-selects"><select v-model="day" aria-label="档案比赛日期"><option value="all">全部比赛日期</option><option v-for="date in days" :key="date" :value="date">{{ date }}</option></select><select v-model="market" aria-label="档案玩法"><option value="all">全部玩法</option><option value="spread">让分</option><option value="total">大小分</option></select><select v-model="tag" aria-label="档案观察标签"><option value="all">全部观察标签</option><option v-for="label in reviewTags" :key="label" :value="label">{{ label }}</option></select><button v-if="hasFilters" @click="clearFilters">重置</button></div>
    </div>
    <div v-if="checkedEntries.length" class="collection-bar"><span>已选 <strong>{{ checkedEntries.length }}</strong> 场复盘 <small>筛选后仍保留已勾选项</small></span><div><button class="plain" @click="checkedIds = []; collectionOpen = false">清空选择</button><button @click="collectionOpen = !collectionOpen">{{ collectionOpen ? '收起整理清单' : '查看整理清单' }} ↗</button></div></div>
    <section v-if="collectionOpen && checkedEntries.length" class="collection-panel" aria-label="复盘整理清单"><div><h3>这次准备一起看的复盘</h3><span>仅整理材料，不会运行分析或修改策略</span></div><ol><li v-for="entry in checkedEntries" :key="entry.id"><strong>{{ match(entry)?.away }} vs {{ match(entry)?.home }}</strong><span>{{ entry.summary }}</span></li></ol><p>后续可以基于这份清单，主动发起汇总分析。原始复盘会保留，策略调整需要另行确认。</p><button disabled>汇总分析 · 后续接入</button></section>
    <div class="archive-layout" :class="{ empty: !visible.length }">
      <section class="archive-list" aria-label="已归档复盘列表">
        <div class="archive-list-heading"><label><input type="checkbox" aria-label="全选当前复盘" :checked="allVisibleChecked" :disabled="!visible.length" @change="toggleVisible" />{{ visible.length }} 份复盘</label><span>最近补充优先</span></div>
        <article v-for="entry in visible" :key="entry.id" class="archive-card" :class="{ active: selected?.id === entry.id }">
          <label class="archive-checkbox"><input type="checkbox" :aria-label="`选择${match(entry)?.away}对${match(entry)?.home}的复盘`" :checked="checkedIds.includes(entry.id)" @change="toggleChecked(entry.id)" /></label>
          <button class="archive-card-content" :aria-pressed="selected?.id === entry.id" @click="selectedId = entry.id">
            <span class="archive-date">{{ match(entry)?.day }} · {{ relatedRecords(records, entry.matchKey).map(record => marketLabels[record.market]).filter((value, index, all) => all.indexOf(value) === index).join(' / ') }}</span>
            <span class="archive-match">{{ match(entry)?.away }} <em>vs</em> {{ match(entry)?.home }}<small>已归档</small></span>
            <strong>{{ entry.summary }}</strong><span class="archive-excerpt">{{ entry.content }}</span>
            <span class="archive-tags"><span v-for="label in entry.tags" :key="label">{{ label }}</span></span>
            <span class="archive-card-footer">更新于 {{ entry.updatedAt }}<span>{{ entry.supplements.length }} 条补充 ↗</span></span>
          </button>
        </article>
        <div v-if="!visible.length" class="archive-empty"><span aria-hidden="true">☷</span><h3>{{ entries.length ? '没有找到匹配的复盘' : '给你的观察，留一个固定位置' }}</h3><p>{{ entries.length ? '试试其他球队、日期或观察标签。' : '回到选场记录，打开已结算比赛，写下复盘后即可在这里归档查看。' }}</p><button v-if="hasFilters" @click="clearFilters">清除筛选</button></div>
      </section>
      <aside v-if="selected && selectedMatch" class="archive-detail" aria-labelledby="archive-detail-heading">
        <div class="detail-top"><span>比赛复盘 · 示例档案</span><span>{{ selected.id }}</span></div>
        <h2 id="archive-detail-heading">{{ selectedMatch.away }} <span>vs</span> {{ selectedMatch.home }}</h2><p class="match-date">{{ selectedMatch.day }} {{ selectedMatch.time }} · 北京时间</p>
        <section class="linked-records"><h3>当时的选择与结果</h3><div v-for="record in selectedRecords" :key="record.id"><span>{{ marketLabels[record.market] }}<strong>{{ record.pick }}</strong><small>{{ record.platform }} · 赔率 {{ record.odds }}</small></span><span><b>{{ resultLabels[record.result] }}</b><button @click="emit('viewRecord', record.id)">查看预测 ↗</button></span></div><p>{{ selectedMatch.score ?? '暂无确认比分' }}</p></section>
        <section class="original-review"><div class="section-heading"><h3>复盘原文</h3><span>归档于 {{ selected.createdAt }}</span></div><h4>{{ selected.summary }}</h4><p>{{ selected.content }}</p><div class="archive-tags"><span v-for="label in selected.tags" :key="label">{{ label }}</span></div><small>这是个人观察；其中的猜测仍需后续材料验证。</small></section>
        <section class="supplement-section"><div class="section-heading"><h3>后续补充</h3><span>{{ selected.supplements.length }} 条</span></div><p v-if="!selected.supplements.length" class="no-supplement">有新发现就追加在这里，保留最初写下的想法。</p><ol v-else><li v-for="item in selected.supplements" :key="item.id"><time>{{ item.createdAt }}</time><p>{{ item.content }}</p></li></ol><label for="review-supplement">补充新的观察</label><textarea id="review-supplement" v-model="supplement" rows="4" maxlength="12000" placeholder="后来发现了什么？可以补充证据，也可以修正原来的猜测。"></textarea><button class="supplement-button" :disabled="!supplement.trim()" @click="addSupplement">追加到示例档案 <span aria-hidden="true">＋</span></button><p class="temporary-hint">本次页面预览内保留；刷新或离页后重置，不写入正式存储。</p></section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.archive-page { margin-top: 27px; min-width: 0; }.archive-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.archive-eyebrow { font-size: 9px; letter-spacing: 2px; color: #93a083; }.archive-heading h2 { font-size: 22px; font-weight: 550; margin: 7px 0; letter-spacing: -.5px; }.archive-heading h2 small { font-size: 10px; font-weight: 400; background: #e9efdf; color: #728763; border-radius: 4px; padding: 3px 7px; margin-left: 9px; }.archive-heading p { font-size: 12px; color: #89967d; margin: 0; }.archive-stamp { border-left: 2px solid #c3cdad; padding-left: 12px; white-space: nowrap; }.archive-stamp span { font-size: 11px; color: #70825e; }.archive-stamp small { display: block; font-size: 10px; color: #a0a88f; margin-top: 4px; }
.archive-flow { display: flex; align-items: center; gap: 17px; padding: 16px 0; margin: 17px 0 20px; border-block: 1px solid #e1e7d8; font-size: 11px; color: #9ba58d; flex-wrap: wrap; }.archive-flow span { display: flex; align-items: center; gap: 8px; }.archive-flow b { font-weight: 400; font-size: 9px; border: 1px solid #dce3d2; border-radius: 50%; padding: 2px 4px; }.archive-flow .done { color: #5f7e4e; }.archive-flow .done b { background: #e8efdf; border-color: #e0e8d5; }.archive-flow i { font-style: normal; color: #b4bea3; }
.archive-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; border: 1px solid #dfe6d6; border-radius: 8px; padding: 12px; background: #fcfdf9; margin-bottom: 16px; }.archive-search { display: flex; align-items: center; gap: 8px; border: 1px solid #dfe6d6; border-radius: 5px; padding: 7px 10px; background: #f7f9f2; width: 300px; max-width: 100%; }.archive-search > span { color: #8da077; font-size: 18px; line-height: 1; }.archive-search input { font: inherit; font-size: 11px; width: 100%; min-width: 0; border: 0; color: #526a43; background: transparent; }.archive-search:focus-within { outline: 2px solid #b58a40; }.archive-search input:focus { outline: none; }.archive-search input::placeholder { color: #9ba68c; }.archive-selects { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }.archive-selects select { font: inherit; font-size: 11px; color: #718762; border: 1px solid #e0e7d7; border-radius: 5px; background: #fbfcf8; padding: 7px; max-width: 100%; }.archive-selects > button { color: #82936c; font-size: 11px; border: 0; background: transparent; padding: 6px; }
.archive-layout { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); gap: 20px; align-items: start; }.archive-layout.empty { grid-template-columns: 1fr; }.archive-list { border: 1px solid #dfe6d5; border-radius: 8px; background: #fcfdf9; min-width: 0; overflow: hidden; }.archive-list-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 15px; border-bottom: 1px solid #e6ebdf; color: #8c9a7d; font-size: 10px; }.archive-list-heading label { display: flex; align-items: center; gap: 8px; }input[type=checkbox] { accent-color: #567343; cursor: pointer; }
.archive-card { display: flex; gap: 6px; border-bottom: 1px solid #e7ecdf; padding: 17px 15px; position: relative; }.archive-card:last-child { border-bottom: 0; }.archive-card.active { background: #eff4e7; }.archive-card.active::before { content: ''; position: absolute; top: 20px; bottom: 20px; left: 0; width: 3px; background: #7d9a60; border-radius: 0 3px 3px 0; }.archive-checkbox { flex-shrink: 0; padding-top: 2px; }.archive-card-content { border: 0; padding: 0 0 0 3px; color: inherit; background: transparent; text-align: left; width: 100%; min-width: 0; }.archive-date { font-size: 10px; color: #8e9c80; }.archive-match { display: flex; align-items: center; gap: 7px; font-size: 16px; font-weight: 550; margin: 8px 0 15px; }.archive-match em { font-size: 10px; font-style: normal; color: #a8b295; font-weight: 400; }.archive-match small { margin-left: auto; font-size: 9px; color: #7e9368; font-weight: 400; padding: 2px 6px; border: 1px solid #dce6cd; border-radius: 4px; white-space: nowrap; }.archive-card-content > strong { display: block; font-size: 13px; font-weight: 550; line-height: 1.8; }.archive-excerpt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #8b977d; font-size: 11px; line-height: 1.9; margin-top: 6px; overflow-wrap: anywhere; }.archive-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 12px; }.archive-tags span { border: 1px solid #dde6d0; border-radius: 4px; color: #879871; font-size: 9px; padding: 2px 6px; }.archive-card-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 5px; color: #9aa58c; font-size: 9px; margin-top: 16px; }
.archive-detail { padding: 22px; border: 1px solid #dfe6d5; border-radius: 8px; background: #fcfdf9; min-width: 0; }.detail-top { display: flex; justify-content: space-between; gap: 8px; font-size: 9px; color: #9aa78b; }.archive-detail > h2 { font-size: 21px; font-weight: 550; margin: 18px 0 4px; letter-spacing: -.5px; }.archive-detail > h2 span { font-size: 12px; color: #abb799; font-weight: 400; margin-inline: 5px; }.match-date { font-size: 10px; color: #94a185; margin: 0 0 20px; }.linked-records { background: #f0f5e8; border: 1px solid #e3ead9; padding: 14px; border-radius: 6px; }.linked-records h3 { font-size: 10px; color: #839770; font-weight: 400; margin: 0 0 12px; }.linked-records > div { display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; }.linked-records > div > span { color: #8a9b77; font-size: 10px; }.linked-records strong { display: block; font-size: 14px; font-weight: 550; color: #4c693b; margin-top: 3px; }.linked-records small { display: block; color: #92a180; font-size: 9px; margin-top: 4px; }.linked-records b { display: block; color: #7f946b; font-weight: 400; font-size: 11px; text-align: right; }.linked-records button { border: 0; padding: 4px 0; font-size: 10px; color: #7d936a; background: transparent; }.linked-records > p { margin: 13px 0 0; padding-top: 10px; border-top: 1px solid #dce7ce; font-size: 11px; color: #8c9d78; }
.original-review, .supplement-section { margin-top: 22px; padding-top: 18px; border-top: 1px solid #e5eadc; }.section-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; }.section-heading h3 { font-size: 12px; font-weight: 550; margin: 0; }.section-heading > span { font-size: 9px; color: #9ba68c; }.original-review h4 { font-size: 13px; font-weight: 500; margin: 14px 0 9px; line-height: 1.8; }.original-review > p, .supplement-section li p { white-space: pre-wrap; overflow-wrap: anywhere; color: #7c8e6b; font-size: 12px; line-height: 2; margin: 0; }.original-review > small { display: block; font-size: 10px; color: #a49b7c; margin-top: 14px; }.no-supplement { font-size: 11px; color: #9ba68d; line-height: 1.9; margin: 12px 0 18px; }.supplement-section ol { list-style: none; padding-left: 12px; border-left: 1px solid #d9e4ca; margin: 15px 0 20px; }.supplement-section li { margin-bottom: 15px; }.supplement-section time { color: #a0ab91; font-size: 9px; }.supplement-section li p { font-size: 11px; }.supplement-section > label { display: block; font-size: 11px; color: #81966d; margin: 14px 0 7px; }.supplement-section textarea { font: inherit; font-size: 11px; line-height: 1.9; width: 100%; max-width: 100%; min-height: 100px; resize: vertical; border: 1px solid #dce5d1; padding: 11px; color: #64814f; background: #f8faf3; border-radius: 6px; }.supplement-section textarea::placeholder { color: #a4af94; }.supplement-button { display: flex; justify-content: space-between; gap: 10px; width: 100%; font-size: 11px; background: #35553a; border: 1px solid #35553a; border-radius: 6px; color: #fff; padding: 10px 12px; margin-top: 10px; }.temporary-hint { font-size: 10px; color: #a2ad92; line-height: 1.8; margin: 9px 0 0; }
.collection-bar { background: #e9f0df; border: 1px solid #d8e3c9; border-radius: 6px; padding: 10px 13px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 15px; color: #6c8655; font-size: 11px; }.collection-bar small { color: #98a983; font-size: 9px; margin-left: 9px; }.collection-bar > div { display: flex; align-items: center; gap: 12px; }.collection-bar button, .collection-panel button { background: #42613d; border: 0; border-radius: 5px; color: #fff; font-size: 11px; padding: 7px 12px; }.collection-bar .plain { color: #80946b; background: transparent; padding: 4px 0; }.collection-panel { border: 1px solid #dce5cf; padding: 18px; border-radius: 8px; margin-bottom: 18px; background: #f5f8ed; }.collection-panel > div { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }.collection-panel h3 { margin: 0; font-size: 13px; font-weight: 500; }.collection-panel > div > span { font-size: 10px; color: #9baa8b; }.collection-panel ol { padding-left: 20px; }.collection-panel li { font-size: 11px; color: #80936b; padding-left: 5px; margin: 12px 0; }.collection-panel li strong { font-weight: 500; margin-right: 15px; }.collection-panel li > span { color: #8d9d7b; }.collection-panel > p { font-size: 11px; color: #97a587; line-height: 1.9; }
.archive-empty { text-align: center; padding: 65px 20px; }.archive-empty > span { font-size: 32px; color: #9aae84; }.archive-empty h3 { font-size: 17px; font-weight: 500; margin: 15px 0 10px; }.archive-empty p { font-size: 12px; color: #96a386; max-width: 400px; margin: 0 auto; line-height: 1.9; }.archive-empty button { border: 1px solid #d3e0c4; background: transparent; border-radius: 6px; color: #728b5d; padding: 7px 12px; font-size: 11px; margin-top: 20px; }
@media (max-width: 1100px) { .archive-layout { grid-template-columns: minmax(0, 1fr); }.archive-toolbar { flex-direction: column; }.archive-search { width: 100%; } }
@media (max-width: 700px) { .archive-heading { align-items: flex-start; }.archive-heading h2 { font-size: 21px; }.archive-heading h2 small { font-size: 9px; margin-left: 4px; }.archive-heading p { font-size: 11px; line-height: 1.9; }.archive-stamp { display: none; }.archive-flow { gap: 8px; font-size: 9px; }.archive-flow b { display: none; }.archive-selects { gap: 5px; }.archive-selects select { font-size: 10px; padding: 7px 5px; }.archive-card { padding: 15px 12px; }.archive-match { font-size: 15px; }.archive-detail { padding: 18px; }.detail-top { font-size: 8px; }.archive-detail > h2 { font-size: 20px; }.collection-bar { align-items: flex-start; }.collection-bar small { display: block; margin: 4px 0 0; }.collection-bar > div { margin-left: auto; }.collection-panel { padding: 14px; }.collection-panel li > span { display: block; margin-top: 4px; }.archive-page { margin-top: 20px; } }
</style>
