---
name: chat-prompt-maintenance
description: 维护首页聊天助手的提示词文件（backend/app/prompts/chat/）。修改提示词后记录改版：拆出新版本、写 CHANGELOG、更新 issues 与回归用例、重算锁文件、跑离线测试并同步代码地图；也用于登记使用中发现的问题。提示词被修改、test_chat 报“修改没有记录”、或用户要求记一个提示词问题时使用。
---

# 维护聊天提示词

提示词改了就要留下记录：哪个版本、为什么改、改了什么。本 Skill 负责补齐这些记录，不决定提示词写什么。设计依据见 `docs/聊天预测提示词设计文档.md` 第 8、9 节。

Skill 只在被调用时运行，不监听文件。漏记录的修改会让 `test_chat.py` 的 `test_repository_prompts_are_recorded` 失败，那时再调用即可。

## 文件

都在 `backend/app/prompts/chat/`：

- `chat_{模块}_v{n}.md`：提示词，第一行 `# chat_{模块}_v{n}` 和文件名相同。模块按顺序为 role、sources、odds、method、output。
- `versions.lock.json`：当前版本 `active`、各版本哈希与字数、静态提示词哈希。只用命令生成，不手改。
- `CHANGELOG.md`、`issues.md`、`eval_cases.md`：改版记录、问题记录、回归问题集。格式写在各文件开头，照格式追加。
- `README.md`：当前版本表，要和 `active` 一致。

命令（在 `backend/` 下运行）：

```sh
.venv/bin/python -m app.services.chat.prompt check
.venv/bin/python -m app.services.chat.prompt lock --active chat_role_v1 chat_sources_v1 chat_odds_v1 chat_method_v2 chat_output_v1
```

`lock` 会登记新文件、切换 `active`、重算哈希；已登记版本的内容变了，它会拒绝执行。

## 记录一次改版

1. **找出改动**：运行 `check`，再看 `git status` 和 `git diff -- backend/app/prompts/chat/`。列出改了哪些模块、哪几句。`check` 通过且没有提示词文件改动时，报告“无需记录”并结束。
2. **整理版本**：
   - 已登记版本被直接修改（`check` 报“哈希不一致”）：要把改后的内容另存为下一个版本号，再用 `git show HEAD:<路径>` 把原文件恢复成登记时的内容。原文件尚未提交过时，`git show` 取不到，停下来告诉用户，不猜原内容。这一步会移动用户的文件，**先列出要执行的操作，等用户确认**。
   - 新版本文件的第一行改成新版本号。
   - 用户已自己新建了新版本文件：只核对文件名和第一行。
   - 只改错别字、标点也升版本，记录里标“文字修正”。
3. **问原因**：只问一个问题：这次改动对应 `issues.md` 的哪一条，或用一句话说明原因。用户不答就写“原因待补”，结束时提醒。
4. **更新锁文件**：用 `lock --active ...` 把 `active` 指向新版本。旧版本文件一律保留。
5. **写记录**：
   - `CHANGELOG.md` 最上方追加一条：日期、一句话说明、原因、静态提示词总字数（旧 → 新，取锁文件的 `static_chars`），每个新版本一个 `### 版本号（替换 旧版本号）` 小节，写改动摘要和字数。摘要按 diff 如实写，不夸大。
   - 对应的 `issues.md` 条目状态改为“已改版（新版本号）”。
   - 这次是修复某个问题时，把触发问题的提问按格式加进 `eval_cases.md`，来源写问题编号。
   - `README.md` 的版本表改成新的 `active`。
6. **检查内容**：通读当前五个版本，找出新规则和其他模块矛盾的地方，以及重复或已过时的规则；字数比上一版明显增加时指出可合并的规则。只报告，不替用户改提示词内容。
7. **跑离线测试**：`cd backend && .venv/bin/python -m unittest discover -s tests -v`，结果原样报告；`check` 必须通过。
8. **列出回归用例**：从 `eval_cases.md` 选出核心用例和与改动模块相关的用例。真实模型调用会产生费用，只列出，不执行，除非用户明确要求。
9. **同步代码地图**：调用 `$codebase-map`，只更新 `docs/codebase/backend.md` 中聊天提示词相关的内容和父块摘要。

最后报告：改了哪些模块、新版本号、写了哪些记录、测试结果、还没做的事（原因待补、回归未跑）。

## 登记一个问题

用户说“记一个问题：……”时：

1. 按 `issues.md` 的格式追加，编号顺延。问题类型只用文件里列出的几种；提示词版本写当前 `static_sha256` 前 12 位，除非用户给了别的版本。
2. 找出同类型的已有问题。同类问题已出现两次以上，或这次属于严重问题（编造伤病或赛果、混用不同平台的报价），建议改版并指出涉及哪个模块；否则只记录。
3. 不改提示词，也不改别的文件。

## 不做的事

- 不改提示词内容；内容由用户决定，Skill 只记录和检查。
- 不调用模型或盘口接口。
- 不删除旧版本文件，不手改锁文件。
- 不提交、不推送 Git。
- 只改 `CHANGELOG.md`、`issues.md`、`eval_cases.md`、`README.md` 时不需要重新走改版流程。
