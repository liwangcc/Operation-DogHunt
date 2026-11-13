# 项目协作补充

## 代码现状说明书

- 接手开发前先读根目录 [CODEBASE.md](CODEBASE.md)，再按本次任务阅读相关模块子块。继续遵守用户的全局协作规则和交接要求。
- 完成影响代码行为、接口、模块职责、依赖或运行方式的改动后，使用 [$codebase-map](.agents/skills/codebase-map/SKILL.md) 核对受影响源码，更新相关子块，再同步父块摘要。交付时说明更新范围和实际验证结果。
- 只修改普通文案、交接或代码地图自身时，不递归触发维护。无关模块不跟着刷新核对日期。
- 这条规则在 AI 执行开发任务时生效。用户在编辑器手动修改的代码，在下次相关开发任务或手动调用 Skill 时核对同步。
- Skill 与模板是通用文件；项目当前状况只写在 `CODEBASE.md` 和 `docs/codebase/` 的实例中。

## 聊天提示词维护

- 修改 `backend/app/prompts/chat/` 下的提示词后，使用 [$chat-prompt-maintenance](.agents/skills/chat-prompt-maintenance/SKILL.md) 记录改版并更新锁文件，再按上一节同步代码地图。只改 CHANGELOG、issues、eval_cases、README 等记录文件时不递归触发。
- 用户在编辑器手动修改提示词后，离线测试会因锁文件不一致而失败；在下次相关开发任务或手动调用 Skill 时补齐记录。
