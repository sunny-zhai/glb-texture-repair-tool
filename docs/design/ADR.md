# 架构决策记录（ADR）

> 追加式记录，**禁止改写历史**；被推翻时新增 ADR 并在旧条目注明"被 ADR-XXX 取代"。
> 每涉及架构/接口/数据模型变更，需经人工确认闸门 ②（架构闸门）。

以下 4 条为 REQ-005（模型体检）的设计决策。状态为**提议**是因为闸门 ② 的人工确认尚未留痕；
其中 ADR-001～003 的实现已随 TASK-007 落地（可执行证据见各条"验证方式"），ADR-004 待 TASK-008。

## ADR-001 体检必须自算世界盒，并把 accessor 盒与偏差倍数一并上报

- **日期**：2026-09-18
- **状态**：已采纳（闸门 ② 架构 · sunny-zhai · 2026-09-18）
- **关联需求**：REQ-005
- **背景/问题**：glTF 的 accessor `min`/`max` 只描述顶点数据本身，**不含节点变换**。工具此前的 `getPositionBounds()` 直接并集所有 POSITION 的 min/max，实测在真实资产上偏差极大：`装甲救护车` 报 **801,146 × 265,331 × 546,442**（真实 `3.49 × 3.92 × 8.95`，偏差 229,713 倍），`运输车` 偏差 4,461 倍。用户"模型看着对、摆进去不对"的困惑多半源于此。约束：不得引入第三方 glTF 库（仓库原则），不得为体检解码顶点数据（性能）。
- **决策**：体检**自己**沿节点链累乘矩阵、把每个网格局部盒的 8 个角变换到世界空间后重新求轴对齐盒，作为 `bounds.world`；同时**照样计算** accessor 并集盒作为 `bounds.accessorUnion`，并用 `deviationFactor`（三轴中最坏的一轴比值）量化两者差异，> 10 倍即告警。
- **理由**：只报世界盒会让"取景为什么会错"无从诊断——偏差倍数才是可行动的指标（既解释现象，又能作为修复前后的回归判据）。用 accessor min/max 求局部盒（而非解码顶点）让 174,937 顶点的模型也能毫秒级完成。
- **后果**：正面——取景与体检都基于真实包围盒；偏差成为可断言的数字。**代价与风险**：每次体检多走一遍场景图（O(节点 × 8)，实测最慢 11 ms，可接受）；当文件里存在**非均匀缩放或旋转**时，accessor 盒与世界盒的比值本身会随朝向变化，`deviationFactor` 只是一个标量近似，不能反推出"该乘以多少"。
- **替代方案**：① 只报世界盒（否决：无法诊断取景问题）；② 解码顶点算精确盒（否决：大模型代价高，且 accessor min/max 已是权威数据）；③ 引入 three.js 之类的库（否决：违反仓库"无第三方 glTF 库"原则，且为这一个功能引入过重依赖）。
- **影响面**：新增 `src/transform.js`（`worldBounds`/`accessorUnionBounds`/`deviationFactor`）；`src/ive.js` 的贴地归心继续用它求盒；测试 `test/inspect.test.js`；文档 `docs/001-code-design.md` BR-018。
- **验证方式**：`node src/inspect.js o-model/运输车.glb` → 世界盒 `2.59 × 4.10 × 5.98`、偏差 `4461.888`；`node --test test/inspect.test.js` 中「报告世界盒而非 accessor 盒，并按倍数告警」用例用合成 GLB 断言 1000³ → 1³ 的换算与告警。

## ADR-002 上轴只做保守推断并给出置信度，绝不静默改写

- **日期**：2026-09-18
- **状态**：已采纳（闸门 ② 架构 · sunny-zhai · 2026-09-18；**TASK-008 已实现界面上的上轴三态**：`auto` / `Y-up` / `Z-up → Y-up`，只在预览里叠加 `Rx(−90°)`，仍不写回）
- **关联需求**：REQ-005（并落实 `docs/002-requirements.md` §6 问题 3 的采纳默认值）
- **背景/问题**：用户要"默认方向修改"。IVE 是 Z-up、glTF 是 Y-up，转换时已按 `-90°` 绕 X 处理；但对**任意**输入的 GLB，从包围盒**无法**可靠判定上轴——本项目在分析阶段就栽过：用"最长轴/最短轴"的朴素启发式把俯卧人物与 M1A2 误判为 Z-up。误判的代价极高：模型在 Cesium 中被转成躺倒或倒立，而用户很难归因。
- **决策**：只做两级保守推断——(a) 生成器签名命中 `FBX2glTF`/`assimp`/`Khronos`/`Blender` → 判 `Y`，置信度 `medium`；(b) 否则返回 `unknown` + 置信度 `low`，把三轴尺寸作为依据写进理由，并产生 `UP_AXIS_UNCERTAIN` 问题条目交给人工。**任何情况下都不自动改写模型朝向。**
- **理由**："不确定就说不确定"比"猜一个看起来合理的"便宜得多：错误朝向需要人去排查，而 `unknown` 只需人点一次三态选择。
- **后果**：正面——不会产出方向错误且难以察觉的资产；体检报告对方向问题诚实。**代价与风险**：多数自研导出链（含本工具的 IVE 转换产物）没有可识别签名，会落到 `unknown`，人工负担转移到界面上（这也是 TASK-008 要提供手动三态的原因）；置信度 `medium` 仍可能错（生成器签名不等于实际数据一定守约定）。
- **替代方案**：① 用几何启发式猜（否决：实测会误判人物与车辆）；② 默认 Y-up 且不提示（否决：正是"看着对、摆进去不对"的来源）。
- **影响面**：`src/inspect.js::guessUpAxis`；界面需提供手动三态（TASK-008）；`docs/002-requirements.md` §6 问题 3 的默认值据此落地。
- **验证方式**：`node --test test/inspect.test.js` 的「`guessUpAxis` 有导出器签名时给 Y 轴中等置信度，否则不下结论」用例；`node src/inspect.js o-model/运输车.glb` 输出 `unknown（low）` 而不是猜测值；界面侧（TASK-008）：`node --test test/preview-transform.test.js` 断言只有 `axis: 'z'` 才叠加 `Rx(−90°)`、`auto`/`y` 得到单位矩阵、非法值退回 `auto`，`test/ui-smoke.cjs` 断言选 `Z-up` 后日志矩阵等于 `Rx(−90°)∘Ry(yaw)∘scale`。

## ADR-003 世界盒遍历在 GLB 与 IVE 两条路径间共用一份实现

- **日期**：2026-09-18
- **状态**：已采纳（闸门 ② 架构 · sunny-zhai · 2026-09-18）
- **关联需求**：REQ-005（顺带清理既有重复）
- **背景/问题**：`src/ive.js` 为了贴地归心已经写过一遍"沿节点链累乘矩阵、包 8 个角"的遍历；体检面向 GLB 又需要同样的遍历。两者**只有局部盒来源不同**：IVE 中间产物的顶点是裸 float 区段，得从字节里量；GLB 直接用 accessor `min`/`max`。这段逻辑是包围盒正确性的关键（BR-018/BR-021），写两遍必然漂移。
- **决策**：把遍历与矩阵累乘收敛到 `src/transform.js::worldBounds(nodes, scenes, localBoundsByMesh)`，`src/ive.js` 传入自己量出的局部盒委托调用；节点/scenes 结构与 glTF 同构，因此 IVE 中间产物可直接复用。
- **理由**：正确性关键的逻辑只应有一处实现；重复实现的漂移不会立刻暴露（两条路径的测试各自绿灯，但数值口径悄悄分叉）。
- **后果**：正面——一份实现、两处复用，IVE 的 24 个用例（含与 FBX2glTF 参考件比对的金标准）成为这段逻辑的回归网。**代价与风险**：`src/ive.js` 新增对 `src/transform.js` 的模块依赖（层级仍清晰：transform 只依赖 repair）；重构触碰的是已交付且数值敏感的代码，必须靠金标准用例兜住。
- **替代方案**：① 各写一份（否决：漂移风险）；② 把遍历塞进 `repair.js`（否决：repair 是修复引擎，包围盒语义属于几何工具层）。
- **影响面**：`src/transform.js`（新增）、`src/ive.js`（删除约 40 行重复遍历改为委托）、`docs/001-code-design.md` MOD-008/BR-021、CLAUDE.md 模块清单。
- **验证方式**：重构后 `node --test test/ive.test.js` **24/24 通过**，且蹲姿转换复测世界盒 `0.538 × 1.364 × 1.056`、顶点 11,516、`min.y = 0` 与重构前逐位一致（无漂移）。

## ADR-004 预览侧的方向/缩放修正不写回文件，写回必须显式操作

- **日期**：2026-09-18
- **状态**：已采纳（闸门 ② 架构 · sunny-zhai · 2026-09-18；**TASK-008 已落地**：`src/preview-transform.js::previewMatrix` 只改预览 `modelMatrix`，日志三处均注明「仅预览修正，未写入输出文件」，冒烟以 `shasum` 前后比对确认输入文件未被改写）
- **关联需求**：REQ-005（落实 `docs/002-requirements.md` §6 问题 2 的采纳默认值）
- **背景/问题**：体检会发现方向可疑、比例尺异常、悬空未贴地等问题，用户自然想在预览里"转一下看看"。但如果预览拖一下就改动源资产，会带来两个后果：写回不可逆地修改了用户文件；以及"看到的" 与 "存下来的" 不一致而无人察觉。
- **决策**：预览上的方向/缩放/贴地修正**只作用于预览**（改 Cesium 的 `modelMatrix`），并在日志记录最终矩阵；写回输出必须由用户**显式触发**一个独立操作。
- **理由**：与工具的既有定位一致——修复流程对输入只读、输出另存（BR-001）；把"试看"与"落盘"分开，回滚就是"不保存"。
- **后果**：正面——预览可自由试错，源文件与输出都不会被意外改写；日志里的 `modelMatrix` 让"最终摆法"可复现、可写进问题报告。**代价与风险**：多一步显式操作；若用户忘记写回，会以为已保存（需在界面上明确区分"仅预览"与"已应用"两个状态）。
- **替代方案**：① 拖动即写回（否决：不可逆地改源资产）；② 只读不给控件（否决：无法消除"看着对、摆进去不对"的困惑）。
- **影响面**：`src/renderer.js`（预览 `modelMatrix` 与控件）、`src/index.html`/`styles.css`、`src/main.js`+`src/preload.js`（若需写回通道）；CLAUDE.md 的 Electron 壳层说明。
- **验证方式**（TASK-008 落地后）：冒烟——拖动方向/缩放使人物与车辆同框，日志出现最终 `modelMatrix`；对比输出文件 `mtime` 与哈希确认**未被改写**。

## ADR-005 体检的统计口径：只认默认场景可达网格，偏差倍数含位置分量

- **日期**：2026-09-18
- **状态**：已采纳（闸门 ② 架构 · sunny-zhai · 2026-09-18）
- **关联需求**：REQ-005（补充 ADR-001；不改写其历史）
- **背景/问题**：ADR-001 落地后，独立冷上下文审查发现三处口径缺陷：① `deviationFactor` 只比「逐轴尺寸比」，**纯平移**（尺寸相同、位置差 1000）恒为 1，而 Cesium 取景同样会明显错位——正是本功能要暴露的问题；② `accessorUnionBounds` 并集了文件里**所有**网格的 accessor 盒，即使那些网格不被任何场景引用，于是「未引用的 1000³ 网格 + 被渲染的 1³ 模型」会报出 1000 倍假偏差并触发告警；③ `worldBounds` 在空 `scenes` 时退化为「把每个节点都当根」从而丢掉父级变换，多场景时盒取所有 scene 并集而节点统计只算默认场景，报告自相矛盾。
- **决策**：(a) 偏差倍数改为 `max(逐轴尺寸比的最坏值, 1 + 中心偏移 ÷ 体对角线)`，并额外给出两个分量（`deviationParts.sizeRatio` / `centerOffsetRatio`）以解释「差在尺寸还是位置」；(b) `bounds.world`、`bounds.accessorUnion` 与节点统计**一律只按默认场景**（`json.scene ?? 0`）统计，并新增 `UNREFERENCED_MESHES` 提示未被引用的网格；(c) 空 `scenes` **不再回退**成「所有节点都是根」，返回 `null` 并给 `NO_DEFAULT_SCENE` 告警（glTF 下无 scene 即不渲染）。
- **理由**：报告里的数字必须与「Cesium 会怎么渲染」同口径，否则用户按报告排查会被误导；假偏差比不报更糟——它会让人去修一个不存在的问题。
- **后果**：正面——纯平移类错位能被发现；未引用网格不再污染指标；各统计口径一致。**代价与风险**：`deviationFactor` 不再是纯「尺寸倍数」（故以本 ADR 补充而非改写 ADR-001）；中心偏移以体对角线为基准，对极端细长资产（如 1000×1×1）该分量偏保守，可能低估位置错位的严重性。既有实测值未变（尺寸比在所有真实资产上占主导：装甲救护车 229,713 / 运输车 4,461 / person-move 485）。
- **替代方案**：① 保持纯尺寸比（否决：纯平移漏检）；② 只报两个指标不合并（部分采纳：作为 `deviationParts` 一并给出，但仍需一个标量做告警门槛）；③ accessor 盒继续并集所有网格（否决：产生假偏差）。
- **影响面**：`src/transform.js`（`deviationFactor`/`deviationParts`/`accessorUnionBounds`/`worldBounds`/`glbBounds`/`defaultSceneOf`/`reachableMeshIndexes`）、`src/inspect.js`（节点统计改用默认场景、`NO_DEFAULT_SCENE`/`UNREFERENCED_MESHES`）、`docs/001-code-design.md` BR-018、`test/inspect.test.js`。
- **验证方式**：`node --test test/inspect.test.js` ——「纯平移也能被偏差倍数发现」（factor 1001、尺寸比 1、偏移比 1000）、「未被场景引用的网格不制造假偏差」（factor 恒为 1）、「没有 scene 的文件给出 null 盒」、「多场景只按默认场景统计」、「`deviationFactor` 同时覆盖尺寸与位置」。

## ADR-006 编辑器式布局用 CSS Grid + 自绘分隔条，不引入前端框架

- **日期**：2026-09-18
- **状态**：已采纳（闸门 ② 架构 · sunny-zhai · 2026-09-18；实现待 TASK-010）
- **关联需求**：REQ-006
- **背景/问题**：界面是单列流式布局 + 整页滚动，3D 视口固定 360px 高，主次不分。要重排成"左队列 / 中视口 / 右体检器 / 底部日志"，需要能拖拽调宽调高、能折叠、能记忆，并且 3D 画布必须跟着容器尺寸变化重算——Cesium 只监听 **window** resize，分隔条拖动它感知不到，不处理会被拉伸。
- **决策**：(a) 布局用 **CSS Grid + CSS 变量**表达（`grid-template-columns: var(--pane-left) 4px minmax(0,1fr) 4px var(--pane-right)`），分隔条是 4px 的 `<div>`，用 `pointerdown/pointermove/pointerup`（含 `setPointerCapture`）改 CSS 变量；(b) 分栏尺寸、折叠状态写 `localStorage`（键 `glb-repair.layout`），启动时恢复；(c) 3D 容器挂 `ResizeObserver`，尺寸变化时调 `viewer.resize()`（节流到下一帧）；(d) **不引入任何前端框架/构建步骤**，保持现有"无 bundler、纯 DOM、CSP 不放宽"的约定；(e) 窄窗口（<1100px）降级为两栏 + 右栏抽屉，保证不出现横向滚动。
- **理由**：现有仓库约定是 CommonJS + 纯 DOM + 无构建；Grid 足以表达编辑器式布局，且能用现有 `test/ui-smoke.cjs`（CDP 读 DOM/CSS）直接验证，不需要新测试基建。引入框架会同时带来打包、CSP、`contextIsolation` 三项成本，收益仅为"写起来方便"。
- **后果**：正面——一屏呈现主次关系、面板可调可折叠、零新依赖、可用现有冒烟验证。**代价与风险**：自绘分隔条要自己处理指针捕获、最小尺寸与触控板体验；`ResizeObserver` + `viewer.resize()` 若忘记节流会在拖动时掉帧；`localStorage` 里存的是像素值，换到更小的屏幕要夹到合法区间（读取时 clamp）。
- **替代方案**：① 引入 Vue/React（否决：违反仓库约定，打包与 CSP 成本）；② Electron 多窗口/`<webview>`（否决：跨窗口状态同步成本高）；③ 只做 CSS 美化不换结构（否决：用户明确要求"像编辑器"）；④ 用现成的 split-pane 库（否决：为一个分隔条引入依赖不划算）。
- **影响面**：`src/index.html`（结构重排、保留既有 id）、`src/styles.css`（Grid/分隔条/抽屉/状态栏/焦点样式）、`src/renderer.js`（分栏拖拽与记忆、`ResizeObserver` → `viewer.resize()`、状态栏更新、抽屉切换）；`docs/001-code-design.md` 新增 BR-027；`test/ui-smoke.cjs` 增加布局断言。
- **验证方式**：`node test/ui-smoke.cjs model/蹲姿.glb --port <调试端口>` 的布局断言——无整页滚动（`scrollHeight <= innerHeight + 1`）、三栏与底部日志同时存在且 3D 容器宽度大于两侧栏、拖动分隔条后 CSS 变量与容器宽度变化且触发 `viewer.resize()`、折叠日志后 3D 高度增加、`localStorage['glb-repair.layout']` 存在；外加人工目视（直立/贴地/同框、拖拽手感）。

## ADR-007 栏位尺寸与内容解耦：用户意图与生效值分离

- **日期**：2026-09-18
- **状态**：已采纳（闸门 ② 架构 · sunny-zhai · 2026-09-18；实现见 TASK-011）
- **关联需求**：REQ-006（补充 ADR-006；不改写其历史）
- **背景/问题**：编辑器式布局交付后用户反馈"界面宽高会受到数据影响自动调整"。实测（窗口 1100×760）：**宽度不受数据影响**（左/右栏恒 260/340），**高度会**——模型路径变长时预览信息行从 1 行换行成 3 行，预览条 126→189px、3D 画布被顶掉；更严重的是 `clampLayout` 的高度预算里减了实时的 `previewBar.offsetHeight` 与 `helpPanel.offsetHeight`，于是"路径变长 → 预览条变高 → 日志上限变小 → 下一次重算（缩窗/拖分隔条/开帮助）把 `--pane-bottom` 从 380px 夹到 290px **并 `saveLayout()` 落盘**，换回短路径也不恢复"。即**内容能永久改写用户的布局**，而且不可逆。
- **决策**：(a) 布局尺寸只由**用户操作**与**窗口尺寸**决定，内容与临时面板**不得进入高度预算**：模型信息行固定单行省略号（完整路径挂 `title`），帮助面板限高 + 内部滚动且不参与预算；(b) **用户意图与生效值分离**——`layoutDesired` 是用户设定的尺寸（**唯一落盘对象**），`layout` 是当前窗口夹取后的生效值（只用于渲染）；窗口缩放、跨窄断点等**非用户事件只 `refitLayout()` 重算生效值，绝不落盘**，因此窗口恢复后用户尺寸自己回来；(c) 中栏网格显式写 `grid-template-columns: minmax(0, 1fr)`——只写 `grid-template-rows` 时隐式列是 `auto`，nowrap 内容会把列撑到 2994px（视觉被 `overflow:hidden` 裁掉，但宽度已爆）。
- **理由**：面板尺寸是用户的**空间偏好**，不该由"打开了哪个模型、路径多长、帮助面板开没开"决定；临时变高只应影响这一次渲染。旧行为既不可预测也不可逆（落盘后无法恢复），正是最容易被感知为"不友好"的缺陷类别。
- **后果**：正面——尺寸可预测、可逆；长路径不再影响画面；开关帮助不再吃掉用户的日志高度；缩窗再恢复也不再永久损失尺寸。**代价与风险**：`layout` 与 `layoutDesired` 两个概念必须同时维护，漏一处就会出现"拖了不动"或"改不回来"（故用 `commitLayout`/`commitFlags`/`refitLayout`/`adoptLayout` 四个入口收口，禁止裸赋值）；帮助面板打开时 3D 画布仍会临时变矮（由网格 `1fr` 行吸收，这是有意的），故"画布 ≥ `CANVAS_MIN_HEIGHT`"只在**帮助关闭**时保证。
- **替代方案**：① 干脆禁止折叠、固定所有尺寸（否决：用户要求编辑器式可调）；② 只修 CSS 不分离意图（否决：长路径问题消失，但缩窗仍会永久改写尺寸）；③ 把帮助面板做成绝对定位浮层（部分采纳：限高 + 内部滚动的成本更低，且不遮挡日志）。
- **影响面**：`src/renderer.js`（`clampLayout(input, {fitWindow})`、`commitLayout`/`commitFlags`/`refitLayout`/`adoptLayout`、`saveLayout` 落盘 `layoutDesired`、`setValidationModelSummary` 挂 `title`）、`src/styles.css`（单行省略号、`.pane-center` 显式列、帮助限高）、`test/ui-smoke.cjs`（6 条内容无关性断言）、`docs/001-code-design.md` BR-028。
- **验证方式**：冒烟新增断言——同一窗口下把模型信息从短文本换成 400 字长文本，**预览条高度 / `--pane-bottom` / `localStorage` 的 `bottom` 三者都不得变化**；换回短文本后画布与日志高度必须精确复原；打开与收起帮助面板都不得改日志高度与落盘值。这 6 条在修复前的代码（`b8bdddc`）上**实测全红**（预览条 99→189、日志 380→290 并落盘、换回短文本仍是 290），修复后 GLB 与 IVE 两遍各 **33 步 / 105 条断言 / 0 失败**。

## ADR-008 多格式输入用 assimpjs(WASM) 在进程内转换，不随包分发平台二进制

- **日期**：2026-09-20
- **状态**：已采纳（闸门 ② 架构 · sunny-zhai · 2026-09-20；实现见 TASK-013~015）
- **关联需求**：REQ-007（翻案 `docs/002-requirements.md` §6 问题 4 的"本期不做"结论）
- **背景/问题**：用户要求支持 FBX/OBJ。Cesium 不能直接读这两种格式，**任何预览都必须先转成 GLB**，所以"只预览"与"转换落盘"是同一条链。FBX 是二进制专有格式，纯 JS 不可行；而本仓已有约定"不 shell 外部二进制"（`jpeg-js`/`pngjs` 的教训：打包后的用户机器上没有 `ffmpeg`），IVE 的 `native/ive2glb` 又恰好证明**平台相关二进制的最坏情况是 Windows 直接没有**（`vendor/ive2glb` 只有 darwin）。2026-09-20 真机 spike（`assimpjs@0.0.10`）：`o-model/蹲姿.fbx` → GLB 5.17MB / 3.9s / 18,924 面 / **3 张内嵌贴图**；`o-model/蹲姿.obj`+`.mtl` → 世界盒 **0.54×1.36×1.06**（与 FBX2glTF 参考件一致）；两者顶点都是三角汤（56,772）。
- **决策**：(a) 后端用 **`assimpjs`（assimp 的 emscripten/WASM 构建，MIT；assimp 本体 BSD-3）**，在渲染进程外的 Node 侧**进程内**调用（`ConvertFileList(fileList, 'glb2')`），**不引入外部可执行程序**、不按平台分发二进制；(b) 转换产物**直接进现有管线**（`repairGlbFile` → 体检 → Cesium 预览），与 IVE 完全同构——`convert*.js` 只负责"产出 GLB"，轴/贴地/蒙皮/贴图内嵌全部沿用既有代码；(c) 三角汤用 `src/ive.js` **已导出的 `weldVertices`** 焊接（键覆盖全部属性，UV 缝与硬边得以保留），不另写一份；(d) OBJ 的外部贴图交给既有 `resolveExternalImage`（相对路径 / 同级同名 / `.fbm` 目录 / 乱码路径兜底）解析后内嵌，**解析不到的必须在日志与体检问题清单里列出原始 `uri`**，且预览副本要把它换成 1×1 占位（`image.name = missing:<原始 uri>`）而不是删槽或留一个读不到的 `uri`（后者会让 Cesium 必然加载失败）——不静默丢；(e) wasm 用 `asarUnpack` 随包分发并按 `__dirname` 解析，与 `vendor/ive2glb` 的既有打包套路一致。
- **理由**：WASM 一次解决三件事——平台无关（含 Windows）、无外部进程（符合仓库约定）、40+ 格式的同一入口。原生 `FBX2glTF`/`assimp` 二进制方案每平台一份、Windows 仍要单独解决，且要维护 `install_name_tool`/签名那一整套。
- **后果**：正面——FBX/OBJ 进入同一管线，Windows 也能用；OBJ 的贴图解析复用既有兜底，实测世界盒与参考件三轴一致。**代价与风险**：包体积 +约 4.2MB（`assimpjs.wasm` 4,046,914B + 胶水 133KB，未压缩；npm 报的 8.7MB 是整个 dist 目录解包后的体积，含两份许可证与 README）；assimp **v5.2** 相对较旧，个别 FBX 特性可能缺失（本仓样例已实测通过）；**OBJ 的外部贴图 assimp 只写 `uri` 不内嵌**（spike 实测：即使把贴图喂进文件列表，相对路径也仍输出为外部引用），所以"内嵌"必须由我们的 `resolveExternalImage` 完成——这条容易被误判为"已内嵌"；FBX 产物带蒙皮与动画，会走 `bakeSkinnedMeshes`（默认绑定姿势），需要用户勾选"烘焙为动画起始姿势"才能得到动作帧；**`ConvertFileList` 是同步 wasm**——单个 FBX 约 4~6 秒会独占主进程（期间窗口按钮无响应），且实例常驻复用、重复转换时 wasm 侧内存增长（冷审实测 OBJ×15 48→135MB 无平台期、FBX×5 到 ~107MB 后趋平），几十个 FBX 的批量应先做 soak，必要时把转换挪到 `utilityProcess`/worker。
- **替代方案**：① 原生 `FBX2glTF`（官方链、质量高）：否决为主后端，它只支持 FBX 且每平台一个二进制；若日后 assimp 在同名 FBX 上出现质量回归，可作为**双备**再引入。② 扩写 `native/ive2glb` 链 assimp：每平台一个二进制，Windows 继续卡住。③ `osgconv`→OBJ→`assimp export`：**实测否决**（600,680B 空壳 GLB、MTL 内是 `images\…tga` 反斜杠路径、贴图全丢）。④ 要求用户自备 assimp：违背"开箱即用"，Windows 基本不可用。
- **影响面**：新增 `src/convert.js`（`convertToGlb` / `convertManyToGlb` / `assimpAvailable` / `collectSidecarFiles`）、`test/convert.test.js`；`src/main.js`（过滤器加 `fbx`/`obj`、三条 IPC 的转换前置、`app-capabilities` 增加 `assimp`）、`src/renderer.js`（提示文案）、`package.json`（`dependencies.assimpjs`、`asarUnpack`）、`src/ive.js`（只复用其导出，不改）、`docs/001-code-design.md` 新增 BR-030、`docs/002-requirements.md` §6 问题 4 追加翻案说明、`CLAUDE.md`（"不 shell 外部二进制"→"外部二进制须随包分发；本需求不引入外部二进制"的措辞澄清）。
- **验证方式**：`node --test test/convert.test.js`——FBX 面数 18,924 且 ≥3 张内嵌贴图、OBJ 世界盒 0.54×1.36×1.06（容差 0.02）、焊接后顶点数显著下降而面数不变、坏文件返回中文错误且 `repairMany` 不中断；`node test/ui-smoke.cjs` 在 FBX 与 OBJ 上各跑一遍（预览路径无外部 `uri` 残留）；外加人工目视（FBX/OBJ 模型在 Cesium 里直立贴地、贴图正确）。

## ADR-009 贴图规格收口：非法采样器组合按既有口径退化，降采样默认关且进程内做

- **日期**：2026-09-20
- **状态**：已采纳（闸门 ② 架构 · sunny-zhai · 2026-09-20；实现见 TASK-017~020）
- **关联需求**：REQ-008（落地 `docs/002-requirements.md` M3「修得全（贴图规格）」的口径）
- **背景/问题**：M3 的"贴图规格"两项一直没有实现：① 非 2 次幂（NPOT）贴图若同时用 `REPEAT` + mipmap，在 WebGL1 下是非法组合，`src/inspect.js` 已能报出 `NPOT_WITH_REPEAT_MIPMAP` 并写了中文提示"需改为 CLAMP_TO_EDGE + LINEAR"，但 `src/repair.js` **没有任何修复步骤**——能看见、修不了；② BR-002 统一 JPEG→PNG 后照片类贴图膨胀（实测 2048² 2.1MB → 10.25MB），发布说明自认"真正的解法是贴图降采样，尚未做"，`docs/002-requirements.md` §6 问题 5 早已定了"默认不降、提供 2048/1024/512/不降四档"的口径，界面上却没有这个旋钮。两者叠加的后果是：用户读了体检报告也无法消除该问题，只能忍受体积膨胀。
- **决策**：
  (a) **非法组合的修法 = `CLAMP_TO_EDGE`（wrapS/wrapT）+ `LINEAR`（minFilter）**——即"按贴图退化"，与 `src/ive.js` 既有的 NPOT 退化规则、以及 `inspect.js` 那条问题的既有中文提示**完全一致**。同一工具的两条路径（IVE 转换产物 vs GLB 修复产物）不允许给出不同口径。
  (b) **判定粒度是"贴图维度 × 采样器"逐个材质/贴图对**，不是"文件里存在 NPOT 就整体退化"：采样器被多材质共用时要逐个判定；**POT 贴图与已经合法的组合一个字段都不改**（不做无差别重写，避免把用户原本正确的素材改坏）。
  (c) **降采样在进程内用 `pngjs` 做盒式平均**（box filter），按最长边目标值等比缩放，**默认不降**（`maxTextureSize: 0`），可选 `2048/1024/512`。不引入 `sharp`/`canvas` 等原生依赖——本仓"转码自包含、不按平台分发二进制"的约定（REQ-007/ADR-008 与 `jpeg-js`/`pngjs` 的既有教训）不变。
  (d) **管线顺序固定为"贴图内嵌（PNG）→ 降采样 → 采样器规范化"**：降采样可能把 POT 变成 NPOT（例如 3000×1000 → 1024×341），所以采样器规范化必须在降采样**之后**跑，否则判定的是过期维度。该顺序由不变量断言守住。
  (e) `KHR_texture_transform.texCoord` 的覆盖在 `src/inspect.js` 与 `src/repair.js` 两处**同源读取**（扩展里的 `texCoord` 优先于槽位自身），消除 TASK-007 挂账的 `MISSING_TEXCOORD` 漏报——体检与修复不允许有两套口径。
- **理由**：`CLAMP_TO_EDGE + LINEAR` 是**已被本仓两次选定**的口径（`ive.js` 生成侧 + `inspect.js` 提示侧），跟着既有口径走才能让"体检提示 → 修复结果"闭环，也才不需要解释"为什么提示写 A 而修复做 B"。判定逐对进行、POT 不改，是"最小必要"原则在修复管线里的体现：修复工具越少动用户原本正确的字节，越不容易引入回归。降采样默认关，因为它是**有损且不可逆**的画质决策，应由用户显式开启；`pngjs` 已在 `dependencies`，用它不增加包体积与平台风险。
- **后果**：正面——体检报得出、修复修得掉，M3 的两项验收标准第一次有实现承载；降采样默认关使"不改变现状"成为默认行为，回归风险集中在显式开启的路径上。**代价与风险**：① `CLAMP_TO_EDGE` 会让原本靠 `REPEAT` 平铺的资产失去平铺（可见变化），因此**只在非法组合上动手**，并在修复报告里如实记录改了哪些采样器；② mipmap 被去掉后远处缩小的画面可能出现闪烁/摩尔纹——这是选中"按贴图退化"而非"去 mipmap 保 REPEAT"的代价，若日后闪烁成为主要痛点，应新立需求做成可选策略，而不是静默改口径；③ `pngjs` 盒式平均是纯 CPU 操作，大贴图批量降采样会明显变慢（在 TASK-018 实测并把耗时写进日志/文档，必要时才考虑 `utilityProcess`）；④ 降采样会改写贴图字节，因此"只动贴图、几何逐字节不变"必须由不变量断言守住。
- **替代方案**：① **把 NPOT 补成 POT**（padding 或缩放）——否决：会改像素语义与画面比例，且体检仍会报 NPOT，属于把问题藏起来；② **保留 `REPEAT`、只把 minFilter 降为非 mipmap**——技术上能消掉 WebGL1 的非法组合且保住平铺，但与本仓既有提示和 `ive.js` 口径不一致，会让同一工具两条路径产出不同采样器；故仅作为"若闪烁成为主要痛点"的后续可选策略（见代价 ②）；③ **引入 `sharp`**——否决：原生依赖、按平台分发，正是 REQ-007/ADR-008 要摆脱的形态；④ **只报告不修复**——否决：M3 验收标准明确要求修复后不再出现该组合。
- **影响面**：`src/repair.js`（新增采样器规范化步骤、降采样步骤、`collectMaterialTexCoords` 读扩展覆盖、报告字段）、`src/inspect.js`（`collectTextureSlots` 读扩展覆盖）、`src/renderer.js` + `src/index.html`（降采样档位下拉与中文提示）、`test/repair.test.js`、`test/inspect.test.js`、`test/ui-smoke.cjs`、`docs/001-code-design.md`（BR-031 / BR-032）、`docs/testing/TEST_PLAN.md`（TC-019~TC-021）。
- **验证方式**：`node --test test/repair.test.js test/inspect.test.js`——NPOT+REPEAT+mipmap 修复后为 `CLAMP_TO_EDGE`+`LINEAR` 且体检不再报该问题；POT 与已合法组合的采样器 JSON 逐字段不变；产物全量不变量（无"NPOT 且 REPEAT+mipmap"）；2048² → 1024² 逐像素等于 2×2 盒式平均；3000×1000 → 1024×341；「不降」档产物字节与现状一致；几何 bufferView 逐字节不变；`KHR_texture_transform` 用例在旧代码上为红。`node test/ui-smoke.cjs` 在 GLB/IVE/FBX/OBJ 上仍全绿。

## ADR-010 Windows 的 IVE 仍走原生 OSG 助手，不改走 assimp/WASM

- **日期**：2026-09-20
- **状态**：已采纳（闸门 ② 架构 · sunny-zhai · 2026-09-20；实现见 TASK-021/022）
- **关联需求**：REQ-009（订正 REQ-007 描述里"顺带解决 Windows 没有 ive2glb.exe 的既有缺口"这一设想）
- **背景/问题**：决定 v0.1.1 暂不发布、等补齐 Windows 支持后，必须回答"Windows 上的 IVE 怎么办"。REQ-007 的描述曾设想"用 assimpjs 统一多格式与 Windows 分发，顺带解决 Windows 没有 `ive2glb.exe` 的缺口"。但 `assimp` **没有 IVE importer**（IVE 是 OpenSceneGraph 的私有序列化格式），npm 生态也没有 JS/WASM 的 IVE 解析器（只有 `.osgb/.osgt` 序列化库）——该设想不成立。当前事实：`vendor/ive2glb/` 只有 `darwin-arm64`；`dist/` 里的产物是 2026-09-15 的 `0.1.0` 旧包。
- **决策**：(a) Windows 的 IVE 能力**继续用原生 OSG 助手**：在 Windows x64 上构建 `ive2glb.exe`，把可执行文件与其依赖闭包 vendoring 到 `vendor/ive2glb/win32-x64/`，目录结构与 darwin 同构；(b) 打包沿用既有约定（`asarUnpack: vendor/ive2glb/**` + `resolveIveHelper` 的平台目录解析 + `app.asar` → `app.asar.unpacked` 回退），**不改解析逻辑**；(c) 找不到助手时仍按 BR-012 给中文降级提示并列已查找路径，不静默。
- **理由**：IVE 只在原生 OSG 生态里可读，这是格式属性而非实现选择；既有 `src/ive.js` + `native/ive2glb` 链路已在 darwin 上验证过世界盒/顶点/贴图三项真值，把同一条链路搬到 Windows 的风险远低于为 Windows 另写一条 IVE 路径。
- **后果**：正面——Windows 获得与 macOS 一致的 IVE 能力，REQ-009 的验收标准可判定；打包与解析逻辑零改动。**代价与风险**：① 多一份平台产物要**手工维护**（`scripts/build-ive2glb.sh` 是 macOS-only，Windows 版本只能按 README 人工执行；本机无 wine、无法交叉构建，必须由具备 Windows 环境的人执行）；② `osgdb_ive` 那一整套依赖（含 fontconfig/freetype，darwin 侧约 11MB）在 Windows 上需要单独收集 DLL 闭包，易漏；③ 长期看 IVE 仍是"只在两个平台可用"的格式，若日后要覆盖更多平台，应重新评估是否值得。
- **替代方案**：① **用 assimp 读 IVE**——不可行（无 importer），背景已说明；② **让用户先自行把 IVE 转成 GLB/FBX 再喂给工具**——否决：违背"开箱即用"；③ **Windows 不支持 IVE，只在发布说明里声明**——这是"暂不发布"之前的默认状态，用户已明确选择"等补齐 Windows 支持"，故不采纳为最终方案（若 Windows 构建环境长期不可得，应回到本方案并在发布说明中显式声明，见 REQ-009 验收标准 6）。
- **影响面**：`vendor/ive2glb/win32-x64/`（新增，入库）、`native/ive2glb/README.md`（补 Windows 构建步骤）、`package.json`（如需调整 `files`/`asarUnpack`）、`docs/release/RELEASE_CHECKLIST.md`（§3/§4 回填）、`docs/testing/TEST_PLAN.md`。
- **验证方式**：`dumpbin /dependents ive2glb.exe`（或等价）证明依赖闭包无第三方非系统 DLL；Windows 上 `app-capabilities` 报 `ive: true` 且 `.ive` 能转换/预览/落盘、世界盒与 darwin 一致（容差 0.02）；`npm run dist:win` 的新包内含 `vendor/ive2glb/win32-x64/ive2glb.exe`、`assimpjs/dist/assimpjs.wasm` 与两份许可证；按 `RELEASE_CHECKLIST.md` §4 逐行冒烟并回填实际值。
