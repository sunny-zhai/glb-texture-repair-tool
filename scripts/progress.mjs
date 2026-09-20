// 项目工作进程线：聚合需求 / 任务 / 人工闸门 / 测试证据 / 发布清单与 git 状态，
// 渲染 6 阶段进度线（需求对齐 → 设计 → 实现 → 审查 → 验证 → 发布）。
// 用法：node scripts/progress.mjs [--root <path>] [--json]
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { TASK_DONE, loadRequirements } from './requirements-parse.mjs'

const argv = process.argv.slice(2)
const index = argv.indexOf('--root')
const root = resolve(index >= 0 && argv[index + 1] ? argv[index + 1] : process.cwd())
const asJson = argv.includes('--json')

const readOptional = (relative) => {
  const path = join(root, relative)
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

// ---- 解析：人工闸门留痕 ----
function parseApprovals(text) {
  if (!text) return []
  return text
    .split('\n')
    .filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}/.test(line))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean)
      return { time: cells[0], gate: cells[1], decision: cells[2], actor: cells[3], ref: cells[4] }
    })
}

// ---- 解析：测试计划 ----
function parseTestPlan(text) {
  if (!text) return { cases: 0, executed: 0, checked: 0, total: 0 }
  const cases = (text.match(/^###\s+TC-\d+/gm) ?? []).length
  let executed = 0
  for (const line of text.split('\n')) {
    if (!/^\|\s*TC-\d+/.test(line)) continue
    const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean)
    const result = cells[2] ?? ''
    // 占位符（{{…}}）与"未执行"都不算已执行
    if (result && !/未执行|\{\{/.test(result)) executed += 1
  }
  const checked = (text.match(/^\s*-\s*\[x\]/gim) ?? []).length
  const total = checked + (text.match(/^\s*-\s*\[\s\]/gm) ?? []).length
  return { cases, executed, checked, total }
}

// ---- 解析：发布清单 ----
function parseRelease(text) {
  if (!text) return { checked: 0, total: 0 }
  const checked = (text.match(/^\s*-\s*\[x\]/gim) ?? []).length
  const total = checked + (text.match(/^\s*-\s*\[\s\]/gm) ?? []).length
  return { checked, total }
}

function gitInfo() {
  const run = (args) => {
    try {
      return execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return ''
    }
  }
  return {
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD']) || 'n/a',
    lastCommit: run(['log', '--oneline', '-1']) || 'n/a',
    dirty: (run(['status', '--porcelain']) || '').split('\n').filter(Boolean).length,
    commits: (run(['rev-list', '--count', 'HEAD']) || '0'),
  }
}

const { requirements, tasks } = loadRequirements(root)
const approvals = parseApprovals(readOptional('docs/approvals/APPROVALS.md'))
const testPlan = parseTestPlan(readOptional('docs/testing/TEST_PLAN.md'))
const release = parseRelease(readOptional('docs/release/RELEASE_CHECKLIST.md'))
const adr = readOptional('docs/design/ADR.md')
const contract = readOptional('docs/api/openapi.json')
const git = gitInfo()

const tasksDone = tasks.filter((task) => TASK_DONE.test(task.status)).length
// 占位符（{{…}}）不算已填写，避免脚手架模板把阶段误判为完成
const filledRequirements = requirements.filter(
  (req) => req.criteria > 0 && req.status.trim() !== '' && !req.status.includes('{{'),
)
const requirementReady = requirements.length > 0 && filledRequirements.length === requirements.length
// 占位符（{{…}}）不算真实决策/契约，避免脚手架模板把"设计"阶段误判为完成
const adrCount = (adr?.split(/^## /m).slice(1) ?? []).filter((block) => {
  const status = block.match(/\*\*状态\*\*[：:]\s*([^\n]+)/)?.[1] ?? ''
  return status.trim() !== '' && !status.includes('{{')
}).length
const contractReal = Boolean(contract) && !contract.includes('{{')
const designReady = adrCount > 0 || contractReal
const gateDecisions = new Set(approvals.map((entry) => `${entry.gate}:${entry.decision}`))
// 当前版本：让"现在是什么版本"每天都可见——版本只在显式 bump 时变更，合并不改变它
const versionState = (() => {
  const raw = readOptional('.ai/version.json')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
})()
const verificationDone = testPlan.executed > 0 || testPlan.checked > 0

const phases = [
  {
    name: '需求对齐',
    signal: `${requirements.length} 个 REQ · ${filledRequirements.length} 个已填写（含验收标准）`,
    state: requirements.length === 0 ? 'pending' : requirementReady ? 'done' : 'active',
  },
  {
    name: '设计',
    signal: `真实 ADR ${adrCount} 条 · 契约 ${contractReal ? '已定稿' : contract ? '模板' : '无'}`,
    state: designReady ? 'done' : requirements.length > 0 ? 'active' : 'pending',
  },
  {
    name: '实现',
    signal: `${tasksDone}/${tasks.length} 个任务完成`,
    state: tasks.length === 0 ? 'pending' : tasksDone === tasks.length ? 'done' : 'active',
  },
  {
    name: '审查',
    signal: `${approvals.length} 条闸门记录`,
    state: gateDecisions.has('architecture:approved') || gateDecisions.has('delivery:approved')
      ? 'done'
      : tasks.length > 0 ? 'active' : 'pending',
  },
  {
    name: '验证',
    signal: `用例 ${testPlan.cases} · 已执行 ${testPlan.executed} · 维度 ${testPlan.checked}/${testPlan.total}`,
    state: verificationDone ? 'done' : tasks.length > 0 ? 'active' : 'pending',
  },
  {
    name: '发布',
    signal: release.total > 0 ? `清单 ${release.checked}/${release.total}` : '无发布清单',
    state: gateDecisions.has('delivery:approved') || (release.total > 0 && release.checked === release.total)
      ? 'done'
      : verificationDone ? 'active' : 'pending',
  },
]

const SYMBOL = { done: '✓', active: '◐', pending: '○' }

if (asJson) {
  console.log(JSON.stringify({ root, version: versionState, phases, requirements, tasks, approvals: approvals.length, testPlan, release, git }, null, 2))
  process.exit(0)
}

const line = phases.map((phase) => `${SYMBOL[phase.state]} ${phase.name}`).join(' ──▶ ')
console.log('项目工作进程线')
console.log(`  ${line}`)
console.log('')
for (const phase of phases) console.log(`  ${SYMBOL[phase.state]} ${phase.name.padEnd(6)} ${phase.signal}`)

if (requirements.length > 0) {
  console.log('\n需求（REQ）')
  for (const req of requirements) console.log(`  - ${req.id} [${req.status}] 验收标准 ${req.criteria}｜${req.title.slice(req.id.length).trim() || req.title}`)
}
if (tasks.length > 0) {
  console.log('\n任务（TASK）')
  for (const task of tasks) console.log(`  - ${task.id} [${task.status}] ← ${task.req || '未关联'}${task.deps ? ` (依赖 ${task.deps})` : ''}`)
}
if (approvals.length > 0) {
  console.log('\n人工闸门留痕')
  for (const entry of approvals) console.log(`  - ${entry.time} ${entry.gate} → ${entry.decision}（${entry.actor}）`)
}
if (versionState?.current) {
  console.log(`\nversion: ${versionState.current}${versionState.version ? `（${versionState.version}）` : ''}`
    + ' · 合并不改变版本号；升级用 `node scripts/version.mjs bump --level patch|minor|major`')
}
console.log(`\ngit: ${git.branch} · ${git.commits} 个提交 · 未提交 ${git.dirty} 个文件 · 最近 ${git.lastCommit}`)
