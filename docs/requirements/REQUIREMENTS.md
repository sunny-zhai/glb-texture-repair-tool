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

## 变更记录

| 日期 | REQ | 变更 | 原因 |
| :-- | :-- | :-- | :-- |
| 2026-09-18 | REQ-001 | 新增 | 采纳 Tenon 工作流时发现文档与实现偏离，先立此需求再做校正 |
