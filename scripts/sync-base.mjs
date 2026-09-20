// 改前同步基线：把主干（默认 main）最新代码合并进当前需求分支。
// 用于人工验收不通过后的回流修复：先同步主干 → 再修改 → 再测试 → 再自动合并。
// 用法：node scripts/sync-base.mjs [--base <branch>] [--branch <name>] [--remote origin] [--fetch]
//                                 [--dry-run] [--root <path>]
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}
const flag = (name) => argv.includes(name)

const PROTECTED = ['main', 'master']

const root = resolve(option('--root', process.cwd()))
const baseArg = option('--base', '')
const remote = option('--remote', 'origin')
const branchArg = option('--branch', '')
const dryRun = flag('--dry-run')
const doFetch = flag('--fetch')

const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()

function fail(message, code = 1) {
  console.error(`sync-base: ${message}`)
  process.exit(code)
}

function branchExists(name) {
  try {
    git(['rev-parse', '--verify', `refs/heads/${name}`])
    return true
  } catch {
    return false
  }
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

let branch = branchArg
try {
  branch = branchArg || git(['rev-parse', '--abbrev-ref', 'HEAD'])
} catch {
  fail('not a git repository (run inside the project, or pass --root)')
}

// 基线在 git 可用之后才能探测（需要读取分支列表）
const base = baseArg || defaultBase()
if (!branch || branch === 'HEAD') fail('detached HEAD: check out the requirement branch first (e.g. feature/REQ-XXX)')
if (PROTECTED.includes(branch)) {
  fail(`refusing to sync into protected branch "${branch}"; run this on the requirement branch (e.g. feature/REQ-XXX)`)
}
if (branch === base) fail(`current branch is the base branch (${base}); nothing to sync`)

// 只拦已跟踪文件上的改动；未跟踪的临时文件不应阻止同步（git 会在真要覆盖时报错）
if (git(['status', '--porcelain', '--untracked-files=no'])) fail('working tree has uncommitted changes; commit or stash before syncing')

if (doFetch) git(['fetch', remote])

const baseRef = doFetch ? `${remote}/${base}` : base
const headBefore = git(['rev-parse', '--short', 'HEAD'])

let baseHead
try {
  baseHead = git(['rev-parse', '--short', baseRef])
} catch {
  fail(`base ref "${baseRef}" not found (pass --base <branch> or --fetch)`)
}

let alreadyMerged = false
try {
  execFileSync('git', ['merge-base', '--is-ancestor', baseRef, 'HEAD'], { cwd: root, stdio: 'ignore' })
  alreadyMerged = true
} catch {
  alreadyMerged = false
}

if (alreadyMerged) {
  console.log(`sync-base: already up to date with ${baseRef} (${baseHead}); ${branch} @ ${headBefore}`)
  process.exit(0)
}
if (dryRun) {
  console.log(`sync-base: would merge ${baseRef} (${baseHead}) into ${branch} (${headBefore})`)
  process.exit(0)
}

try {
  git(['merge', '--no-edit', baseRef])
} catch (error) {
  try {
    git(['merge', '--abort'])
  } catch {
    /* nothing to abort */
  }
  console.error(`sync-base: conflicts while merging ${baseRef} into ${branch}; merge aborted`)
  console.error(`${error.stdout ?? ''}${error.stderr ?? ''}`.trim())
  fail('resolve conflicts manually (or merge the base yourself), then re-run', 2)
}

const headAfter = git(['rev-parse', '--short', 'HEAD'])
console.log(`sync-base: merged ${baseRef} (${baseHead}) into ${branch}: ${headBefore} -> ${headAfter}`)
