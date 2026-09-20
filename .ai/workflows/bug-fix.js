export const meta = {
  name: 'bug-fix',
  description: 'Bug 修复流程：复现 → 根因分析 → 修复 → 验证',
  phases: [
    { title: 'Debug', detail: '复现和定位根因' },
    { title: 'Fix', detail: '最小修复和回归检查' },
    { title: 'Review', detail: '独立审查修复' },
    { title: 'Verify', detail: '运行已有验证命令' },
  ],
}

const report = String(args ?? '').trim()
if (!report) throw new Error('bug-fix requires a bug report')

phase('Debug')
const diagnosis = await agent(`Reproduce this bug and identify the shared root cause.\nBug report:\n${report}`, {
  agentType: 'developer',
  phase: 'Debug',
})

phase('Fix')
const fix = await agent(
  `Implement the smallest root-cause fix and a focused regression check.\nBug report:\n${report}\nDiagnosis:\n${diagnosis}`,
  { agentType: 'developer', phase: 'Fix' },
)

phase('Review')
const review = await agent(
  `Review the bug fix for correctness and regression risk.\nBug report:\n${report}`,
  { agentType: 'reviewer', phase: 'Review' },
)

phase('Verify')
const verification = await agent(
  `Run the relevant documented validation without editing files. Report commands and results.\nBug report:\n${report}`,
  { agentType: 'verifier', phase: 'Verify' },
)

return { diagnosis, fix, review, verification }
