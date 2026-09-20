# DSH Workflows

本目录存放 DeepSeek Harness（DSH）格式的工作流脚本，是 `.ai/workflows/`（Claude Code SDK 格式）的移植版。DSH 通过 `workflow` 工具执行：`meta`、`script`、`args` 三个参数分别传入元数据、脚本正文与任务输入。

## 与 Claude Code 版的差异

| 差异 | Claude Code 版（`.ai/workflows/`） | DSH 版（本目录） |
|---|---|---|
| meta 声明 | `export const meta = {...}` 内嵌于文件 | 作为 workflow 工具的 `meta` 参数传入；文件头注释记录可复制的 meta JSON |
| 角色派发 | `agentType: 'planner'` 引用 `.ai/agents/*.md` | 不使用 agentType（DSH 会拒绝该选项）；角色契约内嵌为提示词，与 `.ai/agents/*.md` 保持一致，改动角色定义时须同步 |
| 调用入口 | Claude Code 目录自动发现 | workflow 工具显式调用 |

## 可用工作流

| 文件 | 流程 | 用途 | 下发范围 |
|---|---|---|---|
| `feature-dev.js` | Plan → Implement → Review → Verify | 完整功能开发 | 随项目类型 |
| `bug-fix.js` | Debug → Fix → Review → Verify | Bug 修复 | 随项目类型 |
| `doc-update.js` | Analyze → Write → Review | 文档更新 | 随项目类型 |
| `deploy.js` | Preflight → Release → Smoke → Rollback | 发布与回滚 | 随项目类型 |
| `req-parallel.js` | Split → Fanout → Merge → Cleanup | 需求拆分 + worktree 并行开发 | 随项目类型 |
| `brain-ingest.js` | BreakDown → Place → Write → Verify | 会话结论/文档/研究结果沉淀为 brain 知识（经 brain CLI） | **仅平台**（消费项目不生成 `brain/`） |

`args` 传字符串，或传对象：feature-dev / doc-update 用 `{ request: '...' }`，bug-fix 用 `{ report: '...' }`，brain-ingest 用 `{ input: '...' }`，deploy 只接字符串发布目标，req-parallel 用 `{ req: 'REQ-001', mode: 'split' | 'run', concurrency?: 2 }`。

## 下发范围：按项目类型，两侧一致

消费项目**只拿到本项目类型对应的工作流**，清单由 `scripts/project-config.mjs` 的 `projectWorkflows` 单点定义，`.ai/workflows/` 与 `dsh/workflows/` 两侧同名集合始终一致（例如 `doc-only` 只拿 `doc-update.js`）。

- 过滤依据是 `.ai/platform-lock.json` 的 `meta.workflows`；`scripts/platform-managed.mjs` 的 `dshWorkflowFiles()` 是唯一实现，脚手架与升级共用
- 本目录的 `verify.mjs` 与 `README.md` 是**工具文件**，不参与按类型过滤，任何项目都会拿到
- 存量项目升级时，旧版多下发的文件只会出现在 `platform-upgrade.mjs` 的 `stale` 列表里，**不会被删除**

## 验证命令

```bash
node dsh/workflows/verify.mjs
```

`verify.mjs` 以 stub 驱动各工作流脚本，校验阶段顺序、角色派发、phase 绑定、返回值契约、空参报错与禁用构造。**未下发的工作流会被跳过**（输出 `skip: <file>（本类型未下发）`），因此任一按类型过滤后的项目里它都应退出码 0；在本平台仓库（全量工作流）运行时不应出现任何 `skip`。

注意：这些 `.js` 正文依赖 DSH 注入的 `phase/agent/log/args` 全局并使用顶层 `await`，**不能直接 `node --check`**（会被按 CommonJS 解析而报错）；结构回归请运行 `verify.mjs`。端到端验证：用 workflow 工具分别运行各工作流（配一个只读小任务）。
