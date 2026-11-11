# 后端服务｜模块子块

[返回父块](../../CODEBASE.md)

| 项目 | 当前记录 |
| --- | --- |
| 模块标识 | backend |
| 核对日期 | 2026-11-11（Asia/Shanghai） |
| 核对范围 | 当日增量：聊天可选选场参数、只读盘口上下文与服务端提示、相关调用与测试 |
| 实现状态 | 部分实现：真实聊天每次读取保存盘口，支持单场单平台；正式预测保存、记忆和任务恢复未实现 |
| 验证程度 | 本次 19 项离线检查与浏览器两次真实模型问答通过；未验证自动外部取数和持久化 |

## 负责什么

FastAPI 是提供后端接口的 Python 框架。后端提供连通检查、中转模型聊天、盘口快照读取及手动更新。聊天每次只读网站最新保存的快照，与用户资料一起交给模型，不保存聊天或正式预测，不自动调用外部盘口接口。

## 到哪里找实现

| 源码或配置 | 入口或关键符号 | 用途 |
| --- | --- | --- |
| [main.py](../../backend/app/main.py) | `create_app` / `app` | 创建应用并以 `/api/v1` 注册接口 |
| [config.py](../../backend/app/core/config.py) | `Settings` / `get_settings` | 读取基础配置和模型配置；Key 与额外认证头用 `SecretStr` 脱敏 |
| [router.py](../../backend/app/api/router.py) | `api_router` | 注册健康检查、聊天和同期新增的盘口路由 |
| [routes/health.py](../../backend/app/api/routes/health.py) | `health` | `GET /api/v1/health` |
| [schemas/health.py](../../backend/app/schemas/health.py) | `HealthResponse` | 返回 `status`、`app`、`environment` 和 `version` |
| [pyproject.toml](../../backend/pyproject.toml) | `requires-python` / `dependencies` | Python 3.12 起，依赖 FastAPI、pydantic-settings、uvicorn 和 httpx；版本见 uv.lock |

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
| 模型聊天 | 已实现：每次只读最新快照，补充北京时间、数据来源与平台隔离要求，传递历史、限制并发 | [service.py](../../backend/app/services/chat/service.py)、[odds_context.py](../../backend/app/services/chat/odds_context.py)、[聊天结构](../../backend/app/schemas/chat.py) |
| 自动外部取数与记忆 | 未实现；聊天只读快照，不具备自动更新盘口或联网伤病工具 | [analysis](../../backend/app/services/analysis/__init__.py)、[memory](../../backend/app/services/memory/__init__.py) |
| GPT 中转连接 | 已实现：Responses 流式接口、完整结果校验、总超时和错误脱敏，不自动重试、不跟随重定向 | [llm.py](../../backend/app/integrations/llm.py) |
| 数据库和持久化 | 未选定数据库、未建表，仅预留目录 | [db](../../backend/app/db/__init__.py)、[models](../../backend/app/models/__init__.py)、[repositories](../../backend/app/repositories/__init__.py) |
| 任务、超时恢复、定期维护 | 仅预留，没有后台任务 | [tasks](../../backend/app/tasks/__init__.py) |
| 聊天测试 | 13 项 unittest 离线验证，包括盘口上下文、选场平台隔离、过期选择、输入、半截流、异常与并发；不消耗真实额度 | [test_chat.py](../../backend/tests/test_chat.py) |

## 验证记录

| 日期 | 方式 | 实际结果与边界 |
| --- | --- | --- |
| 2026-11-11 | [项目骨架交接中的历史 HTTP 检查](../handoff/2026-11-11-Vue与FastAPI项目骨架.md) | 后端直连与前端转发健康检查均 HTTP 200，`/api/docs` HTTP 200；接口格式仅暴露已实现的健康检查，不证明外部服务或业务功能可用 |
| 2026-11-11 | 本轮真实中转与浏览器验证 | `gpt-6.1-sol` 返回“模型连接成功。”，HTTP 200，输入 246 / 输出 8 tokens；浏览器显示“网页模型连接成功。” |
| 2026-11-11 | `.venv/bin/python -m unittest discover -s tests -v` | `Ran 10 tests in 0.045s / OK`；不代表外部服务永久可用 |

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
| `POST /api/v1/odds/refresh` | 要求 JSON Content-Type；手动请求一次供应商，新建 JSON/CSV，不覆盖旧快照；并发返回 409，60 秒内再请求返回 429 |
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
