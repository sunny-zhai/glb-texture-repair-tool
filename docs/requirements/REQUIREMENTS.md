# 需求与验收标准（REQUIREMENTS）

> 由 `requirements` 技能生成/维护。**权威需求清单**：实现前必须先在此登记 `REQ-XXX`。
> 验收标准须可判定；每个功能点 ≥5 个验收场景（Given/When/Then）。

## 元信息

| 项 | 值 |
| :-- | :-- |
| 项目 | GLB Texture Repair Tool（GLB 贴图修复桌面工具） |
| 版本 | 0.1.0 |
| 最后更新 | 2026-09-18 |

## 需求清单

### REQ-001 设计文档与实现保持一致，并纳入版本库
- **状态**：已完成
- **优先级**：P1
- **描述**：合并 `main` 之后，`CLAUDE.md` 与 `docs/` 的设计文档与代码实际行为出现偏离——lint 覆盖文件数写成四个（实际五个，含 `src/ive.js`）、IVE 流水线章节整段丢失、BR-002 仍在描述已被撤销的「保留 JPEG 贴图原格式」、修复报告示例里留着已移除的 `imagesKeptJpeg` 字段；同时三份设计文档未入库，版本线无从审计。本需求要把文档校正到与实现一致并纳入版本库，使平台「可审计」成立。面向后续所有在本项目上工作的 agent 与开发者。
- **范围**：`CLAUDE.md` 行为描述校正；`docs/001-code-design.md`、`docs/002-requirements.md`、`docs/cesium-glb-load-issues.md` 入库并校正；`.gitignore` 只放行这三份、继续忽略平台生成的模板文档；`AGENTS.md` 增加指向 `.ai/AGENTS.md` 的一行。
  **不做**：不改动任何运行时行为或测试断言；不让 `docs/coding-standard/`、`docs/design/`、`docs/release/`、`docs/testing/`、`docs/approvals/` 等平台生成文档入库。
- **验收标准**（Given/When/Then）：
  1. Given 版本分支 `release/v0.1.0` 上的 `CLAUDE.md` When 查看 lint 说明 Then 写的是五个 `src/*.js` 文件并列出 `main/preload/renderer/repair/ive`，与 `package.json` 的 `lint` 脚本一致。
  2. Given 版本分支上的 `CLAUDE.md` When 检索 IVE 相关内容 Then 存在「IVE input pipeline」章节，覆盖轴转换（Z-up→Y-up）、贴地归心、顶点焊接与 `hasMatrix` 陷阱，`grep -c "IVE input pipeline" CLAUDE.md` ≥ 1。
  3. Given `docs/001-code-design.md` When 查看 BR-002 与 §5.1 修复报告示例 Then 二者描述的是「统一转 PNG」，且示例字段与 `src/repair.js` 实际返回对象一致（**不含** `imagesKeptJpeg`）。
  4. When 执行 `git ls-files docs/` Then 恰好列出三份项目设计文档，且**不含**任何平台生成的模板文档。
  5. When 执行 `npm run lint` 与 `npm test` Then 二者均通过（43 个用例全绿），证明纯文档改动未破坏任何实现行为。
- **关联任务**：TASK-001
- **关联代码/测试**：`CLAUDE.md`、`AGENTS.md`、`.gitignore`、`docs/001-code-design.md`、`docs/002-requirements.md`、`docs/cesium-glb-load-issues.md`
- **确认**：待确认

### REQ-002 测试与发布基线可执行、可核验
- **状态**：已完成
- **优先级**：P1
- **描述**：merge request 的验收清单明确引用 `docs/testing/TEST_PLAN.md` 与 `docs/release/RELEASE_CHECKLIST.md`，但两份仍是空模板且未入库——清单条目因此无法真正满足：评审人不知道该跑什么命令、期望什么结果、出问题怎么回滚。本需求把这两份基线写成与本项目实际一致的、可执行的文档并入库，使「门禁全绿」「回滚预案就绪」变成可核验的陈述。面向后续所有评审者与发布责任人。
- **范围**：填写 `TEST_PLAN.md`（用例清单、必测维度、结果汇总，含真实覆盖率与夹具缺失时的跳过语义）与 `RELEASE_CHECKLIST.md`（预检/迁移/发布/冒烟/回滚/发布说明）；`.gitignore` 放行这两份。
  **不做**：不改动任何运行时代码或测试断言；不引入覆盖率门槛（仅如实记录实测值）；`docs/release/MERGE_REQUEST.md` 是 task-flow 生成的派生物、`docs/testing/PERF_BUDGET.md` 本轮不填，二者保持忽略。
- **验收标准**（Given/When/Then）：
  1. Given 版本分支上的 `TEST_PLAN.md` When 通读 Then 元信息的执行命令为 `npm test`，用例清单每条都给出可执行命令与可判定期望，**不含任何 `{{}}` 占位符**。
  2. When 按 `TEST_PLAN.md` 执行 `npm test` Then 结果与文档"结果汇总"一致（**数字随用例集演进、以 `TEST_PLAN.md` 为准，需求正文不钉死快照**）。当时基线：有夹具时 43 通过 / 0 失败 / 0 跳过；无夹具时 33 通过 / 11 跳过 / 0 失败。当前基线：本地样例（已裁剪）76 通过 / 0 失败 / 4 跳过；全新克隆（无任何夹具）66 通过 / 14 跳过 / 0 失败。
  3. Given `TEST_PLAN.md` 的覆盖率一节 When 与 `node --test --experimental-test-coverage` 实测比对 Then 数字一致（**以文档当次实测为准**；当前：all files 行 92.97% / 分支 73.76% / 函数 94.82%，`ive.js` 95.99%、`repair.js` 89.30%、`inspect.js` 93.57%、`transform.js` 100.00%），并写明 Electron 壳层（`main/preload/renderer`）未纳入插桩。
  4. Given `RELEASE_CHECKLIST.md` When 查看预检与回滚 Then 每条预检都能对应到具体命令（`npm run lint` / `npm test` / `npm run dist:win`），回滚预案给出可执行步骤与决策人，且如实记录"`npm audit` 在本机镜像源不可用、需换官方源或 CI 执行"。
  5. When 执行 `git ls-files docs/testing docs/release` Then 恰列出 `TEST_PLAN.md` 与 `RELEASE_CHECKLIST.md` 两份，`MERGE_REQUEST.md` 与 `PERF_BUDGET.md` 仍被忽略。
- **关联任务**：TASK-004
- **关联代码/测试**：`docs/testing/TEST_PLAN.md`、`docs/release/RELEASE_CHECKLIST.md`、`.gitignore`
- **确认**：待确认

### REQ-003 IVE 转 GLB（上轴转换、贴地归心、顶点焊接）— 追溯登记
- **状态**：已完成
- **优先级**：P0
- **描述**：把 OpenSceneGraph 的 `.ive` 输入转换成 Cesium 可加载的自包含 GLB，这是产品最初的核心诉求之一。**该功能在平台采纳之前就已交付**（主提交 `5b5b495`，其后修复合并造成的导出丢失 `6ada92d`），本次按平台要求**追溯登记**到权威需求清单，使台账反映真实产品状态——在此之前台账里只有两条文档类需求，看不出功能完成度。
- **范围**：原生助手 `ive2glb`（C++/OSG）+ Node 侧 GLB 组装（贴图内嵌、空节点剪枝）+ 上轴转换 + 贴地归心 + 顶点焊接 + 转换进度事件 + 界面能力探测。
  **不做**：FBX/OBJ 输入（见 `docs/002-requirements.md` §6 问题 4，已定本期不做）；贴图降采样（属 M3）。
- **验收标准**（Given/When/Then）：
  1. Given `o-model/蹲姿.ive` When 执行转换 Then 世界盒为 `0.538 × 1.364 × 1.056`（容差 0.02），与 FBX2glTF 参考件 `model/蹲姿.glb` 三轴一致——回归用例 `test/ive.test.js` 的「同轴同尺度」。
  2. When 转换任一 IVE Then 产物 `min.y = 0`，且水平中心归零（`|center.x|`、`|center.z|` < 1e-6）——贴地归心生效。
  3. When 顶点焊接开启（默认）Then 蹲姿 56,772 → 11,516 顶点（≤ 参考件 × 1.2），面数 18,924 与 3 张贴图不回退；`weldVertices:false` 时保持 56,772——回归用例「顶点焊接」。
  4. When 文件中存在带旋转/缩放的节点 Then 退化为 `mode: 'root'`（挂一个转换根节点、不改写顶点），不得静默产出错误结果——`person-stand.ive` 实测走此路径。
  5. When 助手缺失或输入非 IVE Then 返回中文错误并列出已查找路径，不静默失败（BR-012）——回归用例「助手缺失」「拒绝非 IVE」。
- **关联任务**：TASK-005
- **关联代码/测试**：`src/ive.js`、`native/ive2glb/`、`scripts/build-ive2glb.sh`、`test/ive.test.js`；规则 BR-008～BR-017
- **确认**：平台采纳前交付，本次追溯登记（交付提交 `5b5b495`）

### REQ-004 让 GLB 在 Cesium 中正常加载的修复能力 — 追溯登记
- **状态**：已完成
- **优先级**：P0
- **描述**：产品的另一半核心诉求：模型在普通查看器里正常，在 Cesium 里却加载失败或看不见。**同样在平台采纳之前交付**（`fd90022` 建立修复工作流，`1c266a4` 修复加载挂死与贴图不显示），本次追溯登记。
- **范围**：蒙皮网格烘焙（含姿势冻结）、贴图内嵌与 JPEG→PNG 统一化、不稳定扩展清理、缺 `TEXCOORD_n` 补全、图元按材质合并（含镜像节点绕序反转）、批处理进度与单文件失败不中断。
  **不做**：贴图降采样与 sampler 规格规范化（属 M3）；动画保留（当前是烘焙成静态）。
- **验收标准**（Given/When/Then）：
  1. When 修复含 `skin` + `JOINTS_0`/`WEIGHTS_0` 的模型 Then 烘焙为静态网格、删除 `skins`/`animations`，并**重算** `accessor.min/max`（Cesium 用它做剔除与取景）。
  2. When 图元数超过阈值（默认 100）Then 跨节点按材质合并（镜像节点逐图元反转绕序、烘焙世界变换），模型能在数秒内加载完成（BR-007）。
  3. When 材质采样贴图但图元缺对应 `TEXCOORD_n` Then 补一个全 0 的 float32 VEC2，使 Cesium 不再因着色器编译失败而**整个场景**不渲染（BR-006）。
  4. When 贴图是外部路径（含 Windows 绝对路径、`.fbm` 目录）Then 递归查找并内嵌为 `bufferView`；JPEG 一律转 PNG；无法解码的 JPEG 按单文件报错而不写坏贴图（BR-002/BR-005）。
  5. When 批处理遇到损坏/不可读文件 Then 该项失败并计入 `failed`、后续文件继续处理，`onProgress` 的 `file-start`/`file-done`/`done` 事件完整（BR-004）。
- **关联任务**：TASK-006
- **关联代码/测试**：`src/repair.js`、`test/repair.test.js`；规则 BR-001～BR-007
- **确认**：平台采纳前交付，本次追溯登记（交付提交 `fd90022`、`1c266a4`）

### REQ-005 模型体检：把"摆进去到底什么样"变成可读报告
- **状态**：已完成（验收标准 1~5 均已实现并通过自动化验证；**人工目视 2026-09-20 通过**——sunny-zhai 按 `docs/testing/TEST_PLAN.md` 的 M-1 在应用内逐项核对，留痕见 `docs/approvals/APPROVALS.md` 的 delivery 记录。TASK-009 的两处既有缺陷已于 `caa812e` 修复）
- **优先级**：P1
- **描述**：用户需要"详细梳理模型大小、点面数量、贴图、中心点位置、默认方向、比例尺"。目前这些信息只散落在转换日志的一行尺寸里，工具中**没有任何地方**能看出"accessor 盒与真实世界盒差 9 万倍""贴图是 1×1 占位""几何是三角汤""33 个材质却 0 张贴图被采样"这类问题——模型看着对、摆进 Cesium 却不对。本需求提供**只读体检**：对任意 GLB（含 IVE 转换产物）产出参数报告（体积、点面数、贴图规格、世界盒 vs accessor 盒及偏差倍数、中心点、上轴判定、比例尺、问题清单），并在界面上做成面板；预览侧同时提供方向/缩放即时修正。
- **范围**：`src/inspect.js`（体检报告）、`src/transform.js`（世界盒与矩阵工具）、界面体检面板与预览控件、相应 IPC 通道。
  **不做**：不改写模型文件；贴图降采样属 M3；FBX/OBJ 输入本期不做。
- **验收标准**（Given/When/Then）：
  1. Given `o-model/运输车.glb` When `node -e "inspect('o-model/运输车.glb')"` Then 报告给出 `bounds.world ≈ 2.59 × 4.10 × 5.98`、`boundsDeviationFactor > 1000`，并列出荒谬的 `accessorUnion`（实测 `11,572 × 15,430 × 23,539`）。
  2. When 对样例集逐个体检 Then 零崩溃，单文件 ≤ 2s（历史上限样本 `M1A2艾布拉姆斯坦克.glb`：174,937 顶点 / 363 图元）。**样例集以本地实际存在为准**：样例模型不入库（`.gitignore`），个数随本地增减，用例**只要求 ≥1 个并随语料伸缩、不硬编码数量**；2026-09-18 首次实测时为 `o-model/*.glb` 18 个 + `model/*.glb` 3 个 = 21 个，语料裁剪后本地为 4 个（`docs/002-requirements.md` 早先写的「24 个」是估计值，已修正）。
  3. When 统计几何 Then 三角面统计可判定（`mode=4` 图元的索引数可被 3 整除；无此类索引图元时为 `null`）；`vertexReuseRatio` 对 person 参考件 = 0.61（定义为 **顶点数 ÷ 三角面数**：焊接后 11,516 ÷ 18,924）。（原判据 `triangles === Σ(indices.count)/3` 经冷上下文审查判定无效——无非索引图元时是恒等式、存在非索引图元时必然为假——已替换，见 TASK-007 返工记录。）
  4. Given 预览视图 When 拖动方向/缩放（或在上轴三态里显式指定 `Z-up → Y-up`）Then 模型按设定旋转/缩放、日志记录最终 `modelMatrix` 并注明未写回；人工目视下人物与车辆能同框可见。且**预览修正不写入输出文件**（写回必须是显式操作）。
  5. When 体检遇到异常输入（缺 accessor `min`/`max`、外部 `uri` 缺失、非 GLB）Then 报告给出可读中文问题条目而不是抛异常。
- **关联任务**：TASK-007、TASK-008、TASK-009（缺陷修复）
- **关联代码/测试**：`src/inspect.js`、`src/transform.js`、`src/report-format.js`、`src/preview-transform.js`、`src/renderer.js`、`test/inspect.test.js`、`test/report-format.test.js`、`test/preview-transform.test.js`、`test/ui-smoke.cjs`
- **确认**：待确认

### REQ-006 编辑器式界面重排：让主次关系与操作路径对上
- **状态**：已完成（7 条验收标准已实现并通过自动化验证；**人工目视 2026-09-20 通过**——sunny-zhai 按 M-2~M-4 核对布局、折叠、900px 降级与单层滚动条，留痕见 `docs/approvals/APPROVALS.md`）
- **优先级**：P1
- **描述**：当前界面是**一列到底、整页滚动**：工具栏、提示、选项、进度、输入/输出、体检面板、Cesium 预览、日志首尾相接，Cesium 容器固定 360px 高。用户要在「选文件 → 跑批量 → 看结果 → 体检 → 预览」之间反复上下滚动，3D 视图与体检结论也无法并列比较，工具感很差。本需求把主工作区重排为**编辑器式布局**：左栏输入队列/结果、中间 3D 主视口（占最大面积）、右栏体检报告与修复选项、底部日志面板 + 常驻状态栏；分栏可拖拽、可折叠、状态可记忆。
- **范围**：`src/index.html`、`src/styles.css`、`src/renderer.js`（布局装配、分栏拖拽、折叠与记忆、状态栏、`ResizeObserver` → `viewer.resize()`）。
  **不做**：不改任何修复/体检/IVE 逻辑与 IPC 契约；不引入前端框架或构建步骤（保持无 bundler、CSP 不放宽）；不换配色主题。
- **验收标准**（Given/When/Then）：
  1. Given 应用启动（窗口 ≥1280×800）When 观察 Then 一屏内**同时可见**左栏（输入队列 + 结果）、中间 3D 视口、右栏（体检报告）、底部日志，且**页面本身不出现整页滚动**（`document.scrollingElement.scrollHeight <= innerHeight + 1`），滚动只发生在各面板内部。
  2. When 拖动分栏之间的分隔条 Then 三栏宽度与底部高度随之变化，3D 视口始终占最大面积，且各栏有最小尺寸（拖不到 0）；**3D 画面跟随尺寸变化重算**（`viewer.resize()`），不被拉伸或裁剪。
  3. When 折叠底部日志 Then 3D 视口自动占满腾出的空间；再次展开恢复原高度。
  4. When 窗口缩到最小宽度（900px）Then 布局降级为两栏（右栏转为可展开抽屉），不出现横向滚动。
  5. When 用户调整分栏或折叠面板后重启应用 Then 布局状态被记住（`localStorage`），无需重新调整。
  6. 常驻状态栏显示：当前预览模型名、文件大小、体检耗时与问题计数（错误/警告/提示）、批量修复进度（成功 N / 失败 M / 共 T）。键盘可达：Tab 可遍历工具栏与预览控件，焦点样式可见，主按钮可用键盘触发。
  7. 不回归：`npm test` 全绿；`test/ui-smoke.cjs` 的既有断言（面板数值/配色、拖动不刷日志、`change` 记录最终 `modelMatrix`、上轴复合矩阵、体检失败不打断预览、输入文件哈希不变）在新布局下仍全部通过。

### REQ-007 多格式输入：FBX / OBJ 走 assimpjs(WASM) 转换后进入现有管线
- **状态**：已完成（TASK-013~016 已交付：转换内核 → 三条 IPC 接线与打包 → 文档规则 → 冷审 6 条重要项全修；10 条验收标准已由自动化证据覆盖，**人工目视 2026-09-20 通过**——sunny-zhai 按 M-5 核对 FBX/OBJ 直立贴地与贴图正确，OBJ 的 1×1 占位贴图属预期。原状态"待实现"是登记时的快照，2026-09-20 按实情订正）
- **优先级**：P1
- **描述**：用户反馈"现在只支持 IVE 和 GLB 预览，其他格式如 FBX/OBJ 不支持"。现状：文件选择器只过滤 `glb`/`ive`（`src/main.js`），`collectGlbEntries(inputs, ['.glb', '.ive'])`，能力探测只报 `ive`。Cesium 不能直接读 FBX/OBJ，**任何"预览"都必须先转成 GLB**，所以"只预览"与"转换落盘"是同一条链。本需求把 FBX/OBJ 接进现有「转换 → （修复）→ 体检 → 预览」管线，后端用 **assimpjs（WASM，MIT）**：不随包分发平台相关二进制，顺带解决 Windows 没有 `ive2glb.exe` 的既有缺口。
  **2026-09-20 订正（原文保留不改写）**：末句"顺带解决 Windows 没有 `ive2glb.exe` 的既有缺口"**不成立**——`assimp` 没有 IVE importer，`assimpjs` 读不了 `.ive`。Windows 的 IVE 能力由 REQ-009 与 ADR-010 单独承担（构建并 vendoring 原生 `win32-x64` 助手）。
- **范围**：新增 `src/convert.js`（assimpjs 转换内核）；改 `src/main.js`（文件过滤器、`repair-glb`、`read-glb-data-url`、`inspect-glb` 的转换前置与能力探测）、`src/preload.js`（如需新通道）、`src/renderer.js`（提示文案与接受的扩展名）、`package.json`（`dependencies` 加 `assimpjs`、`asarUnpack`、`files`）、`scripts/`（如需 wasm 校验）、文档与台账。
  **不做**：FBX/OBJ 之外的格式（dae/3ds/stl/ply 等本次不进选择器）；不引入前端框架；不改 Cesium 版本；不新增"上轴/贴地"开关（沿用现有预览修正三态）。
- **验收标准**（Given/When/Then；数字来自 2026-09-20 的真机 spike，`assimpjs@0.0.10` + `o-model/蹲姿.fbx` / `蹲姿.obj`）：
  1. Given `o-model/蹲姿.fbx`（2.5MB，含 1 蒙皮/1 动画）When 转换 Then 产出 GLB（焊接后实测 **2.32MB** / 3.9s），体检报 **18,924 三角面**、**3 张内嵌贴图**、上轴为 **Y**，世界盒与绑定姿态参考件 `o-model/蹲姿.glb` 三轴一致（**1.8937 × 1.8483 × 0.3804**，容差 0.02）；且 `asset.generator` 记录 assimp 版本。
  2. Given `o-model/蹲姿.obj` + `蹲姿.mtl` When 转换 Then 产出 GLB（焊接后实测 0.57MB），体检报 **18,924 三角面**，世界盒 **0.5382 × 1.3643 × 1.0559 m**，与蹲姿参考件 **`model/蹲姿.glb`** 三轴一致（容差 0.02）。注意两个参考件姿态不同、不可混用：`o-model/蹲姿.glb` 是绑定/平举姿态（对应 FBX），`model/蹲姿.glb` 才是蹲姿（对应 OBJ）。
  3. Given OBJ 的 MTL 引用外部贴图 When 转换 Then 按「相对路径 → 同级同名 → `.fbm` 目录内同名」顺序解析并内嵌；**解析不到的不得静默丢弃**：必须在日志与体检问题清单里以中文条目列出原始 `uri`（`o-model/蹲姿.mtl` 实测引用的是 `E:\zxbwork\1216…\Pistol Kneeling Idle.fbm\WuYanZu_Hat_D.jpg` 这类**乱码绝对路径**，本机无该文件）。
  4. Given 转换产物 When 用于 Cesium 预览 Then 该临时 GLB **不得残留解析不到的外部 `uri`**（否则 Cesium 必然加载失败）；解析不到的贴图**保留材质槽但换成 1×1 占位**（名字写成 `missing:<原始 uri>`，体检会据此报出原路径），并在日志里说明原因——不删槽、不静默丢。
  5. Given 用户在「选择文件/选择目录」里选 FBX/OBJ When 观察 Then 过滤器含这两种扩展名，且**预览、批量修复（可落盘）、体检三条路径都与 IVE 同等待遇**（IVE 的转换前置逻辑不外溢、不回归）。
  6. Given FBX 含蒙皮与动画 When 预览或修复 Then 沿用现有管线语义：默认烘焙**绑定姿势**，勾选「带动画的蒙皮模型：烘焙为动画起始姿势」则烘焙起始帧；不新增开关。
  7. Given 转换产物是三角汤（实测 56,772 顶点 / 18,924 面，顶点:面 = 3）When 转换 Then 复用 `src/ive.js` 已导出的 `weldVertices` 做焊接，顶点数应显著下降（参考：FBX2glTF 产物 11,516 顶点），且**面数与贴图不变**。
  8. Given 打包分发 When 安装后运行 Then assimpjs 的 `assimpjs.wasm` 必须可加载（`asarUnpack` + 路径解析，与 `vendor/ive2glb` 的既有做法一致），且**不引入任何外部可执行程序**（不违反"不 shell 外部二进制"的仓库约定）。
  9. 不回归：`npm test` 全绿；`test/ui-smoke.cjs` 在 GLB 与 IVE 上的既有断言全绿；`node scripts/memory.mjs check` 通过。
  10. Given 无法转换的坏文件（非 FBX/OBJ、损坏、assimp 报错）When 转换 Then 返回**中文**错误并说明 assimp 的 error code，批量修复**不中断**（沿用 `repairMany` 的逐文件容错）。
- **关联任务**：TASK-013、TASK-014、TASK-015
- **关联代码/测试**：`src/convert.js`、`src/main.js`、`src/renderer.js`、`src/ive.js`（复用 `weldVertices`）、`test/convert.test.js`、`test/ui-smoke.cjs`
- **确认**：已确认（见 `docs/approvals/APPROVALS.md`）

### REQ-008 贴图规格收口：采样器规范化 + 贴图降采样 + `KHR_texture_transform` 漏报修复（M3）
- **状态**：已完成（闸门 ① 规格 · sunny-zhai · 2026-09-20；TASK-017~020 全部交付：采样器规范化、降采样四档与界面接线、`KHR_texture_transform` 漏报修复、文档与规则回填。11 条验收标准均有自动化证据，见 `docs/testing/TEST_PLAN.md` 的 TC-019~TC-021）
- **优先级**：P1
- **描述**：`docs/002-requirements.md` 的 M3「修得全（贴图规格）」里，**采样器规范化**与**贴图降采样**两项至今没有任何任务承载：体检能报出 `NPOT_WITH_REPEAT_MIPMAP` 却修不了（`src/repair.js` 里只有动画 sampler，没有贴图采样器规范化步骤）；`BR-002` 把 JPEG 统一转 PNG 后照片类贴图明显膨胀（实测 2048² 2.1MB → 10.25MB），发布说明自己写着"真正的解法是贴图降采样，尚未做"，却没有降采样旋钮。另外 TASK-007 留下的"已知遗留"——体检与修复都忽略了 `KHR_texture_transform.texCoord` 覆盖，导致 `MISSING_TEXCOORD` 可能**漏报**，而漏报的后果是 Cesium 因着色器编译失败连整个场景都不渲染——也一直没有登记任务。本需求把这三件事一次收口，让"贴图规格"从只能看见变成能修。
- **范围**：`src/repair.js`（新增采样器规范化步骤 + 降采样步骤 + `collectMaterialTexCoords` 读扩展覆盖）、`src/inspect.js`（`collectTextureSlots` 读扩展覆盖）、`src/renderer.js` + `src/index.html`（贴图降采样档位下拉与中文提示）、`test/repair.test.js`、`test/inspect.test.js`、`src/001-code-design.md`（BR 回填，见任务）、`docs/testing/TEST_PLAN.md`。
  **不做**：把 NPOT 补成 POT（padding/resize 会改画面比例与像素语义，且体检仍会报 NPOT）；纹理解码/重采样用原生依赖（`sharp`/`canvas` 等——本仓"转码自包含、不按平台分发二进制"的约定不变，`pngjs` 已在 `dependencies`）；贴图内容重绘/去噪/压缩到 KTX2/Basis；改 JPEG→PNG 的口径（BR-002 不变）。
- **验收标准**（Given/When/Then）：
  1. **采样器规范化（合成基线）**：Given 一个内嵌 512×341（NPOT）PNG、采样器为 `REPEAT` + mipmap 的 GLB，When `repairGlbFile`，Then 该采样器变为 `wrapS/wrapT = CLAMP_TO_EDGE` + `minFilter = LINEAR`，且 `inspect()` 不再报 `NPOT_WITH_REPEAT_MIPMAP`。
  2. **采样器规范化（不误伤）**：Given ① 256×256（POT）贴图 + `REPEAT` + mipmap，② NPOT 贴图但采样器已是 `CLAMP_TO_EDGE` + `LINEAR`，When 修复，Then 两者采样器**一个字段都不改**；Given 采样器被多个材质共用且其中一个材质合法，When 修复，Then 判定按"贴图维度 × 采样器"逐个进行，不因共用而漏改或误改。
  3. **采样器规范化（可判定不变量）**：修复后产物中不存在"任一维非 2 次幂的贴图 且 采样器同时 `REPEAT` + mipmap"的 (image, sampler) 组合——由脚本对产物全量断言；本地语料按 `fixtureSkipReason()` 门控（语料缺失则跳过并打印恢复命令，不硬编码数量）。
  4. **降采样（像素正确性）**：Given 一张 2048×2048、含已知棋盘/渐变图案的 PNG 贴图，When 以 `maxTextureSize: 1024` 修复，Then 产物贴图是 1024×1024 且每个像素等于对应的 2×2 盒式平均（逐像素容差断言，不接受"尺寸变小即通过"）。
  5. **降采样（档位与默认）**：修复选项提供「不降 / 2048 / 1024 / 512」四档，**默认不降**；Given 3000×1000 的贴图，When 选 1024，Then 产物为 1024×341（保持宽高比，最长边 ≤ 目标值，四舍五入规则固定并写入注释）；When 选「不降」，Then 产物字节与现状**完全一致**（回归基线）。
  6. **降采样（体积目标与不回归）**：Given person-stand 的 IVE 转换产物（历史实测 9.74MB，贴图占 8.06MB），When 以 1024 档修复，Then 产物 ≤ 4MB、贴图张数与面数不变；本地等价基线：`model/person-stand.glb`（2.27MB）在同一断言下**体积只降不升**、贴图张数不变（夹具缺失时按门控跳过）。
  7. **降采样（只动贴图）**：修复后所有几何相关 bufferView（POSITION/NORMAL/TANGENT/TEXCOORD/索引）的字节与修复前**逐字节相同**，证明降采样不碰几何；且降采样后 `accessor.min/max` 与几何统计不变。
  8. **降采样（可观测）**：`repairGlbFile` 的报告新增可读字段（至少 `texturesDownsampled` / `textureBytesBefore` / `textureBytesAfter`），批量日志用中文打印；选「不降」时报告明确表达"未降采样"而不是静默省略。
  9. **`KHR_texture_transform` 覆盖（体检）**：Given 图元缺 `TEXCOORD_0`、材质经 `KHR_texture_transform` 以 `texCoord: 1` 采样贴图的合成 GLB，When `inspect()`，Then 报出 `MISSING_TEXCOORD`（error 级）并点名缺失的是 `TEXCOORD_1`；**该用例在修复前的代码上必须为红**（证明回归网有效，不是恒真断言）。
  10. **`KHR_texture_transform` 覆盖（修复）**：同上的模型 When `repairGlbFile`，Then 补出的是全零 `TEXCOORD_1`（而不是 `TEXCOORD_0`），产物可被 Cesium 正常编译与渲染（无未声明 varying）。
  11. **不回归**：`npm run lint` + `npm test` 全绿；`test/ui-smoke.cjs` 在 GLB / IVE / FBX / OBJ 四个格式上仍全绿（含"预览产物不得残留外部 uri"断言）；`node scripts/memory.mjs check` 通过；本地语料的体检"内嵌贴图宽高可读"比例不回退。
- **关联任务**：TASK-017、TASK-018、TASK-019、TASK-020（文档与规则回填）
- **关联代码/测试**：`src/repair.js`、`src/inspect.js`、`src/renderer.js`、`src/index.html`、`test/repair.test.js`、`test/inspect.test.js`、`test/ui-smoke.cjs`；ADR-009；规则 BR-031 / BR-032
- **确认**：已确认（闸门 ① 规格 · sunny-zhai · 2026-09-20，见 `docs/approvals/APPROVALS.md`）

### REQ-009 Windows 分发可用性：IVE 助手入库 + 安装包重打与冒烟
- **状态**：已确认（闸门 ① 规格 · sunny-zhai · 2026-09-20；**待实现**，TASK-021 需外部 Windows x64 环境，发布时点由人决定）
- **优先级**：P0（发布前置）
- **描述**：v0.1.1 决定**暂不发布**，原因是 Windows 侧不完整：① `vendor/ive2glb/` 只有 `darwin-arm64`，Windows 安装包里没有 `ive2glb.exe`，用户打开 `.ive` 只能拿到 BR-012 的中文降级提示（不静默，但功能不可用）；② `dist/` 里现有产物是 **2026-09-15** 构建的 `0.1.0` 包，早于 REQ-005/006/007，不含体检面板、编辑器式布局与 FBX/OBJ 链路，不能代表当前代码。本需求把"能发"变成可核验的目标：Windows 助手入库、安装包重打、冒烟表逐行回填。
- **范围**：`native/ive2glb/`（Windows 构建与 `README.md` 补 Windows 步骤）、`vendor/ive2glb/win32-x64/`（构建产物入库，与既有的 `vendor/ive2glb/**` 打包约定一致）、`package.json`（`files` / `asarUnpack` 如需）、`docs/release/RELEASE_CHECKLIST.md`、`docs/testing/TEST_PLAN.md`。
  **不做**：为 IVE 另写一套 JS/WASM 解析（assimp **没有** IVE importer，见 ADR-010）；代码签名、自动更新与 CI 流水线；改 `package.json` 的版本号口径（仍由人显式 `version.mjs bump` 决定）。
- **验收标准**（Given/When/Then）：
  1. Given Windows x64 构建环境与 `native/ive2glb/README.md` 的步骤，When 构建并 vendoring，Then 产出 `vendor/ive2glb/win32-x64/ive2glb.exe` 及其依赖 DLL，且依赖闭包**不含任何非系统第三方 DLL**（`dumpbin /dependents` 或等价命令留证）。
  2. Given 安装后的 Windows 包，When 调用 `app-capabilities`，Then `ive: true`；选一个 `.ive` 能完成转换、预览与落盘，且世界盒与 darwin 产出三轴一致（容差 0.02，参考 `0.538 × 1.364 × 1.056`）。
  3. Given 当前代码，When `npm run dist:win`，Then `dist/` 产物时间戳新于本次提交，且包内可验证地含有 `vendor/ive2glb/win32-x64/ive2glb.exe`、`assimpjs/dist/assimpjs.wasm` 与两份 assimp 许可证文件。
  4. Given 新安装包，When 按 `RELEASE_CHECKLIST.md` §4 冒烟表逐行执行，Then 每行都填上实际值与结果，覆盖 `.ive` / `.glb` / `.fbx` / `.obj` 四种输入、嵌套目录结构、输出体积、坏输入不阻断。
  5. Given §1 预检与 §4 冒烟的证据，When 回填 `RELEASE_CHECKLIST.md` 与 `TASKS.md`，Then 预检表中除显式标注"不适用"外全部勾选，`node scripts/memory.mjs check` 通过。
  6. Given 由于环境原因无法完成 Windows 构建，When 决定只发 GLB/FBX/OBJ 能力，Then 必须在发布说明中显式声明"Windows 上 `.ive` 不可用、降级为 BR-012 中文提示"，并把该声明本身作为验收证据（**不得**以沉默略过，也不得让清单里那条保持在含糊状态）。
- **关联任务**：TASK-021、TASK-022
- **关联代码/测试**：`native/ive2glb/`、`vendor/ive2glb/win32-x64/`、`scripts/build-ive2glb.sh`、`package.json`、`docs/release/RELEASE_CHECKLIST.md`；ADR-010
- **确认**：已确认（闸门 ① 规格 · sunny-zhai · 2026-09-20，见 `docs/approvals/APPROVALS.md`；发布时点仍由人决定）

### REQ-010 预览修正的记忆：上轴/方向/缩放选择在重启后保持
- **状态**：已完成（闸门 ① 规格 · sunny-zhai · 2026-09-20；TASK-023 已交付：`glb-repair.preview` 只记显式选择、启动与新模型加载都沿用并记日志、坏载荷回落合法区间；冒烟 5 条断言通过）
- **优先级**：P2
- **描述**：`docs/002-requirements.md` §6 问题 3 的默认口径是"置信度不足弹手动三态并**记住**选择"，但实现里只有**布局**进了 `localStorage`（键 `glb-repair.layout`），上轴三态、偏航与缩放都是每次启动回到默认（`auto` / 0° / 1.00×），换一个模型也要重设。对批量看同一批 Z-up 资产的用户，这是每次都要重做的动作。本需求把这三个"用户意图"持久化，并明确**感知提示**：记住的是**用户显式选过**的值，`auto` 与"从未选过"必须可区分，避免把一次误拖当成长期偏好。
- **范围**：`src/renderer.js`（预览三态的读写与提示）、`src/index.html`（如需提示文案容器）、`test/ui-smoke.cjs`（重启后恢复的断言）。
  **不做**：把修正写回文件（ADR-004 不变，写回仍是另一件事）；按模型路径分别记忆（记忆是"用户偏好"级别，不是"每个模型的属性"）。
- **验收标准**（Given/When/Then）：
  1. Given 用户把上轴选为 `Z-up → Y-up`、方向 90°、缩放 2×，When 重启应用并选任意模型，Then 三个控件仍是该组合，且日志/提示明确说明"来自上次选择"。
  2. Given 用户从未动过预览控件，When 启动，Then 保持 `auto` / 0° / 1.00×，且**不写入** `localStorage`（"没选过"与"选过 auto"可区分）。
  3. Given 用户显式把上轴选回 `auto`，When 重启，Then 仍是 `auto`（显式选择被记住，而不是被当作未设置）。
  4. Given `localStorage` 里是垃圾载荷（非 JSON、越界值、未知档位），When 启动，Then 布局与预览都落回合法默认、页面异常为 0（沿用 TASK-010 的垃圾载荷断言风格）。
  5. Given 记忆生效，When 检查模型文件，Then 文件 `shasum` 前后不变（记忆只影响预览，不写回文件，ADR-004/BR-024 不回归）。
- **关联任务**：TASK-023
- **关联代码/测试**：`src/renderer.js`、`src/preview-transform.js`（复用其 clamp/默认值）、`test/ui-smoke.cjs`
- **确认**：已确认（闸门 ① 规格 · sunny-zhai · 2026-09-20，见 `docs/approvals/APPROVALS.md`）

### REQ-011 布局按占比固定：窗口缩放保持各区比例，拖拽改比例，内部元素自适应
- **状态**：已完成（闸门 ① 规格 · sunny-zhai · 2026-09-20；闸门 ② 架构 · ADR-011 · 2026-09-20。TASK-024 占比模型、TASK-025 多尺寸自适应普查、TASK-026 文档回填均已交付。**旧（像素）实现上占比断言实测为红**：1280×800 → 1920×1200 时左 20.44%→13.60%、右 26.73%→17.78%、中 52.83%→68.62%、底 26.46%→17.30%；新实现下五档窗口占比变化 ≤1 个百分点）
- **优先级**：P1
- **描述**：用户反馈"界面每个区域的宽高占比应该固定不变，用户可以手动调整宽高，内部元素都要自适应"。现状与诉求相反：三栏宽度与底部高度以**像素**存储（`--pane-left/right/bottom` + `localStorage` 键 `glb-repair.layout`，见 `src/styles.css` 的 grid 定义与 `src/renderer.js` 的 `clampLayout`/`refitLayout`），窗口缩放时 `refitLayout()` 只在新窗口下**夹取**这些像素值——左右栏与底部像素不变，**中栏独吞全部增量**，于是占比随窗口漂移：1280×800 下 左:中:右 = 20.3% : 52.5% : 26.6%，拉到 1600 宽变成 16.3% : 62% : 21.3%（左栏占比掉 4 个百分点）。用户摆好的构图被窗口尺寸改写。本需求把布局模型从"像素"改成"**占比**"：窗口缩放时各区占比不变，用户拖拽改的是占比，且任一允许尺寸下内部元素都自适应（不裁切、不出现双重滚动条、不整页滚动）。
- **范围**：`src/renderer.js`（布局状态、`clampLayout`/`refitLayout`/`commitLayout`/`applyLayout`、持久化格式与版本迁移）、`src/styles.css`（网格变量如何由占比推出）、`test/ui-smoke.cjs`（占比不变量与多尺寸矩阵断言）。
  **不做**：不改区域数量与语义（仍是左队列 / 中 3D / 右体检 / 底日志 + 状态栏，BR-027 不变）；不改 IPC、修复/体检/预览逻辑；不引入前端框架或构建步骤；不改窄窗口降级为"两栏 + 抽屉"的规则（BR-027），只把它的尺寸也改成按占比；不做像素级视觉回归（截图比对）。
- **验收标准**（Given/When/Then）：
  1. **占比不漂移（核心）**：Given 在 1280×800 下把三栏与底部拖成任意合法占比，When 把窗口依次改为 1100×760、1440×900、1920×1200，Then 每一档下 **左栏/中栏/右栏各占可用宽度的百分比与拖拽时相比变化 ≤ 1 个百分点**，底部日志占窗口高度、中栏占剩余高度的百分比同样 ≤ 1 个百分点。断言由脚本计算百分比（不是"看起来没变"），且**当前实现必须为红**。
  2. **拖拽改的是占比**：Given 用户拖动分隔条，When 松开，Then 新占比生效并随后续窗口缩放保持；拖动过程仍实时改 CSS 变量与 3D 画布尺寸（`viewer.resize()` 被真实调用），且拖动只记一次日志（`change` 语义不回归）。
  3. **占比被记住**：Given 用户设定过占比，When 重启应用（同一窗口尺寸），Then 占比还原（像素误差 ≤ 1px）；Given `localStorage` 里是**旧版像素格式**（`version:1`），Then 迁移为等价的初始占比或安全回落到默认值，且**不得**让页面异常或把某一栏挤到 0。
  4. **最小尺寸与占比的冲突有确定规则**：Given 窗口被缩到无法同时满足各区最小尺寸（左 ≥180 / 右 ≥220 / 中 ≥420 宽、3D 画布 ≥160 高），When 继续缩小，Then 夹取**按确定优先级**执行（先等比整体压缩、再依次触底），结果可预测且不整页滚动；Given 窗口恢复到足够大，Then 占比**回到**用户设定值（不因中间被夹取而永久失真）。
  5. **窄窗口降级同样按占比**：Given 窗口宽度 < 1100px（进入两栏 + 右栏抽屉），When 缩放窗口，Then 左栏与中栏的占比保持不变、抽屉宽度按占比推出，且不出现横向滚动。
  6. **内部元素自适应**：Given 900×700 / 1100×760 / 1280×800 / 1440×900 / 1920×1200 的尺寸矩阵，When 逐区检查，Then ① 每个区域内"overflow 为 auto|scroll 的元素"仍**恰好 1 个**（左/右/日志各 1、中栏 0，BR-029 不回归）；② 各区域与预览控件条**无横向溢出**（`scrollWidth <= clientWidth + 1`）、不被裁切；③ 中栏 3D 画布高度 ≥ `CANVAS_MIN_HEIGHT`，且窗口足够大时**明显高于下限**（不允许"永远贴在下限"也算通过）；④ **状态栏不换行**（高度在各尺寸恒定）——预览控件条**允许换行**（实测 900 窄布局 99px、1100 宽布局 126px），但换行不得把画布压到下限以下、不得横向溢出；⑤ 页面本身不整页滚动（`scrollHeight <= innerHeight + 1`）。
  7. **不回归**：`npm run lint` + `npm test` 全绿；`test/ui-smoke.cjs` 既有断言在 GLB / IVE / FBX / OBJ 四格式上仍全绿（新增断言后同步抬高 `EXPECTED_CHECK_COUNT`）；`node scripts/memory.mjs check` 通过。
- **关联任务**：TASK-024、TASK-025、TASK-026
- **关联代码/测试**：`src/renderer.js`、`src/styles.css`、`test/ui-smoke.cjs`；ADR-011；规则 BR-034
- **确认**：待确认

### REQ-012 让 IVE 输入在所有桌面平台可用（Windows / Linux / macOS Intel+ARM）
- **状态**：已确认（闸门 ① 规格 · sunny-zhai · 2026-09-20；闸门 ② 架构 · ADR-012 · 2026-09-20。**先做 spike 再定架构**，本机可做的打包目标与平台矩阵另立 TASK-030 先行）
- **优先级**：P1
- **描述**：用户要求"不能改成支持所有系统吗"。现状：**代码侧已经平台无关**——`src/ive.js::platformDirectory()` 返回 `${process.platform}-${process.arch}`，`resolveIveHelper()` 就到 `vendor/ive2glb/<platform>-<arch>/ive2glb[.exe]` 找助手，换平台不需要改代码；真正的缺口是**只有 `darwin-arm64` 一份产物**，于是 Windows / Linux / Intel Mac 上 `.ive` 直接降级为 BR-012 的中文提示。本需求把"所有桌面平台都能转 IVE"落成可判定目标，并顺带补齐打包目标（`package.json` 目前只有 `win`）。
- **范围**：`native/ive2glb/`（若走 WASM 则在其中新增 emscripten 构建路径）、`scripts/`（构建脚本）、`vendor/ive2glb/**`（产物形态可能从"每平台一份"改为"一份 WASM"）、`package.json`（`dependencies`/`asarUnpack`/新增 `mac`、`linux` 打包目标）、`src/ive.js`（若 WASM 路线需要新的调用方式；**解析语义与世界盒口径不得改变**）、文档与台账。
  **不做**：不改 IVE 的解析语义（轴转换、贴地归心、顶点焊接、贴图内嵌的实测口径不变）；不做服务端/在线转换；不为 IVE 之外的格式扩选择器；不做代码签名与公证（macOS 分发签名是另一个议题）。
- **验收标准**（Given/When/Then）：
  1. **跨平台能力（目标）**：Given 四个目标平台 **win32-x64 / linux-x64 / darwin-arm64 / darwin-x64**，When 在各自平台执行 `app-capabilities` 并选一个 `.ive`，Then `ive: true`，且转换、预览、落盘全部成功，世界盒与参考件三轴一致（容差 0.02：`0.538 × 1.364 × 1.056`）、顶点 `11516`、三角面 `18924`。
  2. **WASM 路线（首选，前提是 spike 通过）**：助手以 **WebAssembly** 形态交付——一次构建的产物在四个平台都能跑，**包内不含任何平台相关的原生可执行文件**（`vendor/ive2glb/` 不再是必需），且不违反仓库"不按平台分发二进制"的约定（与 REQ-007/ADR-008 的 assimpjs 同一条思路）。
  3. **兜底路线（spike 不通过时）**：至少补齐 **darwin-x64（或 universal2）** 产物，并给出 win32-x64 / linux-x64 的可复现构建与自检步骤（`native/ive2glb/README.md` 已有 Windows 配方，需按实际执行结果回填）；每个平台入目录后必须通过标准 1。
  4. **打包目标可用**：`npm run dist:mac` 与 `npm run dist:linux` 能产出对应安装包（与既有 `dist:win` 并列），且**打包产物里助手可用**（WASM 资源被正确包含，或对应平台产物在 `asarUnpack` 内）——安装后 `ive: true`。
  5. **降级不回归**：任何平台在助手缺失/不可用时，仍按 BR-012 返回中文错误并列出已查找路径（不静默、不崩溃、不影响 GLB/FBX/OBJ 能力）。
  6. **spike 必须留痕（含失败）**：WASM 可行性 spike 的结论写进 ADR-012，**无论成败**都要给出证据——成功给体积/耗时/世界盒实测；失败给**具体失败点**（例如"OSG 的某模块在 emscripten 下无法链接"）与已尝试的命令，不允许只写"不可行"。
  7. **资源预算**：WASM 路线下实测并记录（a）助手产物体积、（b）单个 IVE 转换的墙钟耗时（`o-model/蹲姿.ive`，基准：darwin 助手 1.5s、全链路 ~2.5s）；（a）超 30MB 或（b）超 10s 必须在 ADR 里说明取舍，否则视为超预算。
  8. **不回归**：`npm run lint` + `npm test` 全绿；`test/ui-smoke.cjs` 在 GLB / IVE / FBX / OBJ 四格式上仍全绿；`node scripts/memory.mjs check` 通过。
- **关联任务**：TASK-027（spike，先决）、TASK-028（按结论实现）、TASK-029（文档与发布清单回填）
- **关联代码/测试**：`native/ive2glb/`、`scripts/build-ive2glb.sh`（或新增 WASM 构建脚本）、`vendor/ive2glb/**`、`package.json`、`src/ive.js`、`test/ive.test.js`、`test/ui-smoke.cjs`；ADR-012；REQ-009（可能被本需求取代部分范围）
- **确认**：待确认

## 变更记录

| 日期 | REQ | 变更 | 原因 |
| :-- | :-- | :-- | :-- |
| 2026-09-18 | REQ-005 | 新增 | 用户需要模型参数体检；目前只有转换日志一行尺寸，无法发现 accessor 盒失真等问题 |
| 2026-09-18 | REQ-003/REQ-004 | 新增（追溯登记） | 平台采纳前已交付的功能在台账中无记录，无法反映真实完成度 |
| 2026-09-18 | REQ-002 | 新增 | merge request 验收清单引用的两份基线是空模板，需落成可执行文档 |
| 2026-09-18 | REQ-001 | 新增 | 采纳 Tenon 工作流时发现文档与实现偏离，先立此需求再做校正 |
| 2026-09-18 | REQ-002 | 澄清验收标准 | 标准 2/3 原先把「通过数 / 跳过数 / 覆盖率」的快照钉进需求正文，用例集一增长即与 `TEST_PLAN.md` 不一致（REQ-002 的判据本是「文档与实测一致」）。改为以文档当次实测为准，并保留当时基线数字 |
| 2026-09-18 | REQ-005 | 澄清验收标准 | ① 标准 2 的样例集数量改为「以本地实际存在为准、用例不硬编码」（样例不入库、随本地增减，曾因硬编码 ≥20 在语料裁剪后直接失败）；② 标准 3 的原判据 `triangles === Σ(indices.count)/3` 在无非索引图元时恒等、有非索引图元时必为假，冷上下文审查判定无效，已标注替换为 `mode=4` 索引数可判定的不变量 |
| 2026-09-18 | REQ-006 | 新增 | 用户反馈界面布局"太丑"、操作不便，要求做成编辑器式；现为一列到底 + 整页滚动，3D 与体检无法并列 |
| 2026-09-20 | REQ-007 | 新增（翻案 M3 结论） | 用户要求支持 FBX/OBJ。`docs/002-requirements.md` §6 问题 4 曾判定"本期不做、留到 M3 用 assimpjs 统一多格式"，现按用户要求**提前**到本期，后端与当时推荐的 assimpjs 一致；已按 §4 完成真机 spike（FBX 18,924 面 / 3 张内嵌贴图 / 3.9s，OBJ 世界盒与参考件一致）后再立规格 |
| 2026-09-20 | REQ-008 | 新增 | `docs/002-requirements.md` M3 的两项能力（采样器规范化、贴图降采样）长期只有验收标准没有任务承载，体检能报 `NPOT_WITH_REPEAT_MIPMAP` 却修不了、发布说明自认"降采样尚未做"；连同 TASK-007 挂账的 `KHR_texture_transform.texCoord` 漏报一并立项收口 |
| 2026-09-20 | REQ-009 | 新增 | 决定 v0.1.1 暂不发布后，"等补齐 Windows 支持"必须有可核验的目标：`vendor/ive2glb` 缺 win32-x64、`dist/` 产物停留在 2026-09-15 的 0.1.0 旧包。把 Windows 助手入库、安装包重打与冒烟回填立成需求，避免"暂缓发布"变成无期限挂账 |
| 2026-09-20 | REQ-010 | 新增 | `docs/002-requirements.md` §6 问题 3 的默认口径写着"手动三态并**记住**选择"，实现只持久化布局，预览三态每次启动归零——文档承诺与实现不一致，立需求以便选择"实现它"或"改口径" |
| 2026-09-20 | REQ-011 | 新增 | 用户要求"每个区域的宽高占比固定不变、可手动调整、内部元素自适应"。REQ-006 交付的布局把三栏宽与日志高按**像素**存（`--pane-left/right/bottom`），窗口缩放只做夹取，中栏独吞增量导致占比漂移（1280→1600 宽，左栏占比 20.3%→16.3%）；这不是对既有验收标准的违约，而是**新的行为要求**，故立 REQ 并新增 ADR-011 取代 ADR-007 的"像素即用户意图"模型 |
| 2026-09-20 | REQ-005 / REQ-007 | 状态订正 | REQ-005 仍写"TASK-009 的缺陷修复待完成"（实际 `caa812e` 已修完）；REQ-007 仍写"待实现"（实际 TASK-013~016 已交付）。二者都只剩人工目视确认，按实情订正，不改写历史验证结论 |
| 2026-09-20 | REQ-008 | 交付完成 | TASK-017（采样器规范化，含体检侧逐绑定判定）、TASK-018（降采样四档 + 界面接线）、TASK-019（`KHR_texture_transform.texCoord` 覆盖，旧代码上实测 3 红 1 绿）、TASK-020（BR-031~BR-033 / TC-019~TC-021 / 管线文档回填）依次合入 `release/v0.1.1`；`npm test` 141 用例 / 137 通过 / 0 失败 / 4 跳过；冒烟四格式各 36 步 / 114 条断言 |
| 2026-09-20 | REQ-011 | 澄清验收标准 6 | 原判据写"状态栏与预览控件条**不换行**"。TASK-025 的尺寸矩阵实测：预览控件条在较窄的中栏宽度下会换行（900 窄布局 99px → 1100 宽布局 126px），这是合理且无法用"单行省略号"消除的（控件是静态按钮/输入框，不是可变文本）。判据改为"**状态栏**不换行（高度恒定）+ 预览控件条**允许换行**但不得横向溢出、不得被裁切、不得把画布压到下限以下"，并把"画布不许永远贴在下限"写成显式判据（原判据在极限占位下会恒真） |
| 2026-09-20 | REQ-005 / REQ-006 / REQ-007 | 人工目视闸门通过 | sunny-zhai 按 `docs/testing/TEST_PLAN.md` 的人工目视清单在应用内逐项核对：**M-1~M-7 全部通过**（M-8 是 Windows-only，随 REQ-009 / TASK-021、TASK-022）。三个需求状态由"进行中 / 待确认"改为"已完成"，`TASKS.md` 进度表的人工列同步改为已确认，留痕见 `docs/approvals/APPROVALS.md` |
| 2026-09-20 | REQ-012 | 新增 | 用户要求"不能改成支持所有系统吗"。核查后确认**代码本身已平台无关**（`platformDirectory()` = `${process.platform}-${process.arch}`，换平台只需产物），缺口在产物与打包目标：只有 `darwin-arm64`，GitHub 上 Windows/Linux/Intel Mac 的 `.ive` 一律降级为 BR-012 提示。首选 WASM（一次构建全平台、不按平台分发二进制，与 REQ-007/ADR-008 同思路），故先立 spike 任务 TASK-027，spike 结论决定架构（ADR-012） |
