# 发布检查清单（RELEASE CHECKLIST）

> 由 `release` 技能维护。**预检未全绿不得发布**；发布后回填证据。
> 关联需求：REQ-002（验证基线）、REQ-005（模型体检）、REQ-007（多格式输入）、REQ-009（Windows 分发，发布前置） ｜ 发布版本：v0.1.1（版本分支）｜ 产品版本（`package.json`）：`0.1.0`——**本次决定不升**，见 §3 ｜ 责任人：@sunny-zhai
>
> **状态（2026-09-20）**：预检（§1）已全绿，但 **§3 发布与 §4 冒烟整体未执行——发布已决定推迟**，等 Windows IVE 助手补齐（REQ-009 / TASK-021、TASK-022）后再走一遍本清单。

本清单只写**本项目真实可执行**的项。桌面单机工具没有服务端概念，凡不适用的项都显式标注
"不适用"而不是留空——留空会让评审人误以为漏做。

## 1. 预检（Preflight）

- [x] 关联 REQ 已验收：REQ-001（TASK-001/002/003）、REQ-002（TASK-004）、REQ-003/REQ-004（追溯登记）、REQ-005（TASK-007 经两轮独立复审关闭，TASK-008/009 已完成，**人工目视待确认**）、REQ-006（TASK-010~012 已完成，**人工目视待确认**）、REQ-007（TASK-013~016 已完成，**人工目视待确认**）。REQ-008/REQ-009/REQ-010 已于 2026-09-20 登记但**尚未实现**（见 §6）
- [x] 全量测试通过：`npm test` → **119 用例 / 115 通过 / 0 失败 / 4 跳过**（本地夹具：4 个跳过均为夹具门控——1 个需 `o-model/运输车.glb` 的体检真值用例 + 3 个需 `o-model/person-move.ive` 的 IVE 用例）；**全新克隆（无任何夹具）实测 119 用例 / 100 通过 / 0 失败 / 19 跳过**（`git worktree add --detach` 干净检出，跳过 19 = `repair` 6 + `ive` 5 + `inspect` 3 + `convert` 5）；`npm run lint` 通过
- [x] 覆盖率已**实测并记录**：`all files` 行 94.00% / 分支 77.75% / 函数 95.56%（**2026-09-20 复测**，含新增的 `convert.js` 94.55%、`inspect.js` 94.02%、`transform.js` 100.00%）。**未设强制门槛**（无插桩门槛、无 CI），Electron 壳层未纳入插桩——详见 `docs/testing/TEST_PLAN.md` 覆盖率一节
- [x] 独立审查（reviewer 冷上下文）已通过：REQ-005 的 TASK-007 经**两轮**独立复审（第一轮不通过 → 修复 → 第二轮「有条件通过」，2 个阻塞级 + 11 项残留缺陷已修）、REQ-006 的 TASK-010 经**两轮**冷审（画布最小高度未兑现等已修）、REQ-007 的 TASK-016 修掉冷审 6 条重要项（含 3 条可复现反例）；见 `docs/requirements/TASKS.md` 的返工记录与完成线。**REQ-008/REQ-009 的规格闸门 ① 与架构闸门 ② 待确认**（ADR-009/ADR-010）
- [x] 无未解决的阻断级缺陷：已知问题见 §6「已知问题」，均不阻断发布但必须在发布说明中写明
- [x] 依赖与许可证检查（**2026-09-20 解除阻塞**）：生产依赖为 `jpeg-js@^0.4.4`（**BSD-3-Clause**）、`pngjs@^7.0.0`（MIT）、`assimpjs@^0.0.10`（MIT，内含 assimp 本体 **BSD-3-Clause**；`node_modules/assimpjs/dist/license.assimp.txt` 与 `license.assimpjs.txt` 随包分发）；几者均无原生扩展。此前记录的"`npm audit` 在本机跑不了"是**默认镜像源**的问题（未实现 `/-/npm/v1/security/advisories/bulk`，返回 `NOT_IMPLEMENTED`）；换官方源实测通过：`npm audit --registry=https://registry.npmjs.org --omit=dev` → **found 0 vulnerabilities**
- [x] 无明文凭证入库：对 `src/`、`scripts/`、`package.json` 做过关键词扫描，未发现密钥/令牌；仓库内无 `.env`

## 2. 迁移（Migration）

| 项 | 内容 | 可重入 | 可回滚 | 已演练 |
| :-- | :-- | :-- | :-- | :-- |
| DB schema | **不适用**（无数据库、无服务端） | — | — | — |
| 数据回填 | **不适用** | — | — | — |
| 配置变更 | `npm run ensure:cesium` 下载并解包 Cesium **1.128** 到 `vendor/cesium/`（幂等：已存在则跳过）；`index.html` 以相对路径加载该版本，升版本必须同步改路径与 CSP | ☑ | ☑ | ☐ |
| 依赖升级 | `electron` / `electron-builder` 为 devDependencies；业务运行时依赖只有 `jpeg-js`（BSD-3）+ `pngjs`（MIT）+ `assimpjs`（MIT，wasm 需 `asarUnpack`） | ☑ | ☑ | ☐ |
| **产物兼容性** | v0.1.0 起转换产物的**轴位/落地/顶点数**都变了（见 §6 破坏性变更）。用旧版工具转换过的 GLB 若要与新产物同场景摆放，必须**用新版重新转换**；原始 `.ive/.glb` 源文件本身不受影响 | ☑ | ☑ | ☐ |

## 3. 发布（Release）

- [ ] 目标环境：最终用户 **Windows x64**（NSIS 安装包 + 便携版）；开发/自用 **macOS arm64**（`npm run dev`）
- [ ] **版本号口径（已决定，无需再改）**：平台版本分支是 `release/v0.1.1`，但 `package.json` 的 `version` **保持 `0.1.0`**——本轮内容整体仍按 0.1.0 交付。注意 `electron-builder` 的 `artifactName` 取自 `package.json`，所以产物名是 `0.1.0`；将来真正升版本时必须同步改 `package.json`（`version.mjs bump` 只管版本分支，不会动它），否则产物名会与版本分支长期不一致
- [ ] 发布产物（`electron-builder` 按 `artifactName` 模板生成，输出目录 `dist/`）：
  - `GLB Texture Repair Tool-Setup-0.1.0.exe`（NSIS，可选安装目录、桌面/开始菜单快捷方式）
  - `GLB Texture Repair Tool-0.1.0-win-x64.exe`（portable）
- [ ] 执行命令：`npm run dist:win`（脚本内先跑 `ensure:cesium`）
- [ ] 打包正确性：`package.json` 的 `files` 含 `vendor/ive2glb/**/*`，且 `asarUnpack` 含 `vendor/ive2glb/**`——**助手必须解包到 asar 外**，asar 内的文件无法执行
- [ ] 打包正确性（REQ-007）：`asarUnpack` 还必须含 `node_modules/assimpjs/dist/**`——`assimpjs.wasm` 是按 `__dirname` 从磁盘读的，留在 asar 内会读不到；安装后 `app-capabilities` 必须报 `assimp: true`（该探测会真正加载一次 wasm——只查 JS 模块会有假阳性）、`o-model/蹲姿.fbx`/`蹲姿.obj` 能预览与落盘（Windows 上同样是 WASM，不依赖任何原生二进制）；dist 里必须能看到 `assimpjs/dist/license.assimp.txt`、`license.assimpjs.txt` 两份许可证文件
- [ ] 灰度 / feature flag：**不适用**（桌面安装包）
- [ ] 观测就绪：无遥测、无服务端指标。用户侧可见：界面日志面板（含 `坐标 …/尺寸 …/顶点 …` 行）+ 主进程控制台

> ⚠️ **发布前必须处理的前提（当前正是"推迟发布"的原因）**：`vendor/ive2glb/` 目前**只有 `darwin-arm64`**，没有 `win32-x64/ive2glb.exe`。
> 这意味着 Windows 安装包里**不含 IVE 转换助手**，用户打开 `.ive` 会得到 BR-012 的中文降级提示（应用不会崩，
> 但 IVE 功能不可用）。两条路：① 按 `native/ive2glb/README.md` 在 Windows 上构建并入库 `win32-x64/`（**已选**：见
> REQ-009 / ADR-010 / TASK-021）；② 若最终只能发 GLB 修复能力，则在发布说明中明确声明该限制（REQ-009 验收标准 6）。
> 另外 `dist/` 里现存产物是 **2026-09-15** 构建的 `0.1.0` 旧包，早于 REQ-005/006/007，**不代表当前代码**，发布前必须重打。

## 4. 冒烟（Smoke）

> 行首 **★** = 必须在 **Windows x64** 上执行；其余行在 macOS 开发机上即可执行并回填。

| 关键路径 | 命令 / 步骤 | 期望 | 实际 | 结果 |
| :-- | :-- | :-- | :-- | :-- |
| 应用启动 | `npm run dev` | 窗口出现，自定义标题栏（最小化/最大化/关闭）可用，启动日志出现 IVE 能力探测结果 | 主进程 + 渲染进程均起，`Cesium 1.128 is already available locally` | ☑ |
| GLB 修复 | 选 `model/蹲姿.glb` → 批量修复 | 日志 `修复完成` + `贴图：未降采样（档位「不降」…）`；产物可在预览里渲染 | | ☐ |
| IVE 转换 | 选 `o-model/蹲姿.ive` → 批量修复 | 日志出现 `IVE 转换完成：… 坐标 Z-up→Y-up + 贴地 + 水平归心`、`尺寸 0.54 × 1.36 × 1.06 m`、`顶点 11516（同类合并前 56772）`、`三角面 18924` | | ☐ |
| FBX 转换（REQ-007） | 选 `o-model/蹲姿.fbx` → 批量修复 | 日志 `FBX 转换完成：… 贴图 3 张，网格 3 个，坐标 …`；`三角面 18924`；产物可预览（无外部 `uri` 残留） | | ☐ |
| OBJ 转换（REQ-007） | 选 `o-model/蹲姿.obj` → 批量修复 | 日志 `OBJ 转换完成：…`、世界盒 `0.54 × 1.36 × 1.06 m`；**转换告警**里列出 MTL 引用的乱码路径贴图，并说明已用 1×1 占位替换 | | ☐ |
| 贴图降采样（REQ-008） | 修复选项选「最长边 1024」→ 选 `model/person-stand.glb` → 批量修复 | 日志 `贴图降采样：N 张，最长边 ≤ 1024px，… → …`；产物小于「不降」档；贴图张数与面数不变 | | ☐ |
| Cesium 预览 | 修复完成后右侧视图自动校验 | 模型**直立、落地、居中**，贴图无倒置/无缺失 | 人工验收：IVE 转换产物与 GLB 均正常渲染（sunny-zhai，2026-09-18）；直立/落地由世界盒断言兜底 | ☑ |
| 预览修正记忆（REQ-010） | 设 `Z-up / 90° / 2×` → 重启应用 → 选任意模型 | 三个控件仍是该组合，日志出现「已沿用上次选择」 | | ☐ |
| 布局占比（REQ-011） | 拖分隔条 → 拉伸窗口两次 | 各区占宽高比例不变（视觉上不漂移）；重启后比例保持 | | ☐ |
| 嵌套目录结构 | 选含子目录的输入目录 | 输出保留相对子目录结构（不是全部平铺到输出根） | | ☐ |
| 输出体积 | 对比源与产物 | 蹲姿 27.25 MB → 2.43 MB；修复后体积不变 | | ☐ |
| 坏输入不阻断 | 目录内混入损坏 GLB | 该项失败并计入 `failed`，后续文件继续处理 | | ☐ |
| ★ 包内容（解包后） | 解包安装目录下 `resources\app.asar.unpacked\` | 存在 `vendor\ive2glb\win32-x64\ive2glb.exe`、`node_modules\assimpjs\dist\assimpjs.wasm`、`license.assimp.txt`、`license.assimpjs.txt` | | ☐ |
| ★ 依赖闭包 | `dumpbin /dependents …\ive2glb.exe`（与 `osgPlugins\osgdb_ive.dll`） | 只剩系统 DLL；无 `osg*`/`zlib*`/`libpng*`/`freetype*` 等第三方 DLL | | ☐ |
| ★ 助手自检（不依赖 GUI） | 见 `native/ive2glb/README.md` §「不依赖 GUI 的自检」两条命令 | 助手 stdout 一行 `{"status":"ok",…}`；Node 侧 `success [0.538, 1.364, 1.056] 11516 18924` | | ☐ |
| ★ Windows 安装包 | 安装 → 启动 → 修复一个 `.glb` 与一个 `.ive` | 可启动；`app-capabilities` 报 `ive: true`、`assimp: true`；两种输入都能修复并预览 | | ☐ |

## 5. 回滚预案（Rollback）

- **触发条件**（任一）：安装后无法启动；IVE 转换大面积失败；转换产物在 Cesium 中渲染异常（倒置/悬空/贴图错位）；修复后体积异常膨胀到不可用
- **回滚步骤**：
  1. 卸载当前版本（NSIS 安装版）；便携版直接删除目录
  2. 重新安装**上一个发布版本**的安装包（**前提：`dist/` 历史产物或 GitHub Release 附件保留旧安装包**）
  3. 用旧版重新转换受影响的模型（见下）
  4. 按 §4 冒烟表确认恢复
- **迁移回退**：无数据库。模型产物的回退方式是**用旧版工具重跑**——工具对输入只读，原始 `.ive`/`.glb` 从未被修改，因此回退不会丢数据
- **回滚验证**：安装旧版 → 打开同一个 `.ive` → 对比产物的世界盒与顶点数（旧版蹲姿为 `0.538 × 1.056 × 1.171`、56,772 顶点；新版为 `0.538 × 1.364 × 1.056`、11,516 顶点），数值符合即视为回滚成功
- **决策人**：仓库所有者 @sunny-zhai（单人项目，无第二审批人；若后续加入协作者需补明确授权）

## 6. 发布说明（Release Notes）

- **新增**：
  - IVE 输入链路：原生助手 `ive2glb`（C++/OSG）+ Node 侧自包含 GLB 组装（贴图内嵌、空节点剪枝）
  - 轴位转换：IVE 的 Z-up → glTF 的 Y-up（`-90°` 绕 X，与 FBX2glTF 同向）
  - 贴地归心：世界包围盒 `min.y` 抬到 0、X/Z 中心归零（`ground`/`centerXZ` 可关）
  - 顶点焊接：三角汤 56,772 → 11,516 顶点（与参考件顶点数一致）
  - 进度事件新增 `convert-start`/`convert-done`，日志输出坐标、米制尺寸、顶点/面数
- **变更**：
  - **JPEG 一律转 PNG**（撤销此前的「保留 JPEG 贴图原格式」）：照片类贴图约膨胀 5 倍（实测 2048² 2.1 MB → 10.25 MB）。这是为换取 Cesium 侧稳定性；**真正的解法是贴图降采样，目前仍未实现**（已登记为 REQ-008 / TASK-018，默认不降、可选 2048/1024/512 三档）
- **破坏性变更与兼容期**：
  - 转换产物的**朝向与落地位置体系变了**（旧产物会"躺倒"且悬空）。与旧版本产出的模型混放在同一场景会明显错位，需用 v0.1.0 重新转换。**无兼容期**——旧 GLB 不会被自动迁移
  - JPEG → PNG 导致输出体积变大，依赖"修完还是小体积"的用户需重新评估
- **已知问题**：
  - **发布已决定推迟**（2026-09-20，sunny-zhai）：Windows 侧的 IVE 助手缺失（见 §3 的警告块）在补齐前不发布，由 **REQ-009 / TASK-021、TASK-022** 承载（构建并 vendoring `vendor/ive2glb/win32-x64/` → 重打安装包 → 逐行冒烟回填）。在此之前 §3/§4 保持未勾
  - Windows 安装包不含 IVE 助手（见 §3），Windows 用户只能使用 GLB 修复能力
  - 渲染结果的人眼确认仅覆盖「能否渲染」这一路径（TC-012 已由 sunny-zhai 于 2026-09-18 人工验收通过）；朝向/落地/贴图方向由自动化世界盒断言兜底，**TC-014~TC-018 的人工目视项仍待确认**（REQ-005/006/007 因此尚未关闭）
  - 模型体检：`src/inspect.js` 报告 + 界面体检面板（世界盒/accessor 盒双列、偏差告警、事实行、问题清单）与预览方向/缩放/上轴控件均已实现（TASK-008 已完成并合入）；TASK-009 已修掉 `UNREFERENCED_MESHES` 误报与"窗口不可见时预览不落定"（后者根因是后台节流导致 Cesium 一帧未渲染）
  - **贴图采样器规范化与贴图降采样尚未实现**（REQ-008 / TASK-017~020）：体检能报 `NPOT_WITH_REPEAT_MIPMAP` 但修不了；JPEG→PNG 造成的体积膨胀目前没有降采样旋钮（见 §6「变更」）。这是本次登记的**已知能力缺口**，不是缺陷
  - `KHR_texture_transform.texCoord` 覆盖被忽略 → `MISSING_TEXCOORD` 可能漏报（TASK-007 已知遗留，由 REQ-008 / TASK-019 承载）
  - **预览三态（上轴/方向/缩放）不持久化**：`localStorage` 只记布局，重启后回到 `auto/0°/1.00×`（`docs/002-requirements.md` §6 问题 3 的"记住选择"未实现，由 REQ-010 / TASK-023 承载）
  - 无 CI：门禁（lint/test/memory check）依赖本地手工执行
  - 覆盖率未设门槛，Electron 壳层未纳入插桩
  - `npm audit` 需换官方源执行（见 §1；本次已用 `--registry=https://registry.npmjs.org` 实测 0 漏洞）

## 发布记录

| 日期 | 版本 | 环境 | 结果 | 证据 | 回滚? |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 2026-09-18 | v0.1.0 | — | 代码并入 `main`（PR #6 → `3506327`、PR #7 → `0063590`），**安装包未产出**（§3 全未勾选） | `docs/approvals/APPROVALS.md` 的两条 delivery 记录 + `docs/testing/TEST_PLAN.md` | 否 |
| 2026-09-20 | v0.1.1 | — | **推迟发布**（决定人 sunny-zhai）：等 Windows IVE 助手补齐（REQ-009 / TASK-021、TASK-022）；`dist/` 现有产物是 2026-09-15 的 `0.1.0` 旧包，**不代表当前代码** | §1 预检已全勾（含 `npm audit --registry=https://registry.npmjs.org --omit=dev` → 0 漏洞）；`npm test` 119 用例 / 115 通过 / 0 失败 / 4 跳过；`docs/testing/TEST_PLAN.md` 结果汇总 | 否 |
