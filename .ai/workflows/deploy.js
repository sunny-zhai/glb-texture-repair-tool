export const meta = {
  name: 'deploy',
  description: '交付流程：发布前检查 → 迁移与发布 → 冒烟验证 → 回滚预案',
  phases: [
    { title: 'Preflight', detail: '发布前检查清单与阻断项' },
    { title: 'Release', detail: '迁移脚本与发布步骤' },
    { title: 'Smoke', detail: '冒烟验证与证据' },
    { title: 'Rollback', detail: '回滚预案、触发条件与发布说明' },
  ],
}

const target = String(args ?? '').trim()
if (!target) throw new Error('deploy requires a release target or version')

phase('Preflight')
const preflight = await agent(
  `Run the release preflight checklist for ${target} against docs/release/RELEASE_CHECKLIST.md. List blockers, required migrations, environment prerequisites and the verification commands. Do not change files.\nRelease target:\n${target}`,
  { agentType: 'verifier', phase: 'Preflight' },
)

phase('Release')
const release = await agent(
  `Execute the release steps for ${target}: apply migrations, build artifacts, deploy to the target environment. Report the exact commands, the resulting revision and how to verify it.\nPreflight:\n${preflight}`,
  { agentType: 'developer', phase: 'Release' },
)

phase('Smoke')
const smoke = await agent(
  `Verify the release for ${target}: exercise the critical paths, record the command and the observed result as evidence, and flag anything unexpected.\nRelease:\n${release}`,
  { agentType: 'verifier', phase: 'Smoke' },
)

phase('Rollback')
const rollback = await agent(
  `Document the rollback plan for ${target}: trigger conditions, exact steps, migration/data reversal, and the release-notes entry.\nSmoke:\n${smoke}`,
  { agentType: 'tech-writer', phase: 'Rollback' },
)

return { preflight, release, smoke, rollback }
