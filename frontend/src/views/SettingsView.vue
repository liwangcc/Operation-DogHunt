<script setup lang="ts">
import { computed, ref } from 'vue'
import { dateTime, price } from '@/components/odds/format'
import { preferences, resetPreferences, storageAvailable } from '@/stores/preferences'
import { board, boardStale, checkHealth, checkModel, health, loadBoard, model } from '@/stores/system'

const refreshing = ref(false)
const browserOnline = ref(navigator.onLine)
const notice = ref('')
const bookmakers = computed(() => [...new Map((board.data?.events ?? []).flatMap(event => event.bookmakers).map(book => [book.key, book.title])).entries()])
const missingBookmaker = computed(() => !!preferences.bookmaker && !bookmakers.value.some(([key]) => key === preferences.bookmaker))
async function recheck() {
  refreshing.value = true
  try { await Promise.all([checkHealth(), checkModel(), loadBoard()]); browserOnline.value = navigator.onLine }
  finally { refreshing.value = false }
}
function restore() { resetPreferences(); notice.value = '已恢复默认显示偏好。' }
</script>

<template>
  <section class="page settings-page">
    <header class="page-head"><div><p class="overline">CONTROL PANEL / WORKSPACE</p><h1 class="page-title">设置</h1><p class="page-sub">检查运行状态，把这台设备上的显示方式调顺手。</p></div><button class="btn" :disabled="refreshing" @click="recheck">{{ refreshing ? '检查中…' : '重新检查全部状态' }}</button></header>
    <section aria-labelledby="runtime-title"><h2 id="runtime-title" class="section-title">运行状态 <small>当前连接与已保存快照</small></h2><div class="status-grid">
      <article class="panel panel-pad"><div class="status-head"><span class="label">后端连接</span><i class="dot" :class="health.status === 'online' ? 'pos' : 'neg'"></i></div><strong>{{ health.status === 'online' ? '已连接' : health.status === 'checking' ? '检查中' : '未连接' }}</strong><p>{{ health.info ? `v${health.info.version} · ${health.latencyMs} ms` : health.message }}</p><button class="btn btn--sm" :disabled="health.status === 'checking'" @click="checkHealth">检查连接</button></article>
      <article class="panel panel-pad"><div class="status-head"><span class="label">模型配置</span><i class="dot" :class="model.status?.configured ? 'pos' : 'text-3'"></i></div><strong>{{ model.status?.model ?? '尚未配置' }}</strong><p>{{ model.error || (model.status?.configured ? '已配置 · 不代表模型在线' : '等待后台配置') }}</p><button class="btn btn--sm" :disabled="model.checking" @click="checkModel">读取配置状态</button></article>
      <article class="panel panel-pad"><div class="status-head"><span class="label">盘口快照</span><i class="dot" :class="boardStale ? 'stale' : board.data?.events.length ? 'pos' : 'text-3'"></i></div><strong>{{ board.data?.events.length ?? 0 }} 场比赛</strong><p>{{ board.data?.fetched_at ? `${dateTime(board.data.fetched_at)} · ${boardStale ? '待更新' : '已保存'}` : board.error || '尚无保存的快照' }}</p><button class="btn btn--sm" :disabled="board.loading || board.refreshing" @click="loadBoard">重读已保存快照</button></article>
      <article class="panel panel-pad"><div class="status-head"><span class="label">浏览器</span><i class="dot" :class="browserOnline ? 'pos' : 'neg'"></i></div><strong>{{ browserOnline ? '网络已连接' : '当前离线' }}</strong><p>{{ storageAvailable ? '可使用本地偏好存储' : '本地存储不可用' }}</p><small>网络状态由浏览器报告</small></article>
    </div><p class="section-note">这些检查只读取网站后台状态和已保存快照，不发送 AI 问题，也不向盘口供应商取新数据。</p></section>
    <section class="panel panel-pad preferences" aria-labelledby="preferences-title"><div class="section-head"><h2 id="preferences-title" class="section-title">本机显示偏好</h2><span class="tag tag--info">修改即时生效</span></div><p class="section-note">{{ storageAvailable ? '偏好自动保存在这台设备的浏览器中，刷新后保留。' : '浏览器禁止本地存储，偏好只在本次打开期间生效。' }}</p>
      <div class="setting-row"><div><label for="odds-format">赔率显示</label><p>只改变读数格式，计算始终使用十进制赔率。</p></div><div class="setting-control"><select id="odds-format" v-model="preferences.oddsFormat" class="select"><option value="decimal">十进制</option><option value="hk">香港盘</option></select><span class="format-example num">示例 {{ price(1.91) }}</span></div></div>
      <div class="setting-row"><div><label for="default-bookmaker">默认报价平台</label><p>比赛没有该平台时，使用数据源返回的第一家；不会混合各家报价。</p></div><select id="default-bookmaker" v-model="preferences.bookmaker" class="select"><option value="">沿用数据源第一家</option><option v-if="missingBookmaker" :value="preferences.bookmaker">已保存的平台（当前快照未包含）</option><option v-for="[key, title] in bookmakers" :key="key" :value="key">{{ title }}</option></select></div>
      <div class="setting-row"><div><label for="backdrop">动态背景</label><p>控制内页的雨夜背景；系统减少动态效果设置优先。</p></div><select id="backdrop" v-model="preferences.backdrop" class="select"><option value="on">开启</option><option value="off">关闭</option></select></div>
      <div class="setting-row"><div><label for="demo-mode">演示数据</label><p>统一控制记录、统计和记忆预览；比赛页有真实数据时优先显示真实数据。</p></div><select id="demo-mode" v-model="preferences.demo" class="select"><option value="auto">无真实数据时展示演示</option><option value="off">只显示真实状态</option></select></div>
      <div class="preference-footer"><button class="btn" @click="restore">恢复默认显示偏好</button><span role="status">{{ notice }}</span></div>
    </section>
    <section class="panel panel-pad backend-rules" aria-labelledby="rules-title"><div class="section-head"><h2 id="rules-title" class="section-title">由后台决定的规则</h2><span class="tag">只读</span></div><dl>
      <div><dt>数据来源与更新</dt><dd>The Odds API；在比赛页手动更新，新取数会消耗供应商额度。</dd></div>
      <div><dt>模型与等待上限</dt><dd>{{ model.status?.model ?? '未配置' }} · {{ model.status ? `${model.status.timeout_seconds} 秒` : '等待后台状态' }}。模型请求失败后不自动重试。</dd></div>
      <div><dt>调用额度</dt><dd>预算提醒与统一用量管理尚未接入。</dd></div>
      <div><dt>正式记录</dt><dd>预测保存、赛果接入和正式结算尚未实现。演示不会写成真实战绩。</dd></div>
      <div><dt>API 密钥</dt><dd>仅在网站后台配置，本页不读取或展示密钥。</dd></div>
    </dl></section>
  </section>
</template>

<style scoped>
.status-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }.status-grid article { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }.status-head { display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 10px; }.status-grid strong { margin-top: 18px; font-size: 20px; overflow-wrap: anywhere; }.status-grid p { margin: 8px 0 18px; color: var(--text-3); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }.status-grid button, .status-grid small { margin-top: auto; }.status-grid small { font-size: 11px; color: var(--text-3); }.stale { color: var(--amber); }
.section-note { margin: 12px 0 22px; font-size: 12px; line-height: 1.8; color: var(--text-3); }.section-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }.preferences, .backend-rules { margin-top: 22px; }.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 22px 0; border-top: 1px solid var(--line); }.setting-row > div:first-child { flex: 1; min-width: 0; }.setting-row label { font-size: 14px; font-weight: 600; letter-spacing: .06em; }.setting-row p { margin: 5px 0 0; max-width: 60ch; font-size: 12px; color: var(--text-3); }.setting-row > select, .setting-control { width: 245px; max-width: 100%; flex-shrink: 0; }.setting-control { display: flex; align-items: center; gap: 12px; }.setting-control select { flex: 1; min-width: 0; }.format-example { font-size: 12px; color: var(--cyan); white-space: nowrap; }.preference-footer { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; padding-top: 16px; border-top: 1px solid var(--line); }.preference-footer span { font-size: 12px; color: var(--green); }
.backend-rules dl { margin: 22px 0 0; }.backend-rules dl > div { display: grid; grid-template-columns: 150px 1fr; gap: 18px; padding: 14px 0; border-top: 1px solid var(--line); font-size: 13px; }.backend-rules dt { color: var(--text-3); }.backend-rules dd { margin: 0; line-height: 1.8; }
@media (max-width: 1100px) { .status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .status-grid { gap: 10px; }.status-grid article { padding: 16px 12px; }.status-grid strong { font-size: 17px; }.status-grid .label { font-size: 10px; }.status-grid .btn { white-space: normal; height: auto; min-height: 30px; }.setting-row { flex-direction: column; align-items: stretch; gap: 12px; }.setting-row > select, .setting-control { width: 100%; }.backend-rules dl > div { grid-template-columns: 1fr; gap: 5px; } }
</style>
