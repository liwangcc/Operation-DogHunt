// 比赛模拟的数据结构：球员、球、比赛状态、玩家输入，以及模拟对外发出的事件。

export type TeamId = 0 | 1
/** 0 后卫、1 锋线、2 内线。 */
export type Role = 0 | 1 | 2

export type Action =
  | 'free'
  | 'shoot'
  | 'layup'
  | 'dunk'
  | 'pass'
  | 'steal'
  | 'jump'
  | 'stun'
  | 'dash'
  | 'celebrate'

export interface Ratings {
  /** 最高速度（米/秒）。 */
  speed: number
  three: number
  mid: number
  inside: number
  steal: number
  block: number
  /** 能否扣篮。 */
  dunk: boolean
}

export interface Athlete {
  id: number
  team: TeamId
  role: Role
  height: number
  /** 身体的碰撞半径。 */
  radius: number
  ratings: Ratings
  x: number
  z: number
  vx: number
  vz: number
  /** 双脚离地的高度与竖直速度。 */
  y: number
  vy: number
  /** 面朝方向（弧度，0 指向 +x）。 */
  facing: number
  action: Action
  /** 当前动作已经进行的秒数。 */
  actionTime: number
  /** 跳投是否已经出手；上篮、扣篮是否已经放球。 */
  released: boolean
  /** 扣篮、上篮的起跳点和目标点。 */
  fromX: number
  fromZ: number
  toX: number
  toZ: number
  stealCooldown: number
  dashCooldown: number
  /** 距离下一次可以发出鞋底摩擦声的秒数。 */
  squeakCooldown: number
  /** 被过掉、被晃开后的反应迟滞（秒）。 */
  lag: number
  /** 电脑控制用：下次决策时间、当前要去的位置。 */
  nextThink: number
  goalX: number
  goalZ: number
  /** 电脑打算在跳投的第几秒出手。 */
  plannedRelease: number
  /** 电脑持球时是否正在往篮下突破。 */
  driving: boolean
  /** 电脑已经决定跳投，正在收步站稳（站稳了才起跳）。 */
  settling: boolean
  /** 这一步是否由玩家操作：玩家操作的球员加减速更快，保证跟手。 */
  manual: boolean
  /** 起跳投篮那一刻的移动速度比例（0 站定，1 全速），急停跳投命中率更低。 */
  shotMoving: number
  /** 身体是否正保持朝向、靠滑步移动（防守姿态），动画据此选择步法。 */
  squared: boolean
}

export type BallState = 'held' | 'pass' | 'shot' | 'loose' | 'dead'

export interface Ball {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  state: BallState
  /** 持球人、投篮人、传球目标的编号；没有时为 -1。 */
  holder: number
  shooter: number
  passTarget: number
  /** 这次出手是 2 分还是 3 分，是否扣篮或上篮。 */
  shotValue: 2 | 3
  shotKind: ShotKind
  shotPerfect: boolean
  lastTouch: TeamId
  /** 出手后球是否碰过篮筐或篮板。 */
  touchedIron: boolean
  /** 出手后经过的秒数。 */
  flight: number
  /** 运球相位，决定手里的球在弹跳的哪个位置。 */
  dribble: number
  /** 运球手：+1 右手，-1 左手。handBlend 是球实际所在的一侧，换手时从一边滑到另一边。 */
  hand: number
  handBlend: number
  handCooldown: number
}

export type ShotKind = 'jumper' | 'layup' | 'dunk'
export type Phase = 'tipoff' | 'live' | 'dead' | 'final'
export type ReleaseGrade = 'perfect' | 'good' | 'early' | 'late'

/** 一帧里玩家想做什么。move 是屏幕方向（x 向右，z 向下）。 */
export interface Intent {
  moveX: number
  moveZ: number
  sprint: boolean
  /** 投篮键：是否按住、这一步是否刚按下或刚松开。 */
  shootHeld: boolean
  shootPressed: boolean
  shootReleased: boolean
  passPressed: boolean
  stealPressed: boolean
}

export type GameEvent =
  | { type: 'bounce'; speed: number; x: number; z: number }
  | { type: 'dribble'; x: number; z: number }
  | { type: 'rim'; speed: number; side: number }
  | { type: 'board'; speed: number; side: number }
  | { type: 'net'; side: number; clean: boolean }
  | { type: 'score'; team: TeamId; points: 2 | 3; player: number; kind: ShotKind; perfect: boolean; side: number }
  | { type: 'release'; player: number; grade: ReleaseGrade; kind: ShotKind }
  | { type: 'dunk'; player: number; side: number }
  | { type: 'pass'; from: number; to: number }
  | { type: 'catch'; player: number }
  | { type: 'steal'; player: number }
  | { type: 'block'; player: number }
  | { type: 'squeak'; x: number; z: number }
  | { type: 'whistle'; reason: 'out' | 'shotclock' | 'goaltend' | 'start' }
  | { type: 'buzzer'; reason: 'period' | 'final' | 'shotclock' }
  | { type: 'possession'; team: TeamId }
  | { type: 'tip' }

export interface MatchState {
  athletes: Athlete[]
  ball: Ball
  phase: Phase
  score: [number, number]
  period: number
  clock: number
  shotClock: number
  /** 当前拥有球权的一方。 */
  offense: TeamId
  /** 各队进攻的方向：+1 攻向 x 正方向的篮筐。 */
  attack: [number, number]
  /** 死球阶段的倒计时，以及结束后由谁在哪里发球。 */
  pause: number
  inboundTeam: TeamId
  inboundX: number
  inboundZ: number
  /** 玩家当前控制的球员编号（0 队）；-1 表示全部由电脑控制。 */
  controlled: number
  /** 比赛已经进行的总秒数（包括停表时间）。 */
  time: number
  /** 最近一次进球的球员，庆祝动作用。 */
  lastScorer: number
  /** 负责发球的球员编号；没有时为 -1。 */
  inbounder: number
  /** 开场跳球是哪一队拿到的；之后各节轮流发球。还没决出时为 -1。 */
  tipWinner: number
  /** 刚才的进球是否值得庆祝（扣篮、三分、完美出手）。 */
  celebrating: boolean
  /** 可复现的随机数来源。 */
  random: () => number
  events: GameEvent[]
}
