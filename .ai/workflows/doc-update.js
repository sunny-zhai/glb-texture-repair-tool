export const meta = {
  name: 'doc-update',
  description: '文档更新流程：分析 → 编写 → 审查',
  phases: [
    { title: 'Analyze', detail: '分析变更范围和事实来源' },
    { title: 'Write', detail: '编写文档' },
    { title: 'Review', detail: '审查准确性和边界' },
  ],
}

const request = String(args ?? '').trim()
if (!request) throw new Error('doc-update requires a documentation request')

phase('Analyze')
const analysis = await agent(`Identify the factual sources and edit scope for this documentation request:\n${request}`, {
  agentType: 'tech-writer',
  phase: 'Analyze',
})

phase('Write')
const update = await agent(
  `Update the documentation using these findings. Do not claim unimplemented capability.\nRequest:\n${request}\nAnalysis:\n${analysis}`,
  { agentType: 'tech-writer', phase: 'Write' },
)

phase('Review')
const review = await agent(
  `Review the changed documentation for accuracy, missing boundaries, and contradictions.\nRequest:\n${request}`,
  { agentType: 'tech-writer', phase: 'Review' },
)

return { analysis, update, review }
