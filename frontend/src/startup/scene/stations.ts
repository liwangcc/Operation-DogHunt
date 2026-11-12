// 场景里可以互动的“站点”：每个站点对应系统的一个模块，记录它在房间里的位置和镜头停靠的机位。
import { Vector3 } from 'three'
import { DEG, polar } from './layout'

/** 与系统模块一一对应；assistant 是默认入口（NBA 助手聊天）。 */
export type StationId = 'assistant' | 'matches' | 'records' | 'statistics' | 'memory' | 'settings'

export interface Station {
  id: StationId
  /** 镜头聚焦时看向的点，也是悬停拾取的中心。 */
  focus: Vector3
  /** 拾取范围：指针对准的位置离 focus 多近算选中（米）。 */
  reach: number
  /** 聚焦时镜头停靠的位置。 */
  camera: Vector3
  /** 悬停或选中时，地面上那圈提示光环的圆心和半径。 */
  ring: { center: Vector3; radius: number }
}

/** 左侧弧形工作台上三个工位所在的方位。 */
export const consoleAngles = { matches: 160 * DEG, records: 180 * DEG, statistics: 200 * DEG } as const
/** 实墙上机柜组和控制面板所在的方位。 */
export const RACK_ANGLE = 243 * DEG
export const SETTINGS_ANGLE = 286 * DEG

function consoleStation(id: 'matches' | 'records' | 'statistics'): Station {
  const angle = consoleAngles[id]
  // 机位在座椅正上方略靠后，俯看三块屏幕，椅背不会挡住画面。
  return { id, focus: polar(angle, 9.05, 1.0), reach: 1.25, camera: polar(angle + 1.5 * DEG, 7.3, 1.9), ring: { center: polar(angle, 7.72), radius: 0.8 } }
}

export const STATIONS: Station[] = [
  // 战术桌：从斜前方俯视全息球场。
  { id: 'assistant', focus: new Vector3(0, 1.25, 0), reach: 2.4, camera: polar(292 * DEG, 5.3, 3.0), ring: { center: new Vector3(0, 0, 0), radius: 3.8 } },
  consoleStation('matches'),
  consoleStation('records'),
  consoleStation('statistics'),
  {
    id: 'memory',
    focus: polar(RACK_ANGLE, 9.1, 1.45),
    reach: 1.9,
    camera: polar(RACK_ANGLE - 3 * DEG, 5.5, 1.95),
    ring: { center: polar(RACK_ANGLE, 8.35), radius: 1.5 },
  },
  {
    id: 'settings',
    focus: polar(SETTINGS_ANGLE, 9.85, 1.5),
    reach: 0.95,
    camera: polar(SETTINGS_ANGLE - 4 * DEG, 6.9, 1.85),
    ring: { center: polar(SETTINGS_ANGLE, 9.15), radius: 0.75 },
  },
]
