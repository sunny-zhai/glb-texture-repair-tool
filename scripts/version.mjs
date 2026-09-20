// 版本分支管理：为"当前版本"维护一个版本分支（默认 release/vX.Y.Z）。
// 任务子分支自动合并到版本分支；版本分支测试通过后再申请合并到 master（人工）。
// 状态记录在 .ai/version.json（纳入版本控制）。
// 用法：
//   node scripts/version.mjs show
//   node scripts/version.mjs init --version v0.1.0 [--base <branch>] [--prefix release/]
//   node scripts/version.mjs bump --level patch|minor|major
//   [--root <path>] [--json]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const command = argv[0] ?? 'show'
const option = (name, fallback) => {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}
const asJson = argv.includes('--json')

const root = resolve(option('--root', process.cwd()))
const statePath = join(root, '.ai', 'version.json')

const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()

function fail(message) {
  console.error(`version: ${message}`)
  process.exit(1)
}

function loadState() {
  if (!existsSync(statePath)) return null
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    fail(`invalid state file: ${statePath}`)
  }
}

function saveState(state) {
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

// 用临时索引把状态文件提交进指定分支，不触碰当前工作树的索引与工作区。
// 目的：版本分支自身携带 .ai/version.json，使由它派生的 worktree 能读到版本状态；
// 否则 worktree 内 task-flow 会因 "no version branch registered" 而无法合并。
//
// 只构造提交对象，不创建引用：调用方在提交对象成功后才 update-ref 建分支，
// 这样任何一步失败都不会留下"分支已存在但状态未提交"的半成品，可安全重跑。
// 注意这里绝不调用 fail()（process.exit 不会执行 finally，会泄漏临时索引）。
function buildStateCommit(base, message) {
  const indexPath = join(tmpdir(), `version-index-${process.pid}-${Date.now()}`)
  const env = { ...process.env, GIT_INDEX_FILE: indexPath }
  try {
    git(['read-tree', base], { env })
    const blob = git(['hash-object', '-w', statePath], { env })
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},.ai/version.json`], { env })
    const tree = git(['write-tree'], { env })
    const parent = git(['rev-parse', base])
    return git(['commit-tree', tree, '-p', parent, '-m', message])
  } finally {
    rmSync(indexPath, { force: true })
  }
}

// 版本分支必须有干净的已跟踪工作树才能安全切换；未跟踪文件由状态文件本身产生，不拦。
function requireCleanTree() {
  if (git(['status', '--porcelain', '--untracked-files=no'])) {
    fail('working tree has uncommitted changes; commit or stash before creating a version branch')
  }
}

// 构造提交失败时回滚工作区里刚写入的状态文件，保证 init/bump 可重跑
function stateCommitOrRollback(base, message) {
  try {
    return buildStateCommit(base, message)
  } catch (error) {
    rmSync(statePath, { force: true })
    // git 会附带多行提示，只保留最后一行结论，避免刷屏
    const reason = `${error?.stderr ?? ''}`
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .pop()
    fail(`cannot record version state${reason ? `: ${reason}` : ''} (check user.name / user.email)`)
  }
}

function branchExists(name) {
  try {
    git(['rev-parse', '--verify', `refs/heads/${name}`])
    return true
  } catch {
    return false
  }
}

// worktree 约定把各任务的工作树放在 .worktrees/：确保它不污染 git status，
// 否则并行开发一开始项目就是"脏"的。写 .git/info/exclude（本地、不受跟踪），
// 而不是改项目的 .gitignore —— init 不应顺手改动受跟踪文件。
function ensureWorktreesIgnored() {
  try {
    const excludePath = join(resolve(root, git(['rev-parse', '--git-common-dir'])), 'info', 'exclude')
    const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : ''
    if (/^\.worktrees\/$/m.test(current)) return false
    mkdirSync(dirname(excludePath), { recursive: true })
    writeFileSync(excludePath, `${current.replace(/\n*$/, '\n')}# 开发期并行工作树（task-flow finish）\n.worktrees/\n`)
    return true
  } catch {
    return false // 忽略失败：不应因本地 exclude 写不进而阻断 init
  }
}

function parseVersion(value) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(value ?? '')
  if (!match) fail(`invalid version "${value}" (expected vMAJOR.MINOR.PATCH)`)
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

// 基线分支：优先采用仓库实际的默认分支（origin/HEAD），再回退到本地存在的 main/master。
// 不硬编码 "main"：默认分支是 master 的仓库（如本平台自身）否则会直接报 base not found。
function defaultBase() {
  try {
    const name = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '')
    if (name && branchExists(name)) return name
  } catch {
    /* no remote or origin/HEAD not set */
  }
  for (const candidate of ['main', 'master']) {
    if (branchExists(candidate)) return candidate
  }
  return 'main'
}

function nextVersion(current, level) {
  const { major, minor, patch } = parseVersion(current)
  if (level === 'major') return `v${major + 1}.0.0`
  if (level === 'minor') return `v${major}.${minor + 1}.0`
  if (level === 'patch') return `v${major}.${minor}.${patch + 1}`
  fail(`--level must be patch|minor|major (got "${level}")`)
}

try {
  git(['rev-parse', '--git-dir'])
} catch {
  fail('not a git repository (run inside the project, or pass --root)')
}

const state = loadState()

if (command === 'show') {
  if (!state) fail('no version branch registered; run: node scripts/version.mjs init --version v0.1.0')
  if (state.current && !branchExists(state.current)) {
    fail(`registered version branch "${state.current}" no longer exists`)
  }
  if (asJson) console.log(JSON.stringify(state, null, 2))
  else console.log(`version: current=${state.current} base=${state.base} prefix=${state.prefix}`)
  process.exit(0)
}

// 把当前工作树切到版本分支，使其携带受跟踪的 .ai/version.json。
// 必须先删除工作区里的未跟踪副本：否则 git 会以"未跟踪文件将被覆盖"拒绝检出。
function activateVersionBranch(branch) {
  rmSync(statePath, { force: true })
  try {
    git(['checkout', branch])
    console.log(`version: checked out ${branch} (version state is now tracked here)`)
    return true
  } catch {
    console.log(`version: could not switch to ${branch} automatically; run: git checkout ${branch}`)
    return false
  }
}

if (command === 'init') {
  const version = option('--version', '')
  const base = option('--base', '') || defaultBase()
  const prefix = option('--prefix', 'release/')
  parseVersion(version)
  if (!branchExists(base)) fail(`base branch "${base}" not found`)
  const branch = `${prefix}${version}`
  if (branchExists(branch)) fail(`branch "${branch}" already exists`)
  // 切换前先要求干净工作树，避免把未提交改动一起带到版本分支
  requireCleanTree()

  saveState({ current: branch, version, base, prefix })
  if (ensureWorktreesIgnored()) console.log('version: ignored .worktrees/ in .git/info/exclude')
  const commit = stateCommitOrRollback(base, 'chore(version): track version state on version branch')
  // 提交对象就绪后才建立分支引用：此前任何失败都不会留下半成品分支
  try {
    git(['update-ref', `refs/heads/${branch}`, commit])
  } catch (error) {
    rmSync(statePath, { force: true })
    fail(`cannot create ${branch}: ${error?.message ?? error}`)
  }
  console.log(`version: created ${branch} from ${base}`)
  activateVersionBranch(branch)
  process.exit(0)
}

if (command === 'bump') {
  if (!state) fail('no version branch registered; run init first')
  const level = option('--level', 'patch')
  const version = nextVersion(state.version, level)
  const branch = `${state.prefix}${version}`
  if (branchExists(branch)) fail(`branch "${branch}" already exists`)
  if (!branchExists(state.current)) fail(`current version branch "${state.current}" not found`)
  requireCleanTree()

  saveState({ ...state, current: branch, version })
  const commit = stateCommitOrRollback(state.current, 'chore(version): track version state on version branch')
  try {
    git(['update-ref', `refs/heads/${branch}`, commit])
  } catch (error) {
    rmSync(statePath, { force: true })
    fail(`cannot create ${branch}: ${error?.message ?? error}`)
  }
  console.log(`version: created ${branch} from ${state.current} (now current)`)
  activateVersionBranch(branch)
  process.exit(0)
}

fail(`unknown command "${command}" (expected show | init | bump)`)
