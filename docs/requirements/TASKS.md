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
- **验证方式**：`node --test test/inspect.test.js`（36 用例）；外加 002 M1 的退出标准——`node src/inspect.js o-model/运输车.glb` 给出 world ≈ 2.59×4.10×5.98 且 deviationFactor > 1000；样例集全部跑通、单文件 ≤ 2s（历史上限 M1A2 174,937 顶点）。**样例模型不入库，个数随本地增减**：扫全语料的用例只要求 ≥1 个并随语料伸缩、不硬编码数量，单个真值用例在夹具缺失时按 `fixtureSkipReason()` 跳过；`mode=4` 的索引数可被 3 整除（无 mode=4 索引图元时为 null）；`vertexReuseRatio(person 参考件) === 0.61`；`node scripts/memory.mjs check` 通过。**注**：原先写的 `triangles === Σ(indices.count)/3` 在无非索引图元时是恒等式、有非索引时必然为 false，作为判据无效，已替换
- **状态**：已完成
- **返工记录**（保留以下历史，不改写）：第一轮冷上下文复审判为「不通过」——BR-020「不抛异常」被实锤违反（5 类畸形 GLB 抛 TypeError、CLI 崩栈）、JPEG 头 1024 字节上限致 62% 内嵌贴图规格检测静默失效，另有 8 项重要问题；原证据③（21/21 `trianglesMatch`）因判据恒等而无效。第二轮复审判为「有条件通过」，残留缺陷已逐条修复
- **验证结果**：两轮独立冷上下文复审后关闭，门禁 `task-flow finish --test "npm test"` → **79 通过 / 0 失败**，自动合并为 `6837856`（第一轮返工合并 `3095a70`、第二轮 `6837856`）。
  ① `node src/inspect.js o-model/运输车.glb` → 世界盒 `2.59 × 4.10 × 5.98` m、偏差 **4461.888 倍**、accessor 盒 `11571.59 × 15430.28 × 23539.10` ✅
  ② 21 个样例（`o-model/` 18 + `model/` 3）全部 `ok:true`、0 崩溃，最慢 **15 ms** ✅
  ③ person 参考件 `vertexReuseRatio = 0.6085`；三角面按 `primitive.mode` 统计并上报 `modeHistogram` ✅
  ④ **BR-020 抗畸形**：400 次随机结构破坏 fuzz → 抛异常 **0**、`partial` **0**（修 asArray 前为 66 次）；22 类畸形 + 8 类怪异输入同样 0 抛异常 ✅
  ⑤ **BR-022 贴图规格**：内嵌贴图读出宽高 **18/48 → 48/48**（复审用旧码并排实测），读不出时发 `TEXTURE_DIMENSIONS_UNKNOWN` ✅
  覆盖率：`inspect.js` 行 94.96% / 分支 81.48%，`transform.js` 100% / 89.26% ✅
- **已知遗留**（不阻塞本任务，另立任务处理）：`KHR_texture_transform.texCoord` 覆盖被忽略（`collectTextureSlots` 与 `repair.js::collectMaterialTexCoords` 一致忽略）→ `MISSING_TEXCOORD` 可能漏报
- **补充复测**（2026-09-18，样例集被裁剪之后；不改写上方历史结论）：本地样例变为 4 个 GLB（`o-model/蹲姿.glb` + `model/{person-move,person-stand,蹲姿}.glb`）→ 0 崩溃、最慢 **1 ms**、`triangles` 与 `Σ(mode=4 索引数)/3` 4/4 一致、内嵌贴图宽高 12/12 可读；`o-model/运输车.glb` 已不在本地，其真值用例按夹具缺失跳过，`node --test test/inspect.test.js` → **35 通过 / 1 跳过 / 0 失败**。用例自身已改为随语料伸缩（曾硬编码 ≥20，语料一裁剪即失败）
### TASK-008 界面体检面板与预览方向/缩放控件
- **关联需求**：REQ-005（验收标准 4）；设计决策 ADR-002（上轴三态）、ADR-004（预览修正不写回）
- **依赖**：TASK-007
- **做什么**：把体检报告做成界面面板（世界盒/accessor 盒双列 + 偏差告警 + 事实行 + 问题清单），并在 Cesium 预览上提供**只影响预览**的修正控件：方向、缩放、以及 ADR-002 要求由人工点一次的上轴三态（`auto`/`Y-up`/`Z-up → Y-up`）；日志记录最终 `modelMatrix` 并注明未写回，写回仍是另一个显式操作（当前不存在）。
- **产出**：`src/renderer.js`、`src/index.html`、`src/styles.css`、`src/main.js`（IPC）、`src/preload.js`、`src/report-format.js`（新）、`src/preview-transform.js`（新）、`test/report-format.test.js`（新）、`test/preview-transform.test.js`（新）、`test/ui-smoke.cjs`（新，人工跑）
- **文件范围**：`src/renderer.js`, `src/index.html`, `src/styles.css`, `src/main.js`, `src/preload.js`, `src/report-format.js`, `src/preview-transform.js`, `test/report-format.test.js`, `test/preview-transform.test.js`, `test/ui-smoke.cjs`, `package.json`
- **验证方式**：① `node --test test/report-format.test.js test/preview-transform.test.js`（纯函数：矩阵顺序/上轴三态/偏差文案与档位一致/残缺报告降级）；② `node test/ui-smoke.cjs <模型> --port <调试端口>` 用 CDP 驱动真实渲染进程，断言面板数值、偏差配色、问题排序、拖动不刷日志、`change` 记录最终 `modelMatrix`、上轴三态复合矩阵、失败路径不打断预览，并对输入文件做 `shasum` 前后比对；③ 人工目视：`选择预览模型（单个）` 分别取一个 GLB 与一个 IVE，看直立/贴地/贴图与"人物与车辆同框"
- **状态**：已完成
- **验证结果**：
  ① 纯函数：`node --test test/report-format.test.js test/preview-transform.test.js` → **24 通过 / 0 失败**（`npm test` 104 通过 / 0 失败 / 4 跳过）。
  ② 接线冒烟（`node test/ui-smoke.cjs model/蹲姿.glb --port 9333`）：面板 `hidden=false`、世界盒 `0.538 × 1.364 × 1.056 m`、accessor 盒 `0.005 × 0.011 × 0.012 m`、偏差档位 `inspect-deviation warn`（文案「尺寸比 129.211 倍（中心位置基本一致）…」）、6 条事实行（含**比例尺**）、问题按 warn→info 排序、面板文本无 `undefined`/`NaN`；拖动 5 次 `input` 新增日志 **0 行**，`change` 各记 1 行；方向 90°+缩放 2× 的 `modelMatrix` 与列主序手算一致；上轴选 `Z-up` 后矩阵为 `Rx(−90°)∘Ry(90°)∘2` 的复合；重置回 `0°/1.00×/auto`；输入文件 `shasum -a 256` 前后一致；缺失文件走 `{ ok:false, error:'无法读取文件：ENOENT…' }` 而不是 reject。IVE（`o-model/蹲姿.ive`）同样跑通，世界盒 `0.538 × 1.364 × 1.056 m`、中心 `0.000, 0.682, -0.000`，`.ive` 哈希不变。
  ③ 人工目视：**待 sunny-zhai 确认**（自动化只覆盖接线与数值，覆盖不到"看起来对不对"）。
  ④ 冒烟中暴露的**两处既有缺陷**（不在本任务范围，另立 TASK-009）：`inspect.js` 漏传默认场景导致 `UNREFERENCED_MESHES` 100% 误报；`renderer.js::waitForModelReady` 在模型已就绪时仍可能永远不落定（`#validationStatus` 卡在「正在加载…」）。

### TASK-009 修掉 TASK-008 冒烟暴露的两处既有缺陷
- **关联需求**：REQ-005（缺陷修复，不改写 TASK-007 的历史结论）
- **依赖**：TASK-008
- **做什么**：① `src/inspect.js` 调用 `reachableMeshIndexes(json)` 时漏了第二个参数（`scene`），于是"默认场景可达网格"恒为空集，**任何含网格的文件都会误报 `UNREFERENCED_MESHES`**（且同一份报告照样算得出世界盒，自相矛盾）；补上 `defaultSceneOf(json)` 并加回归用例（全部被引用的文件不得出现该条目、只在非默认场景里的网格必须出现）。② `src/renderer.js::waitForModelReady` 在 `Cesium.Model.fromGltfAsync` 已落定、模型已可用之后仍可能等不到 `readyEvent`（`model.ready` 为 false），导致 `validateModel` 永不返回：`#validationStatus` 卡在「正在加载…」，包围盒诊断与默认取景都不执行。保留错误分支，另加超时兜底（继续走完诊断与取景，并记一行中文警告）。
- **产出**：`src/inspect.js`、`src/renderer.js`、`test/inspect.test.js`
- **文件范围**：`src/inspect.js`, `src/renderer.js`, `test/inspect.test.js`
- **验证方式**：① `node --test test/inspect.test.js` 新增两条回归用例；② `node src/inspect.js model/person-stand.glb` 不再出现 `UNREFERENCED_MESHES`（本地 4 个样例逐个核对）；③ `node test/ui-smoke.cjs model/蹲姿.glb --port 9333` 的「加载预览模型」步骤必须返回、`#validationStatus` 变为「加载成功」、日志出现相机诊断；④ `npm test` + `npm run lint` + `node scripts/memory.mjs check` 通过
- **状态**：待开始
- **验证结果**：（待开始）

## 依赖 DAG

```text
TASK-001 ──▶ TASK-002 ──▶ TASK-003 ──▶ TASK-004

TASK-005（追溯登记，独立）
TASK-006（追溯登记，独立）

TASK-007 ──▶ TASK-008 ──▶ TASK-009（缺陷修复，依赖 TASK-008 的冒烟证据）
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
| 8 | TASK-009 | 依赖 TASK-008（缺陷由它的冒烟暴露），文件范围与 TASK-008 不重叠 |

## 进度

| 任务 | 关联 REQ | 状态 | 已验证 |
| :-- | :-- | :-- | :-- |
| TASK-001 | REQ-001 | 已完成 | ☑ |
| TASK-002 | REQ-001 | 已完成 | ☑ |
| TASK-003 | REQ-001 | 已完成 | ☑ |
| TASK-004 | REQ-002 | 已完成 | ☑ |
| TASK-005 | REQ-003 | 已完成 | ☑（追溯） |
| TASK-006 | REQ-004 | 已完成 | ☑（追溯） |
| TASK-007 | REQ-005 | 已完成（经两轮冷上下文复审） | ☑ |
| TASK-008 | REQ-005 | 已完成（待人工目视确认） | ☑ 自动 / ☐ 人工 |
| TASK-009 | REQ-005 | 待开始 | ☐ |
