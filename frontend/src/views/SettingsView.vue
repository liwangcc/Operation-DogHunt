<script setup lang="ts">
// 设置：真实的运行状态读数（后端、模型、盘口快照、浏览器）、保存在本机的显示偏好，以及需要后端支持、暂时只能看的规则。
import { computed, onMounted, ref } from 'vue'
import { ago, dateTime, price } from '@/components/odds/format'
import { demoEnabled, setDemo } from '@/stores/demo'
import { preferences, resetPreferences, storageAvailable } from '@/stores/preferences'
import { board, boardBusy, boardStale, checkHealth, checkModel, health, loadBoard, model, now } from '@/stores/system'

const EXAMPLE_PRICE = 1.91

const webgl = ref<boolean | null>(null)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 真实快照里出现过的报价平台，按名称排序。 */
const bookmakers = computed(() => {
  const seen = new Map<string, string>()
  for (const event of board.data?.events ?? []) for (const book of event.bookmakers) seen.set(book.key, book.title)
  return Array.from(seen, ([key, title]) => ({ key, title })).sort((a, b) => a.title.localeCompare(b.title))
})
/** 偏好里记着、但当前快照里没有的平台，仍然列出来，免得悄悄丢掉。 */
const missingBook = computed(() => (preferences.bookmaker && !bookmakers.value.some((book) => book.key === preferences.bookmaker) ? preferences.bookmaker : ''))

const checks = computed(() => [
  {
    key: 'health',
    name: '后端连接',
    tone: health.status === 'online' ? 'ok' : health.status === 'checking' ? 'wait' : 'bad',
    state: health.status === 'online' ? '已连接' : health.status === 'checking' ? '检查中' : '未连接',
    detail: health.info ? `${health.info.app} v${health.info.version} · ${health.info.environment} · 往返 ${health.latencyMs} 毫秒` : health.message,
    checkedAt: health.checkedAt,
    note: '只代表后端能回应，不代表模型、盘口或数据库可用。',
    action: '重新检查',
    busy: health.status === 'checking',
    run: checkHealth,
  },
  {
    key: 'model',
    name: '模型配置',
    tone: model.checking ? 'wait' : model.status?.configured ? 'ok' : model.error ? 'bad' : 'off',
    state: model.checking ? '读取中' : model.status?.configured ? '已配置' : model.error ? '读取失败' : '未配置',
    detail: model.status?.configured ? `${model.status.model} · 单次最长等待 ${model.status.timeout_seconds} 秒` : model.error || '后端没有可用的模型配置，聊天暂时不能提问。',
    checkedAt: model.checkedAt,
    note: '只看是否已配置，不是在线探测；检查不会调用模型，也不消耗额度。',
    action: '检查配置',
    busy: model.checking,
    run: checkModel,
  },
  {
    key: 'board',
    name: '盘口快照',
    tone: board.loading ? 'wait' : !board.data?.fetched_at ? (board.error ? 'bad' : 'off') : boardStale.value ? 'warn' : 'ok',
    state: board.loading ? '读取中' : !board.data?.fetched_at ? (board.error ? '读取失败' : '尚无数据') : boardStale.value ? '待更新' : '已保存',
    detail: board.data?.fetched_at
      ? `${dateTime(board.data.fetched_at)} 采集 · ${board.data.events.length} 场比赛 · ${bookmakers.value.length} 家平台${board.data.quota?.remaining != null ? ` · 接口额度剩余 ${board.data.quota.remaining}` : ''}`
      : board.error || board.data?.message || '后端还没有保存的盘口快照。',
    checkedAt: 0,
    note: '读取的是后端保存的最新快照，不向供应商取新数据；更新盘口请到比赛与盘口页手动操作。',
    action: '重新读取',
    busy: boardBusy.value,
    run: loadBoard,
  },
])

function recheckAll(): void {
  void checkHealth()
  void checkModel()
  void loadBoard()
}

onMounted(() => {
  try {
    webgl.value = !!document.createElement('canvas').getContext('webgl')
  } catch {
    webgl.value = false
  }
})
</script>

<template>
  <section class="page settings" aria-labelledby="settings-heading">
    <header class="page-head reveal">
      <div>
        <p class="overline">Station 06 · Control Panel</p>
        <h1 id="settings-heading" class="page-title">设置</h1>
        <p class="page-sub">查看运行状态，调整这台设备上的显示方式。数据源、模型和记录规则由后端决定，目前只能查看。</p>
      </div>
    </header>

    <div class="columns">
      <div class="column">
        <article class="panel panel--ticks panel-pad reveal" style="--i: 1" aria-labelledby="status-heading">
          <header class="panel-head">
            <h2 id="status-heading" class="section-title">运行状态<small>都是真实读数</small></h2>
            <button type="button" class="btn btn--sm" @click="recheckAll">全部重新检查</button>
          </header>
          <ul class="checks">
            <li v-for="check in checks" :key="check.key">
              <i class="dot" :class="[`tone-${check.tone}`, { 'dot--live': check.tone === 'ok' }]" aria-hidden="true"></i>
              <div class="check-main">
                <p class="check-name">{{ check.name }}<strong :class="`tone-${check.tone}`">{{ check.state }}</strong><time v-if="check.checkedAt" class="num">{{ ago(check.checkedAt, now) }}检查</time></p>
                <p class="check-detail num">{{ check.detail }}</p>
                <p class="check-note">{{ check.note }}</p>
              </div>
              <button type="button" class="btn btn--sm btn--quiet" :disabled="check.busy" @click="check.run()">{{ check.action }}</button>
            </li>
            <li>
              <i class="dot" :class="webgl === false ? 'tone-warn' : 'tone-ok'" aria-hidden="true"></i>
              <div class="check-main">
                <p class="check-name">这个浏览器</p>
                <p class="check-detail">3D 画面{{ webgl === null ? '检查中' : webgl ? '可用' : '不可用（启动页和动态背景会退回静态画面）' }} · 本地存储{{ storageAvailable ? '可用' : '不可用（偏好只在本次打开期间有效）' }} · {{ reducedMotion ? '系统已开启“减少动态效果”' : '动效正常显示' }}</p>
              </div>
            </li>
          </ul>
        </article>

        <article class="panel panel-pad reveal" style="--i: 3" aria-labelledby="pending-heading">
          <header class="panel-head"><h2 id="pending-heading" class="section-title">由后端决定的规则<small>暂时只能查看</small></h2></header>
          <ul class="locked">
            <li>
              <div><h3>数据源与更新频率</h3><p>盘口目前只能手动更新一次；定时同步和更新频率要等后台任务实现后才能设置。</p></div>
              <span class="locked-value">手动更新</span><span class="tag tag--warn">待后端支持</span>
            </li>
            <li>
              <div><h3>统一的参考平台</h3><p>正式预测需要固定使用一家平台的报价，前后才好比较。现在只有右侧“默认报价平台”这个本机偏好。</p></div>
              <span class="locked-value">未选定</span><span class="tag tag--warn">待后端支持</span>
            </li>
            <li>
              <div><h3>模型、超时与重试</h3><p>模型名称和等待时限写在后端配置里，页面只读。当前不自动重试；重试上限和单任务调用上限待实现。</p></div>
              <span class="locked-value num">{{ model.status?.configured ? `${model.status.model} · ${model.status.timeout_seconds} 秒` : '未配置' }}</span><span class="tag">只读</span>
            </li>
            <li>
              <div><h3>额度与费用提醒</h3><p>记录每次调用的用量，设置单任务和每天的上限，接近上限时提醒。</p></div>
              <span class="locked-value">未设置</span><span class="tag tag--warn">待后端支持</span>
            </li>
            <li>
              <div><h3>正式记录规则</h3><p>什么时候把一次分析锁定为正式预测：手动标记，还是开赛前定时锁定。锁定后不能被新分析覆盖。</p></div>
              <span class="locked-value">未确定</span><span class="tag tag--warn">待后端支持</span>
            </li>
            <li>
              <div><h3>访问密钥</h3><p>盘口和模型的密钥只保存在后端，不会出现在页面、聊天、记忆或普通日志里，这里也不提供填写入口。</p></div>
              <span class="locked-value">不在页面显示</span><span class="tag tag--info">仅后端</span>
            </li>
          </ul>
        </article>
      </div>

      <div class="column">
        <article class="panel panel-pad reveal" style="--i: 2" aria-labelledby="prefs-heading">
          <header class="panel-head">
            <h2 id="prefs-heading" class="section-title">显示偏好<small>只保存在这台设备的浏览器里</small></h2>
            <button type="button" class="btn btn--sm btn--quiet" @click="resetPreferences">恢复默认</button>
          </header>
          <ul class="prefs">
            <li>
              <div><h3>赔率格式</h3><p>内部一律按十进制保存和计算，这里只改显示。同一个报价现在显示为 <strong class="num">{{ price(EXAMPLE_PRICE) }}</strong>（十进制 {{ EXAMPLE_PRICE }}，香港盘是净赢部分）。</p></div>
              <div class="seg" role="group" aria-label="赔率格式">
                <button type="button" :aria-pressed="preferences.oddsFormat === 'decimal'" @click="preferences.oddsFormat = 'decimal'">十进制</button>
                <button type="button" :aria-pressed="preferences.oddsFormat === 'hk'" @click="preferences.oddsFormat = 'hk'">香港盘</button>
              </div>
            </li>
            <li>
              <div><h3>默认报价平台</h3><p>比赛卡片默认显示哪家平台的报价；某场比赛没有这家时，用数据源返回的第一家。只是默认显示，不代表推荐。</p></div>
              <select v-model="preferences.bookmaker" class="select" aria-label="默认报价平台" :disabled="!bookmakers.length && !missingBook">
                <option value="">跟随数据源（第一家）</option>
                <option v-for="book in bookmakers" :key="book.key" :value="book.key">{{ book.title }}</option>
                <option v-if="missingBook" :value="missingBook">{{ missingBook }}（当前快照里没有）</option>
              </select>
              <p v-if="!bookmakers.length" class="pref-hint">读到真实的盘口快照后，这里会列出可选的平台。</p>
            </li>
            <li>
              <div><h3>动态背景</h3><p>内页背后那片落雨的城市夜景。关闭后换成静态底图；系统开启“减少动态效果”时只画静止的一帧。</p></div>
              <div class="seg" role="group" aria-label="动态背景">
                <button type="button" :aria-pressed="preferences.backdrop === 'on'" @click="preferences.backdrop = 'on'">开</button>
                <button type="button" :aria-pressed="preferences.backdrop === 'off'" @click="preferences.backdrop = 'off'">关</button>
              </div>
            </li>
            <li>
              <div><h3>演示数据</h3><p>预测记录、效果统计、长期记忆还没有后端接口；打开时用虚构的“沙盘联赛”预览这些页面，比赛页在没有真实比赛时也会用它顶上。真实数据存在时永远优先显示真实数据。</p></div>
              <div class="seg" role="group" aria-label="演示数据">
                <button type="button" :aria-pressed="demoEnabled" @click="setDemo(true)">没有真实数据时显示</button>
                <button type="button" :aria-pressed="!demoEnabled" @click="setDemo(false)">关闭</button>
              </div>
            </li>
            <li>
              <div><h3>时区</h3><p>所有时间按北京时间显示；内部统一用国际标准时间保存。</p></div>
              <span class="locked-value">北京时间 UTC+8</span><span class="tag">固定</span>
            </li>
          </ul>
        </article>

        <article class="panel panel-pad reveal about" style="--i: 4" aria-labelledby="about-heading">
          <header class="panel-head"><h2 id="about-heading" class="section-title">关于</h2></header>
          <p class="about-name"><span>OPERATION</span>DOGHUNT</p>
          <p class="about-text">以聊天为入口的 NBA 分析项目，个人使用的分析与模拟验证工具，不涉及真实投注。</p>
          <div class="about-actions">
            <RouterLink to="/welcome" class="btn">返回 3D 指挥室</RouterLink>
            <span class="about-keys"><kbd class="kbd">Ctrl</kbd><kbd class="kbd">K</kbd> 快速前往任意工位</span>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.columns { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.column { display: grid; gap: 16px; min-width: 0; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }

.checks, .locked, .prefs { margin: 0; padding: 0; list-style: none; }
.checks li { display: flex; align-items: flex-start; gap: 14px; padding: 16px 0; border-bottom: 1px solid var(--line); }
.checks li:last-child { border-bottom: 0; padding-bottom: 2px; }
.checks .dot { margin-top: 8px; }
.check-main { flex: 1; min-width: 0; }
.check-name { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 0; font-size: 15px; font-weight: 600; letter-spacing: .08em; }
.check-name strong { font-size: 13px; font-weight: 500; letter-spacing: .06em; }
.check-name time { font-size: 12px; font-weight: 400; letter-spacing: 0; color: var(--text-3); }
.check-detail { margin: 4px 0 0; font-size: 13px; line-height: 1.7; color: var(--text-2); overflow-wrap: anywhere; }
.check-note { margin: 3px 0 0; font-size: 12px; line-height: 1.7; color: var(--text-3); }
.tone-ok { color: var(--green); }
.tone-warn { color: var(--amber); }
.tone-bad { color: var(--red); }
.tone-off { color: var(--text-3); }
.tone-wait { color: var(--amber); }

.locked li, .prefs li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px 14px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--line); }
.locked li:last-child, .prefs li:last-child { border-bottom: 0; padding-bottom: 2px; }
.locked h3, .prefs h3 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: .08em; }
.locked p, .prefs li > div > p { margin: 4px 0 0; font-size: 12px; line-height: 1.75; color: var(--text-3); }
.prefs li > div > p strong { font-size: 14px; font-style: italic; font-weight: 800; color: var(--cyan); }
.locked-value { font-size: 13px; color: var(--text-2); white-space: nowrap; }
.prefs li > .seg, .prefs li > .select { grid-column: 2 / -1; justify-self: end; }
.prefs .select { width: 220px; }
.pref-hint { grid-column: 1 / -1; margin: 0; font-size: 12px; color: var(--amber); }

.about-name { margin: 10px 0 0; font-size: 34px; font-style: italic; font-weight: 800; letter-spacing: -.01em; line-height: 1; color: transparent; background: linear-gradient(180deg, #fff 10%, #b9c8f6 100%); -webkit-background-clip: text; background-clip: text; }
.about-name span { display: block; margin-bottom: 4px; font-size: 13px; font-weight: 300; letter-spacing: .14em; color: var(--text-2); -webkit-text-fill-color: var(--text-2); }
.about-text { margin: 12px 0 0; font-size: 13px; line-height: 1.8; color: var(--text-2); }
.about-actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
.about-keys { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-3); }
.about-keys .kbd:last-of-type { margin-right: 6px; }

@media (max-width: 1100px) {
  .columns { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 700px) {
  .locked li, .prefs li { grid-template-columns: minmax(0, 1fr) auto; }
  .locked li > div, .prefs li > div { grid-column: 1 / -1; }
  .prefs li > .seg, .prefs li > .select { grid-column: 1 / -1; justify-self: start; }
  .prefs .select { width: 100%; }
  .checks li { flex-wrap: wrap; }
  .checks li > .btn { margin-left: 21px; }
}
</style>
