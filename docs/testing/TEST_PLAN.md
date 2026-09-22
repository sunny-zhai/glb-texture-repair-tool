# 测试计划（TEST PLAN）

> 由 `testing` 技能维护。每个 REQ 的验收标准都要落到具体用例；完成后回填"结果/证据"。
> 覆盖率门槛：核心逻辑 ≥95% · 测试 ≥90% · 文档 ≥90% · UI ≥85% · 探索 ≥70%（由用户按场景确认）

## 元信息

| 项 | 值 |
| :-- | :-- |
| 项目 | GLB Texture Repair Tool（GLB 贴图修复桌面工具） |
| 覆盖目标 | 核心逻辑 `src/repair.js`、`src/ive.js` 以**实测覆盖率**记录（见「覆盖率」一节），**不设强制门槛**：设门槛必须先接插桩与 CI，现状是本地手工执行 |
| 执行命令 | `npm test`（= `node --test "test/*.test.js"`，glob 由 `package.json` 声明，新用例文件自动纳入） |
| 覆盖率命令 | `node --test --experimental-test-coverage --test-coverage-exclude="vendor/**" "test/*.test.js"`（`--test-coverage-exclude` 用于排除随包分发的 Emscripten 胶水代码，理由见「覆盖率」一节） |
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
- **期望**：36 通过 / 0 失败（2026-09-22 实测 `test/repair.test.js` 共 36 个用例；此前的 20 是 REQ-008 时代的快照）
- **实际/证据**：`pass 35 / skip 1 / fail 0`（跳过项需 `model/person-stand.glb`；全新克隆下 7 个跳过 = 6 个需 `refs/models/*.glb` + 该基线）

### TC-002 IVE 转换全量套件
- **关联需求**：REQ-002；覆盖 BR-008～BR-017
- **层级**：单元 + 集成（含 3 个端到端）
- **前置**：`o-model/*.ive` 存在且 `resolveIveHelper()` 能找到助手
- **步骤**：`node --test test/ive.test.js`
- **期望**：35 用例 / 32 通过 / 3 跳过 / 0 失败（2026-09-22 实测，含 TASK-031 新增的回退、打包只带 WASM、元数据、`searched` 去重 4 条；此前的 24 是 TASK-018 时代的快照）
- **实际/证据**：`pass 32 / skip 3 / fail 0`（3 个跳过均需 `o-model/person-move.ive`）

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
- **期望**：全部 `src/*.js` 通过 `node --check`（当前 **10 个**：`main`/`preload`/`renderer`/`repair`/`ive`/`inspect`/`transform`/`report-format`/`preview-transform`/`convert`；lint 用 `for f in src/*.js` 遍历，新增模块自动纳入）
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
- **实际/证据**：`node --test test/inspect.test.js` → **42 通过 / 2 跳过 / 0 失败**（2026-09-22 实测；两个跳过项分别依赖 `o-model/运输车.glb` 与 `model/蹲姿.glb`，均属本地已删除的样例）。历史全量语料（当时 21 个）实测：运输车 `2.59 × 4.10 × 5.98`、偏差 `4461.888`（accessor 盒 `11571.59 × 15430.28 × 23539.10`）、0 崩溃、最慢 **11 ms**。语料裁剪为 4 个 GLB / 12 张内嵌贴图后复测：**0 崩溃**、最慢 **1 ms**（`蹲姿.glb`，上限 2 s）、12/12 内嵌贴图宽高可读、4/4 文件 `triangles` 与 `Σ(mode=4 索引数)/3` 一致、person 参考件 `vertexReuseRatio` `0.6085`。注：原证据③写作「21/21 `trianglesMatch`」，该判据在无非索引图元时是恒等式、存在非索引图元时必然为假，冷审查已判无效并替换（见 TASK-007 返工记录）；此处的三角面数交叉检查是本次按 `mode=4` + 索引数重算的

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

`node --test --experimental-test-coverage --test-coverage-exclude="vendor/**" "test/*.test.js"` 实测（**2026-09-22 TASK-031 后复测**，含 TASK-027/028 的 WASM 助手解析与原生↔WASM 等价性用例、TASK-031 的打包/回退/去重用例；夹具集为裁剪后的本地语料，分支率有单次运行 ±0.1pp 波动）：

| 文件 | 行 % | 分支 % | 函数 % |
| :-- | --: | --: | --: |
| `src/convert.js` | 94.55 | 74.50 | 93.10 |
| `src/ive.js` | 96.00 | 72.66 | 98.41 |
| `src/repair.js` | 90.87 | 69.84 | 91.76 |
| `src/inspect.js` | 94.31 | 85.00 | 94.87 |
| `src/transform.js` | 100.00 | 93.80 | 100.00 |
| `src/report-format.js` | 99.35 | 95.86 | 100.00 |
| `src/preview-transform.js` | 100.00 | 97.30 | 100.00 |
| **all files** | **95.39** | **81.23** | **96.78** |

说明：

- **`--test-coverage-exclude="vendor/**"` 是必需的，不是可选优化**：`vendor/ive2glb/wasm/ive2glb.js` 是随包分发的 Emscripten 胶水代码，跑用例时由子进程继承的 `NODE_V8_COVERAGE` 采集成覆盖率，不排除会把 `all files` 函数覆盖率从 96.78% 压到 47.99%（它 25.37% 的函数被本项目的用例触达，本身不说明本项目质量）。这与 `node_modules` 不该计入是同一条理由。
- `all files` 的统计范围包含 `src/` 与 `test/`，不含 `vendor/`。
- 未覆盖行集中在 `repair.js` 的动画采样/骨骼烘焙分支、`convert.js`/`ive.js` 的错误处理分支与 `inspect.js`/`report-format.js` 的少数异常分支——需要专门样本（带动画的 skinned 模型、损坏的 IVE、畸形 GLB 的具体形态），当前夹具没有。
- **Electron 壳层（`src/main.js`、`src/preload.js`、`src/renderer.js`）不在插桩范围内**（测试不 require 它们），所以"UI ≥85%"这一项**没有测量**，不要按通过理解。
- 因此本计划**不设覆盖率门槛**；把门槛写进 CI 需先补样本与插桩，属后续工作。
- 覆盖率数字**随用例集与夹具演进**：本表只记录当次实测值，需求正文不钉死快照（REQ-002 验收标准 3 的口径）。

## 人工目视清单（TC-014~TC-018 / TC-024 / TC-025 的人工部分）

> 自动化覆盖不到"看起来对不对"。以下每项给出**可复现步骤**与**判定口径**；确认后把
> `TASKS.md` 进度表与「结果汇总」里对应行的"待人工"改为"已确认"，并记下确认人与日期。
> 建议先 `npm run dev`；样例取 `model/` 与 `o-model/`（都不入库，缺失时按各用例的前置说明准备）。

> **2026-09-20 结果**：sunny-zhai 按本清单在应用内逐项核对，**M-1~M-7 全部通过**（留痕见
> `docs/approvals/APPROVALS.md` 的 delivery 记录）。**M-8 未执行**——它只能在 Windows x64 上做，
> 随 REQ-009 / TASK-021、TASK-022。

| # | 关联 | 步骤 | 判定口径 | 确认 |
| :-- | :-- | :-- | :-- | :-- |
| M-1 | TC-014 / REQ-005 | 选 `o-model/蹲姿.ive` 预览；拖「预览方向」「预览缩放」；上轴切 `Z-up` 再切回 `auto` | 模型**直立、贴地、居中**；拖动即时生效、日志**只在松手时**记一行 `modelMatrix`；切 `Z-up` 后从"躺着"变直立；提示「仅影响预览，不写入输出文件」可见 | ☑ 2026-09-20 sunny-zhai |
| M-2 | TC-015 / REQ-006 | 1280×800 下观察；拖左右分隔条与底部日志；折叠日志再展开；窗口缩到 900px | 一屏内左队列/中 3D/右体检/底日志同时可见且**不整页滚动**；3D 始终最宽；折叠后 3D 变高、展开精确复原；900px 降级两栏 + 抽屉、无横向滚动 | ☑ 2026-09-20 sunny-zhai |
| M-3 | TC-016 / REQ-006 | 打开/收起「帮助」；加载一个**超长路径**的模型 | 帮助只临时占用高度、不改日志高度；超长路径不把预览条撑高、不顶掉 3D 画布 | ☑ 2026-09-20 sunny-zhai |
| M-4 | TC-017 / REQ-006 | 左栏灌几十个输入、右栏几十条体检问题、日志几百行 | 每区只有**一根**细滚动条（8px 自绘）、无嵌套第二根；页面本身不滚动 | ☑ 2026-09-20 sunny-zhai |
| M-5 | TC-018 / REQ-007 | 选 `o-model/蹲姿.fbx` 与 `o-model/蹲姿.obj` 预览 | FBX/OBJ **直立、贴地、贴图正确**；OBJ 会有一张 1×1 占位贴图（MTL 里是乱码绝对路径，属预期）；无着色器编译错误 | ☑ 2026-09-20 sunny-zhai |
| M-6 | TC-024 / REQ-011 | 拖出非默认构图 → 依次拉宽到 1100 / 1440 / 1920 → 重启应用 | 各区占宽高比例**看起来不变**（不出现"中栏越来越胖"）；重启后构图一致；输入/结果内容再多也不改变栏位尺寸 | ☑ 2026-09-20 sunny-zhai |
| M-7 | TC-025 / REQ-010 | 设 `Z-up / 90° / 2×` → 重启 → 换一个模型 → 点「重置预览修正」 | 重启后三态保持且日志说明「已沿用上次选择」；重置后回到 `auto/0°/1.00×`，再重启仍是默认 | ☑ 2026-09-20 sunny-zhai |
| M-8 | REQ-009（Windows） | 在 Windows 上安装新包 → 各选一个 `.ive`/`.glb`/`.fbx`/`.obj` | 四种输入都能修复并预览；`app-capabilities` 报 `ive: true`、`assimp: true`；日志出现按格式区分的「… 转换完成」文案 | ☐ 待 Windows 环境（TASK-021/022） |

## 结果汇总

| 用例 | 关联 REQ | 结果 | 证据 |
| :-- | :-- | :-- | :-- |
| TC-001 | REQ-002 | 通过 | `node --test test/repair.test.js` → 36 用例，本地 `pass 35 / skip 1（缺 model/person-stand.glb）/ fail 0`（全新克隆下 7 跳过） |
| TC-002 | REQ-002 | 通过 | `node --test test/ive.test.js` → 35 用例，本地 `pass 32 / skip 3 / fail 0`（3 个跳过均缺 `o-model/person-move.ive`；2026-09-22 含 TASK-031 新增 4 条） |
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
| TC-013 | REQ-005 | 通过 | `node --test test/inspect.test.js` → 44 用例，本地 `pass 42 / skip 2（缺 o-model/运输车.glb 与 model/蹲姿.glb）/ fail 0`；本地语料 0 崩溃、最慢 1ms、三角面数全等；历史全量语料 21 个时运输车偏差 4461.888 倍、最慢 11ms |
| TC-014 | REQ-005 | **通过**（自动 + 人工 2026-09-20） | 纯函数 24/24（`report-format` 16 + `preview-transform` 8）；接线冒烟在 `model/蹲姿.glb` 与 `o-model/蹲姿.ive` 上各 8 步、0 项失败（含改造后必须真出现「加载成功」）；输入文件哈希前后一致；人工目视待 sunny-zhai 确认 |
| TC-015 | REQ-006 | **通过**（自动 + 人工 2026-09-20） | 冒烟 34 步 / 110 条断言 0 失败（GLB/IVE 各一遍）；默认布局无整页滚动、3D 最宽；分隔条拖拽真实调用 `viewer.resize()`；布局恢复与垃圾载荷鲁棒；人工目视待 sunny-zhai 确认 |
| TC-016 | REQ-006 | **通过**（自动 + 人工 2026-09-20） | TASK-011 缺陷回归：模型信息长短文本 + 帮助开关都不得改变预览条/日志高度与落盘布局；换回短文本必须精确复原。修复前代码上这 6 条实测全红，修复后 GLB/IVE 各 34 步 / 110 条断言 0 失败 |
| TC-017 | REQ-006 | **通过**（自动 + 人工 2026-09-20） | TASK-012：自绘 8px 细滚动条规则存在；内容灌满后左/右/日志三区各恰好 1 个滚动容器且都真滚动、页面仍不整页滚动。旧样式上这 5 条中 3 条实测红（细条规则缺失、左栏 3 个、右栏 2 个）；修复后 GLB/IVE 各 34 步 / 110 条断言 0 失败 |
| TC-018 | REQ-007 | **通过**（自动 + 人工 2026-09-20） | 多格式输入：FBX 18,924 面/3 张内嵌贴图/保留蒙皮动画、OBJ 世界盒与 `model/蹲姿.glb` 一致；焊接 56,772→11,516 面数不变；解析不到的贴图以 warning+占位如实上报；撞名不再互相覆盖；`test/convert.test.js` 13 用例（本地全跑，缺夹具时 5 跳过） |
| TC-019 | REQ-008 | 通过（自动） | TASK-017 采样器规范化（BR-031）：NPOT(512×341)+`REPEAT`+`9987` → `CLAMP_TO_EDGE`+`9729` 且体检不再报；POT 与已合法组合逐字段不变；共用采样器时复制一份（原采样器不动）；缺省采样器 / 漏写 `minFilter` 两种情况必报（旧口径漏报）；POT 共用场景不得误报（旧口径误报）；`model/person-stand.glb`（采样器 `{}` + 3 张 POT）修复后 `samplersNormalized = 0` |
| TC-020 | REQ-008 | 通过（自动） | TASK-018 贴图降采样（BR-032）：2048²→1024² 逐像素等于 2×2 盒式平均（期望值由解码后源像素独立算出，mismatches=0）；透明像素 alpha 预乘；3000×1000+1024→1024×341；不传/0/负数都不降且字节不变；几何 bufferView 逐字节不变；外部 `uri` 贴图落盘缩小字节；降采样造出 NPOT 后采样器同趟退化（顺序证明）；person-stand 本地基线 14.31MB(不降) → 4.95MB(1024,2 张) → 1.86MB(512,3 张) |
| TC-021 | REQ-008 | 通过（自动） | TASK-019 `KHR_texture_transform.texCoord` 覆盖（BR-033）：图元有 `TEXCOORD_0`、扩展指向 `TEXCOORD_1` 时体检报 `MISSING_TEXCOORD`（error）并点名 `TEXCOORD_1`，修复补出全零 `VEC2 TEXCOORD_1` 且原 `TEXCOORD_0` 保留；对照（无扩展）不报。**改动前的代码上这 4 条实测 3 红 1 绿** |
| TC-024 | REQ-011 | **通过**（自动 + 人工 2026-09-20） | TASK-024/025 布局占比与内部自适应（BR-034/ADR-011）：同一组拖拽结果在 1100×760 / 1440×900 / 1920×1200 下各区占比与 1280×800 参照相比变化 ≤ 1 个百分点、resize 不得改写落盘占比、中栏仍最宽、极小窗口（880×640）夹取后恢复到 1600×900 占比回到设定值、`version:1` 像素载荷迁移成 v2 且像素还原 ±1px；900×700 ~ 1920×1200 五档下每区滚动容器 1/1/1/0、无横向溢出、3D 画布 243~590px（≥160 且不永远贴底）、状态栏恒 28px、页面不滚动。**改动前的像素模型上占比断言实测为红**（1280×800 → 1920×1200：左 20.44%→13.60%、右 26.73%→17.78%、中 52.83%→68.62%、底 26.46%→17.30%） |

| TC-025 | REQ-010 | **通过**（自动 + 人工 2026-09-20） | TASK-023 预览三态记忆（BR-035）：从未动过预览控件时**不写** `glb-repair.preview` 且控件为默认；显式设成 `Z-up/90°/2×` 后落盘为 `version:1` 记录、重载后三态复原且日志含「已沿用上次选择」；显式选回 `auto` 后记录仍在、重载仍是 `auto`；坏 JSON 与越界/未知档位（`999 / -3 / 'nope'`）被规整到合法区间且不抛异常。旧实现必然为红（重载后回到默认、且探针缺失会让断言数下限先失败） |
| TC-026 | REQ-012 | **通过**（macOS arm64 打包 + 应用内转换已实测；linux-x64 安装包**产出**已实测、运行期待 Linux 机器；win32-x64 / darwin-x64 待各自平台执行） | TASK-030 跨平台打包目标与平台矩阵：`package.json` 新增 `mac`(dmg+zip, identity null)/`linux`(AppImage+deb) 与 `dist:mac`/`dist:linux`；本机实跑 `npx electron-builder --mac --dir` 产出未签名 `.app`（Electron 32.3.3 arm64，cache 重定向到工作区后成功）；包内 `app.asar.unpacked/vendor/ive2glb/darwin-arm64/` 共 17 文件（exe + 14 dylib + 2 插件），assimpjs.wasm 与两份许可证齐全；**直接执行包内助手**跑 `蹲姿.ive` → `{"status":"success",...,"binBytes":28782480}`、退出码 0、`DYLD_PRINT_LIBRARIES` 下 Homebrew 加载数 0。**TASK-028 补充（2026-09-21）**：包内新增 `app.asar.unpacked/vendor/ive2glb/wasm/{ive2glb.js,ive2glb.wasm}`；**在打包应用内**（非"直接执行包内助手"）`convertIveToGlb('o-model/蹲姿.ive')` → `success`、`11516` / `18924` / `0.538×1.364×1.056`；强制 WASM 助手时产物与原生路径**逐字节相同**；`node test/ui-smoke.cjs o-model/蹲姿.ive` 在**打包应用**上 66 步 / 132 条断言 / 0 失败。同一轮修掉一个此前未发现的缺陷：旧 `resolveIveHelper()` 按 asar 优先查找，打包后解析停在 asar 内路径、`spawnSync` 报 `ENOTDIR`（本条原先只验证了"包内助手能直接执行"，没走应用自身的解析，故漏检）；已改为 `app.asar.unpacked` 优先并加回归用例。**TASK-031 补充（2026-09-22）**：包内助手收窄为**只有** `wasm/` 两个文件——`find … -type f -name 'ive2glb*'` 只命中 `ive2glb.js`/`ive2glb.wasm`，`app.asar` 里 `darwin-arm64` 出现 **0** 次（此前 11 MB 的 `darwin-arm64/` 会进**每个**平台的包，REQ-012 标准 2）；打包应用内 `resolveIveHelper()` → `kind: wasm`（解析到 `app.asar.unpacked/vendor/ive2glb/wasm/ive2glb.js`），转换产物与开发态原生助手**逐字节相同**。`npx electron-builder --linux --x64` 在本机（darwin-arm64 宿主）实跑成功，产出 `AppImage`(x86_64) + `deb`(amd64)，deb 的 `Maintainer`/`Vendor`/`Homepage` 齐备（修复前会因 `authorEmailIsMissed` 中止），包内同样只有 wasm 两个文件；`dist:linux` 脚本已固定 `--x64`（不加会按宿主架构产出 arm64，与 linux-x64 的矩阵不符）。**仍未验证**：Linux / Windows / darwin-x64 上的实际安装与运行 |
| TC-027 | REQ-012 | **通过** | TASK-027 IVE→WASM 可行性 spike（ADR-012）：Emscripten 6.0.9 + OSG 3.6.5，630 个目标全部编译；`wasm-ld` 严格模式零未定义符号（53 个固定管线 GL 入口点全部由 `native/ive2glb/wasm/gl-trap-stubs.cpp` 做成陷阱桩，被调用即报错退出码 3，实测该路径一次都不调用）；IVE 插件静态注册、无需改动 OSG 源码；`-sNODERAWFS=1` 文件 IO 与原生退出码逐项一致；产物 2.79 MB、单文件约 102 ms（darwin 对照 62.7 ms）；WASM 与原生助手在 `o-model/蹲姿.ive` 上 `scene.json`/`data.bin` 及全链路 GLB **SHA-256 相同**。复现：`scripts/build-ive2glb-wasm.sh o-model/蹲姿.ive` |

**总计**（2026-09-22 实测，含 REQ-012 的 TASK-027~031）：`npm test` → **152 用例 / 146 通过 / 0 失败 / 6 跳过**（本地夹具只有 `o-model/蹲姿.*`、`model/` 为空；6 个跳过 = `o-model/运输车.glb` 1 + `model/蹲姿.glb` 1 + `model/person-stand.glb` 1 + `o-model/person-move.ive` 3）。**本地跳过数必须按当次夹具集陈述，不得写成常量**（口径见上文 TC-001）：夹具齐备时（2026-09-21，当时 148 用例）为 144 通过 / 0 失败 / 4 跳过。全新克隆（无任何夹具）为 **152 用例 / 128 通过 / 0 失败 / 24 跳过**（24 = `repair` 7 + `ive` 9 + `inspect` 3 + `convert` 5；用 `git worktree add --detach HEAD` 的干净检出实测。`ive` 由 5 → 7 → 9：TASK-028 两条依赖 `蹲姿.ive` 与原生助手，TASK-031 两条依赖 `蹲姿.ive`）。冒烟另计：`node test/ui-smoke.cjs` 在 **GLB / IVE / FBX / OBJ 四格式上各 66 步 / 132 条断言 / 0 失败**（TC-024 的占比与多尺寸断言把计数从 114 抬到 126，TC-025 的预览记忆断言再抬到 132；"36 步 / 114 条断言"是 TASK-018 时代的口径）。**打包后**的 `o-model/蹲姿.ive` 冒烟同样 66 步 / 132 条断言 / 0 失败（TASK-028 实测，见 TC-026）。

## 待执行 / 已取代

> REQ-008 的 TC-019~TC-021 已执行完毕，见上方结果汇总。

| 用例 | 关联 REQ | 状态 | 覆盖内容 |
| :-- | :-- | :-- | :-- |
| TC-022 | REQ-009 | **已取代（被 REQ-012）**：REQ-009 的 TASK-021/022 已取消，Windows 原生助手不再构建。同一覆盖面（包内容、`ive: true`、世界盒一致）改由 **REQ-012 的 §4 ★ 行**在四个目标平台上承接（见 `RELEASE_CHECKLIST.md` §3/§4） | Windows：`ive2glb.exe` 依赖闭包无第三方非系统 DLL；`app-capabilities` 报 `ive: true` 且 `.ive` 世界盒与 darwin 一致；`dist:win` 包内容；§4 冒烟逐行回填 |
| TC-023 | REQ-010 | **已完成 → 由 TC-025 覆盖**（TASK-023 已交付，REQ-010 已完成；同一验收在 TC-025 判定为通过） | 预览三态记忆：重启恢复 `Z-up/90°/2×` 且提示可见；从未动过不落盘；显式选回 `auto` 被记住；垃圾载荷落回默认且页面异常 0；输入文件哈希不变 |
