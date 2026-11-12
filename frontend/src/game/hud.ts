// 比赛与界面之间的约定：队名、比分牌的数据，以及比赛向界面汇报时用的回调。
// 这个文件不引用渲染库，界面组件可以放心引用，不会把 three.js 带进首屏的代码包。
import type { Phase, TeamId } from './sim/types'

/** 0 队是玩家控制的青色“猎犬”，1 队是电脑控制的琥珀色“赤狐”。队名为虚构，与任何真实球队无关。 */
export const TEAM_NAMES = ['猎犬', '赤狐'] as const

export interface HudState {
  score: [number, number]
  period: number
  overtime: boolean
  clock: number
  shotClock: number
  phase: Phase
  offense: TeamId
  paused: boolean
  muted: boolean
}

export type FeedTone = 'score' | 'good' | 'warn' | 'info'

export interface GameCallbacks {
  onHud: (state: HudState) => void
  /** 屏幕中央闪现的一句提示（进球、抢断、违例、出手评价）。 */
  onFeed: (text: string, tone: FeedTone) => void
  /** 出手条：visible 为 false 时隐藏；x、y 是它在画面上的位置，fill 为 0–1 的蓄力进度。 */
  onMeter: (visible: boolean, x: number, y: number, fill: number) => void
}
