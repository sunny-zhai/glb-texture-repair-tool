// 平台问题台账：面向**使用过程**的只追加记录 + 采集入口。
//
// 为什么需要它：平台有「门禁失败要反哺流程」的原则，却没有机制——问题散落在各项目散文里
// （例如写在 RELEASE_CHECKLIST 的"已知问题"段落），无分类、无严重度、无生命周期，
// 母体既监听不到，也无法据此修流程。本文件把问题变成**结构化的、可汇总的、可门禁的数据**。
//
// 用法：
//   node scripts/platform-issue.mjs init [--root <path>]
//   node scripts/platform-issue.mjs log --category <c> --severity <s> --summary <text>
//        [--trigger <触发点>] [--evidence <证据>] [--date YYYY-MM-DD] [--root <path>]
//   node scripts/platform-issue.mjs capture [--category <c>] [--severity <s>] [--trigger <触发点>]
//        [--force] -- <命令...>
//   node scripts/platform-issue.mjs list [--status <s>] [--all] [--json] [--root <path>]
//   node scripts/platform-issue.mjs stats [--json] [--root <path>]
//   node scripts/platform-issue.mjs resolve --id ISSUE-NNN --status triaged|fixed|deferred
//        [--fixed-by <commit|REQ>] [--note <text>] [--root <path>]
//   node scripts/platform-issue.mjs check [--root <path>]
//
// 设计要点：
//   - **只追加**：改状态靠追加一条「事件行」（分类/严重度/摘要留空），当前状态 = 该 ID 的最后一行；
//   - 分类与严重度以**首行**为准，不追溯改写历史（改判就新增一条问题并 resolve 旧的为 deferred）；
//   - 台账是**项目自己的数据**，不纳入平台受管清单（SEEDED/PROJECT_SCRIPTS 之外的生成物），
//     平台升级不会覆盖它——与 `docs/PROJECT_MEMORY.md` 同理；
//   - 全程**无网络**：问题留在项目里，由母体侧 `scripts/platform-intake.mjs` 主动汇总。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ISSUE_FILE = 'docs/PLATFORM_ISSUES.md'
export const CATEGORIES = ['platform-bug', 'rule-gap', 'tool-gap', 'docs-gap', 'env', 'other']
export const SEVERITIES = ['blocker', 'major', 'minor']
export const STATES = ['open', 'triaged', 'fixed', 'deferred']
export const OPEN_STATES = new Set(['open', 'triaged'])
const SEVERITY_RANK = { blocker: 0, major: 1, minor: 2 }
const BEGIN = '<!-- issues:begin -->'
const END = '<!-- issues:end -->'
const COLUMNS = '| ID | 日期 | 分类 | 严重度 | 触发点 | 摘要 | 证据 | 状态 |'
const DIVIDER = '|---|---|---|---|---|---|---|---|'
const EMPTY = '—'
const ID_RE = /^ISSUE-\d{3,}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// 台账骨架。这里是**唯一**定义：`init-project.mjs` 调用它生成种子文件，
// 因此不存在"模板文件与代码常量各写一份"的漂移面。
export function issueSkeleton() {
  return `# 平台问题台账

> 记录**在项目里使用平台工作流时遇到的问题**（平台自身缺陷、规则不清、工具缺失、文档误导、环境依赖、其它）。
> 由 \`node scripts/platform-issue.mjs\` 维护，**只追加**：改状态 = 追加一条事件行（分类/严重度/摘要留空）。
> 当前状态 = 该 ID 的最后一行；分类与严重度以**首行**为准。全部留在项目内，**不回传任何数据**。

## 怎么上报

\`\`\`bash
# 1) 手动记录（明确知道是什么问题时）
node scripts/platform-issue.mjs log --category rule-gap --severity major \\
  --trigger "task-flow:finish" --summary "合并点提示语看不懂" --evidence "task-flow finish → 输出里没有任何版本信息"

# 2) 包装命令：命令**非零退出**才记录（含命令、退出码、输出尾部）
node scripts/platform-issue.mjs capture -- node scripts/memory.mjs check

# 3) 平台自检失败自动落账：platform-doctor 属**母体侧**工具，在平台目录执行；
#    它报 ❌ 时会自动往本项目台账落一条（按"触发点+摘要"去重，--no-report 可关）
node <平台路径>/scripts/platform-doctor.mjs --target .
\`\`\`

## 分类与严重度

- **分类**：\`platform-bug\`（平台代码/脚本有缺陷）· \`rule-gap\`（规则含糊、互相矛盾或缺失）· \`tool-gap\`（该有工具但没有）· \`docs-gap\`（文档错误或缺失）· \`env\`（环境/依赖）· \`other\`
- **严重度**：\`blocker\`（挡住开发，只能停）· \`major\`（能绕但代价明显）· \`minor\`（体验/噪音级）
- **状态**：\`open\` → \`triaged\`（已分诊，待修）→ \`fixed\`（已修复，必须给 \`--fixed-by\`）| \`deferred\`（暂缓）

## 台账

${BEGIN}
${COLUMNS}
${DIVIDER}
${END}
`
}

const fail = (message, code = 1) => {
  console.error(`issue: ${message}`)
  process.exit(code)
}

// 单元格禁止竖线与换行：竖线会破坏 Markdown 表格，换行会破坏"一行一条"。
const cell = (value, field) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.includes('|')) fail(`${field} 不能包含竖线 "|"（会破坏表格）：${text}`)
  return text
}

const today = () => {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// 从证据串里取出 fixed-by 的值，去掉人类备注（`fixed-by: abc123（说明）` → `abc123`）。
const fixedByOf = (evidence) => {
  const match = /fixed-by:\s*([^｜（(]+)/.exec(String(evidence ?? ''))
  return match ? match[1].trim() : ''
}

const splitRow = (line) =>
  line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((part) => part.trim())

// 解析台账 → { errors, issues }。issues 为每个 ID 的合并视图（首行字段 + 最后事件状态 + 历史）。
export function parseIssues(text) {
  const errors = []
  const issues = []
  const byId = new Map()
  const begin = text.indexOf(BEGIN)
  const end = text.indexOf(END)
  if (begin < 0 || end < 0 || end < begin) {
    errors.push(`缺少台账标记 ${BEGIN} / ${END}`)
    return { errors, issues }
  }
  for (const raw of text.slice(begin + BEGIN.length, end).split('\n')) {
    const line = raw.trim()
    if (!line.startsWith('|')) continue
    const cells = splitRow(line)
    if (cells[0] === 'ID' || /^-+$/.test(cells[0])) continue
    if (cells.length !== 8) {
      errors.push(`列数不是 8（实际 ${cells.length}）：${line}`)
      continue
    }
    const [id, date, category, severity, trigger, summary, evidence, status] = cells
    if (!ID_RE.test(id)) errors.push(`ID 格式非法（应为 ISSUE-001 形式）：${id}`)
    if (!DATE_RE.test(date)) errors.push(`${id} 的日期格式非法：${date}`)
    if (!STATES.includes(status)) errors.push(`${id} 的状态非法：${status}`)
    const previous = byId.get(id)
    if (status === 'open') {
      if (!CATEGORIES.includes(category)) errors.push(`${id} 的分类非法：${category}`)
      if (!SEVERITIES.includes(severity)) errors.push(`${id} 的严重度非法：${severity}`)
      if (!summary) errors.push(`${id} 缺少摘要`)
      if (!trigger) errors.push(`${id} 缺少触发点（无法定位问题在哪一步）`)
      if (previous) errors.push(`${id} 重复出现 open 行（每个 ID 只能有一条首行）`)
    } else {
      if (!previous) {
        errors.push(`${id} 出现事件行但没有 open 首行`)
      } else if (previous.status === 'fixed') {
        errors.push(`${id} 在 fixed 之后仍有事件行（fixed 是终态；如需重开请新增一条问题）`)
      } else if (category !== EMPTY || severity !== EMPTY || summary) {
        errors.push(`${id} 的事件行只允许填证据与状态（分类/严重度留 ${EMPTY}，摘要留空）`)
      }
      if (status === 'fixed' && !/fixed-by:/.test(evidence)) {
        errors.push(`${id} 标记 fixed 但证据里没有 fixed-by:（必须能追溯到修复提交或需求）`)
      }
      if (!DATE_RE.test(date)) errors.push(`${id} 的事件行日期格式非法：${date}`)
    }
    if (previous) {
      previous.status = STATES.includes(status) ? status : previous.status
      previous.events.push({ date, status, evidence })
      if (status === 'fixed') previous.fixedBy = fixedByOf(evidence)
    } else {
      const issue = {
        id, date, category, severity, trigger, summary, evidence, status,
        source: '', events: [{ date, status, evidence }],
      }
      byId.set(id, issue)
      issues.push(issue)
    }
  }
  return { errors, issues }
}

export function readIssues(root) {
  const path = join(root, ISSUE_FILE)
  if (!existsSync(path)) return { errors: [`没有 ${ISSUE_FILE}（先运行 node scripts/platform-issue.mjs init）`], issues: [], text: '' }
  const text = readFileSync(path, 'utf8')
  return { ...parseIssues(text), text }
}

export function issueFilePath(root) {
  return join(root, ISSUE_FILE)
}

// 追加一条问题首行。`dedup` 为真时，若同「触发点 + 摘要」已有未关闭记录则跳过并返回 skipped。
export function logIssue(root, entry, options = {}) {
  const path = issueFilePath(root)
  if (!existsSync(path)) createIssueFile(root)
  const state = readIssues(root)
  const date = entry.date ? cell(entry.date, '日期') : today()
  if (!DATE_RE.test(date)) fail(`日期格式非法：${date}`)
  const category = cell(entry.category, '分类')
  const severity = cell(entry.severity, '严重度')
  const summary = cell(entry.summary, '摘要')
  const trigger = cell(entry.trigger || 'manual', '触发点')
  const evidence = cell(entry.evidence || EMPTY, '证据')
  if (!CATEGORIES.includes(category)) fail(`分类非法：${category}（可选 ${CATEGORIES.join(' / ')}）`)
  if (!SEVERITIES.includes(severity)) fail(`严重度非法：${severity}（可选 ${SEVERITIES.join(' / ')}）`)
  if (!summary) fail('必须给 --summary')
  if (options.dedup) {
    const existing = state.issues.find(
      (issue) => OPEN_STATES.has(issue.status) && issue.trigger === trigger && issue.summary === summary,
    )
    if (existing) return { skipped: true, id: existing.id }
  }
  const next = state.issues.reduce((max, issue) => Math.max(max, Number(issue.id.slice('ISSUE-'.length))), 0) + 1
  const id = `ISSUE-${String(next).padStart(3, '0')}`
  const row = `| ${id} | ${date} | ${category} | ${severity} | ${trigger} | ${summary} | ${evidence} | open |`
  appendRow(path, row)
  return { skipped: false, id, row }
}

function appendRow(path, row) {
  const text = readFileSync(path, 'utf8')
  const end = text.indexOf(END)
  if (end < 0) fail(`台账缺少 ${END} 标记，无法追加`)
  writeFileSync(path, `${text.slice(0, end)}${row}\n${text.slice(end)}`)
}

function createIssueFile(root) {
  const path = issueFilePath(root)
  mkdirSync(dirname(path), { recursive: true })
  if (!existsSync(path)) writeFileSync(path, issueSkeleton())
  return path
}

// 输出尾部的若干行：证据要能复现问题，但台账不是日志倾倒场。
export function tail(text, lines = 6, width = 400) {
  const body = String(text ?? '').split('\n').map((line) => line.trimEnd()).filter(Boolean).slice(-lines).join(' ⏎ ')
  return body.length > width ? `${body.slice(0, width)}…` : body
}

const runCapture = (root, rest) => {
  const separator = rest.indexOf('--')
  if (separator < 0 || separator === rest.length - 1) fail('capture 用法：capture [选项] -- <命令...>', 2)
  const options = rest.slice(0, separator)
  const command = rest.slice(separator + 1).join(' ')
  const option = (name, fallback = '') => {
    const index = options.indexOf(name)
    return index >= 0 && options[index + 1] && !options[index + 1].startsWith('--') ? options[index + 1] : fallback
  }
  const result = spawnSync(command, { shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  const code = result.status ?? 1
  if (code === 0) {
    console.log(`issue: capture 通过（exit 0），未记录：${command}`)
    return
  }
  const report = logIssue(root, {
    category: option('--category', 'other'),
    severity: option('--severity', 'minor'),
    trigger: option('--trigger', `capture:${command.split(' ').slice(0, 2).join(' ')}`),
    summary: `命令失败（exit ${code}）：${command}`,
    evidence: `exit ${code}${tail(output) ? `｜${tail(output)}` : ''}`,
  }, { dedup: !options.includes('--force') })
  if (report.skipped) {
    console.log(`issue: 已有未关闭的同类问题 ${report.id}，跳过（--force 强制记录）`)
  } else {
    console.log(`issue: 已记录 ${report.id}（exit ${code}）`)
  }
  process.exit(code)
}

const runResolve = (root, rest) => {
  const option = (name, fallback = '') => {
    const index = rest.indexOf(name)
    return index >= 0 && rest[index + 1] && !rest[index + 1].startsWith('--') ? rest[index + 1] : fallback
  }
  const id = option('--id')
  const status = option('--status')
  if (!id || !status) fail('resolve 用法：resolve --id ISSUE-NNN --status triaged|fixed|deferred [--fixed-by <ref>] [--note <text>]', 2)
  if (!['triaged', 'fixed', 'deferred'].includes(status)) fail(`resolve 的状态非法：${status}`, 2)
  const state = readIssues(root)
  const issue = state.issues.find((row) => row.id === id)
  if (!issue) fail(`台账里没有 ${id}`)
  if (issue.status === 'fixed') fail(`${id} 已是 fixed（终态），不能再次变更`)
  const fixedBy = cell(option('--fixed-by'), '--fixed-by')
  const note = cell(option('--note'), '--note')
  if (status === 'fixed' && !fixedBy) fail('标记 fixed 必须给 --fixed-by <commit|REQ>（否则无法追溯修复）', 2)
  const evidence = [fixedBy ? `fixed-by: ${fixedBy}` : '', note].filter(Boolean).join('｜') || EMPTY
  const row = `| ${id} | ${today()} | ${EMPTY} | ${EMPTY} | ${EMPTY} |  | ${evidence} | ${status} |`
  appendRow(issueFilePath(root), row)
  console.log(`issue: ${id} → ${status}${fixedBy ? `（fixed-by: ${fixedBy}）` : ''}`)
}

const describe = (issue) => ({
  ...issue,
  age: Math.round((Date.now() - new Date(`${issue.date}T00:00:00`).getTime()) / 86400000),
})

const sortIssues = (issues) =>
  [...issues].sort((left, right) =>
    (SEVERITY_RANK[left.severity] ?? 9) - (SEVERITY_RANK[right.severity] ?? 9) ||
    left.date.localeCompare(right.date) || left.id.localeCompare(right.id))

const runList = (root, rest) => {
  const state = readIssues(root)
  const option = (name, fallback = '') => {
    const index = rest.indexOf(name)
    return index >= 0 && rest[index + 1] && !rest[index + 1].startsWith('--') ? rest[index + 1] : fallback
  }
  const status = option('--status')
  const all = rest.includes('--all')
  const rows = state.issues.filter((issue) =>
    status ? issue.status === status : all || OPEN_STATES.has(issue.status))
  if (rest.includes('--json')) {
    console.log(JSON.stringify(sortIssues(rows).map(describe), null, 2))
    return
  }
  if (rows.length === 0) {
    console.log(status || all ? 'issue: 没有匹配的记录' : 'issue: 没有未关闭的问题')
    return
  }
  for (const issue of sortIssues(rows)) {
    console.log(`${issue.id}  [${issue.severity}/${issue.category}]  ${issue.status}  ${issue.date}  ${issue.summary}`)
    console.log(`           触发点 ${issue.trigger}｜证据 ${issue.evidence}${issue.fixedBy ? `｜fixed-by ${issue.fixedBy}` : ''}`)
  }
  console.log(`issue: 共 ${rows.length} 条（未关闭 ${state.issues.filter((issue) => OPEN_STATES.has(issue.status)).length} / 全部 ${state.issues.length}）`)
}

const runStats = (root, rest) => {
  const state = readIssues(root)
  const count = (list, key) => list.reduce((acc, item) => ({ ...acc, [item[key]]: (acc[item[key]] ?? 0) + 1 }), {})
  const open = state.issues.filter((issue) => OPEN_STATES.has(issue.status))
  const stats = {
    total: state.issues.length,
    byStatus: count(state.issues, 'status'),
    byCategory: count(state.issues, 'category'),
    bySeverity: count(state.issues, 'severity'),
    openBySeverity: count(open, 'severity'),
    oldestOpen: sortIssues(open)[0]?.id ?? '',
    structuralErrors: state.errors.length,
  }
  if (rest.includes('--json')) {
    console.log(JSON.stringify(stats, null, 2))
    return
  }
  console.log(`issue: 共 ${stats.total} 条｜未关闭 ${open.length}`)
  console.log(`  状态 ${JSON.stringify(stats.byStatus)}`)
  console.log(`  分类 ${JSON.stringify(stats.byCategory)}`)
  console.log(`  未关闭严重度 ${JSON.stringify(stats.openBySeverity)}`)
  if (stats.oldestOpen) console.log(`  最早未关闭 ${stats.oldestOpen}`)
}

const runCheck = (root) => {
  const state = readIssues(root)
  if (state.errors.length > 0) {
    console.error(`issue: check 未通过（${state.errors.length} 项）`)
    for (const message of state.errors) console.error(`  - ${message}`)
    process.exit(1)
  }
  const open = state.issues.filter((issue) => OPEN_STATES.has(issue.status)).length
  console.log(`issue: check 通过（${state.issues.length} 条记录，未关闭 ${open} 条）`)
}

const runInit = (root) => {
  const path = issueFilePath(root)
  if (existsSync(path)) {
    console.log(`issue: ${ISSUE_FILE} 已存在，未改动`)
    return
  }
  createIssueFile(root)
  console.log(`issue: 已生成 ${ISSUE_FILE}`)
}

// 仅作为命令执行时跑主流程；被 import 时（init-project 取骨架、doctor/intake 复用函数）不执行命令。
// 入口判断必须比较 realpath：macOS 上 /var 是 /private/var 的符号链接，
// 朴素比较会让 CLI 静默什么都不做却返回 0——比报错更糟。
const samePath = (left, right) => {
  try {
    return realpathSync(left) === realpathSync(right)
  } catch {
    return false
  }
}
const isEntry = Boolean(process.argv[1]) && samePath(process.argv[1], fileURLToPath(import.meta.url))
if (isEntry) {
  const argv = process.argv.slice(2)
  const command = argv[0] ?? ''
  const rootIndex = argv.indexOf('--root')
  const root = resolve(rootIndex >= 0 && argv[rootIndex + 1] ? argv[rootIndex + 1] : process.cwd())
  const rest = argv.slice(1).filter((value, index, list) =>
    !(value === '--root' || (index > 0 && list[index - 1] === '--root')))
  if (command === 'init') runInit(root)
  else if (command === 'log') {
    const option = (name, fallback = '') => {
      const index = rest.indexOf(name)
      return index >= 0 && rest[index + 1] && !rest[index + 1].startsWith('--') ? rest[index + 1] : fallback
    }
    const result = logIssue(root, {
      category: option('--category', 'other'),
      severity: option('--severity', 'minor'),
      trigger: option('--trigger', 'manual'),
      summary: option('--summary'),
      evidence: option('--evidence', EMPTY),
      date: option('--date'),
    }, { dedup: rest.includes('--dedup') })
    if (result.skipped) console.log(`issue: 已有未关闭的同类问题 ${result.id}，跳过`)
    else console.log(`issue: 已记录 ${result.id}`)
  } else if (command === 'capture') runCapture(root, rest)
  else if (command === 'resolve') runResolve(root, rest)
  else if (command === 'list') runList(root, rest)
  else if (command === 'stats') runStats(root, rest)
  else if (command === 'check') runCheck(root)
  else if (command === 'path') console.log(issueFilePath(root))
  else fail('用法：node scripts/platform-issue.mjs <init|log|capture|resolve|list|stats|check|path> [--root <path>]', 2)
}
