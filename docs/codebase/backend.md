# 后端服务｜模块子块

[返回父块](../../CODEBASE.md)

| 项目 | 当前记录 |
| --- | --- |
| 模块标识 | backend |
| 核对日期 | 2026-11-14（Asia/Shanghai） |
| 核对范围 | 本轮增量：近期战绩与 ESPN 伤病（见末尾“近期战绩与伤病增量”）：`integrations/espn.py`、`services/odds/team_form.py`、`services/odds/injuries.py`，赛程窗口扩到近 30 天并保留比分，赛程与伤病改为后台取数，聊天 `team_form` / `injuries`，提示词 sources_v3/odds_v4/method_v5/output_v4；上一增量：聊天预测模板 `chat_output_v3`（见“单场分析推导增量”），只改提示词与记录文件，代码未改；更早增量：免费赛程与休息天数（见末尾“免费赛程增量”）：`integrations/balldontlie.py`、`services/odds/schedule.py`、`refresh_board` 顺带取赛程、聊天 `schedule_rest`、提示词 sources_v2/odds_v3/method_v4；上一增量：聊天提速与预测改版（见末尾“聊天提速与必给倾向增量”）：思考强度默认改 `high`、流式接口 `/chat/stream`、按球队聚焦、市场信号 `signals.py`、提示词 odds_v2/method_v3/output_v2、`app.*` 日志输出；当日更早增量：后端思考强度配置与 `request_model` 请求；当日其他增量：功能块分数口径与 strength_v2（见“功能块框架增量”末尾）；功能块提示词目录、`services/analysis` 读取与检查框架、jsonschema 依赖与离线测试；聊天提示词迁到 `prompts/chat/` 并加锁文件检查，随后 `chat_method_v2` 与固定回归快照（均见“聊天提示词增量”）；盘口代码未改，沿用 2026-11-11 核对 |
| 实现状态 | 部分实现：真实聊天每次读取保存盘口，支持单场单平台；功能块框架可读取、拼装、检查并纠正一次，但只有草稿实力块（当前样板 strength_v2）且无调用入口；正式预测保存、记忆和任务恢复未实现 |
| 验证程度 | 本轮（战绩与伤病）90 项离线测试通过、`prompt check` 通过；ESPN 真实接口取一次，28 队 103 人全部对上（含快船写法）；BALLDONTLIE 本机未配置 Key，比分字段和翻页页数未实测；未调用真实模型。上一增量（output_v3）80 项离线测试通过、`prompt check` 通过；真实模型试跑 E-001、E-009 通过，其他用例未重跑。上一增量：全部离线测试 80 项通过、`prompt check` 通过；真实赛程接口已调用：13 场全部对上、休息天数已进入聊天上下文；未调用真实模型。上一增量：75 项通过，运行中的本机后端已出现 `/api/v1/chat/stream`，提速效果和新提示词效果都未实测。历史：当日早些时候 `test_chat.py` 21 项离线通过（当时默认 `xhigh`）；2026-11-13 离线测试 57 项通过（原 19 项 + 功能块 31 项 + 聊天提示词 7 项）；分数口径与 `chat_method_v2` 两项改动合并后，Windows 本机跑 60 项通过（`RouteTests` 未跑，见验证记录）；`chat_method_v2` 与功能块均未做真实模型调用；聊天真实问答为 2026-11-11 旧提示词的历史验证 |

## 负责什么

FastAPI 是提供后端接口的 Python 框架。后端提供连通检查、中转模型聊天、盘口快照读取及手动更新。聊天每次只读网站最新保存的快照，与用户资料一起交给模型，不保存聊天或正式预测，不自动调用外部盘口接口。

## 到哪里找实现

| 源码或配置 | 入口或关键符号 | 用途 |
| --- | --- | --- |
| [main.py](../../backend/app/main.py) | `create_app` / `app` / `_configure_logging` | 创建应用并以 `/api/v1` 注册接口；给 `app.*` 日志器配 INFO 终端输出（uvicorn 默认不输出它们） |
| [config.py](../../backend/app/core/config.py) | `Settings` / `get_settings` | 读取基础配置和模型配置，`model_reasoning_effort` 默认 `high`；Key 与额外认证头用 `SecretStr` 脱敏 |
| [router.py](../../backend/app/api/router.py) | `api_router` | 注册健康检查、聊天和同期新增的盘口路由 |
| [routes/health.py](../../backend/app/api/routes/health.py) | `health` | `GET /api/v1/health` |
| [schemas/health.py](../../backend/app/schemas/health.py) | `HealthResponse` | 返回 `status`、`app`、`environment` 和 `version` |
| [pyproject.toml](../../backend/pyproject.toml) | `requires-python` / `dependencies` | Python 3.12 起，依赖 FastAPI、pydantic-settings、uvicorn、httpx 和 jsonschema（2026-11-13 新增，锁定 4.26.0）；版本见 uv.lock |

## 输入、输出和依赖

- 输入：健康检查、模型状态请求，以及 `POST /api/v1/chat` 的 `messages`（user/assistant 交替、最后一条 user）和可选 `odds_selection`（`event_id`、`bookmaker_key`）；基础配置与 `DOGHUNT_MODEL_*`。
- 输出：健康检查、脱敏模型状态、完整回答和 token 用量，或安全错误提示；接口说明在 `/api/docs`。
- 调用方：[前端连接检查](frontend.md)。当前健康检查不调用 GPT、盘口或数据库。
- 配置：[后端配置示例](../../backend/.env.example)。模型配置定位后端自己的 `.env`，与[盘口工具](odds.md)的根目录 Key 独立；修改配置后须重启后端。

## 已实现与缺口

| 能力 | 当前情况 | 依据 |
| --- | --- | --- |
| 应用和健康检查 | 已有源码实现 | `create_app`、`health`、`HealthResponse` |
| 网页盘口 | 读取最新快照、手动更新一次、进程内互斥及 60 秒间隔；失败保留旧文件 | [odds 路由](../../backend/app/api/routes/odds.py)、[board.py](../../backend/app/services/odds/board.py) |
| 模型聊天 | 已实现：`POST /chat`（完整返回）与 `POST /chat/stream`（SSE：delta/done/error，开始推送前的错误仍用 HTTP 状态码）；每次只读最新快照，未选场时按问题里的球队聚焦，聚焦到 3 场以内附带市场信号；静态提示词来自 `prompts/chat/` 五个版本文件（资料等级、分析方法、预测模板），再追加北京时间与快照；传递历史、限制并发 | [service.py](../../backend/app/services/chat/service.py)、[prompt.py](../../backend/app/services/chat/prompt.py)、[odds_context.py](../../backend/app/services/chat/odds_context.py)、[聊天结构](../../backend/app/schemas/chat.py) |
| 功能块提示词与检查 | 部分实现：框架完成，见下方“功能块框架增量”；提示词为草稿，没有指标程序、批量脚本或接口调用它 | [prompts](../../backend/app/prompts/README.md)、[analysis](../../backend/app/services/analysis/runner.py) |
| 自动外部取数与记忆 | 未实现；聊天只读快照，不具备自动更新盘口或联网伤病工具 | [memory](../../backend/app/services/memory/__init__.py) |
| GPT 中转连接 | 已实现：Responses 流式接口，每次显式发送 `reasoning.effort`（后端可配，默认 `high`）；`stream_model` 边收边产出 `TextDelta`，最后产出完整结果，`request_model` 收齐后返回；日志记录首字时间、总耗时与 token 数；完整结果校验、总超时和错误脱敏，不自动重试、不跟随重定向 | [llm.py](../../backend/app/integrations/llm.py) |
| 数据库和持久化 | 未选定数据库、未建表，仅预留目录 | [db](../../backend/app/db/__init__.py)、[models](../../backend/app/models/__init__.py)、[repositories](../../backend/app/repositories/__init__.py) |
| 任务、超时恢复、定期维护 | 仅预留，没有后台任务 | [tasks](../../backend/app/tasks/__init__.py) |
| 聊天测试 | 本轮起含流式（逐段、完成、开始后失败释放锁、开始前 409/503）、球队聚焦与追问沿用、市场信号（`test_odds.py`）；原有 21 项 unittest 离线验证，包括默认/自定义思考强度的请求参数、盘口上下文、选场平台隔离、过期选择、输入、半截流、异常与并发，提示词锁文件与改版记录检查，以及回归用例引用的固定快照可用；不消耗真实额度 | [test_chat.py](../../backend/tests/test_chat.py) |

## 验证记录

| 日期 | 方式 | 实际结果与边界 |
| --- | --- | --- |
| 2026-11-13 | 聊天提速与必给倾向：`cd backend && .venv/bin/python -m unittest discover -s tests`、`prompt check`；`curl` 本机 `/api/openapi.json` | `Ran 75 tests / OK`，`check` 输出“通过”；运行中的后端已注册 `/api/v1/chat/stream`；离线测试里能看到“模型耗时”日志行。未调用真实模型：首字时间、`high` 与 `xhigh` 的速度差、中转是否逐段推送 `response.output_text.delta`、新提示词是否真的给倾向，都待真实试跑 |
| 2026-11-13 | `.venv/bin/python -m unittest discover -s tests -p test_chat.py -v`；读取实际配置；本地健康检查 | `Ran 21 tests in 0.093s / OK`，模拟请求验证默认 `xhigh` 和自定义 `high`；实际 `.env` 配置为 `xhigh`；开发服务自动重载，健康检查 `status: ok`。未调用真实模型，不能证明中转接受或执行此档位。 |
| 2026-11-11 | [项目骨架交接中的历史 HTTP 检查](../handoff/2026-11-11-Vue与FastAPI项目骨架.md) | 后端直连与前端转发健康检查均 HTTP 200，`/api/docs` HTTP 200；接口格式仅暴露已实现的健康检查，不证明外部服务或业务功能可用 |
| 2026-11-11 | 本轮真实中转与浏览器验证 | `gpt-6.1-sol` 返回“模型连接成功。”，HTTP 200，输入 246 / 输出 8 tokens；浏览器显示“网页模型连接成功。” |
| 2026-11-11 | `.venv/bin/python -m unittest discover -s tests -v` | `Ran 10 tests in 0.045s / OK`；不代表外部服务永久可用 |
| 2026-11-13 | `cd backend && .venv/bin/python -m unittest discover -s tests` | `Ran 50 tests in 0.081s / OK`；功能块全部用模拟模型调用，未消耗额度 |
| 2026-11-13 | 同上，加 `.venv/bin/python -m app.services.chat.prompt check` | `Ran 57 tests in 0.115s / OK`；`check` 输出“通过”；聊天提示词迁移后未做真实模型调用 |
| 2026-11-13 | 直接调用 `services.chat.service.chat` 跑 4 条核心回归用例（真实模型，已过期的保存快照，未刷新盘口） | 原期望下 3 条通过，E-002 未列报价；放宽期望后 4 条通过；输入 14476 / 输出 1164 tokens；未经 HTTP 与网页。详见 [试跑交接](../handoff/2026-11-13-聊天提示词核心回归试跑.md) |
| 2026-11-13 | Windows 本机：`test_blocks`、`test_odds` 与 `test_chat` 中除 `RouteTests` 外的类，加 `prompt check` | `Ran 50 tests / OK`，`check` 输出“通过”；`RouteTests` 8 项因本机缺 tzdata 未跑（另见 PR #3）。另用模拟模型调用按 `eval_cases.md` 的快照用法走了一次 `service.chat`，确认北京时间为 09:00、选场只含所选平台、`chat_method_v2` 已拼入；未调用真实模型，回归用例未跑 |
| 2026-11-13 | 合并功能块分数口径（PR #4）后，同上命令 | `Ran 60 tests / OK`（功能块 41 + 盘口 6 + 聊天 13），`check` 输出“通过”；`RouteTests` 仍未跑 |

已有启动命令是根目录 `make backend`；服务启动后可请求 `http://127.0.0.1:8000/api/v1/health`。配置、命令与依赖条件见 [README](../../README.md)，本轮复用了已运行的本地服务。

## 限制、未决事项与下一步

- 健康检查只反映应用能否响应，不检查外部服务或存储。
- 当前使用用户指定地址与模型名，项目独立 Key 已验证可用；不从 Codex 复制认证。数据库及生产部署仍待确定。
- 当前已接入卡片选场与保存盘口；下一步补充可靠数据工具和正式预测存储。快照不是实时行情，没有联网伤病或比分工具。
- 输入限制：最多 41 条消息、单条 12000 字符、总计 60000；默认 120 秒超时、最多输出 4096 tokens。超时后供应商可能仍已计费。
- 当前进程内并发限制不是跨进程任务系统；对话不保存，也不支持刷新恢复。认证错误与流中断只返回安全提示，不转发中转站原文。

## 盘口接口增量（2026-11-11）

| 入口 | 行为 |
| --- | --- |
| `GET /api/v1/odds` | 只读最新 `data/odds/*/snapshot.json`，无外部请求；无文件、文件损坏、无赛事用结构化状态区分，不悄悄退回旧文件 |
| `POST /api/v1/odds/refresh` | 要求 JSON Content-Type；手动请求一次供应商，新建 JSON/CSV，不覆盖旧快照；并发返回 409，60 秒内再请求返回 429；盘口保存后顺带取一次赛程（`schedule.log_refresh`），赛程失败只记日志，不影响返回 |
| [schemas/odds.py](../../backend/app/schemas/odds.py) | 返回来源、采集时间、新鲜度、事件、平台、玩法、方向、盘口和十进制赔率，不返回 Key 或路径 |
| [integrations/odds.py](../../backend/app/integrations/odds.py) | 通过固定文件路径加载原有脚本，复用 Key 加载、不重定向、15 秒请求超时与保存逻辑；部署需带上 `scripts/fetch_nba_odds.py` |

盘口配置仍用根目录 `.env.local` 的 `THE_ODDS_API_KEY`（环境变量优先），与模型配置独立。浏览器不持有 Key。15 分钟仅为页面“待更新”提示阈值，不是自动取数间隔。互斥和冷却是单进程保护，公网多进程部署前需另行设计认证及共享限流。

本轮 `.venv/bin/python -m unittest discover -s tests -p 'test_odds.py' -v` 输出 `Ran 6 tests in 0.018s / OK`，覆盖平台隔离、方向、不同大小分线、旧时间、缺失与损坏快照、成功及失败刷新、冷却和只读无外部请求。TestClient 有 httpx 弃用提示，不影响本轮测试。通过已有本地网站实际点击更新，返回 14 场、368 条报价、消耗 2 credits、剩余 496；命令行直连因沙箱 `Operation not permitted` 未完成，未将离线测试当作实际网络验证。

## 聊天盘口接入增量（2026-11-11）

- `service.chat` 在并发保护内通过 `asyncio.to_thread(read_board)` 读取最新快照，再由 `odds_context` 组装 JSON；不是模型自行调用联网工具。
- 未选场提供所有保存比赛及各平台；已选场只提供匹配比赛与平台。找不到比赛或平台返回 HTTP 409，模型不被调用；额外报价字段由 Pydantic 拒绝（422）。无快照或损坏时普通聊天可继续，但带 `unavailable` 状态。
- 保留来源、采集时间、过期标记、开赛时间、平台、玩法报价时间及每侧数值；提示中要求区分北京时间、过期快照、缺失资料和完整赛程，外部字段只作数据。
- 本次 `.venv/bin/python -m unittest discover -s tests -v`：`Ran 19 tests in 0.084s / OK`，包含 13 项聊天、6 项盘口。浏览器真实两次问答正确读出对阵及所选 DraftKings 数值；没有调用盘口刷新。详见 [交接](../handoff/2026-11-11-独立比赛页与AI盘口联动.md)。

## 项目独立模型配置（2026-11-11）

本次按用户确认清空复制来的模型 Key 与额外认证。项目 `backend/.env` 现已填写用户提供的 `https://relay.example` 和 `gpt-6.1-sol`，用户随后填入专用 Key，配置重载后状态为 true，真实网站后端请求 HTTP 200、回答“项目模型连接成功。”（输入 14358 / 输出 9 tokens）。配置源码只定位项目文件，支持显式 `DOGHUNT_*` 环境变量；没有读取 Codex 或其他应用配置的运行逻辑，今后也不从中导入凭证。文件权限 600，保留请求限额。此前真实调用记录为历史验证，不代表当前已配置。针对项目实际配置验证：未配置返回 503，外部客户端未被调用，模型状态接口返回 200、configured=false；没有发付费请求。

2026-11-11 专用 Key 真实验证：新进程已读到 Key，但运行中的 `get_settings` 仍缓存空配置；更新配置源码修改时间触发已有开发服务重载后，状态为 true。向实际 `/api/v1/chat` 发一次请求成功，未重试、未更新盘口。前述空配置测试为填写 Key 之前的历史记录，当前结果见[验证交接](../handoff/2026-11-11-项目专用模型Key验证.md)。

## 功能块框架增量（2026-11-13）

设计见 [功能块提示词与校验开发文档](../功能块提示词与校验开发文档.md)。每个功能块由 `blocks/{块}_v{版本}.md`（给模型）和同名 `.schema.json`（输入指标与输出 JSON Schema）组成，共用 `shared/rules.md`、`shared/glossary.md`。

| 源码 | 关键符号 | 用途 |
| --- | --- | --- |
| [registry.py](../../backend/app/services/analysis/registry.py) | `load_blocks` / `load_block` / `load_shared` / `BlockDefinitionError` / `BlockDefinition.markets` | 读取定义并做 L1 自检：成对文件、三处版本号、五个二级标题、schema 合法且 `required` 覆盖全部字段、`additionalProperties: false`、只用约定字段且每种玩法字段齐全（分数基准、修正二选一）、指标名规范且写进 `.md`、已登记业务规则；`insufficient_output` 按 schema 生成“数据不足”输出 |
| [checks.py](../../backend/app/services/analysis/checks.py) | `prepare_input` / `check_reply` / `PacketError` | L2：只收本块指标，比赛信息只收四个字段，混入盘口或其他指标即报错；非有限数字算缺失不补值。L3：只容忍外层代码块，拒收 NaN，jsonschema 一次收集全部错误。L3 不过不跑 L4；L4 先跑通用的 `market_errors` 再跑本块规则 |
| [rules.py](../../backend/app/services/analysis/rules.py) | `MARKETS` / `market_errors` / `insufficient_output` / `RULES` / `BlockRules` / `common_warnings` | L4：所有块的方向与分数符号矛盾（基准总分不查符号）、中性却非 0 判错误；缺失项漏报/误报、理由数字找不到来源判警告；实力块季初（少于 10 场或场次缺失）把握大于 50 判警告，阈值暂定；`margin_pts - elo_margin` 只记录 |
| [assemble.py](../../backend/app/services/analysis/assemble.py) | `assemble` / `correction_message` | 指令放 `instructions`，数据包放用户消息 `<game_data>`；`<` 转义防伪造结束标签；记录指令与数据的 SHA-256 及 shared 文件哈希 |
| [runner.py](../../backend/app/services/analysis/runner.py) | `run_block` / `BlockRun` | 缺核心指标不调用模型，记 `skipped`；有错误纠正一次，仍错为 `invalid`；只有警告不纠正；`ModelError` 不重试；默认复用 `request_model` |
| [report.py](../../backend/app/services/analysis/report.py) | `CheckReport` / `Issue` | 状态 ok / warning / invalid / skipped；只有前两种 `usable` |

- 当前只有实力块一个草稿块：[strength_v2](../../backend/app/prompts/blocks/strength_v2.md) 为样板，只输出让分，`reasons` 排在最前；旧版 strength_v1 保留，仍通过自检。指标名暂定，等指标程序完成后对齐。
- 尚未调用：`run_block` 没有接口、脚本或任务入口；结果不落盘，CSV 与原始 JSON 记录待批量脚本实现。
- [test_blocks.py](../../backend/tests/test_blocks.py) 41 项覆盖 L1 坏文件（临时目录，含玩法字段不全、分数口径二选一、未约定字段）、L2、L3、L4（含修正分数与总分符号、季初警告）、拼装隔离与哈希、标签注入、纠正流程与跳过；全部离线。
- 分数口径与把握刻度写在 [glossary.md](../../backend/app/prompts/shared/glossary.md)：`*_pts` 是完整基准，`*_adj_pts` 是修正，汇总时相加；把握分 0 / 低 / 中 / 高四档。改 shared 会改变所有块的提示词哈希。

## 聊天提示词增量（2026-11-13）

设计见 [聊天预测提示词设计文档](../聊天预测提示词设计文档.md)，维护流程见 [$chat-prompt-maintenance](../../.agents/skills/chat-prompt-maintenance/SKILL.md)。

| 源码或文件 | 关键符号 | 用途 |
| --- | --- | --- |
| [prompts/chat/](../../backend/app/prompts/chat/README.md) | `chat_{role,sources,odds,method,output}_v{n}.md` | 静态提示词，按此顺序拼装；第一行版本标识与文件名一致；当前版本以 `versions.lock.json` 的 `active` 为准（截至 2026-11-13：role v1、sources v2、odds v3、method v4、output v3） |
| [versions.lock.json](../../backend/app/prompts/chat/versions.lock.json) | `active` / `files` / `static_sha256` | 当前版本、各版本哈希与字数；只由命令生成 |
| [prompt.py](../../backend/app/services/chat/prompt.py) | `build` / `static_prompt` / `check` / `update_lock` / `main` | 读取与拼装（进程内缓存，改文件需重启）；`check` 核对哈希、未登记文件、旧版本被改或删、`CHANGELOG.md` 条目；`lock` 拒绝改写已登记版本 |
| [service.py](../../backend/app/services/chat/service.py) | `chat` | 静态提示词 + 北京时间 + 快照；日志记录版本与哈希前 12 位；文件和锁不一致只记警告，锁缺失或损坏返回 503 且不调用模型 |
| [CHANGELOG.md](../../backend/app/prompts/chat/CHANGELOG.md)、[issues.md](../../backend/app/prompts/chat/issues.md)、[eval_cases.md](../../backend/app/prompts/chat/eval_cases.md) | — | 改版记录、问题记录、7 条回归用例；每条用例注明所用快照 |
| [eval_snapshots/](../../backend/app/prompts/chat/eval_snapshots/S-001.json) | `_eval.now` / `_eval.selection` | 回归用的固定盘口快照，格式同保存快照；`S-001` 为合成数据，不是真实报价；`prompt.py` 只读 `chat_*.md`，不受影响 |

- 原 service.py 中的盘口规则迁入 `chat_odds_v1`，意思不变；新增资料等级、分析方法和预测模板会改变回答风格；2026-11-13 已真实试跑核心用例，结果见验证记录。
- `chat_method_v2`（I-001）：缺资料本身不再构成观望理由，只降低把握并写进缺失资料与风险；观望时要说明原因。改版后未真实试跑，效果待回归验证。
- 漏记录的手动修改由 `test_repository_prompts_are_recorded` 拦下；未装 Git 提交前检查（用户确认）。
- 本仓库此前没有日志配置，`logger.info` 是否出现在 uvicorn 输出中取决于运行时日志级别，未核对。


## 思考强度配置增量（2026-11-13）

- （已被下一节改为默认 `high`）`Settings.model_reasoning_effort` 对应 `DOGHUNT_MODEL_REASONING_EFFORT`，当时默认 `xhigh`（极高）；可选 none/minimal/low/medium/high/xhigh，具体支持档位由模型与中转决定。
- `request_model` 每次在请求中发送 `reasoning: {"effort": ...}`，聊天与功能块默认调用共用；中转报错不自动降档或重试，HTTP 400 安全提示中补充检查思考强度。前端没有新增调节控件。
- 保留 120 秒总超时及 4096 tokens 生成预算；极高强度可能增加等待、用量或触及截断，需要真实使用后按现象调整，未擅自增加预算。
- 只改请求配置，没有修改提示词文件和锁文件。

## 聊天提速与必给倾向增量（2026-11-13）

起因：用户反馈尼克斯 @ 步行者的选场分析两边都观望、不给数字、篇幅长，且等待太久（记为 `issues.md` I-002）。

| 源码或文件 | 关键符号 | 变化 |
| --- | --- | --- |
| [config.py](../../backend/app/core/config.py)、[.env.example](../../backend/.env.example) | `model_reasoning_effort` | 默认 `xhigh` → `high`；本机 `.env` 同步改为 `high`（用户要求） |
| [llm.py](../../backend/app/integrations/llm.py) | `TextDelta` / `stream_model` / `request_model` | 转发 `response.output_text.delta`；只有 `response.completed` 才产出完整 `ChatResponse`，之前的文字不算交付；JSON 兼容返回整段作为一个 delta；INFO 日志“模型耗时 effort= 首字= 总计= 输入= 输出= 思考=” |
| [service.py](../../backend/app/services/chat/service.py) | `build_instructions` / `chat` / `prepare_stream` / `busy` | 拼装提示前先读快照与历史快照；流式在生成器里获取并发锁，开始前再判断一次，连接断开随生成器释放 |
| [routes/chat.py](../../backend/app/api/routes/chat.py) | `stream_chat` | `POST /api/v1/chat/stream`，`text/event-stream`，`Cache-Control: no-store`、`X-Accel-Buffering: no` |
| [odds_context.py](../../backend/app/services/chat/odds_context.py) | `TEAM_ALIASES` / `mentioned_teams` / `focus_teams` / `odds_context` | 30 队中英文叫法；未选场时取最近一条提到球队的用户消息聚焦，写入 `focus`；找不到比赛时给空列表，不回退整表；13 场整表约 36KB，聚焦一场约 4.5KB |
| [signals.py](../../backend/app/services/odds/signals.py) | `event_lines` / `load_history` / `market_signals` | 主队视角让分点；各平台中位数共识、范围、各边最有利的线及平台、所选平台与共识的差、最早快照到当前的共识与所选平台线变动；最多读最近 60 份快照，按路径缓存 |
| [prompts/chat/](../../backend/app/prompts/chat/CHANGELOG.md) | `chat_odds_v2` / `chat_method_v3` / `chat_output_v2` | 两个玩法必须给倾向、不给观望；结论与预计范围置顶；300 字以内；去掉“资料不足，不给数字”；说明 `focus` 与 `market_signals` 用法。静态提示词 2520 → 3233 字 |

- 设计取舍：在只有盘口和模型记忆时，强制给出的倾向基本不含盘口之外的信息，靠把握分档（多为“低”）区分；用户已知悉并要求给方向。
- 当前只有 4 份保存快照，尼克斯 @ 步行者只出现在 1 份里，因此盘口变动信号要等多次手动更新后才有内容。
- 伤病、赛程休息天数和球队效率数据仍未接入，需要用户选定数据源（见交接）。
- 测试改动：`test_chat.py` 两个提示词用例改为从锁文件读取当前版本，不再写死 `chat_method_v2`；路由测试打桩 `load_history`，不读真实 `data/odds/`。

## 免费赛程增量（2026-11-13）

起因：方法里的“赛程与体能”一项每次只能写缺失（`issues.md` I-003）。用户选择先接 BALLDONTLIE 免费档（5 次/分钟，只有赛程，没有伤病）。

| 源码或文件 | 关键符号 | 变化 |
| --- | --- | --- |
| [balldontlie.py](../../backend/app/integrations/balldontlie.py) | `load_key` / `fetch_games` / `ScheduleError` | Key 读环境变量或根目录 `.env.local` 的 `BALLDONTLIE_API_KEY`，未配置返回 None；`GET /v1/games?dates[]=…&per_page=100`，`Authorization` 头直接放 Key；按 `next_cursor` 翻页最多 3 页，超出不保存；不跟随重定向、10 秒超时、不重试；错误不带原文 |
| [schedule.py](../../backend/app/services/odds/schedule.py) | `refresh_schedule` / `load_schedule` / `rest_context` / `TEAM_BY_ABBR` | 只取每场已开盘比赛的东部日期及其前 5 天（`needed_dates`，记入 `dates`）；不用起止范围，因为快照里有远期比赛（如圣诞大战）时范围会拉到 288 场、正好 3 页；按缩写对到 The Odds API 全名（快船两边写法不同），跳过延期；新建 `data/schedule/<UTC时间>-<id>/schedule.json`，不覆盖旧文件；最新一份损坏时不回退。东部日期用固定 UTC-5（Windows 没有 tzdata）。每支球队给 `rest_days`（0 为背靠背）、`rest_days_at_least`、`games_in_4_days`（含本场）、`previous_game`；赛程里找不到这场对阵时 `listed_in_schedule` 为 false；所需日期不全时 `not_covered`；前 5 天都没比赛记为 `rest_days_at_least: 5` |
| [board.py](../../backend/app/services/odds/board.py) | `refresh_board` | 盘口快照保存后调用 `schedule.log_refresh`，结果写日志；任何赛程异常都不改变盘口更新结果 |
| [odds_context.py](../../backend/app/services/chat/odds_context.py)、[service.py](../../backend/app/services/chat/service.py) | `odds_context(..., schedule)` / `build_instructions` | 读最新赛程（`to_thread`），选场或聚焦到 3 场以内时附带 `schedule_rest`；没有赛程时为 `unavailable` |
| [prompts/chat/](../../backend/app/prompts/chat/CHANGELOG.md) | `chat_sources_v2` / `chat_odds_v3` / `chat_method_v4` | 赛程快照算 A 级；说明 `schedule_rest` 字段；休息差作为一档倾向理由（排在所选平台差价之后、C 级打法之前），单独使用时把握不超过“中”。静态提示词 3233 → 3711 字 |

- 配置：`.env.example` 增加 `BALLDONTLIE_API_KEY=`；`.gitignore` 增加 `data/schedule/`。
- 测试：`test_odds.py` 新增 `ScheduleTests` 4 项（缩写映射与延期、休息天数与背靠背和窗口覆盖、未配置不请求与失败不留文件、翻页与 429，用 `httpx.MockTransport`）；刷新测试打桩 `log_refresh`；`test_chat.py` 新增 `schedule_rest` 用例，路由测试打桩 `load_schedule`。
- 验证：`cd backend && .venv/bin/python -m unittest discover -s tests` → `Ran 80 tests / OK`；`prompt check` → 通过。用户配置 Key 后直接调用 `refresh_schedule`（未更新盘口、未消耗 The Odds API 额度）：保存 87 场（12 个日期）；当前快照 13 场全部 `available`，13 场都在赛程里对上；`build_instructions` 对“尼克斯和步行者这场怎么看”带出 `schedule_rest`（步行者休 1 天，尼克斯休 1 天、4 天 3 赛）。未调用模型。
- `date` 字段：13 场（含美西 19:40 开赛）都按美国东部日期对上，与假设一致。`data/schedule/` 里第一份文件是改成按日期取数前的旧格式，`load_schedule` 只读最新一份，不影响。

## 单场分析推导增量（2026-11-13）

起因：尼克斯 @ 步行者选场预测只有结论和两条一句话依据，没说预计范围怎么来的，两个“把握低”都没有原因（`issues.md` I-004）。只改提示词与记录文件，后端代码未改。

| 源码或文件 | 关键符号 | 变化 |
| --- | --- | --- |
| [prompts/chat/](../../backend/app/prompts/chat/CHANGELOG.md) | `chat_output_v3`（替换 `chat_output_v2`） | 结论行每个把握加一句原因；让分、大小分分节，各有因素表（含缺失项）、“预计怎么来的”（共识线 → 调整 → 范围）、“把握说明”（命中哪档、补什么能升档）；单场 700 字以内（表格不计）；分档改写，休息差明确算“中”，报价差“1 分以内”为“低”，“高”要求 B 级或盘口明显移动且伤病已知。静态提示词 3711 → 4465 字 |

- 记录：`CHANGELOG.md`、`issues.md` I-004、`README.md` 版本表；`eval_cases.md` 更新 E-001 期望，新增核心用例 E-009（S-001 + E-008 赛程，DraftKings 掘金 -6.5 比共识 -6.75 有利 0.25 分、湖人背靠背）。
- 运行配置：`DOGHUNT_MODEL_MAX_OUTPUT_TOKENS` 默认 4096，且 `reasoning.effort=high` 的思考 token 也计入这个上限；E-009 实测输出 1326 tokens 未截断，更长回答未测。
- 验证：`cd backend && .venv/bin/python -m unittest discover -s tests` → `Ran 80 tests / OK`；`prompt check` → 通过。真实模型（`gpt-6.1-sol`）直接调用 `service.chat` 跑 E-001、E-009 各 1 次，均通过；E-009 输出 1326 tokens，未截断；未经 HTTP 与网页。详见 [交接](../handoff/2026-11-13-预测模板output_v3与回归试跑.md)。后端进程只读一次提示词，需重启后生效。

## 近期战绩与伤病增量（2026-11-14）

起因：选场分析依据单薄、没有来源，实力、节奏、伤病几项只能写缺失（`issues.md` I-005）。用户选择用 BALLDONTLIE 免费档比分算近期战绩、ESPN 取伤病；节奏和攻防效率（ESPN 球队统计，每次约 30 次请求）暂不做。

| 源码或文件 | 关键符号 | 变化 |
| --- | --- | --- |
| [balldontlie.py](../../backend/app/integrations/balldontlie.py) | `MAX_PAGES` | 翻页上限 3 → 4（近 30 天约 220 场，每页 100 场） |
| [schedule.py](../../backend/app/services/odds/schedule.py) | `FORM_DAYS` / `needed_dates(events, today)` / `normalize_games` / `refresh_schedule(..., today)` | 取数日期改为“每场比赛及前 5 天”加“东部今天及前 30 天”，仍按 `dates[]` 取；已结束（`status_state` 为 final，旧字段时 `status` 为 Final）且有比分的比赛保存 `home_score` / `away_score`；记录新增 `form_from` |
| [team_form.py](../../backend/app/services/odds/team_form.py) | `team_summary` / `form_context` | 新文件。每队只统计本场东部日期之前的已结束比赛：场数、胜负、场均净胜分、场均得失分、场均总分、主客场分项（`at_home` / `on_road`）、最近 10 场、最后一场日期；每场给 `home_minus_away_avg_margin`。旧格式赛程（没有比分）返回 `unavailable` |
| [espn.py](../../backend/app/integrations/espn.py) | `fetch_injuries` / `InjuryError` | 新文件。`site.api.espn.com/.../nba/injuries`，非官方、无 Key；25 秒超时、不跟随重定向、不重试 |
| [injuries.py](../../backend/app/services/odds/injuries.py) | `normalize_injuries` / `refresh_injuries` / `load_injuries` / `injury_context` / `log_refresh` | 新文件。按 30 队对名（ESPN 写 “LA Clippers”），每人保留姓名、位置、状态、报告时间、部位、预计复出、短评（截 160 字）；全都对不上时视为格式变化不保存；新建 `data/injuries/<UTC时间>-<id>/injuries.json`；最新一份损坏不回退；采集超过 12 小时标 `stale`；`listed: false` 表示 ESPN 未列出该队 |
| [board.py](../../backend/app/services/odds/board.py) | `start_extras` | 盘口保存后改为后台线程依次跑赛程与伤病（两者合计可能超过前端更新的 25 秒超时）；上一轮未结束时跳过，避免触发 BALLDONTLIE 5 次/分钟限制 |
| [odds_context.py](../../backend/app/services/chat/odds_context.py)、[service.py](../../backend/app/services/chat/service.py) | `odds_context(..., schedule, injuries)` / `build_instructions` | 选场或聚焦到 3 场以内时附带 `team_form`、`injuries`（与 `schedule_rest` 同条件）；读最新伤病用 `to_thread` |
| [prompts/chat/](../../backend/app/prompts/chat/CHANGELOG.md) | `chat_sources_v3` / `chat_odds_v4` / `chat_method_v5` / `chat_output_v4` | A 级按来源细分并要求写出来源；说明两个新字段；战绩推算（净胜分差 + 2 分主场）与共识差 3 分以上、总分差 4 分以上才算选边理由（门槛未经数据验证）；早于最后一场的缺阵不重复计算；已公布伤病和休息差视为盘口已计入，只靠它们不超过“中”。静态提示词 4465 → 6551 字 |

- 配置：`.gitignore` 增加 `data/injuries/`；没有新依赖，没有新环境变量。
- 回归资料：新增 `eval_snapshots/D-001.json`（合成赛程比分与伤病，配合 S-001），`eval_cases.md` 新增 E-010（核心）、E-011；`EvalSnapshotTests` 核对 D-001 数字。
- 测试：`test_odds.py` 新增比分保留、30 天窗口、`TeamFormTests` 2 项、`InjuryTests` 4 项、后台补充取数 1 项；刷新测试改为打桩 `start_extras`；`test_chat.py` 新增上下文用例和 D-001 用例，路由测试打桩 `load_injuries`。
- 验证：`cd backend && .venv/Scripts/python.exe -m unittest discover -s tests` → `Ran 90 tests / OK`；`prompt check` → 通过。ESPN 真实请求 1 次：200，28 队、103 人，全部对上。BALLDONTLIE 本机未配置 Key，没有实测 `status_state` 与比分字段、近 30 天的实际页数；未调用模型，E-010、E-011 未试跑。
- 风险：ESPN 接口无文档，字段可能变化或被限制，服务条款未核实；伤病可能滞后于球队官方报告。原始净胜分没按对手强弱调整，季初样本小（少于 5 场只作参照）。赛程与伤病在后台取，刚点完更新就提问时可能还是上一份数据。
