// 比赛与盘口的显示格式：球队中文名与队色、北京时间、盘口正负号、赔率格式和倒计时。
import { demoTeam } from '@/demo/league'
import { preferences } from '@/stores/preferences'

const teams: Record<string, [string, string, string]> = {
  'Atlanta Hawks': ['老鹰', 'ATL', '#b34840'],
  'Boston Celtics': ['凯尔特人', 'BOS', '#318365'],
  'Brooklyn Nets': ['篮网', 'BKN', '#536269'],
  'Charlotte Hornets': ['黄蜂', 'CHA', '#42888e'],
  'Chicago Bulls': ['公牛', 'CHI', '#b94b57'],
  'Cleveland Cavaliers': ['骑士', 'CLE', '#925063'],
  'Dallas Mavericks': ['独行侠', 'DAL', '#3976a5'],
  'Denver Nuggets': ['掘金', 'DEN', '#9e7933'],
  'Detroit Pistons': ['活塞', 'DET', '#547dae'],
  'Golden State Warriors': ['勇士', 'GSW', '#426eb0'],
  'Houston Rockets': ['火箭', 'HOU', '#bd5251'],
  'Indiana Pacers': ['步行者', 'IND', '#9a7b35'],
  'Los Angeles Clippers': ['快船', 'LAC', '#4975a4'],
  'Los Angeles Lakers': ['湖人', 'LAL', '#88659f'],
  'Memphis Grizzlies': ['灰熊', 'MEM', '#6486ad'],
  'Miami Heat': ['热火', 'MIA', '#b44f4f'],
  'Milwaukee Bucks': ['雄鹿', 'MIL', '#4a7e66'],
  'Minnesota Timberwolves': ['森林狼', 'MIN', '#4b7281'],
  'New Orleans Pelicans': ['鹈鹕', 'NOP', '#8e7046'],
  'New York Knicks': ['尼克斯', 'NYK', '#bf7542'],
  'Oklahoma City Thunder': ['雷霆', 'OKC', '#4b8fb0'],
  'Orlando Magic': ['魔术', 'ORL', '#507ca3'],
  'Philadelphia 76ers': ['76人', 'PHI', '#4a76a6'],
  'Phoenix Suns': ['太阳', 'PHX', '#ad764d'],
  'Portland Trail Blazers': ['开拓者', 'POR', '#b65c57'],
  'Sacramento Kings': ['国王', 'SAC', '#856298'],
  'San Antonio Spurs': ['马刺', 'SAS', '#6c7c81'],
  'Toronto Raptors': ['猛龙', 'TOR', '#b35858'],
  'Utah Jazz': ['爵士', 'UTA', '#687799'],
  'Washington Wizards': ['奇才', 'WAS', '#576f93'],
}

/** 返回 [中文名, 缩写, 队色]；演示数据里的虚构球队也从这里取，查不到的名字原样显示。 */
export function team(name: string): [string, string, string] {
  const known = teams[name]
  if (known) return known
  const demo = demoTeam(name)
  return demo ? [demo.name, demo.code, demo.color] : [name, name.slice(0, 3).toUpperCase(), '#7f95a8']
}
export function beijingDay(date: Date | string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(date))
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)?.value).join('-')
}
export function dateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : '时间未知'
}
/** 带正负号的盘口数值；负号用真正的减号（−），和加号一样宽，上下两行才对得齐。 */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0'
}

/** 赔率按本机偏好显示：十进制，或香港盘水位（十进制减 1）；内部一律是十进制。 */
export function price(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return (preferences.oddsFormat === 'hk' ? value - 1 : value).toFixed(2)
}
/** 只取北京时间的时和分。 */
export function clockTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
}
/** 距离某个时刻还有多久，写成 2 天 03:15:42 或 03:15:42；已经过了返回空字符串。 */
export function countdown(target: string, now: number): string {
  const left = Math.floor((Date.parse(target) - now) / 1000)
  if (!(left > 0)) return ''
  const days = Math.floor(left / 86400)
  const pad = (value: number) => String(value).padStart(2, '0')
  const clock = `${pad(Math.floor((left % 86400) / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`
  return days ? `${days} 天 ${clock}` : clock
}
/** 多久以前：刚刚、12 分钟前、3 小时前、5 天前。 */
export function ago(value: string | number, now: number): string {
  const minutes = Math.floor((now - (typeof value === 'number' ? value : Date.parse(value))) / 60000)
  if (!(minutes >= 1)) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`
  return `${Math.floor(minutes / 1440)} 天前`
}
