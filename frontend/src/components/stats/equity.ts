// 累计盈亏图的计算：把逐条结算并成“结算日”，再算坐标、刻度、极值和回撤。只管数字，不涉及界面。
import { beijingDay } from '@/components/odds/format'
import type { EquityPoint } from '@/domain/metrics'

const HOUR = 3600000
const DAY = 24 * HOUR

/** 图上的一条曲线：名称，以及按开赛时间排好的逐条结算。 */
export interface EquitySeries {
  key: string
  label: string
  points: EquityPoint[]
}

/** 同一天（北京时间）开赛的记录并成一步：曲线在这一天从前一天的累计值跳到 total。 */
export interface EquityStep {
  /** 北京时间的日期，YYYY-MM-DD。 */
  day: string
  /** 这一天最后一场的开赛时刻，曲线在这里起跳。 */
  time: number
  /** 这一天的记录全部结算之后的累计值。 */
  total: number
  /** 这一天的盈亏合计。 */
  pnl: number
  points: EquityPoint[]
}

/** 时间与数值的显示范围。 */
export interface Domain {
  start: number
  end: number
  low: number
  high: number
}

/** 一张图的外框尺寸和四边留白（像素）。 */
export interface Frame {
  width: number
  height: number
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * 逐条结算并成结算日。同一天的几场比赛在时间轴上只隔几个像素，
 * 逐条画会在那里一上一下画出细小的尖刺，看起来像波动，其实只是当天几场的先后顺序；
 * 所以每天只取全部结算之后的累计值。points 已按开赛时间排好，同一天的记录相邻。
 */
export function toSteps(points: EquityPoint[]): EquityStep[] {
  const steps: EquityStep[] = []
  for (const point of points) {
    const day = beijingDay(point.record.commenceTime)
    const time = Date.parse(point.record.commenceTime)
    const last = steps[steps.length - 1]
    if (last && last.day === day) {
      last.time = time
      last.total = point.total
      last.pnl += point.pnl
      last.points.push(point)
    } else {
      steps.push({ day, time, total: point.total, pnl: point.pnl, points: [point] })
    }
  }
  return steps
}

/** 几条曲线共用的显示范围：数值一定包含零线，上下留出标注的位置；时间两头各留一小段。 */
export function domainOf(groups: EquityStep[][]): Domain {
  const steps = groups.flat()
  const times = steps.map((step) => step.time)
  const totals = steps.map((step) => step.total)
  const first = Math.min(...times)
  const last = Math.max(...times)
  const low = Math.min(0, ...totals)
  const high = Math.max(0, ...totals)
  const pad = Math.max(0.5, (high - low) * 0.16)
  // 左边留一段，让曲线从零线出发；右边留一段，让期末那一截平线看得见。
  const lead = Math.max(6 * HOUR, (last - first) * 0.03)
  return { start: first - lead, end: last + lead, low: low - pad, high: high + pad }
}

export function scaleOf(frame: Frame, domain: Domain) {
  const innerWidth = Math.max(10, frame.width - frame.left - frame.right)
  const innerHeight = Math.max(10, frame.height - frame.top - frame.bottom)
  return {
    left: frame.left,
    top: frame.top,
    right: frame.left + innerWidth,
    bottom: frame.top + innerHeight,
    x: (time: number) => frame.left + ((time - domain.start) / (domain.end - domain.start)) * innerWidth,
    y: (value: number) => frame.top + (1 - (value - domain.low) / (domain.high - domain.low)) * innerHeight,
    /** 横向像素位置对应的时刻。 */
    time: (px: number) => domain.start + ((px - frame.left) / innerWidth) * (domain.end - domain.start),
  }
}

export type Scale = ReturnType<typeof scaleOf>

/** 纵轴刻度：取整的间隔，条数不超过 maxCount。 */
export function yTicksOf(domain: Domain, maxCount: number): number[] {
  const span = domain.high - domain.low
  const step = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].find((size) => span / size <= maxCount) ?? 1000
  const ticks: number[] = []
  for (let index = Math.ceil(domain.low / step); index * step <= domain.high; index += 1) ticks.push(index * step)
  return ticks
}

/** 北京时间的星期几，0 是周日。北京时间没有夏令时，直接加八小时即可。 */
function beijingWeekday(time: number): number {
  return new Date(time + 8 * HOUR).getUTCDay()
}

/** 横轴刻度：落在北京时间的零点上；间隔达到一周时对齐到周一，和“每周表现”的分组一致。 */
export function xTicksOf(domain: Domain, maxCount: number): { time: number; label: string }[] {
  const days = (domain.end - domain.start) / DAY
  const step = [1, 2, 7, 14, 28, 56, 112].find((size) => days / size <= maxCount) ?? 224
  let cursor = Date.parse(`${beijingDay(new Date(domain.start))}T00:00:00+08:00`)
  if (cursor < domain.start) cursor += DAY
  if (step >= 7) while (beijingWeekday(cursor) !== 1) cursor += DAY
  const ticks: { time: number; label: string }[] = []
  for (; cursor <= domain.end; cursor += step * DAY) ticks.push({ time: cursor, label: dayLabel(cursor) })
  return ticks
}

/** 月/日，按北京时间。 */
export function dayLabel(time: number): string {
  return beijingDay(new Date(time)).slice(5).replace('-', '/')
}

/** 某个时刻的累计值：取这个时刻或之前最近的一步；还没有任何结算时是 0。 */
export function valueAt(steps: EquityStep[], time: number): number {
  let value = 0
  for (const step of steps) {
    if (step.time > time) break
    value = step.total
  }
  return value
}

/** 离某个时刻最近的一步的序号；没有任何一步时为 null。 */
export function nearestStep(steps: EquityStep[], time: number): number | null {
  let best: number | null = null
  let gap = Infinity
  steps.forEach((step, index) => {
    const distance = Math.abs(step.time - time)
    if (distance < gap) {
      gap = distance
      best = index
    }
  })
  return best
}

/** 阶梯线：从零线出发，每到一个结算日先横着走到那里，再竖着跳到新的累计值，最后平着延伸到右端。 */
export function stepPath(steps: EquityStep[], scale: Scale): string {
  let d = `M${scale.left.toFixed(1)} ${scale.y(0).toFixed(1)}`
  for (const step of steps) d += ` H${scale.x(step.time).toFixed(1)} V${scale.y(step.total).toFixed(1)}`
  return `${d} H${scale.right.toFixed(1)}`
}

export interface Drawdown {
  /** 从高点回落了多少单位，正数。 */
  depth: number
  /** 回落开始的高点；从起点（累计为 0）算起时为 null。 */
  from: EquityStep | null
  to: EquityStep
}

/** 最高点、最低点，以及最大回撤（从此前的高点回落得最深的一次，起点的 0 也算高点）。 */
export function extremesOf(steps: EquityStep[]): { high: EquityStep; low: EquityStep; drawdown: Drawdown | null } {
  let high = steps[0]
  let low = steps[0]
  let peak = 0
  let peakStep: EquityStep | null = null
  let drawdown: Drawdown | null = null
  for (const step of steps) {
    if (step.total > high.total) high = step
    if (step.total < low.total) low = step
    if (step.total > peak) {
      peak = step.total
      peakStep = step
    }
    const depth = peak - step.total
    if (depth > (drawdown?.depth ?? 0) + 1e-9) drawdown = { depth, from: peakStep, to: step }
  }
  return { high, low, drawdown }
}
