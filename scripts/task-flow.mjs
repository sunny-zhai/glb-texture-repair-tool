// 任务流转（三级分支模型）：master（受保护）← 版本分支（release/vX.Y.Z）← 任务子分支（feature/REQ-XXX）
//   start   从版本分支创建任务子分支
//   finish  门禁通过后，把当前任务子分支【自动合并】回版本分支（无需人工）
//   request 在版本分支上发起【合并 master 申请】——由人合并
// 用法：
//   node scripts/task-flow.mjs start --req 001 --desc login [--root <path>]
//   node scripts/task-flow.mjs finish [--test "<cmd>"] [--branch <feature>]
//   node scripts/task-flow.mjs request [--base master] [--remote origin] [--dry-run]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'

const PROTECTED = ['main', 'master']
const argv = process.argv.slice(2)
const command = argv[0] ?? ''
const option = (name, fallback) => {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}
const flag = (name) => argv.includes(name)

const root = resolve(option('--root', process.cwd()))
const statePath = join(root, '.ai', 'version.json')

const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()

function fail(message, code = 1) {
  console.error(`task-flow: ${message}`)
  process.exit(code)
}

function currentBranch() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === 'HEAD') fail('detached HEAD: check out a branch first')
  return branch
}

// 当前分支未携带 .ai/version.json（例如停在 main）时，回退到唯一的 release/* 分支上读取，
// 这样 task-flow 在任何分支都能给出准确判断（如 "must be raised from the version branch"），
// 而不是笼统的 "no version branch registered"。
function discoverVersion() {
  let branches = []
  try {
    branches = git(['branch', '--list', 'release/*', '--format=%(refname:short)'])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return null
  }
  if (branches.length !== 1) return null
  try {
    return JSON.parse(execFileSync('git', ['show', `${branches[0]}:.ai/version.json`], { cwd: root, encoding: 'utf8' }))
  } catch {
    return { current: branches[0] }
  }
}

function loadVersion() {
  if (!existsSync(statePath)) {
    const discovered = discoverVersion()
    if (discovered?.current) return discovered
    fail('no version branch registered; run: node scripts/version.mjs init --version v0.1.0')
  }
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  if (!state.current) fail('version state is missing "current"')
  return state
}

function branchExists(name) {
  try {
    git(['rev-parse', '--verify', `refs/heads/${name}`])
    return true
  } catch {
    return false
  }
}

function requireCleanTree() {
  // 只拦已跟踪文件上的改动；未跟踪的临时文件不应阻止合并（git 会在真要覆盖时报错）
  if (git(['status', '--porcelain', '--untracked-files=no'])) fail('working tree has uncommitted changes; commit or stash first')
}

// Git 禁止同一分支在两个工作树同时检出，因此合并前必须先定位版本分支被谁持有。
function checkedOutAt(branch) {
  let path = ''
  for (const line of git(['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
    else if (line === `branch refs/heads/${branch}`) return path
  }
  return ''
}

function samePath(a, b) {
  const norm = (value) => {
    try {
      return realpathSync(value)
    } catch {
      return resolve(value)
    }
  }
  return norm(a) === norm(b)
}

function isMergedInto(feature, target) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', feature, target], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}


try {
  git(['rev-parse', '--git-dir'])
} catch {
  fail('not a git repository (run inside the project, or pass --root)')
}

if (command === 'start') {
  const req = option('--req', '')
  const desc = option('--desc', '')
  if (!/^\d{3}$/.test(req)) fail('--req must be a 3-digit requirement id (e.g. 001)')
  if (!desc) fail('--desc is required (e.g. login)')
  if (!/^[A-Za-z0-9_-]+$/.test(desc)) fail('--desc must be a single token without spaces')
  const version = loadVersion()
  requireCleanTree()
  if (!branchExists(version.current)) fail(`version branch "${version.current}" does not exist`)
  const branch = `feature/REQ-${req}_${desc}`
  if (branchExists(branch)) fail(`branch "${branch}" already exists`)

  git(['checkout', version.current])
  git(['checkout', '-b', branch])
  console.log(`task-flow: created ${branch} from ${version.current}`
    + `（绑定 ${version.version ?? version.current}；要换绑定就切到目标版本分支再 start）`)
  console.log(`task-flow: implement here, then run: node scripts/task-flow.mjs finish`)
  process.exit(0)
}

if (command === 'finish') {
  const version = loadVersion()
  const feature = option('--branch', '') || currentBranch()
  if (PROTECTED.includes(feature) || feature === version.current) {
    fail(`refusing to finish from "${feature}"; run this on the task branch (feature/REQ-XXX)`)
  }
  if (!branchExists(version.current)) fail(`version branch "${version.current}" does not exist`)
  requireCleanTree()

  const testCommand = option('--test', '')
  if (testCommand) {
    try {
      execFileSync('bash', ['-lc', testCommand], { cwd: root, stdio: 'inherit' })
    } catch {
      fail(`verification command failed; not merging (ran: ${testCommand})`, 3)
    }
  }

  const originBranch = currentBranch()
  const versionBranch = version.current
  // 日志必须反映被合并的那条分支，而不是当前 HEAD（--branch X 时二者可能不同）
  if (!branchExists(feature)) fail(`branch "${feature}" does not exist`, 2)
  const featureHead = git(['rev-parse', '--short', feature])
  const owner = checkedOutAt(versionBranch)
  const mergeInOwner = owner !== '' && !samePath(owner, root)

  if (isMergedInto(feature, versionBranch)) {
    console.log(`task-flow: ${feature} (${featureHead}) is already merged into ${versionBranch}`)
    process.exit(0)
  }

  // 在占用者处合并前先确认其工作树干净；此时尚未持锁，失败无需清理
  if (mergeInOwner) {
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: owner, encoding: 'utf8' }).trim()
    if (dirty) fail(`version branch is checked out at ${owner} with uncommitted changes; commit or stash there first`, 5)
  }

  let switched = false
  let mergeError = null
  let checkoutError = null
  try {
    // 版本分支被另一个工作树持有时在其处合并：Git 不允许同分支二次检出
    const mergeCwd = mergeInOwner ? owner : root
    const mergeGit = (args) =>
      execFileSync('git', args, { cwd: mergeCwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    if (!mergeInOwner && originBranch !== versionBranch) {
      try {
        git(['checkout', versionBranch])
        switched = true
      } catch (error) {
        // 不把 git 的原始堆栈抛给用户；退出码遵循脚本约定
        checkoutError = error
      }
    }
    if (!checkoutError) {
      try {
        mergeGit(['merge', '--no-ff', '--no-edit', feature])
      } catch (error) {
        mergeError = error
        try {
          mergeGit(['merge', '--abort'])
        } catch {
          /* nothing to abort */
        }
      }
    }
  } finally {
    // 无论成功、冲突还是异常，都必须恢复原分支，否则会把工作树留在版本分支上
    if (switched) {
      try {
        git(['checkout', originBranch])
      } catch {
        /* 恢复失败不应掩盖原始错误，交由下方提示 */
      }
    }
  }

  if (checkoutError) {
    console.error(`${checkoutError.stdout ?? ''}${checkoutError.stderr ?? ''}`.trim())
    fail(`cannot check out ${versionBranch} to merge (local changes or a branch lock); resolve it and retry`, 5)
  }

  if (mergeError) {
    console.error(`${mergeError.stdout ?? ''}${mergeError.stderr ?? ''}`.trim())
    fail(`merge of ${feature} into ${versionBranch} failed and was aborted; see git output above (a content conflict needs the base synced)`, 2)
  }

  const mergedCommit = execFileSync('git', ['rev-parse', '--short', versionBranch], { cwd: root, encoding: 'utf8' }).trim()
  console.log(`task-flow: auto-merged ${feature} (${featureHead}) into ${versionBranch} as ${mergedCommit}`
    + `（版本未变：合并不会改变版本号）`)
  if (mergeInOwner) console.log(`task-flow: merged in the worktree holding ${versionBranch}: ${owner}`)
  console.log(`task-flow: when ${versionBranch} is verified, run: node scripts/task-flow.mjs request --base master`)
  process.exit(0)
}

if (command === 'request') {
  const version = loadVersion()
  const base = option('--base', version.base || 'master')
  const remote = option('--remote', 'origin')
  const dryRun = flag('--dry-run')
  const branch = option('--branch', '') || currentBranch()

  if (branch !== version.current) {
    fail(`merge request must be raised from the version branch "${version.current}" (currently on "${branch}")`)
  }
  if (!branchExists(base)) fail(`base branch "${base}" not found`)

  const log = git(['log', '--pretty=format:%h %s', `${base}..${version.current}`])
    .split('\n')
    .filter(Boolean)
  // 快照锚点：清单与计数描述的是「生成那一刻」，而承载本文件的申请提交在此之后
  // 才落地——没有锚点时「分支顶端比清单多 1」会被人工复核误读成漏列（v0.1.0 写 75 实为 76、
  // v0.1.1 写 77 实为 78，两轮交付都踩过）。锚点让这份文件自洽且可判定。
  const snapshot = git(['rev-parse', '--short', version.current])
  const title = `release: ${version.version ?? version.current} → ${base}`
  const body = [
    `# ${title}`,
    '',
    `- version branch: \`${version.current}\``,
    `- target: \`${base}\`（受保护分支，需人工合并）`,
    `- snapshot: \`${snapshot}\`（本清单与计数对应的版本分支顶端）`,
    `- commits: ${log.length}（\`${base}..${version.current}\` 在 snapshot 处的计数）`,
    '',
    '## 变更',
    ...(log.length > 0 ? log.map((line) => `- ${line}`) : ['- （无新增提交）']),
    '',
    `> 承载本文件的申请提交在 snapshot \`${snapshot}\` 之后落地，因此**不在清单与计数内**——分支顶端可能比 snapshot 多 1 个提交。这是自指，不是漏列。`,
    '',
    '## 验收前请确认',
    '- [ ] 版本分支上的测试/门禁全绿（`docs/testing/TEST_PLAN.md`）',
    '- [ ] 发布预检与回滚预案已就绪（`docs/release/RELEASE_CHECKLIST.md`）',
    '- [ ] 人工闸门已留痕（`docs/approvals/APPROVALS.md`）',
    '',
  ].join('\n')

  const requestPath = join(root, 'docs', 'release', 'MERGE_REQUEST.md')
  if (!dryRun) {
    mkdirSync(dirname(requestPath), { recursive: true })
    writeFileSync(requestPath, `${body}\n`)
  }

  let compareUrl = ''
  try {
    const url = git(['remote', 'get-url', remote])
    const web = url.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '')
    compareUrl = `${web}/compare/${base}...${version.current}?expand=1`
  } catch {
    compareUrl = ''
  }

  // `gh` 必须**尽力而为**：把"工具存在"当成"工具可用"会让 request 在 gh 未登录时抛栈崩溃，
  // 而此时正文与 compare URL 都已就绪（实测缺陷见台账 ISSUE-013）。可用 = 装了 + 已登录 + 远端是 GitHub。
  const ghState = (() => {
    const run = (args) => {
      try {
        execFileSync('gh', args, { cwd: root, stdio: 'ignore' })
        return true
      } catch {
        return false
      }
    }
    if (!run(['--version'])) return { usable: false, reason: '未安装 gh CLI' }
    if (!run(['auth', 'status'])) return { usable: false, reason: 'gh 已安装但未登录（gh auth login）' }
    if (!/github\.com/.test(compareUrl)) return { usable: false, reason: '远端不是 GitHub（无可创建 PR 的地址）' }
    return { usable: true, reason: '' }
  })()

  if (dryRun) {
    console.log(`task-flow: [dry-run] would open a merge request ${version.current} → ${base} (${log.length} commits)`)
    if (compareUrl) console.log(`task-flow: ${compareUrl}`)
    process.exit(0)
  }

  console.log('task-flow: wrote merge request body to docs/release/MERGE_REQUEST.md')
  const manual = (why) => {
    console.log(`task-flow: ${why}；用手动路径创建合并申请（正文已写好）：`)
    if (compareUrl) console.log(`  ${compareUrl}`)
    else console.log('  (add a remote with `git remote add origin <url>` to get a compare link)')
    console.log(`  正文：${relative(root, requestPath) || requestPath}`)
  }
  if (ghState.usable) {
    try {
      execFileSync('gh', [
        'pr', 'create', '--base', base, '--head', version.current,
        '--title', title, '--body-file', requestPath,
      ], { cwd: root, stdio: 'inherit' })
      console.log('task-flow: merge request created — a human merges it on the protected branch')
    } catch (error) {
      // gh 可用但创建失败（无权限/网络/分支未推送）——不能让已经写好的申请白写
      const detail = `${error.stderr ?? ''}${error.stdout ?? ''}`.trim().split('\n').slice(0, 3).join(' / ')
      manual(`gh pr create 失败${detail ? `：${detail}` : ''}`)
    }
  } else {
    manual(ghState.reason)
  }
  console.log('task-flow: after the human merges, record it: node scripts/record-approval.mjs --gate delivery --decision approved --actor <you>')
  process.exit(0)
}

fail(`unknown command "${command}" (expected start | finish | request)`)
