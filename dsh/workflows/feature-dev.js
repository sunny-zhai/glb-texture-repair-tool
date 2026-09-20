// DSH 移植版 feature-dev 工作流。
// 原版：.ai/workflows/feature-dev.js（Claude Code SDK 格式）。
// DSH 版差异：
//   1) 无 export const meta —— meta 作为 workflow 工具的 meta 参数传入（见下）；
//   2) 不用 agentType —— DSH workflow 会拒绝该选项，角色契约内嵌为提示词。
// 调用方式（workflow 工具）：
//   meta: { name: 'feature-dev', description: '完整功能开发流程：计划 → 实现 → 审查 → 验证',
//           phases: [
//             { title: 'Plan', detail: '需求分析与实施计划' },
//             { title: 'Implement', detail: '编码实现与测试' },
//             { title: 'Review', detail: '代码审查' },
//             { title: 'Verify', detail: '运行已有验证命令' },
//           ] }
//   args: 任务描述字符串，或 { request: '任务描述' }
// 角色契约与 .ai/agents/{planner,developer,reviewer,verifier}.md 保持一致；修改角色定义时须同步本文件。

const request = String(args?.request ?? args ?? '').trim()
if (!request) throw new Error('feature-dev requires a task description')

const plannerRole = `planner 角色（需求分析与实施计划）：
- 职责：需求澄清与范围界定、验收标准定义、实施计划生成、风险评估。
- 输出结构化计划：范围（做什么 / 不做什么）；步骤（有依赖顺序的拆解）；风险（已知阻塞和不确定性）；验收标准（可验证的通过条件）。
- 不做代码实现。`

const developerRole = `developer 角色（编码实现与测试编写），遵循 Ponytail 效率编码风格：
1. 先理解，再动手 — 读全需要改动的文件，trace 完整调用链
2. 找最短路径 — 优先复用现有 util / helper / 模式；不引入新依赖
3. 根因修复 — 在共享函数里修一次，不在每个调用点打补丁
4. 每个非平凡逻辑留一个验证入口 — assert demo() 或最小测试
5. 不做无请求的抽象 — 一个实现不创建接口，一个产品不创建工厂
输出：工作代码 + 测试；改动说明（commit message）。代码只使用英文。`

const reviewerRole = `reviewer 角色（代码审查与质量把关，只读，不修改文件）：
审查维度（按优先级）：
1. 正确性 — 边界条件、竞态、空值、类型安全
2. 安全 — 注入、鉴权缺失、敏感数据泄露
3. 可维护性 — 重复代码、职责清晰度、命名
4. 性能 — 不必要的循环、N+1 查询、内存泄漏
输出按严重级别分类的结构化审查报告：critical / high 必须修复；medium 建议修复；low / nit 可忽略。`

const verifierRole = `verifier 角色（验证与门禁，只读）：
- 发现仓库文档化的验证命令；先跑最窄的相关检查，再跑要求的聚合检查。
- 逐条报告命令、退出码与失败输出，如实报告；不修改文件、不安装依赖、不弱化失败检查。
- 没有可运行的验证命令时明确说明。`

phase('Plan')
const plan = await agent(
  `你是${plannerRole}\n为以下任务创建实施计划：\n${request}`,
  { label: 'planner', phase: 'Plan' },
)

phase('Implement')
const implementation = await agent(
  `你是${developerRole}\n按已批准计划实现该任务，diff 保持最小并附聚焦验证。\n任务：\n${request}\n计划：\n${plan}`,
  { label: 'developer', phase: 'Implement' },
)

phase('Review')
const review = await agent(
  `你是${reviewerRole}\n审查当前工作树中该任务的改动，只报告具体发现。\n任务：\n${request}`,
  { label: 'reviewer', phase: 'Review' },
)

phase('Verify')
const verification = await agent(
  `你是${verifierRole}\n运行与任务相关的已有验证命令，不修改文件，逐条报告命令与结果。\n任务：\n${request}`,
  { label: 'verifier', phase: 'Verify' },
)

return { plan, implementation, review, verification }
