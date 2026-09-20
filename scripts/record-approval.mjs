// 人工确认闸门留痕（审计）：向 docs/approvals/APPROVALS.md 追加一条记录。
// 用法：node scripts/record-approval.mjs --gate <spec|architecture|delivery|gate-arbitration>
//          --decision <approved|rejected|retry|abandon> --actor <name> [--ref REQ-XXX]
//          [--evidence <path>] [--note <text>] [--root <path>]
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

const GATES = new Set(['spec', 'architecture', 'delivery', 'gate-arbitration'])
const DECISIONS = new Set(['approved', 'rejected', 'retry', 'abandon'])

const gate = option('--gate', '')
const decision = option('--decision', '')
const actor = option('--actor', '')
const ref = option('--ref', '—')
const evidence = option('--evidence', '—')
const note = option('--note', '')
const root = resolve(option('--root', process.cwd()))

if (!GATES.has(gate)) {
  console.error(`record-approval: --gate must be one of ${[...GATES].join(', ')}`)
  process.exit(1)
}
if (!DECISIONS.has(decision)) {
  console.error(`record-approval: --decision must be one of ${[...DECISIONS].join(', ')}`)
  process.exit(1)
}
if (!actor) {
  console.error('record-approval: --actor is required (use the confirmed project identity)')
  process.exit(1)
}

const file = join(root, 'docs', 'approvals', 'APPROVALS.md')
mkdirSync(dirname(file), { recursive: true })
if (!existsSync(file)) {
  writeFileSync(
    file,
    '# 人工确认闸门留痕（APPROVALS）\n\n| 时间 | 闸门 | 决策 | 确认人 | 关联 | 证据 |\n| :-- | :-- | :-- | :-- | :-- | :-- |\n',
  )
}

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
appendFileSync(file, `| ${stamp} | ${gate} | ${decision} | ${actor} | ${ref} | ${evidence}${note ? ` (${note})` : ''} |\n`)
console.log(`record-approval: recorded ${gate}/${decision} by ${actor} -> ${file}`)
