// DSH 移植版 req-parallel 工作流。
// 原版：.ai/workflows/req-parallel.js（Claude Code SDK 格式）。
// DSH 版差异：
//   1) 无 export const meta —— meta 作为 workflow 工具的 meta 参数传入（见下）；
//   2) 不用 agentType —— DSH workflow 会拒绝该选项，角色契约内嵌为提示词。
// 调用方式（workflow 工具）：
//   meta: { name: 'req-parallel', description: '需求驱动并行开发：拆分（split）与并行开发 + 串行合并（run）',
//           phases: [
//             { title: 'Split', detail: '把需求拆成可独立验证的任务 DAG' },
//             { title: 'Fanout', detail: '就绪任务在各自 worktree 并行开发（不合并）' },
//             { title: 'Merge', detail: '按依赖序逐个串行合并（严禁并发）' },
//             { title: 'Cleanup', detail: '回收 worktree，保留任务分支' },
//           ] }
//   args: { req: 'REQ-001', mode: 'split' | 'run', concurrency?: 2 }
//
// 硬性不变量：**合并阶段严禁并发派发**（不使用 parallel/pipeline）。并发合并会竞争版本分支 ref。
// 该结构由 dsh/workflows/verify.mjs 断言。
// 角色契约与 .ai/agents/{planner,developer}.md 保持一致；修改角色定义时须同步本文件。

const plannerRole = `planner 角色（需求分析与任务拆解）：
- 职责：需求澄清与范围界定、把需求拆成可独立验证的任务、标注依赖与文件范围、定义每个任务的验证方式。
- 任务必须满足：一次会话内可完成、可独立验证、有明确文件范围。
- 不做代码实现。`

const developerRole = `developer 角色（编码实现），遵循效率编码风格：
1. 先理解，再动手 — 读全需要改动的文件，trace 完整调用链
2. 找最短路径 — 优先复用现有 util / helper / 模式；不引入新依赖
3. 根因修复 — 在共享函数里修一次，不在每个调用点打补丁
4. 每个非平凡逻辑留一个验证入口
5. 不做无请求的抽象
只在自己被分配的工作树内改动；不越出任务声明的文件范围。代码只使用英文。`

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
  return a.files.some((left) =>
    b.files.some((right) => left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)),
  )
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
    `你是${plannerRole}\n` +
      `把以下需求拆成可独立验证的任务，并写入 docs/requirements/TASKS.md ` +
      `（只追加或更新该需求相关条目，不覆盖无关内容）。\n` +
      `每个任务条目必须包含：关联需求 / 依赖 / 做什么 / 产出 / 文件范围 / 验证方式。\n` +
      `另需写出「并行批次」小节：文件范围重叠的任务必须落在不同批次。\n` +
      `需求：\n${request}\n\n${TASK_CONTRACT}`,
    { label: 'planner', phase: 'Split' },
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
  `你是${plannerRole}\n` +
    `读取【已人工确认】的 docs/requirements/TASKS.md，把 ${request} 的任务清单原样作为 JSON 返回。` +
    `不要增删、拆分、合并或重排任务。\n${TASK_CONTRACT}`,
  { label: 'planner', phase: 'Fanout' },
)
const tasks = parseTasks(raw)
const byId = new Map(tasks.map((task) => [task.id, task]))
for (const task of tasks) {
  for (const dep of task.deps) {
    if (!byId.has(dep)) throw new Error(`req-parallel: ${task.id} depends on unknown ${dep}`)
  }
}

// 依赖环必须显式报错：环上的任务永远不会就绪。若不报错，工作流会静默空跑，
// 调用方只会看到「被上游失败阻塞」——而这里根本没有失败。Kahn 拓扑排序，
// 未能出队的任务即处在环上（或位于环的下游）。
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
  throw new Error(`req-parallel: 依赖图存在环，这些任务无法就绪：${cyclic.join(', ')}`)
}

const devPrompt = (task) =>
  `你是${developerRole}\n` +
  `在【自己的】git worktree 内开发一个任务，完成后停下，不要合并。\n` +
  `任务 ${task.id}：${task.title}\n文件范围：${task.files.join(', ') || '(未声明)'}\n` +
  `步骤：\n` +
  `1. 从当前版本分支创建工作树：git worktree add -b feature/${task.id} .worktrees/${task.id} <版本分支>` +
  `（若已存在则复用或安全清理，不要因此失败）\n` +
  `2. 只在该工作树内实现 ${task.id}，不要触碰声明范围之外的路径。\n` +
  `3. 在其中运行验证并报告确切命令与结果：${task.verify}\n` +
  `4. 在工作树内提交。不要合并、不要运行 task-flow finish、不要清理。\n` +
  `报告：分支名、工作树路径、改动文件、验证命令、验证结果。`

const mergePrompt = (task) =>
  `你是${developerRole}\n` +
  `把【一个】任务分支合并回版本分支，一次只做一个任务。\n` +
  `任务 ${task.id}，工作树 .worktrees/${task.id}，分支 feature/${task.id}。\n` +
  `在该工作树内运行 node scripts/task-flow.mjs finish。\n` +
  `若因内容冲突失败：在该工作树内自行把版本分支合并进任务分支（git merge <版本分支>），` +
  `解决冲突并提交，然后重试 finish 一次。注意 sync-base 遇冲突会主动中止，不能用来解决冲突。` +
  `仍失败则停止并报告 needs_human，不要强行合并。\n` +
  `绝不合并到 master。报告退出码与合并后的版本分支提交。`

const cleanupPrompt = (task, merged) =>
  `你是${developerRole}\n` +
  `用 git worktree remove 回收工作树 .worktrees/${task.id}，保留分支 feature/${task.id}。\n` +
  (merged
    ? `该任务【已合并】：工作树干净就直接回收；脏时才加 --force。`
    : `该任务【未合并】（开发失败）：工作树不存在就报告「不存在」；干净才可回收；` +
      `若脏（有未提交改动）必须保留现场并报告「需人工处理」，禁止强制删除。`) +
  `\n无论如何都要返回一段结论（命令与结果）；此处失败不得阻断其它任务。`

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
  if (ready.length === 0) break // 依赖环已在上游报错，此处只剩被失败阻塞的任务
  waveIndex += 1

  const batch = takeBatch(ready, concurrency)
  log(`第 ${waveIndex} 波：${batch.map((task) => task.id).join(', ')}（文件范围不重叠）`)

  // 仅【开发】阶段并行
  const wave = await parallel(batch.map((task) => () => agent(devPrompt(task), { label: 'developer', phase: 'Fanout' })))
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
      await agent(mergePrompt(task), { label: 'developer', phase: 'Merge' })
      mergeOrder.push(task.id)
    }
  }
}

// 只列【因上游失败而未启动】的任务；失败任务本身归入 failed，两者不重叠
const blockedByFailure = tasks
  .filter((task) => !done.has(task.id) && !failed.has(task.id))
  .map((task) => task.id)

// 回收覆盖【所有建过工作树的任务】：成功合并的，以及开发失败但可能已建树的。
// 失败任务未合并，因此绝不对脏现场加 --force —— 保留现场并记录「需人工处理」。
// 回收失败（agent 无返回或抛异常）不阻断其它任务，但必须被记录进返回值。
phase('Cleanup')
const cleanup = []
for (const id of [...new Set([...developed.map((item) => item.id), ...failed])]) {
  const merged = done.has(id)
  let report = null
  let ok = false
  try {
    report = await agent(cleanupPrompt({ id }, merged), { label: 'developer', phase: 'Cleanup' })
    ok = report != null
  } catch (error) {
    report = `回收 agent 异常：${error.message}`
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
