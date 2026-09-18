# 任务拆解与追溯（TASKS）

> 由 `requirements` 技能生成/维护。任务拆到**可独立验证**为止；依赖形成 DAG。
> 每个任务必须写明"如何验证"；完成后回填状态与验证结果。

## 任务清单

### TASK-001 把文档校正与设计文档入库带入版本分支
- **关联需求**：REQ-001
- **依赖**：无
- **做什么**：把已经提交并验证过的两份文档提交（`72614df` 校正 `CLAUDE.md`、`7301184` 三份设计文档入库并校正 BR-002 等）通过任务分支带入版本分支 `release/v0.1.0`，使版本线携带与实现一致的文档与台账。
- **产出**：`CLAUDE.md`、`AGENTS.md`、`.gitignore`、`docs/001-code-design.md`、`docs/002-requirements.md`、`docs/cesium-glb-load-issues.md`
- **文件范围**：`CLAUDE.md`, `AGENTS.md`, `.gitignore`, `docs/001-code-design.md`, `docs/002-requirements.md`, `docs/cesium-glb-load-issues.md`
- **验证方式**：`npm run lint && npm test`（期望 43 用例全绿）；外加三条可判定断言——`grep -c "IVE input pipeline" CLAUDE.md` ≥ 1、`CLAUDE.md` 的 lint 说明含五个 `src/*.js`、`git ls-files docs/` 恰为三份且无平台模板。
- **状态**：已完成
- **验证结果**：`node scripts/task-flow.mjs finish --test "npm test"` —— 门禁 `npm test` 43 通过 / 0 失败 / 0 跳过（lint 亦通过），自动合并为版本分支提交 `7f7411a`。REQ-001 五条验收标准逐条判定：① 五文件表述 ✅ ② `grep -c "IVE input pipeline" CLAUDE.md` = 1 ✅ ③ BR-002 为「统一转 PNG」且报告示例不含 `imagesKeptJpeg` ✅ ④ `git ls-files docs/` 恰为三份、无平台模板 ✅ ⑤ lint + test 通过 ✅

### TASK-002 平台权威台账纳入版本库
- **关联需求**：REQ-001
- **依赖**：TASK-001
- **做什么**：把平台权威台账纳入版本库，使需求/任务/完成线的审计链跨机器可见：`.gitignore` 用否定规则只放行 `docs/requirements/{REQUIREMENTS,TASKS}.md` 与 `docs/PROJECT_MEMORY.md`，其余平台模板（`coding-standard/`、`testing/`、`release/`、`approvals/`、`design/`、`api/`）继续忽略。
- **产出**：`.gitignore`、`docs/requirements/REQUIREMENTS.md`、`docs/requirements/TASKS.md`、`docs/PROJECT_MEMORY.md`
- **文件范围**：`.gitignore`, `docs/requirements/`, `docs/PROJECT_MEMORY.md`
- **验证方式**：`npm test`；三条断言——`git ls-files docs/requirements docs/PROJECT_MEMORY.md` 恰为三份、`git check-ignore` 对 `docs/coding-standard/web-vue3.md` 与 `docs/testing/TEST_PLAN.md` 仍返回忽略、`node scripts/memory.mjs check` 通过。
- **状态**：已完成
- **验证结果**：`node scripts/task-flow.mjs finish --test "npm test"` —— 门禁 `npm test` 43 通过 / 0 失败，自动合并为 `e26b1a1`。三条断言：① `git ls-files docs/requirements docs/PROJECT_MEMORY.md` = 3 份（REQUIREMENTS.md、TASKS.md、PROJECT_MEMORY.md）✅ ② `docs/coding-standard/web-vue3.md` 与 `docs/testing/TEST_PLAN.md` 仍被忽略 ✅ ③ `memory check` 通过 ✅

### TASK-003 人工审批留痕纳入版本库
- **关联需求**：REQ-001
- **依赖**：TASK-002
- **做什么**：把 `docs/approvals/APPROVALS.md` 纳入版本库。它是平台人工闸门（spec/architecture/delivery）的审计留痕，而 `docs/release/MERGE_REQUEST.md` 的验收清单里就要求"人工闸门已留痕"——不入库则该清单无法真正满足。
- **产出**：`.gitignore`、`docs/approvals/APPROVALS.md`
- **文件范围**：`.gitignore`, `docs/approvals/`
- **验证方式**：`npm test`；断言 `git ls-files docs/approvals` 恰为 1 份、`docs/testing/TEST_PLAN.md` 与 `docs/coding-standard/web-vue3.md` 仍被忽略、`node scripts/memory.mjs check` 通过。
- **状态**：已完成
- **验证结果**：`node scripts/task-flow.mjs finish --test "npm test"` —— 门禁 43 通过 / 0 失败后自动合并为版本分支提交 `626eafe`。断言：① `git ls-files docs/approvals` 恰 1 份 ✅ ② `docs/testing/TEST_PLAN.md`、`docs/coding-standard/web-vue3.md` 仍被忽略 ✅ ③ `memory check` 通过 ✅

## 依赖 DAG

```text
TASK-001 ──▶ TASK-002 ──▶ TASK-003
```

## 并行批次

> 就绪集（依赖已全部完成）中的任务可并行；**文件范围重叠的任务必须排入不同批次**。
> 合并**严格一次一个**，因此这里只规划开发并行度，不规划合并并行度。

| 批次 | 任务 | 依据 |
| :-- | :-- | :-- |
| 1 | TASK-001 | 无依赖 |
| 2 | TASK-002 | 依赖 TASK-001 已完成 |
| 3 | TASK-003 | 依赖 TASK-002 已完成 |

## 进度

| 任务 | 关联 REQ | 状态 | 已验证 |
| :-- | :-- | :-- | :-- |
| TASK-001 | REQ-001 | 已完成 | ☑ |
| TASK-002 | REQ-001 | 已完成 | ☑ |
| TASK-003 | REQ-001 | 已完成 | ☑ |
