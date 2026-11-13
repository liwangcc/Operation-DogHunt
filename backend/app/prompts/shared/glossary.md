# 术语与符号约定

- **主队 home / 客队 away**：以 `<game_data>` 中的 `home` 和 `away` 为准。
- **分差 margin**：主队得分减客队得分。正数表示主队占优，负数表示客队占优。
- **总分 total**：两队得分之和，包含加时。
- **让分方向 spread_lean**：本因素利好哪一方。`home` 利好主队，`away` 利好客队，`neutral` 表示本因素对分差没有明显影响，`insufficient` 表示数据不足。
- **总分方向 total_lean**：本因素让总分偏高（`high`）还是偏低（`low`），`neutral` 表示没有明显影响，`insufficient` 表示数据不足。这是因素本身的方向，不是买大还是买小。
- **把握 confidence**：0 到 100 的整数，表示对方向判断的把握。方向为 `neutral` 或 `insufficient` 时填 0。
- **missing**：你认为判断所需、但输入里缺少的数据。输入的 `missing` 已列出的缺失项要照抄进来。
