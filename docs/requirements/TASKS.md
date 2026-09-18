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

### TASK-004 补齐测试计划与发布检查清单并入库
- **关联需求**：REQ-002
- **依赖**：TASK-003
- **做什么**：把 `docs/testing/TEST_PLAN.md` 与 `docs/release/RELEASE_CHECKLIST.md` 从空模板写成与本项目实际一致的文档并入库，使 merge request 验收清单里的「测试/门禁全绿」「回滚预案就绪」可核验。
- **产出**：`docs/testing/TEST_PLAN.md`、`docs/release/RELEASE_CHECKLIST.md`、`.gitignore`
- **文件范围**：`docs/testing/`, `docs/release/`, `.gitignore`
- **验证方式**：`npm test`；断言——两份文档 `grep -c '{{'` 为 0、`git ls-files docs/testing docs/release` 恰 2 份、覆盖率数字与 `node --test --experimental-test-coverage` 实测一致、`MERGE_REQUEST.md`/`PERF_BUDGET.md` 仍被忽略。
- **状态**：已完成
- **验证结果**：`node scripts/task-flow.mjs finish --test "npm test"` —— 门禁 43 通过 / 0 失败后自动合并为 `9b973c9`。断言：① 两份文档 `grep -c '{{'` = 0 ✅ ② `git ls-files docs/testing docs/release` 恰 2 份 ✅ ③ 覆盖率数字 92.29/96.44/89.46 与 `node --test --experimental-test-coverage` 实测一致 ✅ ④ `MERGE_REQUEST.md` 与 `PERF_BUDGET.md` 仍被忽略 ✅ ⑤ `memory check` 通过 ✅

### TASK-005 IVE 转 GLB（追溯登记）
- **关联需求**：REQ-003
- **依赖**：无
- **做什么**：追溯登记平台采纳前已交付的 IVE 转 GLB 能力——原生助手 + Node 侧自包含 GLB 组装 + 上轴转换 + 贴地归心 + 顶点焊接。本任务不产生新代码，只把既有交付纳入台账。
- **产出**：`src/ive.js`、`native/ive2glb/`、`scripts/build-ive2glb.sh`、`vendor/ive2glb/darwin-arm64/`、`test/ive.test.js`
- **文件范围**：`src/ive.js`, `native/`, `scripts/build-ive2glb.sh`, `test/ive.test.js`
- **验证方式**：`node --test test/ive.test.js`（24 用例）；关键数值断言见 REQ-003 验收标准
- **状态**：已完成
- **验证结果**：平台采纳前交付（主提交 `5b5b495`，其后 `6ada92d` 修复合并不见导出的加载错误），本次追溯登记。回归证据 `pass 24 / fail 0`；世界盒 `0.538 × 1.364 × 1.056`、顶点 56,772 → 11,516、`min.y = 0`

### TASK-006 Cesium 兼容性修复能力（追溯登记）
- **关联需求**：REQ-004
- **依赖**：无
- **做什么**：追溯登记平台采纳前已交付的 GLB 修复能力——蒙皮烘焙、图元合并、缺 UV 补全、扩展清理、贴图内嵌与 JPEG→PNG、批处理进度。同样不产生新代码。
- **产出**：`src/repair.js`、`test/repair.test.js`
- **文件范围**：`src/repair.js`, `test/repair.test.js`
- **验证方式**：`node --test test/repair.test.js`（19 用例）
- **状态**：已完成
- **验证结果**：平台采纳前交付（`fd90022` 建立工作流、`1c266a4` 修复加载挂死与贴图不显示）。回归证据 `pass 19 / fail 0`

### TASK-007 体检核心：src/inspect.js + src/transform.js
- **关联需求**：REQ-005（验收标准 1、2、3、5）
- **依赖**：无
- **做什么**：实现只读体检报告与它依赖的世界盒/矩阵工具：体积、节点/网格/图元/顶点/三角面、贴图规格与问题（NPOT+mipmap、1×1 占位、未被采样）、材质/采样器/扩展、`bounds.accessorUnion` 与 `bounds.world` 及其偏差倍数、中心点、上轴判定、比例尺；对异常输入产出可读问题条目而非抛异常。
- **产出**：`src/inspect.js`、`src/transform.js`、`test/inspect.test.js`
- **文件范围**：`src/inspect.js`, `src/transform.js`, `test/inspect.test.js`
- **验证方式**：`node --test test/inspect.test.js`；外加 002 M1 的退出标准——`node -e "inspect('o-model/运输车.glb')"` 给出 world ≈ 2.59×4.10×5.98 且 deviationFactor > 1000；24 个 GLB 全跑通、单文件 ≤ 2s（上限 M1A2 174,937 顶点）；`triangles === Σ(indices.count)/3`；`vertexReuseRatio(person 参考件) === 0.61`
- **状态**：进行中（返工）
- **返工原因**：冷上下文审查不通过——BR-020「不抛异常」被实锤违反（5 类畸形 GLB 抛 TypeError、CLI 崩溃）、JPEG 头 1024 字节上限致 62% 内嵌贴图规格检测静默失效，另有 8 项重要问题；原证据③（21/21 `trianglesMatch`）因判据恒等而无效，一并重做
- **验证结果**：`task-flow finish --test "npm test"` —— 门禁 **57 通过 / 0 失败**（原 43 + 新增 14），自动合并为 `767aa63`。M1 退出标准逐条实测：
  ① `node src/inspect.js o-model/运输车.glb` → 世界盒 `2.59 × 4.10 × 5.98` m、偏差 **4461.888 倍**（>1000）、列出 accessor 盒 `11571.59 × 15430.28 × 23539.10` ✅
  ② 21 个样例（`o-model/` 18 + `model/` 3）全部 `ok:true`、0 崩溃，最慢 **11 ms**（`M1A2艾布拉姆斯坦克.glb`，174,937 顶点）远低于 2s 上限 ✅
  ③ `triangles` 与 `Σ(indices.count)/3` 全等（21/21）；person 参考件 `vertexReuseRatio = 0.6085 ≈ 0.61` ✅
  ⑤ 异常输入（非 GLB / 不可读 / 解析失败 / 缺 TEXCOORD / 外部贴图缺失）均转为中文问题条目，不抛异常 ✅

### TASK-008 界面体检面板与预览方向/缩放控件
- **关联需求**：REQ-005（验收标准 4）
- **依赖**：TASK-007
- **做什么**：把体检报告做成界面面板（世界盒/accessor 盒双列 + 偏差告警 + 问题清单），并在 Cesium 预览上提供方向/缩放即时修正控件（只影响预览，写回需显式操作），日志记录最终 `modelMatrix`。
- **产出**：`src/renderer.js`、`src/index.html`、`src/styles.css`、`src/main.js`（IPC）、`src/preload.js`
- **文件范围**：`src/renderer.js`, `src/index.html`, `src/styles.css`, `src/main.js`, `src/preload.js`
- **验证方式**：手工冒烟——打开一个体积正常的与一个 accessor 盒失真的模型，面板双列数值与告警可见；拖动方向/缩放使人物与车辆同框，日志出现最终 `modelMatrix`；确认输出文件未被改写（对比 `mtime` 与哈希）
- **状态**：待开始
- **验证结果**：（待 TASK-007 完成后开始）

## 依赖 DAG

```text
TASK-001 ──▶ TASK-002 ──▶ TASK-003 ──▶ TASK-004

TASK-005（追溯登记，独立）
TASK-006（追溯登记，独立）

TASK-007 ──▶ TASK-008
```

## 并行批次

> 就绪集（依赖已全部完成）中的任务可并行；**文件范围重叠的任务必须排入不同批次**。
> 合并**严格一次一个**，因此这里只规划开发并行度，不规划合并并行度。

| 批次 | 任务 | 依据 |
| :-- | :-- | :-- |
| 1 | TASK-001 | 无依赖 |
| 2 | TASK-002 | 依赖 TASK-001 已完成 |
| 3 | TASK-003 | 依赖 TASK-002 已完成 |
| 4 | TASK-004 | 依赖 TASK-003 已完成 |
| 5 | TASK-005, TASK-006 | 追溯登记，无依赖 |
| 6 | TASK-007 | 无依赖（REQ-005 核心） |
| 7 | TASK-008 | 依赖 TASK-007，且与其文件范围不重叠 |

## 进度

| 任务 | 关联 REQ | 状态 | 已验证 |
| :-- | :-- | :-- | :-- |
| TASK-001 | REQ-001 | 已完成 | ☑ |
| TASK-002 | REQ-001 | 已完成 | ☑ |
| TASK-003 | REQ-001 | 已完成 | ☑ |
| TASK-004 | REQ-002 | 已完成 | ☑ |
| TASK-005 | REQ-003 | 已完成 | ☑（追溯） |
| TASK-006 | REQ-004 | 已完成 | ☑（追溯） |
| TASK-007 | REQ-005 | 进行中（冷上下文审查不通过，返工中） | ☐ |
| TASK-008 | REQ-005 | 待开始 | ☐ |
