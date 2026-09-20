# 测试计划（TEST PLAN）

> 由 `testing` 技能维护。每个 REQ 的验收标准都要落到具体用例；完成后回填"结果/证据"。
> 覆盖率门槛：核心逻辑 ≥95% · 测试 ≥90% · 文档 ≥90% · UI ≥85% · 探索 ≥70%（由用户按场景确认）

## 元信息

| 项 | 值 |
| :-- | :-- |
| 项目 | GLB Texture Repair Tool（GLB 贴图修复桌面工具） |
| 覆盖目标 | 核心逻辑 `src/repair.js`、`src/ive.js` 以**实测覆盖率**记录（见「覆盖率」一节），**不设强制门槛**：设门槛必须先接插桩与 CI，现状是本地手工执行 |
| 执行命令 | `npm test`（= `node --test "test/*.test.js"`，glob 由 `package.json` 声明，新用例文件自动纳入） |
| 覆盖率命令 | `node --test --experimental-test-coverage "test/*.test.js"` |
| 语法门禁 | `npm run lint`（`node --check` 遍历**全部** `src/*.js`，当前 10 个：`main`/`preload`/`renderer`/`repair`/`ive`/`inspect`/`transform`/`report-format`/`preview-transform`/`convert`） |
| 夹具 | `refs/models/{person-move,person-stand,蹲姿}.glb`（6.5 MB，**未入库**）；恢复：`mkdir -p refs/models && cp o-model/*.glb refs/models/`。IVE 用例另需 `o-model/*.ive`；多格式用例需 `o-model/蹲姿.{fbx,obj,mtl}` 与 `model/蹲姿.glb`；体检语料为 `o-model/*.glb` + `model/*.glb`（**均未入库**，缺失时按 `fixtureSkipReason()` 跳过并打印恢复命令） |

用例覆盖的是平台采纳**之前**交付的功能，需求来源是 `docs/001-code-design.md` 的 BR-001～BR-017；
`REQ-002` 是这些验证基线本身的登记需求，`REQ-001` 是文档一致性需求。

## 用例清单

### TC-001 修复引擎全量套件（单元 + 集成）
- **关联需求**：REQ-002（验证基线）；覆盖 BR-001～BR-011
- **层级**：单元 + 集成
- **前置**：`refs/models/*.glb` 已在位
- **步骤**：`node --test test/repair.test.js`
- **期望**：20 通过 / 0 失败（2026-09-20 实测 `test/repair.test.js` 共 20 个用例；此前的 19 是 TASK-006 时代的快照）
- **实际/证据**：`pass 20 / fail 0`（本地夹具齐备；夹具缺失时 6 个跳过）

### TC-002 IVE 转换全量套件
- **关联需求**：REQ-002；覆盖 BR-008～BR-017
- **层级**：单元 + 集成（含 3 个端到端）
- **前置**：`o-model/*.ive` 存在且 `resolveIveHelper()` 能找到助手
- **步骤**：`node --test test/ive.test.js`
- **期望**：24 通过 / 0 失败
- **实际/证据**：`pass 24 / fail 0`

### TC-003 轴位与贴地归心金标准（D1/D2 缺陷回归）
- **关联需求**：REQ-002；判据见 BR-013/014
- **层级**：集成（端到端，与 FBX2glTF 参考件比对）
- **前置**：`o-model/蹲姿.ive`
- **步骤**：`node --test test/ive.test.js --test-name-pattern='同轴同尺度'`
- **期望**：世界盒 `0.538 × 1.364 × 1.056`（容差 0.02）、`min.y = 0`、中心 x/z < 1e-6、`axisMode = bake`、节点矩阵数 ≥ 3
- **实际/证据**：通过（三轴与参考件 `model/蹲姿.glb` 完全一致）

### TC-004 顶点焊接无损性与收益（D3 缺陷）
- **关联需求**：REQ-002；BR-017
- **层级**：集成
- **前置**：`o-model/蹲姿.ive`
- **步骤**：`node --test test/ive.test.js --test-name-pattern='顶点焊接'`
- **期望**：56,772 → ≤13,800 顶点（实测 11,516，与 FBX2glTF 参考件顶点数相同）；面数 18,924 与贴图 3 张不回退；体积较未焊接版小 25% 以上；`worldSize` 与未焊接版完全相同
- **实际/证据**：通过。另做过一次强等价性证明——把焊接开关两版逐三角形取全部属性元组（POSITION+NORMAL+TEXCOORD），按保绕序循环旋转归一化后比较多重集合，18,924 个三角形完全相同

### TC-005 JPEG 统一转 PNG（成功与失败路径）
- **关联需求**：REQ-002；BR-002
- **层级**：单元 + 集成
- **步骤**：`node --test test/repair.test.js --test-name-pattern='JPEG'` 与 `--test-name-pattern='external JPEG'`
- **期望**：内嵌与外部 JPEG 均输出 `mimeType: image/png` 且以 PNG 签名开头、`imagesConverted` 计数正确；残留的 `keepJpeg: true` 不改变行为；无法解码的 JPEG（只有 SOF 头）按单文件报 `JPEG 转 PNG 失败` 且不产出坏贴图
- **实际/证据**：4 个用例全部通过

### TC-006 夹具缺失时的跳过语义（新克隆可用性）
- **关联需求**：REQ-002
- **层级**：元测试（对测试套件自身行为的断言）
- **前置**：把 `o-model/` 与 `refs/models/` 临时移走
- **步骤**：`npm test`
- **期望**：不出现失败；跳过数与缺失夹具成正比——**全新克隆（无任何夹具）实测跳过 19 个**（`repair` 6 + `ive` 5 + `inspect` 3 + `convert` 5），其余 100 个仍执行；每条跳过都打印缺失文件与恢复命令
- **实际/证据**：2026-09-20 在 `git worktree add --detach <clean> release/v0.1.1`（仅受跟踪文件）实测 `tests 119 / pass 100 / fail 0 / skipped 19`；本地夹具齐备时为 `pass 115 / skipped 4`（`inspect` 1 个需 `o-model/运输车.glb` + `ive` 3 个需 `o-model/person-move.ive`）。**不要**把跳过数写死成常量：夹具随本地增减，用例自身按实际语料伸缩

### TC-007 语法门禁
- **关联需求**：REQ-002
- **层级**：单元（静态检查）
- **步骤**：`npm run lint`
- **期望**：五个文件全部通过 `node --check`
- **实际/证据**：通过

### TC-008 端到端链路：IVE → GLB → 修复
- **关联需求**：REQ-002；BR-008
- **层级**：E2E
- **步骤**：`node --test test/ive.test.js --test-name-pattern='修复管线'`；或手工跑 `convertIveToGlb` → `repairGlbFile`
- **期望**：转换与修复均 `status: success`，输出 3 网格 / 3 贴图 / buffer 长度与 BIN 一致
- **实际/证据**：通过；三个 IVE 全量跑过（蹲姿 27.25→2.43 MB、person-move 27.25→2.43 MB、person-stand 56.66→8.73 MB），修复后体积不变

### TC-009 图元合并的可扩展性（Cesium 加载挂死修复）
- **关联需求**：REQ-002；BR-007
- **层级**：单元 + 集成
- **步骤**：`node --test test/repair.test.js --test-name-pattern='mergePrimitivesByMaterial'`
- **期望**：超阈值时跨节点按材质合并（含镜像节点绕序反转与世界变换烘焙）；低于阈值时 no-op
- **实际/证据**：2 个用例通过

### TC-010 异常与边界输入
- **关联需求**：REQ-002；BR-004/BR-005/BR-012
- **层级**：单元
- **步骤**：`--test-name-pattern='corrupt'` / `'unreadable'` / `'missing external'` / `'拒绝非 IVE'` / `'助手缺失'`
- **期望**：批处理遇到损坏文件继续后续任务并计入 `failed`；不可读文件只报错不抛；缺外部贴图给出恢复指引；非 IVE 输入被拒；助手缺失给出含查找路径的中文错误
- **实际/证据**：全部通过

### TC-011 目录结构与嵌套保留（回归护栏）
- **关联需求**：REQ-002；BR-008
- **层级**：单元
- **步骤**：`--test-name-pattern='nested'` / `'batch roots'`
- **期望**：`collectGlbEntries` 在批量根下保留相对子目录结构（`options.entries` 不被拍平成绝对路径）
- **实际/证据**：通过

### TC-012 手工冒烟：Electron 内预览（不可自动化部分）
- **关联需求**：REQ-002
- **层级**：E2E（人工）
- **前置**：`npm run ensure:cesium` 已解包 `vendor/cesium/1.128`
- **步骤**：1. `npm run dev` 2. 选一个 `.ive` 输入 3. 跑批量修复 4. 在 Cesium 视图确认朝向、贴地、贴图
- **期望**：日志出现 `坐标 Z-up→Y-up + 贴地 + 水平归心` 与米制尺寸/顶点/面数；Cesium 中模型直立、落地、贴图无倒置
- **实际/证据**：**人工验收通过**（sunny-zhai，2026-09-18）：IVE 转换产物与 GLB 模型在应用内 Cesium 预览中**均可正常渲染**。注：本次人工确认的是"能渲染"这一路径；朝向（直立而非躺倒）与贴地的判据由自动化断言兜住——蹲姿转换产物世界盒 `0.538 × 1.364 × 1.056` 与 FBX2glTF 参考件三轴逐位一致、`min.y = 0`、中心 x/z < 1e-6

### TC-013 模型体检：世界盒 vs accessor 盒、点面统计、异常输入（REQ-005）
- **关联需求**：REQ-005（对应其验收标准 1、2、3、5）；设计决策见 `docs/design/ADR.md` 的 ADR-001~003
- **层级**：单元 + 集成（合成 GLB 与真实样本并用）
- **前置**：`test/inspect.test.js` 自带合成 GLB；真值断言需要 `o-model/*.glb` 与 `model/*.glb`。**样例模型不入库**（`.gitignore`），本地个数会变：缺夹具的用例走 `fixtureSkipReason()`，在用例名后打印缺失文件与找回提示并**跳过**，用例本身**不硬编码语料数量**
- **步骤**：
  1. `node --test test/inspect.test.js`
  2. `node src/inspect.js o-model/运输车.glb`
  3. 逐个体检样例集（`o-model/*.glb` + `model/*.glb`；本次实测 4 个：`o-model/蹲姿.glb` 与 `model/{person-move,person-stand,蹲姿}.glb`）
- **期望**：① 运输车世界盒 `2.59 × 4.10 × 5.98` m、`deviationFactor > 1000`、列出荒谬的 accessor 盒；② 样例集零崩溃且单文件 < 2s（历史上限样本 `M1A2艾布拉姆斯坦克.glb` 174,937 顶点；扫全语料的用例要求基数 ≥1 并随本地语料伸缩）；③ `mode=4` 图元的索引数可被 3 整除（无此类索引图元时为 `null`）、person 参考件 `vertexReuseRatio` = 0.61（定义为顶点数 ÷ 三角面数）；④ 非 GLB / 不可读 / 解析失败 / 缺 TEXCOORD / 外部贴图缺失等异常都变成中文问题条目而非抛异常
- **实际/证据**：`node --test test/inspect.test.js` → **35 通过 / 1 跳过 / 0 失败**（跳过项依赖已删除的样例 `o-model/运输车.glb`）。历史全量语料（当时 21 个）实测：运输车 `2.59 × 4.10 × 5.98`、偏差 `4461.888`（accessor 盒 `11571.59 × 15430.28 × 23539.10`）、0 崩溃、最慢 **11 ms**。语料裁剪为 4 个 GLB / 12 张内嵌贴图后复测：**0 崩溃**、最慢 **1 ms**（`蹲姿.glb`，上限 2 s）、12/12 内嵌贴图宽高可读、4/4 文件 `triangles` 与 `Σ(mode=4 索引数)/3` 一致、person 参考件 `vertexReuseRatio` `0.6085`。注：原证据③写作「21/21 `trianglesMatch`」，该判据在无非索引图元时是恒等式、存在非索引图元时必然为假，冷审查已判无效并替换（见 TASK-007 返工记录）；此处的三角面数交叉核对是本次按 `mode=4` + 索引数重算的

### TC-014 界面体检面板与预览方向/缩放/上轴（REQ-005 验收标准 4）
- **关联需求**：REQ-005（验收标准 4）；设计决策见 `docs/design/ADR.md` 的 ADR-002（上轴三态）与 ADR-004（预览修正不写回）
- **层级**：单元（纯函数）+ 集成（Electron 渲染进程接线，CDP 驱动）+ 人工目视
- **前置**：`npm run ensure:cesium` 已解包 `vendor/cesium/1.128`；集成部分需要手动启动带调试端口的实例：`npx electron . --remote-debugging-port=9333`
- **步骤**：
  1. `node --test test/report-format.test.js test/preview-transform.test.js`
  2. `node test/ui-smoke.cjs model/蹲姿.glb --port 9333`（再用 `o-model/蹲姿.ive` 跑一遍，覆盖 IVE 的临时转换路径）
  3. 人工：`npm run dev`，`选择预览模型（单个）` 分别取一个 GLB 与一个 IVE，看「模型体检」面板；拖动「预览方向」「预览缩放」、切换「上轴」；点「重置预览修正」
- **期望**：① 面板双列给世界盒与 accessor 盒、偏差按 `deviationLevel` 上色（<10 正常 / 10~1000 告警 / ≥1000 错误）且**配色与文案同档**（ok 档不得出现"会错位"）、事实行含几何/结构/贴图/采样/上轴/比例尺、问题清单按 error→warn→info 排序，**任何字段缺失都不得出现 `undefined`/`NaN`**；② 拖动（`input`）只实时改预览矩阵**不记日志**，松手（`change`）与重置各记一行 `modelMatrix` 并注明「仅预览修正，未写入输出文件」；上轴三态只有显式选 `Z-up → Y-up` 才叠加 `Rx(−90°)`（ADR-002：推断绝不自动施加）；③ 体检失败（不可读/非 GLB/解析失败）只在面板上显示中文原因，**不打断 Cesium 预览**；④ 预览与体检前后输入文件哈希不变；⑤ 人工目视：模型直立、贴地、贴图正常，人物与车辆能同框
- **实际/证据**：`node --test test/report-format.test.js test/preview-transform.test.js` → **24 通过 / 0 失败**（`npm test` → 102 通过 / 0 失败 / 4 跳过）。接线冒烟（`node test/ui-smoke.cjs model/蹲姿.glb --port 9333`，CDP 读渲染进程的真实 DOM）：`inspectStatus` 「体检完成 · 7 ms · 错误 0 / 警告 1 / 提示 0」（耗时逐次在 7~9 ms 波动；提示数在 TASK-009 修掉误报后由 1 变为 0）、世界盒 `0.538 × 1.364 × 1.056 m`、世界盒中心 `0.032, 0.664, -0.052 m`、accessor 盒 `0.005 × 0.011 × 0.012 m`、偏差行原文「世界盒与 accessor 盒相差 129.211 倍：尺寸比 129.211 倍（中心偏移比 0.373），按 accessor 盒取景会错位。」且 `className` 为 `inspect-deviation warn`；6 条事实行为 几何 `顶点 11516 · 三角面 18924 · 顶点/面比 0.6085`、结构 `节点 70 · 网格 3 · 图元 3`、贴图 `贴图 3 个 · 内嵌图片 3 张 · 1×1 占位 0 张`、采样 `被采样贴图 3 张 · 材质 3 个`、上轴 `Y 轴（中等置信度）—— 生成器 "FBX2glTF v0.9.7" 属于标准 glTF 导出链，按 Y-up 约定输出`、比例尺 `中位节点缩放 100 · 3 个节点不是单位缩放`；问题清单 1 条（`ACCESSOR_BOUNDS_UNRELIABLE`；`UNREFERENCED_MESHES` 的误报已由 TASK-009 修掉，修复前这里会多出 1 条错误提示）；面板文本无 `undefined`/`NaN`。拖动 5 次 `input` 新增 `modelMatrix=` 日志 **0 行**、标签跟到 `75°`；两次 `change` 各 1 行，矩阵与列主序手算一致（`方向 90°` → `[0.0000, 0.0000, -1.0000, 0, 0, 1.0000, 0, 0, 1.0000, 0, 0, 0, 0, 0, 0, 1.0000]`，再 `缩放 2×` → 非平移分量 ×2）；上轴选 `Z-up` 后为 `[0.0000, 0.0000, -2.0000, 0.0000, -2.0000, 0.0000, 0.0000, 0.0000, 0.0000, 2.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 1.0000]`（`Rx(−90°)∘Ry(90°)∘2`，与 `src/ive.js` 的 `(x,y,z)→(x,z,-y)` 同向）；重置回 `0°/1.00×/auto` 且只记 1 行；输入文件 `shasum -a 256` 前后一致；缺失文件走 `{ok:false,error:'无法读取文件：ENOENT…'}` 而非 reject。IVE（`o-model/蹲姿.ive`）：世界盒 `0.538 × 1.364 × 1.056 m`、中心 `0.000, 0.682, -0.000`、偏差档 `ok`（`尺寸比 1.165 倍，未到告警门槛（10 倍）`），`.ive` 哈希不变。
  **该未绿项已由 TASK-009 修复并转绿**：机制经 CDP 探针确认**不是** ready 事件竞态，而是**窗口不可见**（`document.hidden === true` → `requestAnimationFrame` 被节流 → Cesium 一帧都没渲染：渲染帧计数 `scene.frameState.frameNumber` 停在 0、`resourcesLoaded` 仍为 false → 「置 `_ready` 并发 `readyEvent`」的 `afterRender` 回调从未执行）。根因用 `webPreferences.backgroundThrottling: false` 修掉，另加超时兜底并把超时文案与「加载成功」区分开；冒烟的加载步骤断言也加强为**必须真出现「加载成功」**（防止被超时兜底假绿）。修复后 `model/蹲姿.glb` 与 `o-model/蹲姿.ive` 各 8 步、**0 项失败（全绿）**；同一批次里 `UNREFERENCED_MESHES` 的误报也已修掉（`model/person-stand.glb` 等本地 4 个样例修复前 4/4 误报、修复后 0/4，真实的 `ACCESSOR_BOUNDS_UNRELIABLE` 告警仍在）。
  人工目视（直立/贴地/贴图/人物与车辆同框）**待 sunny-zhai 确认**——自动化只覆盖接线与数值，覆盖不到"看起来对不对"。

### TC-015 编辑器式布局：一屏三栏 + 可拖拽分隔条 + 布局记忆（REQ-006）
- **关联需求**：REQ-006（验收标准 1~7）；设计决策见 `docs/design/ADR.md` 的 ADR-006 与 `docs/001-code-design.md` 的 BR-027
- **层级**：集成（CDP 驱动真实渲染进程，含分隔条指针拖拽与窄窗视口覆写）+ 人工目视
- **前置**：手动起实例 `npx electron . --remote-debugging-port=9333`（冒烟脚本会自己 `Page.reload`，可重复跑）；沙箱/无 GPU 环境用 `--no-sandbox --disable-gpu-sandbox --user-data-dir=/tmp/glb-smoke` 起实例。渲染进程暴露 `window.__layout`（`key` / `get()` / `limits` / `clamp()` / `restore()` / `resizeCount()`）**仅供本冒烟断言复用内部函数**，是只读调试入口，不参与产品逻辑
- **步骤**：
  1. `node test/ui-smoke.cjs model/蹲姿.glb --port 9333`，再用 `o-model/蹲姿.ive` 跑一遍
  2. 人工：1280×800 与把窗口缩到 900px 各看一遍（拖三根分隔条、折叠日志、开关抽屉、Tab 走一遍工具栏与预览控件）
- **期望**：① 页面本身不滚动（`scrollHeight <= innerHeight + 1`，横向同理），三栏 + 底部日志 + 状态栏同屏且**3D 视口最宽**；② 三根分隔条各自能拖动、有最小尺寸、中栏恒为最宽，且**每次拖拽都真实调用 `viewer.resize()`**（Cesium 只监听 window resize），画布绘图缓冲随容器变化；③ 折叠日志后 3D 画布变高、展开精确复原；④ 900px 宽降级两栏 + 右栏抽屉，抽屉开关皆无横向滚动；⑤ 布局写 `localStorage['glb-repair.layout']` 并在重载后恢复（种入非默认值必须真的生效），垃圾/越界/未知版本载荷不得让应用异常或滚出屏外；⑥ 状态栏四项（模型/大小/体检计数/批量进度）齐全；⑦ 既有冒烟断言（体检数值与配色、拖动不刷日志而 `change` 记矩阵、上轴复合矩阵、体检失败不打断预览、输入文件哈希不变）一条不落
- **实际/证据**：`node test/ui-smoke.cjs` 在 `model/蹲姿.glb` 与 `o-model/蹲姿.ive` 上**各 34 步 / 110 条断言 / 0 项失败**（既有 36 条 check 一条未删）。默认 1100×760 实测：左 260 / **中 492（最宽）** / 右 340，底部 200，3D 画布 492×274，`scrollWidth=1100=clientWidth`、`scrollHeight=760=innerHeight`。独立冷审复核：1280×800 下 360/473/439（中栏最宽）；拖左分隔条 `--pane-left` 349→389（中栏 578→538）、拖右 312→352、拖底 230→270（画布 226→186），**每次真实 `state.viewer.resize()` 被包裹计数 +2**，画布绘图缓冲 639→719；折叠日志画布 204→440、展开精确回到 204；注入破坏性 CSS 后 `scrollHeight` 760→1026，证明"不整页滚动"断言非空；11 组垃圾 `localStorage` 载荷（`not json`/`{}`/越界/`version:99`/`null`/`[]`/布尔串…）与把 `localStorage` 存取改成 throw 后，页面异常 0、布局一律落回合法区间；50 次 `pointermove` 爆发期间 0 次 resize、下一帧 2 次（`applyLayout` 的 rAF 与 `ResizeObserver` 回调各 1，仍在同一帧内合并，非缺陷）；900×700 下 `scrollWidth==clientWidth`（抽屉开/关皆然）、抽屉可键盘开关。**第二轮冷审（交付前）**把"画布最小高度"从写死的 `>120` 改成引用模块常量 `window.__layout.limits.canvasMinHeight`，并新增"日志拖到上限后画布仍 ≥ 常量"的断言；种入 `bottom:99999` 重载后实测 **画布 161px ≥ 160、中栏标题行 34px**（旧代码漏算这 34px，同口径只有 127，故该断言在旧代码上为红）。同轮加**假绿防线**：任一步骤超时/未返回即红 + 已执行断言数下限（新增断言后须同步抬高 `EXPECTED_CHECK_COUNT`，TASK-012 后为 110）+ 真正安装页面错误采集（`window.__smokeErrors` 此前是死字段）。`npm run lint` 通过；`npm test` → **106 用例 / 102 通过 / 0 失败 / 4 跳过**。人工目视（拖拽手感、配色层级）**待 sunny-zhai 确认**。

### TC-016 栏位尺寸不得被数据/临时面板改写（REQ-006 缺陷回归，TASK-011）
- **关联需求**：REQ-006（回归验收标准 2/3/5）；设计决策见 `docs/design/ADR.md` 的 ADR-007 与 `docs/001-code-design.md` 的 BR-028
- **层级**：集成（CDP 驱动真实渲染进程，直接改写模型信息文本与帮助面板开关，并在每次变更后强制一次 `resize` 重算）
- **前置**：同 TC-015（`npx electron . --remote-debugging-port=9333`；沙箱/无 GPU 环境加 `--no-sandbox --disable-gpu-sandbox --user-data-dir=/tmp/glb-smoke`）
- **步骤**：
  1. 在 1280×800 下把日志高度**顶到当前窗口上限**并走一次真实保存（键盘微调 0px → `commitLayout` + `saveLayout`），记录基线（预览条高度 / `--pane-bottom` / `localStorage.bottom` / 画布高度）
  2. 把 `#validationModelSummary` 文本换成 400 字长文本（等价于加载超长路径模型），然后 `window.dispatchEvent(new Event('resize'))` 强制重算
  3. 换回原文本再重算一次
  4. 在帮助关闭状态下把日志重新顶到上限并保存，打开帮助面板 → 重算，再收起 → 重算
- **期望**：① 步骤 2 后预览条高度、`--pane-bottom`、`localStorage.bottom` **三者都不得变化**；② 步骤 3 后预览条/画布/日志高度与基线**逐像素一致**（不许有残留偏移）；③ 步骤 4 打开与收起帮助都不得改 `--pane-bottom` 与落盘值（帮助只允许临时占用工作区高度，因此画布可能临时变矮，这是有意的）
- **实际/证据**：修复后 `node test/ui-smoke.cjs` 在 `model/蹲姿.glb` 与 `o-model/蹲姿.ive` 上**各 34 步 / 110 条断言 / 0 项失败**。**这 6 条断言在修复前的代码（`b8bdddc`）上实测全红**：预览条 99→189px、`summary` 18→108px（3 行）、日志 380→290px **且 `localStorage.bottom` 380→290**、换回短文本后仍是 290（画布 160→250 残留偏移）、打开/收起帮助同样改写日志高度与落盘值；修复后同一场景实测：预览条 126 恒定、画布 161 恒定、日志 313 恒定、`localStorage` 里用户设定的 367 **未被改写**。另修掉一个连带问题：`white-space: nowrap` 曾把 `.pane-center` 的隐式网格列撑到 2994px（`grid-template-columns: minmax(0, 1fr)` 修复），这也是拖拽宽度断言偏 4px 的根因。`npm run lint` 通过；`npm test` → **106 用例 / 102 通过 / 0 失败 / 4 跳过**。

### TC-017 细滚动条 + 每区只留最外层滚动条（REQ-006 体验细化，TASK-012）
- **关联需求**：REQ-006；设计判据见 `docs/001-code-design.md` 的 BR-029
- **层级**：集成（CDP 驱动真实渲染进程：读样式表规则 + 灌满内容后数各区域的滚动容器）
- **前置**：同 TC-015（`npx electron . --remote-debugging-port=9333`；沙箱/无 GPU 环境加 `--no-sandbox --disable-gpu-sandbox --user-data-dir=/tmp/glb-smoke`）
- **步骤**：
  1. 遍历 `document.styleSheets`，找 `::-webkit-scrollbar`（非 thumb/track/corner）规则并读其 `width`
  2. 用**真实渲染函数**把内容灌满：`state.inputPaths` 60 条超长路径 + `renderInputs()`、`renderResults()` 40 条、`renderInspectIssues()` 40 条问题 + 显示 `#inspectPanel`、`appendLog()` 500 行
  3. 对 `#paneLeft` / `#paneRight` / `#paneBottom` 各自枚举 `[自身, ...后代]`，统计 `overflow-y` 为 `auto|scroll` 的元素个数，以及其中"实际已出现滚动条"（`scrollHeight > clientHeight + 1`）的个数
- **期望**：① 存在 `::-webkit-scrollbar` 且 `width === '8px'`；② 三个区域**各恰好 1 个**滚动容器且它已真的滚起来（左/右栏是 `.pane-body`，日志区是 `.log`）；③ 内容灌满后页面本身仍不整页滚动
- **实际/证据**：修复前审计（运行中实例）：左栏 `div.pane-body` + `ul#inputList` + `ul#resultList` **3 个**滚动条，右栏 `div.pane-body` + `ul#inspectIssues` **2 个**，日志区 `pre#log` **1 个**（本就合规）。**新增 5 条断言在旧样式（HEAD）上实测 3 红 2 绿**——红的是"细滚动条规则缺失（null）"、"左栏非 1 个"、"右栏非 1 个"，绿的两条（日志区唯一、页面不整页滚动）本来就成立，说明断言与真实差异同向。修复后：三区域各恰好 1 个滚动容器且都有滚动条，页面无整页滚动；冒烟 `node test/ui-smoke.cjs` 在 `model/蹲姿.glb` 与 `o-model/蹲姿.ive` 上**各 34 步 / 110 条断言 / 0 项失败**；`npm run lint` 通过；`npm test` → **106 用例 / 102 通过 / 0 失败 / 4 跳过**。

### TC-018 多格式输入：FBX/OBJ → 自包含 GLB 并进全链（REQ-007）
- **关联需求**：REQ-007（验收标准 1~10）；设计决策见 `docs/design/ADR.md` 的 ADR-008 与 `docs/001-code-design.md` 的 BR-030
- **层级**：单元（`test/convert.test.js`，9 用例）+ 集成（`test/ui-smoke.cjs` 在 FBX/OBJ 上各一遍）+ 端到端（真实 IPC 批量修复落盘）+ 人工目视
- **前置**：`o-model/蹲姿.fbx`、`o-model/蹲姿.obj`、`o-model/蹲姿.glb`（绑定姿态参考件）、`model/蹲姿.glb`（蹲姿参考件）；夹具缺失时单测按 `convertSkipReason()` 跳过
- **步骤**：
  1. `node --test test/convert.test.js`
  2. `node test/ui-smoke.cjs o-model/蹲姿.fbx --port 9333`，再用 `o-model/蹲姿.obj` 各跑一遍
  3. 通过真实 IPC `repairGlb({inputPaths:[fbx, obj], outputDir})` 批量落盘，检查输出目录
- **期望**：① FBX → 18,924 面 / ≥3 张内嵌贴图 / 0 外部 uri / 保留 1 蒙皮 1 动画 / 世界盒与 `o-model/蹲姿.glb` 三轴一致；② OBJ → 18,924 面 / 0 外部 uri / 世界盒 `0.5382×1.3643×1.0559`（与 `model/蹲姿.glb` 一致）；③ 焊接把 56,772 顶点压到 11,516 且面数不变、文件更小；④ MTL 里解析不到的乱码绝对路径必须以 warning + `missing:` 占位出现；⑤ 坏文件返回中文错误且不抛；⑥ 同名不同扩展名的两个源必须产出**两个**输出文件
- **实际/证据**：单测 **9 用例 / 9 通过**；冒烟在 `o-model/蹲姿.fbx` 与 `o-model/蹲姿.obj` 上**各 34 步 / 110 条断言 / 0 失败**，`model/蹲姿.glb` 与 `o-model/蹲姿.ive` 不回归；真实 IPC 落盘 `蹲姿.glb`(15.1MB) 与 `蹲姿-obj.glb`(599KB) 均 `success`（修掉撞名覆盖缺陷前后差异明显：修复前只落一个文件而两条都报成功）；`npm run lint` 通过；`npm test` → **115 用例 / 111 通过 / 0 失败 / 4 跳过**。人工目视（FBX/OBJ 在 Cesium 里直立贴地、贴图正确）**待 sunny-zhai 确认**。

## 必测维度勾选

- [x] 成功路径（TC-001～TC-005、TC-008）
- [x] 非法参数（TC-005 不可解码 JPEG、TC-010 非 IVE / 不可读文件）
- [x] 无数据 / 空集合（`repairMany` 空目录走「未找到」提示；`weldVertices` 无可合并时返回 `null`）
- [ ] 权限不足 —— **不适用**：单机桌面工具，无鉴权模型
- [x] 外部失败（TC-010 外部贴图缺失、助手缺失）
- [x] 重复操作 / 幂等（`weldVertices`/`axisConversion:false` 可反复执行；`memory check` 对结构快照幂等）
- [x] 数据边界（三角汤 56,772 顶点；NPOT 贴图退化为 CLAMP_TO_EDGE；`1×1` 占位贴图；0 长度 buffer）

## 覆盖率

`node --test --experimental-test-coverage "test/*.test.js"` 实测（**2026-09-20 复测**，本地夹具齐备；此时 `convert.js` 已加入，`inspect.js`/`transform.js`/`report-format.js`/`preview-transform.js` 已在）：

| 文件 | 行 % | 分支 % | 函数 % |
| :-- | --: | --: | --: |
| `src/convert.js` | 94.55 | 74.50 | 93.10 |
| `src/ive.js` | 96.07 | 70.19 | 98.21 |
| `src/repair.js` | 89.32 | 64.29 | 90.28 |
| `src/inspect.js` | 94.02 | 83.39 | 94.87 |
| `src/transform.js` | 100.00 | 93.80 | 100.00 |
| `src/report-format.js` | 99.35 | 95.86 | 100.00 |
| `src/preview-transform.js` | 100.00 | 97.30 | 100.00 |
| **all files** | **94.00** | **77.75** | **95.56** |

说明：

- 未覆盖行集中在 `repair.js` 的动画采样/骨骼烘焙分支、`convert.js`/`ive.js` 的错误处理分支与 `inspect.js`/`report-format.js` 的少数异常分支——需要专门样本（带动画的 skinned 模型、损坏的 IVE、畸形 GLB 的具体形态），当前夹具没有。
- **Electron 壳层（`src/main.js`、`src/preload.js`、`src/renderer.js`）不在插桩范围内**（测试不 require 它们），所以"UI ≥85%"这一项**没有测量**，不要按通过理解。
- 因此本计划**不设覆盖率门槛**；把门槛写进 CI 需先补样本与插桩，属后续工作。
- 覆盖率数字**随用例集与夹具演进**：本表只记录当次实测值，需求正文不钉死快照（REQ-002 验收标准 3 的口径）。

## 结果汇总

| 用例 | 关联 REQ | 结果 | 证据 |
| :-- | :-- | :-- | :-- |
| TC-001 | REQ-002 | 通过 | `node --test test/repair.test.js` → `pass 20 / fail 0`（夹具缺失时 6 跳过） |
| TC-002 | REQ-002 | 通过 | `node --test test/ive.test.js` → 24 用例，本地 `pass 21 / skip 3 / fail 0`（缺 `o-model/person-move.ive`） |
| TC-003 | REQ-002 | 通过 | 世界盒 `0.538 × 1.364 × 1.056`，`min.y = 0` |
| TC-004 | REQ-002 | 通过 | 56,772 → 11,516 顶点；18,924 面逐三角形等价 |
| TC-005 | REQ-002 | 通过 | 4/4 用例；PNG 签名与 `JPEG 转 PNG 失败` 均断言 |
| TC-006 | REQ-002 | 通过 | 全新克隆 `tests 119 / pass 100 / fail 0 / skipped 19`；本地 `pass 115 / skipped 4` |
| TC-007 | REQ-002 | 通过 | `npm run lint` 遍历全部 10 个 `src/*.js` 全过 |
| TC-008 | REQ-002 | 通过 | 三个 IVE 全链路 `success` |
| TC-009 | REQ-002 | 通过 | 2/2 用例 |
| TC-010 | REQ-002 | 通过 | 异常路径全部有断言 |
| TC-011 | REQ-002 | 通过 | 嵌套相对路径保留 |
| TC-012 | REQ-002 | **通过**（人工） | sunny-zhai 于 2026-09-18 在应用内确认 IVE 与 GLB 均可渲染 |
| TC-013 | REQ-005 | 通过 | `node --test test/inspect.test.js` → 38 用例，本地 `pass 37 / skip 1（缺 o-model/运输车.glb）/ fail 0`；本地语料 0 崩溃、最慢 1ms、三角面数全等；历史全量语料 21 个时运输车偏差 4461.888 倍、最慢 11ms |
| TC-014 | REQ-005 | 通过（自动）/ 待人工 | 纯函数 24/24（`report-format` 16 + `preview-transform` 8）；接线冒烟在 `model/蹲姿.glb` 与 `o-model/蹲姿.ive` 上各 8 步、0 项失败（含改造后必须真出现「加载成功」）；输入文件哈希前后一致；人工目视待 sunny-zhai 确认 |
| TC-015 | REQ-006 | 通过（自动）/ 待人工 | 冒烟 34 步 / 110 条断言 0 失败（GLB/IVE 各一遍）；默认布局无整页滚动、3D 最宽；分隔条拖拽真实调用 `viewer.resize()`；布局恢复与垃圾载荷鲁棒；人工目视待 sunny-zhai 确认 |
| TC-016 | REQ-006 | 通过（自动）/ 待人工 | TASK-011 缺陷回归：模型信息长短文本 + 帮助开关都不得改变预览条/日志高度与落盘布局；换回短文本必须精确复原。修复前代码上这 6 条实测全红，修复后 GLB/IVE 各 34 步 / 110 条断言 0 失败 |
| TC-017 | REQ-006 | 通过（自动）/ 待人工 | TASK-012：自绘 8px 细滚动条规则存在；内容灌满后左/右/日志三区各恰好 1 个滚动容器且都真滚动、页面仍不整页滚动。旧样式上这 5 条中 3 条实测红（细条规则缺失、左栏 3 个、右栏 2 个）；修复后 GLB/IVE 各 34 步 / 110 条断言 0 失败 |
| TC-018 | REQ-007 | 通过（自动）/ 待人工 | 多格式输入：FBX 18,924 面/3 张内嵌贴图/保留蒙皮动画、OBJ 世界盒与 `model/蹲姿.glb` 一致；焊接 56,772→11,516 面数不变；解析不到的贴图以 warning+占位如实上报；撞名不再互相覆盖；`test/convert.test.js` 13 用例（本地全跑，缺夹具时 5 跳过） |

**总计**（2026-09-20 实测）：`npm test` → **119 用例 / 115 通过 / 0 失败 / 4 跳过**。4 个跳过均为夹具门控（1 个需 `o-model/运输车.glb` 的体检真值用例 + 3 个需 `o-model/person-move.ive` 的 IVE 用例）。全新克隆（无任何夹具）为 **119 用例 / 100 通过 / 0 失败 / 19 跳过**（19 = `repair` 6 + `ive` 5 + `inspect` 3 + `convert` 5；用 `git worktree add --detach` 的干净检出实测）。

## 待执行（REQ-008 / REQ-009 / REQ-010，2026-09-20 登记，尚未实现）

| 用例 | 关联 REQ | 状态 | 覆盖内容 |
| :-- | :-- | :-- | :-- |
| TC-019 | REQ-008 | 待执行（TASK-017） | 采样器规范化：NPOT × `REPEAT` × mipmap 退化为 `CLAMP_TO_EDGE` + `LINEAR`；POT 与已合法组合**一字不改**；产物全量不变量（无 NPOT 且 REPEAT+mipmap） |
| TC-020 | REQ-008 | 待执行（TASK-018） | 降采样四档：2048² → 1024² 逐像素盒式平均；3000×1000 → 1024×341；「不降」档字节与现状一致；几何 bufferView 逐字节不变；体积目标（person-stand 9.74MB → ≤4MB，夹具缺失时门控） |
| TC-021 | REQ-008 | 待执行（TASK-019） | `KHR_texture_transform.texCoord` 覆盖：体检报 `MISSING_TEXCOORD` 并点名 `TEXCOORD_1`（**该用例在旧代码上必须为红**）；修复补出全零 `TEXCOORD_1` |
| TC-022 | REQ-009 | 待执行（需 Windows x64 环境） | Windows：`ive2glb.exe` 依赖闭包无第三方非系统 DLL；`app-capabilities` 报 `ive: true` 且 `.ive` 世界盒与 darwin 一致；`dist:win` 包内含助手 + wasm + 两份许可证；§4 冒烟逐行回填 |
| TC-023 | REQ-010 | 待执行（TASK-023） | 预览三态记忆：重启恢复 `Z-up/90°/2×` 且提示可见；从未动过不落盘；显式选回 `auto` 被记住；垃圾载荷落回默认且页面异常 0；输入文件哈希不变 |
