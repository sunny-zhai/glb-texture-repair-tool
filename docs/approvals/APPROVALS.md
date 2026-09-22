# 人工确认闸门留痕（APPROVALS）

> 4 个人工确认闸门必须留痕：① 规格 ② 架构 ③ 交付 ④ 门禁仲裁。
> 由 `scripts/record-approval.mjs` 追加记录；**不要手工删改历史记录**（审计用）。

## 记录格式

| 时间 | 闸门 | 决策 | 确认人 | 关联需求/版本 | 证据 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| {{YYYY-MM-DD HH:MM}} | ① 规格 | 通过 | {{@author}} | REQ-001 | {{docs/requirements/REQUIREMENTS.md}} |
| {{YYYY-MM-DD HH:MM}} | ② 架构 | 通过 | {{@author}} | ADR-001 | {{docs/design/ADR.md}} |
| {{YYYY-MM-DD HH:MM}} | ③ 交付 | 通过 | {{@author}} | v0.1.0 | {{docs/release/RELEASE_CHECKLIST.md}} |
| {{YYYY-MM-DD HH:MM}} | ④ 门禁仲裁 | 重试 | {{@author}} | REQ-002 | {{自动修复 3 轮仍失败}} |

## 用法

```bash
node scripts/record-approval.mjs --gate spec --decision approved --actor "@author" --ref REQ-001 --evidence docs/requirements/REQUIREMENTS.md
```

闸门取值：`spec` | `architecture` | `delivery` | `gate-arbitration`
决策取值：`approved` | `rejected` | `retry` | `abandon`
## 记录

> 由 `scripts/record-approval.mjs` 追加到文件末尾（不改历史）。

| 时间 | 闸门 | 决策 | 确认人 | 关联需求/版本 | 证据 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 2026-09-18 06:01 | delivery | approved | sunny-zhai | v0.1.0 | PR #6 https://github.com/sunny-zhai/glb-texture-repair-tool/pull/6 merged into main as 3506327 (复核范围：release/v0.1.0 至 15c755c（版本状态/台账/CLAUDE.md 校正）；其后 TASK-003/TASK-004 批次尚待紧随的合并) |
| 2026-09-18 06:03 | delivery | approved | sunny-zhai | v0.1.0 | PR #7 https://github.com/sunny-zhai/glb-texture-repair-tool/pull/7 merged into main as 0063590 (本批为完整交付：TEST_PLAN/RELEASE_CHECKLIST/APPROVALS/台账增量/.gitignore 共 7 文件；合并后与 main 内容差异为空) |
| 2026-09-18 07:36 | spec | approved | sunny-zhai | REQ-005 | docs/requirements/REQUIREMENTS.md (确认 REQ-005 的 5 条验收标准（Given/When/Then）；含实测口径：运输车 world 2.59×4.10×5.98、偏差 >1000、21 样例 0 崩溃、person 比值 0.61) |
| 2026-09-18 07:36 | architecture | approved | sunny-zhai | REQ-005 | docs/design/ADR.md (确认 ADR-001~005：世界盒自算与偏差上报、上轴保守推断、遍历跨路径共用、预览修正不写回、统计口径（默认场景可达 + 偏差含位置分量）) |
| 2026-09-18 09:14 | spec | approved | sunny-zhai | REQ-006 | docs/requirements/REQUIREMENTS.md (确认 REQ-006 的 7 条验收标准：一屏三栏+底部日志、分栏拖拽与 3D 视口重算、折叠、窄窗降级、布局记忆、常驻状态栏与键盘可达、既有自动化不回归) |
| 2026-09-18 09:14 | architecture | approved | sunny-zhai | REQ-006 | docs/design/ADR.md (确认 ADR-006：CSS Grid + 自绘分隔条 + localStorage 记忆 + ResizeObserver→viewer.resize()，不引入前端框架/构建步骤，窄窗降级两栏) |
| 2026-09-20 03:12 | spec | approved | sunny-zhai | REQ-007 | — |
| 2026-09-20 03:12 | architecture | approved | sunny-zhai | REQ-007 | — |
| 2026-09-20 07:21 | delivery | approved | sunny-zhai | v0.1.1 | PR #9 https://github.com/sunny-zhai/glb-texture-repair-tool/pull/9 merged into main as b155d0e (release/v0.1.1 全量交付：平台骨架入库与 .gitignore 根锚定、CLAUDE.md 口径校正、MERGE_REQUEST 重发；合并后 tree(release/v0.1.1) 与 tree(main) 完全相同，本地与远端均无差异) |
| 2026-09-20 08:28 | spec | approved | sunny-zhai | REQ-008 | docs/requirements/REQUIREMENTS.md（确认 REQ-008 的 11 条验收标准：采样器规范化逐"贴图×采样器"判定且 POT 不改、降采样默认不降四档且只动贴图字节、KHR_texture_transform.texCoord 覆盖两处同源） |
| 2026-09-20 08:28 | spec | approved | sunny-zhai | REQ-009 | docs/requirements/REQUIREMENTS.md（确认 REQ-009 的 6 条：win32-x64 助手入库与依赖闭包、capabilities ive:true 与世界盒一致、dist 包内容、§4 冒烟逐行回填、清单全勾、只能声明时的显式兜底） |
| 2026-09-20 08:28 | spec | approved | sunny-zhai | REQ-010 | docs/requirements/REQUIREMENTS.md（确认 REQ-010 的 5 条：重启恢复三态、从未动过不落盘、显式 auto 被记住、垃圾载荷降级、不写回文件） |
| 2026-09-20 08:28 | architecture | approved | sunny-zhai | ADR-009 | docs/design/ADR.md（采纳\“按贴图退化\”：NPOT×REPEAT×mipmap → CLAMP_TO_EDGE+LINEAR，与 inspect.js 提示与 ive.js 规则一致；降采样进程内 pngjs 盒式平均、默认不降；管线顺序内嵌→降采样→采样器规范化。ADR-010 原生 win32-x64 助手同批确认） |
| 2026-09-20 09:20 | spec | approved | sunny-zhai | REQ-011 | docs/requirements/REQUIREMENTS.md（确认 REQ-011 的 7 条验收标准：占比不漂移 ≤1 个百分点为核心、拖拽改占比、占比被记住含 version:1 像素载荷迁移、极小窗口夹取规则确定且恢复后不失真、窄窗口降级按占比、内部元素自适应矩阵、不回归；另确认口径「宽高都按占比」，TASK-025 走 900×700~1920×1200 矩阵普查） |
| 2026-09-20 09:21 | architecture | approved | sunny-zhai | ADR-011 | docs/design/ADR.md（采纳「布局以占比为唯一用户意图、像素只是派生物」；像素上限改比例上限；夹取优先级写死为「先等比整体压缩 → 再依次触底」；localStorage 升 version:2 并迁移 version:1 像素载荷；保留像素级拖拽跟手手感） |
| 2026-09-21 00:54 | delivery | approved | sunny-zhai | REQ-005/REQ-006/REQ-007 人工目视 | docs/testing/TEST_PLAN.md 的人工目视清单 M-1~M-7 逐项通过（M-8 Windows-only 未执行，随 REQ-009）；TASKS.md 进度表人工列与三个 REQ 状态同步改为已完成 |
| 2026-09-21 00:58 | spec | approved | sunny-zhai | REQ-012 | docs/requirements/REQUIREMENTS.md（确认 REQ-012 的 8 条验收标准：四平台能力、WASM 优先、多平台兜底、mac/linux 打包目标、BR-012 降级不回归、spike 必须留痕含失败、体积/耗时预算、不回归） |
| 2026-09-21 00:58 | architecture | approved | sunny-zhai | ADR-012 | docs/design/ADR.md（采纳：先做 WASM spike 再定架构，倾向一次构建全平台；失败则退多平台预编译；两条路都不改 IVE 解析语义、都保持 BR-012 降级。另决定：本机可做部分先行，emsdk 安装待确认；REQ-009 的 TASK-021/022 等 spike 结论再处置） |
| 2026-09-22 02:23 | delivery | abandon | sunny-zhai | REQ-009 | docs/requirements/TASKS.md (REQ-009（Windows 分发：IVE 助手入库 + 安装包重打与冒烟）由 REQ-012 取代：TASK-027 的 spike 判 WASM 路线可行，TASK-021/022 已于 2026-09-21 标为「已取消（被 REQ-012 取代）」；其安装包内容/ive:true/世界盒一致的覆盖面改由 REQ-012 的发布清单 §3/§4 ★ 行在四个目标平台承接。决定人 sunny-zhai 2026-09-22) |
| 2026-09-22 02:43 | delivery | approved | sunny-zhai | REQ-012 | docs/requirements/REQUIREMENTS.md (REQ-012 交付批准（含已知偏差）：TASK-027~032 全部交付，两轮冷上下文复核为 PASS / CONDITIONAL PASS 且剩余 minor 已由 TASK-032 收口。偏差如实记录：验收标准 1 的『四平台各自实测』只有 darwin-arm64 完成（打包应用内 kind=wasm、产物与原生逐字节相同），linux-x64 只到『安装包产出且内容/元数据正确』，win32-x64 / darwin-x64 未做；该偏差由发布执行的 §3/§4 ★ 行承接，不因此阻塞版本分支的合主干申请。决定人 sunny-zhai 2026-09-22) |
