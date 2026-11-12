// 启动页上的模块清单：每个模块对应场景里的一个站点，以及进入系统后要打开的页面。
import type { StationId } from './scene/stations'

export interface StartupModule {
  id: StationId
  /** 序号，与系统侧栏一致。 */
  mark: string
  label: string
  /** 进入后前往的页面地址。 */
  route: string
  /** 它在指挥室里的位置。 */
  place: string
  summary: string
  /** 模块还没有接入业务数据：进入后看到的是用虚构演示数据做的界面预览。 */
  planned: boolean
}

/** 说明文字沿用各模块页面自己的描述；记录、统计、记忆三个模块还没有后端接口，这里如实标注为界面预览。 */
export const STARTUP_MODULES: StartupModule[] = [
  { id: 'assistant', mark: '01', label: 'NBA 助手', route: '/', place: '战术桌', summary: '从一场比赛开始提问，结合已保存的比赛与盘口做分析。', planned: false },
  { id: 'matches', mark: '02', label: '比赛与盘口', route: '/matches', place: '一号工位', summary: '查看已开盘比赛的北京时间、让分与大小分，手动更新报价。', planned: false },
  { id: 'records', mark: '03', label: '预测记录', route: '/records', place: '二号工位', summary: '留住每次判断及当时的盘口，让后续复盘有据可查。', planned: true },
  { id: 'statistics', mark: '04', label: '效果统计', route: '/statistics', place: '三号工位', summary: '在积累真实赛前记录后，分别观察让分和大小分的表现。', planned: true },
  { id: 'memory', mark: '05', label: '长期记忆', route: '/memory', place: '机柜区', summary: '像一本有目录的笔记：父块组织主题，子块保存具体内容。', planned: true },
  { id: 'settings', mark: '06', label: '设置', route: '/settings', place: '控制面板', summary: '查看运行状态，调整本机的显示偏好；数据源与模型规则待后端支持。', planned: false },
]

export function moduleOf(id: StationId): StartupModule {
  return STARTUP_MODULES.find((module) => module.id === id) ?? STARTUP_MODULES[0]
}
