# 人工确认闸门留痕（APPROVALS）

> 4 个人工确认闸门必须留痕：① 规格 ② 架构 ③ 交付 ④ 门禁仲裁。
> 由 `scripts/record-approval.mjs` 追加记录；**不要手工删改历史记录**（审计用）。

## 记录格式

| 时间 | 闸门 | 决策 | 确认人 | 关联需求/版本 | 证据 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| {{YYYY-MM-DD HH:MM}} | ① 规格 | 通过 | {{@author}} | REQ-001 | {{docs/requirements/REQUIREMENTS.md}} |
| {{YYYY-MM-DD HH:MM}} | ② 架构 | 通过 | {{@author}} | ADR-001 | {{docs/design/ADR.md}} |
| {{YYYY-MM-DD HH:MM}} | ③ 交付 | 通过 | {{@author}} | v0.1.0 | {{docs/release/RELEASE_CHECKLIST.md}} |
| {{YYYY-MM-DD HH:MM}} | ④ 门禁仲裁 | 重试 | {{@author}} | REQ-002 | {{自动修复 3 轮仍失败}} |

## 用法

```bash
node scripts/record-approval.mjs --gate spec --decision approved --actor "@author" --ref REQ-001 --evidence docs/requirements/REQUIREMENTS.md
```

闸门取值：`spec` | `architecture` | `delivery` | `gate-arbitration`
决策取值：`approved` | `rejected` | `retry` | `abandon`
## 记录

> 由 `scripts/record-approval.mjs` 追加到文件末尾（不改历史）。

| 时间 | 闸门 | 决策 | 确认人 | 关联需求/版本 | 证据 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 2026-09-18 06:01 | delivery | approved | sunny-zhai | v0.1.0 | PR #6 https://github.com/sunny-zhai/glb-texture-repair-tool/pull/6 merged into main as 3506327 (复核范围：release/v0.1.0 至 15c755c（版本状态/台账/CLAUDE.md 校正）；其后 TASK-003/TASK-004 批次尚待紧随的合并) |
| 2026-09-18 06:03 | delivery | approved | sunny-zhai | v0.1.0 | PR #7 https://github.com/sunny-zhai/glb-texture-repair-tool/pull/7 merged into main as 0063590 (本批为完整交付：TEST_PLAN/RELEASE_CHECKLIST/APPROVALS/台账增量/.gitignore 共 7 文件；合并后与 main 内容差异为空) |
| 2026-09-18 07:36 | spec | approved | sunny-zhai | REQ-005 | docs/requirements/REQUIREMENTS.md (确认 REQ-005 的 5 条验收标准（Given/When/Then）；含实测口径：运输车 world 2.59×4.10×5.98、偏差 >1000、21 样例 0 崩溃、person 比值 0.61) |
| 2026-09-18 07:36 | architecture | approved | sunny-zhai | REQ-005 | docs/design/ADR.md (确认 ADR-001~005：世界盒自算与偏差上报、上轴保守推断、遍历跨路径共用、预览修正不写回、统计口径（默认场景可达 + 偏差含位置分量）) |
