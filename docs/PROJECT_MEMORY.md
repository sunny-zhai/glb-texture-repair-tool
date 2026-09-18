# 项目记忆线

> 由 `node scripts/memory.mjs` 维护：**结构快照**每次 `sync` 覆盖生成；**完成线**只追加。
> 权威状态在 `docs/requirements/TASKS.md`；本文件是派生的历史，不是状态源。

## 结构快照

<!-- memory:structure:begin -->
<!-- 本段由 `node scripts/memory.mjs sync` 生成，请勿手改 -->

- **项目类型 / 受管平台版本**：cli-tool / platform 1.0.0
- **顶层结构**（深度 2；已排除 `.git` `.venv` `node_modules` `.worktrees` 等）：
  - `.ai/` → `agents`, `skills`, `workflows`
  - `.claude/` → `.cc-writes`
  - `.workbuddy/` → `memory`
  - `assets/` → （无子目录）
  - `docs/` → `api`, `approvals`, `coding-standard`, `design`, `release`, `requirements`, `testing`
  - `dsh/` → `workflows`
  - `model/` → （无子目录）
  - `native/` → `ive2glb`
  - `o-model/` → `person-move.fbm`, `person-stand.fbm`, `蹲姿.fbm`
  - `refs/` → `models`
  - `scripts/` → （无子目录）
  - `src/` → （无子目录）
  - `test/` → （无子目录）
  - `tests/` → （无子目录）
  - `vendor/` → `cesium`, `ive2glb`
- **顶层文件**：`.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `package-lock.json`, `package.json`
- **入口点**：`npm run build:ive2glb`、`npm run dev`、`npm run dist:win`、`npm run ensure:cesium`、`npm run lint`、`npm run start`、`npm run test`
- **项目文档**：REQUIREMENTS.md ✓ · TASKS.md ✓ · TEST_PLAN.md ✓ · PERF_BUDGET.md ✓ · RELEASE_CHECKLIST.md ✓ · APPROVALS.md ✓ · ADR.md ✓ · openapi.json ✓ · PROJECT_MEMORY.md ✓
- **工作流**：`.ai/workflows` 5 个（`bug-fix.js`, `deploy.js`, `doc-update.js`, `feature-dev.js`, `req-parallel.js`）· `dsh/workflows` 5 个 · 两侧一致
<!-- memory:structure:end -->

## 完成线

<!-- memory:completion:begin -->
| 日期 | REQ | TASK | 事件 | 证据 | commit |
|---|---|---|---|---|---|
| 2026-09-18 | REQ-001 | TASK-001 | completed | bash -lc "npm test" → pass 43 / fail 0 / skipped 0；REQ-001 五条验收标准逐条判定通过；台账回填见 docs/requirements/TASKS.md | 7f7411a |
| 2026-09-18 | REQ-001 | TASK-002 | completed | bash -lc "npm test" → pass 43 / fail 0；台账三份已入库，见 docs/requirements/TASKS.md | e26b1a1 |
| 2026-09-18 | REQ-001 | TASK-003 | completed | bash -lc "npm test" → pass 43 / fail 0；审批留痕已入库，见 docs/approvals/APPROVALS.md | 626eafe |
<!-- memory:completion:end -->
