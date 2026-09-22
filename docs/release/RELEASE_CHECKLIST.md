# 发布检查清单（RELEASE CHECKLIST）

> 由 `release` 技能维护。**预检未全绿不得发布**；发布后回填证据。
> 关联需求：REQ-002（验证基线）、REQ-005（模型体检）、REQ-007（多格式输入）、REQ-008（贴图规格）、REQ-010（预览记忆）、REQ-011（布局占比）、REQ-012（跨平台 IVE：WASM 助手，**四个桌面平台**）、REQ-009（Windows 分发，**已被 REQ-012 取代**，见 §3） ｜ 发布版本：v0.1.1（版本分支）｜ 产品版本（`package.json`）：`0.1.0`——**本次决定不升**，见 §3 ｜ 责任人：@sunny-zhai
>
> **状态（2026-09-21）**：预检（§1）已全绿。**原先"推迟发布"的唯一原因（Windows 缺 IVE 助手）已由 REQ-012 的 WASM 路线解除**——四平台共用一份 `vendor/ive2glb/wasm/`，不再需要任何按平台分发的原生二进制（TASK-021/022 已取消）。§3 发布与 §4 冒烟仍**未执行**（需在各自平台产出安装包并逐行回填），但已无阻塞性前提。

本清单只写**本项目真实可执行**的项。桌面单机工具没有服务端概念，凡不适用的项都显式标注
"不适用"而不是留空——留空会让评审人误以为漏做。

## 1. 预检（Preflight）

- [x] 关联 REQ 已验收：REQ-001（TASK-001/002/003）、REQ-002（TASK-004）、REQ-003/REQ-004（追溯登记）、REQ-005（TASK-007 经两轮独立复审关闭，TASK-008/009 已完成，**人工目视 2026-09-20 通过**）、REQ-006（TASK-010~012 已完成，**人工目视 2026-09-20 通过**）、REQ-007（TASK-013~016 已完成，**人工目视 2026-09-20 通过**）、REQ-008（TASK-017~020 全部完成，11 条验收标准有自动化证据）、REQ-010（TASK-023 完成）、REQ-011（TASK-024~026 完成）、REQ-012（TASK-027 spike 判定 WASM 可行、TASK-028 已落地：四平台共用 WASM 助手，打包后实测 `ive: true`；TASK-029 文档回填完成）、REQ-009（TASK-021/022 **已取消（被 REQ-012 取代）**，见 §6）
- [x] 全量测试通过：`npm test` → **152 用例 / 146 通过 / 0 失败 / 6 跳过**（**2026-09-22 TASK-031 后复测**；本地跳过数**按当次夹具集陈述**：当前本地语料只剩 `o-model/蹲姿.*`、`model/` 为空，6 个跳过 = `o-model/运输车.glb` 1 + `model/蹲姿.glb` 1 + `model/person-stand.glb` 1 + `o-model/person-move.ive` 3；TASK-031 前的 148 用例夹具齐备时为 144 通过 / 4 跳过）；**全新克隆（无任何夹具）实测 152 用例 / 128 通过 / 0 失败 / 24 跳过**（`git worktree add --detach` 干净检出 + 软链 `node_modules`，跳过 24 = `repair` 7 + `ive` 9 + `inspect` 3 + `convert` 5）；`npm run lint` 通过
- [x] 覆盖率已**实测并记录**：`all files` 行 **95.39%** / 分支 **81.23%** / 函数 **96.78%**（**2026-09-22 TASK-031 后复测**；`convert.js` 94.55%、`inspect.js` 94.31%、`ive.js` 96.00%、`repair.js` 90.87%、`report-format.js` 99.35%、`transform.js`/`preview-transform.js` 100.00%；分支率有单次运行 ±0.1pp 的波动）。**未设强制门槛**（无插桩门槛、无 CI），Electron 壳层未纳入插桩——详见 `docs/testing/TEST_PLAN.md` 覆盖率一节。
  **测量命令必须带 `--test-coverage-exclude="vendor/**"`**：`node --test --experimental-test-coverage --test-coverage-exclude="vendor/**" "test/*.test.js"`。原因是 TASK-028 起 `vendor/ive2glb/wasm/ive2glb.js`（Emscripten 生成的胶水代码）会被子进程继承的 `NODE_V8_COVERAGE` 插桩——它是随包分发的第三方产物，不是本项目源码；不排除会把 `all files` 函数覆盖率从 96.78% 拖到 47.99%，得出没有意义的数字
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

- [ ] 目标环境：**四个桌面平台**——`win32-x64`（NSIS 安装包 + 便携版，`npm run dist:win`）、`darwin-arm64`（dmg + zip，`npm run dist:mac`）、`darwin-x64`（同上，需在 Intel Mac 上构建）、`linux-x64`（AppImage + deb，`npm run dist:linux`）。**IVE 能力在四者上完全一致**：助手是 WASM，与平台无关（REQ-012 / BR-036），各平台只差安装包本身
- [ ] **版本号口径（已决定，无需再改）**：平台版本分支是 `release/v0.1.1`，但 `package.json` 的 `version` **保持 `0.1.0`**——本轮内容整体仍按 0.1.0 交付。注意 `electron-builder` 的 `artifactName` 取自 `package.json`，所以产物名是 `0.1.0`；将来真正升版本时必须同步改 `package.json`（`version.mjs bump` 只管版本分支，不会动它），否则产物名会与版本分支长期不一致
- [ ] 发布产物（`electron-builder` 按 `artifactName` 模板生成，输出目录 `dist/`）：
  - `GLB Texture Repair Tool-Setup-0.1.0.exe`（NSIS，可选安装目录、桌面/开始菜单快捷方式）
  - `GLB Texture Repair Tool-0.1.0-win-x64.exe`（portable）
- [ ] 执行命令：`npm run dist:win`（脚本内先跑 `ensure:cesium`）
- [ ] 执行命令（REQ-012）：`npm run dist:mac`（dmg + zip，`identity: null` 不签名）/ `npm run dist:linux`（AppImage + deb，脚本已固定 **`--x64`**，见下）——**在受限环境或 CI 里需要把 electron-builder 的缓存指到可写目录**：`ELECTRON_CACHE=$PWD/.cache/electron ELECTRON_BUILDER_CACHE=$PWD/.cache/electron-builder`（默认写 `~/Library/Caches/electron`，本机实测会被拒绝；`.cache/` 已 gitignore）。本机（darwin-arm64）实测：`npx electron-builder --mac --dir` 后 `app.asar.unpacked/vendor/ive2glb/wasm/` 两个文件齐备（**包内已无平台原生助手**），**打包应用内**跑通 `蹲姿.ive`（`11516` / `18924` / `0.538×1.364×1.056`，`helperKind: wasm`，与开发态原生助手产物逐字节相同），且 UI 冒烟在打包应用上 66 步 / 132 条断言 / 0 失败；`npx electron-builder --linux --x64` 本机实测能产出 **AppImage + deb**（deb 的 `Maintainer`/`Vendor`/`Homepage` 元数据齐备，见 `TASK-031`）。**架构不由宿主决定**：`dist:linux` 必须显式 `--x64`（矩阵里只有 linux-x64；不加会按宿主架构产出 arm64 包）；`darwin-x64` 用 `npx electron-builder --mac --x64`，`dist:win` 在 Windows 或装了 wine 的环境执行（见 `docs/testing/TEST_PLAN.md` TC-026）
- [ ] 打包正确性（REQ-012 标准 2，TASK-031 修正）：`files` 与 `asarUnpack` 里的 `vendor/ive2glb` 条目**只能是 `vendor/ive2glb/wasm/**`**——助手必须解包到 asar 外（asar 内的文件无法执行），而**平台相关的原生助手不得随包分发**。原先写成 `vendor/ive2glb/**` 时，11 MB 的 `darwin-arm64/`（1 exe + 14 dylib + 2 插件）会被打进**每一个**平台的安装包，标准 2 因此不成立；原生助手现在只留仓库供开发态与字节等价用例使用
- [ ] 打包正确性（REQ-012 标准 4，TASK-031 补齐）：`package.json` 必须有 `author.email`（或 `linux.maintainer`）与 `homepage`，否则 `dist:linux` 的 **deb** 目标会在 `app-builder-lib` 的 `FpmTarget` 阶段因 `authorEmailIsMissed` 直接中止（AppImage 不受影响）；元数据现已补为 `sunny-zhai <sunny-zhai@users.noreply.github.com>` + GitHub 仓库地址
- [ ] 打包正确性（REQ-007）：`asarUnpack` 还必须含 `node_modules/assimpjs/dist/**`——`assimpjs.wasm` 是按 `__dirname` 从磁盘读的，留在 asar 内会读不到；安装后 `app-capabilities` 必须报 `assimp: true`（该探测会真正加载一次 wasm——只查 JS 模块会有假阳性）、`o-model/蹲姿.fbx`/`蹲姿.obj` 能预览与落盘（Windows 上同样是 WASM，不依赖任何原生二进制）；dist 里必须能看到 `assimpjs/dist/license.assimp.txt`、`license.assimpjs.txt` 两份许可证文件
- [ ] 灰度 / feature flag：**不适用**（桌面安装包）
- [ ] 观测就绪：无遥测、无服务端指标。用户侧可见：界面日志面板（含 `坐标 …/尺寸 …/顶点 …` 行）+ 主进程控制台

> ✅ **原先的发布阻塞已解除（2026-09-21，REQ-012 / ADR-012）**：此前 `vendor/ive2glb/` 只有 `darwin-arm64`，
> Windows / Linux / Intel Mac 上 `.ive` 只能降级为 BR-012 提示，因此发布被推迟。TASK-027 的 spike 证明
> OSG + IVE 插件可编成 WASM，TASK-028 已落地 `vendor/ive2glb/wasm/`（**2.79 MB**，单文件约 **102 ms**，
> 与原生助手产物**逐字节相同**）并由 `resolveIveHelper()` 在缺原生助手时自动回退。**四个平台的 IVE 能力
> 由此统一**，不再需要 `win32-x64/ive2glb.exe`——REQ-009 的 TASK-021/TASK-022 已标为「已取消（被 REQ-012 取代）」。
>
> 仍须注意：① `dist/` 里现存产物是 **2026-09-15** 构建的 `0.1.0` 旧包，早于 REQ-005/006/007，**不代表当前代码**，发布前必须重打；
> ② 打包后 `vendor/ive2glb/**` 必须真的落在 `app.asar.unpacked` 下——排查时以**应用内** `app-capabilities` 报 `ive: true` 与一次真实 `.ive` 转换成功为准，
> 不要只看解包目录里有没有文件（曾出现"文件在、但解析停在 asar 内路径导致 `ENOTDIR`"的缺陷，见 TASK-028）；
> ③ 代码签名与公证仍未做（`identity: null`），属另一个议题。

## 4. 冒烟（Smoke）

> 行首 **★** = 必须在**目标平台**上执行（`win32-x64` / `darwin-x64` / `linux-x64`）——这些行的共同点是依赖该平台的安装包与解包布局；其余行在 macOS arm64 开发机上即可执行并回填。
> **IVE 相关的行不再与平台绑定**：助手是 WASM（BR-036），四个平台的期望值完全相同（世界盒 `0.54 × 1.36 × 1.06 m`、顶点 `11516`、三角面 `18924`）。

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
| ★ 包内容（解包后） | 解包安装目录下 `resources/app.asar.unpacked/` | 存在 `vendor/ive2glb/wasm/ive2glb.js` 与 `ive2glb.wasm`（**两者必须成对**）、`node_modules/assimpjs/dist/assimpjs.wasm`、`license.assimp.txt`、`license.assimpjs.txt`。**包内不得出现任何平台相关的 IVE 助手可执行文件**（含 macOS 包的 `darwin-arm64/`）——发布形态只有 WASM，原生助手只在仓库里供开发态与字节等价用例使用（TASK-031 修正；此前 macOS 包实测带着 11 MB 的 `darwin-arm64/`） | | ☐ |
| ★ 包内无平台相关 IVE 二进制 | 解包后 `find resources/app.asar.unpacked/vendor/ive2glb -name 'ive2glb*'` | **只**应命中 `wasm/ive2glb.js` 与 `wasm/ive2glb.wasm`；出现 `darwin-arm64/ive2glb`、`win32-x64/ive2glb.exe` 之类说明打包通配又放宽了（REQ-012 标准 2）。TASK-031 修正前这条在真实 macOS 包上**跑不通**：实测会多命中 `darwin-arm64/ive2glb` | | ☐ |
| ★ 助手自检（不依赖 GUI） | `node resources/app.asar.unpacked/vendor/ive2glb/wasm/ive2glb.js <某个.ive> <输出目录>` | 助手 stdout 一行 `{"status":"success",…"images":3,"meshes":3,"binBytes":28782480}`；Node 侧 `success [0.538, 1.364, 1.056] 11516 18924`。原生助手仍在时，其 `dumpbin /dependents` / `DYLD_PRINT_LIBRARIES` 闭包自检见 `native/ive2glb/README.md` | | ☐ |
| ★ 目标平台安装包 | 在**每个**目标平台安装 → 启动 → 修复一个 `.glb` 与一个 `.ive` | 可启动；`app-capabilities` 报 `ive: true`、`assimp: true`；两种输入都能修复并预览。**四平台的 IVE 期望值相同**（世界盒 `0.54 × 1.36 × 1.06 m`、顶点 `11516`、三角面 `18924`） | | ☐ |
| ★ 降级不回归（BR-012） | 临时移走 `vendor/ive2glb/wasm/` 与原生助手目录 → 启动 → 选 `.ive` | 中文提示「缺少 IVE 转换助手」并**列出已查找路径**；应用不崩；同一目录里的 `.glb`/`.fbx`/`.obj` 仍能正常修复（REQ-012 标准 5） | | ☐ |

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
  - **多格式输入（REQ-007）**：FBX/OBJ 由进程内 `assimpjs`(WASM) 转换为自包含 GLB，预览/修复/体检三条路径与 IVE 同等待遇
  - **贴图规格收口（REQ-008）**：① 采样器规范化——NPOT × `REPEAT` × mipmap 自动退化为 `CLAMP_TO_EDGE` + `LINEAR`（体检报得出、修复修得掉）；② **贴图降采样四档**（不降 / 2048 / 1024 / 512，默认不降，面积加权盒式平均，只改贴图字节）；③ `KHR_texture_transform.texCoord` 覆盖被采纳，`MISSING_TEXCOORD` 不再漏报且点名缺失通道
  - **预览修正记忆（REQ-010）**：上轴/方向/缩放只记显式选择，重启与换模型都沿用并提示「已沿用上次选择」
  - **编辑器式布局 + 占比（REQ-006/REQ-011）**：三栏 + 底部日志 + 状态栏，分隔条可拖、可折叠、窄窗降级两栏；**布局以占比记忆**，窗口缩放不再改写构图
- **变更**：
  - **JPEG 一律转 PNG**（撤销此前的「保留 JPEG 贴图原格式」）：照片类贴图约膨胀 5 倍（实测 2048² 2.1 MB → 10.25 MB）。这是为换取 Cesium 侧稳定性；**控体积现在有旋钮**——REQ-008 的降采样四档（默认不降，1024 档实测把 `person-stand` 从不降的 14.31MB 降到 4.95MB）
  - **布局尺寸由像素改为占比**（REQ-011）：窗口缩放/换屏后各区比例保持不变，重启按比例还原；旧的 `version:1` 像素存档会自动迁移，用户无需手动清理
  - **体检的 NPOT 判定由"文件级"改为"逐贴图 × 采样器绑定"**（REQ-008）：此前会把"另一张 POT 贴图的 `REPEAT`+mipmap"误报成问题，也会漏掉"缺省采样器 + NPOT"这一真实非法组合
- **破坏性变更与兼容期**：
  - 转换产物的**朝向与落地位置体系变了**（旧产物会"躺倒"且悬空）。与旧版本产出的模型混放在同一场景会明显错位，需用 v0.1.0 重新转换。**无兼容期**——旧 GLB 不会被自动迁移
  - JPEG → PNG 导致输出体积变大，依赖"修完还是小体积"的用户需重新评估（可开启降采样缓解）
  - 修复产物可能被**自动规范化采样器**：NPOT 贴图上的 `REPEAT`+mipmap 会被改成 `CLAMP_TO_EDGE`+`LINEAR`（平铺资产会失去平铺、mipmap 会被去掉，属 ADR-009 已记录的代价）；POT 贴图与已合法组合不受影响
- **已知问题**：
  - ~~**发布已决定推迟**（2026-09-20）：Windows 侧的 IVE 助手缺失在补齐前不发布~~ → **2026-09-21 阻塞解除**（REQ-012 / ADR-012）：WASM 助手一次构建覆盖四平台，`vendor/ive2glb/wasm/` 已入库并接入 `resolveIveHelper()` 的回退链；**REQ-009 的 TASK-021/TASK-022 已取消（被 REQ-012 取代）**。§3/§4 仍未勾，但只剩"在各自平台产出安装包并逐行回填"这一执行动作，无技术前提
  - ~~Windows 安装包不含 IVE 助手，Windows 用户只能使用 GLB 修复能力~~ → **不再成立**：助手是 WASM，与平台无关；四平台的 IVE 期望值完全一致（BR-036）
  - **平台覆盖的实测边界（如实声明）**：打包与"应用内 IVE 可用"只在 **darwin-arm64** 上实测过（`electron-builder --mac --dir` + 包内转换 + 包内 UI 冒烟）。`win32-x64` / `linux-x64` / `darwin-x64` 的结论是**由 WASM 与平台无关这一机制推出**，并按 REQ-012 标准 1 列为待各自平台执行的回填项——发布前必须在四个平台各跑一次 §4 的 ★ 行
  - 渲染结果的人眼确认：TC-012 由 sunny-zhai 于 2026-09-18 验收通过；**TC-014~TC-018 与 TC-024/TC-025 的人工目视项已于 2026-09-20 按 `docs/testing/TEST_PLAN.md` 的 M-1~M-7 逐项确认通过**（REQ-005/REQ-006/REQ-007 因此关闭），朝向/落地/贴图方向仍由自动化世界盒断言兜底。**M-8（目标平台上的四格式安装包冒烟）未执行**，随 §4 的 ★ 行
  - 模型体检：`src/inspect.js` 报告 + 界面体检面板（世界盒/accessor 盒双列、偏差告警、事实行、问题清单）与预览方向/缩放/上轴控件均已实现（TASK-008 已完成并合入）；TASK-009 已修掉 `UNREFERENCED_MESHES` 误报与"窗口不可见时预览不落定"（后者根因是后台节流导致 Cesium 一帧未渲染）
  - ~~贴图采样器规范化与贴图降采样尚未实现~~ → **2026-09-20 已交付**（REQ-008 / TASK-017~020，BR-031/032；冒烟见 TC-019/TC-020）
  - ~~`KHR_texture_transform.texCoord` 覆盖被忽略 → `MISSING_TEXCOORD` 可能漏报~~ → **2026-09-20 已修复**（REQ-008 / TASK-019，BR-033；旧代码上该组用例实测 3 红 1 绿）
  - ~~预览三态不持久化~~ → **2026-09-20 已实现**（REQ-010 / TASK-023，BR-035）
  - 仍**未排期**的既有缺口（都不是本次引入）：贴图占比 >60% 的提示、体检的内容哈希/重复资产提示、朝向（facing）的质心校验与"应用修正到输出"入口、`PERF_BUDGET.md` 仍是模板
  - 无 CI：门禁（lint/test/memory check）依赖本地手工执行
  - 覆盖率未设门槛，Electron 壳层未纳入插桩
  - `npm audit` 需换官方源执行（见 §1；本次已用 `--registry=https://registry.npmjs.org` 实测 0 漏洞）

## 发布记录

| 日期 | 版本 | 环境 | 结果 | 证据 | 回滚? |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 2026-09-18 | v0.1.0 | — | 代码并入 `main`（PR #6 → `3506327`、PR #7 → `0063590`），**安装包未产出**（§3 全未勾选） | `docs/approvals/APPROVALS.md` 的两条 delivery 记录 + `docs/testing/TEST_PLAN.md` | 否 |
| 2026-09-20 | v0.1.1 | — | **推迟发布**（决定人 sunny-zhai）：等 Windows IVE 助手补齐（REQ-009 / TASK-021、TASK-022）；`dist/` 现有产物是 2026-09-15 的 `0.1.0` 旧包，**不代表当前代码** | §1 预检已全勾（含 `npm audit --registry=https://registry.npmjs.org --omit=dev` → 0 漏洞）；`npm test` → 141 用例 / 137 通过 / 0 失败 / 4 跳过；冒烟四格式各 66 步 / 132 条断言 / 0 失败；覆盖率 all files 94.35 / 79.03 / 95.76；`docs/testing/TEST_PLAN.md` 结果汇总 | 否 |
| 2026-09-21 | v0.1.1 | darwin-arm64（打包实测） | **仍未发布，但阻塞已解除**：REQ-012 走 WASM 路线（TASK-027 spike 通过 → TASK-028 落地 → TASK-029 文档回填），四平台共用一份助手，`vendor/ive2glb/wasm/` 2.79 MB；REQ-009 的 TASK-021/022 已取消（被取代）。剩下的是**执行动作**：在 win32-x64 / linux-x64 / darwin-x64 各产一次安装包并回填 §3/§4 的 ★ 行 | `npm test` → 148 用例 / 144 通过 / 0 失败 / 4 跳过（干净检出 148/126/0/22）；`npm run lint` 通过；覆盖率 all files 95.32 / 81.19 / 96.72（命令含 `--test-coverage-exclude="vendor/**"`）；`ui-smoke` 在开发态与**打包应用**上各 66 步 / 132 条断言 / 0 失败；打包应用内 `convertIveToGlb('o-model/蹲姿.ive')` → `11516` / `18924` / `0.538×1.364×1.056`；`node scripts/memory.mjs check` 通过 | 否 |
