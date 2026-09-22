# GLB 贴图修复桌面工具 Code Design

## 1. 文档元信息

```yaml
document:
  doc_id: "GLB_TEXTURE_REPAIR_TOOL_CODE_DESIGN_V1"
  project_name: "GLB贴图修复桌面工具"
  version: "0.1.0"
  status: "草稿"
  owner: "Codex"
  created_at: "2026-09-05"
  updated_at: "2026-09-06"
  baseline_srs: "无"
  target_release: "v0.1.0"
  language: "zh-CN"
```

## 2. 设计概述

### 2.1 目标

- 将发黑 GLB 的修复动作封装为本地桌面工具。
- 支持单文件和批量目录修复。
- 输出 Cesium 可直接加载的修复版 GLB。

### 2.2 范围

- 覆盖：文件选择、批量处理、修复执行、结果导出、日志展示。
- 不覆盖：Java 服务、C++ 引擎、Cesium 渲染源码改造。

### 2.3 已确认修复策略

- 将模型内嵌图片统一转为 PNG：JPEG 一律在进程内用纯 JS 解码后重新编码为 PNG，不依赖系统 ffmpeg（打包版没有）。
- 不保留 JPEG 原格式。曾实现过「JPEG 原样保留」以省掉转码膨胀，但该方案已撤销（见 `docs/cesium-glb-load-issues.md` §“JPEG 贴图”一节），当前行为是统一转 PNG；照片类贴图因此会明显变大，**控体积靠贴图降采样**（BR-032，默认不降、可选 2048/1024/512 三档）。
- 贴图采样器规范化：非 2 次幂（NPOT）贴图配 `REPEAT` + mipmap 在 WebGL1 下是非法组合，修复时按本仓既有口径退化为 `CLAMP_TO_EDGE` + `LINEAR`，**POT 与已合法的组合一字不改**（BR-031）。体检的同名问题与修复共用同一判定口径。
- 贴图槽的 UV 通道以 `KHR_texture_transform.texCoord` 覆盖为准（扩展值优先于槽位自身的 `texCoord`）：忽略它会把"实际采样 `TEXCOORD_1`"误判成 `TEXCOORD_0`，于是 `MISSING_TEXCOORD` 漏报，而漏报的后果是 Cesium 因着色器编译失败停止**整个场景**渲染（BR-033）。
- 解析 GLB 中的外部贴图 URI，在模型同级目录递归查找同名文件并嵌入输出 GLB。
- 清理 `KHR_materials_specular` 等 Cesium 不稳定扩展。
- 预览相机使用更保守的近裁剪面和更远的默认取景，降低人物模型切边。
- Cesium 预览运行时固定使用本地 `vendor/cesium/1.128`；启动命令会自动下载缺失的本地运行文件。
- 使用无边框窗口和自定义标题栏，提供最小化、最大化、关闭按钮。
- 保留 GLB 结构与可用材质信息。
- 支持 **IVE 输入**：IVE 是 OpenSceneGraph 私有格式，JS 生态没有解析器，因此由随包分发的原生助手 `ive2glb` 读取，再由 Node 侧组装为自包含 GLB，随后进入同一套修复与 Cesium 验证流程。

## 3. 模块实现设计

| 模块ID | 模块名称 | 职责 |
|---|---|---|
| MOD-001 | Electron 主进程 | 窗口创建、菜单、文件对话框、任务调度 |
| MOD-002 | 修复执行器 | 读取 GLB、修复贴图（蒙皮烘焙 / JPEG→PNG / 可选降采样 / 采样器规范化）、补全零 UV（按 `KHR_texture_transform` 覆盖的通道）、按材质合并图元、重打包输出（BR-031~BR-033） |
| MOD-003 | 批处理队列 | 单文件/目录扫描、任务串行执行、失败继续 |
| MOD-004 | 结果面板 | 展示输入、输出、大小变化、错误信息 |
| MOD-005 | IVE 读取助手（C++/OSG，两种形态） | 用 OpenSceneGraph 读取 IVE，导出 `scene.json` + `data.bin` 中间产物；不链接 Qt/Assimp/渲染模块。**形态一**为本平台原生可执行文件（`vendor/ive2glb/<platform>-<arch>/`，macOS 由 `scripts/build-ive2glb.sh` 产出）；**形态二**为跨平台 WASM（`vendor/ive2glb/wasm/`，由 `scripts/build-ive2glb-wasm.sh` / `npm run build:ive2glb:wasm` 产出，Emscripten + OSG 静态库，IVE 插件靠 `--whole-archive` 静态注册）。两者输出**逐字节相同**，见 BR-036 |
| MOD-006 | IVE→GLB 组装器（`src/ive.js`） | 解析中间产物、编码贴图、组装并写出自包含 GLB；含上轴转换、贴地归心、顶点焊接。`resolveIveHelper()` 按 BR-036 的顺序解析**开发态**助手（原生优先、WASM 回退、`asarUnpack` 优先）并把每个查过的路径记进 `searched`（去重）供 BR-012 的中文降级使用；`resolveWasmHelper()` 只解析 WASM，供原生助手起不来时回退；`report.helperKind`（解析后即写：成功=实际使用、失败=最后尝试）/ `report.warnings` 记录形态与回退原因，`shortenForError()` 保证错误串不被子进程 stderr 全文淹没 |
| MOD-007 | 模型体检（`src/inspect.js`） | 只读产出参数报告：体积、点面数、贴图规格、世界盒 vs accessor 盒及偏差倍数、中心点、上轴推断、比例尺、问题清单；NPOT × REPEAT × mipmap 按「贴图 × 采样器」逐绑定判定（`report.npotSamplerBindings`），UV 通道以 `KHR_texture_transform.texCoord` 覆盖为准且与修复同源（BR-031/BR-033）；支持 `node src/inspect.js <file.glb>` |
| MOD-008 | 世界盒与矩阵工具（`src/transform.js`） | 沿节点链累乘矩阵求世界包围盒；GLB 路径与 IVE 路径共用同一份遍历实现 |
| MOD-009 | 体检报告格式化（`src/report-format.js`） | 把 `inspect.js` 的机器报告转成界面用的中文键值行与偏差文案；纯函数，可在 `node --test` 里直接覆盖 |
| MOD-010 | 预览方向/缩放（`src/preview-transform.js`） | 把方向/缩放换算成 Cesium `modelMatrix`（列主序 16 元素）；纯函数，无 Cesium 依赖 |
| MOD-011 | 体检面板与预览控件（`src/renderer.js`/`index.html`/`styles.css`） | 编辑器式三栏 + 底部日志 + 状态栏；布局以**占比**为唯一用户意图（`layoutRatio`，BR-034）、像素由占比派生；分隔条拖拽、折叠、`ResizeObserver` → `viewer.resize()`；双列展示世界盒与 accessor 盒、偏差告警、事实行与问题清单；方向/缩放滑块只改预览矩阵并记日志 |
| MOD-012 | 多格式转换内核（`src/convert.js`） | FBX/OBJ → 自包含 GLB：assimpjs(WASM) 进程内转换、复用 `ive.js::weldVertices` 焊接三角汤、复用 `repair.js::resolveExternalImage` 内嵌外部贴图（解析不到的换 1×1 占位并记 warning）；永不抛，返回 `{status, bytes, warnings, stats}` |

### 3.1 关键规则

| 规则ID | 规则描述 | 优先级 |
|---|---|---|
| BR-001 | 以原文件同名输出修复版文件 | P0 |
| BR-002 | 图片统一为 PNG：内嵌/外部的 JPEG 一律用 `jpeg-js` 解码、`pngjs` 重编码（`encodePng`），进程内完成，不 shell out 到 ffmpeg。输出每张图都是 `mimeType: image/png`；无法解码的 JPEG 按单文件报错（`JPEG 转 PNG 失败：…`），绝不静默写坏贴图 | P0 |
| BR-003 | 发现 Cesium 兼容性扩展时移除相关扩展声明 | P0 |
| BR-004 | 批处理时单文件失败不阻断后续任务（含 `statSync`/`readGlb` 阶段就失败的非 GLB / 损坏文件） | P1 |
| BR-005 | 外部贴图支持相对路径、Windows 绝对路径和 data URI；缺失时返回文件名与恢复指引 | P0 |
| BR-006 | 材质引用了贴图但图元缺少对应 TEXCOORD_n 时，补一个全 0 的 float32 VEC2；否则 Cesium 生成的着色器编译失败会停止**整个场景**的渲染 | P0 |
| BR-007 | 图元数超过阈值（默认 100）时按材质合并图元并烘焙节点世界变换；镜像节点（世界矩阵 det<0）逐图元反转绕序。Cesium 加载耗时随图元数超线性增长，数百图元的模型实测永不返回 | P0 |
| BR-008 | IVE 输入先由 `ive2glb` 转换为临时 GLB，再进入 `repairMany`；输出仍按 BR-001 使用源 IVE 的基名，目录扫描时保留相对子目录结构（通过 `repairMany` 的 `options.entries` 传入条目，不在 `main.js` 里拍平成绝对路径） | P0 |
| BR-009 | IVE 内嵌贴图一律内嵌进输出 GLB（`bufferView` + `mimeType`），不留外部 `uri`；带 alpha 通道的贴图强制 PNG，避免 JPEG 丢透明 | P0 |
| BR-010 | OSG 的 `osg::Image` 以 OpenGL 约定（`BOTTOM_LEFT`）存放像素，编码 PNG/JPEG 前必须逐行翻转，否则贴图上下颠倒 | P0 |
| BR-011 | IVE 转换会剪掉不含任何网格的子树（典型为整棵骨骼节点树），减少 Cesium 的节点数量；`pruneMeshlessNodes: false` 可关闭 | P1 |
| BR-012 | 原生助手缺失时不得静默失败：按平台给出中文错误并列出已查找路径；界面在启动时探测能力并提示 | P0 |
| BR-013 | IVE 是 Z-up 右手系、glTF 规定 Y-up：转换必须施加 -90° 绕 X 的轴转换（`(x,y,z)→(x,z,-y)`，与 FBX2glTF 同方向）。实测判据：蹲姿转换后世界盒 `0.538 × 1.364 × 1.056`，与参考件 `model/蹲姿.glb` 三轴完全一致；未转换时为 `0.538 × 1.056 × 1.171`（Y/Z 互换） | P0 |
| BR-014 | 转换后默认把世界包围盒 `min.y` 抬到 0（贴地）、X/Z 中心归零；`ground:false` / `centerXZ:false` 可分别关闭。贴地量必须在**累乘节点矩阵后的世界盒**上求，`getPositionBounds`（accessor 并集，实测最大偏差 9 万倍）不可用于此目的 | P0 |
| BR-015 | 轴转换与归心的落地方式：节点线性部分全为单位阵时**烘焙进顶点**（POSITION 施加旋转+平移，NORMAL/TANGENT 只旋转，节点平移量跟着转轴），使 accessor min/max 与真实盒一致；一旦有节点带旋转/缩放则退化为**挂一个带转换矩阵的根节点**、不改顶点。两种模式渲染结果一致，`conversion.mode` 取 `bake` / `root` / `none` | P0 |
| BR-016 | 助手中间产物只在矩阵非单位时输出 `matrix` 字段，**从不输出 `hasMatrix`**；JS 侧判定一律以字段存在为准。曾因误用 `node.hasMatrix` 把全部节点平移丢弃，导致帽子等部件挂在身体下方（实测部件世界 Y 由 `-0.81..-0.54` 修正为 `1.06..1.36`） | P0 |
| BR-017 | 转换时**焊接顶点**（默认开，`weldVertices:false` 关闭）：IVE 几何是三角汤，只有**全部属性逐个数值相同**的顶点才归并，UV 接缝与硬边必须保留。实测蹲姿 56,772 → 11,516 顶点（-79.7%，与 FBX2glTF 参考件顶点数完全相同），面数 18,924 与贴图 3 张不变，体积 3.81 MB → 2.43 MB。合并以 `String()` 比较，-0 与 0 视为同值（轴转换会引入 -0，按位比较会白白多出顶点） | P0 |
| BR-018 | 体检必须**自算世界盒**（沿节点链累乘矩阵后重新包角点），并同时给出 accessor 并集盒与两者的偏差倍数。偏差倍数 = `max(逐轴尺寸比的最坏值, 1 + 中心偏移 ÷ 体对角线)`，> 10 倍即告警——只比尺寸会漏掉「纯平移」这种取景同样会错的情形（审查实测：整体平移 1000 时旧实现恒为 1）。**两个盒都只统计默认场景可达的网格**，否则未引用的大网格会制造假偏差。`UNREFERENCED_MESHES` 的判定必须把**默认场景**传给 `reachableMeshIndexes(nodes, scene)`——曾漏传第二个参数而恒为空集，导致任何含网格的文件都误报（本地样例 4/4），回归用例（旧代码上会红）与调用点注释已就位。实测装甲救护车 229,713 倍（尺寸比 229,713 / 偏移比 0.05）、运输车 4,461 倍、person-move 485 倍。中心偏移单独超过 1 倍体对角线时另发 `ACCESSOR_BOUNDS_OFFSET`——细长资产（如 1000×1×1 平移 8000）合并倍数可能仍 <10 而被静默放过 | P0 |
| BR-019 | 上轴只做**保守推断**并给出置信度与依据：有导出器签名（FBX2glTF/assimp/Khronos/Blender）→ Y 轴 medium；仅凭包围盒 → unknown/low 并交人工确认。绝不静默改写模型朝向 | P0 |
| BR-020 | 体检**只读**且**不抛异常**：文件不可读、非 GLB、解析失败、**结构畸形**（`meshes:[null]`、`materials:{}`、`samplers:[null]` 之类）、缺 accessor `min`/`max`、外部贴图缺失等一律转成报告里的中文问题条目（`level`/`code`/`message`），命令行退出码反映成败。分析段整体包在 try/catch 内并标记 `partial`，**元素级访问一律走 `asArray()`/可选链**（`?? []` 只兜 null/undefined，遇到 `scenes:[{nodes:5}]` 这类非数组会抛 `is not iterable`——审查实测 400 次 fuzz 中 66 次 partial 全因此）。缺 `POSITION` accessor 的 `min`/`max` 发 `POSITION_MINMAX_MISSING`；`json.scene` 越界发 `SCENE_INDEX_OUT_OF_RANGE`（与「文件里没有 scene」的 `NO_DEFAULT_SCENE` 区分）；CLI 在 `partial` 或存在 error 级问题时退非 0 | P0 |
| BR-021 | 世界盒的节点遍历与矩阵累乘在 GLB 路径与 IVE 路径之间**共用一份实现**（`src/transform.js::worldBounds`），只有局部盒来源不同（accessor `min`/`max` vs 裸 float 区段）——两处各写一遍必然漂移 | P1 |
| BR-022 | 贴图头解析**不得截断**：JPEG 的 SOF 段常位于 APP1/Exif 之后（实测某样例 APP1 段就有 3221 字节），把扫描截到 1 KB 会让样例集 62% 的内嵌贴图读不到宽高，使 NPOT 与 1×1 占位检测**静默失效**。按段长前进扫描直至 SOF；data URI 需解码前缀后同样解析。图片头必须**结构自洽**（PNG 校验 `IHDR` 标记；JPEG 校验 `SOF` 段长 = 8+3N 且 N∈{1,3,4}）且宽高在 1..65535 内，否则返回 null——只看魔数或 `mimeType` 会把垃圾字节当图片并给出荒诞宽高。仍读不出宽高时必须发 `TEXTURE_DIMENSIONS_UNKNOWN`，不得静默 | P1 |
| BR-023 | 节点「几何塌陷」用**列长度比**判定（最短列 ÷ 最长列 < 1e-6），不用 `\|det\|`：行列式是体积量纲，`\|det\| < 1e-12` 会把正常的微小均匀缩放（1e-5 → det=1e-15）误报，又会漏掉单轴压扁（det=1e-9） | P2 |
| BR-024 | 预览侧的方向/缩放/上轴修正**只作用于预览**（改 Cesium `modelMatrix`）并且**不写回任何文件**（ADR-004），日志必须记录最终矩阵；写回只能是另一个显式操作（当前不存在）。矩阵 = 均匀缩放 × 绕 Y 轴旋转，唯一例外是 ADR-002 要求由人工点一次的上轴三态：用户显式选 `Z-up → Y-up` 时先叠一层绕 X 轴 −90°（与 `src/ive.js` 的轴转换同向），**绝不由推断自动施加**。矩阵无平移分量——模型已在体检/转换阶段贴地并水平归心。日志策略：拖动（`input`）只实时改矩阵不记行，松手（`change`）与重置才各记一行，否则一次拖动会刷出几十行把"最终 `modelMatrix`"这条验收证据淹掉 | P0 |
| BR-025 | 体检面板必须**可降级**：报告残缺、字段类型错误、`inspect()` 返回 `ok:false` 或 `partial` 时，界面只显示中文占位与失败原因，**绝不抛异常、绝不渲染 `undefined`/`NaN`**，并且**不得打断 Cesium 预览**（体检与预览并行发起，互不依赖）。偏差的**配色与文案必须同档**：`deviationLevel` 为 `ok`（<10 倍）时文案只能说"未到告警门槛"，不得写"会错位"——**包括只有总量、没有 `deviationParts` 的兜底分支**（冷审实测这一支曾漏判）；文案只对报告**实际给出**的分量下判断，缺一个分量时既不替它编数字、也不把"两个盒一致"的结论推广过去；`min > max` 的畸形盒尺寸与中心都给占位符而不是负尺寸/无意义中心 | P1 |
| BR-026 | 预览渲染**不得被后台节流卡住**：窗口被遮挡/在后台时页面若被判为 hidden，`requestAnimationFrame` 几乎不跑，Cesium 一帧都不渲染（实测渲染帧计数 `scene.frameState.frameNumber` 停在 0、`resourcesLoaded` 仍为 false；注意 `scene.frameNumber` 在 1.128 里并不存在），「置 `_ready` 并发 `readyEvent`」的 `afterRender` 回调于是永不执行——`validateModel` 会一直挂在等就绪上：`#validationStatus` 永远停在「正在加载…」，包围盒诊断与默认取景也都不跑。因此 `BrowserWindow` 必须 `backgroundThrottling: false`（桌面工具无省电必要），且 `waitForModelReady` 必须带超时并把超时结果与「已加载」**在状态与日志上区分开**（「已创建模型，但当前未渲染…」），否则窗口仍不可见时会被假绿。超时后**保留** ready 监听，等窗口恢复真的渲染出第一帧时补跑诊断与取景（否则画面会停在按 accessor 盒回退的错误取景上）。代价：`backgroundThrottling: false` 叠加 `requestRenderMode: false` 会在窗口被遮挡/最小化时持续出帧（桌面工具可接受的 CPU/电量开销，换成 `requestRenderMode: true` 需要把所有 `appendLog`/取景路径都补 `requestRender`，不在本期范围） | P1 |
| BR-027 | 主界面为**编辑器式三栏 + 底部日志**：页面本身不得整页滚动（`document.scrollingElement.scrollHeight <= innerHeight + 1`），滚动只发生在面板内部；各栏有最小尺寸、分隔条可拖拽，布局状态以**占比**写 `localStorage`（见 BR-034）并在读取时按比例夹取；**3D 容器尺寸变化必须调 `viewer.resize()`**（Cesium 只监听 window resize，分隔条拖动它感知不到，不处理会被拉伸/裁剪），并节流到下一帧；窄窗口（<1100px）降级为两栏 + 右栏抽屉，不得出现横向滚动 | P1 |
| BR-028 | 栏位尺寸与**内容解耦**（ADR-007）：面板宽高只由**用户操作**与**窗口尺寸**决定，任何内容/临时面板都不得改变它——① 高度预算不得读入随内容变化的实时高度（模型信息行固定单行省略号 + `title`，帮助面板限高且**不参与预算**）；② **用户意图与生效值分离**：`layoutRatio`（唯一落盘对象，单位是**占比**，见 BR-034）是用户设定的比例，`layout` 是当前窗口下由比例派生的**生效像素**（仅用于渲染），窗口缩放/跨窄断点等非用户事件只 `refitLayout()` 重算像素、**绝不落盘**，故窗口恢复后用户比例自行回来；③ 中栏网格必须显式 `grid-template-columns: minmax(0, 1fr)`，否则 nowrap 内容会把列撑开（实测 2994px）。**反例（修复前实测）**：超长模型路径让预览条 126→189px，重算时把日志从 380px 夹到 290px **并写进 `localStorage`**，换回短路径也不恢复 | P1 |
| BR-029 | 滚动条**自绘细条**，且每个区域**只留最外层一个滚动容器**：① 全局用 `::-webkit-scrollbar`（8px 轨道 + 2px 透明描边内缩 = 视觉 4px 圆角细条）替代系统默认样式，**不得同时写标准属性** `scrollbar-width`/`scrollbar-color`——Chromium 121+ 只要看到标准属性就会**整体忽略** webkit 伪元素，两个都写等于没写；② 滚动职责按区域唯一化：左栏与右栏**只有 `.pane-body` 可滚**（`.list`、`.inspect-issues` 等**不得**自带 `max-height` + `overflow` 自成滚动条），日志区只有 `.log` 可滚（父级 `.pane-body` 已 `overflow: hidden`），帮助面板限高自滚但它是独立网格行、不与其它滚动容器嵌套。**反例（修复前实测）**：左栏一个面板里同时存在 `.pane-body` + `#inputList` + `#resultList` **三个**滚动条，右栏 `.pane-body` 内还嵌 `#inspectIssues` 第二层 | P2 |
| BR-030 | 多格式输入（FBX/OBJ）的转换口径（ADR-008）：① 用 **assimpjs(WASM)** 在进程内转换，**不引入外部可执行程序**、不按平台分发二进制；② 产物必须**自包含**——`images[].uri` 一律内嵌（OBJ 的贴图 assimp 只写 uri 不内嵌，连相对路径也如此，必须在转换阶段用 `resolveExternalImage` 补齐）；③ 解析不到的贴图**不得静默丢**：换 1×1 占位并留 `missing:<原始 uri>` 名字 + warning，日志与体检都要能看到原始路径；④ 三角汤必须焊接（复用 `ive.js::weldVertices`，键覆盖全部属性含 JOINTS/WEIGHTS），**面数与贴图不得改变**；⑤ 同名不同扩展名的源（`蹲姿.fbx` + `蹲姿.obj`、`蹲姿.ive` + `蹲姿.glb`）转换后会同名，必须按源扩展名区分，否则临时文件与输出双双互相覆盖而两条都报成功。**跨平台 IVE（BR-036）沿用本条的"一次构建、不按平台分发二进制"思路**：assimpjs 与 ive2glb-WASM 是同一套交付哲学 | P1 |
| BR-031 | 贴图采样器规范化（ADR-009，REQ-008）：贴图任一维非 2 次幂、且采样器同时 `REPEAT`（wrapS 或 wrapT）与 mipmap（minFilter ∈ 9984..9987）时，退化为 `CLAMP_TO_EDGE` + `LINEAR`——与 `src/ive.js` 的 NPOT 规则、`inspect.js` 该问题的既有中文提示同一口径，同一工具的两条路径不允许给出不同结果。判定粒度是**「贴图维度 × 采样器」逐个绑定**：① 采样器独占时原地改，被 POT 贴图**共用时必须复制**一份退化采样器（原位改会误伤合法贴图）；② POT 贴图与已合法组合**一个字段都不改**；③ `texture.sampler` 缺省、或写了采样器却漏写 `minFilter` 时，按 glTF 规范默认（`REPEAT` + `LINEAR_MIPMAP_LINEAR`）判定为非法并**新建**显式采样器；④ 同形退化采样器复用去重。体检侧的 `NPOT_WITH_REPEAT_MIPMAP` 必须用同一口径（旧实现是"文件里有 NPOT 图像"×"文件里有 REPEAT+mipmap 采样器"两条独立事实相乘，**既误报**——REPEAT+mipmap 属于另一张 POT 贴图，**也漏报**——`samplers` 为空时整条检查被跳过），结构化证据见 `report.npotSamplerBindings`。修复报告给出 `samplersNormalized` / `samplersCloned` | P1 |
| BR-032 | 贴图降采样（ADR-009，REQ-008）：① **默认不降**（`maxTextureSize` 缺省/0/非法一律按不降），可选 2048/1024/512——画质是有损且不可逆的决定，由用户显式开启；② 按最长边等比缩小并取整（`Math.round`，至少 1 像素：3000×1000 + 1024 → 1024×341），用**面积加权的盒式平均**而不是最近邻抽样，透明像素**先按 alpha 预乘再平均**（否则透明边缘会把颜色拉黑）；③ 只改贴图字节——几何 bufferView（POSITION/NORMAL/TANGENT/TEXCOORD/索引）与 accessor `min`/`max` 必须逐字节不变，外部 `uri` 贴图同样参与且落盘的是缩小后的字节；④ 管线顺序固定为**「贴图内嵌（PNG）→ 降采样 → 采样器规范化」**——降采样可能把 POT 变成 NPOT，采样器判定必须用最终宽高（顺序颠倒时该组合必然漏网，`test/repair.test.js` 有专门的顺序证明用例）；⑤ 不引入 `sharp`/`canvas` 等原生依赖，用已在 `dependencies` 的 `pngjs`；⑥ 报告给出 `maxTextureSize` / `texturesDownsampled` / `textureBytesBefore` / `textureBytesAfter`（字节对比只量"贴图归一化后 → 降采样后"，不把 BR-002 的 PNG 膨胀算到降采样头上），「不降」时两个字节数相等，是"未降采样"的明确陈述而不是静默省略 | P1 |
| BR-033 | 贴图槽的 UV 通道判定（REQ-008）：`KHR_texture_transform` 挂在 textureInfo 上，其 `texCoord` **覆盖**槽位自身的 `texCoord`（glTF 规范：扩展值优先）。判定统一走 `src/repair.js` 导出的 `textureTexCoordOf(reference)`，`src/inspect.js` 直接 require 它（inspect 本就依赖 repair；反向 require 会成环）——体检与修复**不允许有第二套口径**。`MISSING_TEXCOORD` 的文案必须**点名缺失语义**（如「缺 TEXCOORD_1」）：旧文案只写「缺少对应 TEXCOORD_n」，用户会去补错的通道；漏报的后果是 Cesium 因缺 varying 让着色器编译失败并停止整个场景渲染 | P1 |
| BR-034 | 布局以**占比**为用户意图、像素只是派生物（ADR-011，REQ-011）：① `layoutRatio`（左/右栏各占**可用宽度**、底部占**可用高度**）是唯一落盘对象（`localStorage` 键 `glb-repair.layout`，`version: 2`），`layout`（像素）由 `ratioToPixels(占比, 可用空间)` 派生——可用空间 = `appShell.clientWidth − 8`（两条 4px 分隔条）× `appShell.clientHeight`，**不是 `window.innerHeight`**（会差一条自定义标题栏，实测 757 vs 800）；② 拖拽仍按像素跟手，落盘前经 `ratioFromPixels` 换算回占比；窗口缩放只 `refitLayout()` 重算像素，**不改占比也不落盘**；③ 像素上限（旧 480/560/560）改为**比例上限**（左 0.40 / 右 0.45 / 底 0.60），比例下限（0.06/0.07/0.06）刻意低于像素下限对应的比例，保证"拖到底"仍能到 90/180/220px（0.12 × 757 = 91 > 90 曾把日志卡住）；④ 夹取规则确定：先按公共因子整体压缩以满足中栏最小宽度与"中栏最宽"，再按最小尺寸依次触底，任何情况下不得整页滚动；⑤ `version: 1` 的像素载荷按当前窗口迁移成占比并**立即回写 v2**。**反例（修复前实测）**：窗口 1280×800 → 1920×1200 时左栏占比 20.44% → 13.60%、右栏 26.73% → 17.78%、中栏 52.83% → 68.62%、底部 26.46% → 17.30% | P1 |
| BR-035 | 预览修正的**记忆**（REQ-010）：上轴三态/方向/缩放只记**用户显式选过**的值——`localStorage` 键 `glb-repair.preview`（`version: 1`，`{yawDeg, scale, axis}`），只在控件的 `change`（松手/选完）与「重置预览修正」按钮上写入，拖动过程的 `input` 不写；**"从未动过"与"显式选了 auto"必须可区分**（前者不写键，后者写 `axis: 'auto'`）。启动与新模型加载时都用 `clampPreview` 规整后摆回控件（坏 JSON / 越界值 / 未知档位回落合法区间，绝不抛异常），并在日志里说明「已沿用上次选择」；记忆只影响预览，**绝不写回文件**（ADR-004/BR-024 不变） | P2 |
| BR-036 | 跨平台 IVE 的**交付口径**（REQ-012，ADR-012）：① **发布形态只有 WASM**——`package.json` 的 `files`/`asarUnpack` 只放 `vendor/ive2glb/wasm/**`，安装包内**不含**任何平台相关的原生助手可执行文件（这就是 REQ-012 标准 2 的判据；TASK-031 修正：原先的通配 `vendor/ive2glb/**` 会把 11 MB 的 `darwin-arm64/` 打进**每一个**平台的包，实测 `find … -name 'ive2glb*'` 在真实 macOS 包上确实命中了它）。原生助手只留仓库，供开发态与"原生↔WASM 逐字节等价"用例使用，**不进安装包**；② **开发态的解析顺序**是原生优先、WASM 回退，这不是交付形态的优先级：`GLB_REPAIR_IVE2GLB`（指向 `.js` 时按 WASM 处理）→ `<platform>-<arch>/ive2glb[.exe]` → `wasm/ive2glb.js`；本机已实测两种形态产出**逐字节相同**，保留原生只是沿用既有已验证路径与更快启动；③ 原生助手**文件在、却起不来**（未签名 / 被隔离 / 部分解包 / 权限不足）时**回退 WASM** 而不是丢掉 IVE 能力：`report.helperKind` **在解析后即写入**——成功时是实际使用的形态，失败时是**最后尝试**的形态（`native`/`wasm`，错误路径不再是 `undefined`，TASK-032）；两条路都失败时，错误串同时带上原生失败原因，并把超长 stderr 经 `shortenForError` **截断+标注**（冷审实测过 `report.error` 被塞进 65,792 字符的 stderr 全文）；`report.warnings` 记一条中文说明；助手真的跑起来并报转换失败则**原样抛出**，不掩盖真实错误；④ **`app.asar.unpacked` 必须先于 `app.asar`**——asar 内的文件 `statSync` 能成功但**不能被执行**（`spawnSync` 报 `ENOTDIR`），顺序写反会让打包后的 IVE 转换整体失效；`.wasm` 与 `.js` 必须**成对存在**才算可用（避免"起得来但读不到模块"的假可用）；⑤ WASM 助手必须由 Node 起进程（打包态是 Electron 的 Node，经 `ELECTRON_RUN_AS_NODE=1`，已在 Electron 32.3.3 / Node 20.18.1 实测）；产物 **2.79 MB**、**起助手**约 **102 ms**（`convertIveToGlb` 全链路实测 0.55~0.65 s，预算 10 s），`searched` 逐条列出且**不重复**（BR-012 的中文降级靠它照做）；⑥ 任何平台缺助手时一律按 **BR-012** 返回中文错误并列出已查找路径，**不得静默、不得崩溃、不影响 GLB/FBX/OBJ 能力** | P1 |

## 4. 接口设计

### 4.1 本地接口

| 接口ID | 提供方 | 调用方 | 说明 |
|---|---|---|---|
| API-IN-001 | 主进程 | 渲染进程 | 选择目录、启动修复、返回进度 |
| API-IN-002 | 主进程 | 渲染进程 | `inspect-glb`：对单个 GLB（`.ive` 先转临时 GLB）跑体检并返回报告。**永不 reject**——成功 `{ ok: true, filePath, sourcePath, report }`，失败 `{ ok: false, filePath, error }`（中文原因），因此体检失败不会连带打断 Cesium 预览 |

#### 4.1.1 批处理进度事件

渲染进程通过 `repairApp.onRepairProgress(callback)` 订阅 `repair-progress` 通道；主进程在
`repair-glb` handler 内把 `repairMany` 的 `options.onProgress` 事件原样转发给发起调用的 `event.sender`。

`repairMany(inputPaths, outputDir, options)` 因此是 **async**（每处理完一个文件 `await setImmediate`，
让主进程回到事件循环，进度事件才能及时送达渲染进程），`options.onProgress` 不会透传给 `repairGlbFile`。

| phase | 载荷字段 | 渲染进程行为 |
|---|---|---|
| `scanning` | — | 显示「正在扫描输入」，进度未知 |
| `start` | `total` | 显示总数；`total === 0` 时提示未找到 GLB |
| `file-start` | `index`, `total`, `relativePath` | 进度文字「正在修复：<文件>」，进度条按 `index` 推进，日志记一行 `[i/total] 修复中：<文件>` |
| `file-done` | `completed`, `total`, `relativePath`, `status`, `error` | 进度条按 `completed` 推进，全部完成时进度条转绿 |
| `convert-start` | `index`, `total`, `relativePath` | 主进程侧事件，表示正在把 IVE 转换为 GLB；进度文字「正在把 IVE 转换为 GLB：<文件>」 |
| `convert-done` | `index`, `total`, `relativePath`, `status`, `error`, `newBytes`, `images`, `meshes`, `prunedNodes`, `axis`, `worldSize`, `vertices`, `verticesBefore`, `triangles` | 成功时日志记录转换体积、贴图数、网格数、剪掉的空节点数、坐标转换方式、**世界包围盒尺寸（米）**与**顶点/三角面数（含焊接前对比）**；失败时按错误样式记录原因 |
| `done` | `completed`, `total`, `failed` | 汇总「成功 N 个，失败 M 个」 |

`convert-*` 是 IVE 专属阶段：主进程先用 `collectGlbEntries(inputPaths, ['.glb', '.ive'])` 扫描，
把 IVE 逐个转换成临时 GLB，并把条目的 `relativePath` 从 `.ive` 换成 `.glb`，最后通过
`repairMany(..., { entries })` 把「原有 GLB 条目 + 转换后的条目」一次性交给修复管线。
`options.entries` 让 `repairMany` 跳过自身的目录扫描：既避免重复遍历，也保住目录扫描得到的
相对子目录结构（否则把条目拍平成绝对路径再传回去，`nested/x.glb` 会落到输出根目录）。
IVE 结果因此同样经历贴图归一化、蒙皮烘焙与图元合并。临时目录在 `finally` 中删除。

进度回调异常会被 `repairMany` 吞掉（`emitProgress` 内 try/catch），不影响批量修复本身。

### 4.2 输入输出

```yaml
input:
  format: ["glb", "ive"]
  mode: ["single", "batch"]
output:
  format: ["glb", "json"]
  artifacts:
    - repaired_glb
    - repair_report
```

### 4.3 原生助手接口

`ive2glb <input.ive> <output-dir>` 在 stdout 打印一行 JSON：

```json
{"status":"success","error":"","images":3,"materials":3,"meshes":3,"nodes":72,"warnings":0,"binBytes":28782480}
```

失败时 `status` 为 `error`、`error` 为中文原因、退出码非 0。中间产物为
`<output-dir>/scene.json`（节点树、材质、贴图元信息、访问器字节区间）与 `<output-dir>/data.bin`
（顶点、索引与原始像素缓冲）。`src/ive.js` 只依赖这两个文件，不解析 IVE 二进制本身。

#### 4.3.1 分发与自包含

`vendor/ive2glb/<platform>-<arch>/` 下随包分发可执行文件、`lib/`（OSG 动态库与 fontconfig/freetype 等）
与 `osgPlugins/`（`osgdb_ive.so`、`osgdb_serializers_osg.so`）。助手启动时把自带的 `osgPlugins`
**插到插件搜索列表最前**，否则会命中 OSG 编译期内置路径（开发机上的 Homebrew 安装）。
macOS 上 `install_name_tool` 会破坏原签名，脚本随后统一做 ad-hoc 重签，否则 arm64 会直接被杀。

打包时 `package.json` 的 `build.asarUnpack` 必须包含 `vendor/ive2glb/**`，因为 asar 内的文件无法执行。
`src/ive.js::resolveIveHelper()` 按下面的顺序解析助手，并把每个查过的路径都记进 `searched`
（缺助手时 `convertIveToGlb` 返回 `status: error`，中文信息里列出这些路径，见 BR-012）：

1. `GLB_REPAIR_IVE2GLB` 环境变量；指向 `.js` 时按 WASM 助手处理；
2. `<root>/<platform>-<arch>/ive2glb[.exe]`（本平台原生助手）；
3. `<root>/wasm/ive2glb.js` + 同名 `ive2glb.wasm`（跨平台 WASM 助手，两者必须成对存在）。

`<root>` 先取 `app.asar.unpacked/vendor/ive2glb`，再取 `vendor/ive2glb`；开发态两者是同一个路径，
只查一次。**顺序不能反过来**：`asarUnpack` 的文件在 asar 索引里仍然可见、`fs.statSync` 也会成功，
但 asar 内的文件不能被 `spawnSync` 执行（报 `ENOTDIR`），asar 优先会让打包后的 IVE 转换整体失效。
WASM 助手是 `.js`，必须由 Node 起进程（打包态是 Electron 的 Node，需 `ELECTRON_RUN_AS_NODE=1`），
因此 win32-x64 / linux-x64 / darwin-x64 不再需要各自的预编译助手（REQ-012 / ADR-012）。
构建入口：`npm run build:ive2glb:wasm`（产物落在 `vendor/ive2glb/wasm/`，实测 2.79 MB、单文件约 102 ms）。

## 5. 数据设计

### 5.1 修复报告

```json
{
  "inputPath": "",
  "outputPath": "",
  "oldBytes": 0,
  "newBytes": 0,
  "imagesConverted": 0,
  "skinnedMeshesBaked": 0,
  "externalImagesEmbedded": 0,
  "texCoordsFilled": 0,
  "primitivesMerged": 0,
  "samplersNormalized": 0,
  "samplersCloned": 0,
  "maxTextureSize": 0,
  "texturesDownsampled": 0,
  "textureBytesBefore": 0,
  "textureBytesAfter": 0,
  "extensionsRemoved": [],
  "status": "success"
}
```

字段取自 `src/repair.js` 的实际返回对象；失败分支把计数字段归零并给出中文 `error`。注意**没有** `imagesKeptJpeg`——「保留 JPEG」方案撤销后该字段一并移除（见 BR-002）。`samplersNormalized` / `samplersCloned` 见 BR-031；`maxTextureSize` / `texturesDownsampled` / `textureBytesBefore` / `textureBytesAfter` 见 BR-032（档位为 0 时后两者相等，表示未降采样）。`textureBytes*` 与 `src/inspect.js` **无关**：体检报告里有 `report.images[].bytes` 逐张给出贴图字节，但**没有**汇总的 `textureBytes` 字段（`docs/002-requirements.md` §3 曾把它列为报告字段，2026-09-20 已按实情注明）。

## 6. 测试要点

1. 用三个样本模型验证转码后 Cesium 不再黑贴图。
2. 验证批处理任务能连续处理多个文件。
3. 验证失败样本只报错不中断队列（`repairMany` 跳过损坏文件后仍继续，`done.failed` 计数正确）。
4. 验证批处理过程中进度条按 `completed/total` 推进，且日志逐条记录当前修复的文件名。
5. 验证输出文件可直接替换原模型。
6. 验证材质引用贴图但图元缺 TEXCOORD 时补全零 UV，且 Cesium 不再出现 `Fragment shader failed to compile`。
7. 验证图元数超阈值时按材质合并（含镜像节点的绕序反转与世界变换烘焙），合并后大模型能在数秒内于 Cesium 加载完成。
8. 验证带 JPEG 贴图的模型（内嵌与外部各一）修复后 `mimeType` 为 `image/png`、内容以 PNG 签名开头，且 `imagesConverted` 计数正确；接口上已无 `keepJpeg`/`imagesKeptJpeg`，传入旧参数也不改变行为。
9. 验证无法解码的 JPEG（如只有 SOF 头、无扫描数据的四分量样本）按单文件报错并匹配 `JPEG 转 PNG 失败`，不会产出坏贴图。
10. 验证 IVE 转换产出的 GLB 结构合法：3 个网格、3 张内嵌贴图（无外部 `uri`、图片 `bufferView` 不带 `target`）、每个 POSITION accessor 都带 `min`/`max`、索引数为 3 的倍数。
11. 验证贴图方向：`readImagePixels` 对 `BOTTOM_LEFT` 输入逐行翻转、对 `TOP_LEFT` 原样保留；端到端可用参考 JPG 首行比对（翻转错误时首行误差从 0.5 量级跳到 30 以上）。
12. 验证 IVE 转换产物可直接进入 `repairGlbFile` 且 `status: success`。
13. 验证 `pruneMeshlessSubtrees` 只保留含网格的子树并正确重映射 children 索引。
14. 验证助手缺失、输入非 IVE、源文件不存在时都返回中文错误而不是抛异常。
15. 验证打包后 `vendor/ive2glb` 不引用开发机路径：`DYLD_PRINT_LIBRARIES=1` 下从 Homebrew 加载的库数为 0。
16. 验证采样器规范化（BR-031）：NPOT(512×341) + `REPEAT` + `9987` 修复后变成 `CLAMP_TO_EDGE` + `9729` 且体检不再报；POT(256×256) 与已合法的 NPOT 采样器 **JSON 逐字段不变**；采样器被 POT 贴图共用时**复制**一份退化采样器（原采样器仍是 `REPEAT+9987`）；缺省采样器与漏写 `minFilter` 两种情况都会新建显式采样器（旧口径漏报）；体检侧"REPEAT+mipmap 属于另一张 POT 贴图"不得误报（旧口径误报）。
17. 验证贴图降采样（BR-032）：2048² → 1024² 逐像素等于 2×2 盒式平均（期望值由解码后的源像素独立算出）；3000×1000 + 1024 → 1024×341；不传/`0`/负数都不降且贴图字节逐字节不变；几何 bufferView 与 accessor `min`/`max` 不变；外部 `uri` 贴图落盘的是缩小后的字节；降采样造出 NPOT 时采样器在同一趟被退化（顺序证明）；`model/person-stand.glb` 本地基线 14.31MB（不降）→ 4.95MB（1024，2 张）→ 1.86MB（512，3 张），贴图张数与几何统计不变。
18. 验证 `KHR_texture_transform.texCoord` 覆盖（BR-033）：图元有 `TEXCOORD_0`、扩展以 `texCoord: 1` 采样时，体检必须报 `MISSING_TEXCOORD` 且**点名 `TEXCOORD_1`**，修复必须补出全零 `VEC2` 的 `TEXCOORD_1`（而不是 `TEXCOORD_0`）；去掉扩展覆盖的对照组不得报。这 4 条用例在改动前的代码上实测 **3 红 1 绿**（绿的是对照）。
19. 验证布局占比不随窗口漂移（BR-034）：同一组拖拽结果在 1100×760 / 1440×900 / 1920×1200 三档下，各区占可用宽高的百分比与 1280×800 参照相比变化 ≤ 1 个百分点；窗口缩放**不得改写**落盘的占比载荷；占比重算后中栏仍是最宽的一栏；夹取到极限（880×640）再恢复到 1600×900 后占比回到设定值；`version:1` 像素载荷迁移成 `version:2` 占比且像素还原 ±1px。**旧实现（像素模型）上这些断言实测为红**：1280×800 → 1920×1200 时左 20.44%→13.60%、右 26.73%→17.78%、中 52.83%→68.62%、底 26.46%→17.30%。
20. 验证内部元素在多尺寸下自适应（REQ-011 标准 6）：900×700 / 1100×760 / 1280×800 / 1440×900 / 1920×1200 五档下每区恰好一个滚动容器（左/右/日志各 1、中栏 0）、无横向溢出、3D 画布 ≥ `CANVAS_MIN_HEIGHT` 且窗口足够大时明显高于下限、状态栏高度恒定、预览条允许换行但不得溢出、页面不整页滚动。
21. 验证预览三态记忆（BR-035）：从未动过控件时**不写** `glb-repair.preview`（默认 auto/0°/1.00×）；显式设成 `Z-up / 90° / 2×` 后重载，控件复原且日志出现「已沿用上次选择」；显式选回 `auto` 后重载仍是 `auto`（记录存在，不被当成"从未选过"）；坏 JSON 与越界/未知档位载荷都回落合法区间且不抛异常；输入文件 `shasum` 前后一致（记忆只影响预览，不写回文件）。
22. 验证跨平台 IVE 交付口径（BR-036）：① `GLB_REPAIR_IVE2GLB` 指向 `.js` 时解析为 WASM 助手（`command === process.execPath`），指向无效路径时回退到内置路径且该路径仍在 `searched` 里；② 只有 `.js` 没有配对 `.wasm` 时**不算可用**；③ WASM 与原生助手在同一输入上的 `worldSize`/`worldCenter`/`vertices`/`verticesBefore`/`triangles`/`axisMode` 全部相等且**产物逐字节相同**（`o-model/蹲姿.ive`，`11516` / `18924` / `0.538×1.364×1.056`）；④ `vendorRootsFor()` 对 asar 路径必须返回 `app.asar.unpacked` 在前、开发态只返回一个根目录；⑤ 把 `src/` 复制到没有 `vendor/` 的临时根下时 `available === false`，中文降级信息含两个构建脚本名并**逐条列出** `searched`；⑥ 打包后（`electron-builder --mac --dir`）在应用内 `convertIveToGlb('o-model/蹲姿.ive')` 成功，且强制 WASM 助手时产物与原生路径逐字节相同；⑦ **打包只带 WASM**（标准 2）：`package.json` 的 `files`/`asarUnpack` 里所有 `vendor/ive2glb` 条目都必须限定在 `wasm/` 下，安装包内不得出现 `darwin-arm64/` 之类的原生助手；⑧ **原生助手起不来时回退 WASM**：把覆盖值指向一个存在但不可执行的文件（EACCES，等价于未签名/被隔离/部分解包），转换仍 `success`、`helperKind === 'wasm'`、`warnings` 含「已回退到 WASM 助手」；⑨ `searched` 去重（同一候选被查两次时只记一次）；⑩ `electron-builder` 元数据齐备（`author.email` 或 `linux.maintainer` + `homepage`），否则 `dist:linux` 的 deb 目标会因 `authorEmailIsMissed` 中止（标准 4）。

## 7. 交付物

- Electron 桌面应用源码
- 修复脚本封装
- 样本模型验证集
- 修复报告导出

## 8. 已拷贝参考文件

- `refs/scripts/repair-casualty-glb-textures.cjs`
- `refs/scripts/normalize-casualty-glb.cjs`
- `refs/models/person-stand.glb`
- `refs/models/person-move.glb`
- `refs/models/蹲姿.glb`
