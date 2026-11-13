<script setup lang="ts">
// 启动页：固定在屏幕上的标题、模块菜单与进入按钮，以及背后 3D 指挥室的加载、互动和进入流程。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import GameHud from '@/components/game/GameHud.vue'
import StartupMenu from '@/components/startup/StartupMenu.vue'
import StationCard from '@/components/startup/StationCard.vue'
import type { FeedTone, HudState } from '@/game/hud'
import { enterTarget, markEntered, unmarkEntered } from '@/stores/startupGate'
import { createSoundscape } from '@/startup/audio'
import { moduleOf } from '@/startup/modules'
import type { StationId } from '@/startup/scene/stations'
import type { Stage } from '@/startup/stage'

type SceneState = 'loading' | 'ready' | 'failed'

/** 点击进入后的镜头推进与淡出时长，对应设计文档建议的 0.4–0.8 秒。 */
const ENTER_MS = 600
/** 菜单上划过某一项多久后镜头才转过去，避免鼠标扫过时镜头乱晃。 */
const PREVIEW_DELAY_MS = 160
/** 鼠标离开菜单多久后镜头回到原位。 */
const PREVIEW_RELEASE_MS = 520

const router = useRouter()
const host = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const tag = ref<HTMLElement | null>(null)
const sceneState = ref<SceneState>('loading')
const attempt = ref(0)
const entering = ref(false)
const enterError = ref('')
/** 指针在场景里悬停的站点、点选后镜头停靠的站点、菜单上正在预览的站点。 */
const hovered = ref<StationId | null>(null)
const docked = ref<StationId | null>(null)
const previewed = ref<StationId | null>(null)
const soundOn = ref(false)
/** 比赛：off 为未开始，starting 是镜头正在俯冲进战术桌，on 是比赛进行中。 */
const playing = ref<'off' | 'starting' | 'on'>('off')
const hud = ref<HudState | null>(null)
const feed = ref<{ id: number; text: string; tone: FeedTone } | null>(null)
const gameHud = ref<InstanceType<typeof GameHud> | null>(null)

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const touchFirst = window.matchMedia('(pointer: coarse)').matches
const hint = touchFirst ? '单指旋转 · 双指缩放 · 轻点设备查看' : '拖动旋转 · 滚轮缩放 · 点击设备查看'
const sound = createSoundscape()

const activeStation = computed(() => previewed.value ?? docked.value ?? hovered.value)
const dockedModule = computed(() => (docked.value ? moduleOf(docked.value) : null))
const tagText = computed(() => {
  if (!hovered.value) return ''
  if (hovered.value === docked.value) return hovered.value === 'assistant' ? '点击切换战术' : ''
  return `${moduleOf(hovered.value).label} · 点击查看`
})

let stage: Stage | null = null
let unmounted = false
let previewTimer = 0
let feedTimer = 0
let feedCount = 0
let warmTimer = 0

/** 提前在后台搭建比赛场景：鼠标移到 PLAY 上、键盘聚焦到它，或者页面空闲时调用。 */
function warmGame(): void {
  stage?.prepareGame()
}

function closeScene(): void {
  window.clearTimeout(warmTimer)
  stage?.dispose()
  stage = null
}

function failScene(): void {
  closeScene()
  hovered.value = null
  docked.value = null
  playing.value = 'off'
  hud.value = null
  sceneState.value = 'failed'
}

/** 加载并启动 3D 场景；标题和按钮不等它，失败时退回静态画面。 */
async function openScene(): Promise<void> {
  closeScene()
  sceneState.value = 'loading'
  // 每次尝试换一块新画布：丢失过显卡上下文的画布不能再次使用。
  attempt.value += 1
  const current = attempt.value
  await nextTick()
  try {
    const { createStage } = await import('@/startup/stage')
    if (unmounted || current !== attempt.value || !host.value || !canvas.value) return
    stage = createStage(host.value, canvas.value, {
      reducedMotion,
      onLost: failScene,
      onHover: (id) => {
        hovered.value = id
        if (id) sound.hover()
      },
      onHoverMove: (x, y) => {
        if (tag.value) tag.value.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
      },
      onFocus: dock,
      onThunder: sound.thunder,
    })
    sceneState.value = 'ready'
    // 开场运镜结束后，趁空闲把比赛场景提前搭好，点 PLAY 时就不用等。触屏设备没有 PLAY 入口，不做。
    if (!touchFirst) warmTimer = window.setTimeout(warmGame, 4200)
  } catch (error) {
    console.error('[startup] 3D 场景无法显示', error)
    if (!unmounted && current === attempt.value) failScene()
  }
}

/** 场景里点选了某个站点（或点空处取消）：显示或收起站点卡片。 */
function dock(id: StationId | null): void {
  docked.value = id
  previewed.value = null
  if (id) {
    sound.select()
    sound.whoosh()
  }
}

/** 卡片上的“返回”和 Esc：镜头回到自由环绕。 */
function undock(): void {
  if (!docked.value || entering.value) return
  docked.value = null
  stage?.focusStation(null)
}

/** 菜单悬停或键盘聚焦：稍等片刻后让镜头转向那个站点；移开后回到原来停靠的地方。 */
function preview(id: StationId | null): void {
  window.clearTimeout(previewTimer)
  if (id && id !== previewed.value) sound.hover()
  previewTimer = window.setTimeout(
    () => {
      if (previewed.value === id) return
      previewed.value = id
      stage?.focusStation(id ?? docked.value)
      if (id) sound.whoosh()
    },
    id ? PREVIEW_DELAY_MS : PREVIEW_RELEASE_MS,
  )
}

function resetView(): void {
  docked.value = null
  previewed.value = null
  stage?.resetView()
}

/** 比赛里屏幕中央闪现的提示，过一会儿自动消失。 */
function showFeed(message: string, tone: FeedTone): void {
  feedCount += 1
  feed.value = { id: feedCount, text: message, tone }
  window.clearTimeout(feedTimer)
  feedTimer = window.setTimeout(() => {
    feed.value = null
  }, tone === 'score' ? 1700 : 1100)
}

/** 开始比赛：收起启动页界面，镜头俯冲进战术桌，随后切到球馆。 */
async function play(): Promise<void> {
  if (!stage || playing.value !== 'off' || entering.value) return
  playing.value = 'starting'
  window.clearTimeout(previewTimer)
  docked.value = null
  previewed.value = null
  hovered.value = null
  // 指挥室的环境声让位给比赛音效，结束后再恢复。
  sound.setEnabled(false)
  try {
    await stage.startGame({
      onHud: (state) => {
        hud.value = state
      },
      onFeed: showFeed,
      onMeter: (visible, x, y, fill) => gameHud.value?.setMeter(visible, x, y, fill),
    })
    playing.value = 'on'
  } catch (error) {
    console.error('[startup] 比赛无法开始', error)
    leaveGame()
  }
}

function leaveGame(): void {
  stage?.stopGame()
  playing.value = 'off'
  hud.value = null
  feed.value = null
  window.clearTimeout(feedTimer)
  sound.setEnabled(soundOn.value)
}

function toggleSound(): void {
  soundOn.value = !soundOn.value
  sound.setEnabled(soundOn.value)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** 进入系统并前往 route：场景就绪时先做一次短过渡，其余情况直接跳转；重复点击只生效一次。 */
async function enter(route: string): Promise<void> {
  if (entering.value) return
  entering.value = true
  enterError.value = ''
  window.clearTimeout(previewTimer)
  sound.select()
  if (stage && sceneState.value === 'ready') {
    await Promise.race([stage.playEnter(ENTER_MS), wait(ENTER_MS + 400)])
  }
  markEntered()
  try {
    const failure = await router.replace(route)
    if (failure) throw failure
  } catch (error) {
    console.error('[startup] 进入系统失败', error)
    unmarkEntered()
    if (unmounted) return
    entering.value = false
    enterError.value = '进入系统失败，请再试一次。'
    stage?.resumeControl()
  }
}

function onKeydown(event: KeyboardEvent): void {
  // 比赛中 Esc 用来暂停，由比赛自己处理。
  if (event.key === 'Escape' && playing.value === 'off') undock()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void openScene()
})

onBeforeUnmount(() => {
  unmounted = true
  window.clearTimeout(previewTimer)
  window.clearTimeout(feedTimer)
  window.removeEventListener('keydown', onKeydown)
  closeScene()
  sound.dispose()
})
</script>

<template>
  <main class="startup" :class="{ 'is-ready': sceneState === 'ready', 'is-entering': entering, 'is-starting': playing === 'starting', 'is-playing': playing === 'on' }">
    <div ref="host" class="startup-scene">
      <div class="startup-poster" aria-hidden="true">
        <svg viewBox="0 0 400 120" fill="none" stroke="#49ddeb" stroke-width="1.6">
          <path d="M72 10h256l62 100H10z" />
          <path d="M200 10v100M72 10l-62 100M150 10l-26 100M250 10l26 100" opacity=".45" />
          <ellipse cx="200" cy="56" rx="34" ry="12" />
          <path d="M58 34h62l-10 44H31zM342 34h-62l10 44h79z" />
        </svg>
      </div>
      <canvas :key="attempt" ref="canvas" role="img" aria-label="可以拖动旋转的 3D 指挥室场景"></canvas>
    </div>
    <div class="startup-scrim" aria-hidden="true"></div>
    <div class="startup-bars" aria-hidden="true"></div>

    <div v-show="playing === 'off'" class="startup-ui">
      <header class="startup-header">
        <h1 class="startup-title">
          <span class="title-top">OPERATION</span>
          <span class="title-main">DOGHUNT</span>
        </h1>
        <p class="startup-tagline">你的比赛分析指挥室</p>
      </header>

      <div class="startup-actions">
        <p v-if="enterError" class="startup-alert" role="alert">{{ enterError }}</p>
        <button type="button" class="enter-button" :disabled="entering" @click="enter(enterTarget())">
          <span>{{ entering ? '正在进入…' : '进入系统' }}</span>
          <span class="enter-arrow" aria-hidden="true">→</span>
        </button>
        <button v-if="sceneState === 'ready' && !touchFirst" type="button" class="play-button" :disabled="entering" @pointerenter="warmGame" @focus="warmGame" @click="play">
          <span>开始比赛</span>
          <span class="play-tag" aria-hidden="true">PLAY</span>
        </button>
        <StartupMenu class="startup-menu-slot" :active="activeStation" :disabled="entering" @preview="preview" @enter="enter(moduleOf($event).route)" />
        <p class="startup-status" role="status">
          <template v-if="sceneState === 'failed'">当前无法显示 3D 场景，仍可进入系统</template>
          <template v-else-if="sceneState === 'loading'">正在准备指挥室…</template>
          <template v-else><i v-if="!touchFirst" class="hint-icon" aria-hidden="true"></i>{{ hint }}</template>
        </p>
        <button v-if="sceneState === 'failed'" type="button" class="ghost-button" :disabled="entering" @click="openScene">
          重试场景
        </button>
      </div>

      <StationCard v-if="dockedModule" class="startup-card" :module="dockedModule" :disabled="entering" @enter="enter(dockedModule.route)" @back="undock" />

      <div class="startup-corner">
        <button type="button" class="ghost-button" :aria-pressed="soundOn" @click="toggleSound">声音 · {{ soundOn ? '开' : '关' }}</button>
        <button v-if="sceneState === 'ready'" type="button" class="ghost-button" :disabled="entering" @click="resetView">重置视角</button>
      </div>

      <div v-show="tagText" ref="tag" class="station-tag" aria-hidden="true"><span>{{ tagText }}</span></div>
    </div>
    <GameHud
      v-if="playing === 'on' && hud"
      ref="gameHud"
      :hud="hud"
      :feed="feed"
      @pause="stage?.gameCommand('pause')"
      @restart="stage?.gameCommand('restart')"
      @mute="stage?.gameCommand('mute')"
      @exit="leaveGame"
    />
    <div class="startup-fade" aria-hidden="true"></div>
  </main>
</template>

<style scoped>
.startup { position: fixed; inset: 0; overflow: hidden; background: var(--bg-1); color: #e9f0f2; user-select: none; -webkit-user-select: none; }
.startup-scene, .startup-poster, .startup-scene canvas, .startup-scrim, .startup-bars, .startup-ui, .startup-fade { position: absolute; inset: 0; }

/* 静态画面：场景加载中或无法显示时的底图。 */
.startup-poster {
  background:
    radial-gradient(ellipse 44% 13% at 50% 64%, rgba(73, 221, 235, .28), transparent 72%),
    radial-gradient(ellipse 90% 36% at 50% 30%, rgba(42, 85, 140, .5), transparent 78%),
    linear-gradient(#050c17 0%, #0d2038 40%, #14273b 41%, #0a1626 100%);
}
.startup-poster svg { position: absolute; left: 50%; top: 64%; width: min(62vw, 760px); opacity: .55; transform: translate(-50%, -50%); }
.startup-scene canvas { display: block; width: 100%; height: 100%; opacity: 0; cursor: grab; transition: opacity 1s ease; touch-action: none; }
.startup-scene canvas:active { cursor: grabbing; }
.is-ready .startup-scene canvas { opacity: 1; }

/* 文字和按钮后方的稳定深色衬底，不依赖镜头恰好停在暗处。 */
.startup-scrim {
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(6, 12, 20, .84) 0%, rgba(6, 12, 20, .48) 20%, rgba(6, 12, 20, 0) 40%),
    linear-gradient(0deg, rgba(6, 12, 20, .5) 0%, rgba(6, 12, 20, 0) 26%);
}

/* 开场的电影遮幅：场景就绪后上下两条黑边缓缓收起。 */
.startup-bars { pointer-events: none; }
.startup-bars::before, .startup-bars::after { content: ''; position: absolute; left: 0; right: 0; height: 12vh; background: #03070d; transition: transform 2.6s cubic-bezier(.6, 0, .2, 1) .9s; }
.startup-bars::before { top: 0; }
.startup-bars::after { bottom: 0; }
.is-ready .startup-bars::before { transform: translateY(-101%); }
.is-ready .startup-bars::after { transform: translateY(101%); }

/* 界面层本身不接收指针，拖动可以穿过文字落到场景上；只有按钮可点。 */
.startup-ui { display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; padding: 54px 56px 52px; pointer-events: none; }
.startup-ui button { pointer-events: auto; }
.startup :focus-visible { outline: 2px solid #e9f0f2; outline-offset: 3px; }

/* 行动代号：正体、拉开字距，和内页侧栏上的写法一致。 */
.startup-title { margin: 0; font-size: inherit; font-weight: inherit; line-height: 1; letter-spacing: 0; }
.title-top { display: block; font-size: clamp(12px, 1vw, 15px); font-weight: 400; letter-spacing: .56em; color: #b7c5cc; }
.title-main { display: block; margin-top: 14px; font-family: var(--font-num); font-size: clamp(40px, 4.8vw, 70px); font-weight: 600; letter-spacing: .18em; color: #eef4f6; text-shadow: 0 2px 26px rgba(3, 7, 12, .7); }
.startup-tagline { margin: 22px 0 0; padding-left: 14px; border-left: 1px solid var(--cyan); font-size: 14px; line-height: 1.2; letter-spacing: .3em; color: #c5d2d8; }

.startup-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; width: 100%; }
/* 两个主按钮：一块深色的面，左边缘一道亮线；不发光。 */
.enter-button {
  display: flex; align-items: center; justify-content: space-between;
  width: 264px; max-width: 100%; height: 54px; padding: 0 20px 0 26px;
  border: 1px solid rgba(134, 212, 221, .62); border-radius: var(--radius); background: rgba(5, 9, 12, .8); color: #eef6f8;
  font-size: 17px; font-weight: 600; letter-spacing: .26em; box-shadow: inset 3px 0 0 var(--cyan);
  transition: background .16s, border-color .16s;
}
.enter-button:hover:not(:disabled) { border-color: var(--cyan); background: rgba(22, 46, 54, .9); }
.enter-arrow { font-size: 20px; letter-spacing: 0; color: var(--cyan); }
.play-button {
  display: flex; align-items: center; justify-content: space-between;
  width: 264px; max-width: 100%; height: 44px; padding: 0 20px 0 26px;
  border: 1px solid rgba(211, 171, 111, .56); border-radius: var(--radius); background: rgba(5, 9, 12, .8); color: #eef6f8;
  font-size: 15px; font-weight: 600; letter-spacing: .22em; box-shadow: inset 3px 0 0 var(--amber);
  transition: background .16s, border-color .16s;
}
.play-button:hover:not(:disabled) { border-color: var(--amber); background: rgba(52, 40, 22, .9); }
.play-tag { font-family: var(--font-num); font-size: 12px; font-weight: 500; letter-spacing: .24em; color: var(--amber); }

.startup-status { display: flex; align-items: center; gap: 10px; min-height: 22px; margin: 0; font-size: 12px; letter-spacing: .1em; color: #a3b3bb; text-shadow: 0 1px 6px rgba(4, 8, 12, .9); }
.hint-icon { position: relative; flex: 0 0 auto; width: 12px; height: 19px; border: 1px solid #a3b3bb; border-radius: 6px; }
.hint-icon::after { content: ''; position: absolute; top: 4px; left: 50%; width: 1px; height: 4px; background: #a3b3bb; transform: translateX(-50%); }
.startup-alert { margin: 0; padding: 8px 12px; border-left: 2px solid var(--amber); background: rgba(5, 9, 12, .86); font-size: 13px; }

.ghost-button { height: 34px; padding: 0 14px; border: 1px solid rgba(160, 190, 202, .36); border-radius: var(--radius); background: rgba(5, 9, 12, .7); color: #a9b7be; font-size: 12px; letter-spacing: .1em; transition: color .16s, border-color .16s; }
.ghost-button:hover:not(:disabled) { border-color: rgba(160, 190, 202, .7); color: #e9f0f2; }
.ghost-button[aria-pressed='true'] { border-color: var(--cyan-line); color: #e9f0f2; }
.startup-corner { position: absolute; right: 56px; bottom: 52px; display: flex; gap: 8px; }
.startup-card { position: absolute; right: 56px; bottom: 108px; }

/* 悬停标签：锚点跟着站点在画面上的位置移动。 */
.station-tag { position: absolute; top: 0; left: 0; pointer-events: none; }
.station-tag span { position: absolute; left: 14px; bottom: 14px; padding: 5px 11px; border: 1px solid rgba(134, 212, 221, .5); border-radius: var(--radius); background: rgba(5, 9, 12, .86); color: #e9f0f2; font-size: 12px; letter-spacing: .1em; white-space: nowrap; }
.station-tag::before { content: ''; position: absolute; left: -3px; top: -3px; width: 6px; height: 6px; border: 1px solid var(--cyan); border-radius: 50%; }

/* 进入比赛的闪光：镜头俯冲到桌面时亮起，切到球馆后退去，把两个场景接在一起。 */
.is-starting .startup-scrim, .is-playing .startup-scrim, .is-starting .startup-bars, .is-playing .startup-bars { display: none; }
.is-playing .startup-scene canvas { cursor: default; }

/* 进入系统时淡到内页的底色，接上去不跳。 */
.startup-fade { pointer-events: none; background: var(--bg-1); opacity: 0; transition: opacity .55s ease; }
.is-entering .startup-fade { opacity: 1; }

/* 手机与窄屏：标题缩小置顶，菜单变成一排可横滑的标签，进入按钮通栏放在底部安全区域内。 */
@media (max-width: 700px) {
  .startup-ui { padding: 28px 22px calc(28px + env(safe-area-inset-bottom, 0px)); }
  .title-main { margin-top: 10px; font-size: 36px; letter-spacing: .14em; }
  .startup-tagline { margin-top: 14px; font-size: 13px; letter-spacing: .22em; }
  .startup-actions { align-items: stretch; gap: 12px; }
  /* 手机上进入按钮要贴近底部安全区域，所以把菜单标签排到它上面。 */
  .startup-menu-slot { order: -1; }
  .enter-button { width: 100%; }
  .startup-status { justify-content: center; }
  .startup-corner { top: 28px; right: 22px; bottom: auto; flex-direction: column; align-items: flex-end; gap: 8px; }
  .startup-card { top: 150px; right: 22px; bottom: auto; left: 22px; width: auto; }
  .startup-scrim { background: linear-gradient(180deg, rgba(6, 12, 20, .8) 0%, rgba(6, 12, 20, 0) 30%), linear-gradient(0deg, rgba(6, 12, 20, .88) 0%, rgba(6, 12, 20, 0) 40%); }
}
@media (max-height: 620px) {
  .startup-ui { padding-top: 22px; padding-bottom: 22px; }
  .title-main { margin-top: 8px; font-size: 36px; }
  .startup-tagline { margin-top: 12px; }
  .startup-corner { bottom: 22px; }
  .startup-card { bottom: 72px; }
}
@media (prefers-reduced-motion: reduce) {
  .startup-scene canvas, .startup-fade, .enter-button, .ghost-button, .play-button { transition: none; }
  .startup-bars { display: none; }
}
</style>
