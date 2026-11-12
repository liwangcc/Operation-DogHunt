// 各页面共用的运行状态：后端连接、模型配置、最新保存的盘口快照，以及每秒走一次的时钟。
// 三项检查都只读本机后端，不调用付费模型，也不向盘口供应商取数；只有 refreshBoard 会消耗盘口接口额度。
import { computed, reactive, ref } from 'vue'
import { getModelStatus } from '@/api/chat'
import { getHealth } from '@/api/health'
import { getOdds } from '@/api/odds'
import type { HealthResponse, ModelStatus } from '@/types/api'
import type { OddsBoard } from '@/types/odds'

/** 采集超过这么久的快照在界面上标为“待更新”；只是提示，不会触发自动取数。 */
export const STALE_AFTER_MS = 15 * 60 * 1000
/** 两次手动更新盘口之间的最短间隔，与后端的限制一致。 */
const REFRESH_COOLDOWN_MS = 60 * 1000

// —— 时钟 ——
export const now = ref(Date.now())
let clockUsers = 0
let clockTimer = 0

/** 外壳挂载时启动、卸载时停止；只更新时间显示、倒计时和过期标记，不发起任何请求。 */
export function startClock(): void {
  clockUsers += 1
  if (clockUsers > 1) return
  now.value = Date.now()
  clockTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
}

export function stopClock(): void {
  clockUsers = Math.max(0, clockUsers - 1)
  if (clockUsers === 0) window.clearInterval(clockTimer)
}

// —— 后端连接 ——
export const health = reactive({
  status: 'checking' as 'checking' | 'online' | 'offline',
  message: '正在检查后端连接',
  info: null as HealthResponse | null,
  /** 最近一次检查从发出到收到回应用了多少毫秒。 */
  latencyMs: null as number | null,
  checkedAt: 0,
})
let healthPending = false

export async function checkHealth(): Promise<void> {
  if (healthPending) return
  healthPending = true
  health.status = 'checking'
  health.message = '正在检查后端连接'
  const started = performance.now()
  try {
    health.info = await getHealth()
    health.latencyMs = Math.round(performance.now() - started)
    health.status = 'online'
    health.message = '后端已连接'
  } catch (error) {
    health.info = null
    health.latencyMs = null
    health.status = 'offline'
    health.message = error instanceof Error ? error.message : '连接检查失败'
  } finally {
    health.checkedAt = Date.now()
    healthPending = false
  }
}

// —— 模型配置（只看是否已配置，不是在线探测）——
export const model = reactive({
  checking: false,
  status: null as ModelStatus | null,
  error: '',
  checkedAt: 0,
})

export async function checkModel(): Promise<void> {
  if (model.checking) return
  model.checking = true
  model.error = ''
  try {
    model.status = await getModelStatus()
  } catch (error) {
    model.error = error instanceof Error ? error.message : '读取模型配置失败。'
  } finally {
    model.checking = false
    model.checkedAt = Date.now()
  }
}

// —— 盘口快照 ——
export const board = reactive({
  data: null as OddsBoard | null,
  loading: false,
  refreshing: false,
  error: '',
  /** 最近一次操作是成功的手动更新，用来显示“更新成功”。 */
  refreshed: false,
  nextRefreshAt: 0,
  /** 至少尝试读取过一次（无论成功与否）。 */
  settled: false,
})

export const boardBusy = computed(() => board.loading || board.refreshing)
export const refreshCooldown = computed(() => Math.max(0, Math.ceil((board.nextRefreshAt - now.value) / 1000)))
export const boardStale = computed(() => {
  const fetched = board.data?.fetched_at
  return !!fetched && (board.data!.stale || now.value - Date.parse(fetched) > STALE_AFTER_MS)
})

async function runBoard(refresh: boolean): Promise<void> {
  if (boardBusy.value || (refresh && refreshCooldown.value > 0)) return
  if (refresh) {
    board.refreshing = true
    board.nextRefreshAt = Date.now() + REFRESH_COOLDOWN_MS
  } else {
    board.loading = true
  }
  board.error = ''
  board.refreshed = false
  try {
    board.data = await getOdds(refresh)
    board.refreshed = refresh
  } catch (reason) {
    // 失败时保留页面上原有的快照。
    board.error = reason instanceof Error ? reason.message : '盘口暂时不可用，请稍后重试。'
  } finally {
    board.loading = false
    board.refreshing = false
    board.settled = true
    now.value = Date.now()
  }
}

/** 读取后端保存的最新快照，不消耗接口额度。 */
export function loadBoard(): Promise<void> {
  return runBoard(false)
}

/** 手动向供应商更新一次盘口，会消耗接口额度；只在用户点击时调用。 */
export function refreshBoard(): Promise<void> {
  return runBoard(true)
}
