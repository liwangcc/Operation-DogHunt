# 前端网站｜模块子块

[返回父块](../../CODEBASE.md)

| 项目 | 当前记录 |
| --- | --- |
| 模块标识 | frontend |
| 核对日期 | 2026-11-11（Asia/Shanghai） |
| 核对范围 | 当日增量：独立比赛页、导航、跨页聊天保留、选场与聊天快照接入 |
| 实现状态 | 部分实现：独立比赛盘口页面与真实模型聊天联动；正式预测记录与记忆未接入 |
| 验证程度 | 本次构建、19 项后端离线测试与浏览器两次真实问答通过；宽窄布局沿用历史证据，未验证手机实机 |

## 负责什么

Vue 负责显示页面，TypeScript 用于检查数据和代码格式，Vue Router 管页面地址之间的切换。前端承担页面布局、连接状态、真实模型聊天和本次打开网站时的对话上下文。比赛与盘口在独立 `/matches` 页面，聊天在 `/`；卡片选场后带比赛及平台标识进入聊天，由后端读取报价。

## 到哪里找实现

| 源码或配置 | 入口或关键符号 | 用途 |
| --- | --- | --- |
| [main.ts](../../frontend/src/main.ts) / [App.vue](../../frontend/src/App.vue) | 应用启动 / `AppShell` / `KeepAlive` | 装入布局与当前页面，仅缓存 `ChatView`，切换页面保留对话与输入 |
| [router/index.ts](../../frontend/src/router/index.ts) | `createRouter` | 注册聊天首页、独立比赛页、记录、统计、记忆、设置和未知地址页面 |
| [MatchesView.vue](../../frontend/src/views/MatchesView.vue) | `MatchBoard` | 独立比赛页 `/matches`，不嵌在聊天内 |
| [oddsSelection.ts](../../frontend/src/stores/oddsSelection.ts) | `oddsSelection` | 内存共享比赛与平台选择；不保存报价、不持久化 |
| [AppShell.vue](../../frontend/src/components/layout/AppShell.vue) | `BackendStatus` | 公共侧栏与顶部连接状态 |
| [ChatView.vue](../../frontend/src/views/ChatView.vue) | `chat-input` | 模型状态、发送、等待、错误、当前页历史与新对话；未配置或等待时禁用发送 |
| [FeaturePlaceholder.vue](../../frontend/src/components/common/FeaturePlaceholder.vue) | 预留页组件 | 说明后续功能，当前不接业务数据 |
| [useBackendHealth.ts](../../frontend/src/composables/useBackendHealth.ts) | `useBackendHealth` / `check` | 页面打开时检查连接，并阻止检查重复进行 |
| [client.ts](../../frontend/src/api/client.ts) / [health.ts](../../frontend/src/api/health.ts) | `getJson` / `getHealth` | GET 为 5 秒超时，POST 聊天按后端超时加 10 秒；脱敏错误提示及格式核对 |
| [vite.config.ts](../../frontend/vite.config.ts) | `proxy` | 本机开发与预览时将 `/api` 转给后端 |
| [package.json](../../frontend/package.json) | `scripts` / `engines` | 开发、类型检查、构建命令及 Node.js 要求 |

## 输入、输出和依赖

- 输入：页面地址、连接与配置检查、聊天输入、发送与新对话按钮。
- 输出：连接状态、模型配置状态、等待提示、纯文本回答与错误；不执行模型返回的 HTML。
- 依赖：[后端](backend.md) `/api/v1/health`、`GET /api/v1/model` 与 `POST /api/v1/chat`；Vite 转发到默认 `http://127.0.0.1:8000`。[chat.ts](../../frontend/src/api/chat.ts) 核对聊天结果与模型状态。
- 配置：见 [前端配置示例](../../frontend/.env.example)。真实 Key 不放进前端，也不放进会向浏览器公开的 `VITE_` 变量。

## 已实现与缺口

| 能力 | 当前情况 | 依据 |
| --- | --- | --- |
| 页面切换 | 已注册首页和各业务入口 | `router/index.ts` 中的路由表 |
| 后端连接检查 | 有真实请求、响应核对、超时与手动重查逻辑 | `getHealth`、`getJson`、`useBackendHealth` |
| 比赛与盘口 | 独立页面按北京时间筛选今天、明天、近 7 天、全部已开盘，按平台展示报价；选好平台后交给 AI | [MatchBoard.vue](../../frontend/src/components/odds/MatchBoard.vue)、[MatchCard.vue](../../frontend/src/components/odds/MatchCard.vue)、[MarketQuote.vue](../../frontend/src/components/odds/MarketQuote.vue) |
| AI 聊天 | 每次读取最新保存快照；选场时只使用该比赛该平台，问题历史保留选场标签；等待中阻止重复提交、失败保留输入、不自动重试 | `ChatView.vue`、[chat.ts](../../frontend/src/api/chat.ts)、[类型](../../frontend/src/types/api.ts) |
| 记录、统计、记忆和设置 | 只有预留页，没有业务数据或保存行为 | [RecordsView](../../frontend/src/views/RecordsView.vue)、[StatisticsView](../../frontend/src/views/StatisticsView.vue)、[MemoryView](../../frontend/src/views/MemoryView.vue)、[SettingsView](../../frontend/src/views/SettingsView.vue) |
| 跨页面业务状态 | Vue ref 共享选场，KeepAlive 保留聊天；没有新增状态库 | [stores 说明](../../frontend/src/stores/README.md) |

## 验证记录

| 日期 | 方式 | 实际结果与边界 |
| --- | --- | --- |
| 2026-11-11 | [项目骨架交接中的历史运行记录](../handoff/2026-11-11-Vue与FastAPI项目骨架.md) | `npm run build` 成功，包含类型检查；记录浏览器显示连接成功、记忆页刷新正常，前端转发健康检查 HTTP 200；未验证手机实机与业务流程 |
| 2026-11-11 | 本轮 `npm run build` | 类型检查与构建通过，首次输出 `52 modules transformed / built in 68ms`；保留同期盘口代码后最终输出 `63 modules transformed / built in 104ms` |
| 2026-11-11 | 本轮浏览器实际发送 | 显示 `gpt-6.1-sol` 已配置，发送后先显示等待，再显示“网页模型连接成功。”；按钮恢复，无自动二次提交 |

已有启动和构建入口为根目录的 `make frontend`、`make build`；前置依赖见 [README](../../README.md)。本轮执行了构建，并复用已启动的本地网站验证聊天。

## 限制、未决事项与下一步

- “后端已连接”只代表健康检查成功，不代表 GPT、盘口或数据库可用。
- 开发和预览转发不等于已经具备生产部署方案。
- 模型每次读取的是保存的快照，不会自动更新外部盘口；当前没有完整赛程、实时比分或伤病查询。
- 当前轮最多 20 次提问；页面切换保留对话，刷新或关闭网站会丢失对话，没有长期记忆、正式预测保存、逐字显示或停止生成。
- “模型已配置”不是在线探测；打开页面、检查配置不会调用付费模型。

## 首次首页盘口接入历史（2026-11-11，入口已由下节替代）

- [App.vue](../../frontend/src/App.vue) 只在首页聊天组件之前装入 `MatchBoard`，没有改写并行模型任务的 `ChatView`。
- [odds.ts 请求](../../frontend/src/api/odds.ts) 调用 `GET /api/v1/odds` 读取快照（5 秒超时），点击“更新盘口”才调用 `POST /api/v1/odds/refresh`（25 秒超时）。不自动刷新或重试，失败保留页面原快照；前端 60 秒倒计时仅阻止重复点击。
- [format.ts](../../frontend/src/components/odds/format.ts) 用 `Asia/Shanghai` 统一日期和开赛时间，提供 30 支球队中文名。默认近 7 天；今天没有覆盖时明确不等于没有比赛。
- 盘口缺失显示“暂无报价”；采集和报价超过 15 分钟标待更新。到达开赛时间后明确显示赛前记录，不猜比赛状态或比分。平台默认原始响应首家，不合并或推荐报价。
- 本轮 `npm --prefix frontend run build` 输出 `63 modules transformed / built in 167ms`。浏览器验证今天无数据提示、明天及近 7 天 10 场、平台切换后大小分 `215.5 → 216.5` 与赔率同步；真实点击更新得到 14 场、消耗 2 credits、剩余 496。
- 浏览器窄屏为单列，1440×1000 为双列，实测横向溢出为 false，warning/error 日志为空。截图与交接见 [首页盘口交接](../handoff/2026-11-11-首页NBA比赛与盘口展示.md)。不代表已完成手机实机或公网验证。

## 独立比赛页与聊天联动（2026-11-11，当前行为）

- `App.vue` 只渲染当前路由；`MatchesView` 装入比赛区，`AppShell` 新增侧栏入口。保留原有日期筛选、平台切换和手动更新。
- `MatchCard.analyze` 把比赛与平台标识写入内存选择，跳转聊天，不自动发送或调用付费模型；聊天可取消选择或新开对话，普通提问也能读取全部保存比赛。
- `chat.ts.sendChat` 发送可选 `odds_selection`；报价由后端从磁盘读取，浏览器不上传盘口数值。最新快照不再含所选比赛或平台时显示后端错误并保留输入。
- `npm --prefix frontend run build`：`66 modules transformed / built in 102ms`。浏览器真实验证：直接提问识别明天前两场；选择凯尔特人对猛龙 DraftKings 后回答 `-7.5 / +7.5`、总分 `216.5`，四项赔率与页面一致。进入比赛页再返回仍保留原问答。
- 本次没有更新外部盘口，仅两次真实模型问答；后端离线检查 `Ran 19 tests in 0.084s / OK`。截图及具体边界见 [本次交接](../handoff/2026-11-11-独立比赛页与AI盘口联动.md)。

## 项目独立模型配置（2026-11-11）

模型问答代码与盘口联动保留。用户已填写项目独立 Key，后端重载后真实请求返回 HTTP 200、“项目模型连接成功。”。页面如仍缓存未配置状态，点击“检查配置”。本次未新增浏览器模型请求或构建，后端验证见[专用 Key 交接](../handoff/2026-11-11-项目专用模型Key验证.md)。
