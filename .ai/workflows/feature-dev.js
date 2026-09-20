export const meta = {
  name: 'feature-dev',
  description: '完整功能开发流程：计划 → 实现 → 审查 → 验证',
  phases: [
    { title: 'Plan', detail: '需求分析与实施计划' },
    { title: 'Implement', detail: '编码实现与测试' },
    { title: 'Review', detail: '代码审查' },
    { title: 'Verify', detail: '运行已有验证命令' },
  ],
}

const request = String(args ?? '').trim()
if (!request) throw new Error('feature-dev requires a task description')

phase('Plan')
const plan = await agent(`Create an implementation plan for this task:\n${request}`, {
  agentType: 'planner',
  phase: 'Plan',
})

phase('Implement')
const implementation = await agent(
  `Implement this task using the approved plan. Keep the diff minimal and add focused verification.\nTask:\n${request}\nPlan:\n${plan}`,
  { agentType: 'developer', phase: 'Implement' },
)

phase('Review')
const review = await agent(
  `Review the current working-tree changes for this task. Report concrete findings only.\nTask:\n${request}`,
  { agentType: 'reviewer', phase: 'Review' },
)

phase('Verify')
const verification = await agent(
  `Run the documented validation relevant to this task without editing files. Report each command and its result.\nTask:\n${request}`,
  { agentType: 'verifier', phase: 'Verify' },
)

return { plan, implementation, review, verification }
