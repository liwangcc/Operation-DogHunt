<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

const sections = [
  { id: 'general', title: '基础偏好', subtitle: '显示与阅读习惯', icon: 'sliders', description: '让每一次查看，都符合你的习惯。' },
  { id: 'data', title: '数据与盘口', subtitle: '来源、平台与更新', icon: 'database', description: '管理分析时参考的数据与报价。' },
  { id: 'model', title: 'AI 与调用', subtitle: '模型、超时与额度', icon: 'spark', description: '为 AI 分析预留清晰的调用边界。' },
  { id: 'analysis', title: '分析与记录', subtitle: '玩法与记录规则', icon: 'notes', description: '从赛前判断到赛后复盘，留下完整依据。' },
  { id: 'storage', title: '数据管理', subtitle: '记录、记忆与备份', icon: 'folder', description: '在这里管理积累下来的判断与记忆。' },
] as const
type SectionId = typeof sections[number]['id']
const active = ref<SectionId>('general')
const current = computed(() => sections.find(section => section.id === active.value)!)
const iconPaths: Record<string, string> = {
  sliders: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  database: 'M20 6c0 2-16 2-16 0s16-2 16 0v12c0 3-16 3-16 0V6m0 6c0 3 16 3 16 0',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  notes: 'M8 4h11v16H5V4h3m0-1h8v4H8V3m0 9h8m-8 4h5',
  folder: 'M3 7V5h7l2 2h9v12H3V7Zm0 3h18',
}
const defaults = {
  timezone: 'Asia/Shanghai', oddsFormat: 'decimal', density: 'comfortable',
  platform: 'selected', updateMode: 'manual', staleMinutes: '15',
  model: 'current', timeout: '120', retry: '0', budgetNotice: true,
  market: 'both', recordMode: 'confirm', includeSnapshot: true, reviewReminder: false,
}
const draft = reactive({ ...defaults })
const saved = ref({ ...defaults })
const notice = ref('')
const dirty = computed(() => JSON.stringify(draft) !== JSON.stringify(saved.value))
const changed = computed(() => JSON.stringify(draft) !== JSON.stringify(defaults))
function savePreview() {
  saved.value = { ...draft }
  notice.value = '已暂存本页预览，尚未应用到网站；刷新或离开设置页后恢复。'
}
function resetPreview() {
  Object.assign(draft, defaults)
  saved.value = { ...defaults }
  notice.value = '已还原初始预览。网站实际配置未改变。'
}
</script>

<template>
  <section class="settings-page" aria-labelledby="settings-title">
    <header class="settings-heading">
      <div>
        <span class="settings-eyebrow"><i></i> YOUR WORKSPACE</span>
        <div class="settings-title"><h1 id="settings-title">设置</h1><span class="preview-badge">界面预览</span></div>
        <p>把偏好设好，把注意力留给比赛。</p>
      </div>
      <div class="heading-actions">
        <button class="secondary-button" :disabled="!changed" @click="resetPreview">还原预览</button>
        <button class="primary-button" :disabled="!dirty" @click="savePreview"><span aria-hidden="true">✓</span> 暂存预览</button>
      </div>
    </header>
    <div class="preview-note"><span aria-hidden="true">i</span><p>先试试布局与操作。这里的选项仅供预览，暂不会改变网站配置。</p><span class="note-tag">功能逐步接入</span></div>

    <div class="settings-layout">
      <aside class="settings-sidebar">
        <nav aria-label="设置分类">
          <button v-for="section in sections" :key="section.id" :aria-current="active === section.id ? 'true' : undefined" :class="{ active: active === section.id }" :aria-controls="active === section.id ? `settings-${section.id}` : undefined" @click="active = section.id">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="iconPaths[section.icon]" /></svg>
            <span><strong>{{ section.title }}</strong><small>{{ section.subtitle }}</small></span><span class="nav-arrow" aria-hidden="true">›</span>
          </button>
        </nav>
        <div class="sidebar-tip"><span class="tip-mark" aria-hidden="true">↗</span><strong>按你的节奏，一步步完善</strong><p>先搭好设置入口，后续再连接真实配置与保存功能。</p></div>
      </aside>

      <div class="settings-main">
        <section :id="`settings-${active}`" :key="active" class="settings-panel" :aria-labelledby="`title-${active}`">
          <header class="panel-heading"><div><span class="panel-eyebrow">{{ String(sections.findIndex(item => item.id === active) + 1).padStart(2, '0') }} / PREFERENCES</span><h2 :id="`title-${active}`">{{ current.title }}</h2><p>{{ current.description }}</p></div><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="iconPaths[current.icon]" /></svg></header>

          <template v-if="active === 'general'">
            <div class="settings-group"><h3>显示偏好</h3>
              <div class="setting-row"><div><label for="setting-language">界面语言</label><p id="language-hint">当前界面使用简体中文</p></div><select id="setting-language" disabled aria-describedby="language-hint"><option>简体中文</option></select></div>
              <div class="setting-row"><div><label for="setting-timezone">时间显示</label><p>比赛时间和记录时间使用的时区</p></div><select id="setting-timezone" v-model="draft.timezone"><option value="Asia/Shanghai">北京时间 · UTC+8</option><option value="UTC">协调世界时 · UTC</option><option value="America/New_York">美国东部时间</option></select></div>
              <div class="setting-row"><div><label for="setting-odds">赔率格式</label><p>同一份报价，用你熟悉的方式阅读</p></div><select id="setting-odds" v-model="draft.oddsFormat"><option value="decimal">十进制 · 1.91</option><option value="american">美式 · -110</option><option value="hongkong">香港盘 · 0.91</option></select></div>
            </div>
            <div class="settings-group"><h3>阅读体验</h3><div class="setting-row density-row"><div><span class="setting-label" id="density-label">内容密度</span><p>调整卡片与列表之间的留白</p></div><div class="density-options" role="group" aria-labelledby="density-label"><button v-for="item in [{ value: 'comfortable', label: '舒适', lines: '☰' }, { value: 'compact', label: '紧凑', lines: '≡' }]" :key="item.value" :class="{ selected: draft.density === item.value }" :aria-pressed="draft.density === item.value" @click="draft.density = item.value"><span class="density-symbol" aria-hidden="true">{{ item.lines }}</span>{{ item.label }}<span class="selection-dot" aria-hidden="true"></span></button></div></div></div>
            <div class="panel-footnote"><span aria-hidden="true">◷</span> 当前网站仍使用北京时间与十进制赔率，预览选择尚未应用。</div>
          </template>

          <template v-else-if="active === 'data'">
            <div class="settings-group"><h3>报价来源</h3>
              <div class="setting-row"><div><span class="setting-label">盘口数据源</span><p>已接入的数据供应商</p></div><span class="provider-label">The Odds API <small>现有来源</small></span></div>
              <div class="setting-row"><div><label for="setting-platform">参考报价平台</label><p>预留默认平台选择，示例平台不代表推荐</p></div><select id="setting-platform" v-model="draft.platform"><option value="selected">跟随比赛页选择</option><option value="draftkings">DraftKings（示例）</option><option value="fanduel">FanDuel（示例）</option></select></div>
            </div>
            <div class="settings-group"><h3>更新规则</h3>
              <div class="setting-row"><div><label for="setting-update">盘口更新方式</label><p>当前仍需在比赛页手动更新</p></div><select id="setting-update" v-model="draft.updateMode"><option value="manual">手动更新</option><option value="scheduled" disabled>定时更新 · 后续接入</option></select></div>
              <div class="setting-row"><div><label for="setting-stale">报价过期提醒</label><p>预留超过指定时长后的提示规则</p></div><select id="setting-stale" v-model="draft.staleMinutes"><option value="5">超过 5 分钟</option><option value="15">超过 15 分钟</option><option value="30">超过 30 分钟</option></select></div>
            </div>
            <div class="inline-action"><div><strong>查看当前比赛与报价</strong><p>前往比赛页核对快照时间与平台</p></div><RouterLink to="/matches">前往比赛页 <span aria-hidden="true">↗</span></RouterLink></div>
          </template>

          <template v-else-if="active === 'model'">
            <div class="settings-group"><h3>模型连接</h3>
              <div class="setting-row"><div><label for="setting-model">分析模型</label><p>模型名称和连接状态可在 NBA 助手查看</p></div><select id="setting-model" v-model="draft.model"><option value="current">沿用后台配置</option><option disabled>更多模型 · 后续接入</option></select></div>
              <div class="setting-row"><div><span class="setting-label">API 密钥</span><p>密钥相当于访问密码，仅在网站后台配置</p></div><button class="secondary-button" disabled>管理连接 · 待接入</button></div>
            </div>
            <div class="settings-group"><h3>调用边界</h3>
              <div class="setting-row"><div><label for="setting-timeout">单次等待上限</label><p>预留 AI 回答的最长等待时间</p></div><select id="setting-timeout" v-model="draft.timeout"><option value="60">60 秒（预览）</option><option value="120">120 秒（预览）</option><option value="180">180 秒（预览）</option></select></div>
              <div class="setting-row"><div><label for="setting-retry">失败后自动重试</label><p>当前网站不会自动重复提交模型请求</p></div><select id="setting-retry" v-model="draft.retry"><option value="0">不自动重试</option><option value="1" disabled>重试 1 次 · 待讨论</option></select></div>
              <div class="setting-row"><div><label for="setting-budget">额度与费用提醒</label><p>未来接入使用量后，接近预算时提醒</p></div><div class="switch-control"><span>{{ draft.budgetNotice ? '开启预览' : '关闭预览' }}</span><input id="setting-budget" v-model="draft.budgetNotice" class="switch" type="checkbox" role="switch" /></div></div>
            </div>
            <div class="panel-footnote">本页不检测模型连接，也不消耗模型调用额度；等待上限为示例值。</div>
          </template>

          <template v-else-if="active === 'analysis'">
            <div class="settings-group"><h3>分析偏好</h3>
              <div class="setting-row"><div><label for="setting-market">关注玩法</label><p>预留个人常看的分析范围</p></div><select id="setting-market" v-model="draft.market"><option value="both">让分 + 大小分</option><option value="spreads">让分</option><option value="totals">大小分</option></select></div>
              <div class="setting-row"><div><label for="setting-record">正式记录方式</label><p>保存逻辑尚未接入，先预留确认入口</p></div><select id="setting-record" v-model="draft.recordMode"><option value="confirm">由我确认后记录</option><option value="automatic" disabled>自动记录 · 待讨论</option></select></div>
            </div>
            <div class="settings-group"><h3>复盘习惯</h3>
              <div class="setting-row"><div><label for="setting-snapshot">保留当时盘口</label><p>未来保存记录时，一起留下报价与采集时间</p></div><div class="switch-control"><span>{{ draft.includeSnapshot ? '开启预览' : '关闭预览' }}</span><input id="setting-snapshot" v-model="draft.includeSnapshot" class="switch" type="checkbox" role="switch" /></div></div>
              <div class="setting-row"><div><label for="setting-review">赛后复盘提醒</label><p>预留站内提醒，不会发送系统通知</p></div><div class="switch-control"><span>{{ draft.reviewReminder ? '开启预览' : '关闭预览' }}</span><input id="setting-review" v-model="draft.reviewReminder" class="switch" type="checkbox" role="switch" /></div></div>
            </div>
            <div class="inline-action"><div><strong>每次判断，都有迹可循</strong><p>查看个人选场复盘的界面框架</p></div><RouterLink to="/records">查看预测记录 <span aria-hidden="true">↗</span></RouterLink></div>
          </template>

          <template v-else>
            <div class="settings-group"><h3>你的研究资料</h3>
              <div class="setting-row"><div><span class="setting-label">预测与复盘记录</span><p>查看选场依据与赛后笔记的预览</p></div><RouterLink class="secondary-button" to="/records">查看记录 <span aria-hidden="true">↗</span></RouterLink></div>
              <div class="setting-row"><div><span class="setting-label">长期记忆</span><p>管理分析偏好与长期经验的预留入口</p></div><RouterLink class="secondary-button" to="/memory">前往记忆 <span aria-hidden="true">↗</span></RouterLink></div>
            </div>
            <div class="settings-group"><h3>备份与迁移 <span class="group-badge">待接入</span></h3>
              <div class="setting-row"><div><span class="setting-label">导出研究资料</span><p>正式记录与存储接入后，再提供导出</p></div><button class="secondary-button" disabled>导出数据</button></div>
              <div class="setting-row"><div><span class="setting-label">从备份恢复</span><p>未来从备份文件恢复资料</p></div><button class="secondary-button" disabled>导入备份</button></div>
            </div>
            <div class="panel-footnote">正式存储尚未接入；当前不会读取、导出或清空任何资料。</div>
          </template>
        </section>
        <footer class="settings-footer"><span class="draft-status"><i :class="{ changed: dirty }"></i>{{ dirty ? '预览有修改，可暂存后继续查看' : '仅在当前设置页预览' }}</span><span>真实保存功能后续接入</span></footer>
        <p class="save-notice" role="status" aria-live="polite">{{ notice }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-page { max-width: 1340px; margin: auto; padding: 38px 48px 30px; color: #203a36; }
.settings-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.settings-eyebrow { display: flex; align-items: center; gap: 7px; color: #7c8d77; font-size: 9px; letter-spacing: 2px; }
.settings-eyebrow i { width: 5px; height: 5px; border-radius: 50%; background: #ab9056; }
.settings-title { display: flex; align-items: center; gap: 13px; margin-top: 9px; }
.settings-title h1 { font-size: 29px; margin: 0; letter-spacing: -.7px; }
.preview-badge { font-size: 10px; padding: 3px 7px; border: 1px solid #d5c798; border-radius: 4px; color: #8c7743; background: #f4f0e5; }
.settings-heading p { margin: 9px 0 0; font-size: 12px; color: #7b897c; }
.heading-actions { display: flex; gap: 9px; flex-shrink: 0; }
.primary-button, .secondary-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 6px; padding: 9px 14px; border: 1px solid #d5dfd0; font: inherit; font-size: 12px; line-height: 1.5; white-space: nowrap; background: #fcfdfb; color: #526d4e; }
.primary-button { background: #2d5541; border-color: #2d5541; color: white; }
.primary-button:enabled:hover { background: #214432; }.secondary-button:enabled:hover, a.secondary-button:hover { background: #edf2e9; border-color: #9ab18d; }
.preview-note { display: flex; align-items: center; gap: 9px; margin: 24px 0; padding: 12px 15px; border: 1px solid #e3e5d6; border-radius: 7px; background: #f1f3e9; font-size: 11px; color: #788168; }
.preview-note > span:first-child { width: 15px; height: 15px; border: 1px solid #a6ad91; border-radius: 50%; display: grid; place-items: center; font: 10px Georgia, serif; flex-shrink: 0; }
.preview-note p { margin: 0; }.note-tag { margin-left: auto; white-space: nowrap; font-size: 10px; color: #92997f; }
.settings-layout { display: grid; grid-template-columns: 218px minmax(0, 1fr); gap: 27px; align-items: start; }
.settings-sidebar nav { display: flex; flex-direction: column; gap: 7px; }
.settings-sidebar nav button { width: 100%; display: flex; align-items: center; gap: 13px; text-align: left; background: transparent; border: 1px solid transparent; padding: 15px 14px; border-radius: 8px; color: #7c8c74; }
.settings-sidebar nav button:hover { background: #edf2e8; }.settings-sidebar nav button.active { background: #e8efe2; color: #355e3f; border-color: #d9e3d0; }
svg { width: 20px; height: 20px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.settings-sidebar strong { display: block; font-size: 12px; font-weight: 550; }.settings-sidebar small { display: block; font-size: 10px; margin-top: 3px; color: #8b9880; }
.nav-arrow { font-size: 18px; margin-left: auto; opacity: .6; }.settings-sidebar nav button:not(.active) .nav-arrow { visibility: hidden; }
.sidebar-tip { margin: 31px 12px 0; border-top: 1px solid #e0e6d9; padding-top: 21px; }.tip-mark { display: block; font-size: 21px; color: #a3966d; margin-bottom: 7px; }
.sidebar-tip strong { font-size: 11px; color: #6e8265; font-weight: 500; }.sidebar-tip p { font-size: 10px; line-height: 1.9; color: #8b9781; margin: 7px 0 0; }
.settings-main { min-width: 0; }.settings-panel { background: #fcfdfb; border: 1px solid #dde5d6; border-radius: 10px; overflow: hidden; }
.panel-heading { padding: 25px 28px 23px; display: flex; justify-content: space-between; align-items: center; gap: 18px; border-bottom: 1px solid #e6ebdf; }
.panel-eyebrow { color: #a0936e; font-size: 8px; letter-spacing: 1.8px; }.panel-heading h2 { font-size: 19px; font-weight: 550; margin: 7px 0 6px; }.panel-heading p { font-size: 11px; color: #89937e; margin: 0; }
.panel-heading > svg { width: 39px; height: 39px; background: #edf2e6; border-radius: 11px; padding: 10px; color: #7b936e; }
.settings-group { margin: 0 28px; padding: 23px 0 6px; border-bottom: 1px solid #e7ecdf; }.settings-group h3 { margin: 0 0 7px; font-weight: 550; font-size: 11px; color: #809173; letter-spacing: .5px; display: flex; gap: 9px; align-items: center; }
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 17px 0; }.setting-row > div:first-child { min-width: 0; }.setting-row label, .setting-label { font-size: 12px; font-weight: 500; }.setting-row p { font-size: 10px; color: #8a957f; margin: 5px 0 0; line-height: 1.7; }
.setting-row select { width: 194px; max-width: 100%; flex-shrink: 0; padding: 9px 11px; border-radius: 6px; border: 1px solid #dce4d4; color: #4c6547; background: #f9fbf6; font: inherit; font-size: 11px; min-height: 36px; cursor: pointer; }
.setting-row select:disabled { cursor: default; color: #8f9b87; background: #f3f6ee; }.setting-row select:enabled:hover { border-color: #a0b592; }
.density-row { align-items: flex-start; padding-top: 18px; padding-bottom: 22px; }.density-options { display: flex; gap: 10px; }.density-options button { width: 92px; text-align: left; position: relative; border: 1px solid #dce4d4; border-radius: 6px; padding: 10px 12px; background: #fcfdfb; color: #8b997e; font-size: 10px; }.density-options button.selected { border-color: #78966b; background: #f0f5e9; color: #4a6d3c; }
.density-symbol { display: block; font-size: 26px; line-height: 1; margin-bottom: 12px; color: #a1b493; }.selection-dot { position: absolute; bottom: 11px; right: 10px; width: 8px; height: 8px; border: 1px solid #c3cfb7; border-radius: 50%; }.selected .selection-dot { background: #799769; border-color: #799769; box-shadow: inset 0 0 0 2px #f0f5e9; }
.panel-footnote { margin: 19px 28px 22px; font-size: 10px; color: #8d987e; line-height: 1.8; display: flex; align-items: center; gap: 7px; }
.settings-footer { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 10px; color: #8b977f; margin: 15px 2px 0; }.draft-status { display: flex; align-items: center; gap: 6px; }.draft-status i { width: 5px; height: 5px; border-radius: 50%; background: #9aad8b; }.draft-status i.changed { background: #b79d60; }
.save-notice { margin: 10px 2px 0; color: #56764a; font-size: 11px; min-height: 20px; }.provider-label { font-size: 12px; color: #5a744e; text-align: right; }.provider-label small { margin-left: 6px; font-size: 9px; color: #8e9a82; }
.switch-control { display: flex; gap: 9px; align-items: center; flex-shrink: 0; }.switch-control > span { color: #88967b; font-size: 10px; }.switch { appearance: none; margin: 0; width: 34px; height: 20px; border-radius: 12px; background: #dce3d4; cursor: pointer; border: 1px solid #cdd9c3; position: relative; }.switch::after { content: ''; position: absolute; width: 14px; height: 14px; top: 2px; left: 2px; border-radius: 50%; background: white; box-shadow: 0 1px 2px #203a3620; }.switch:checked { background: #6b895b; border-color: #6b895b; }.switch:checked::after { transform: translateX(14px); }
.inline-action { display: flex; align-items: center; justify-content: space-between; gap: 18px; background: #f4f7ee; margin: 21px 28px 24px; padding: 15px; border-radius: 7px; }.inline-action strong { font-size: 11px; color: #687f59; font-weight: 500; }.inline-action p { font-size: 10px; color: #8d987e; margin: 4px 0 0; }.inline-action a { font-size: 11px; color: #5a784b; white-space: nowrap; }.group-badge { font-size: 9px; color: #9b987a; background: #f1f0e4; padding: 2px 6px; border-radius: 4px; font-weight: 400; }
@media (max-width: 1150px) { .settings-page { padding: 30px 28px; }.settings-layout { grid-template-columns: 185px minmax(0, 1fr); gap: 20px; }.settings-sidebar nav button { padding: 14px 10px; gap: 10px; }.panel-heading { padding: 22px; }.settings-group { margin: 0 22px; }.panel-footnote { margin-left: 22px; margin-right: 22px; }.setting-row { gap: 14px; }.setting-row select { width: 175px; }.inline-action { margin-left: 22px; margin-right: 22px; } }
@media (max-width: 950px) { .settings-layout { grid-template-columns: 1fr; gap: 18px; }.settings-sidebar nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }.settings-sidebar nav button { flex-direction: column; text-align: center; gap: 7px; padding: 12px 3px; }.settings-sidebar nav strong { font-size: 11px; }.settings-sidebar nav small, .nav-arrow, .sidebar-tip { display: none; } }
@media (max-width: 700px) { .settings-page { padding: 28px 20px 20px; }.settings-title h1 { font-size: 25px; }.settings-heading { flex-direction: column; align-items: flex-start; gap: 17px; }.heading-actions { align-self: stretch; justify-content: flex-end; }.preview-note { margin: 18px 0; align-items: flex-start; font-size: 10px; padding: 11px 12px; }.preview-note > span:first-child { margin-top: 2px; }.note-tag { display: none; }.settings-sidebar nav button { padding: 11px 1px; }.settings-sidebar nav svg { width: 17px; height: 17px; }.settings-sidebar nav strong { font-size: 10px; }.panel-heading { padding: 21px 18px; }.panel-heading h2 { font-size: 18px; }.panel-heading p { font-size: 10px; }.settings-group { margin: 0 18px; padding-top: 20px; }.setting-row { flex-wrap: wrap; gap: 12px; padding: 15px 0; }.setting-row > div:first-child { flex: 1 1 155px; }.setting-row select { width: 100%; }.density-options { width: 100%; }.density-options button { width: 100%; }.panel-footnote { margin: 16px 18px 20px; align-items: flex-start; }.inline-action { margin: 18px; flex-wrap: wrap; gap: 12px; }.settings-footer { font-size: 9px; }.setting-row .secondary-button { font-size: 10px; }.provider-label { font-size: 11px; } }
</style>
