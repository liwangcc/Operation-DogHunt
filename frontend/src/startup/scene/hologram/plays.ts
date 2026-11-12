// 全息球场上循环演示的战术：每套战术是一串站位，纯属示意，不对应任何真实球队或比赛数据。

/** 半场上的一个位置，单位英尺：[距底线, 距左侧边线]；篮筐在 [5.25, 25]。 */
export type Spot = [number, number]

export interface PlayStep {
  /** 走到这一步的站位所用的秒数；第一步表示开始前的停顿。 */
  seconds: number
  offense: Spot[]
  defense: Spot[]
  /** 这一步结束时球在谁手里（进攻方序号）；'shot' 表示这一步里出手投篮。 */
  ball: number | 'shot'
}

export interface Play {
  steps: PlayStep[]
}

/** 篮筐位置与高度（英尺）。 */
export const HOOP: Spot = [5.25, 25]
export const HOOP_HEIGHT = 10

/** 四外一内的起始站位：后卫持球在弧顶，两翼各一人，底角一人，中锋在罚球线附近。 */
const SET_OFFENSE: Spot[] = [[34, 25], [22, 7], [22, 43], [5, 46], [19, 29]]
const SET_DEFENSE: Spot[] = [[30, 25], [19, 10], [19, 40], [8, 42], [15, 27]]

/** 高位挡拆：中锋上提掩护，后卫借掩护突破，中锋顺下接球完成进攻。 */
const pickAndRoll: Play = {
  steps: [
    { seconds: 1.2, offense: SET_OFFENSE, defense: SET_DEFENSE, ball: 0 },
    { seconds: 1.5, offense: [[34, 25], [22, 7], [22, 43], [5, 46], [31, 21]], defense: [[30.5, 24], [19, 10], [19, 40], [8, 42], [28, 23]], ball: 0 },
    { seconds: 1.6, offense: [[23, 16], [22, 6], [24, 43], [5, 46], [26, 23]], defense: [[27, 19], [18, 10], [19, 39], [8, 42], [22, 18]], ball: 0 },
    { seconds: 1.3, offense: [[20, 14], [22, 6], [24, 43], [5, 46], [12, 24]], defense: [[22, 16], [17, 11], [18, 38], [8, 40], [19, 17]], ball: 4 },
    { seconds: 1.1, offense: [[20, 14], [22, 6], [24, 43], [5, 46], [8, 25]], defense: [[20, 17], [14, 14], [16, 36], [9, 36], [13, 21]], ball: 'shot' },
  ],
}

/** 突破分球：后卫突破吸引协防，分给底角空位的射手投三分。 */
const driveAndKick: Play = {
  steps: [
    { seconds: 1.2, offense: SET_OFFENSE, defense: SET_DEFENSE, ball: 0 },
    { seconds: 1.6, offense: [[22, 27], [22, 7], [22, 43], [5, 46], [14, 18]], defense: [[25, 27], [19, 10], [19, 39], [9, 40], [15, 22]], ball: 0 },
    { seconds: 1.3, offense: [[14, 27], [22, 7], [23, 43], [5, 46], [12, 17]], defense: [[17, 28], [18, 11], [17, 36], [11, 33], [13, 22]], ball: 0 },
    { seconds: 1.0, offense: [[13, 27], [22, 7], [23, 43], [5, 46], [12, 17]], defense: [[15, 28], [18, 11], [16, 36], [10, 36], [12, 22]], ball: 3 },
    { seconds: 1.4, offense: [[13, 27], [22, 7], [23, 43], [5, 46], [9, 20]], defense: [[14, 28], [18, 11], [16, 36], [7, 43], [10, 23]], ball: 'shot' },
  ],
}

/** 弱侧反跑：球转移到侧翼，弱侧球员趁防守人盯球反跑篮下，接传球上篮。 */
const backdoorCut: Play = {
  steps: [
    { seconds: 1.2, offense: SET_OFFENSE, defense: SET_DEFENSE, ball: 0 },
    { seconds: 1.2, offense: [[33, 24], [23, 8], [22, 43], [5, 46], [19, 29]], defense: [[29, 24], [20, 11], [20, 40], [8, 42], [15, 27]], ball: 1 },
    { seconds: 1.3, offense: [[33, 26], [23, 8], [26, 44], [5, 46], [20, 20]], defense: [[29, 25], [20, 10], [23, 41], [8, 42], [16, 21]], ball: 1 },
    { seconds: 1.2, offense: [[33, 26], [23, 8], [9, 31], [5, 46], [20, 20]], defense: [[29, 25], [20, 10], [15, 36], [8, 41], [16, 21]], ball: 2 },
    { seconds: 1.0, offense: [[33, 26], [23, 8], [7, 28], [5, 46], [20, 20]], defense: [[29, 25], [19, 11], [10, 31], [8, 40], [13, 23]], ball: 'shot' },
  ],
}

export const PLAYS: Play[] = [pickAndRoll, driveAndKick, backdoorCut]

/** 一套战术演完后的停留时间，以及下一套开始前的淡入淡出时间（秒）。 */
export const PLAY_HOLD = 1.6
export const PLAY_FADE = 0.7

export function playDuration(play: Play): number {
  return play.steps.reduce((sum, step) => sum + step.seconds, 0)
}
