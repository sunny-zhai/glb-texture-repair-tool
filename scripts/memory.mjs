// 项目记忆线：**结构快照**（派生，sync 覆盖生成）+ **完成线**（只追加）。
//
// 用法：
//   node scripts/memory.mjs sync [--root <path>]
//   node scripts/memory.mjs log --task TASK-XXX [--req REQ-XXX] [--event completed|reopened]
//                               --evidence "<命令或路径 → 结果>" [--commit <sha>] [--note <text>] [--root <path>]
//   node scripts/memory.mjs check [--root <path>] [--report]   # --report：失败时往问题台账落一条（默认关）
//
// 边界：
//   - 权威状态在 docs/requirements/TASKS.md；本文件是**派生的历史**，不是状态源；
//   - 结构段每次 sync 整体覆盖，因此不得含时间戳或机器相关信息（否则每次 check 都失败）；
//   - 完成段只追加。写点固定在**串行合并点**（单写者）：并行开发阶段任何任务都不得改动本文件。
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TASK_DONE, loadRequirements } from './requirements-parse.mjs'
import { ISSUE_FILE, logIssue } from './platform-issue.mjs'

// 记忆线文件路径：这里是**唯一**定义（doctor 的入库检查也用它，避免两处各写一份字面量）。
export const MEMORY_FILE = 'docs/PROJECT_MEMORY.md'
const FILE = MEMORY_FILE
const S_BEGIN = '<!-- memory:structure:begin -->'
const S_END = '<!-- memory:structure:end -->'
const C_BEGIN = '<!-- memory:completion:begin -->'
const C_END = '<!-- memory:completion:end -->'
const COLUMNS = '| 日期 | REQ | TASK | 事件 | 证据 | commit |'
const DIVIDER = '|---|---|---|---|---|---|'
const EVENTS = new Set(['completed', 'reopened'])

// 结构快照里不体现的目录：版本库、依赖、构建产物、平台自身的一次性目录
const IGNORED = new Set([
  '.git', '.venv', 'node_modules', '.worktrees', '__pycache__', '.archive', '.uvcache',
  'dist', 'build', 'coverage', '.pytest_cache', '.codegraph', '.superpowers', '.ruff_cache',
])
// 项目文档清单（结构快照里逐项标注是否就位）
const DOC_SEEDS = [
  'REQUIREMENTS.md', 'TASKS.md', 'TEST_PLAN.md', 'PERF_BUDGET.md',
  'RELEASE_CHECKLIST.md', 'APPROVALS.md', 'ADR.md', 'openapi.json', 'PROJECT_MEMORY.md',
]
const DOC_DIRS = {
  'REQUIREMENTS.md': 'docs/requirements',
  'TASKS.md': 'docs/requirements',
  'TEST_PLAN.md': 'docs/testing',
  'PERF_BUDGET.md': 'docs/testing',
  'RELEASE_CHECKLIST.md': 'docs/release',
  'APPROVALS.md': 'docs/approvals',
  'ADR.md': 'docs/design',
  'openapi.json': 'docs/api',
  'PROJECT_MEMORY.md': 'docs',
}

// 新记忆线文件的骨架。这里是**唯一**定义：`init-project.mjs` 直接调用它生成种子文件，
// 因此不存在"模板文件与代码常量各写一份"的漂移面。
// 该文件**不纳入平台受管清单**（SEEDED/managedPairs）：它的内容属于项目自己，
// 平台升级不应认为自己有权更新一个累积了项目历史的文件。
export function memorySkeleton() {
  return `# 项目记忆线

> 由 \`node scripts/memory.mjs\` 维护：**结构快照**每次 \`sync\` 覆盖生成；**完成线**只追加。
> 权威状态在 \`docs/requirements/TASKS.md\`；本文件是派生的历史，不是状态源。

## 结构快照

${S_BEGIN}
（尚未生成：运行 \`node scripts/memory.mjs sync\`）
${S_END}

## 完成线

${C_BEGIN}
${COLUMNS}
${DIVIDER}
${C_END}
`
}

const argv = process.argv.slice(2)
const command = argv[0]
const option = (name, fallback = '') => {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback
}
const root = resolve(option('--root') || process.cwd())
const memoryPath = join(root, FILE)

const fail = (message) => {
  console.error(`memory: ${message}`)
  process.exit(2)
}
const violations = []
const report = (message) => violations.push(message)

function readMemory() {
  if (!existsSync(memoryPath)) return null
  return readFileSync(memoryPath, 'utf8')
}

function section(text, begin, end) {
  const start = text.indexOf(begin)
  const stop = text.indexOf(end)
  if (start < 0 || stop < 0 || stop < start) return null
  return text.slice(start + begin.length, stop)
}

function replaceSection(text, begin, end, body) {
  const start = text.indexOf(begin)
  const stop = text.indexOf(end)
  if (start < 0 || stop < 0 || stop < start) return null
  return `${text.slice(0, start + begin.length)}${body}${text.slice(stop)}`
}

const listDir = (path) => {
  if (!existsSync(path) || !statSync(path).isDirectory()) return []
  return readdirSync(path).filter((name) => !IGNORED.has(name) && name !== '.DS_Store').sort()
}

// ---- 结构快照（必须确定性：无时间戳、无绝对路径、全部排序）----
//
// 关键约束：快照只能依赖**被版本控制的内容**。若按工作树扫描，主树会带上被忽略的目录
// （node_modules、样例数据等），而克隆与 worktree 里没有这些东西 → 同一条记忆线在别人机器上
// 算出的快照必然不同 → `memory check` 必失败。实测：某项目快照含 `model/ o-model/ refs/`
// （均被 gitignore），克隆里 `memory check` 报「结构快照已过期」。
// 因此优先用 `git ls-files` 推导；非 git 项目才回退工作树扫描，并在快照里注明。
function trackedPaths() {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    return new Set(out.split('\0').filter(Boolean))
  } catch {
    return null
  }
}

function readLock() {
  const path = join(root, '.ai/platform-lock.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function packageScripts() {
  const path = join(root, 'package.json')
  if (!existsSync(path)) return []
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8'))
    return Object.keys(pkg.scripts ?? {}).sort().map((name) => `npm run ${name}`)
  } catch {
    return []
  }
}

function pythonEntryPoints() {
  const path = join(root, 'pyproject.toml')
  if (!existsSync(path)) return []
  const lines = readFileSync(path, 'utf8').split('\n')
  const start = lines.findIndex((line) => line.trim() === '[project.scripts]')
  if (start < 0) return []
  const entries = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith('[')) break
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*"([^"]+)"/)
    if (match) entries.push(`${match[1]} = ${match[2]}`)
  }
  return entries.sort()
}

// 由被跟踪路径推导结构：顶层目录/文件、各顶层目录的直接子目录
function structureFromTracked(tracked) {
  const topDirs = new Set()
  const topFiles = new Set()
  const children = new Map()
  for (const path of tracked) {
    const parts = path.split('/')
    if (parts.length === 1) {
      topFiles.add(parts[0])
      continue
    }
    topDirs.add(parts[0])
    if (parts.length > 2) {
      if (!children.has(parts[0])) children.set(parts[0], new Set())
      children.get(parts[0]).add(parts[1])
    }
  }
  return { topDirs, topFiles, children }
}

// 非 git 项目：按工作树扫描（排除已知噪声目录）
function structureFromWorkingTree() {
  const topDirs = listDir(root).filter((name) => statSync(join(root, name)).isDirectory())
  const topFiles = listDir(root).filter((name) => statSync(join(root, name)).isFile())
  const children = new Map()
  for (const name of topDirs) {
    children.set(name, listDir(join(root, name)).filter((child) => statSync(join(root, name, child)).isDirectory()))
  }
  return { topDirs: new Set(topDirs), topFiles: new Set(topFiles), children }
}

function generateStructure() {
  const tracked = trackedPaths()
  const lines = []
  lines.push('<!-- 本段由 `node scripts/memory.mjs sync` 生成，请勿手改 -->')
  lines.push('')

  const lockPath = join(root, '.ai/platform-lock.json')
  const lock = readLock()
  let typeLine
  if (!existsSync(lockPath)) {
    typeLine = '本仓库是平台母体（无 `.ai/platform-lock.json`）'
  } else if (tracked !== null && !tracked.has('.ai/platform-lock.json')) {
    typeLine = '未登记（`.ai/platform-lock.json` 未纳入版本控制）'
  } else {
    typeLine = `${lock?.meta?.type ?? '未标注'} / platform ${lock?.platformVersion ?? '未标注'}`
  }
  lines.push(`- **项目类型 / 受管平台版本**：${typeLine}`)

  const { topDirs, topFiles, children } = tracked === null
    ? structureFromWorkingTree()
    : structureFromTracked(tracked)
  lines.push(tracked === null
    ? '- **顶层结构**（深度 2；按工作树扫描 —— 本项目未纳入版本控制）：'
    : '- **顶层结构**（深度 2；仅含纳入版本控制的内容）：')
  const sortedDirs = [...topDirs].sort()
  if (sortedDirs.length === 0) lines.push('  - （无子目录）')
  for (const name of sortedDirs) {
    const kids = [...(children.get(name) ?? [])].sort()
    lines.push(`  - \`${name}/\` → ${kids.length > 0 ? kids.map((c) => `\`${c}\``).join(', ') : '（无子目录）'}`)
  }
  const sortedTopFiles = [...topFiles].sort()
  lines.push(`- **顶层文件**：${sortedTopFiles.length > 0 ? sortedTopFiles.map((f) => `\`${f}\``).join(', ') : '（无）'}`)

  // 入口点只读被跟踪的清单文件，避免未跟踪文件影响快照
  const readable = (rel) => tracked === null || tracked.has(rel)
  const entry = [
    ...(readable('package.json') ? packageScripts() : []),
    ...(readable('pyproject.toml') ? pythonEntryPoints() : []),
  ]
  lines.push(`- **入口点**：${entry.length > 0 ? entry.map((e) => `\`${e}\``).join('、') : '（无 package.json / pyproject 脚本入口）'}`)

  const docs = DOC_SEEDS.map((name) => {
    const rel = `${DOC_DIRS[name]}/${name}`
    const ok = tracked === null ? existsSync(join(root, rel)) : tracked.has(rel)
    return `${name} ${ok ? '✓' : '—'}`
  })
  lines.push(`- **项目文档**：${docs.join(' · ')}`)

  const workflowNames = (dir) => {
    if (tracked === null) {
      const path = join(root, dir)
      if (!existsSync(path)) return []
      return readdirSync(path).filter((name) => name.endsWith('.js')).sort()
    }
    return [...tracked]
      .filter((path) => path.startsWith(`${dir}/`) && path.endsWith('.js') && !path.slice(dir.length + 1).includes('/'))
      .map((path) => path.slice(dir.length + 1))
      .sort()
  }
  const ai = workflowNames('.ai/workflows')
  const dsh = workflowNames('dsh/workflows')
  const parity = JSON.stringify(ai) === JSON.stringify(dsh) ? '两侧一致' : '**两侧不一致**'
  lines.push(`- **工作流**：\`.ai/workflows\` ${ai.length} 个（${ai.map((f) => `\`${f}\``).join(', ') || '无'}）· \`dsh/workflows\` ${dsh.length} 个 · ${parity}`)
  return lines.join('\n')
}

// ---- 完成线 ----
function parseCompletion(text) {
  const body = section(text, C_BEGIN, C_END)
  if (body === null) return null
  const rows = []
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    const cells = trimmed.split('|').map((cell) => cell.trim())
    // "| a | b |" 切分后首尾为空串
    const [, date, req, task, event, evidence, commit] = cells
    if (!date || date === '日期' || /^-+$/.test(date)) continue
    rows.push({ date, req, task, event, evidence, commit, raw: trimmed })
  }
  return rows
}

function evidencePaths(evidence) {
  // 只校验形如路径的 token（含 `/`），避免把 "5/5"、"56 项" 之类误判成文件引用
  return [...new Set((evidence.match(/[\w.-]+(?:\/[\w.-]+)+\.(?:md|mjs|js|py|json|toml|ya?ml)/g) ?? []))]
}

// ---- 命令 ----
function runSync() {
  let text = readMemory()
  if (text === null) {
    // 先落盘骨架、再生成快照：结构段里有"记忆线文件是否存在"这一项，
    // 若边生成边创建，首次 sync 的结果会与之后不同（不幂等）。
    mkdirSync(dirname(memoryPath), { recursive: true })
    writeFileSync(memoryPath, memorySkeleton())
    text = readMemory()
  }
  if (section(text, S_BEGIN, S_END) === null) {
    fail(`${FILE} 缺少结构段标记（${S_BEGIN} / ${S_END}）；请从模板重建该文件`)
  }
  const next = replaceSection(text, S_BEGIN, S_END, `\n${generateStructure()}\n`)
  writeFileSync(memoryPath, next)
  console.log(`memory: 结构快照已刷新（${FILE}）`)
}

function runLog() {
  const task = option('--task')
  const req = option('--req')
  const event = option('--event', 'completed')
  const evidence = option('--evidence')
  const note = option('--note')
  const commit = option('--commit')
  const dateOption = option('--date')
  if (!task && !req) fail('log 至少需要 --task 或 --req')
  if (dateOption && !/^\d{4}-\d{2}-\d{2}$/.test(dateOption)) fail('--date 必须是 YYYY-MM-DD')
  if (!evidence) fail('log 需要 --evidence（记录本次完成所依据的命令或产物）')
  if (!EVENTS.has(event)) fail(`--event 必须是 ${[...EVENTS].join(' / ')}`)
  for (const [label, value] of [['--evidence', evidence], ['--note', note], ['--commit', commit]]) {
    if (value.includes('|')) fail(`${label} 不能包含 "|"（会破坏完成线的表格结构）`)
  }
  let text = readMemory()
  if (text === null) {
    mkdirSync(dirname(memoryPath), { recursive: true })
    text = memorySkeleton()
  }
  const body = section(text, C_BEGIN, C_END)
  if (body === null) fail(`${FILE} 缺少完成段标记（${C_BEGIN} / ${C_END}）`)

  const evidenceCell = note ? `${evidence}（备注：${note}）` : evidence
  const date = dateOption || new Date().toISOString().slice(0, 10)
  const row = `| ${date} | ${req || '—'} | ${task || '—'} | ${event} | ${evidenceCell} | ${commit || '—'} |`
  const next = replaceSection(text, C_BEGIN, C_END, `${body.replace(/\s*$/, '\n')}${row}\n`)
  writeFileSync(memoryPath, next)
  console.log(`memory: 已追加完成线条目 ${task || req} · ${event}`)

  // 写入即提示不一致：check 才是门禁，这里只做提醒（避免 agent 忘记同步 TASKS.md）
  if (task) {
    const { tasks } = loadRequirements(root)
    const found = tasks.find((item) => item.id === task)
    const done = found ? TASK_DONE.test(found.status) : false
    if (event === 'completed' && !done) {
      console.error(`memory: 提示 —— TASKS.md 中 ${task} 当前状态为「${found ? found.status : '不存在'}」，`
        + '完成线记录 completed 后 `memory check` 会失败；请先回填 TASKS.md 的状态与验证结果')
    }
  }
}

function runCheck() {
  const text = readMemory()
  if (text === null) {
    report(`${FILE} 不存在（应由脚手架生成，或运行 \`node scripts/memory.mjs sync\` 创建）`)
    return
  }
  const structure = section(text, S_BEGIN, S_END)
  const rows = parseCompletion(text)
  if (structure === null) report(`${FILE} 缺少结构段标记`)
  if (rows === null) report(`${FILE} 缺少完成段标记`)

  // 1. 结构段是否与当前仓库一致
  if (structure !== null && structure.trim() !== generateStructure().trim()) {
    report('结构快照已过期：运行 `node scripts/memory.mjs sync` 后提交')
  }

  if (rows === null) return
  const { requirements, tasks } = loadRequirements(root)
  const taskById = new Map(tasks.map((item) => [item.id, item]))
  const reqIds = new Set(requirements.map((item) => item.id))
  const rowsByTask = new Map()
  for (const row of rows) {
    if (!rowsByTask.has(row.task)) rowsByTask.set(row.task, [])
    rowsByTask.get(row.task).push(row)
  }

  // 2/3. 与 TASKS.md 双向一致
  for (const task of tasks) {
    const recorded = rowsByTask.get(task.id) ?? []
    const done = TASK_DONE.test(task.status)
    const last = recorded[recorded.length - 1]
    if (done && recorded.length === 0) {
      report(`${task.id} 在 TASKS.md 中已完成，但完成线没有对应条目`)
    } else if (done && last && last.event !== 'completed') {
      report(`${task.id} 在 TASKS.md 中已完成，但完成线最后事件是 ${last.event}（${last.date}）`)
    } else if (!done && last && last.event === 'completed') {
      report(`${task.id} 的完成线最后事件是 completed（${last.date}），但 TASKS.md 状态为「${task.status}」`)
    }
  }

  // 4. 条目本身的完整性
  for (const row of rows) {
    if (!taskById.has(row.task)) report(`完成线引用了 TASKS.md 中不存在的任务：${row.task}`)
    for (const id of (row.req === '—' ? [] : row.req.split(/[、,，\s]+/).filter(Boolean))) {
      if (!reqIds.has(id)) report(`完成线引用了不存在的需求：${id}（${row.task}）`)
    }
    if (!EVENTS.has(row.event)) report(`完成线事件非法：${row.event}（${row.task}）`)
    if (!row.evidence) {
      report(`${row.task} 的完成线条目缺少证据`)
      continue
    }
    for (const path of evidencePaths(row.evidence)) {
      if (!existsSync(join(root, path))) report(`${row.task} 的证据引用了不存在的文件：${path}`)
    }
  }
}

// 仅作为命令执行时跑主流程；被 import 时（如 init-project 取骨架）不执行任何命令
// 入口判断必须比较 realpath：macOS 上 /var 是 /private/var 的符号链接，
// 侧车路径（如 /var/folders/.../scripts/memory.mjs）与 import.meta.url 的实路径不同，
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
  if (command === 'sync') {
    runSync()
  } else if (command === 'log') {
    runLog()
  } else if (command === 'check') {
    runCheck()
  } else {
    fail('用法：node scripts/memory.mjs <sync|log|check> [--root <path>]')
  }

  if (violations.length > 0) {
    console.error(`memory: check 未通过（${violations.length} 项）`)
    for (const message of violations) console.error(`  - ${message}`)
    // 可选上报：默认**关**。check 在每次合并点都会跑，而它多数失败是"台账没跟上"
    // （忘了 sync / 忘了 log），那是项目侧动作缺失，不是平台缺陷——默认上报会把
    // 母体的待分诊队列淹掉。需要留痕时显式加 --report。
    if (argv.includes('--report')) {
      const result = logIssue(root, {
        category: 'rule-gap',
        severity: 'minor',
        trigger: 'memory.mjs:check',
        summary: `memory check 未通过：${violations[0]}`,
        evidence: `${violations.length} 项｜${violations.slice(0, 3).join('；')}`,
      }, { dedup: true })
      console.error(result.skipped
        ? `memory: 已有未关闭的同类问题 ${result.id}，未重复记录`
        : `memory: 已上报 ${result.id} 到 ${ISSUE_FILE}`)
    }
    process.exit(1)
  }
  if (command === 'check') console.log('memory: check 通过（结构快照与完成线均与权威来源一致）')
}
