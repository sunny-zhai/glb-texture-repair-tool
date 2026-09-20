// 领域技能分发：母体只保留流程/治理技能；领域技能（UI 设计等）按需装到消费项目。
// 用法：
//   node scripts/skill.mjs add --from <本地路径|git URL> [--name <skill>] [--ref <分支/标签>] [--force]
//   node scripts/skill.mjs list [--json]
//   node scripts/skill.mjs remove --name <skill>
//   [--root <path>] [--dry-run]
// 说明：
//   - 安装目标：<项目>/.ai/skills/<name>
//   - 安装记录：<项目>/.ai/skills/installed.json（受版本控制，便于审计/升级/卸载）
//   - 平台技能（不在 installed.json 中）不会被 remove 删除
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const command = argv[0] ?? 'list'
const option = (name, fallback) => {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}
const flag = (name) => argv.includes(name)

const root = resolve(option('--root', process.cwd()))
const dryRun = flag('--dry-run')
const skillsRoot = join(root, '.ai', 'skills')
const recordPath = join(skillsRoot, 'installed.json')

function fail(message, code = 1) {
  console.error(`skill: ${message}`)
  process.exit(code)
}

function loadRecord() {
  if (!existsSync(recordPath)) return {}
  try {
    return JSON.parse(readFileSync(recordPath, 'utf8'))
  } catch {
    fail(`invalid install record: ${recordPath}`)
  }
}

function saveRecord(record) {
  if (dryRun) return
  mkdirSync(skillsRoot, { recursive: true })
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full).map((rel) => join(entry, rel)))
    else out.push(entry)
  }
  return out
}

function treeHash(dir) {
  const hash = createHash('sha256')
  for (const rel of walk(dir).sort()) {
    hash.update(rel)
    hash.update('\0')
    hash.update(readFileSync(join(dir, rel)))
  }
  return hash.digest('hex')
}

function skillName(dir) {
  const text = readFileSync(join(dir, 'SKILL.md'), 'utf8')
  return text.match(/^name:\s*([A-Za-z0-9_-]+)\s*$/m)?.[1] ?? null
}

// 发现源目录中的技能：支持"源即技能目录"、`<src>/<skill>`、`<src>/skills/<skill>`、`<src>/.ai/skills/<skill>`
function discoverSkills(source) {
  const found = new Map()
  const consider = (dir) => {
    const name = skillName(dir)
    if (name && !found.has(name)) found.set(name, dir)
  }
  if (existsSync(join(source, 'SKILL.md'))) consider(source)
  for (const parent of [source, join(source, 'skills'), join(source, '.ai', 'skills')]) {
    if (!existsSync(parent)) continue
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const candidate = join(parent, entry.name)
      if (existsSync(join(candidate, 'SKILL.md'))) consider(candidate)
    }
  }
  return found
}

function pickSkill(source, requestedName) {
  const found = discoverSkills(source)
  if (found.size === 0) fail(`no SKILL.md found under ${source}${requestedName ? ` for skill "${requestedName}"` : ''}`)
  if (requestedName) {
    if (!found.has(requestedName)) {
      if (found.size === 1) fail(`--name "${requestedName}" does not match SKILL.md name "${[...found.keys()][0]}"`)
      fail(`skill "${requestedName}" not found under ${source} (available: ${[...found.keys()].join(', ')})`)
    }
    return { name: requestedName, dir: found.get(requestedName) }
  }
  if (found.size > 1) fail(`source contains multiple skills (${[...found.keys()].join(', ')}); pass --name to pick one`)
  const name = [...found.keys()][0]
  return { name, dir: found.get(name) }
}

function isGitSource(source) {
  return /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/.test(source)
}

function resolveSource(source, name, ref) {
  if (!isGitSource(source)) {
    if (!existsSync(source)) fail(`source path not found: ${source}`)
    return { ...pickSkill(source, name), cleanup: () => {} }
  }
  const temp = mkdtempSync(join(tmpdir(), 'skill-src-'))
  const args = ['clone', '--depth', '1']
  if (ref) args.push('--branch', ref)
  args.push(source, temp)
  try {
    execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    rmSync(temp, { recursive: true, force: true })
    fail(`git clone failed: ${String(error.stderr ?? error.message).trim()}`)
  }
  const cleanup = () => rmSync(temp, { recursive: true, force: true })
  const picked = discoverSkills(temp)
  if (picked.size === 0) {
    cleanup()
    fail(`cloned ${source} but found no SKILL.md${name ? ` for skill "${name}"` : ''}`)
  }
  return { ...pickSkill(temp, name), cleanup }
}

const record = loadRecord()

if (command === 'list') {
  const present = existsSync(skillsRoot)
    ? readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : []
  const installed = present
    .filter((name) => record[name])
    .map((name) => {
      const currentHash = treeHash(join(skillsRoot, name))
      return { name, source: record[name].source, ref: record[name].ref ?? null, drift: currentHash !== record[name].treeHash }
    })
  const platform = present.filter((name) => !record[name])
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ platform, installed }, null, 2))
    process.exit(0)
  }
  console.log(`platform skills (${platform.length}): ${platform.join(', ') || '—'}`)
  console.log(`installed domain skills (${installed.length}):`)
  for (const skill of installed) {
    console.log(`  - ${skill.name}${skill.ref ? `@${skill.ref}` : ''} ← ${skill.source}${skill.drift ? '  [locally modified]' : ''}`)
  }
  process.exit(0)
}

if (command === 'add') {
  const source = option('--from', '')
  if (!source) fail('--from is required (local path or git URL)')
  const ref = option('--ref', '')
  const requestedName = option('--name', '')
  const resolved = resolveSource(source, requestedName, ref)
  try {
    const name = skillName(resolved.dir)
    if (!name) fail(`SKILL.md in ${resolved.dir} has no "name:" frontmatter`)
    if (requestedName && requestedName !== name) fail(`--name "${requestedName}" does not match SKILL.md name "${name}"`)
    const target = join(skillsRoot, name)
    if (existsSync(target) && !flag('--force')) fail(`skill "${name}" already exists at ${target} (use --force to overwrite)`)
    if (existsSync(target) && flag('--force') && !record[name]) fail(`refusing to overwrite platform skill "${name}" with --force`)
    if (dryRun) {
      console.log(`skill: [dry-run] would install ${name} from ${source}${ref ? `@${ref}` : ''} to .ai/skills/${name}`)
      process.exit(0)
    }
    rmSync(target, { recursive: true, force: true })
    cpSync(resolved.dir, target, { recursive: true })
    record[name] = {
      source,
      ref: ref || null,
      installedAt: new Date().toISOString(),
      treeHash: treeHash(target),
    }
    saveRecord(record)
    console.log(`skill: installed ${name} → .ai/skills/${name} (recorded in .ai/skills/installed.json)`)
  } finally {
    resolved.cleanup()
  }
  process.exit(0)
}

if (command === 'remove') {
  const name = option('--name', '')
  if (!name) fail('--name is required')
  if (!record[name]) fail(`"${name}" is not an installed domain skill (platform skills are never removed by this command)`)
  const target = join(skillsRoot, name)
  if (dryRun) {
    console.log(`skill: [dry-run] would remove .ai/skills/${name}`)
    process.exit(0)
  }
  rmSync(target, { recursive: true, force: true })
  delete record[name]
  saveRecord(record)
  console.log(`skill: removed ${name} (install record updated)`)
  process.exit(0)
}

fail(`unknown command "${command}" (expected add | list | remove)`)
