<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ReviewDraft, ReviewEntry } from './preview'
import { reviewTags } from './preview'

const props = defineProps<{ archived?: ReviewEntry; canReview: boolean; matchId: string }>()
const emit = defineEmits<{ archive: [draft: ReviewDraft]; openArchive: [] }>()
const drafts = ref<Record<string, ReviewDraft>>({})
watch(() => props.matchId, id => {
  if (!drafts.value[id]) drafts.value[id] = { summary: '', content: '', tags: [] }
}, { immediate: true })
const draft = computed(() => drafts.value[props.matchId]!)
const ready = computed(() => !!draft.value.content.trim())
function toggleTag(tag: string) {
  draft.value.tags = draft.value.tags.includes(tag) ? draft.value.tags.filter(item => item !== tag) : [...draft.value.tags, tag]
}
</script>

<template>
  <section class="review-composer" aria-label="我的复盘归档">
    <div class="composer-heading"><h3><span>03</span> 我的复盘</h3><small>{{ archived ? '已归档 · 示例' : '写下观察，再慢慢整理' }}</small></div>
    <template v-if="archived">
      <div class="archived-note"><span>已收入这场比赛的复盘档案</span><strong>{{ archived.summary }}</strong><p>{{ archived.content }}</p></div>
      <button class="archive-action secondary" @click="emit('openArchive')">查看档案 / 追加补充 <span aria-hidden="true">↗</span></button>
    </template>
    <template v-else-if="canReview">
      <label for="review-summary">一句话记下这次发现 <small>选填</small></label>
      <input id="review-summary" v-model="draft.summary" maxlength="80" placeholder="例如：得分表现之外，还要看比赛节奏" />
      <label for="review-content">复盘原文 <small>必填</small></label>
      <textarea id="review-content" v-model="draft.content" rows="5" maxlength="12000" placeholder="哪里判断对了？漏看了什么？哪些只是猜测，还需要继续观察？"></textarea>
      <span class="field-caption">给这次观察加个标签 <small>可多选</small></span>
      <div class="tag-options" role="group" aria-label="复盘标签"><button v-for="tag in reviewTags" :key="tag" :class="{ active: draft.tags.includes(tag) }" :aria-pressed="draft.tags.includes(tag)" @click="toggleTag(tag)">{{ tag }}</button></div>
      <button class="archive-action" :disabled="!ready" @click="emit('archive', { ...draft, tags: [...draft.tags] })">归档到示例档案 <span aria-hidden="true">↗</span></button>
    </template>
    <div v-else class="waiting-note">等待赛果或结算依据齐全后，再写赛后复盘。<p>你可以先打开复盘档案，查看已有的示例。</p><button @click="emit('openArchive')">打开复盘档案 ↗</button></div>
    <p class="preview-note">当前为流程预览；新归档和补充只保留在本页，刷新或离开后重置。</p>
  </section>
</template>

<style scoped>
.review-composer { grid-column: 1 / -1; margin-top: 21px; padding-top: 18px; border-top: 1px solid #e7ecdf; min-width: 0; }
.composer-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }.composer-heading h3 { font-size: 12px; font-weight: 550; margin: 0; }.composer-heading h3 > span { font-size: 9px; font-weight: 400; color: #a4ad97; margin-right: 6px; }.composer-heading small { font-size: 9px; color: #84967a; }
label, .field-caption { display: block; font-size: 11px; color: #607653; margin: 12px 0 6px; }label small, .field-caption small { color: #96a38b; font-size: 9px; margin-left: 5px; }
input, textarea { width: 100%; min-width: 0; font: inherit; font-size: 11px; line-height: 1.9; color: #4b6745; padding: 10px; border: 1px solid #dce5d4; border-radius: 6px; background: #f9fbf6; }input::placeholder, textarea::placeholder { color: #9ba68f; }textarea { resize: vertical; min-height: 120px; }
.tag-options { display: flex; flex-wrap: wrap; gap: 6px; }.tag-options button { font: inherit; font-size: 10px; border: 1px solid #dde5d7; border-radius: 4px; background: transparent; color: #7d8d72; padding: 4px 7px; }.tag-options button.active { background: #e8f0df; color: #49673a; border-color: #b6c9a7; }
.archive-action { display: flex; justify-content: space-between; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; margin-top: 17px; background: #31543d; color: #fff; border: 1px solid #31543d; border-radius: 6px; font-size: 11px; }.archive-action.secondary { color: #4f7044; border-color: #ccd9c1; background: #f0f5e9; }
.archived-note { border-left: 2px solid #a4bc8e; padding: 3px 0 3px 12px; }.archived-note > span { color: #8c9b7e; font-size: 9px; }.archived-note strong { display: block; font-size: 12px; font-weight: 500; margin: 6px 0; }.archived-note p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; color: #7b8b6e; line-height: 1.9; margin: 0; }
.preview-note { color: #98a58c; font-size: 10px; line-height: 1.8; margin: 10px 0 0; }.waiting-note { padding: 12px; background: #f4f6ef; font-size: 11px; color: #7b8c6e; line-height: 1.9; border-radius: 6px; }.waiting-note p { margin: 5px 0; font-size: 10px; }.waiting-note button { border: 0; background: transparent; color: #527245; font-size: 11px; padding: 4px 0; }
</style>
