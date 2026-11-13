# 聊天助手提示词

首页聊天框模型的静态提示词。设计依据见 [聊天预测提示词设计文档](../../../../docs/聊天预测提示词设计文档.md)，读取与拼装代码在 `app/services/chat/prompt.py`。

## 当前版本

以 `versions.lock.json` 的 `active` 为准，下表同步列出：

| 顺序 | 模块 | 当前版本 | 内容 |
| --- | --- | --- | --- |
| 1 | role | `chat_role_v1` | 角色与能力边界 |
| 2 | sources | `chat_sources_v2` | A/B/C 资料等级（A 级含赛程快照） |
| 3 | odds | `chat_odds_v3` | 盘口与报价规则、按球队聚焦、市场信号、休息天数 |
| 4 | method | `chat_method_v4` | 分析方法（必须给倾向，休息差作为一档理由） |
| 5 | output | `chat_output_v3` | 结论置顶、分玩法因素表与预计推导、把握说明与分档、追问 |

拼装：五个文件按上表顺序用空行连接，再由 `service.py` 追加当前北京时间、快照说明和 `<saved_odds_snapshot>`。时间和快照不进静态哈希。后端进程只读一次文件，改完要重启后端。

## 其他文件

| 文件 | 用途 |
| --- | --- |
| `versions.lock.json` | 当前版本、各文件哈希与字数、静态提示词哈希；由命令生成，不手写 |
| `CHANGELOG.md` | 改版记录 |
| `issues.md` | 使用中发现的问题 |
| `eval_cases.md` | 回归问题集 |
| `eval_snapshots/` | 回归用的固定盘口快照，用法见 `eval_cases.md` |

## 修改方法

1. 直接改文件也可以，改完调用 `$chat-prompt-maintenance`，它会补版本号、改版记录和锁文件。
2. 已登记的版本内容不能再改，哪怕只是错别字；改动一律存为新版本，旧文件保留。
3. 漏了记录时，离线测试 `test_chat.py` 会失败并提示运行 Skill。

```sh
cd backend
.venv/bin/python -m app.services.chat.prompt check
```
