// DSH 移植版 doc-update 工作流。
// 原版：.ai/workflows/doc-update.js（Claude Code SDK 格式）。
// DSH 版差异：
//   1) 无 export const meta —— meta 作为 workflow 工具的 meta 参数传入（见下）；
//   2) 不用 agentType —— DSH workflow 会拒绝该选项，角色契约内嵌为提示词。
// 调用方式（workflow 工具）：
//   meta: { name: 'doc-update', description: '文档更新流程：分析 → 编写 → 审查',
//           phases: [
//             { title: 'Analyze', detail: '分析变更范围和事实来源' },
//             { title: 'Write', detail: '编写文档' },
//             { title: 'Review', detail: '审查准确性和边界' },
//           ] }
//   args: 文档请求字符串，或 { request: '文档请求' }
// 角色契约与 .ai/agents/tech-writer.md 保持一致；修改角色定义时须同步本文件。

const request = String(args?.request ?? args ?? '').trim()
if (!request) throw new Error('doc-update requires a documentation request')

const techWriterRole = `tech-writer 角色（技术文档编写与维护）：
- 职责：设计文档、API 文档、用户指南、架构说明的编写与维护；文档规范化。
- 原则：写人类和 Agent 共读的文档；结构清晰、层次分明；区分"已实现" / "设计中" / "待实现"。`

phase('Analyze')
const analysis = await agent(
  `你是${techWriterRole}\n识别该文档请求的事实来源与编辑范围。\n请求：\n${request}`,
  { label: 'tech-writer', phase: 'Analyze' },
)

phase('Write')
const update = await agent(
  `你是${techWriterRole}\n基于分析结果更新文档；不得声称未实现的能力。\n请求：\n${request}\n分析：\n${analysis}`,
  { label: 'tech-writer', phase: 'Write' },
)

phase('Review')
const review = await agent(
  `你是${techWriterRole}\n审查改动的文档：准确性、缺失的边界、自相矛盾之处。\n请求：\n${request}`,
  { label: 'tech-writer', phase: 'Review' },
)

return { analysis, update, review }
