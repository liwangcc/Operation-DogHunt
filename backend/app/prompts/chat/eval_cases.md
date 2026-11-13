# 聊天提示词回归问题集

每次改版后用真实模型逐条问一次，新旧版本对比。真实调用会产生费用，执行前先确认。修好一类问题后，把触发它的问题加进来。

- 核心用例（标“核心”）每次改版都跑；其他用例只在改到相关模块时跑。
- 每条用例固定一份盘口快照，保证新旧版本输入相同。快照放在 `eval_snapshots/`，编号 S-001 起。

## 固定快照

快照和 `data/odds/*/snapshot.json` 格式相同，另加 `_eval` 字段：`note` 说明来源，`now` 是试跑时假定的当前时间，`selection` 是需要选场的用例使用的比赛和平台。`S-001` 是合成数据，不是真实报价：北京时间 09:00，三场比赛中尼克斯 @ 凯尔特人已开赛，选场为湖人 @ 掘金、DraftKings。

快照一经用例引用就不再修改；需要不同盘面时新增 S-002。`tests/test_chat.py` 的 `EvalSnapshotTests` 检查用例引用的快照存在、在 `now` 时刻不过期、选场能找到。

赛程比分和伤病放在 `D-` 文件（例如 `D-001.json`），`schedule` 和 `injuries` 两个字段的格式分别和 `data/schedule/*/schedule.json`、`data/injuries/*/injuries.json` 相同，`_eval.for` 写配合的盘口快照。`D-001` 是合成数据，配合 S-001：掘金 9 场场均净胜 +6.0、场均总分 232，湖人 10 场场均净胜 -1.0、场均总分 236；湖人 11-12 刚打完（背靠背），掘金 11-10 后休 2 天；伤病里湖人头号得分手 Lakers Guard A 在湖人最后一场之后报告缺阵，Lakers Center B 本季一直缺阵，掘金替补 Nuggets Wing C 出场待定。D 文件同样一经引用不再修改，`EvalSnapshotTests` 检查这些数字。

试跑时在 `backend/` 下用临时脚本替换读盘口和取时间，再调用 `service.chat`，其余代码和网站接口相同：

```python
import json
from datetime import datetime
from pathlib import Path
from app.core.config import get_settings
from app.schemas.chat import ChatRequest
from app.services.chat import service
from app.services.odds import injuries
from app.services.odds.board import build_board

snap = json.loads(Path("app/prompts/chat/eval_snapshots/S-001.json").read_text(encoding="utf-8"))
now = datetime.fromisoformat(snap["_eval"]["now"].replace("Z", "+00:00"))

class FixedClock(datetime):
    @classmethod
    def now(cls, tz=None):
        return now.astimezone(tz)

service.read_board = lambda: build_board(snap, now)
service.datetime = FixedClock
injuries.datetime = FixedClock         # 伤病过期判断也使用快照时间，避免 D-001 随真实日期变旧
service.load_history = lambda: []      # 不读本机真实的历史快照
service.load_schedule = lambda: None   # 不读本机真实赛程；E-008 换成该用例给出的固定赛程，E-010、E-011 换成 D-001 的 schedule
service.load_injuries = lambda: None   # 不读本机真实伤病；E-010、E-011 换成 D-001 的 injuries
# 之后 await service.chat(ChatRequest(...), get_settings())；选场用例的 odds_selection 取 snap["_eval"]["selection"]
```

格式：

```markdown
## E-001｜核心｜相关模块
- 快照：S-001
- 前置：是否选场、对话里已有哪些内容
- 问题：
- 期望：
- 来源：首版 / issues.md 的编号
```

## E-001｜核心｜output、method、sources、odds
- 快照：S-001
- 前置：在比赛与盘口页选定一场比赛和平台
- 问题：分析这场
- 期望：结论、预计放在第一、二行；让分和大小分都给出倾向的一边，不出现“观望”；预计分差与总分都给范围，且和倾向一致；结论行每个把握后有一句原因；让分、大小分各有因素表（缺失的因素也列出，每行标 A/B/C）、“预计怎么来的”（从共识线出发）和“把握说明”（命中哪档、补什么能升档）；用到 market_signals 时让分写成双方写法（“某队 +x / 某队 -x”），不把主队视角的点数原样写出；只有 C 级资料和 1 分以内报价差时把握为低；不为凑行数补 C 级泛泛判断；表格外约 700 字以内，没有开场白、结尾总结和免责声明；让分写成“哪边加或减几分”，不写成“哪队赢”
- 来源：首版；I-001（v1 下直接观望）；I-002（v2 下仍观望、不给数字、篇幅长）；I-004（v3 起要求写推导和把握原因，放宽 300 字）

## E-002｜核心｜output、odds
- 快照：S-001
- 前置：不选场
- 问题：今天有哪些比赛
- 期望：不用预测模板，不对每场展开分析；按北京时间列出快照里的比赛；已过开赛时间的比赛说明只是赛前记录；说明快照不代表完整赛程，过期时提醒更新。不要求列报价；如果列了报价，必须注明平台和报价时间，不混用平台
- 来源：首版；2026-11-13 首次试跑后放宽“必须列报价”（问题只问有哪些比赛，比赛已开赛时列报价没有意义）

## E-003｜核心｜sources
- 快照：S-001
- 前置：选定一场
- 问题：某某球员今天打不打（换成该场任一球员）
- 期望：说明没有伤病资料，不凭记忆给出出场状态（`load_injuries` 返回 None；有伤病资料时见 E-011）
- 来源：首版

## E-004｜output、sources
- 快照：S-001
- 前置：E-001 之后
- 问题：补充一条伤病资料，例如“主队首发控卫今天缺阵”
- 期望：把这条标为 B 级（用户提供，未核验）；说明哪条判断变了，没变的不重复
- 来源：首版

## E-005｜output
- 快照：S-001
- 前置：E-001 之后
- 问题：如果主队头号球星缺阵呢
- 期望：标明是假设分析；原判断保留，另给假设下的判断
- 来源：首版

## E-006｜核心｜output
- 快照：S-001
- 前置：E-001 之后，且模型判断不是主队
- 问题：我觉得应该选主队
- 期望：解释理由，不因用户没有新资料的反驳而改判断
- 来源：首版

## E-007｜核心｜odds、method
- 快照：S-001
- 前置：不选场
- 问题：湖人这场怎么看（换成快照里任一已开盘比赛的一支球队的中文名）
- 期望：只分析这支球队的比赛，不要求用户先去选场；注明所用平台，跨平台引用 market_signals 时说明是共识；movement 的 snapshots 为 1 时不说盘口有变动
- 来源：I-002（未选场时按球队聚焦与市场信号）

## E-008｜核心｜odds、method、sources
- 快照：S-001；赛程用下面的固定记录（合成数据），试跑时 `service.load_schedule = lambda: SCHEDULE`
  ```python
  SCHEDULE = {"provider": "BALLDONTLIE", "fetched_at": "2026-11-14T00:00:00Z", "dates": ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"], "games": [
      {"id": 1, "date": "2026-11-10", "home": "Denver Nuggets", "away": "Utah Jazz", "status": "Final"},
      {"id": 2, "date": "2026-11-12", "home": "Los Angeles Lakers", "away": "Phoenix Suns", "status": "Final"},
      {"id": 3, "date": "2026-11-13", "home": "Denver Nuggets", "away": "Los Angeles Lakers", "status": "7:00 pm ET"}]}
  ```
- 前置：选定湖人 @ 掘金、DraftKings（S-001 的 selection）
- 问题：分析这场
- 期望：依据或缺失资料里写出“湖人背靠背、掘金休 2 天”，标 A 级；休息差作为理由时说明盘口通常已计入，单凭它把握不超过“中”；不因赛程资料推断伤病；另跑一次 `load_schedule` 返回 None，回答写“赛程与体能缺失”，不凭记忆说背靠背
- 来源：I-003（接入免费赛程后的休息天数）

## E-009｜核心｜output、method
- 快照：S-001；赛程用 E-008 的固定记录（湖人背靠背、掘金休 2 天）
- 前置：选定湖人 @ 掘金、DraftKings（S-001 的 selection）
- 问题：帮我预测一下这场
- 期望：让分节的因素表里有报价差、休息差两行（数据照 market_signals 和 schedule_rest），伤病一行写“缺失”；“预计怎么来的”写出共识线、向哪边调几分、调整对应哪几行，范围中点和倾向一致；伤病未知时两个玩法都不能是“高”；让分倾向掘金且没有同等分量的反向因素时把握为“中”，说明命中“休息差”，并写出补伤病资料后可能的变化；大小分只用报价差时把握为“低”，不把休息差直接算进大小分，除非写明理由
- 来源：I-004（把握没有原因、预计没有推导；休息差的档位有歧义）

## E-010｜核心｜odds、method、output、sources
- 快照：S-001；赛程比分和伤病用 D-001，试跑时 `service.load_schedule = lambda: D["schedule"]`、`service.load_injuries = lambda: D["injuries"]`
- 前置：选定湖人 @ 掘金、DraftKings（S-001 的 selection）
- 问题：分析这场
- 期望：战绩一行写出掘金 +6.0（9 场）、湖人 -1.0（10 场），推算掘金赢约 9，和共识 6.75 差约 2，写成与市场一致、不作为选边理由；伤病一行写 Lakers Guard A 缺阵（新伤病，指向掘金），注明 ESPN、采集时间和可能滞后，Lakers Center B 写成本季一直缺阵、已在战绩里、不重复计算，Nuggets Wing C 只算出场待定；让分倾向掘金，把握“中”，说明新伤病和休息差盘口通常已计入，所以不是“高”；大小分推算总分约 234、与共识 231 差 3 分，写成一致，把握“低”，如果用伤病解释大小分要写明理由；资料列写出 BALLDONTLIE、ESPN、DraftKings 等具体来源，不只写字母；不凭记忆评价这几名虚构球员
- 来源：I-005（接入近期战绩和伤病后，依据要有数字和来源）

## E-011｜odds、sources
- 快照：S-001；D-001 同 E-010
- 前置：选定湖人 @ 掘金、DraftKings
- 问题：Lakers Guard A 今天打不打？掘金那边有人缺阵吗
- 期望：Guard A 按 ESPN 写“缺阵”，附报告时间和 ESPN 采集时间（北京时间），说明非官方、可能滞后，建议开赛前看球队官方报告；掘金写 Nuggets Wing C 出场待定，不说成缺阵；不加入 D-001 里没有的球员
- 来源：I-005
