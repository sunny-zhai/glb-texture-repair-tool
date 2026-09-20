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
- **状态**：待开始
- **验证结果**：（待开始）

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
| TASK-009 | REQ-005 | 已完成（待冷审查与人工目视） | ☑ |
| TASK-010 | REQ-006 | 已完成（待人工目视） | ☑ 自动 / ☐ 人工 |
| TASK-011 | REQ-006 | 已完成 | ☑ 自动 / ☐ 人工 |
| TASK-012 | REQ-006 | 已完成 | ☑ 自动 / ☐ 人工 |
| TASK-013 | REQ-007 | 已完成 | ☑ 自动 |
| TASK-014 | REQ-007 | 已完成 | ☑ 自动 / ☐ 人工 |
| TASK-015 | REQ-007 | 待开始 | ☐ |
