// 变更日志生成：从 Conventional Commits 生成 CHANGELOG 片段。
// 用法：node scripts/changelog.mjs [--from <ref>] [--to <ref>] [--write]
//   默认输出到 stdout；--write 追加到 CHANGELOG.md。
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}
const from = option('--from', '')
const to = option('--to', 'HEAD')
const write = argv.includes('--write')

const GROUPS = [
  ['feat', 'Features'],
  ['fix', 'Bug Fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['docs', 'Documentation'],
  ['test', 'Tests'],
  ['build', 'Build'],
  ['ci', 'CI'],
  ['chore', 'Chores'],
]

const range = from ? `${from}..${to}` : to
const raw = execFileSync('git', ['log', range, '--pretty=format:%H%x09%s%x1e'], { encoding: 'utf8' })

const buckets = new Map(GROUPS.map(([key, title]) => [key, { title, items: [] }]))
const other = { title: 'Other', items: [] }

for (const entry of raw.split('\x1e').filter((item) => item.trim())) {
  const [hash = '', subject = ''] = entry.split('\x09')
  const short = hash.slice(0, 7)
  const match = /^([a-z]+)(\(([^)]*)\))?!?:\s*(.+)$/.exec(subject.trim())
  if (match) {
    const [, type, , scope, text] = match
    const line = `- ${text}${scope ? ` (${scope})` : ''} — ${short}`
    if (buckets.has(type)) buckets.get(type).items.push(line)
    else other.items.push(line)
  } else {
    other.items.push(`- ${subject.trim()} — ${short}`)
  }
}

const lines = [`## ${new Date().toISOString().slice(0, 10)}`, '']
for (const [, { title, items }] of buckets) {
  if (items.length > 0) lines.push(`### ${title}`, ...items, '')
}
if (other.items.length > 0) lines.push('### Other', ...other.items, '')

const output = `${lines.join('\n')}\n`
if (write) {
  appendFileSync('CHANGELOG.md', output)
  console.log('changelog: appended to CHANGELOG.md')
} else {
  process.stdout.write(output)
}
