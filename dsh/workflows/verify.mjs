// DSH workflow 结构回归验证：以 stub 驱动脚本正文，校验阶段顺序、角色派发、返回值契约与空参报错。
// 运行：node dsh/workflows/verify.mjs
// 说明：脚本正文依赖 DSH 注入的 phase/agent/log/args 全局，无法被 node --check 以 CJS 方式检查（顶层 await），
//       本脚本在异步函数上下文求值正文，等价于 DSH 的模块求值语义。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const CASES = [
  {
    file: 'feature-dev.js',
    args: '实现一个示例功能',
    phases: ['Plan', 'Implement', 'Review', 'Verify'],
    labels: ['planner', 'developer', 'reviewer', 'verifier'],
    keys: ['plan', 'implementation', 'review', 'verification'],
    emptyArgsError: /requires a task description/,
  },
  {
    file: 'bug-fix.js',
    args: '示例 bug 报告',
    phases: ['Debug', 'Fix', 'Review', 'Verify'],
    labels: ['developer', 'developer', 'reviewer', 'verifier'],
    keys: ['diagnosis', 'fix', 'review', 'verification'],
    emptyArgsError: /requires a bug report/,
  },
  {
    file: 'doc-update.js',
    args: '示例文档请求',
    phases: ['Analyze', 'Write', 'Review'],
    labels: ['tech-writer', 'tech-writer', 'tech-writer'],
    keys: ['analysis', 'update', 'review'],
    emptyArgsError: /requires a documentation request/,
  },
  {
    file: 'brain-ingest.js',
    args: '示例待沉淀内容',
    phases: ['BreakDown', 'Place', 'Write', 'Verify'],
    labels: ['ingest-analyst', 'ingest-planner', 'ingest-writer', 'ingest-verifier'],
    keys: ['breakdown', 'placement', 'written', 'check'],
    emptyArgsError: /requires input to ingest/,
  },
  {
    file: 'deploy.js',
    args: '示例发布目标',
    phases: ['Preflight', 'Release', 'Smoke', 'Rollback'],
    labels: ['verifier', 'developer', 'verifier', 'tech-writer'],
    keys: ['preflight', 'release', 'smoke', 'rollback'],
    emptyArgsError: /requires a release target/,
  },
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function runCase(testCase) {
  const body = readFileSync(join(here, testCase.file), 'utf8')

  assert(!/^export\s+const\s+meta\b/m.test(body), `${testCase.file}: 含禁用的 export const meta`)
  assert(!/agentType\s*:/.test(body), `${testCase.file}: 含禁用的 agentType 选项`)

  const seenPhases = []
  const seenLabels = []
  const seenPhaseOpts = []
  const phase = (title) => seenPhases.push(title)
  const agent = async (prompt, opts = {}) => {
    seenLabels.push(opts.label)
    seenPhaseOpts.push(opts.phase)
    assert(typeof prompt === 'string' && prompt.length > 0, `${testCase.file}: agent prompt 为空`)
    return `[stub:${opts.label}]`
  }
  const log = () => {}
  const factory = new Function('phase', 'agent', 'log', 'args', 'return (async () => {\n' + body + '\n})()')

  const result = await factory(phase, agent, log, testCase.args)

  assert(
    JSON.stringify(seenPhases) === JSON.stringify(testCase.phases),
    `${testCase.file}: 阶段顺序不符，实际 ${seenPhases.join(' → ')}`,
  )
  assert(
    JSON.stringify(seenLabels) === JSON.stringify(testCase.labels),
    `${testCase.file}: 角色派发不符，实际 ${seenLabels.join(', ')}`,
  )
  assert(
    JSON.stringify(seenPhaseOpts) === JSON.stringify(testCase.phases),
    `${testCase.file}: agent phase 绑定不符`,
  )
  for (const key of testCase.keys) {
    assert(typeof result[key] === 'string' && result[key].length > 0, `${testCase.file}: 返回值 ${key} 非空字符串`)
  }

  let threw = null
  try {
    await factory(phase, agent, log, '')
  } catch (error) {
    threw = error
  }
  assert(
    threw instanceof Error && testCase.emptyArgsError.test(threw.message),
    `${testCase.file}: 空 args 未按约定报错：${threw && threw.message}`,
  )
}

// 消费项目只会拿到本项目类型对应的工作流（见 scripts/platform-managed.mjs 的 dshWorkflowFiles）。
// 因此未下发的用例是**跳过**而非失败——否则任一按类型过滤后的项目跑本脚本都会报错。
let skipped = 0
const present = (file) => existsSync(join(here, file))

for (const testCase of CASES) {
  if (!present(testCase.file)) {
    skipped += 1
    console.log(`skip: ${testCase.file}（本类型未下发）`)
    continue
  }
  await runCase(testCase)
  console.log(`ok: ${testCase.file}`)
}

// ---- req-parallel：拆分/运行两种模式，且【合并阶段严禁并发】 ----
// 这是用户明确强调的第一约束：合并严格一次一个。此处以结构断言守住它，
// 一旦有人把合并改成并发派发，门禁立即失败。
const TASK_FIXTURE = JSON.stringify([
  { id: 'TASK-001', title: 'a', req: ['REQ-001'], deps: [], files: ['src/a'], verify: 'node --test tests/a.test.mjs' },
  { id: 'TASK-002', title: 'b', req: ['REQ-001'], deps: [], files: ['src/b'], verify: 'node --test tests/b.test.mjs' },
  { id: 'TASK-003', title: 'c', req: ['REQ-001'], deps: ['TASK-001'], files: ['src/c'], verify: 'node --test tests/c.test.mjs' },
])

async function runReqParallelCase() {
  const file = 'req-parallel.js'
  const body = readFileSync(join(here, file), 'utf8')

  assert(!/^export\s+const\s+meta\b/m.test(body), `${file}: 含禁用的 export const meta`)
  assert(!/agentType\s*:/.test(body), `${file}: 含禁用的 agentType 选项`)

  // 结构性不变量：Merge 阶段绝不并发
  const mergeStart = body.indexOf("phase('Merge')")
  const cleanupStart = body.indexOf("phase('Cleanup')")
  assert(mergeStart >= 0 && cleanupStart > mergeStart, `${file}: 未找到 Merge/Cleanup 阶段`)
  const mergeSection = body.slice(mergeStart, cleanupStart)
  assert(!/\bparallel\s*\(/.test(mergeSection), `${file}: Merge 阶段不得使用 parallel —— 合并必须严格串行`)
  assert(!/\bpipeline\s*\(/.test(mergeSection), `${file}: Merge 阶段不得使用 pipeline —— 合并必须严格串行`)

  // 反过来，开发阶段必须并行，否则 worktree 并行失去意义
  const fanoutSection = body.slice(body.indexOf("phase('Fanout')"), mergeStart)
  assert(/\bparallel\s*\(/.test(fanoutSection), `${file}: Fanout 阶段应使用 parallel 并行开发`)

  const makeGlobals = ({ failing = [], fixture = TASK_FIXTURE, cleanupFails = [], cleanupThrows = [] } = {}) => {
    const seen = { phases: [], labels: [], opts: [], prompts: [], cleanup: [] }
    return {
      seen,
      phase: (title) => seen.phases.push(title),
      agent: async (prompt, opts = {}) => {
        seen.labels.push(opts.label)
        seen.opts.push(opts.phase)
        seen.prompts.push(prompt)
        assert(typeof prompt === 'string' && prompt.length > 0, `${file}: agent prompt 为空`)
        if (/Return ONLY a JSON array/.test(prompt)) return fixture
        // 开发 agent：被指定失败的任务回传 null（等价于 DSH 中子 agent 失败）
        if (prompt.includes('在【自己的】git worktree 内开发')) {
          const hit = failing.find((id) => prompt.includes(`任务 ${id}：`))
          if (hit) return null
        }
        // 回收 agent：记录每个任务是否被回收、是否用了 --force；可注入失败与异常
        if (opts.phase === 'Cleanup') {
          const id = prompt.match(/\.worktrees\/(TASK-\d+)/)?.[1]
          seen.cleanup.push({ id, force: /--force/.test(prompt) })
          if (cleanupThrows.includes(id)) throw new Error(`cleanup stub threw for ${id}`)
          if (cleanupFails.includes(id)) return null
        }
        return `[stub:${opts.label}]`
      },
      log: () => {},
      parallel: async (thunks) => Promise.all(thunks.map((thunk) => thunk())),
    }
  }
  const factory = (g, value) =>
    new Function('phase', 'agent', 'log', 'args', 'parallel', 'return (async () => {\n' + body + '\n})()')(
      g.phase,
      g.agent,
      g.log,
      value,
      g.parallel,
    )

  // split：只拆分，不得启动任何开发
  const splitGlobals = makeGlobals()
  const splitResult = await factory(splitGlobals, { req: 'REQ-001', mode: 'split' })
  assert(
    JSON.stringify(splitGlobals.seen.phases) === JSON.stringify(['Split']),
    `${file}: split 阶段顺序不符，实际 ${splitGlobals.seen.phases.join(' → ')}`,
  )
  assert(splitResult.mode === 'split' && splitResult.tasks.length === 3, `${file}: split 应回传任务数组`)
  assert(
    splitGlobals.seen.opts.every((p) => p === 'Split'),
    `${file}: split 不得派发 Split 之外的 agent`,
  )

  // run：并行开发 + 串行合并
  const runGlobals = makeGlobals()
  const runResult = await factory(runGlobals, { req: 'REQ-001', mode: 'run', concurrency: 2 })
  assert(
    JSON.stringify(runGlobals.seen.phases) === JSON.stringify(['Fanout', 'Merge', 'Cleanup']),
    `${file}: run 阶段顺序不符，实际 ${runGlobals.seen.phases.join(' → ')}`,
  )
  assert(
    runResult.waves === 2,
    `${file}: 应为 2 波（TASK-001/002 同批，TASK-003 次批），实际 ${runResult.waves}`,
  )
  assert(
    JSON.stringify(runResult.mergeOrder) === JSON.stringify(['TASK-001', 'TASK-002', 'TASK-003']),
    `${file}: 合并顺序应为依赖拓扑序，实际 ${JSON.stringify(runResult.mergeOrder)}`,
  )
  assert(
    runGlobals.seen.opts.filter((p) => p === 'Merge').length === 3,
    `${file}: 应有 3 次合并`,
  )
  assert(
    runResult.failed.length === 0 && runResult.blockedByFailure.length === 0,
    `${file}: stub 全成功时不应有失败或被阻塞任务`,
  )

  // 空 args 与非法的 mode 都要按约定报错
  const expectThrow = async (value, pattern, label) => {
    let threw = null
    try {
      await factory(makeGlobals(), value)
    } catch (error) {
      threw = error
    }
    assert(threw instanceof Error && pattern.test(threw.message), `${file}: ${label} 未按约定报错：${threw && threw.message}`)
  }
  await expectThrow('', /requires a requirement/, '空 args')
  await expectThrow({ req: 'REQ-001', mode: 'nope' }, /mode must be split or run/, '非法 mode')

  // 失败传播：TASK-001 开发失败时，依赖它的 TASK-003 必须【不启动】，且两者都不合并
  const failGlobals = makeGlobals({ failing: ['TASK-001'] })
  const failResult = await factory(failGlobals, { req: 'REQ-001', mode: 'run', concurrency: 2 })
  assert(
    JSON.stringify(failResult.failed) === JSON.stringify(['TASK-001']),
    `${file}: TASK-001 应标记为失败，实际 ${JSON.stringify(failResult.failed)}`,
  )
  assert(
    JSON.stringify(failResult.blockedByFailure) === JSON.stringify(['TASK-003']),
    `${file}: 下游 TASK-003 应被阻塞，实际 ${JSON.stringify(failResult.blockedByFailure)}`,
  )
  assert(
    !failGlobals.seen.prompts.some((prompt) => prompt.includes('任务 TASK-003：')),
    `${file}: 依赖未满足时不得派发 TASK-003 的开发 agent`,
  )
  assert(
    JSON.stringify(failResult.mergeOrder) === JSON.stringify(['TASK-002']),
    `${file}: 只有成功的 TASK-002 可合并，实际 ${JSON.stringify(failResult.mergeOrder)}`,
  )
  assert(
    !failGlobals.seen.opts.includes('Merge') || failGlobals.seen.opts.filter((p) => p === 'Merge').length === 1,
    `${file}: 失败任务不得进入合并阶段`,
  )

  // 回收覆盖：失败任务在 dev 第 1 步就已建树，失败后不能留下无人认领的工作树
  const reclaimed = failGlobals.seen.cleanup.map((item) => item.id)
  assert(reclaimed.includes('TASK-001'), `${file}: 开发失败的任务也必须回收其工作树，实际回收 ${reclaimed.join(', ') || '无'}`)
  assert(reclaimed.includes('TASK-002'), `${file}: 已合并的任务必须回收，实际回收 ${reclaimed.join(', ') || '无'}`)
  assert(
    !reclaimed.includes('TASK-003'),
    `${file}: 从未开工的任务不应进入回收（它没有工作树），实际回收 ${reclaimed.join(', ')}`,
  )
  // 失败任务未合并 → 其回收提示词绝不允许 --force 删除现场
  const failedCleanup = failGlobals.seen.cleanup.find((item) => item.id === 'TASK-001')
  assert(failedCleanup && !failedCleanup.force, `${file}: 未合并任务的回收不得使用 --force（会毁掉现场）`)
  const failedRecord = failResult.cleanup.find((item) => item.id === 'TASK-001')
  assert(failedRecord?.merged === false, `${file}: 未合并任务的回收记录应标记 merged=false`)
  const mergedRecord = failResult.cleanup.find((item) => item.id === 'TASK-002')
  assert(
    mergedRecord?.merged === true && mergedRecord?.ok === true && mergedRecord?.worktree === '.worktrees/TASK-002',
    `${file}: 已合并任务的回收记录应为 merged=true/ok=true 且带工作树路径，实际 ${JSON.stringify(mergedRecord)}`,
  )

  // 回收结果必须被记录：全部成功时逐条 ok，且无 cleanupFailed
  assert(
    failResult.cleanup.length === reclaimed.length && failResult.cleanup.every((item) => item.ok),
    `${file}: 回收结果应逐条记录，实际 ${JSON.stringify(failResult.cleanup)}`,
  )
  assert(failResult.cleanupFailed.length === 0, `${file}: 无回收失败时 cleanupFailed 应为空`)

  // 回收失败（agent 无返回）必须被记录，且不阻断其它任务的回收
  const cleanFailGlobals = makeGlobals({ cleanupFails: ['TASK-002'] })
  const cleanFailResult = await factory(cleanFailGlobals, { req: 'REQ-001', mode: 'run', concurrency: 2 })
  assert(
    JSON.stringify(cleanFailResult.cleanupFailed) === JSON.stringify(['TASK-002']),
    `${file}: 回收失败必须被记录，实际 ${JSON.stringify(cleanFailResult.cleanupFailed)}`,
  )
  assert(
    cleanFailResult.cleanup.find((item) => item.id === 'TASK-002')?.ok === false &&
      cleanFailResult.cleanup.find((item) => item.id === 'TASK-001')?.ok === true,
    `${file}: 回收记录应逐条区分成功与失败，实际 ${JSON.stringify(cleanFailResult.cleanup)}`,
  )
  assert(
    cleanFailGlobals.seen.cleanup.length === 3,
    `${file}: 一个任务回收失败不得阻断其它任务的回收，实际只回收了 ${cleanFailGlobals.seen.cleanup.length} 个`,
  )

  // 回收 agent 抛异常同样只记录、不中断
  const throwGlobals = makeGlobals({ cleanupThrows: ['TASK-001'] })
  const throwResult = await factory(throwGlobals, { req: 'REQ-001', mode: 'run', concurrency: 2 })
  assert(
    JSON.stringify(throwResult.cleanupFailed) === JSON.stringify(['TASK-001']) && throwGlobals.seen.cleanup.length === 3,
    `${file}: 回收 agent 抛异常必须被记录且不中断其它回收，实际 cleanupFailed=${JSON.stringify(throwResult.cleanupFailed)} 回收数=${throwGlobals.seen.cleanup.length}`,
  )

  // 依赖环：必须显式报错。静默空跑会让调用方把「环」误读成「被上游失败阻塞」
  const CYCLE_FIXTURE = JSON.stringify([
    { id: 'TASK-001', title: 'a', req: ['REQ-001'], deps: ['TASK-002'], files: ['src/a'], verify: 'true' },
    { id: 'TASK-002', title: 'b', req: ['REQ-001'], deps: ['TASK-001'], files: ['src/b'], verify: 'true' },
  ])
  const cycleGlobals = makeGlobals({ fixture: CYCLE_FIXTURE })
  let cycleError = null
  try {
    await factory(cycleGlobals, { req: 'REQ-001', mode: 'run' })
  } catch (error) {
    cycleError = error
  }
  assert(
    cycleError instanceof Error && /依赖图存在环/.test(cycleError.message),
    `${file}: 依赖环必须显式报错，实际 ${cycleError ? cycleError.message : '没有报错（静默空跑）'}`,
  )
  assert(
    !cycleGlobals.seen.prompts.some((prompt) => prompt.includes('在【自己的】git worktree 内开发')),
    `${file}: 依赖环上不得派发任何开发 agent`,
  )
}

const REQ_PARALLEL = 'req-parallel.js'
let passed = CASES.length - skipped
if (present(REQ_PARALLEL)) {
  await runReqParallelCase()
  console.log(`ok: ${REQ_PARALLEL}`)
  passed += 1
} else {
  skipped += 1
  console.log(`skip: ${REQ_PARALLEL}（本类型未下发）`)
}
console.log(`verify-dsh-workflows: ${passed} passed${skipped > 0 ? `, ${skipped} skipped` : ''}`)
