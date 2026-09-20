// 接口契约校验：docs/api/*.json 必须可解析且结构完整（OpenAPI 3.x）。
// 用法：node scripts/check-contract.mjs [--root <path>]
// 无契约文件时跳过（exit 0），便于 doc-only 等项目复用。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const index = argv.indexOf('--root')
const root = resolve(index >= 0 && argv[index + 1] ? argv[index + 1] : process.cwd())
const apiDir = join(root, 'docs', 'api')

if (!existsSync(apiDir)) {
  console.log('check-contract: no docs/api directory; skipping')
  process.exit(0)
}
const files = readdirSync(apiDir).filter((file) => file.endsWith('.json'))
if (files.length === 0) {
  console.log('check-contract: no contract files; skipping')
  process.exit(0)
}

const problems = []
for (const file of files) {
  const path = join(apiDir, file)
  let doc
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    problems.push(`${file}: invalid JSON (${error.message})`)
    continue
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    problems.push(`${file}: root must be an object`)
    continue
  }
  if (typeof doc.openapi !== 'string' || !/^3\.\d+/.test(doc.openapi)) {
    problems.push(`${file}: "openapi" must declare a 3.x version`)
  }
  if (typeof doc.info !== 'object' || doc.info === null || !doc.info.title || !doc.info.version) {
    problems.push(`${file}: "info.title" and "info.version" are required`)
  }
  if (typeof doc.paths !== 'object' || doc.paths === null || Array.isArray(doc.paths)) {
    problems.push(`${file}: "paths" must be an object`)
  } else if (Object.keys(doc.paths).length === 0) {
    problems.push(`${file}: "paths" is empty — define at least one endpoint`)
  }
}

if (problems.length > 0) {
  console.error('check-contract: contract problems found:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`check-contract: ok (${files.length} contract file(s) validated)`)
