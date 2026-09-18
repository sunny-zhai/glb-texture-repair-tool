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
  - `o-model/` → （无子目录）
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
| 2026-09-18 | REQ-002 | TASK-004 | completed | bash -lc "npm test" → pass 43 / fail 0；基线与覆盖率见 docs/testing/TEST_PLAN.md 与 docs/release/RELEASE_CHECKLIST.md | 9b973c9 |
| 2026-09-18 | REQ-003 | TASK-005 | completed | node --test test/ive.test.js → pass 24 / fail 0；世界盒 0.538 × 1.364 × 1.056、顶点 56,772→11,516；规则见 docs/001-code-design.md（备注：平台采纳前交付，本次追溯登记） | 5b5b495 |
| 2026-09-18 | REQ-004 | TASK-006 | completed | node --test test/repair.test.js → pass 19 / fail 0；规则见 docs/001-code-design.md（备注：平台采纳前交付，本次追溯登记） | 1c266a4 |
| 2026-09-18 | REQ-005 | TASK-007 | completed | bash -lc "npm test" → pass 57 / fail 0；M1 判据：运输车世界盒 2.59×4.10×5.98 偏差 4461.9 倍、21 样本 0 崩溃最慢 11ms、person 比值 0.6085；实现见 src/inspect.js 与 src/transform.js | 767aa63 |
| 2026-09-18 | REQ-005 | TASK-007 | reopened | 冷上下文审查（独立 reviewer）结论不通过：BR-020「不抛异常」被实锤违反（meshes:[null] 等 5 类畸形 GLB 令 inspect 抛 TypeError、CLI 崩溃）；JPEG 头扫描 1024 字节上限致样例集 48 张内嵌贴图中 30 张读不到宽高，贴图规格检测静默失效；另有 deviationFactor 对纯平移失明、accessorUnionBounds 并入非场景网格等 8 项（备注：审查由独立上下文 subagent 执行；结论同时指出 TASK-007 原证据③（21/21 trianglesMatch）因判据恒等而无效） | bddd6b8 |
| 2026-09-18 | REQ-005 | TASK-007 | completed | bash -lc "npm test" → pass 79 / fail 0；两轮独立冷上下文复审后关闭：BR-020 400 次 fuzz 抛异常 0、内嵌贴图宽高 18/48 → 48/48；实现见 src/inspect.js 与 src/transform.js，用例见 test/inspect.test.js（备注：第二轮复审为「有条件通过」，残留缺陷已逐条修复；已知遗留 KHR_texture_transform 另立任务） | 6837856 |
| 2026-09-18 | REQ-005 | TASK-008 | completed | npm test 100 通过 / 0 失败 / 4 跳过；test/report-format.test.js + test/preview-transform.test.js 24/24；test/ui-smoke.cjs 在 model/蹲姿.glb 与 o-model/蹲姿.ive 上 26/27 项断言通过（1 项未绿=既有缺陷，见 TASK-009）；面板世界盒 0.538×1.364×1.056 m、偏差档 warn、拖动 0 行日志、上轴 Z-up 复合矩阵与手算一致、输入文件哈希不变 | 858b49a |
| 2026-09-18 | REQ-005 | TASK-009 | completed | inspect.test.js 37 通过（2 条新回归用例在旧代码上会红）；本地样例 UNREFERENCED_MESHES 误报 4/4 → 0/4；ui-smoke 在 model/蹲姿.glb 与 o-model/蹲姿.ive 上 9 步 0 失败（含 waitForModelReady 的 ready/error/超时/晚到就绪四路径）；npm test 106/102/0/4；lint 通过 | caa812e |
| 2026-09-18 | REQ-006 | TASK-010 | completed | npm run lint 通过；npm test → 106 用例 / 102 通过 / 0 失败 / 4 跳过；ui-smoke 在 model/蹲姿.glb 与 o-model/蹲姿.ive 上各 32 步 / 99 条断言 / 0 失败（含画布高度 ≥ CANVAS_MIN_HEIGHT 与假绿防线）；第二轮交付前冷审为有条件通过，重要项已修（画布下限 127→161px，实测种入 bottom:99999 后画布 161px、标题行 34px）；人工目视待 sunny-zhai 确认 | b8bdddc |
<!-- memory:completion:end -->
