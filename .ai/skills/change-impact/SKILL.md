---
name: change-impact
description: 改动联动检查 — 修改接口/配置/模型/Agent/Workflow 时，列出需要同步修改的调用方、规格、测试、文档与受固定配置。触发词：同步、影响、联动、改动、impact。
---

# Change Impact

改动一处（接口、配置、模型、Agent、Workflow、公共工具）时，先运行本检查清单，识别需要同步修改的关联点，并在报告完成前列出它们。

## 检查清单

1. 调用方：搜索所有引用或调用被改动符号的代码。
2. 需求/规格：规格或设计文档中是否描述了该行为。
3. 测试：测试是否依赖旧行为，需要更新或新增回归。
4. 文档：README、指南或 API 文档是否描述了被改动内容。
5. 受固定配置：若项目配置了 Task Runner 门禁，检查 execution-manifest.json、allowlist.yaml、agents.yaml、endpoint 白名单是否受影响；模型/Provider 改动是否影响 review 区分性约束。
6. 迁移：是否需要数据或配置迁移。

## 输出

- 需要同步修改的文件清单
- 每项的同步动作
- 是否已完成同步（或标记为待处理）
