# 测试计划（TEST PLAN）

> 由 `testing` 技能维护。每个 REQ 的验收标准都要落到具体用例；完成后回填"结果/证据"。
> 覆盖率门槛：核心逻辑 ≥95% · 测试 ≥90% · 文档 ≥90% · UI ≥85% · 探索 ≥70%（由用户按场景确认）

## 元信息

| 项 | 值 |
| :-- | :-- |
| 项目 | GLB Texture Repair Tool（GLB 贴图修复桌面工具） |
| 覆盖目标 | 核心逻辑 `src/repair.js`、`src/ive.js` 以**实测覆盖率**记录（见「覆盖率」一节），**不设强制门槛**：设门槛必须先接插桩与 CI，现状是本地手工执行 |
| 执行命令 | `npm test`（= `node --test`，自动发现 `test/*.test.js`） |
| 覆盖率命令 | `node --test --experimental-test-coverage` |
| 语法门禁 | `npm run lint`（`node --check` 五个 `src/*.js`：`main`/`preload`/`renderer`/`repair`/`ive`） |
| 夹具 | `refs/models/{person-move,person-stand,蹲姿}.glb`（6.5 MB，**未入库**）；恢复：`mkdir -p refs/models && cp o-model/*.glb refs/models/`。IVE 用例另需 `o-model/*.ive` 与 `vendor/ive2glb/<平台>/ive2glb` |

用例覆盖的是平台采纳**之前**交付的功能，需求来源是 `docs/001-code-design.md` 的 BR-001～BR-017；
`REQ-002` 是这些验证基线本身的登记需求，`REQ-001` 是文档一致性需求。

## 用例清单

### TC-001 修复引擎全量套件（单元 + 集成）
- **关联需求**：REQ-002（验证基线）；覆盖 BR-001～BR-011
- **层级**：单元 + 集成
- **前置**：`refs/models/*.glb` 已在位
- **步骤**：`node --test test/repair.test.js`
- **期望**：19 通过 / 0 失败
- **实际/证据**：`pass 19 / fail 0`

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
- **期望**：不出现失败；跳过 11 个（`repair` 6 + `ive` 5），其余 33 个仍执行；每条跳过都打印缺失文件与恢复命令
- **实际/证据**：实测 `pass 33 / skipped 11 / fail 0`

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

## 必测维度勾选

- [x] 成功路径（TC-001～TC-005、TC-008）
- [x] 非法参数（TC-005 不可解码 JPEG、TC-010 非 IVE / 不可读文件）
- [x] 无数据 / 空集合（`repairMany` 空目录走「未找到」提示；`weldVertices` 无可合并时返回 `null`）
- [ ] 权限不足 —— **不适用**：单机桌面工具，无鉴权模型
- [x] 外部失败（TC-010 外部贴图缺失、助手缺失）
- [x] 重复操作 / 幂等（`weldVertices`/`axisConversion:false` 可反复执行；`memory check` 对结构快照幂等）
- [x] 数据边界（三角汤 56,772 顶点；NPOT 贴图退化为 CLAMP_TO_EDGE；`1×1` 占位贴图；0 长度 buffer）

## 覆盖率

`node --test --experimental-test-coverage` 实测（2026-09-18；样例集裁剪、`inspect.js`/`transform.js` 加入后复测）：

| 文件 | 行 % | 分支 % | 函数 % |
| :-- | --: | --: | --: |
| `src/ive.js` | 95.99 | 70.34 | 98.18 |
| `src/repair.js` | 89.30 | 63.39 | 90.28 |
| `src/inspect.js` | 93.57 | 81.99 | 94.87 |
| `src/transform.js` | 100.00 | 92.97 | 100.00 |
| **all files** | **92.97** | **73.76** | **94.82** |

说明：

- 未覆盖行集中在 `repair.js` 的动画采样/骨骼烘焙分支、`ive.js` 的错误处理分支与 `inspect.js` 的少数异常分支——需要专门样本（带动画的 skinned 模型、损坏的 IVE、畸形 GLB 的具体形态），当前夹具没有。
- **Electron 壳层（`src/main.js`、`src/preload.js`、`src/renderer.js`）不在插桩范围内**（测试不 require 它们），所以"UI ≥85%"这一项**没有测量**，不要按通过理解。
- 因此本计划**不设覆盖率门槛**；把门槛写进 CI 需先补样本与插桩，属后续工作。

## 结果汇总

| 用例 | 关联 REQ | 结果 | 证据 |
| :-- | :-- | :-- | :-- |
| TC-001 | REQ-002 | 通过 | `pass 19 / fail 0` |
| TC-002 | REQ-002 | 通过 | `pass 24 / fail 0` |
| TC-003 | REQ-002 | 通过 | 世界盒 `0.538 × 1.364 × 1.056`，`min.y = 0` |
| TC-004 | REQ-002 | 通过 | 56,772 → 11,516 顶点；18,924 面逐三角形等价 |
| TC-005 | REQ-002 | 通过 | 4/4 用例；PNG 签名与 `JPEG 转 PNG 失败` 均断言 |
| TC-006 | REQ-002 | 通过 | `pass 33 / skipped 11 / fail 0` |
| TC-007 | REQ-002 | 通过 | `npm run lint` 五文件全过 |
| TC-008 | REQ-002 | 通过 | 三个 IVE 全链路 `success` |
| TC-009 | REQ-002 | 通过 | 2/2 用例 |
| TC-010 | REQ-002 | 通过 | 异常路径全部有断言 |
| TC-011 | REQ-002 | 通过 | 嵌套相对路径保留 |
| TC-012 | REQ-002 | **通过**（人工） | sunny-zhai 于 2026-09-18 在应用内确认 IVE 与 GLB 均可渲染 |
| TC-013 | REQ-005 | 通过 | `node --test test/inspect.test.js` 35 通过 / 1 跳过（缺样例 `o-model/运输车.glb`）/ 0 失败；本地 4 个 GLB 0 崩溃、最慢 1ms、三角面数 4/4 全等；历史全量语料 21 个时运输车偏差 4461.888 倍、最慢 11ms |

**总计**：`npm test` → 76 通过 / 0 失败 / 4 跳过（本地夹具：样例集已裁剪，跳过 3 个需 `o-model/*.ive` 的用例与 1 个需 `o-model/运输车.glb` 的用例）。
