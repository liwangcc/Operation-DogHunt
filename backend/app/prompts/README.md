# 功能块提示词

设计依据见 [功能块提示词与校验开发文档](../../../docs/功能块提示词与校验开发文档.md)。读取和检查代码在 `app/services/analysis/`。

## 当前状态

框架已搭好，内容是**草稿**：角色、分析方法和指标名都待下一轮定义，暂不用于真实模型调用。

| 文件 | 给谁 | 状态 |
| --- | --- | --- |
| `shared/rules.md` | 模型：所有功能块共用的规则 | 草稿 |
| `shared/glossary.md` | 模型：术语与符号约定 | 草稿 |
| `blocks/strength_v1.md` | 模型：实力块的角色与分析方法 | 草稿，框架样板 |
| `blocks/strength_v1.schema.json` | 程序：实力块的输入指标与输出格式 | 草稿，指标名暂定 |

## 拼装顺序

指令：`shared/rules.md` → `shared/glossary.md` → 本块 `.md` → 输出格式说明与 `output_schema`。
数据：本场数据包放在单独的用户消息里，用 `<game_data>` 包住。

## 新增或修改一个块

1. 复制现有块的两份文件，改名为 `{块编号}_v{版本}.md` 和 `{块编号}_v{版本}.schema.json`。
2. `.md` 第一行写 `# {块编号}_v{版本}`，并保留五个二级标题：角色、输入说明、分析方法、禁止事项、输出要求。
3. schema 只能有 `id`、`version`、`inputs`、`output_schema` 四个字段；`output_schema` 的 `required` 必须列出全部字段，`additionalProperties` 必须为 `false`。
4. 在 `app/services/analysis/rules.py` 的 `RULES` 里登记这个块的业务规则。
5. 跑 `backend/tests/test_blocks.py`，文件自检会检查以上各项。

任何会改变模型行为的修改都要升版本号，旧版本文件保留。改 `shared/` 也会影响所有块，每次调用会记录这些文件和完整提示词的 SHA-256。
