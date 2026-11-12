// 本机显示偏好：只影响这台设备上的显示方式，保存在浏览器本地存储里，不上传、不含任何业务数据或密钥。
import { reactive, watch } from 'vue'

/** 赔率显示：十进制（含本金），或香港盘水位（净赢部分，等于十进制减 1）。 */
export type OddsFormat = 'decimal' | 'hk'
/** 演示数据：auto 表示没有真实数据时用演示数据预览界面，off 表示只显示真实状态。 */
export type DemoPref = 'auto' | 'off'
export type BackdropPref = 'on' | 'off'

export interface Preferences {
  oddsFormat: OddsFormat
  /** 比赛卡片默认显示哪家平台的报价；空字符串表示沿用数据源返回的第一家。 */
  bookmaker: string
  demo: DemoPref
  /** 内页的动态雨夜背景。 */
  backdrop: BackdropPref
}

const STORAGE_KEY = 'doghunt:preferences'
const DEFAULTS: Preferences = { oddsFormat: 'decimal', bookmaker: '', demo: 'auto', backdrop: 'on' }

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** 读出的内容逐项校验，格式不对的项退回默认值。 */
function read(): { value: Preferences; available: boolean } {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    const saved = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    return {
      available: true,
      value: {
        oddsFormat: pick(saved.oddsFormat, ['decimal', 'hk'] as const, DEFAULTS.oddsFormat),
        bookmaker: typeof saved.bookmaker === 'string' ? saved.bookmaker.slice(0, 200) : DEFAULTS.bookmaker,
        demo: pick(saved.demo, ['auto', 'off'] as const, DEFAULTS.demo),
        backdrop: pick(saved.backdrop, ['on', 'off'] as const, DEFAULTS.backdrop),
      },
    }
  } catch {
    return { available: false, value: { ...DEFAULTS } }
  }
}

const initial = read()

/** 浏览器是否允许使用本地存储；不允许时偏好只在本次打开期间有效。 */
export const storageAvailable = initial.available
export const preferences = reactive<Preferences>(initial.value)

watch(preferences, (value) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // 存储不可用时只保留内存里的值。
  }
}, { deep: true })

export function resetPreferences(): void {
  Object.assign(preferences, DEFAULTS)
}
