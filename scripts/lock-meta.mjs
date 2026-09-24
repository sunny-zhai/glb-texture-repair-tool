// 受管清单的元数据读取 + 「不适用」声明判定。
//
// 这是**交付**模块：母体侧（`platform-managed.mjs` / `platform-upgrade.mjs` / `platform-doctor.mjs`）
// 与项目内交付脚本（`progress.mjs` / `memory.mjs`）共用同一份语义。
//
// 为什么必须共用：曾经有两处实现之地——母体侧一份、交付脚本干脆没有——于是实测出
// 消费项目把 `docs/api/openapi.json` 声明为不适用（桌面工具、无 HTTP API），
// `progress.mjs` 仍把它印成「契约 模板」，`memory.mjs` 的快照把它打成 `—`（像缺失）。
// 声明了不适用，就不该在任何输出里被当成"缺失/模板"。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const LOCK_FILE = '.ai/platform-lock.json'

export function readLock(root) {
  const path = join(root, LOCK_FILE)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

export function readLockMeta(root) {
  return readLock(root)?.meta ?? {}
}

// `meta.excluded` 是路径前缀列表，目录写不写尾斜杠都可（`docs/coding-standard/` 与
// `docs/coding-standard` 等价）。声明只影响**平台是否管理**它：不补回、不算缺失、
// 自检提示"已声明不适用"；绝不删除项目里的文件。
export function isExcluded(rel, meta) {
  const patterns = (meta?.excluded ?? [])
    .map((item) => String(item).trim().replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter(Boolean)
  if (patterns.length === 0) return false
  const path = String(rel).trim().replace(/^\.\//, '')
  return patterns.some((pattern) => path === pattern || path.startsWith(`${pattern}/`))
}
