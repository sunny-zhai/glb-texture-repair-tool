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
  ② 接线冒烟（`node test/ui-smoke.cjs model/蹲姿.glb --port 9333`，CDP 读真实 DOM）：面板 `hidden=false`、`inspectStatus`「体检完成 · 9 ms · 错误 0 / 警告 1 / 提示 1」、世界盒 `0.538 × 1.364 × 1.056 m`（中心 `0.032, 0.664, -0.052 m`）、accessor 盒 `0.005 × 0.011 × 0.012 m`、偏差档位 `inspect-deviation warn`、偏差原文「世界盒与 accessor 盒相差 129.211 倍：尺寸比 129.211 倍（中心偏移比 0.373），按 accessor 盒取景会错位。」、6 条事实行（几何/结构/贴图/采样/上轴/**比例尺 `中位节点缩放 100 · 3 个节点不是单位缩放`**）、问题按 warn→info 排序、面板文本无 `undefined`/`NaN`；拖动 5 次 `input` 新增日志 **0 行**，`change` 各记 1 行；方向 90°+缩放 2× 的 `modelMatrix` 与列主序手算一致；上轴选 `Z-up` 后矩阵为 `Rx(−90°)∘Ry(90°)∘2` 的复合；重置回 `0°/1.00×/auto` 且只记 1 行；输入文件 `shasum -a 256` 前后一致；缺失文件走 `{ ok:false, error:'无法读取文件：ENOENT…' }` 而不是 reject。IVE（`o-model/蹲姿.ive`）同样跑通，世界盒 `0.538 × 1.364 × 1.056 m`、中心 `0.000, 0.682, -0.000`，`.ive` 哈希不变。
  ③ 人工目视：**待 sunny-zhai 确认**（自动化只覆盖接线与数值，覆盖不到"看起来对不对"）。
  ④ 冒烟中暴露的**两处既有缺陷**（不在本任务范围，另立 TASK-009）：`inspect.js` 漏传默认场景导致 `UNREFERENCED_MESHES` 对任何含网格的文件都误报；「加载预览模型」步骤超时——经 CDP 探针确认是**窗口不可见时页面被节流**（`document.hidden === true` → rAF 不跑 → Cesium 从未渲染，渲染帧计数 `scene.frameState.frameNumber` 停在 0、`resourcesLoaded=false` → `waitForModelReady` 挂起、`#validationStatus` 停在「正在加载…」），不是 ready 事件竞态。

### TASK-009 修掉 TASK-008 冒烟暴露的两处既有缺陷
- **关联需求**：REQ-005（缺陷修复，不改写 TASK-007 的历史结论）
- **依赖**：TASK-008
- **做什么**：① `src/inspect.js` 调用 `reachableMeshIndexes(json)` 时漏了第二个参数（`scene`），于是"默认场景可达网格"恒为空集，**任何含网格的文件都会误报 `UNREFERENCED_MESHES`**（且同一份报告照样算得出世界盒，自相矛盾）；该集合全文件只用在这一条 issue 上，盒/计数/几何统计不受影响。补上 `defaultSceneOf(json)`（面板侧那句"未见异常缩放"的别扭措辞已在 TASK-008 改掉，`inspect.js` 的 `>100` 门槛保持不动）。② **窗口不可见时预览永远不落定**：页面 `hidden` → `requestAnimationFrame` 被节流 → Cesium 一帧都没渲染（渲染帧计数 `scene.frameState.frameNumber` 停在 0、`resourcesLoaded` 仍为 false）→ 那句「置 `_ready` 并发 `readyEvent`」的 `afterRender` 回调从未执行 → `waitForModelReady` 挂起、`#validationStatus` 停在「正在加载…」、包围盒诊断与默认取景都不执行（转前台后 rAF 恢复即会补跑，所以不是永久卡死，但被遮挡期间一直卡着）。根因修法是 `webPreferences.backgroundThrottling: false`（应用与冒烟都不再依赖"窗口在最前面"），另加超时兜底且**超时文案必须与「已加载」区分**（例如「模型对象已创建，但当前未渲染（窗口不可见时会暂停渲染），请切到前台确认」），避免窗口仍不可见时 `#validationStatus` 被假绿。
- **产出**：`src/inspect.js`、`src/renderer.js`、`src/main.js`、`test/inspect.test.js`、`test/ui-smoke.cjs`
- **文件范围**：`src/inspect.js`, `src/renderer.js`, `src/main.js`, `test/inspect.test.js`, `test/ui-smoke.cjs`
- **验证方式**：① `node --test test/inspect.test.js` 新增回归用例——"全部被引用的文件不得出现 `UNREFERENCED_MESHES`"（可直接用 `test/report-format.test.js` 里那份合成三角形 GLB 的夹具）＋"只在非默认场景里的网格必须出现"；② 本地 4 个样例逐个 `node src/inspect.js` 核对不再出现该条目，真实未引用的文件仍照报；③ 冒烟 `node test/ui-smoke.cjs model/蹲姿.glb --port 9333` **全部断言通过**，且其中「预览加载必须返回」为真通过（不能靠超时兜底蒙过：窗口不可见时超时文案必须是"未渲染"，断言要同时检查 `#validationStatus` 是否真的是「加载成功」）；④ `npm test` + `npm run lint` + `node scripts/memory.mjs check` 通过
- **状态**：已完成
- **验证结果**：
  ① `node --test test/inspect.test.js` → **37 通过 / 1 跳过 / 0 失败**（新增 2 条回归用例全绿）；且**验证过这两条用例在旧代码上会红**——把 `inspect.js` 的调用临时改回 `reachableMeshIndexes(json)` 后，「全部被引用的文件不得出现该条目」用例 fail 1，恢复修复后 pass 1（回归网本身有效，不是永远为真的断言）。
  ② 本地 4 个样例逐个核对：修复前 4/4 都打印「N 个网格没有被**默认场景**引用」，修复后**0/4**；真实的 `ACCESSOR_BOUNDS_UNRELIABLE` 告警仍在（`model/person-stand.glb` 仍报 297.194 倍偏差）。旧代码可用 `reachableMeshIndexes(json)` → `0` vs 两参调用 → `3` 直接复现。
  ③ 冒烟 `node test/ui-smoke.cjs`：`model/蹲姿.glb` 与 `o-model/蹲姿.ive` **各 8 步、0 项失败（全绿）**——此前一直红的「加载预览模型」已转绿，且断言已加强为必须真出现「加载成功」而不是"落定即可"（防止被超时兜底假绿）。
  ④ `npm test` → **106 用例 / 102 通过 / 0 失败 / 4 跳过**；`npm run lint` 通过。`node scripts/memory.mjs check` 在任务分支上会因「TASKS.md 已标完成、完成线还没有条目」而红——完成线按平台规则**只在串行合并点写入**（`.ai/AGENTS.md` §4，单写者）；合并为 `caa812e` 后已追加 `completed` 条目，`memory check` 转绿通过。

### TASK-010 编辑器式布局重排（左队列 / 中 3D 主视口 / 右体检器 / 底部日志）
- **关联需求**：REQ-006（验收标准 1~7）；设计决策见 ADR-006
- **依赖**：无（在 TASK-009 之后开工，避免与其争抢 `renderer.js`）
- **做什么**：把单列流式布局改成编辑器式：CSS Grid 三栏 + 底部日志 + 常驻状态栏；4px 分隔条可拖拽调宽调高（指针捕获 + 最小尺寸 clamp）；面板折叠；布局状态写 `localStorage` 并在启动时恢复（读取时 clamp）；3D 容器挂 `ResizeObserver` → `viewer.resize()`（节流到下一帧）；窄窗口降级两栏 + 右栏抽屉；状态栏汇总当前模型/大小/体检计数/批量进度；补焦点样式与键盘可达。**保留所有既有元素 id 与事件绑定**，不改修复/体检逻辑与 IPC。
- **产出**：`src/index.html`、`src/styles.css`、`src/renderer.js`、`test/ui-smoke.cjs`（布局断言）
- **文件范围**：`src/index.html`, `src/styles.css`, `src/renderer.js`, `test/ui-smoke.cjs`
- **验证方式**：① `npm run lint` + `npm test` 全绿；② `node test/ui-smoke.cjs <模型> --port <端口>` 在既有断言（面板数值/配色、拖动不刷日志、`change` 记最终矩阵、上轴复合矩阵、失败路径不打断预览、输入文件哈希不变）之外新增布局断言：无整页滚动、三栏 + 底部日志同时存在、3D 容器最宽、拖动分隔条生效且触发 `viewer.resize()`、折叠日志后 3D 高度增加、`localStorage` 有记忆键；③ 人工目视：1280×800 与 900px 两个宽度下无横向滚动、拖拽手感、模型直立贴地同框。
- **状态**：已完成
- **验证结果**：
  ① `npm run lint` 通过；`npm test` → **106 用例 / 102 通过 / 0 失败 / 4 跳过**。
  ② 冒烟 `node test/ui-smoke.cjs` 在 `model/蹲姿.glb` 与 `o-model/蹲姿.ive` 上**各 32 步 / 99 条断言 / 0 项失败**（既有 36 条 check 一条未删；新增布局/键盘/假绿防线断言）；默认布局实测左 260 / **中 492（最宽）** / 右 340、3D 画布 492×274、无整页滚动。
  ③ 第一轮独立冷上下文复审结论 **通过（无阻塞级、无重要问题）**，其 6 条次要项已逐条处理：坏值不再退化成下限（`typeof value !== 'number'` 才回落默认）、`localStorage` 的 `version` 不匹配整份丢弃、冒烟里那条自我满足的默认布局断言换成"种入非默认值 + 重载 + 必须真的生效"、`resizeCount()` 只统计真实调用、窄布局的体检配色线索由状态栏接力、底部栏上限再扣预览控件条高度。
  ④ 第二轮独立冷上下文复审（交付前，`condition: 有条件通过 / 无阻塞级`）指出 1 条重要问题并已修复：**`CANVAS_MIN_HEIGHT=160` 当时只兑现到 127px**——`clampLayout` 的高度预算漏了中栏自己的标题行 `.pane-center .pane-header`（34px）。修法是把它计入 `chrome`（`src/renderer.js`），并把冒烟阈值从写死的 `> 120` 改成引用模块常量（`window.__layout.limits.canvasMinHeight`），另新增"日志拖到上限后画布仍 ≥ 常量"的断言。**实测证据**：种入 `bottom:99999` 并重载后画布 **161px ≥ 160**、标题行 34px（旧代码同口径为 127 < 160，该断言在旧代码上必红）；`node test/ui-smoke.cjs` GLB 与 IVE 两遍仍为 **32 步 / 99 条断言 / 0 失败**。同轮另外落地 4 条次要项：分隔条折叠/展开的 resize 断言改为**前后分别计数**（不再被 `ResizeObserver` 顺带触发蒙过）、`initLayout()` 加幂等护栏、`localStorage` 布尔字段只认真正布尔（真值垃圾串不再静默折叠日志）、以及给冒烟加**假绿防线**——任一步骤超时/未返回即红 + 已执行断言数下限（99）+ 真正安装页面错误采集（`window.__smokeErrors` 此前是从未赋值的死字段）。
  ⑤ 人工目视（拖拽手感、配色层级、900px 窄布局）**待 sunny-zhai 确认**。

### TASK-011 修掉"栏位尺寸被数据改写"（REQ-006 缺陷修复）
- **关联需求**：REQ-006（回归验收标准 2/3/5；不改写 TASK-010 的历史结论）
- **依赖**：TASK-010（缺陷由它的交付暴露）
- **做什么**：用户反馈"界面宽高会受到数据影响自动调整"。实测（窗口 1100×760）**宽度不受数据影响**（左/右栏全程 260/340 未动），但**高度会**：
  ① 模型路径变长时 `#validationModelSummary` 从 1 行（18px）**换行成 2 行（36px）**，预览条 126→144px，3D 画布被顶掉 18px（161→143）；
  ② 更严重的是它**会改写用户设定的日志高度**：`clampLayout` 的高度预算里减了实时的 `previewBar.offsetHeight` 与 `helpPanel.offsetHeight`，于是"路径变长 → 预览条变高 → 日志上限变小 → 下一次重算（缩窗/拖分隔条）把 `--pane-bottom` 从 313 夹到 295 **并 `saveLayout()` 落盘**，换回短路径也不恢复"（实测 A→D 四态）；
  ③ 打开帮助面板同样把用户日志高度预算改小（帮助是**临时**面板，不该写进布局记忆）。
  **修法**：让高度预算只依赖"窗口尺寸 + 用户操作"，不依赖内容——(a) 预览信息行改为**单行省略号**（完整路径挂 `title`，信息不丢）；(b) `clampLayout` **不再减 `helpPanel.offsetHeight`**（帮助面板由 `minmax(0,1fr)` 的工作区行吸收，并给它加 `max-height` + 内部滚动，保证仍不整页滚动）。
- **产出**：`src/renderer.js`、`src/styles.css`、`test/ui-smoke.cjs`（回归断言）
- **文件范围**：`src/renderer.js`, `src/styles.css`, `test/ui-smoke.cjs`
- **验证方式**：① 回归断言——同一窗口下把 `#validationModelSummary` 文本从 20 字改成 400 字，预览条高度与 `--pane-bottom` **必须完全不变**；打开帮助面板前后 `--pane-bottom` 与 `localStorage` 里的 `bottom` **必须不变**；② 种入"贴着上限"的日志高度后加载超长路径模型并强制重算，`--pane-bottom` 与落盘值不得改变；③ `npm run lint` + `npm test` 全绿；④ 冒烟 `node test/ui-smoke.cjs` 在 GLB 与 IVE 上仍全绿。
- **状态**：已完成
- **验证结果**：
  ① 修复前后对比（同一台机器、1280×800、日志顶到当前窗口上限）：**修复前**——模型信息 18→108px（3 行）、预览条 99→189px、日志 380→**290px** 且 `localStorage.bottom` 380→**290**，换回短文本仍是 290（画布 160→250 有残留偏移），打开/收起帮助同样改写日志高度与落盘值；**修复后**——预览条 126 恒定、画布 161 恒定、日志 313 恒定，而 `localStorage` 里用户设定的 **367 保持不被改写**（换到大窗口仍会回到 367）。
  ② 回归断言（6 条，写在 `test/ui-smoke.cjs` 的"栏位尺寸不得被数据改写"步骤里）：长短文本下预览条高度/`--pane-bottom`/落盘 `bottom` 三者都不得变化；换回短文本必须逐像素复原；帮助开关都不得改日志高度与落盘值。**这 6 条在修复前的代码（`b8bdddc`）上实测全红，且只有这 6 条红**（证明回归网精准、既有断言未被削弱）；修复后 GLB 与 IVE 两遍各 **33 步 / 105 条断言 / 0 失败**。
  ③ 连带修掉一个更严重的隐性问题：`white-space: nowrap` 让 `.pane-center` 的隐式网格列被内容撑到 **2994px**（视觉被 `overflow:hidden` 裁掉、宽度已爆，也是拖拽宽度断言偏 4px 的根因）——由 `grid-template-columns: minmax(0, 1fr)` 修复。
  ④ `npm run lint` 通过；`npm test` → **106 用例 / 102 通过 / 0 失败 / 4 跳过**。设计/测试文档同步：`docs/design/ADR.md` 新增 ADR-007、`docs/001-code-design.md` 新增 BR-028、`docs/testing/TEST_PLAN.md` 新增 TC-016。

### TASK-012 细滚动条 + 单层滚动（一个区域内只留最外层滚动条）
- **关联需求**：REQ-006（界面体验细化；不改写 TASK-010/011 的历史结论）
- **依赖**：TASK-011
- **做什么**：用户要求 ①**滚动条改成细条、不要系统默认样式**；②**一个区域内只能最外层有滚动条，内部不要再有**。审计（运行中实例实测）确认现状：左栏一个 `.pane-body` 里**挤了 3 个滚动条**（`.pane-body` + `#inputList` + `#resultList`，后两者各带 `max-height: 200px; overflow: auto`），右栏 `.pane-body` 内还有 `#inspectIssues`（`max-height: 260px`）第二层；日志区只有 `#log` 一个（父级 `.pane-body` 已 `overflow: hidden`），本就合规。**修法**：① 全局自绘细滚动条（8px、圆角、描边内缩），只写 `::-webkit-scrollbar` 系列——Chromium 121+ 里若同时写标准属性 `scrollbar-width/color` 会**忽略** webkit 伪元素，故二者只能取一；② 去掉 `.list` 与 `.inspect-issues` 的 `max-height` + `overflow`，让每栏**只有 `.pane-body` 一个滚动容器**（日志区保留 `.log` 这唯一滚动条：它是该区域的内容框，父级已 hidden，不存在嵌套）。
- **产出**：`src/styles.css`、`test/ui-smoke.cjs`（回归断言）
- **文件范围**：`src/styles.css`, `test/ui-smoke.cjs`
- **验证方式**：① 冒烟新增断言——样式表里必须存在 `::-webkit-scrollbar` 且宽度为 8px；**先把内容灌满**（60 条超长路径输入 + 40 条结果 + 40 条体检问题 + 500 行日志，全部走真实渲染函数）再断言左/右/日志三个区域内"overflow 为 auto|scroll 的元素"各**恰好 1 个**且都真有滚动条，且页面仍不得整页滚动；② `npm run lint` + `npm test` 全绿；③ 冒烟 GLB 与 IVE 两遍全绿。
- **状态**：已完成
- **验证结果**：
  ① 修复前审计（运行中实例逐个枚举滚动容器）：左栏 `div.pane-body` + `ul#inputList` + `ul#resultList` **3 个**滚动条；右栏 `div.pane-body` + `ul#inspectIssues` **2 个**；日志区 `pre#log` **1 个**（父级已 `overflow:hidden`，本就合规）。修复后（内容灌满：60 条超长路径输入 + 40 条结果 + 40 条体检问题 + 500 行日志，全部走真实渲染函数）：左/右/日志三区**各恰好 1 个**滚动容器且都真的滚起来，页面仍不整页滚动。
  ② 新增 5 条断言，**在旧样式（HEAD）上实测 3 红 2 绿**：红的是"细滚动条规则缺失（`null`）"、"左栏非 1 个"、"右栏非 1 个"；绿的两条（日志区唯一、页面不整页滚动）本来就成立——断言与真实差异同向，不存在自我满足。
  ③ 冒烟 GLB 与 IVE 两遍各 **34 步 / 110 条断言 / 0 失败**；`npm run lint` 通过；`npm test` → **106 用例 / 102 通过 / 0 失败 / 4 跳过**。
  ④ 文档同步：`docs/001-code-design.md` 新增 BR-029；`docs/testing/TEST_PLAN.md` 新增 TC-017 并把 TC-015/TC-016 的步数与断言数更新为 34/110。实现说明：Chromium 121+ 只要写了标准属性 `scrollbar-width`/`scrollbar-color` 就会**整体忽略** `::-webkit-scrollbar`，故二者只取 webkit 版本（Electron 32 / Chromium 128）。

### TASK-013 转换内核：assimpjs → 自包含 GLB（FBX/OBJ）
- **关联需求**：REQ-007（验收标准 1~4、7、10）；设计决策见 ADR-008
- **依赖**：无（REQ-007 起点）
- **做什么**：新增 `src/convert.js`（纯 Node，CommonJS，不依赖 Electron），把 FBX/OBJ 转成**自包含** GLB：① `assimpAvailable()` / `resolveAssimpModule()`——加载 `assimpjs` 并容忍 wasm 缺失（返回中文可读原因，形如既有的 `missingIveHelperMessage()`）；② `collectSidecarFiles(inputPath)`——按扩展名收集同目录的 sidecar（`.mtl` + 贴图，含 `.fbm` 子目录），**按 basename 加入 FileList**（assimp 靠文件名互相引用）；③ `ConvertFileList(fileList, 'glb2')` 拿字节，失败时用中文包装 assimp 的 `GetErrorCode()`；④ 焊接三角汤——**复用 `src/ive.js` 已导出的 `weldVertices`**（顶点:面实测 3:1，56,772 → 目标 ~11.5k），面数与贴图必须不变；⑤ **外部贴图内嵌**——遍历产物 `images[]` 里带 `uri` 的项，用既有 `resolveExternalImage(sourceFilePath, uri)`（base 用**源文件**所在目录，而不是临时 GLB 的目录）解析后写进 bufferView；解析不到的**移除该 image 与材质贴图槽**，并把原始 `uri` 收进 `warnings` 返回（供日志/体检展示，不静默丢）。返回 `{ status, bytes, warnings, stats }`，**永不抛**（与 `repairGlbFile` 同风格）。
- **产出**：`src/convert.js`、`test/convert.test.js`
- **文件范围**：`src/convert.js`, `test/convert.test.js`, `package.json`（加 `dependencies.assimpjs`）, `src/repair.js`（**仅**新增 `resolveExternalImage` 导出，供转换内核复用既有贴图兜底）, `src/ive.js`（`weldVertices` 泛化到整型属性）
- **验证方式**：`node --test test/convert.test.js`——① `o-model/蹲姿.fbx` → 18,924 面 + ≥3 张内嵌贴图 + 上轴 Y + 世界盒与 `o-model/蹲姿.glb` 一致；② `o-model/蹲姿.obj`+`.mtl` → 18,924 面 + 世界盒 `0.5382×1.3643×1.0559`（与 `model/蹲姿.glb` 一致，容差 0.02）；③ 焊接后顶点数显著下降且面数不变、文件更小；④ 产物里**不得残留** `images[].uri`，而 `o-model/蹲姿.mtl` 的乱码绝对路径必须以 `warnings` + `missing:` 占位形式出现；⑤ 坏文件返回 `status:'error'` + 中文消息且不抛。夹具缺失时按既有 `fixtureSkipReason()` 模式跳过并打印恢复命令。
- **状态**：已完成
- **验证结果**：
  ① `node --test test/convert.test.js` → **9 用例 / 9 通过 / 0 失败**（新增文件）；全量 `npm test` → **115 用例 / 111 通过 / 0 失败 / 4 跳过**（IVE 与 repair 无回归）。
  ② FBX：**56,772 → 11,516 顶点**（与 FBX2glTF 参考件同量级）、18,924 面不变、**3 张内嵌贴图**、0 外部 uri、保留 1 蒙皮/1 动画、2.32MB、世界盒 1.8937×1.8483×0.3804 与 `o-model/蹲姿.glb` 一致。
  ③ OBJ：**56,772 → 11,516 顶点**、18,924 面、0.57MB、世界盒 **0.5383×1.3643×1.0559** 与 `model/蹲姿.glb` 一致；MTL 里的乱码绝对路径被如实报成 warning 并换成 `missing:` 占位（体检识别为 `TEXTURE_1X1_PLACEHOLDER`）。
  ④ 两个实现坑（都已修并写进注释）：**(a)** assimp 的 FBX 图元带 `JOINTS_0/WEIGHTS_0` 整型属性，原 `weldVertices` 只吃 float32 导致一个顶点都焊不动——已把该函数泛化到按 `componentType` 逐流解码/回写（默认仍是 float32，IVE 行为不变，`ive.test.js` 21 通过 0 失败），并保留 `normalized` 标志；**(b)** 焊接若"新增 accessor"而不改写原 accessor，旧 bufferView 仍被引用、压实回收不掉（实测 FBX 反而从 4.7MB 涨到 5.6MB）——改为**原地改写图元自己的 accessor**，并对被共享的 accessor 保守跳过。
  ⑤ 参考件认错一次并已纠正：`o-model/蹲姿.glb`（1.8937×1.8483×0.3804）是**绑定/平举姿态**、对应 FBX；`model/蹲姿.glb`（0.5382×1.3643×1.0559）才是**蹲姿**、对应 OBJ。需求正文已按实测改正，两个参考件不可混用。

### TASK-014 接线与打包：选择器 / 三条 IPC 路径 / 能力探测 / wasm 分发
- **关联需求**：REQ-007（验收标准 3、5、8、9）；设计决策见 ADR-008
- **依赖**：TASK-013
- **做什么**：把转换内核接进产品路径，**与 IVE 完全同构**：① `src/main.js` 的 `pick-inputs` 过滤器加 `fbx`/`obj`，`collectGlbEntries` 的扩展名列表加 `['.fbx', '.obj']`；② `repair-glb`、`read-glb-data-url`、`inspect-glb` 三条 IPC 各自把 FBX/OBJ 先转成临时 GLB（沿用 IVE 的 `fs.mkdtempSync` + `finally` 清理写法，**转换失败按文件记 error 而不中断批量**）；③ `app-capabilities` 增加 `assimp` 字段与缺失时的中文原因，`src/renderer.js` 的 `capabilityHint`/帮助文案据此提示可用格式；④ `package.json`：`dependencies` 加 `assimpjs`、`asarUnpack` 加 `node_modules/assimpjs/dist/**`（wasm 必须能按 `__dirname` 读到，与 `vendor/ive2glb` 同一套路）。
- **产出**：`src/main.js`、`src/renderer.js`、`src/preload.js`（如需）、`package.json`、`test/ui-smoke.cjs`（FBX/OBJ 各跑一遍）
- **文件范围**：`src/main.js`, `src/renderer.js`, `src/preload.js`, `package.json`, `test/ui-smoke.cjs`
- **验证方式**：① 冒烟 `node test/ui-smoke.cjs o-model/蹲姿.fbx --port 9333` 与 `... o-model/蹲姿.obj` 全绿（预览路径不得因外部 uri 失败）；② `node test/ui-smoke.cjs model/蹲姿.glb` 与 `o-model/蹲姿.ive` 仍全绿（不回归）；③ 手动：选择器里能看到 fbx/obj，批量修复能把 OBJ 落盘成 GLB；④ `npm run lint` + `npm test` 全绿。
- **状态**：已完成
- **验证结果**：
  ① 三条 IPC 全部接通（统一前置 `convertSourceToGlb`，IVE 与 FBX/OBJ 返回同一形状）：文件过滤器加 `fbx`/`obj`、`collectGlbEntries` 扩展名加 `.fbx`/`.obj`、`repair-glb` 批量转换带 `convert-start/convert-done` 进度、`read-glb-data-url` 与 `inspect-glb` 各自转临时 GLB 并在 `finally` 清理；`app-capabilities` 新增 `assimp` 与 `assimpMessage`；渲染进程把能力与**转换告警**（解析不到的贴图）打进日志。
  ② 冒烟 `node test/ui-smoke.cjs`：`o-model/蹲姿.fbx` 与 `o-model/蹲姿.obj` **各 34 步 / 110 条断言 / 0 失败**；`model/蹲姿.glb` 与 `o-model/蹲姿.ive` 仍各 34 步 / 110 条断言 / 0 失败（不回归）。
  ③ **可落盘端到端实跑**（走真实 IPC `repairGlb`，非模拟）：`蹲姿.fbx` → `蹲姿.glb`（15.1MB，含 JPEG→PNG 归一化）、`蹲姿.obj` → `蹲姿-obj.glb`（599KB），两条都 `status:'success'`。
  ④ **过程中发现并修掉一个真缺陷**：同名不同扩展名的源（`蹲姿.fbx` + `蹲姿.obj`，以及既有的 `蹲姿.ive` + `蹲姿.glb`）转换后都叫 `蹲姿.glb`，于是**临时文件互相覆盖**（FBX 那条的 `oldBytes` 实际是 OBJ 的 599,468）、**输出目录也互相覆盖**，而两条都报 `success`——只落一个文件。修法是撞名时按源扩展名区分（`蹲姿-obj.glb`），只在真的撞到时才改名；复测确认产出两个文件、临时路径也分开。
  ⑤ 冒烟里那条"主按钮必须拿到主进程中文校验错误"原先钉死了 `GLB / IVE` 文案，本次因文案扩成 `GLB / IVE / FBX / OBJ` 而假红——已改成只断言"拿到了中文校验错误"，避免以后加格式再假红。
  ⑥ `npm run lint` 通过；`npm test` → **115 用例 / 111 通过 / 0 失败 / 4 跳过**。`package.json` 的 `asarUnpack` 已加 `node_modules/assimpjs/dist/**`（wasm 必须能被按 `__dirname` 读到）。

### TASK-015 文档与规则修订（含 M3 结论翻案留痕）
- **关联需求**：REQ-007；设计决策见 ADR-008
- **依赖**：TASK-014
- **做什么**：① `docs/002-requirements.md` §6 问题 4 追加**翻案说明**（原"本期不做"→ 本期做，后端与当时推荐的 assimpjs 一致，附 spike 数字），并按 §4 用 `memory.mjs log --event reopened` 留痕；② `docs/001-code-design.md` 新增 **BR-030**（多格式输入的转换口径：自包含、不静默丢贴图、复用焊接、无外部二进制）并更新模块表（`src/convert.js`）；③ `CLAUDE.md`：格式清单加 FBX/OBJ，"不 shell 外部二进制"措辞澄清为"外部二进制须随包分发；本工具的图像与模型转换一律进程内完成（jpeg-js/pngjs/assimpjs WASM）"；④ `docs/testing/TEST_PLAN.md` 新增 TC-018；⑤ `docs/release/RELEASE_CHECKLIST.md` 加"assimpjs wasm 随包可加载"检查项。
- **产出**：`docs/002-requirements.md`、`docs/001-code-design.md`、`CLAUDE.md`、`docs/testing/TEST_PLAN.md`、`docs/release/RELEASE_CHECKLIST.md`
- **文件范围**：`docs/002-requirements.md`, `docs/001-code-design.md`, `CLAUDE.md`, `docs/testing/TEST_PLAN.md`, `docs/release/RELEASE_CHECKLIST.md`
- **验证方式**：`node scripts/memory.mjs check` 通过；`docs/` 入库范围仍与既有口径一致；人工复核 BR-030 与 ADR-008 的措辞与实际实现一致。
- **状态**：已完成
- **验证结果**：
  ① `docs/002-requirements.md` §6 问题 4 已把 M3 的"本期不做"标注为**翻案**并写明理由、后端与 spike 数字；台账按 §4 追加 `reopened` 留痕（`memory.mjs log --task TASK-015 --event reopened`）。
  ② `docs/001-code-design.md` 新增 **BR-030**（多格式转换口径：自包含、不静默丢贴图、必须焊接、同名不同扩展名必须区分、无外部二进制）与模块 **MOD-008 `src/convert.js`**。
  ③ `CLAUDE.md`：新增 `src/convert.js` 模块说明；把"图像转码自包含"扩写成**"图像与模型转码都自包含"**（不 shell 外部二进制、**不按平台分发二进制**、assimpjs 的 wasm 需 `asarUnpack`）；IPC 契约补 `fbx`/`obj` 过滤器、`assimp` 能力与 `convertSourceToGlb` 的同名去歧义；测试段落补 `test/convert.test.js` 的夹具门控与本地基线 115/111/0/4。
  ④ `docs/testing/TEST_PLAN.md` 新增 **TC-018** 与汇总行；`docs/release/RELEASE_CHECKLIST.md` 新增"assimpjs wasm 随包可加载 + 安装后 `assimp: true` + FBX/OBJ 可预览可落盘"检查项。
  ⑤ `node scripts/memory.mjs check` 通过；`git ls-files docs/` 仍为 **10 份**（本次只改既有入库文件，没有新增 `docs/` 文件）。

### TASK-016 修掉 REQ-007 冷审的 6 条重要项（含 3 条可复现反例）
- **关联需求**：REQ-007（不改写 TASK-013~015 的历史结论）
- **依赖**：TASK-015（缺陷由它的交付暴露）
- **做什么**：冷上下文复审（有条件通过/无阻塞级）给出 6 条重要项，逐条修：
  **I-1 体检清单看不到缺失贴图的原始 uri**（`inspect.js` 的 `describeImage` 不透出 `image.name`，`TEXTURE_1X1_PLACEHOLDER` 文案只有"贴图 0 是 1×1 占位图"）→ 透出 `name` 并把 `missing:<原始 uri>` 写进 issue 文案。
  **I-2 批量修复路径日志有 `undefined`、写死"IVE"文案、且吞掉转换告警**（`renderer.js` 的 `convert-*` 分支不读 `progress.warnings`，`prunedNodes`/`worldSize` 对 FBX/OBJ 不存在，`images` 取 `embeddedImages` 导致"贴图 0 张"）→ 按源扩展名出中文文案 + 字段缺省回退 + 打印 warning。
  **I-3 `assimpAvailable()` 只探测 JS 模块**（glue 能 require 但 wasm 加载失败时假阳性，能力探测报 `assimp:true` 却每次转换必失败）→ 能力探测改为真正 `await` 一次加载并缓存结果/失败原因。
  **I-4 同名 GLB+GLB 仍静默覆盖**（`uniqueRelativePath` 只作用于待转换项；两个同名 GLB 两条都报 success 却只落一个文件）→ 把普通 GLB 条目也纳入去重（仅在真撞名时改名，保留 BR-001 的单文件命名）。
  **I-5 焊接原地改写缺两个不变量守卫**（① `accessor.byteOffset` 非 0 时读/写都会错位；② `usage` 统计不含动画/蒙皮/morph targets，POSITION 被动画 sampler 复用时会连动画一起改坏）→ 读取带上 `accessor.byteOffset`，并对 `byteOffset≠0` 或 accessor 被非图元引用的情况**保守跳过**焊接；补两条单测。
  **I-6 发布检查清单的依赖/许可证失真**（漏 `assimpjs`；`jpeg-js` 实为 BSD-3-Clause 而非 MIT）→ 更新清单并点明随包许可证文件。
  另修 4 条低成本次要项：`MOD-008` 撞号、REQ-007 #4/ADR-008(d) 与实现口径不一致（"移除贴图槽" vs "1×1 占位"）、ADR-008 包体积自相矛盾、`convert.test.js` 的自我满足断言与缺失夹具门控，以及冒烟补一条"预览产物不得残留外部 uri"的直接断言 + 抽屉断言改为轮询等待（消除 flaky）。
- **产出**：`src/convert.js`、`src/main.js`、`src/renderer.js`、`src/inspect.js`、`test/convert.test.js`、`test/ui-smoke.cjs`、`docs/001-code-design.md`、`docs/design/ADR.md`、`docs/requirements/REQUIREMENTS.md`、`docs/release/RELEASE_CHECKLIST.md`
- **文件范围**：同上
- **验证方式**：① 新增单测覆盖 I-5 的两个反例（`byteOffset≠0` 与 accessor 被动画 sampler 复用 → 必须跳过焊接）；② `inspect()` 对占位贴图的 issue 文案必须含原始 uri；③ 能力探测在 wasm 不可加载时返回 false 且给出中文原因；④ 两个同名 GLB 批量修复必须产出两个文件；⑤ 冒烟新增"预览产物外部 uri 为 0"的断言；⑥ `npm run lint` + `npm test` 全绿；⑦ 冒烟在 GLB/IVE/FBX/OBJ 四种格式上仍全绿。
- **状态**：已完成
- **验证结果**：
  ① **I-1**：`src/inspect.js` 的 `describeImage` 透出 `image.name`；`TEXTURE_1X1_PLACEHOLDER` 文案在占位贴图上写出**原图路径**（`原图未找到：E:\…\WuYanZu_Hat_D.jpg`）并给出可操作 hint（放到模型同级目录）。新增单测断言（旧实现下会红）。
  ② **I-2**：批量日志改为按源扩展名出文案、`prunedNodes` 缺失不再打印 `undefined`、`images` 改用产物贴图总数、并**逐条打印 `progress.warnings`**。实跑 FBX+OBJ 批量日志：`[FBX 1/2] 转换中：蹲姿.fbx` → `FBX 转换完成：… 贴图 3 张，网格 3 个，坐标 …`、`[OBJ 2/2] …` → `转换告警：贴图"…WuYanZu_Hat_D.jpg"未能解析，已用 1×1 占位替换…`（此前 FBX 被写成 IVE、贴图误报 0 张、且告警被整条吞掉）。
  ③ **I-3**：能力探测改为 `probeAssimp()` **真正 await 一次 wasm 加载**并缓存结果/失败原因，`app-capabilities` 改异步；模块缺失与 wasm 读不到都会给出中文原因。实跑仍报 `assimp: true`。
  ④ **I-4**：同名去重扩到**普通 GLB 条目**。实跑两个同名 GLB（不同子目录）→ 落 `dup.glb` 与 `dup-glb.glb` **两个文件**、两条 success（此前只落一个文件却两条都报成功）。
  ⑤ **I-5**：`accessorBytes` 计入 `accessor.byteOffset`；并对 `byteOffset≠0`、bufferView 被多 accessor 共用、accessor 被动画/蒙皮/morph targets 引用、图元带 morph targets 的情况**一律跳过焊接**。新增三条单测（两个冷审反例 + "正常形状仍要焊"），`test/convert.test.js` **13/13 通过**。
  ⑥ **I-6**：发布检查清单改为 `jpeg-js`（BSD-3-Clause）、`pngjs`（MIT）、`assimpjs`（MIT + assimp BSD-3-Clause），并把两份许可证文件随包列为检查项。
  ⑦ 次要项：模块编号改 **MOD-012**（不再与 transform 撞号）；REQ-007 #4 与 ADR-008(d) 的口径统一为"保留材质槽 + 1×1 占位"（与 BR-030 一致）；ADR-008 的包体积口径改为约 4.2MB 并写明 npm 报的 8.7MB 是整目录解包体积；`convert.test.js` 去掉自我满足断言与不必要的夹具门控、补"相对路径 / 同级同名 / `.fbm` 内同名"三种解析顺序用例；冒烟补"预览产物不得残留外部 uri + 有告警必须落日志"的直接断言，并把抽屉几何断言改为**测试期关闭过渡**（消除冷审与本次都复现过的 flaky，根因是合成器把 0.16s transition 停在中途）。ADR-008 另补两条已知代价：`ConvertFileList` 同步阻塞主进程（FBX 单次 4~6s）、重复转换时 wasm 侧内存增长。
  ⑧ 全量：`npm run lint` 通过；`npm test` → **119 用例 / 115 通过 / 0 失败 / 4 跳过**；冒烟 GLB / IVE / FBX / OBJ **各 35 步 / 112 条断言 / 0 失败**。

### TASK-017 采样器规范化：修掉 NPOT × REPEAT × mipmap 的非法组合
- **关联需求**：REQ-008（验收标准 1、2、3）
- **依赖**：无
- **做什么**：在 `src/repair.js` 新增采样器规范化步骤——对每个"贴图 + 采样器"对，若贴图任一维非 2 次幂且采样器同时使用 `REPEAT`（wrapS/wrapT）与 mipmap 过滤（minFilter 含 `MIPMAP`），则改为 `CLAMP_TO_EDGE` + `LINEAR`（**与 `src/ive.js` 既有 NPOT 退化规则、以及 `inspect.js` 那条问题的既有中文提示保持一致**，见 ADR-009）。判定必须按"贴图维度 × 采样器"逐对进行：采样器被多材质共用时不得因共用而漏改或误改；POT 与已合法的组合**一个字段都不改**。步骤位置在贴图内嵌与降采样之后（降采样可能产生新的 NPOT，见 TASK-018）。
  **实现中追加的范围（2026-09-20）**：体检那侧的 NPOT 判定也必须改成同一口径，否则验收标准 1 无法判定——旧实现是"文件里有 NPOT 图像"×"文件里有 REPEAT+mipmap 采样器"两条独立事实相乘，**既会误报**（REPEAT+mipmap 属于另一张 POT 贴图）**也会漏报**（glTF 规范里 sampler 缺省即 `REPEAT` + `LINEAR_MIPMAP_LINEAR`，`report.samplers` 为空时整条检查被跳过）。因此本任务同时把 `src/inspect.js` 的该判定改为按"贴图 × 采样器"逐绑定，并新增 `report.npotSamplerBindings` 作为可断言的结构化证据。
- **产出**：`src/repair.js`、`src/inspect.js`、`test/repair.test.js`、`test/inspect.test.js`
- **文件范围**：`src/repair.js`, `src/inspect.js`, `test/repair.test.js`, `test/inspect.test.js`
- **验证方式**：`node --test test/repair.test.js test/inspect.test.js`——① 合成 NPOT(512×341)+REPEAT+mipmap 修复后采样器为 `CLAMP_TO_EDGE`+`LINEAR` 且 `inspect()` 不再报 `NPOT_WITH_REPEAT_MIPMAP`（且修复前**必须**报，证明夹具有效）；② POT+REPEAT+mipmap 与 NPOT+CLAMP+LINEAR 修复前后采样器 JSON **逐字段相同**；③ 采样器被 POT 贴图共用时**复制**退化采样器、POT 那条仍指向原采样器；④ 缺省采样器与漏写 minFilter 两种"规范默认"都要被判为 mipmap 并新建显式采样器（这两条在旧代码上必红）；⑤ POT 贴图用 REPEAT+mipmap + NPOT 贴图已退化时**不得**误报（旧代码必红）
- **状态**：已完成
- **验证结果**：
  ① `node --test test/repair.test.js test/inspect.test.js` → **68 用例 / 67 通过 / 1 跳过（缺 `o-model/运输车.glb`）/ 0 失败**；全量 `npm test` → **129 用例 / 125 通过 / 0 失败 / 4 跳过**（TASK-016 时基线为 119/115/0/4，净增 10 条用例）。
  ② 修复侧 6 条新用例：NPOT 独占采样器退化为 `{wrapS:33071, wrapT:33071, minFilter:9729}` 且 `samplersNormalized === 1`、产物 `npotSamplerBindings` 为空；POT(256×256) 采样器 JSON 逐字段不变（`samplersNormalized === 0`）；NPOT 已是 `CLAMP+LINEAR` 时不动；共用采样器时**复制**一份退化采样器（`samplersCloned === 1`），`json.samplers[0]` 仍是原 `REPEAT+mipmap`、`textures[0].sampler` 仍指 0；缺省采样器与"多张 NPOT 共用一份退化采样器（去重，`samplers.length === 1`）"各一条。
  ③ 体检侧 4 条新用例：完全没写 `samplers` 的 NPOT 贴图报出问题且 `npotSamplerBindings === [{texture:0,image:0,sampler:null}]`（旧代码漏报）；写了采样器但漏写 `minFilter` 的同样报出（`report.samplers[0].mipmapped === true`，旧代码漏报）；REPEAT+mipmap 属于另一张 POT 贴图时**不报**（旧代码误报）；同一文件两张 NPOT 贴图只报真正非法的 `texture 0`。**旧口径的两处偏差（一误报一漏报）各有一条断言钉住。**
  ④ 真实模型不误伤：`model/person-stand.glb`（采样器是空对象 `{}`，即全默认；3 张贴图 1024×1024 POT）修复后 `samplersNormalized === 0`、`json.samplers` 仍为 `[{}]`、`textures[].sampler` 全部不变。本地语料 4 个 GLB 均无 NPOT 贴图，故不变量断言（"产物中不存在 NPOT 且 REPEAT+mipmap 的绑定"）由合成夹具承担，语料未提供额外覆盖。
  ⑤ `npm run lint` 通过；`node scripts/memory.mjs check` 通过。

### TASK-018 贴图降采样四档 + 选项接线
- **关联需求**：REQ-008（验收标准 4、5、6、7、8）
- **依赖**：TASK-017（同一文件；且阶段顺序必须是"内嵌 PNG → 降采样 → 采样器规范化"）
- **做什么**：在 `src/repair.js` 的贴图内嵌之后新增降采样步骤：用**已在 `dependencies` 的 `pngjs`** 解码 PNG、按最长边目标值做**盒式平均**（不是最近邻抽样）、重新编码回 PNG 并替换该 bufferView 字节；保持宽高比、四舍五入规则写进注释。修复选项新增 `maxTextureSize`（`0` = 不降，默认；可选 `2048/1024/512`），在界面修复选项区加中文下拉与提示，经既有 `repair-glb` 选项透传。报告新增 `texturesDownsampled` / `textureBytesBefore` / `textureBytesAfter`。
- **产出**：`src/repair.js`、`src/renderer.js`、`src/index.html`、`test/repair.test.js`、`test/ui-smoke.cjs`
- **文件范围**：`src/repair.js`, `src/renderer.js`, `src/index.html`, `test/repair.test.js`, `test/ui-smoke.cjs`
- **验证方式**：`node --test test/repair.test.js`——2048² 已知图案 → 1024² 逐像素等于 2×2 盒式平均；3000×1000 → 1024×341；「不降」产物与现状字节一致；几何 bufferView 逐字节不变；`model/person-stand.glb` 体积只降不升且贴图张数不变（IVE 夹具缺失时门控跳过）。`node test/ui-smoke.cjs` 四格式仍全绿
- **状态**：已完成
- **验证结果**：
  ① `node --test test/repair.test.js` → **34 用例 / 34 通过 / 0 失败**；全量 `npm test` → **137 用例 / 133 通过 / 0 失败 / 4 跳过**（TASK-017 后基线 129/125/0/4，净增 8 条）；`npm run lint` 通过。
  ② **像素正确性**：2048² 已知图案 → 1024²，期望值由**解码后的源像素**独立算出（不复用实现公式），1024×1024×4 通道逐像素比对 **mismatches = 0**。透明像素按 alpha 预乘：2×2 中一个全透明红 + 三个不透明白 → 颜色仍是白、alpha = 191（不把颜色拉黑）。尺寸已达标或读不出宽高时返回 `null`，不做无谓重编码。
  ③ **档位与默认**：3000×1000 + `maxTextureSize: 1024` → **1024×341**（等比，取整规则 `Math.round` 且至少 1 像素）；不传 / `0` / `-5` 三种情况都落到"不降"，且 `textureBytesAfter === textureBytesBefore > 0`（未降采样是有内容的陈述，不是静默省略）。
  ④ **只动贴图**：2048² + 1024 档修复后，几何的三个 bufferView（POSITION / 索引 / TEXCOORD_0）**逐字节相同**，accessor `min`/`max`/`count` 不变；外部贴图（`uri` 引用）同样被降采样，且**落盘的是缩小后的字节**（`view.byteLength < 原文件大小`），不是"报告说降了、文件里还是原图"。
  ⑤ **顺序证明（ADR-009 决策 d）**：3000×1000（POT）配 `REPEAT + 9987` 采样器，1024 档修复后贴图变成 NPOT(1024×341)，采样器**在同一趟里**被退化为 `CLAMP_TO_EDGE + LINEAR`（`samplersNormalized === 1`），产物 `npotSamplerBindings` 为空——若规范化排在降采样之前，这条必然漏网。
  ⑥ **本地基线（验收标准 6 的等价物）**：`model/person-stand.glb`（源 2.17MB，贴图为 JPEG）——不降档 **14.31MB**（BR-002 的 PNG 膨胀，与本次改动无关）→ 1024 档 **4.95MB（2 张降采样）** → 512 档 **1.86MB（3 张）**；三档贴图张数均为 3、几何统计不变、产物无 NPOT 绑定。需求里"9.74MB → ≤4MB"用的是**缺失的 IVE 转换产物夹具**（`o-model/person-stand.ive` 不在本地），未复测；本地等价基线按需求只断言"体积只降不升 + 贴图张数不变"，用例按夹具存在性门控。
  ⑦ **冒烟（四格式全跑）**：`node test/ui-smoke.cjs` 在 `model/蹲姿.glb`、`o-model/蹲姿.ive`、`o-model/蹲姿.fbx`、`o-model/蹲姿.obj` 上**各 36 步 / 114 条断言 / 0 失败**（新增 2 条：4 档且默认不降、所选档位原样进入 IPC 载荷，`EXPECTED_CHECK_COUNT` 112 → 114）。为此把渲染进程的选项收集抽成 `collectRepairOptions()`，让冒烟能直接断言接线而不必真的跑修复。
  ⑧ **环境备注（不影响产品）**：本机本轮跑 Electron 出现 `sandbox initialization failed: Operation not permitted` → GPU 进程崩溃 → `SIGTRAP`，需加 `--no-sandbox` 才能起应用（只在人工冒烟命令里加，产品代码未改）。这也是第一次 FBX 冒烟"卡住 600s"的原因：调试端口被一个已崩坏的旧实例占着，页面不响应。
  ⑨ 顺带发现（留给 TASK-020 的文档回填）：`docs/002-requirements.md` §3 列出的报告字段 `textureBytes` 在 `inspect()` 里**并不存在**（贴图字节只在 `report.images[].bytes` 上逐张给出）。

### TASK-019 `KHR_texture_transform.texCoord` 覆盖：体检不漏报、修复补对通道
- **关联需求**：REQ-008（验收标准 9、10）
- **依赖**：TASK-018（同改 `src/repair.js`）
- **做什么**：`src/inspect.js` 的 `collectTextureSlots` 与 `src/repair.js` 的 `collectMaterialTexCoords` 在读取贴图槽时，一并读取 `material.extensions.KHR_texture_transform.texCoord` 覆盖（扩展里的 `texCoord` 优先于槽位自身的 `texCoord`）——当前两处都忽略它，导致"材质实际采样 `TEXCOORD_1` 却只检查 `TEXCOORD_0`"的漏报，而漏报的后果是 Cesium 整个场景不渲染。两处口径必须一致。
- **产出**：`src/inspect.js`、`src/repair.js`、`test/inspect.test.js`、`test/repair.test.js`
- **文件范围**：`src/inspect.js`, `src/repair.js`, `test/inspect.test.js`, `test/repair.test.js`
- **验证方式**：`node --test test/inspect.test.js test/repair.test.js`——构造"图元**有** `TEXCOORD_0`、材质经 `KHR_texture_transform` 以 `texCoord: 1` 采样"的合成 GLB（这个形状是必须的：若图元连 `TEXCOORD_0` 都没有，旧代码检查 `TEXCOORD_0` 时同样会报，用例就不是红的了）：体检必须报 `MISSING_TEXCOORD` 且**点名 `TEXCOORD_1`**，修复必须补出全零 `TEXCOORD_1`；对照组（去掉扩展覆盖）不得报
- **状态**：已完成
- **验证结果**：
  ① `node --test test/repair.test.js test/inspect.test.js` → **80 用例 / 79 通过 / 1 跳过（缺 `o-model/运输车.glb`）/ 0 失败**；全量 `npm test` → **141 用例 / 137 通过 / 0 失败 / 4 跳过**（TASK-018 后基线 137/133/0/4，净增 4 条）；`npm run lint` 通过。
  ② **旧代码必红（实测，不是推断）**：把 `src/inspect.js`、`src/repair.js` 用 `git stash` 临时还原到 TASK-019 之前、只保留新用例再跑，4 条里 **3 条红**——体检漏报那条、体检"点名通道"那条、修复"补对通道"那条；唯一绿的是"没有扩展覆盖"的对照组（它本就该在两侧都绿）。恢复改动后 4 条全绿。
  ③ **体检侧**：`MISSING_TEXCOORD` 为 `error` 级，文案把缺失语义点名为 `TEXCOORD_1`（旧文案只写「缺少对应 TEXCOORD_n」，用户会去补错的通道）；对照组（无扩展覆盖、采样的 `TEXCOORD_0` 存在）不报。
  ④ **修复侧**：补出的是 `TEXCOORD_1`（`VEC2` / `componentType 5126` / `count 3` / 24 字节全 0），原 `TEXCOORD_0` 仍指向原 accessor；修复后 `inspect()` 不再报该问题。无扩展覆盖时不回归（仍补 `TEXCOORD_0`）。
  ⑤ **口径同源**：`textureTexCoordOf(reference)` 定义在 `src/repair.js` 并导出，`src/inspect.js` 直接 `require` 它（inspect 本就依赖 repair；反过来 require 会形成循环），因此体检与修复不存在第二套口径。
  ⑥ **冒烟**：`node test/ui-smoke.cjs` 在 GLB / IVE / FBX / OBJ 四格式上各 **36 步 / 114 条断言 / 0 失败**（本条改动不碰 UI 与断言，属回归确认）。

### TASK-020 REQ-008 的文档与规则回填
- **关联需求**：REQ-008
- **依赖**：TASK-017、TASK-018、TASK-019
- **做什么**：`docs/001-code-design.md` 新增 BR-031（采样器规范化的判定口径与"不误伤 POT"）与 BR-032（降采样：默认不降、盒式平均、只动贴图字节、顺序在采样器规范化之前）；模块表补 `repair.js` 的新步骤与选项；`docs/testing/TEST_PLAN.md` 新增 TC-019~TC-021 与汇总行、刷新总数/覆盖率；`CLAUDE.md` 的修复管线章节补两步与降采样档位口径。**另需订正 `docs/002-requirements.md` §3 的报告字段清单**：`textureBytes` 在 `inspect()` 里并不存在（只有 `report.images[].bytes` 逐张给出），与先前标注的 `contentHash` 同属"文档列了但没实现"的字段，一并按实情注明。
- **产出**：`docs/001-code-design.md`、`docs/testing/TEST_PLAN.md`、`CLAUDE.md`
- **文件范围**：`docs/001-code-design.md`, `docs/testing/TEST_PLAN.md`, `CLAUDE.md`
- **验证方式**：`node scripts/memory.mjs check` 通过；人工复核 BR/TC 措辞与实现一致（数值取自实测，不写估计值）
- **状态**：已完成
- **验证结果**：
  ① `docs/001-code-design.md`：BR 表新增 **BR-031**（采样器规范化：逐「贴图 × 采样器」绑定、共用则复制、POT 不动、缺省采样器按规范默认判定、体检同口径 + `report.npotSamplerBindings`）、**BR-032**（降采样：默认不降、面积加权盒式平均、alpha 预乘、只动贴图字节、顺序在内嵌与规范化之间、无原生依赖、报告字段）、**BR-033**（`KHR_texture_transform.texCoord` 覆盖优先、`textureTexCoordOf` 同源、`MISSING_TEXCOORD` 点名语义）；MOD-002/MOD-007 模块说明补新步骤与新判定；§2.3 策略补两条；§5.1 修复报告字段补 `samplersNormalized`/`samplersCloned`/`maxTextureSize`/`texturesDownsampled`/`textureBytesBefore`/`textureBytesAfter`；§6 测试要点新增 16~18 条（含"3 红 1 绿"的旧代码实测）。
  ② `docs/testing/TEST_PLAN.md`：TC-019/TC-020/TC-021 写入结果汇总（含逐像素 mismatches=0、person-stand 三档体积、旧代码 3 红 1 绿）；总计更新为 **141 用例 / 137 通过 / 0 失败 / 4 跳过**，全新克隆 **141 / 121 / 0 / 20**（逐文件在干净检出实测）；覆盖率按 2026-09-20 复测重填（all files **94.35 / 79.03 / 95.76**，`repair.js` 90.87、`inspect.js` 94.31）；「待执行」区只留 TC-022（Windows）与 TC-023（REQ-010）。
  ③ `CLAUDE.md`：修复管线由 7 步改为 **9 步**（新增「贴图降采样」「采样器规范化」），`rebuildBinary`/`appendBufferViewToBinary`/`workingBin` 段落的步骤交叉引用同步改为 1–4 与 6–7、6–7 与 6；`fillMissingTexCoords` 段落写明 BR-033 的通道来源；测试段落数字同步为实测值（本地 141/137/0/4，全新克隆 19→20 个跳过）。
  ④ `docs/002-requirements.md`：§3 报告字段清单注明**两处**与实现不符——`contentHash` 未实现、`textureBytes` 在 `inspect()` 里不存在（只有 `report.images[].bytes`）；BR 表把 BR-031/BR-032 状态改为「已落地」并补 **BR-033** 行。
  ⑤ `docs/requirements/REQUIREMENTS.md`：REQ-008 状态改为「已完成」并追加一条变更记录。
  ⑥ 门禁：`node scripts/memory.mjs check` 通过；`npm test` → 141 用例 / 137 通过 / 0 失败 / 4 跳过；`npm run lint` 通过。

### TASK-021 构建并入库 Windows x64 的 IVE 助手
- **关联需求**：REQ-009（验收标准 1、2）
- **依赖**：无（**需要外部 Windows x64 构建环境；本机 macOS 无 wine，无法完成**）
- **做什么**：按 `native/ive2glb/README.md` 在 Windows 上构建 `ive2glb.exe`，把可执行文件与其依赖闭包 vendoring 到 `vendor/ive2glb/win32-x64/`（与 darwin 目录同构），并补齐 README 的 Windows 步骤（构建命令、依赖收集、DLL 放置）。**不入库任何第三方非系统 DLL**之外的东西，也不为 Windows 单独改 IVE 解析路径（assimp 没有 IVE importer，见 ADR-010）。
- **产出**：`vendor/ive2glb/win32-x64/`、`native/ive2glb/README.md`、`package.json`（如 `files`/`asarUnpack` 需调整）
- **文件范围**：`vendor/ive2glb/win32-x64/`, `native/ive2glb/README.md`, `package.json`
- **验证方式**：① `dumpbin /dependents vendor/ive2glb/win32-x64/ive2glb.exe`（或等价）证明无第三方非系统依赖；② 在 Windows 上运行应用 → `app-capabilities` 报 `ive: true`、选 `.ive` 能转换/预览/落盘，世界盒与 darwin 产出一致（容差 0.02）；③ `npm test` 不回归
- **状态**：进行中（**环境无关部分已完成**：Windows 构建配方、vendoring 约定与自检步骤；待外部 Windows x64 环境执行构建与入库）
- **验证结果（部分交付，2026-09-20）**：
  ① `native/ive2glb/README.md` 的 Windows 章节从"一段命令 + 一句话"扩成可照做的配方：vcpkg 静态三元组构建命令、目标目录结构、以及三条**由源码推出**的硬约束——(a) 可执行文件必须叫 `ive2glb.exe` 且放在 `vendor/ive2glb/win32-x64/`（`src/ive.js::resolveIveHelper()` 只按这个路径找）；(b) 插件目录名只能是 `osgPlugins` 或 `osgPlugins-3.6.5` 且必须在 exe **同级**（`native/ive2glb/src/main.cpp::registerLocalPluginPath()` 只认这两个名字，并把它们插到插件搜索路径最前面）；(c) **Windows 没有 `@rpath/@executable_path/lib`**，所以动态三元组必须把 `osg*/zlib*/libpng*/freetype*` 等 DLL 放在 **exe 同目录**，不能照搬 macOS 的 `lib/` 约定（推荐静态三元组）。
  ② 新增「依赖闭包自检」（对 `ive2glb.exe` 与 `osgdb_ive.dll` 各跑一次 `dumpbin /dependents`，只剩系统 DLL 为通过，并列出需要警惕的第三方 DLL 名单）与「不依赖 GUI 的自检」（助手裸跑 + `convertIveToGlb` 全链路，附期望值 `success / [0.538,1.364,1.056] / 11516 / 18924`），并明确标注**未在本仓库验证过**。
  ③ **打包配置静态核对**：`package.json` 的 `files` 已含 `vendor/ive2glb/**/*`、`asarUnpack` 已含 `vendor/ive2glb/**`；`.gitignore` 没有 `*.exe`/`*.dll` 之类的一刀切规则，`win32-x64/` 产物可正常入库。这部分**无需 Windows 即已满足**，但"包内实际含有助手"仍待 TASK-022 在 Windows 上验证。
  ④ **仍未完成**：`ive2glb.exe` 尚未构建与入库（本机 macOS、无 wine，无法交叉构建），因此 REQ-009 验收标准 1、2 未判定，任务不能关闭。

### TASK-022 重打 Windows 安装包并回填发布清单与冒烟
- **关联需求**：REQ-009（验收标准 3、4、5）
- **依赖**：TASK-021
- **做什么**：在具备 Windows/打包能力的环境执行 `npm run dist:win`，产出新安装包与便携版；按 `RELEASE_CHECKLIST.md` §4 逐行冒烟（`.ive`/`.glb`/`.fbx`/`.obj`、嵌套目录、输出体积、坏输入不阻断、Windows 安装包），把实际值与结果回填；同步测试/覆盖率总数；更新发布记录与发布说明。**`dist/` 产物不入库。**
- **产出**：`docs/release/RELEASE_CHECKLIST.md`、`docs/testing/TEST_PLAN.md`、（本地产物 `dist/`，不入库）
- **文件范围**：`docs/release/RELEASE_CHECKLIST.md`, `docs/testing/TEST_PLAN.md`
- **验证方式**：安装包时间戳新于本次提交且包内含 `vendor/ive2glb/win32-x64/ive2glb.exe`、`assimpjs/dist/assimpjs.wasm` 与两份许可证；§4 每行都有实际值与结果；`RELEASE_CHECKLIST.md` 预检除显式"不适用"外全勾；`node scripts/memory.mjs check` 通过
- **状态**：进行中（**环境无关部分已完成**：发布冒烟表补成可执行清单、人工目视清单；待 TASK-021 完成后在 Windows 上执行 `dist:win` 与回填）
- **验证结果（部分交付，2026-09-20）**：
  ① `docs/release/RELEASE_CHECKLIST.md` §4 从 **7 行扩到 15 行**：补上此前缺失的「GLB 修复」「FBX 转换」「OBJ 转换」「贴图降采样（REQ-008）」「预览修正记忆（REQ-010）」「布局占比（REQ-011）」以及「包内容」「依赖闭包」「助手自检」三行；**Windows-only 的行首标 `★`**（包内容 / 依赖闭包 / 助手自检 / Windows 安装包），其余行在 macOS 开发机上即可执行并回填——这样 Windows 环境到位时只剩"填实际值与勾选"。
  ② `docs/testing/TEST_PLAN.md` 新增「人工目视清单」（M-1~M-8）：把 TC-014~TC-018 与 REQ-009/010/011 的人工部分写成可复制的步骤与判定口径（含 OBJ 那张 1×1 占位贴图属预期的说明），确认后即可把台账里的"待人工"改为"已确认"。
  ③ **仍未完成**：`npm run dist:win` 未执行（本机无 wine，无法产出 NSIS/portable 包；`dist/` 里现存的是 2026-09-15 的旧 `0.1.0` 包）；§4 的"实际/结果"列、§3 的打包勾选与发布记录都还等 Windows 环境回填。

### TASK-023 预览三态记忆：上轴/方向/缩放重启后保持
- **关联需求**：REQ-010（验收标准 1~5）
- **依赖**：无
- **做什么**：把预览的上轴三态、偏航与缩放并入既有的 `localStorage` 持久化（新键或既有键的 `version` 升级，读取时 clamp），并区分"用户显式选过"与"从未选过"——未动过控件时不落盘，显式选回 `auto` 也要记住；界面提示说明该值来自上次选择。复用 `src/preview-transform.js` 的 `clampPreview`/默认值，不新写一套校验。
- **产出**：`src/renderer.js`、`test/ui-smoke.cjs`
- **文件范围**：`src/renderer.js`, `test/ui-smoke.cjs`
- **验证方式**：`node test/ui-smoke.cjs`——设置 `Z-up/90°/2×` 后重载页面三个控件复原且提示可见；从未动过时不写 `localStorage`；显式选回 `auto` 后重载仍是 `auto`；垃圾载荷落回默认且页面异常 0；输入文件 `shasum` 前后一致（不写回）
- **状态**：已完成
- **验证结果**：
  ① **实现**：新增 `localStorage` 键 `glb-repair.preview`（`version: 1`，`{yawDeg, scale, axis}`）。只在控件的 `change`（松手/选完）与「重置预览修正」按钮上写入——拖动过程的 `input` 不写；"从未动过"表现为**键不存在**，因此与"显式选了 `auto`"可区分。启动时与新模型加载时都用 `previewTools.clampPreview` 规整后摆回控件，并在日志里说明「已沿用上次选择」；`window.__preview`（`key`/`get`/`stored`）只读暴露给冒烟（沿用 `window.__layout` 的既有做法）。
  ② **冒烟**：`node test/ui-smoke.cjs model/蹲姿.glb --port 9333` → **66 步 / 132 条断言 / 0 失败**（新增 6 条：从未动过不写键且为默认 `auto/0°/1.00×`、显式选择落盘形状与控件一致、重启后复原且日志含「已沿用上次选择」、显式选回 `auto` 后记录仍在且重启仍是 `auto`、坏 JSON 回落默认、越界/未知档位（`yawDeg: 999 / scale: -3 / axis: 'nope'`）被规整到合法区间）。既有断言一条未删；`EXPECTED_CHECK_COUNT` 126 → **132**。
  ③ **旧实现必然为红（推理，未单独跑 A/B）**：旧代码既没有 `glb-repair.preview` 也没有 `window.__preview`，重载后控件回到默认，`axis === 'z'` 与"记录存在"两类断言无法成立；而且探针取不到 `window.__preview` 时新断言整块被跳过，冒烟的"已执行断言数下限"会先报红。**未做** stashed A/B 实测（与 TASK-017/019/024 的实测口径不同，这里只给推理，不冒充实测）。
  ④ 顺带把行为变化补进文档（原任务未含文档项，按仓库规则补）：`docs/001-code-design.md` 新增 **BR-035** 与 §6 第 21 条；`REQUIREMENTS.md` 的 REQ-010 状态改为已完成；`docs/testing/TEST_PLAN.md` 汇总口径更新为 66 步 / 132 条断言。
  ⑤ 门禁：`npm run lint` 通过；`npm test` → 141 用例 / 137 通过 / 0 失败 / 4 跳过；`node scripts/memory.mjs check` 通过。

### TASK-024 布局模型由像素改为占比
- **关联需求**：REQ-011（验收标准 1、2、3、4、5）；设计决策见 ADR-011
- **依赖**：无
- **做什么**：把布局状态从"三栏像素宽 + 日志像素高"改为"**三栏宽占比 + 日志高占比**"：`layoutRatio` 是唯一落盘的量，`layout`（像素）由它乘当前可用宽高推出。拖动分隔条时按当前可用空间把新像素**换算回占比**；窗口缩放只重算像素、不改占比。夹取规则必须确定：先等比整体压缩以满足各区最小尺寸，仍不满足时按固定优先级依次触底；窗口恢复到足够大后占比回到用户设定值。`localStorage` 键加版本（`version: 2`），`version:1` 的像素载荷迁移为等价占比或安全回落默认值。**保留所有既有元素 id 与事件绑定**，只改布局的内部模型。
- **产出**：`src/renderer.js`、`src/styles.css`、`test/ui-smoke.cjs`
- **文件范围**：`src/renderer.js`, `src/styles.css`, `test/ui-smoke.cjs`
- **验证方式**：`node test/ui-smoke.cjs <模型> --port <端口>` 新增占比断言——同一组拖拽结果在 1100×760 / 1440×900 / 1920×1200 三档窗口下，左/中/右占可用宽度与底部占高度的百分比变化 ≤ 1 个百分点（**该断言在当前实现上必须为红**）；拖拽后新占比随后续缩放保持；重启（重载页面）后占比还原（像素误差 ≤ 1px）；旧版 `version:1` 像素载荷被安全迁移；夹取到极限再恢复后占比不失真。`npm run lint` + `npm test` 全绿
- **状态**：已完成
- **验证结果**：
  ① **模型**：`layoutRatio`（占比）是唯一落盘意图，`layout`（像素）由 `ratioToPixels(占比, 可用空间)` 派生；拖拽把新像素经 `ratioFromPixels` 换算回占比再落盘；窗口缩放只 `refitLayout()` 重算像素（占比不动、不落盘）。可用空间 = `appShell.clientWidth − 8`（两条 4px 分隔条）× `appShell.clientHeight`——**不能用 `window.innerHeight`**，实测差一条自定义标题栏（757 vs 800），用错会让底部占比整体偏移。
  ② **上限改为比例**：`PANE_RATIO_LIMITS` = 左 0.06~0.40 / 右 0.07~0.45 / 底 0.06~0.60（旧的像素上限 480/560/560 已删）。比例**下限**刻意低于像素下限所对应的比例——先前用 0.12 时实测 0.12 × 757 = 91 > 90，把日志"拖到底"卡在 91px 下不来；现在像素下限（90/180/220）在正常窗口下始终可达。
  ③ **旧版迁移**：`version: 1` 的像素载荷按当前窗口换算成占比，`initLayout()`/`restore()` 迁移成功后**立即回写 v2**（不再每次启动重算）。
  ④ **冒烟**：`node test/ui-smoke.cjs model/蹲姿.glb --port 9333` → **47 步 / 120 条断言 / 0 失败**（新增 6 条：占比不漂移 ≤1pp、resize 不得改写落盘占比、占比重算后中栏仍最宽、各档不整页滚动、极小窗口夹取后窗口恢复回设定占比、旧版 v1→v2 迁移且像素还原 ±1px；既有断言全部保留，仅把 3 条的期望值从写死像素改成"按同一可用空间折算"，因为底部像素现在由占比派生）。
  ⑤ **旧实现必红（实测 A/B，不是推断）**：把 `src/renderer.js` 用 `git stash` 暂时还原成像素模型、只额外加一个只读 `getRatio` 探针（避免因 API 缺失而假红），同一套断言给出漂移——以 1280×800 为参照（左 20.44% / 右 26.73% / 中 52.83% / 底 26.46%）：**1100×760** → 23.81 / 31.14 / 45.05 / 27.93（左 +3.37pp、中 −7.78pp）；**1440×900** → 18.16 / 23.74 / 58.10 / 23.36（中 +5.27pp）；**1920×1200** → 13.60 / 17.78 / 68.62 / 17.30（左 −6.84pp、右 −8.95pp、中 +15.79pp、底 −9.15pp）——全部远超 1pp 阈值，"夹取后恢复"也红（恢复后 16.33% ≠ 设定 20.44%）。恢复新实现后这 6 条全绿。
  ⑥ **顺带修掉冒烟自身的脆弱**：旧实现没有 `limits.ratio` 时，`limits.ratio.left.max` 会让整跑崩栈（`Cannot read properties of undefined`）而不是报红；现在三处访问都改为"缺字段即断言失败"。
  ⑦ `npm run lint` 通过；`npm test` 不受影响（`renderer.js` 不在单测插桩范围）；`node scripts/memory.mjs check` 通过。

### TASK-025 内部元素自适应收口（多尺寸矩阵）
- **关联需求**：REQ-011（验收标准 6）
- **依赖**：TASK-024（同改 `src/renderer.js`/`src/styles.css`/`test/ui-smoke.cjs`）
- **做什么**：在 900×700 / 1100×760 / 1280×800 / 1440×900 / 1920×1200 的尺寸矩阵下逐区排查内部元素是否自适应：每个区域"overflow 为 auto|scroll 的元素"必须恰好 1 个（BR-029 不回归）、无横向溢出、中栏 3D 画布 ≥ `CANVAS_MIN_HEIGHT`、预览控件条与状态栏不换行（长路径用省略号 + `title`）、帮助面板限高自滚且不参与高度预算（BR-028 不回归）。**发现即修**，每个修掉的溢出都要在冒烟里留一条断言；若排查后确认无缺陷，则在冒烟里留下这组"多尺寸无溢出"断言作为回归网，并在任务记录里说明未发现缺陷。
- **产出**：`src/renderer.js`、`src/styles.css`、`test/ui-smoke.cjs`（按实际发现）
- **文件范围**：`src/renderer.js`, `src/styles.css`, `test/ui-smoke.cjs`
- **验证方式**：冒烟在五个尺寸下逐区断言上述四类不变量；任一断言失败即红；`npm test` 与既有断言不回归
- **状态**：已完成
- **验证结果**：
  ① **结论：未发现内部元素自适应缺陷**。五个尺寸实测（先种入均衡占比 0.25/0.30/0.30 再扫，否则画布正好贴在下限上、"画布 ≥ 下限"会变成恒真断言）：

     | 尺寸 | 滚动容器 左/右/底/中 | 横向溢出 | 3D 画布 | 预览条 | 状态栏 | 页面滚动 |
     | :-- | :-- | :-- | --: | --: | --: | :-- |
     | 900×700（窄） | 1/1/1/0 | 无 | 243px | 99px | 28px | 无 |
     | 1100×760 | 1/1/1/0 | 无 | 259px | 126px | 28px | 无 |
     | 1280×800 | 1/1/1/0 | 无 | 313px | 99px | 28px | 无 |
     | 1440×900 | 1/1/1/0 | 无 | 383px | 99px | 28px | 无 |
     | 1920×1200 | 1/1/1/0 | 无 | 590px | 103px | 28px | 无 |

     画布随窗口同比增长（243 → 590），说明占比模型在高度方向也生效（旧像素模型下画布几乎不变）。
  ② **新增 6 条断言作为回归网**（采样齐全、每区滚动容器数量、"任何尺寸无横向溢出"、画布 ≥ 下限**且不许永远贴在下限**（要求至少 3 档高于下限）、状态栏高度恒定且不溢出、预览条不溢出且页面不滚动）；`EXPECTED_CHECK_COUNT` 120 → **126**；冒烟 → **53 步 / 126 条断言 / 0 失败**。
  ③ **按实测澄清验收标准**：REQ-011 标准 6 原写"预览控件条不换行"，实测它在较窄的中栏宽度下会换行（99px ↔ 126px）——控件是静态按钮/输入框，无法用"单行省略号"消除。判据已改为"**状态栏**不换行 + 预览条**允许换行**但不溢出/不裁切/不把画布压到下限以下"，并在 `REQUIREMENTS.md` 变更记录里留痕（规格改动不静默）。
  ④ `npm run lint` 通过；`npm test` → 141 用例 / 137 通过 / 0 失败 / 4 跳过；`node scripts/memory.mjs check` 通过。

### TASK-026 REQ-011 的文档与规则回填
- **关联需求**：REQ-011；设计决策见 ADR-011
- **依赖**：TASK-024、TASK-025
- **做什么**：`docs/001-code-design.md` 新增 **BR-034**（布局以占比为唯一用户意图、像素只是派生物；夹取优先级确定；旧版像素载荷迁移）并更新 MOD-011 与 BR-027/BR-028 的交叉引用；`docs/design/ADR.md` 把 ADR-011 状态改为已采纳；`docs/testing/TEST_PLAN.md` 新增 TC-024 与汇总行、刷新总数/覆盖率；`CLAUDE.md` 的渲染进程段落把"像素 + clamp"口径改成"占比 + 派生像素"。
- **产出**：`docs/001-code-design.md`、`docs/design/ADR.md`、`docs/testing/TEST_PLAN.md`、`CLAUDE.md`
- **文件范围**：`docs/001-code-design.md`, `docs/design/ADR.md`, `docs/testing/TEST_PLAN.md`, `CLAUDE.md`
- **验证方式**：`node scripts/memory.mjs check` 通过；人工复核 BR-034/TC-024 措辞与实现一致（数值取自实测）
- **状态**：已完成
- **验证结果**：
  ① `docs/001-code-design.md`：新增 **BR-034**（占比是唯一用户意图、像素是派生物；可用空间必须是 `appShell.clientWidth − 8` × `appShell.clientHeight` 而不是 `window.innerHeight`；像素上限改比例上限；比例下限刻意低于像素下限对应比例；夹取规则确定；`version:1` 迁移并回写；附修复前实测的反例数字）；**BR-027** 的"布局状态写 `localStorage` 并在读取时 clamp"改为"以占比写入并按比例夹取（见 BR-034）"；**BR-028** 的"`layoutDesired` 是用户设定的尺寸"改为"`layoutRatio`（占比）是用户设定的比例，`layout` 是由比例派生的生效像素"；**MOD-011** 补上占比模型；§6 测试要点新增第 19、20 条。
  ② `docs/design/ADR.md`：ADR-011 状态由"待确认"改为**已采纳**（闸门 ② 架构 · sunny-zhai · 2026-09-20）。
  ③ `docs/testing/TEST_PLAN.md`：结果汇总新增 **TC-024**（占比不漂移、resize 不改写落盘占比、夹取后恢复、v1 迁移、五档自适性矩阵；含旧模型上的漂移数字），总计里的冒烟口径更新为 **53 步 / 126 条断言**（并注明"36 步 / 114 条"是 TASK-018 时代的口径）。
  ④ `CLAUDE.md`：渲染进程段落从"4px splitters 拖 CSS 变量并 clamp 后存 `localStorage`"改为"布局以**占比**存储（`version: 2`）、像素每次渲染派生、拖拽按像素跟手但落盘换算回占比、resize 不改写意图、可用空间口径与 v1 迁移"。
  ⑤ `docs/requirements/REQUIREMENTS.md`：验收标准 6 的澄清与变更记录已在 TASK-025 一并落地（本任务只补充文档引用一致性）。
  ⑥ 门禁：`node scripts/memory.mjs check` 通过；`npm run lint` 通过；`npm test` → 141 用例 / 137 通过 / 0 失败 / 4 跳过。

### TASK-027 IVE 跨平台路线 spike：把 OSG+IVE 编到 WASM 是否可行
- **关联需求**：REQ-012（验收标准 6，以及标准 2/3 的路线选择）；设计决策见 ADR-012
- **依赖**：无（**需要 emsdk；本机未安装、需联网安装**）
- **做什么**：用 emscripten 尝试把 `native/ive2glb` 连同 OSG（`osgDB` + `osg` + `OpenThreads` + IVE 插件 + zlib/libpng/freetype）编成 WASM，并在 Node 里跑通 `o-model/蹲姿.ive` → `scene.json` + `data.bin`。要回答四个问题：① 能否链接成功；② IVE 插件能否**静态注册**（emscripten 下没有 `dlopen`，`osgDB::Registry` 的插件加载机制需要改写）；③ 文件 IO 走 `-sNODERAWFS` 还是虚拟 FS + 预加载；④ 产物体积与单文件耗时。**允许失败，但失败必须给具体失败点与已尝试命令**（不得只写"不可行"）。
- **产出**：`docs/design/ADR.md` 的 ADR-012 结论段；`native/ive2glb/WASM-SPIKE.md`（命令与实测/失败记录）；可选 `scripts/build-ive2glb-wasm.sh` 草稿
- **文件范围**：`native/ive2glb/`, `docs/design/ADR.md`
- **验证方式**：成功 → 在 Node 里跑通 `蹲姿.ive` 并与 darwin 助手产物比对（世界盒 `0.538×1.364×1.056`、顶点 `11516`、三角面 `18924`）；失败 → ADR-012 写出失败点 + 可复现命令 + 已排除的替代做法
- **状态**：待开始（需联网安装 emsdk）

### TASK-028 按 spike 结论落地跨平台 IVE
- **关联需求**：REQ-012（标准 1、2 或 3、4、5、7）；设计决策见 ADR-012
- **依赖**：TASK-027
- **做什么**：二选一，**不改 IVE 解析语义**。**路线 A（WASM 可行）**：把 WASM 助手接进 `src/ive.js`（与 `resolveIveHelper` 并列或替换），wasm 资源按 `asarUnpack` 分发；**路线 B（WASM 不可行）**：补齐 `vendor/ive2glb/darwin-x64`（或 universal2，本机可做）并按 README 配方补 win32-x64 / linux-x64。两条路都要给 `package.json` 加 `mac`/`linux` 打包目标，并保证打包后助手可用（`ive: true`）与缺助手时 BR-012 降级不回归。
- **产出**：`src/ive.js`（或 `vendor/ive2glb/**`）、`package.json`、`scripts/`（构建脚本）、`test/ive.test.js`
- **文件范围**：`src/ive.js`, `package.json`, `scripts/`, `vendor/ive2glb/`, `test/ive.test.js`
- **验证方式**：`npm run lint` + `npm test` 全绿；`node test/ui-smoke.cjs o-model/蹲姿.ive` 全绿；四平台能力判定（标准 1）与打包后 `ive: true`（标准 4）；体积/耗时实测入 ADR（标准 7）；缺助手时的中文降级不回归（标准 5）
- **状态**：待开始

### TASK-029 REQ-012 的文档与发布清单回填
- **关联需求**：REQ-012；设计决策见 ADR-012
- **依赖**：TASK-028
- **做什么**：`docs/001-code-design.md` 新增 **BR-036**（跨平台 IVE 的交付口径：优先一次构建的 WASM；缺助手时按 BR-012 降级、GLB/FBX/OBJ 不受影响）并更新 MOD-005/006 与 ADR-008 的交叉引用；`RELEASE_CHECKLIST.md` §3/§4 把"只有 Windows 缺助手"改成四平台口径并补 mac/linux 打包检查；`CLAUDE.md` 的 IVE 章节写清产物形态与平台覆盖。
- **产出**：`docs/001-code-design.md`、`docs/release/RELEASE_CHECKLIST.md`、`CLAUDE.md`
- **文件范围**：`docs/001-code-design.md`, `docs/release/RELEASE_CHECKLIST.md`, `CLAUDE.md`
- **验证方式**：`node scripts/memory.mjs check` 通过；人工复核 BR-036/清单措辞与实现一致（数字取自实测）
- **状态**：待开始

## 依赖 DAG

```text
TASK-001 ──▶ TASK-002 ──▶ TASK-003 ──▶ TASK-004

TASK-005（追溯登记，独立）
TASK-006（追溯登记，独立）

TASK-007 ──▶ TASK-008 ──▶ TASK-009（缺陷修复，依赖 TASK-008 的冒烟证据）

TASK-010（REQ-006 界面重排，独立；与 TASK-009 的 `renderer.js` 改动串行）

TASK-010 ──▶ TASK-011（缺陷修复：栏位尺寸不得被数据改写）

TASK-011 ──▶ TASK-012（体验细化：细滚动条 + 每区只留最外层滚动条）

TASK-013 ──▶ TASK-014 ──▶ TASK-015（REQ-007 多格式输入：内核 → 接线与打包 → 文档与规则）

TASK-015 ──▶ TASK-016（缺陷修复：冷审 6 条重要项 + 低成本次要项）

TASK-017 ──▶ TASK-018 ──▶ TASK-019 ──▶ TASK-020（REQ-008 贴图规格收口：采样器规范化 → 降采样与接线 → KHR_texture_transform → 文档回填；四者依次改同一个 `src/repair.js`，必须串行）

TASK-021 ──▶ TASK-022（REQ-009 Windows 分发：助手入库 → 安装包重打与冒烟；TASK-021 需外部 Windows x64 环境，未就绪前 TASK-022 不启动）

TASK-027 ──▶ TASK-028 ──▶ TASK-029（REQ-012 跨平台 IVE：WASM 可行性 spike → 按结论落地 → 文档与清单）

> REQ-012 与 REQ-009 的范围有交集：若 TASK-027 的 spike 证明 WASM 可行，**TASK-021/TASK-022（Windows 原生助手）即被取代**，应把它们标为「已取消（被 REQ-012 取代）」而不是继续等 Windows 环境；若 spike 失败，则两条线互补（REQ-009 补 Windows 原生产物，REQ-012 补 Intel Mac / Linux 与打包目标）。

TASK-023（REQ-010 预览三态记忆，独立；与 TASK-018 的 `renderer.js`/`ui-smoke.cjs` 重叠，故与 TASK-018 串行，但与 TASK-019 的文件范围不重叠）
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
| 9 | TASK-010 | REQ-006 界面重排；文件范围与 TASK-009 不重叠，但同在 `renderer.js`，故排在 TASK-009 之后串行 |
| 10 | TASK-011 | REQ-006 缺陷修复，依赖 TASK-010（缺陷由它的交付暴露） |
| 11 | TASK-012 | REQ-006 体验细化，依赖 TASK-011，文件范围与其它任务不重叠 |
| 12 | TASK-013 | REQ-007 转换内核，无依赖（与 TASK-012 文件范围不重叠，可并行） |
| 13 | TASK-014 | 依赖 TASK-013；改 `main.js`/`package.json`/`ui-smoke.cjs` |
| 14 | TASK-015 | 依赖 TASK-014（文档要引用最终实现与实测数字） |
| 15 | TASK-016 | 依赖 TASK-015（缺陷由冷审暴露） |
| 16 | TASK-017, TASK-021 | TASK-017 无依赖（REQ-008 起点）；TASK-021 无依赖但需外部 Windows 环境；二者文件范围不重叠（`src/repair.js`+`src/inspect.js`+两个单测文件 vs `native/`、`vendor/`） |
| 17 | TASK-018 | 依赖 TASK-017；改 `repair.js`/`renderer.js`/`index.html`/`ui-smoke.cjs`，与 TASK-023 的 `renderer.js` 重叠，故与 TASK-023 分属不同批次 |
| 18 | TASK-019, TASK-023 | TASK-019 依赖 TASK-018（同改 `repair.js`）；TASK-023 无依赖且只改 `renderer.js`/`ui-smoke.cjs`，与 TASK-019 的 `inspect.js`/`repair.js` 不重叠，可并行 |
| 21 | TASK-023 | REQ-010 预览记忆；与 TASK-024 同改 `renderer.js`/`ui-smoke.cjs`，故两者必须串行（先做哪个都行，这里按登记顺序） |
| 22 | TASK-024 | REQ-011 占比模型；无依赖，但排在 TASK-023 之后以避免争抢 `renderer.js`/`ui-smoke.cjs` |
| 23 | TASK-025 | 依赖 TASK-024（同一批文件；多尺寸矩阵排查要基于占比模型） |
| 24 | TASK-026 | 依赖 TASK-024、TASK-025（文档要引用实测数字） |
| 25 | TASK-027 | REQ-012 的先决 spike（需联网装 emsdk）；与 TASK-021 文件范围不重叠，可并行 |
| 26 | TASK-028 | 依赖 TASK-027 的结论（路线 A/B 二选一）；改 `src/ive.js`/`package.json`/`scripts/`/`vendor/` |
| 27 | TASK-029 | 依赖 TASK-028（文档要引用最终产物形态与实测数字） |
| 19 | TASK-020 | 依赖 TASK-017~019（文档要引用最终实现与实测数字） |
| 20 | TASK-022 | 依赖 TASK-021；与 TASK-020 共用 `docs/testing/TEST_PLAN.md`，故排在 TASK-020 之后 |

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
| TASK-008 | REQ-005 | 已完成 | ☑ 自动 / ☑ 人工（2026-09-20） |
| TASK-009 | REQ-005 | 已完成 | ☑ 自动 / ☑ 人工（2026-09-20） |
| TASK-010 | REQ-006 | 已完成 | ☑ 自动 / ☑ 人工（2026-09-20） |
| TASK-011 | REQ-006 | 已完成 | ☑ 自动 / ☑ 人工（2026-09-20） |
| TASK-012 | REQ-006 | 已完成 | ☑ 自动 / ☑ 人工（2026-09-20） |
| TASK-013 | REQ-007 | 已完成 | ☑ 自动 |
| TASK-014 | REQ-007 | 已完成 | ☑ 自动 / ☑ 人工（2026-09-20） |
| TASK-015 | REQ-007 | 已完成 | ☑ 自动 / ☑ 人工（2026-09-20） |
| TASK-016 | REQ-007 | 已完成 | ☑ 自动 / ☑ 人工（2026-09-20） |
| TASK-017 | REQ-008 | 已完成 | ☑ 自动 |
| TASK-018 | REQ-008 | 已完成 | ☑ 自动 |
| TASK-019 | REQ-008 | 已完成 | ☑ 自动 |
| TASK-020 | REQ-008 | 已完成 | ☑ 自动 |
| TASK-024 | REQ-011 | 已完成 | ☑ 自动 |
| TASK-025 | REQ-011 | 已完成（矩阵普查未发现缺陷，留回归网） | ☑ 自动 |
| TASK-026 | REQ-011 | 已完成 | ☑ 自动 |
| TASK-021 | REQ-009 | 进行中（README 配方/自检/打包核对已就绪；待 Windows 环境构建入库） | ☐ |
| TASK-022 | REQ-009 | 进行中（冒烟表与人工目视清单已就绪；待 `dist:win` 与回填） | ☐ |
| TASK-023 | REQ-010 | 已完成 | ☑ 自动 |
| TASK-027 | REQ-012 | 待开始（需联网装 emsdk） | ☐ |
| TASK-028 | REQ-012 | 待开始（等待 TASK-027 结论） | ☐ |
| TASK-029 | REQ-012 | 待开始 | ☐ |
