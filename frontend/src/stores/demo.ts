// 演示数据的开关与取用：哪些页面此刻在用虚构联赛的数据。真实数据存在时永远优先用真实数据。
import { computed } from 'vue'
import { demoBoard } from '@/demo/board'
import type { OddsBoard } from '@/types/odds'
import { preferences } from './preferences'
import { board } from './system'

/** 记录、统计、记忆三个模块还没有后端接口，打开演示数据时用虚构联赛的内容预览界面。 */
export const demoEnabled = computed(() => preferences.demo !== 'off')

/** 比赛页：读过一次后端、确实没有可显示的比赛时，才用演示盘口顶上。 */
export const boardIsDemo = computed(() => demoEnabled.value && board.settled && !board.loading && !board.data?.events.length)

/** 比赛页实际显示的快照。 */
export const shownBoard = computed<OddsBoard | null>(() => (boardIsDemo.value ? demoBoard() : board.data))

export function setDemo(enabled: boolean): void {
  preferences.demo = enabled ? 'auto' : 'off'
}
