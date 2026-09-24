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

// 记录与字段按**语义**取：`git log` 会在记录之间插入换行，若按原始字节位置切，
// 除第一条外每条记录的 hash 都会以 `\n` 开头（slice(0,7) 得到 "\n860de3"），
// 生成的 CHANGELOG 每条都会断行——实测缺陷见台账 ISSUE-010。
for (const entry of raw.split('\x1e').filter((item) => item.trim())) {
  const [hash = '', subject = ''] = entry.split('\x09')
  // 字段级归一：hash 必须 trim（否则带着记录间的换行，见 ISSUE-010）；
  // 主题来自 `%s`，本就是单行（提交正文不会出现在这里）
  const short = hash.trim().slice(0, 7)
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
