# 本项目的工作流规则（平台下发）

> 本文件由平台母体（Tenon）下发，并**受平台管理**：平台更新且你未改过本文件时，升级会刷新它。
> **项目自有的规则放在根 `AGENTS.md`**，不要写进这里（写在这里的改动会让升级转为"冲突跳过"）。
> 流程能力已随脚手架装载在 `scripts/`、`.ai/workflows/`、`dsh/workflows/`、`.ai/agents/`、`.ai/skills/`。

## 一、工作原则

1. **需求追溯**：实现前登记 `REQ-XXX`（`docs/requirements/REQUIREMENTS.md`，含可判定验收标准 Given/When/Then），再拆成**可独立验证**的 `TASK-XXX`（`docs/requirements/TASKS.md`，含依赖 / 文件范围 / 验证方式）。**无 REQ ID 不得进入实现**；修缺陷、改文档、升依赖这类非功能改动可直接做，但要留验证入口。
2. **文档先行**：先有规格或设计（`docs/design/ADR.md` 或本仓规格目录），再写代码。
3. **可验证**：每个非平凡改动留验证入口；任务完成时回填 `TASKS.md` 的**状态**与**验证结果**。
4. **最小必要**：不做无请求的抽象；优先复用现有脚本、技能与既有模式。
5. **单 Agent 优先**：默认顺序执行；只有任务间确无依赖、上下文可控时并行。
6. **英文代码，中文文档**；注释与文档中英皆可。

## 二、分支与合并（三级模型）

| 层级 | 分支 | 谁合并 |
|---|---|---|
| 受保护主干 | `master` / `main` | **仅人工验收后由人合并**——模型不得自动合入 |
| 版本分支 | `release/vX.Y.Z` | 承接**所有任务子分支的自动合并** |
| 任务子分支 | `feature/REQ-XXX_描述` | 改动都在此进行 |

```bash
node scripts/task-flow.mjs start --req 001 --desc login     # 从版本分支建任务分支
node scripts/task-flow.mjs finish --test "<项目验证命令>"    # 门禁通过→自动合并回版本分支（失败不合并，退出码 3）
node scripts/task-flow.mjs request --base master            # 发起合主干申请（写 MERGE_REQUEST.md），由人合并
node scripts/sync-base.mjs                                  # 人工验收不通过：先同步主干再改
```

`finish` / `request` 拒绝在受保护分支上执行；脏工作树会中止操作。

### 版本：只在明确升级时变更

- **合并绝不改变版本号**：`start` / `finish` / `request` / `sync-base` 都不会升版本。`finish` 只是把任务分支合并回**它派生时**的版本分支
- **需求 / 任务固定属于它派生时的版本分支**：要让某个需求落在指定版本，先切到那个版本分支再 `start`：

  ```bash
  git checkout release/v0.1.0        # 切到目标版本分支
  node scripts/task-flow.mjs start --req 004 --desc legacy-fix
  ```

- **升级是显式动作**（由人决定，且必须写明级别）：

  ```bash
  node scripts/version.mjs bump --level patch|minor|major    # 建新版本分支并设为当前
  ```

  不给 `--level` 会直接报错（退出码 2）——避免一次裸跑静默 +1，把"某需求属于哪个版本"变成偶然
- **当前版本随时可查**：`node scripts/version.mjs show`，或 `node scripts/progress.mjs`（进程线里显示当前版本）

## 三、需求驱动并行开发（`req-parallel`）

一条需求含多个可独立验证的任务时，用 `req-parallel` 工作流（`.ai/workflows/req-parallel.js` / `dsh/workflows/req-parallel.js`）：

1. `mode: 'split'`（默认）→ 拆分产出 `docs/requirements/TASKS.md`，**停下等人工确认（闸门 ①）**
2. `mode: 'run'` → 就绪任务各开 worktree **并行开发** → 按依赖序**串行合并** → 回收

硬性约束：

- **合并严格一次一个，绝不并发派发**——并发合并会竞争版本分支的 ref
- **每波开发完立即串行合并**：下一波任务才能从**包含其依赖**的基线开工
- **文件范围重叠的任务不得同批并行**；**某任务失败 → 其下游不启动**，其余互不依赖的任务继续
- **并发上限默认 2**（可调）：每并发 = 1 个 worktree + 1 个 agent 会话
- **合并失败**：在该任务 worktree 内自行 `git merge <版本分支>` 解决后提交、重试一次 `finish`；注意 `sync-base` 遇冲突会主动中止，**不能**用来解决冲突；仍失败转人工
- **一树一任务**：worktree 放 `.worktrees/<任务名>/`（已 gitignore），绑定 `feature/REQ-XXX_*`，合并后回收、分支保留

### 共享台账：只在串行合并点写（单写者）

`docs/requirements/TASKS.md` 的状态与 `docs/PROJECT_MEMORY.md` **只由合并 agent 在合并点更新**；并行开发阶段任何任务**不得触碰**它们，也不得把它们计入任务的文件范围——否则每个任务都与同一个文件重叠，分批会把它们全部拆到不同波次，**并行度退化为 1**。

## 四、台账与记忆线

```bash
node scripts/progress.mjs            # 6 阶段进程线：需求对齐→设计→实现→审查→验证→发布（--json 可结构化）
node scripts/memory.mjs check        # 门禁：结构快照是否最新 + 与 TASKS.md 双向一致
node scripts/memory.mjs sync         # 结构变了（新增目录/入口）→ 刷新快照后提交
node scripts/memory.mjs log --task TASK-XXX --req REQ-XXX --evidence "<命令 → 结果>" --commit <sha>
```

- **权威状态在 `TASKS.md`**；记忆线是**派生的历史**（结构段派生、完成线只追加），两者不一致时门禁失败（双向）
- 推翻旧结论时追加 `--event reopened`，不改写历史条目
- 人工闸门留痕：`node scripts/record-approval.mjs --gate <spec|architecture|delivery|gate-arbitration> --decision <approved|rejected|retry|abandon> --actor <name> [--ref REQ-XXX]`
- 变更日志：`node scripts/changelog.mjs [--from <ref>] [--to <ref>] [--write]`

## 五、人工闸门

关键变更须经四个确认点：**① 规格 ② 架构 ③ 交付**（冷上下文审查后确认）**④ 门禁仲裁**。审查必须由 reviewer 在**独立、冷上下文**执行——同一会话内的自审不算通过。**模型不得自动合入主干。**

## 六、门禁与验证

改动完成前至少运行：项目自身的验证命令（如 `npm test`、`npx tsc --noEmit`）+ `node scripts/memory.mjs check` + `node scripts/platform-issue.mjs check`。契约文件存在时运行 `node scripts/check-contract.mjs`；记忆线结构变化后先 `memory sync`。

## 六之二、遇到平台问题时

平台工作流本身的问题**不要只写在散文里**——写进台账才有生命周期，母体也才能据此修流程。

```bash
node scripts/platform-issue.mjs log --category rule-gap --severity major \
  --trigger "task-flow:finish" --summary "<一句话问题>" --evidence "<命令 → 结果 或 文件:行>"
node scripts/platform-issue.mjs capture -- node scripts/memory.mjs check   # 非零退出才记录
node scripts/platform-issue.mjs list                                      # 未关闭的问题
node scripts/platform-issue.mjs resolve --id ISSUE-001 --status fixed --fixed-by <commit|REQ>
```

- 分类：`platform-bug` / `rule-gap` / `tool-gap` / `docs-gap` / `env` / `other`；严重度：`blocker` / `major` / `minor`
- 台账 `docs/PLATFORM_ISSUES.md` **只追加**：改状态是追加事件行；分类与严重度以首行为准
- 台账是**项目自己的数据**，随项目入库，平台升级不会覆盖它；**没有任何数据回传**（平台无服务端），由母体侧主动汇总
- 平台自检报 ❌ 时会自动落账（按"触发点+摘要"去重），`--no-report` 可关

## 七、提交纪律

Conventional Commits（类型 + 简短主体）并附 `Co-Authored-By` trailer；**一个提交只含一个逻辑变更**；用显式路径 `git add <path>`，禁止 `git add -A` / `git add .`；提交前先 `git diff` 审阅；**不把密钥、令牌或 `.env` 内容写入受跟踪文件**。

## 八、技能分层与平台升级

- 平台只提供**流程 / 治理类**技能（requirements、design、testing、stack-testing、visual-regression、release、change-impact）。**领域技能**（UI 设计、业务组件库等）装到本项目：`node scripts/skill.mjs add --from <本地路径|git URL> [--name <skill>]`，`list` 查看，`remove --name <skill>` 卸载。
- **平台升级由母体侧发起**（本仓不含升级工具）：在平台目录运行升级脚本 `platform-upgrade.mjs`
  （参数 `--target <本项目路径>`）——先 dry-run 看清单，再 `--apply` 落盘。
  语义：你改过的文件**冲突跳过、绝不覆盖**；缺失的补回；平台已不再管理的只报告 `stale`，不删除。
