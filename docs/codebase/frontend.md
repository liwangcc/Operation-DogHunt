# 前端网站｜模块子块

[返回父块](../../CODEBASE.md)

| 项目 | 当前记录 |
| --- | --- |
| 模块标识 | frontend |
| 核对日期 | 2026-11-12（Asia/Shanghai） |
| 核对范围 | 当日已核对预测记录、效果统计与设置；本轮新增核对 RecordsView、features/reviews 的填写、档案和补充流程；其他模块保留原核对依据 |
| 实现状态 | 部分实现：比赛与聊天已联动，选场记录/复盘档案、浅色效果统计、设置控件均可预览；正式预测保存、复盘持久化、汇总分析、真实统计、设置保存和记忆未接入 |
| 验证程度 | 本轮类型检查、81 modules 构建、档案新增/原文与补充分离/筛选/多选清单/返回预测/空白与刷新通过，1440px 及 390px 无横向溢出；设置与统计保留各自证据，未验证手机实机，后端沿用历史证据 |
| Git 基准 | HEAD `099443fe6ea059c000f5f866086a90e21ccf0d33` 加本轮未提交改动；旧地图未记录精确提交，本轮重新核对上述受影响入口与源码，不扩大为全前端核对 |

## 负责什么

Vue 负责显示页面，TypeScript 用于检查数据和代码格式，Vue Router 管页面地址之间的切换。前端承担页面布局、连接状态、真实模型聊天和本次打开网站时的对话上下文。比赛与盘口在独立 `/matches` 页面，聊天在 `/`；卡片选场后带比赛及平台标识进入聊天，由后端读取报价。

## 到哪里找实现

| 源码或配置 | 入口或关键符号 | 用途 |
| --- | --- | --- |
| [main.ts](../../frontend/src/main.ts) / [App.vue](../../frontend/src/App.vue) | 应用启动 / `AppShell` / `KeepAlive` | 装入布局与当前页面，仅缓存 `ChatView`，切换页面保留对话与输入 |
| [router/index.ts](../../frontend/src/router/index.ts) | `createRouter` | 注册聊天首页、独立比赛页、记录、统计、记忆、设置和未知地址页面 |
| [MatchesView.vue](../../frontend/src/views/MatchesView.vue) | `MatchBoard` | 独立比赛页 `/matches`，不嵌在聊天内 |
| [SettingsView.vue](../../frontend/src/views/SettingsView.vue) | `sections` / `draft` / `savePreview` / `resetPreview` | `/settings` 五类按钮框架，选项与开关仅作当前页预览；暂存不写浏览器或后台存储 |
| [RecordsView.vue](../../frontend/src/views/RecordsView.vue) | `visibleRecords` / `archiveDraft` / `archiveFor` / `viewRecord` | `/records` 内切换选场和档案；内存归档、补充、统计状态与预测详情联动 |
| [ReviewComposer.vue](../../frontend/src/features/reviews/ReviewComposer.vue) | `drafts` / `ready` / `toggleTag` | 按比赛保留本页草稿；摘要、原文及标签，空白禁用；已归档时跳转档案补充 |
| [ReviewArchive.vue](../../frontend/src/features/reviews/ReviewArchive.vue) | `visible` / `selected` / `checkedEntries` / `supplement` | 档案筛选与详情、追加补充、跨筛选多选与整理清单；汇总分析禁用待接入 |
| [复盘演示模型](../../frontend/src/features/reviews/preview.ts) | `matchKey` / `createReview` / `appendSupplement` / `seedReviews` | 按比赛关联玩法、创建档案与不可变追加；2 份初始示例，仅供 UI，不访问存储 |
| [recordPreview.ts](../../frontend/src/data/recordPreview.ts) | `RecordPreview` / `recordPreview` | 6 条虚构示例及玩法、结果标签；不读取实际比赛，不写入存储 |
| [StatisticsView.vue](../../frontend/src/views/StatisticsView.vue) | `scopedRecords` / `summary` / `comparison` | `/statistics` 浅色看板；日期、玩法、版本、来源筛选，演示与正式待接入状态，跳转记录 |
| [统计演示与聚合](../../frontend/src/features/statistics/data.ts) | `demoRecords` / `summarize` / `dailyProfits` | 固定日期演示；同一份选择计算计数、命中率、收益率及每日曲线，不访问后端 |
| [ProfitChart.vue](../../frontend/src/features/statistics/ProfitChart.vue) | `points` / `move` / `key` | SVG 收益曲线，悬停与方向键查看每日明细；ResizeObserver 适应容器宽度 |
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
| 预测记录与复盘档案 | 6 条选场示例和 2 份初始档案；可填写、归档、查看、追加补充、筛选及勾选整理；只在本页内存中联动，刷新或离页重置，不持久化或执行分析 | [RecordsView](../../frontend/src/views/RecordsView.vue)、[档案 UI](../../frontend/src/features/reviews/ReviewArchive.vue)、[填写 UI](../../frontend/src/features/reviews/ReviewComposer.vue)、[示例模型](../../frontend/src/features/reviews/preview.ts) |
| 效果统计 | A 浅色方案：总体指标、累计收益曲线、玩法对比、状态分布与筛选；仅演示，正式统计待接入；与预测记录示例不共享 | [StatisticsView](../../frontend/src/views/StatisticsView.vue)、[统计数据与计算](../../frontend/src/features/statistics/data.ts)、[收益曲线](../../frontend/src/features/statistics/ProfitChart.vue) |
| 设置 | 基础偏好、数据与盘口、AI 与调用、分析与记录、数据管理五类；可试选与暂存本页预览，未改实际配置；导出、导入和管理连接禁用待接入 | [SettingsView](../../frontend/src/views/SettingsView.vue) |
| 长期记忆 | 只有预留页，没有业务数据或保存行为 | [MemoryView](../../frontend/src/views/MemoryView.vue) |
| 跨页面业务状态 | Vue ref 共享选场，KeepAlive 保留聊天；没有新增状态库 | [stores 说明](../../frontend/src/stores/README.md) |

## 验证记录

| 日期 | 方式 | 实际结果与边界 |
| --- | --- | --- |
| 2026-11-12 | 合入 dev 前增量核对：`npm --prefix frontend run build`、Node 离线断言、`git diff --check` | 类型检查通过，`81 modules transformed / built in 143ms`；默认统计 100 笔结算、58 赢 42 输、+8.6 元、8.6% ROI 与曲线一致，特殊状态及空样本通过；两份初始档案、同场玩法关联、空白拦截、摘要回退和追加保留原文通过。本轮未重跑浏览器，以下浏览器结果为历史证据；未调用模型、更新盘口或验证正式存储 |
| 2026-11-12 | `npm --prefix frontend run build`、Node 离线断言与浏览器 `/records` | 最终 `81 modules transformed / built in 144ms`，含同期设置/统计；初始档案 2，新归档后为 3；补充保留原文、返回对应预测、日期/玩法/标签/搜索、跨筛选多选及整理清单通过；空白后筛选清理、刷新恢复 2 份示例通过；1440px/390px 无横向溢出，warn/error 为 `[]`。离线核对同场两个玩法关联、空白输入拦截和追加不修改原文；不代表正式存储已实现 |
| 2026-11-12 | `npm --prefix frontend run build` 与浏览器 `/settings` | `74 modules transformed / built in 158ms`，含类型检查；五类切换、时区/赔率/平台/过期/等待/玩法选择、密度按钮、开关、暂存与还原通过；暂存后跨分类保留，刷新后恢复；导出与导入禁用；1280px 与 390px 无横向溢出（390px 覆盖五类），warn/error 为 `[]`。未验证真实设置保存，也未调用模型或更新盘口 |
| 2026-11-12 | `npm --prefix frontend run build`、Node 离线断言、浏览器 `/statistics` | 最终 `73 modules transformed / built in 131ms`，含同期预测记录改动；演示 100 笔、58 赢 42 输、+8.6 单位、8.6% ROI，分玩法 +6.2/+2.4 与曲线终点一致；走盘投入、取消/待结算排除及零分母通过；日期/玩法/版本/来源筛选、无样本、正式待接入、Home/End 明细及跳转记录通过，1440px/390px 无横向溢出，页面 warn/error 为 `[]`；未验证真实统计接口 |
| 2026-11-12 | `npm --prefix frontend run build` 与浏览器 `/records` | 最终 `68 modules transformed / built in 113ms`，含类型检查；6 条示例，按让分筛选为 3、叠加赢盘为 1；待复盘为 2、叠加日期为 1；详情切换、搜索无结果和空白状态通过；1280px、390px 无横向溢出，控制台 warn/error 为 `[]`；截图见本次交接 |
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
- 预测记录与复盘档案仅为 UI 预览，不调用业务接口；示例对阵、盘口、赛果均虚构。每条预测为一个玩法，档案按比赛归组；归档后本页已复盘/待复盘统计联动，但不是正式持久化。原文保留，补充另存内存条目；刷新或离页后恢复。真实记录、赛果、结算、数据库、多人隔离和汇总分析后续实现。
- 效果统计独立使用固定日期演示数据，默认最近 30 天为 2026-10-14 至 2026-11-12；与记录页六条示例不是同一数据集。只支持导航连接，尚未共享筛选或正式记录；选择“查看正式数据”只显示待接入说明，不请求不存在的接口。

## 设置按钮框架（2026-11-12）

`SettingsView` 替换占位页，沿用深绿与浅色风格，样式 scoped，不修改公共布局。桌面分类在左、内容在右；950px 以下分类变成横排，700px 以下表单选择铺满一行。使用原生 select、带 label 的 switch、带 aria-pressed 的密度按钮；未接入功能禁用并提供原因。

`draft` 是预览选项，`saved` 仅记录本次页面内已暂存值，`dirty` 决定暂存按钮状态。分类切换保留预览；App 仅缓存 ChatView，因此离开设置或刷新会重新初始化，不写 localStorage、不请求设置接口、不读取密钥。时区、赔率、超时等字段尚未应用于其他页面，所有默认值只代表框架示例，不能当作已确定的业务规则。后续需确定设置范围、保存接口与实际应用位置；运行状态与真实额度也未接入。本次截图和交接见[设置按钮框架](../handoff/2026-11-12-设置按钮框架.md)。

## 浅色效果统计 UI（2026-11-12）

用户选择 A 浅色研究看板，并确认首屏优先整体表现和收益走势。`StatisticsView` 用同一组选择计算四张指标卡、日收益曲线与记录分布，比较卡独立展示相同日期/版本/来源下的两个玩法，点击“查看走势”切换主看板玩法。统计按选择而非比赛计数；命中率排除走盘，ROI 分母包含已结算走盘投入，取消和待结算不计入投入，零样本显示横线。

默认演示模式有醒目标记，可切换正式待接入状态。日期筛选以固定演示日为基准，来源分开计算；无匹配时提供重置。曲线使用内置 SVG 和 ResizeObserver，不新增图表依赖；手机指标为两列，比较卡为单列，轴标签保持可读，键盘方向键和 Home/End 可查看日收益。筛选只在当前页面内保留，离页或刷新重置。

本轮只修改统计专用源码，保留同期 `RecordsView`、公共样式和导航；真实记录字段、日期口径与赛果统计服务仍需在数据接入阶段统一。完整说明和实际截图见[效果统计浅色 UI](../handoff/2026-11-12-效果统计浅色UI.md)。

## 复盘档案 UI（2026-11-12）

用户确认先积累每场复盘，之后自行选择材料集中分析和调整策略，要求与设置页并行开发。新增模块限定在 `features/reviews/`，仅修改 `RecordsView` 接入；不改设置、统计、公共样式、布局、路由或依赖。档案入口为 `/records` 内的两个按钮，使用 `v-show` 切换以保留本页预览状态。

一场比赛归为一份档案，关联该场预测玩法；当前演示以比赛日期和主客队形成归组 key，真实接入必须改用可靠赛事标识。`archiveDraft` 防止同场重复归档；只有已有结算示例的比赛能写复盘。原始内容与独立补充数组分别显示，`appendSupplement` 返回新条目而不修改原文；摘要可由用户填写，空缺时取原文首行，不调用 AI。

档案支持日期、玩法、标签与全文搜索（含补充），按最近更新时间显示。筛选隐藏已勾选材料时保留选择，并明确显示总选择数；可查看整理清单，汇总分析按钮禁用。归档不会修改策略。空白预览清理档案筛选和勾选，返回示例保留当前页归档；刷新或离页后重置。完整范围、并行边界和截图见[复盘档案 UI 交接](../handoff/2026-11-12-复盘档案UI.md)。

## 个人选场复盘 UI（2026-11-12）

用户明确先做自己的选场复盘，并要求当前只搭 UI。`RecordsView` 直接引用 `data/recordPreview.ts`，替代原占位组件，不引入依赖或修改公共样式。桌面为列表与详情并排，1200px 以下详情排到列表下方，700px 以下概览为两列、筛选纵向排列。列表使用按钮支持键盘选择；状态有文字区分，支持无动画偏好。

比赛按日期和时间降序排列；筛选使当前选择不可见时详情显示第一条可见记录，没有可见记录时隐藏详情。详情中的原笔记试填已由 `ReviewComposer` 和档案入口替代；示例/空白切换只清理筛选和未归档编辑状态，不清除当前页已归档内容。去选比赛仅跳转现有 `/matches`，不自动取数或发起分析。初版交付与历史截图见[预测记录 UI 框架](../handoff/2026-11-12-预测记录UI框架.md)，当前档案流程以上节为准。

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
