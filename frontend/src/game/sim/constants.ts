// 比赛模拟用到的尺寸与手感参数：标准球场、篮架、球的物理，以及各类动作的时长。单位为米和秒。

/** 标准球场（28.65 × 15.24 米）。x 沿球场长边，z 沿宽边，原点在中圈。 */
export const COURT = {
  halfLength: 14.325,
  halfWidth: 7.62,
  /** 篮筐中心离中线的距离（底线内 1.575 米）。 */
  hoopX: 12.75,
  rimHeight: 3.05,
  rimRadius: 0.2286,
  /** 篮板正面离中线的距离，以及篮板的半宽和上下沿高度。 */
  boardX: 13.105,
  boardHalfWidth: 0.915,
  boardBottom: 2.9,
  boardTop: 3.97,
  /** 三分线：弧线半径 7.24 米，底角处是离边线 0.9 米的直线。 */
  threeRadius: 7.24,
  threeCornerZ: 6.72,
  /** 禁区半宽与罚球线离篮筐的距离。 */
  keyHalfWidth: 2.44,
  freeThrowDistance: 4.6,
  /** 球员可以跑到界外多远（无球时）。 */
  apron: 1.4,
} as const

export const BALL = {
  radius: 0.12,
  gravity: 9.81,
  floorBounce: 0.74,
  rimBounce: 0.5,
  boardBounce: 0.6,
  /** 篮圈钢条的半径。 */
  rimTube: 0.012,
  passSpeed: 15,
} as const

export const RULES = {
  periods: 2,
  periodSeconds: 180,
  shotClock: 24,
  /** 进攻篮板后的进攻时限。 */
  reboundShotClock: 14,
  /** 进球后、违例后到重新开球的停顿。 */
  scorePause: 2.6,
  violationPause: 1.7,
  tipoffSeconds: 1.5,
} as const

/** 跳投：按下后多久到达最佳出手点，“不错”一档的时间窗口，以及拖多久会被迫出手。 */
export const SHOT = {
  idealRelease: 0.4,
  goodWindow: 0.085,
  forcedRelease: 0.74,
  jumpSpeed: 3.7,
  followThrough: 0.3,
} as const

/**
 * 完美出手的时间窗口（最佳出手点前后各多少秒）。完美出手必进，所以窗口随距离收窄：
 * near 米以内最宽，到三分线收到 arc，线外每远一米再收 fade；收到不足一个物理步就没有完美出手。
 */
export const PERFECT = { wide: 0.019, near: 2.5, arc: 0.0115, fade: 0.0018 } as const

export const MOVES = {
  layupSeconds: 0.62,
  layupRelease: 0.34,
  dunkSeconds: 0.86,
  dunkSlam: 0.5,
  passSeconds: 0.2,
  stealSeconds: 0.34,
  stealMissStun: 0.5,
  stealCooldown: 0.85,
  blockJumpSpeed: 4.3,
  dashSeconds: 0.2,
  dashCooldown: 1.1,
  catchRadius: 0.75,
  pickupRadius: 0.8,
} as const

/**
 * 电脑对手相对玩家一方的能力加成：速度按倍数，投篮、抢断、封盖按点数，
 * timing 是出手时机的离散程度（越小越稳，玩家队友为 1）。
 */
export const EDGE = { speed: 1.04, shooting: 0.08, steal: 0.15, block: 0.1, timing: 0.85 } as const

/** 身体保持朝向（防守滑步）时的速度折扣：横移与后退都比正面跑慢。 */
export const STRAFE = { side: 0.84, back: 0.7 } as const

/** 物理步长：120 次/秒，按键在下一步就生效。 */
export const STEP = 1 / 120
