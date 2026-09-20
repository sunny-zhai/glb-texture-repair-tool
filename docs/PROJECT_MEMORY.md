# 项目记忆线

> 由 `node scripts/memory.mjs` 维护：**结构快照**每次 `sync` 覆盖生成；**完成线**只追加。
> 权威状态在 `docs/requirements/TASKS.md`；本文件是派生的历史，不是状态源。

## 结构快照

<!-- memory:structure:begin -->
<!-- 本段由 `node scripts/memory.mjs sync` 生成，请勿手改 -->

- **项目类型 / 受管平台版本**：cli-tool / platform 1.0.0
- **顶层结构**（深度 2；仅含纳入版本控制的内容）：
  - `.ai/` → `agents`, `skills`, `workflows`
  - `assets/` → （无子目录）
  - `docs/` → `api`, `approvals`, `design`, `release`, `requirements`, `testing`
  - `dsh/` → `workflows`
  - `native/` → `ive2glb`
  - `scripts/` → （无子目录）
  - `src/` → （无子目录）
  - `test/` → （无子目录）
  - `vendor/` → `ive2glb`
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
| 2026-09-18 | REQ-006 | TASK-011 | completed | 栏位尺寸与内容解耦（ADR-007/BR-028）：6 条新回归断言在修复前代码 b8bdddc 上实测全红且只有这 6 条红（预览条 99→189px、日志 380→290px 并落盘、换回短文本仍 290）；修复后 ui-smoke 在 model/蹲姿.glb 与 o-model/蹲姿.ive 上各 33 步 / 105 条断言 / 0 失败；用户场景复测预览条 126 / 画布 161 / 日志 313 恒定、localStorage 设定的 367 不被改写；连带修掉 .pane-center 隐式列被 nowrap 撑到 2994px；npm test 106/102/0/4、lint 通过 | 87e73b4 |
| 2026-09-20 | REQ-006 | TASK-012 | completed | 白绘细滚动条（::-webkit-scrollbar 8px，且不写标准属性以免被 Chromium 整体忽略）+ 每区只留最外层滚动容器：修复前审计左栏 3 个/右栏 2 个/日志 1 个滚动条，修复后内容灌满（60 输入 + 40 结果 + 40 问题 + 500 日志行）三区各恰好 1 个且都真滚动、页面仍不整页滚动；5 条新断言在旧样式 HEAD 上实测 3 红 2 绿（与真实差异同向）；ui-smoke 在 model/蹲姿.glb 与 o-model/蹲姿.ive 上各 34 步 / 110 条断言 / 0 失败；npm test 106/102/0/4、lint 通过 | 9e7a4e0 |
| 2026-09-20 | REQ-007 | TASK-013 | completed | 新增 src/convert.js + test/convert.test.js（9 用例 9 通过）：assimpjs(WASM) 进程内转换 → 焊接三角汤 → 内嵌外部贴图 → 解析不到的换 1×1 占位并留 warning。实测 FBX 56,772→11,516 顶点 / 18,924 面 / 3 张内嵌贴图 / 1 蒙皮 1 动画 / 2.32MB / 世界盒与 o-model/蹲姿.glb 一致；OBJ 11,516 顶点 / 0.57MB / 世界盒 0.5383×1.3643×1.0559 与 model/蹲姿.glb 一致。顺带把 ive.js 的 weldVertices 泛化到整型属性（IVE 行为不变，21 通过 0 失败），repair.js 仅多导出 resolveExternalImage。全量 npm test 115/111/0/4、lint 通过 | 8c27cb2 |
| 2026-09-20 | REQ-007 | TASK-014 | completed | FBX/OBJ 接进三条 IPC（统一前置 convertSourceToGlb）+ 文件过滤器 + app-capabilities.assimp + asarUnpack(node_modules/assimpjs/dist)。实跑：ui-smoke 在 o-model/蹲姿.fbx 与 蹲姿.obj 上各 34 步 / 110 条断言 / 0 失败，model/蹲姿.glb 与 o-model/蹲姿.ive 不回归；真实 IPC 批量修复落盘 蹲姿.glb(15.1MB) 与 蹲姿-obj.glb(599KB) 均 success。顺带修掉同名不同扩展名（蹲姿.fbx+蹲姿.obj / 蹲姿.ive+蹲姿.glb）转换后临时与输出双双互相覆盖、却都报 success 的缺陷（撞名时按源扩展名区分）。lint 通过；npm test 115/111/0/4 | dd21377 |
| 2026-09-20 | REQ-007 | TASK-015 | reopened | docs/002-requirements.md §6 问题 4 的 M3 结论（FBX/OBJ 本期不做）按用户要求翻案为「本期做」，后端仍是当时推荐的 assimpjs；见 REQ-007 与 ADR-008 | dd21377 |
| 2026-09-20 | REQ-007 | TASK-015 | completed | 文档与规则修订完成：002-requirements §6 问题 4 翻案 + reopened 留痕；001-code-design 新增 BR-030 与 MOD-008(src/convert.js)；CLAUDE.md 新增 convert 模块、把自包含规则扩到模型转码（不 shell 外部二进制/不按平台分发/wasm 需 asarUnpack）、IPC 契约补 fbx/obj 与 assimp；TEST_PLAN 新增 TC-018；RELEASE_CHECKLIST 新增 wasm 分发检查。memory check 通过，git ls-files docs/ 仍为 10 份 | 36502c3 |
| 2026-09-20 | REQ-007 | TASK-016 | completed | 冷审 6 条重要项全修：I-1 体检 issue 带出原始 uri（新增单测）；I-2 批量日志不再写死 IVE/不打印 undefined/逐条落转换告警（实跑 FBX 贴图 3 张、告警可见）；I-3 能力探测真正 await wasm（probeAssimp 缓存）；I-4 同名 GLB 不再覆盖（dup.glb + dup-glb.glb 两文件）；I-5 焊接两个守卫含 byteOffset 与动画 sampler 反例（三条新单测）；I-6 许可证清单 jpeg-js BSD-3/pngjs MIT/assimpjs MIT。次要项：MOD-012、口径统一为 1×1 占位、ADR-008 体积与两条已知代价、冒烟补外部 uri 与告警断言并消除抽屉过渡 flaky。证据：convert.test.js 13/13、npm test 119/115/0/4、冒烟四格式各 35 步/112 断言/0 失败 | 2fb84e6 |
| 2026-09-20 | REQ-008 | TASK-017 | completed | npm test → 129 用例 / 125 通过 / 0 失败 / 4 跳过；node --test test/repair.test.js test/inspect.test.js → 68/67/0/1；采样器规范化按「贴图×采样器」逐绑定退化 NPOT×REPEAT×mipmap（独占原地改、共用则复制、缺省采样器新建显式 CLAMP_TO_EDGE+LINEAR、同形去重），体检 NPOT 判定同步改为逐绑定并新增 report.npotSamplerBindings；旧口径的一误报一漏报各有断言钉住；person-stand（采样器 {} + 3 张 POT）samplersNormalized=0 不误伤 | 1d32d28 |
<!-- memory:completion:end -->
