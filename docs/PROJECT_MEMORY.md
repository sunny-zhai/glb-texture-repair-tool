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
- **入口点**：`npm run build:ive2glb`、`npm run build:ive2glb:wasm`、`npm run dev`、`npm run dist:linux`、`npm run dist:mac`、`npm run dist:win`、`npm run ensure:cesium`、`npm run lint`、`npm run start`、`npm run test`
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
| 2026-09-20 | REQ-008 | TASK-018 | completed | npm test → 137 用例 / 133 通过 / 0 失败 / 4 跳过；repair.test.js 34/34；ui-smoke 四格式各 36 步 / 114 条断言 / 0 失败（新增 4 档默认不降 + 档位进入 IPC 载荷）。降采样用面积加权盒式平均且透明像素预乘；2048²→1024² 逐像素 mismatches=0；3000×1000→1024×341；不降/0/非法 → 字节不变；几何 bufferView 逐字节不变；外部 uri 贴图落盘缩小字节；顺序证明：降采样造出 NPOT 后采样器同趟退化为 CLAMP_TO_EDGE+LINEAR。person-stand 本地基线 14.31MB(不降) → 4.95MB(1024,2张) → 1.86MB(512,3张)，贴图张数与几何统计不变 | f7b7207 |
| 2026-09-20 | REQ-008 | TASK-019 | completed | npm test → 141 用例 / 137 通过 / 0 失败 / 4 跳过；repair+inspect 单测 80/79/0/1。KHR_texture_transform.texCoord 覆盖由 textureTexCoordOf 在 inspect 与 repair 同源采纳；MISSING_TEXCOORD 点名缺失语义。旧代码必红实测：git stash 还原 src 后只跑新用例 → 3 红 1 绿（绿为对照组），恢复后全绿。修复补出全零 VEC2 TEXCOORD_1 且 TEXCOORD_0 原样保留；冒烟四格式各 36 步 / 114 断言 / 0 失败 | 6ec4181 |
| 2026-09-20 | REQ-008 | TASK-020 | completed | 文档与规则回填完成：001-code-design 新增 BR-031/032/033 + MOD-002/007 + §2.3/§5.1/§6(16~18)；TEST_PLAN 写入 TC-019~021、总计 141/137/0/4（全新克隆 141/121/0/20）、覆盖率 all files 94.35/79.03/95.76；CLAUDE.md 修复管线 7→9 步并同步交叉引用与测试数字；002 §3 注明 contentHash 未实现与 textureBytes 不存在、BR 表补 BR-033；REQ-008 状态改为已完成。验证：npm test 141/137/0/4、npm run lint 通过、memory check 通过 | c53adcb |
| 2026-09-20 | REQ-011 | TASK-024 | completed | 布局改为占比模型（version 2）：layoutRatio 为唯一落盘意图，像素由占比 × 可用空间（appShell.clientWidth-8 × clientHeight）派生；拖拽经 ratioFromPixels 换算回占比；resize 只 refitLayout 不落盘；像素上限改比例上限 0.40/0.45/0.60，比例下限低于像素下限对应比例；v1 像素载荷迁移并回写 v2。ui-smoke 47 步 / 120 条断言 / 0 失败（新增 6 条：占比不漂移 ≤1pp、resize 不改写载荷、中栏仍最宽、各档不整页滚动、夹取后恢复、v1→v2 迁移 ±1px）。旧实现必红实测 A/B：1280×800→1920×1200 时左 20.44%→13.60%（-6.84pp）、右 26.73%→17.78%（-8.95pp）、中 52.83%→68.62%（+15.79pp）、底 26.46%→17.30%（-9.15pp）。lint/npm test（141/137/0/4）通过 | 9237fc9 |
| 2026-09-20 | REQ-011 | TASK-025 | completed | 五档尺寸矩阵（900×700/1100×760/1280×800/1440×900/1920×1200）普查：滚动容器左/右/日志各 1、中栏 0，全部无横向溢出；3D 画布 243/259/313/383/590px（≥ CANVAS_MIN_HEIGHT 且随窗口同比增长）；预览条 99/126/99/99/103px（允许换行）；状态栏恒 28px；页面不整页滚动 —— 未发现自适应缺陷，新增 6 条断言作回归网，EXPECTED_CHECK_COUNT 120→126；按实测澄清 REQ-011 标准 6（预览条允许换行）。验证：ui-smoke 53 步/126 断言/0 失败；npm test 141/137/0/4；lint 通过 | 8af675b |
| 2026-09-20 | REQ-011 | TASK-026 | completed | 文档回填完成：001-code-design 新增 BR-034 并改写 BR-027/BR-028 的像素口径、MOD-011 补占比模型、§6 新增第 19/20 条；ADR-011 状态改为已采纳；TEST_PLAN 新增 TC-024 并把冒烟口径更新为 53 步/126 断言；CLAUDE.md 渲染进程段落改为「占比存储 + 像素派生 + 拖拽换算 + resize 不改写意图」。验证：memory check 通过、lint 通过、npm test 141/137/0/4 | fbc0707 |
| 2026-09-20 | REQ-010 | TASK-023 | completed | 预览三态记忆：新增 glb-repair.preview（version 1，{yawDeg,scale,axis}），只在 change/重置写；从未动过=键不存在，与显式 auto 可区分；启动与新模型加载都经 clampPreview 规整并记「已沿用上次选择」；坏 JSON/越界/未知档位回落合法区间。ui-smoke 66 步/132 断言/0 失败（新增 6 条，EXPECTED_CHECK_COUNT 126→132）；新增 BR-035 与 TEST_PLAN TC-025。lint 通过；npm test 141/137/0/4 | a5c9042 |
| 2026-09-21 | REQ-012 | TASK-030 | completed | package.json 新增 mac(dmg+zip, identity null)/linux(AppImage+deb) 与 dist:mac/dist:linux；native/ive2glb/README.md 新增平台支持矩阵与新增平台六步清单。本机实测：ELECTRON_CACHE/ELECTRON_BUILDER_CACHE 指向工作区 .cache/ 后 npx electron-builder --mac --dir 成功（Electron 32.3.3 arm64，1m24s 下载 99MB，跳过签名），app.asar.unpacked/vendor/ive2glb/darwin-arm64/ 共 17 文件（exe+14 dylib+2 插件）+ assimpjs.wasm + 两份许可证；直接执行包内助手跑 o-model/蹲姿.ive → {"status":"success","images":3,"meshes":3,"binBytes":28782480}、退出码 0、DYLD_PRINT_LIBRARIES 下 Homebrew 加载数 0。darwin-x64/win32-x64/linux-x64 需各自环境，矩阵里如实写明。验证：lint 通过、npm test 141/137/0/4、memory check 通过 | 2fd1d0a |
| 2026-09-21 | REQ-012 | TASK-027 | completed | scripts/build-ive2glb-wasm.sh o-model/蹲姿.ive → 退出码 0；助手产物 scene.json/data.bin 与 darwin 助手 SHA-256 相同（a96011bc…/4b82fd20…）；全链路 GLB SHA-256 相同（2,544,480 B, 76e34b58…）；worldSize 0.538×1.364×1.056 / vertices 11516 / triangles 18924；wasm 2.66MB + js 0.25MB = 2.91MB，单文件 100.2ms（darwin 对照 59.4ms）；GLB_REPAIR_IVE2GLB=… node --test test/ive.test.js → 24 用例/21 通过/0 失败/3 跳过；npm run lint 通过；npm test 141/137/0/4；结论：路线 A 可行 | a179ba7 |
| 2026-09-21 | REQ-012 | TASK-028 | completed | npm run lint 通过；npm test 148 用例/144 通过/0 失败/4 跳过（净增 7 条）；ui-smoke 开发态与打包应用各 66 步/132 断言/0 失败；打包应用内 convertIveToGlb(o-model/蹲姿.ive) → success，11516 顶点/18924 三角面/0.538×1.364×1.056，解析到 app.asar.unpacked/vendor/ive2glb/darwin-arm64/ive2glb；强制 WASM 助手产物与原生路径逐字节相同；修掉旧实现 asar 优先导致打包后 spawnSync ENOTDIR 的既有缺陷（新增 vendorRootsFor 回归网）；WASM 助手 2.79MB | 996db9e |
<!-- memory:completion:end -->
