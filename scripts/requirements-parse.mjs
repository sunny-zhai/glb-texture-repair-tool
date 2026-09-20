// 需求 / 任务解析的唯一实现。
//
// 为什么单独成模块：`progress.mjs`（进程线视图）与 `memory.mjs`（记忆线）都要读同一份
// `docs/requirements/{REQUIREMENTS,TASKS}.md`。两处各写一遍解析必然漂移——本项目已经为
// "同一事实写两遍"付过代价（`.ai` 与 `dsh` 两份工作流清单、`verification.md` 与 `ci.yml`
// 两份测试清单），所以这里只留一份。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const TASK_DONE = /^(已完成|完成|已验收|done|完成✅)/i

export function parseRequirements(text) {
  if (!text) return []
  const items = []
  const blocks = text.split(/^### /m).slice(1)
  for (const block of blocks) {
    const title = block.split('\n')[0].trim()
    const id = title.match(/^(REQ-\d+)/)?.[1]
    if (!id) continue
    const status = block.match(/\*\*状态\*\*[：:]\s*([^\n|]+)/)?.[1]?.trim() ?? '未标注'
    const criteria = (block.match(/^\s*\d+\.\s+/gm) ?? []).length
    const tasks = block.match(/\*\*关联任务\*\*[：:]\s*([^\n]+)/)?.[1]?.trim() ?? ''
    items.push({ id, title, status, criteria, tasks })
  }
  return items
}

export function parseTasks(text) {
  if (!text) return []
  const items = []
  const blocks = text.split(/^### /m).slice(1)
  for (const block of blocks) {
    const title = block.split('\n')[0].trim()
    const id = title.match(/^(TASK-\d+)/)?.[1]
    if (!id) continue
    const status = block.match(/\*\*状态\*\*[：:]\s*([^\n|]+)/)?.[1]?.trim() ?? '未标注'
    const req = block.match(/\*\*关联需求\*\*[：:]\s*([^\n]+)/)?.[1]?.trim() ?? ''
    const deps = block.match(/\*\*依赖\*\*[：:]\s*([^\n]+)/)?.[1]?.trim() ?? ''
    const evidence = block.match(/\*\*验证结果\*\*[：:]\s*([^\n]+)/)?.[1]?.trim() ?? ''
    items.push({ id, title, status, req, deps, evidence })
  }
  return items
}

const readOptional = (root, relative) => {
  const path = join(root, relative)
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

// 读取某个项目的需求与任务清单（两者缺一即返回空数组，与既有行为一致）
export function loadRequirements(root) {
  return {
    requirements: parseRequirements(readOptional(root, 'docs/requirements/REQUIREMENTS.md')),
    tasks: parseTasks(readOptional(root, 'docs/requirements/TASKS.md')),
  }
}
