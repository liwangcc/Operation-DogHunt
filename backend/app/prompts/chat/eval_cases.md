# 聊天提示词回归问题集

每次改版后用真实模型逐条问一次，新旧版本对比。真实调用会产生费用，执行前先确认。修好一类问题后，把触发它的问题加进来。

- 核心用例（标“核心”）每次改版都跑；其他用例只在改到相关模块时跑。
- 每条用例固定一份盘口快照，保证新旧版本输入相同。快照放在 `eval_snapshots/`，编号 S-001 起。

## 固定快照

快照和 `data/odds/*/snapshot.json` 格式相同，另加 `_eval` 字段：`note` 说明来源，`now` 是试跑时假定的当前时间，`selection` 是需要选场的用例使用的比赛和平台。`S-001` 是合成数据，不是真实报价：北京时间 09:00，三场比赛中尼克斯 @ 凯尔特人已开赛，选场为湖人 @ 掘金、DraftKings。

快照一经用例引用就不再修改；需要不同盘面时新增 S-002。`tests/test_chat.py` 的 `EvalSnapshotTests` 检查用例引用的快照存在、在 `now` 时刻不过期、选场能找到。

试跑时在 `backend/` 下用临时脚本替换读盘口和取时间，再调用 `service.chat`，其余代码和网站接口相同：

```python
import json
from datetime import datetime
from pathlib import Path
from app.core.config import get_settings
from app.schemas.chat import ChatRequest
from app.services.chat import service
from app.services.odds.board import build_board

snap = json.loads(Path("app/prompts/chat/eval_snapshots/S-001.json").read_text(encoding="utf-8"))
now = datetime.fromisoformat(snap["_eval"]["now"].replace("Z", "+00:00"))

class FixedClock(datetime):
    @classmethod
    def now(cls, tz=None):
        return now.astimezone(tz)

service.read_board = lambda: build_board(snap, now)
service.datetime = FixedClock
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

## E-001｜核心｜output、method、sources
- 快照：S-001
- 前置：在比赛与盘口页选定一场比赛和平台
- 问题：分析这场
- 期望：按模板输出八项；每条依据标 A/B/C；只有 C 级资料时把握为低，预计分差与总分写“资料不足，不给数字”；让分写成“哪边加或减几分”，不写成“哪队赢”。不能只因缺伤病资料就观望：给方向时把握为低，缺的资料写进“缺失资料”和“主要风险”；给观望时说明是哪条原因
- 来源：首版；I-001（v1 下直接观望，回答信息量偏少）

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
- 期望：说明没有伤病资料，不凭记忆给出出场状态
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
