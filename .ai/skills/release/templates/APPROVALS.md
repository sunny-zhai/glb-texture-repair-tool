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
