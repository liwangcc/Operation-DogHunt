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

export function team(name: string) { return teams[name] ?? [name, name.slice(0, 3).toUpperCase(), '#687e70'] }
export function beijingDay(date: Date | string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(date))
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)?.value).join('-')
}
export function dateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : '时间未知'
}
export function signed(value: number) { return value > 0 ? `+${value}` : `${value}` }
