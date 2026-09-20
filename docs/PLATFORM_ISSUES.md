# 平台问题台账

> 记录**在项目里使用平台工作流时遇到的问题**（平台自身缺陷、规则不清、工具缺失、文档误导、环境依赖、其它）。
> 由 `node scripts/platform-issue.mjs` 维护，**只追加**：改状态 = 追加一条事件行（分类/严重度/摘要留空）。
> 当前状态 = 该 ID 的最后一行；分类与严重度以**首行**为准。全部留在项目内，**不回传任何数据**。

## 怎么上报

```bash
# 1) 手动记录（明确知道是什么问题时）
node scripts/platform-issue.mjs log --category rule-gap --severity major \
  --trigger "task-flow:finish" --summary "合并点提示语看不懂" --evidence "task-flow finish → 输出里没有任何版本信息"

# 2) 包装命令：命令**非零退出**才记录（含命令、退出码、输出尾部）
node scripts/platform-issue.mjs capture -- node scripts/memory.mjs check

# 3) 平台自检失败自动落账：platform-doctor 属**母体侧**工具，在平台目录执行；
#    它报 ❌ 时会自动往本项目台账落一条（按"触发点+摘要"去重，--no-report 可关）
node <平台路径>/scripts/platform-doctor.mjs --target .
```

## 分类与严重度

- **分类**：`platform-bug`（平台代码/脚本有缺陷）· `rule-gap`（规则含糊、互相矛盾或缺失）· `tool-gap`（该有工具但没有）· `docs-gap`（文档错误或缺失）· `env`（环境/依赖）· `other`
- **严重度**：`blocker`（挡住开发，只能停）· `major`（能绕但代价明显）· `minor`（体验/噪音级）
- **状态**：`open` → `triaged`（已分诊，待修）→ `fixed`（已修复，必须给 `--fixed-by`）| `deferred`（暂缓）

## 台账

<!-- issues:begin -->
| ID | 日期 | 分类 | 严重度 | 触发点 | 摘要 | 证据 | 状态 |
|---|---|---|---|---|---|---|---|
| ISSUE-001 | 2026-09-20 | platform-bug | major | gitignore:docs/* | 命令失败（exit 1）：git ls-files --error-unmatch docs/PLATFORM_ISSUES.md | exit 1｜error: 路径规格 'docs/PLATFORM_ISSUES.md' 未匹配任何 git 已知文件 ⏎ Did you forget to 'git add'? | open |
| ISSUE-001 | 2026-09-20 | — | — | — |  | fixed-by: 7e0760d｜在 .gitignore 放行 !docs/PLATFORM_ISSUES.md；台账已入库 | fixed |
<!-- issues:end -->
