<script setup lang="ts">
// 比赛界面：记分牌、进攻计时、屏幕中央的提示、出手条、操作说明，以及暂停和终场的菜单。
import { computed, ref } from 'vue'
import { TEAM_NAMES, type FeedTone, type HudState } from '@/game/hud'
import { SHOT } from '@/game/sim/constants'

const props = defineProps<{
  hud: HudState
  /** 屏幕中央当前显示的提示；没有时为 null。 */
  feed: { id: number; text: string; tone: FeedTone } | null
}>()

const emit = defineEmits<{ pause: []; restart: []; exit: []; mute: [] }>()

const meter = ref<HTMLElement | null>(null)
const meterFill = ref<HTMLElement | null>(null)
const meterSweet = ref<HTMLElement | null>(null)

const clock = computed(() => `${Math.floor(props.hud.clock / 60)}:${String(props.hud.clock % 60).padStart(2, '0')}`)
const periodLabel = computed(() => (props.hud.overtime ? '加时' : `第 ${props.hud.period} 节`))
const finished = computed(() => props.hud.phase === 'final')
const won = computed(() => props.hud.score[0] > props.hud.score[1])
/** 最佳出手点在出手条上的位置，以及“时机不错”那一段的长度（百分比）。 */
const sweetSpot = `${(SHOT.idealRelease / SHOT.forcedRelease) * 100}%`
const goodSize = `${((SHOT.goodWindow * 2) / SHOT.forcedRelease) * 100}%`
/** 上一次画的完美区长度；一次出手期间它不变，没变就不碰样式。 */
let shownPerfect = -1

/**
 * 出手条每帧都在动，直接改样式，不经过响应式更新。
 * @param perfect 完美区（绿区）占整条的比例：离筐越远、起跳时被贴得越紧越窄，为 0 表示这次出手没有完美区
 */
function setMeter(visible: boolean, x: number, y: number, fill: number, perfect: number): void {
  if (!meter.value || !meterFill.value || !meterSweet.value) return
  meter.value.style.opacity = visible ? '1' : '0'
  if (!visible) return
  meter.value.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  meterFill.value.style.height = `${fill * 100}%`
  if (perfect === shownPerfect) return
  shownPerfect = perfect
  meterSweet.value.style.height = `${perfect * 100}%`
  meter.value.classList.toggle('no-perfect', perfect <= 0)
}

/** 点完按钮后把焦点交还给页面，否则空格键会再次触发这个按钮而不是投篮。 */
function press(action: 'pause' | 'restart' | 'exit' | 'mute', event: Event): void {
  ;(event.currentTarget as HTMLElement).blur()
  if (action === 'pause') emit('pause')
  else if (action === 'restart') emit('restart')
  else if (action === 'exit') emit('exit')
  else emit('mute')
}

defineExpose({ setMeter })
</script>

<template>
  <div class="game-hud">
    <header class="scoreboard" aria-live="off">
      <div class="team home" :class="{ ball: hud.offense === 0 }">
        <span class="team-name">{{ TEAM_NAMES[0] }}</span><span class="team-score">{{ hud.score[0] }}</span>
      </div>
      <div class="timing">
        <span class="period">{{ periodLabel }}</span>
        <span class="clock">{{ clock }}</span>
        <span class="shot-clock" :class="{ urgent: hud.shotClock <= 5 }">{{ hud.shotClock }}</span>
      </div>
      <div class="team away" :class="{ ball: hud.offense === 1 }">
        <span class="team-score">{{ hud.score[1] }}</span><span class="team-name">{{ TEAM_NAMES[1] }}</span>
      </div>
    </header>

    <div class="hud-buttons">
      <button type="button" class="hud-button" :aria-pressed="!hud.muted" @click="press('mute', $event)">声音 · {{ hud.muted ? '关' : '开' }}</button>
      <button type="button" class="hud-button" @click="press('pause', $event)">暂停 Esc</button>
    </div>

    <Transition name="feed">
      <p v-if="feed" :key="feed.id" class="feed" :class="feed.tone" role="status">{{ feed.text }}</p>
    </Transition>

    <div ref="meter" class="meter" aria-hidden="true">
      <div class="meter-body">
        <div class="meter-track">
          <div class="meter-good" :style="{ bottom: sweetSpot, height: goodSize }"></div>
          <div ref="meterSweet" class="meter-sweet" :style="{ bottom: sweetSpot }"></div>
          <div ref="meterFill" class="meter-fill"></div>
        </div>
        <div class="meter-notch" :style="{ bottom: sweetSpot }"></div>
      </div>
    </div>

    <aside class="controls" aria-label="操作说明">
      <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动 <kbd>Shift</kbd> 加速（防守时不按加速 = 面向持球人滑步）</p>
      <p><kbd>J</kbd> 投篮（按住蓄力，在绿区松手必进）· 防守时起跳</p>
      <p class="hint">站稳、拉开空间再起跳才有绿区，离筐越远越窄；冲筐路上有人挡着扣不了</p>
      <p><kbd>K</kbd> 传球 · 防守时换人 <kbd>L</kbd> 变向 · 防守时抢断</p>
    </aside>

    <section v-if="hud.paused && !finished" class="overlay" aria-label="比赛已暂停">
      <h2>比赛暂停</h2>
      <button type="button" class="overlay-primary" @click="press('pause', $event)">继续比赛</button>
      <button type="button" class="overlay-button" @click="press('restart', $event)">重新开始</button>
      <button type="button" class="overlay-button" @click="press('exit', $event)">返回指挥室</button>
    </section>

    <section v-if="finished" class="overlay" aria-label="比赛结束">
      <p class="result" :class="{ won }">{{ won ? '胜利' : '失利' }}</p>
      <h2>{{ TEAM_NAMES[0] }} {{ hud.score[0] }} : {{ hud.score[1] }} {{ TEAM_NAMES[1] }}</h2>
      <button type="button" class="overlay-primary" @click="press('restart', $event)">再来一局</button>
      <button type="button" class="overlay-button" @click="press('exit', $event)">返回指挥室</button>
    </section>
  </div>
</template>

<style scoped>
.game-hud { position: absolute; inset: 0; pointer-events: none; color: #edf5fa; font-variant-numeric: tabular-nums; }
.game-hud button { pointer-events: auto; }

.scoreboard { position: absolute; top: 22px; left: 50%; display: flex; align-items: stretch; transform: translateX(-50%); border: 1px solid rgba(167, 185, 202, .28); border-radius: 4px; background: rgba(6, 13, 22, .82); overflow: hidden; backdrop-filter: blur(6px); }
.team { display: flex; align-items: center; gap: 14px; min-width: 150px; padding: 8px 18px; border-bottom: 3px solid transparent; }
.team.home { justify-content: flex-end; border-bottom-color: #18b4c8; }
.team.away { border-bottom-color: #e2912f; }
.team-name { font-size: 15px; letter-spacing: .2em; color: #a7b9ca; }
.team-score { min-width: 44px; font-size: 32px; font-weight: 700; text-align: center; }
/* 球权在哪一队，队名就亮起来。 */
.team.ball .team-name { color: #edf5fa; }
.team.ball .team-name::before { content: '● '; font-size: 9px; vertical-align: middle; }
.timing { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; min-width: 96px; padding: 4px 14px; background: rgba(20, 39, 59, .7); }
.period { font-size: 11px; letter-spacing: .2em; color: #a7b9ca; }
.clock { font-size: 22px; font-weight: 600; }
.shot-clock { padding: 0 8px; border-radius: 2px; background: rgba(8, 19, 33, .9); font-size: 13px; color: #e7aa62; }
.shot-clock.urgent { background: #b3261e; color: #fff; }

.hud-buttons { position: absolute; top: 26px; right: 28px; display: flex; gap: 8px; }
.hud-button { padding: 7px 12px; border: 1px solid rgba(167, 185, 202, .4); border-radius: 3px; background: rgba(6, 13, 22, .72); color: #a7b9ca; font-size: 12px; letter-spacing: .1em; }
.hud-button:hover { border-color: #49ddeb; color: #edf5fa; }

.feed { position: absolute; top: 24%; left: 50%; margin: 0; transform: translateX(-50%); font-size: 30px; font-weight: 700; font-style: italic; letter-spacing: .14em; white-space: nowrap; text-shadow: 0 2px 14px rgba(0, 0, 0, .85); }
.feed.score { font-size: 46px; color: #fff; text-shadow: 0 0 26px rgba(73, 221, 235, .8), 0 2px 14px rgba(0, 0, 0, .85); }
.feed.good { color: #6ff0c0; }
.feed.warn { color: #e7aa62; }
.feed.info { color: #c9d6e2; }
.feed-enter-active { transition: opacity .12s, transform .22s cubic-bezier(.2, 1.6, .4, 1); }
.feed-leave-active { transition: opacity .35s; }
.feed-enter-from { opacity: 0; transform: translateX(-50%) scale(.7); }
.feed-leave-to { opacity: 0; }

/* 出手条：锚点在球员头顶，条本身偏到右侧。淡色一段是“时机不错”，中间的绿区是完美出手（必进），两侧的刻度标出最佳出手点。 */
.meter { position: absolute; top: 0; left: 0; opacity: 0; transition: opacity .08s; }
.meter-body { position: absolute; left: 28px; bottom: -8px; width: 13px; height: 120px; }
.meter-track { position: absolute; inset: 0; border: 1.5px solid rgba(237, 245, 250, .85); border-radius: 6px; background: rgba(6, 13, 22, .78); overflow: hidden; }
.meter-good { position: absolute; left: 0; right: 0; background: rgba(55, 224, 143, .2); transform: translateY(50%); }
.meter-sweet { position: absolute; left: 0; right: 0; height: 0; background: #37e08f; transform: translateY(50%); }
.meter-fill { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: rgba(237, 245, 250, .42); border-top: 2px solid #fff; }
.meter-notch { position: absolute; left: -6px; right: -6px; height: 2px; transform: translateY(50%); background: linear-gradient(90deg, #37e08f 0 5px, transparent 5px calc(100% - 5px), #37e08f calc(100% - 5px)); }
/* 这次出手没有完美区（太远，或者起跳时被贴住了）：刻度变灰。 */
.meter.no-perfect .meter-notch { background: linear-gradient(90deg, rgba(167, 185, 202, .7) 0 5px, transparent 5px calc(100% - 5px), rgba(167, 185, 202, .7) calc(100% - 5px)); }

.controls { position: absolute; left: 28px; bottom: 24px; padding: 10px 14px; border-left: 2px solid rgba(73, 221, 235, .6); background: rgba(6, 13, 22, .6); font-size: 12px; line-height: 1.9; letter-spacing: .06em; color: #a7b9ca; }
.controls p { margin: 0; }
.controls .hint { padding-left: 4px; font-size: 11.5px; letter-spacing: .04em; color: #93a6b8; }
kbd { display: inline-block; min-width: 20px; margin: 0 2px; padding: 0 5px; border: 1px solid rgba(167, 185, 202, .5); border-radius: 3px; background: rgba(20, 39, 59, .8); font: inherit; font-size: 11px; line-height: 1.6; text-align: center; color: #edf5fa; }

.overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: rgba(4, 9, 16, .72); pointer-events: auto; backdrop-filter: blur(4px); }
.overlay h2 { margin: 0 0 14px; font-size: 30px; font-weight: 600; letter-spacing: .16em; }
.result { margin: 0; font-size: 64px; font-weight: 800; font-style: italic; letter-spacing: .2em; color: #e7aa62; }
.result.won { color: #49ddeb; text-shadow: 0 0 34px rgba(73, 221, 235, .6); }
.overlay-primary, .overlay-button { width: 240px; padding: 12px; border-radius: 3px; font-size: 16px; letter-spacing: .2em; }
.overlay-primary { border: 1.5px solid #49ddeb; background: rgba(21, 62, 82, .9); color: #edf5fa; }
.overlay-primary:hover { background: rgba(31, 96, 120, .95); }
.overlay-button { border: 1px solid rgba(167, 185, 202, .5); background: rgba(8, 19, 33, .8); color: #a7b9ca; }
.overlay-button:hover { border-color: #a7b9ca; color: #edf5fa; }
.game-hud :focus-visible { outline: 2px solid #edf5fa; outline-offset: 3px; }

@media (max-width: 760px) {
  .team { min-width: 0; padding: 6px 10px; gap: 8px; }
  .team-name { font-size: 12px; letter-spacing: .08em; }
  .team-score { min-width: 30px; font-size: 24px; }
  .hud-buttons { top: auto; right: 16px; bottom: 16px; }
  .controls { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .feed-enter-active, .feed-leave-active { transition: none; }
}
</style>
