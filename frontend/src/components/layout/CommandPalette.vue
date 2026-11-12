<script setup lang="ts">
// 快速前往：Ctrl / ⌘ + K 打开的命令面板，输入几个字就能跳到某个工位，或切换本机的显示偏好。
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import StationIcon from '@/components/common/StationIcon.vue'
import { STARTUP_MODULES } from '@/startup/modules'
import type { StationId } from '@/startup/scene/stations'
import { demoEnabled, setDemo } from '@/stores/demo'
import { preferences } from '@/stores/preferences'
import { checkHealth } from '@/stores/system'

interface Command {
  id: string
  label: string
  hint: string
  /** 用来匹配输入的文字，除了名称还包含英文和别称。 */
  keywords: string
  station?: StationId
  run: () => void
}

const open = defineModel<boolean>('open', { required: true })
const router = useRouter()
const query = ref('')
const cursor = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

const commands = computed<Command[]>(() => [
  ...STARTUP_MODULES.map((item) => ({
    id: item.id,
    label: item.label,
    hint: `${item.place}${item.planned ? ' · 界面预览' : ''}`,
    keywords: `${item.label} ${item.place} ${item.id} ${item.mark}`,
    station: item.id,
    run: () => void router.push(item.route),
  })),
  { id: 'welcome', label: '返回指挥室', hint: '3D 启动页', keywords: '返回指挥室 启动页 welcome 3d', run: () => void router.push('/welcome') },
  {
    id: 'odds-format',
    label: preferences.oddsFormat === 'decimal' ? '赔率改用香港盘显示' : '赔率改用十进制显示',
    hint: '本机显示偏好',
    keywords: '赔率 格式 十进制 香港盘 odds decimal hk',
    run: () => { preferences.oddsFormat = preferences.oddsFormat === 'decimal' ? 'hk' : 'decimal' },
  },
  {
    id: 'demo',
    label: demoEnabled.value ? '关闭演示数据' : '打开演示数据',
    hint: demoEnabled.value ? '只显示真实状态' : '没有真实数据时预览界面',
    keywords: '演示数据 示例 demo 预览',
    run: () => setDemo(!demoEnabled.value),
  },
  {
    id: 'backdrop',
    label: preferences.backdrop === 'on' ? '关闭动态背景' : '打开动态背景',
    hint: '本机显示偏好',
    keywords: '动态背景 雨 夜景 backdrop',
    run: () => { preferences.backdrop = preferences.backdrop === 'on' ? 'off' : 'on' },
  },
  { id: 'health', label: '重新检查后端连接', hint: '不调用模型，不取盘口', keywords: '后端 连接 检查 health', run: () => void checkHealth() },
])

const results = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return commands.value.filter((command) => words.every((word) => command.keywords.toLowerCase().includes(word)))
})

function close(): void {
  open.value = false
}

function run(command: Command | undefined): void {
  if (!command) return
  close()
  command.run()
}

function move(step: number): void {
  if (!results.value.length) return
  cursor.value = (cursor.value + step + results.value.length) % results.value.length
  void nextTick(() => list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
}

watch(query, () => {
  cursor.value = 0
})

watch(open, async (value) => {
  if (value) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    query.value = ''
    cursor.value = 0
    await nextTick()
    input.value?.focus()
  } else {
    returnFocus?.focus()
    returnFocus = null
  }
})
</script>

<template>
  <Transition name="palette">
    <div v-if="open" class="palette-layer" @mousedown.self="close">
      <div class="palette panel panel--ticks" role="dialog" aria-modal="true" aria-label="快速前往" @keydown.esc.prevent="close" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="run(results[cursor])" @keydown.tab.prevent>
        <div class="palette-search">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" /></svg>
          <input ref="input" v-model="query" type="text" placeholder="前往工位，或输入“赔率”“演示”…" aria-label="搜索命令" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palette-list" :aria-activedescendant="results[cursor] ? `palette-${results[cursor].id}` : undefined" />
          <kbd class="kbd">Esc</kbd>
        </div>
        <ul id="palette-list" ref="list" class="palette-list" role="listbox" aria-label="命令">
          <li v-for="(command, index) in results" :id="`palette-${command.id}`" :key="command.id" role="option" :aria-selected="index === cursor" @mousemove="cursor = index" @click="run(command)">
            <StationIcon v-if="command.station" :id="command.station" />
            <span v-else class="palette-glyph" aria-hidden="true"></span>
            <span class="palette-label">{{ command.label }}</span>
            <span class="palette-hint">{{ command.hint }}</span>
          </li>
          <li v-if="!results.length" class="palette-empty" role="presentation">没有匹配的命令</li>
        </ul>
        <p class="palette-foot"><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> 选择<kbd class="kbd">Enter</kbd> 执行</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.palette-layer { position: fixed; inset: 0; z-index: 80; display: flex; align-items: flex-start; justify-content: center; padding: 16vh 16px 0; background: rgba(3, 7, 13, .62); backdrop-filter: blur(6px); }
.palette { width: 560px; max-width: 100%; overflow: hidden; border-color: var(--cyan-line); background: linear-gradient(180deg, rgba(14, 30, 50, .98), rgba(8, 19, 33, .98)); box-shadow: var(--shadow-panel), 0 0 40px rgba(73, 221, 235, .14); }
.palette-search { display: flex; align-items: center; gap: 12px; padding: 0 16px; border-bottom: 1px solid var(--line-2); color: var(--text-3); }
.palette-search input { flex: 1; min-width: 0; height: 52px; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 15px; letter-spacing: .04em; }
.palette-search input::placeholder { color: var(--text-3); opacity: 1; }
.palette-list { max-height: min(46vh, 380px); margin: 0; padding: 6px; overflow-y: auto; list-style: none; }
.palette-list li[role='option'] { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-left: 2px solid transparent; border-radius: 3px; color: var(--text-2); cursor: pointer; }
.palette-list li[aria-selected='true'] { border-left-color: var(--cyan); background: linear-gradient(90deg, rgba(73, 221, 235, .2), rgba(73, 221, 235, .03)); color: var(--text); }
.palette-list li[aria-selected='true'] .station-icon { color: var(--cyan); }
.palette-glyph { width: 20px; height: 20px; flex: 0 0 auto; background: linear-gradient(var(--text-3), var(--text-3)) center / 10px 1.5px no-repeat; }
.palette-label { font-size: 14px; letter-spacing: .1em; }
.palette-hint { margin-left: auto; font-size: 12px; letter-spacing: .08em; color: var(--text-3); white-space: nowrap; }
.palette-empty { padding: 22px 12px; text-align: center; font-size: 13px; color: var(--text-3); }
.palette-foot { display: flex; align-items: center; gap: 6px; margin: 0; padding: 9px 16px; border-top: 1px solid var(--line); font-size: 11px; letter-spacing: .1em; color: var(--text-3); }
.palette-foot .kbd:nth-of-type(3) { margin-left: 12px; }

.palette-enter-active { transition: opacity .16s ease; }
.palette-enter-active .palette { transition: transform .22s var(--ease-out); }
.palette-leave-active { transition: opacity .1s ease; }
.palette-enter-from, .palette-leave-to { opacity: 0; }
.palette-enter-from .palette { transform: translateY(-10px) scale(.985); }
</style>
