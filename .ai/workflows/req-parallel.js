// 需求驱动并行开发（Claude Code SDK 格式）
//
//   mode: 'split'（默认）→ 把需求拆成可独立验证的任务 DAG，写入 docs/requirements/TASKS.md，停下等人工确认
//   mode: 'run'          → 消费【已人工确认】的 TASKS.md：就绪任务并行开发 → 按依赖序【串行】合并 → 回收
//
// 硬性不变量：**合并阶段严禁并发派发**（不使用 parallel/pipeline）。并发合并会竞争版本分支 ref。
// 并行只发生在开发阶段：各任务在自己的 worktree 内开发，互不合并。
//
// 用法：workflow 工具，args = { req: 'REQ-001', mode: 'split' | 'run', concurrency?: 2 }
export const meta = {
  name: 'req-parallel',
  description: '需求驱动并行开发：拆分（split）与并行开发 + 串行合并（run）',
  phases: [
    { title: 'Split', detail: '把需求拆成可独立验证的任务 DAG' },
    { title: 'Fanout', detail: '就绪任务在各自 worktree 并行开发（不合并）' },
    { title: 'Merge', detail: '按依赖序逐个串行合并（严禁并发）' },
    { title: 'Cleanup', detail: '回收 worktree，保留任务分支' },
  ],
}

const input = typeof args === 'string' ? { request: args } : (args ?? {})
const request = String(input.request ?? input.req ?? '').trim()
const mode = String(input.mode ?? 'split').trim()
const concurrency = Math.max(1, Number(input.concurrency ?? 2))

if (!request) throw new Error('req-parallel requires a requirement (REQ id or description)')
if (mode !== 'split' && mode !== 'run') throw new Error(`req-parallel mode must be split or run (got "${mode}")`)

// agent 回传的任务条目契约（split 与 run 共用，避免两处漂移）
const TASK_CONTRACT = `Return ONLY a JSON array. Each item:
{"id":"TASK-001","title":"...","req":["REQ-001"],"deps":["TASK-000"],"files":["path/a","path/b"],"verify":"<executable command or decidable check>"}
Rules: deps must reference ids in this array; files lists the paths the task will touch; verify must be executable or decidable (never "works fine").`

function parseTasks(raw) {
  const text = String(raw ?? '')
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('req-parallel: agent did not return a JSON task array')
  let tasks
  try {
    tasks = JSON.parse(text.slice(start, end + 1))
  } catch (error) {
    throw new Error(`req-parallel: task list is not valid JSON (${error.message})`)
  }
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('req-parallel: task list is empty')
  for (const task of tasks) {
    if (!task?.id) throw new Error('req-parallel: a task is missing "id"')
    task.deps = Array.isArray(task.deps) ? task.deps : []
    task.files = Array.isArray(task.files) ? task.files : []
  }
  return tasks
}

// 文件范围重叠 → 不得同批并行（冲突在规划期避免，而不是事后修复）
function overlaps(a, b) {
  return a.files.some((left) => b.files.some((right) => left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)))
}

function takeBatch(ready, limit) {
  const batch = []
  for (const task of ready) {
    if (batch.length >= limit) break
    if (batch.every((picked) => !overlaps(task, picked))) batch.push(task)
  }
  return batch
}

// ---------------------------------------------------------------- split
if (mode === 'split') {
  phase('Split')
  const raw = await agent(
    `Break this requirement into independently verifiable tasks and record them in docs/requirements/TASKS.md ` +
      `(append or update only this requirement's entries; never overwrite unrelated content).\n` +
      `Each task entry must carry: 关联需求 / 依赖 / 做什么 / 产出 / 文件范围 / 验证方式.\n` +
      `Also write a 并行批次 section: tasks with overlapping 文件范围 must land in different batches.\n` +
      `Requirement:\n${request}\n\n${TASK_CONTRACT}`,
    { agentType: 'planner', phase: 'Split' },
  )
  const tasks = parseTasks(raw)
  const blocked = tasks.filter((task) => !task.verify)
  if (blocked.length > 0) log(`不可开工（缺可判定验证方式）：${blocked.map((task) => task.id).join(', ')}`)
  log('拆分完成：请人工确认 docs/requirements/TASKS.md 后，再以 mode="run" 运行')
  return { mode, tasks, blocked: blocked.map((task) => task.id) }
}

// ------------------------------------------------------------------ run
phase('Fanout')
const raw = await agent(
  `Read the CONFIRMED docs/requirements/TASKS.md and return the task list for ${request} verbatim as JSON. ` +
    `Do not invent, split, merge or reorder tasks. ${TASK_CONTRACT}`,
  { agentType: 'planner', phase: 'Fanout' },
)
const tasks = parseTasks(raw)
const byId = new Map(tasks.map((task) => [task.id, task]))
for (const task of tasks) {
  for (const dep of task.deps) {
    if (!byId.has(dep)) throw new Error(`req-parallel: ${task.id} depends on unknown ${dep}`)
  }
}

// A dependency cycle must fail loudly: tasks on the cycle never become ready, so without
// this check the workflow silently no-ops and the caller reads the leftovers as "blocked by
// an upstream failure" — while nothing failed. Kahn's algorithm: whatever cannot be dequeued
// is on a cycle, or downstream of one.
const dependents = new Map(tasks.map((task) => [task.id, []]))
for (const task of tasks) for (const dep of task.deps) dependents.get(dep).push(task.id)
const unmetDeps = new Map(tasks.map((task) => [task.id, task.deps.length]))
const queue = tasks.filter((task) => task.deps.length === 0).map((task) => task.id)
let ordered = 0
while (queue.length > 0) {
  const id = queue.shift()
  ordered += 1
  for (const next of dependents.get(id)) {
    unmetDeps.set(next, unmetDeps.get(next) - 1)
    if (unmetDeps.get(next) === 0) queue.push(next)
  }
}
if (ordered < tasks.length) {
  const cyclic = tasks.filter((task) => unmetDeps.get(task.id) > 0).map((task) => task.id)
  throw new Error(`req-parallel: dependency cycle, these tasks can never become ready: ${cyclic.join(', ')}`)
}

const devPrompt = (task) =>
  `Develop one task in its OWN git worktree, and STOP BEFORE MERGING.\n` +
  `Task ${task.id}: ${task.title}\nFiles in scope: ${task.files.join(', ') || '(unspecified)'}\n` +
  `Steps:\n` +
  `1. Create the worktree from the current version branch: ` +
  `git worktree add -b feature/${task.id} .worktrees/${task.id} <version-branch> ` +
  `(if it already exists, reuse or clean it instead of failing)\n` +
  `2. Implement ${task.id} inside that worktree only. Touch no path outside the stated scope.\n` +
  `3. Run this verification there and report its exact command and result: ${task.verify}\n` +
  `4. Commit in the worktree. Do NOT merge, do NOT run task-flow finish, do NOT clean up.\n` +
  `Report: branch name, worktree path, files changed, verification command, verification result.`

const mergePrompt = (task) =>
  `Merge one task branch into the version branch, one at a time.\n` +
  `Task ${task.id}, worktree .worktrees/${task.id}, branch feature/${task.id}.\n` +
  `Run "node scripts/task-flow.mjs finish" inside that worktree.\n` +
  `If it fails with a content conflict: merge the version branch into the task branch yourself ` +
  `("git merge <version-branch>" inside the worktree), resolve the conflict, commit, then retry finish once. ` +
  `Note: sync-base aborts on conflict by design, so it cannot be used to resolve one. ` +
  `If it still fails, stop and report needs_human — do not force the merge.\n` +
  `Never merge into master. Report exit codes and the resulting version-branch commit.`

const cleanupPrompt = (task, merged) =>
  `Remove the worktree .worktrees/${task.id} with "git worktree remove"; keep the branch feature/${task.id}.\n` +
  (merged
    ? `This task IS merged: remove it directly when the worktree is clean, and use --force only when it is dirty.`
    : `This task is NOT merged (its development failed): report "absent" if the worktree does not exist; ` +
      `remove it only when clean; if it is dirty (uncommitted changes), keep the scene and report ` +
      `"needs human" — force-deletion is forbidden here.`) +
  `\nAlways return a conclusion either way (command and its result); a failure here must not stop the others.`

const done = new Set()
const failed = new Set()
const developed = []
const mergeOrder = []
let waveIndex = 0
let mergePhaseStarted = false

while (done.size + failed.size < tasks.length) {
  // 失败的任务既不重试、也不算完成 —— 其下游因依赖未满足而永不启动
  const ready = tasks.filter(
    (task) => !done.has(task.id) && !failed.has(task.id) && task.deps.every((dep) => done.has(dep)),
  )
  if (ready.length === 0) break // 只剩被失败阻塞的任务（或依赖环）
  waveIndex += 1

  const batch = takeBatch(ready, concurrency)
  log(`第 ${waveIndex} 波：${batch.map((task) => task.id).join(', ')}（文件范围不重叠）`)

  // 仅【开发】阶段并行
  const wave = await parallel(batch.map((task) => () => agent(devPrompt(task), { agentType: 'developer', phase: 'Fanout' })))
  const settled = []
  batch.forEach((task, index) => {
    const outcome = wave[index]
    if (outcome) {
      developed.push({ id: task.id, branch: `feature/${task.id}`, report: outcome })
      done.add(task.id)
      settled.push(task)
    } else {
      log(`${task.id} 开发失败：其下游任务不会启动`)
      failed.add(task.id)
    }
  })

  // 本波完成后【立即串行合并】：下游任务才能从【包含其依赖】的基线开工。
  // 一次一个，绝不并发 —— 并发合并会竞争版本分支 ref。
  if (settled.length > 0) {
    if (!mergePhaseStarted) {
      phase('Merge')
      mergePhaseStarted = true
    }
    for (const task of settled) {
      log(`合并 ${task.id}`)
      await agent(mergePrompt(task), { agentType: 'developer', phase: 'Merge' })
      mergeOrder.push(task.id)
    }
  }
}

// 只列【因上游失败而未启动】的任务；失败任务本身归入 failed，两者不重叠
const blockedByFailure = tasks
  .filter((task) => !done.has(task.id) && !failed.has(task.id))
  .map((task) => task.id)

// Reclaim EVERY task that may have built a worktree: the merged ones, and the failed ones
// (whose development agent creates the worktree in step 1, so a later failure leaves it behind).
// A failed task is unmerged, so its dirty scene is never force-deleted — it is kept and recorded
// as "needs human". A cleanup failure (agent returned nothing or threw) must not stop the others,
// but it must be recorded in the return value.
phase('Cleanup')
const cleanup = []
for (const id of [...new Set([...developed.map((item) => item.id), ...failed])]) {
  const merged = done.has(id)
  let report = null
  let ok = false
  try {
    report = await agent(cleanupPrompt({ id }, merged), { agentType: 'developer', phase: 'Cleanup' })
    ok = report != null
  } catch (error) {
    report = `cleanup agent threw: ${error.message}`
  }
  if (!ok) log(`${id} 的工作树回收未取得结论：${report}——已记录，不阻断其它任务`)
  cleanup.push({
    id,
    worktree: `.worktrees/${id}`,
    merged,
    ok,
    report: typeof report === 'string' ? report.slice(0, 500) : null,
  })
}

return {
  mode,
  waves: waveIndex,
  developed: developed.map((item) => ({ id: item.id, branch: item.branch })),
  mergeOrder,
  failed: [...failed],
  blockedByFailure,
  cleanup,
  cleanupFailed: cleanup.filter((item) => !item.ok).map((item) => item.id),
  note: '开发按波次并行；合并按依赖序串行执行，一次一个，合并不并发；回收覆盖失败任务，但不对未合并现场使用 --force',
}
