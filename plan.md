# TrapMap 执行计划索引

根 `plan.md` 只维护当前执行入口、总体目标、全局约束和最小回写要求；执行细节统一写在 `docs/todos/` 的活跃细则中。

## 当前主线

- 当前主线：Agent Eval 平台长期可维护架构
- 状态：`进行中`
- 主细则：[`docs/todos/agent-eval-framework-evaluation-and-plan.md`](docs/todos/agent-eval-framework-evaluation-and-plan.md)
- 配套评分：[`docs/todos/agent-eval-framework-scorecard.md`](docs/todos/agent-eval-framework-scorecard.md)
- 活跃 debt register：[`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md)

## 总体目标

- 保留 TrapMap 自建 eval 内核作为真相源，包括 case schema、runner、governance assertion、snapshot replay、baseline-aware CI gate
- 增加平台无关的 event / score / trace 抽象层，确保后续可维护、可替换、可扩展
- 先验证 self-host 平台接入，再保留第二平台适配能力，避免被单一 SaaS 或 SDK 绑定
- 接受短期工作量，换取未来 6-12 个月更低的维护成本与更好的扩展性

## 当前活跃要求

- 所有执行进度统一回写到主细则中的复选框，不再在根 `plan.md` 维护阶段细节
- 新发现的问题、风险和 deferred，优先回写到主细则的问题区或 [`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md)
- 不可退化项必须保留：governance assertion、endpoint-specific contract、offline isolated eval、retrieval-live snapshot replay、badcase export、baseline-aware CI
- 首轮实施只允许“双写镜像”，不允许让外部平台接管原生 CLI、原生 report 或 CI hard gate

## 文档回写要求

- 修改 eval 入口、tier、判定标准、dataset 组织方式时，更新 [`docs/operations/TESTING.md`](docs/operations/TESTING.md)、相关 eval README 和主细则
- 修改环境变量、平台接入配置或运行时默认值时，更新 [`docs/operations/ENVIRONMENT.md`](docs/operations/ENVIRONMENT.md) 与相关 guide
- 修改共享 schema、事件模型或对外语义时，先更新 `packages/contracts` 真相源，再更新细则和必要的 reference / guide 文档
- 当前主线新增的执行文档、设计说明、接入指南，统一落在 `docs/todos/`、`docs/guides/`、`docs/operations/` 的正确层级，不在根目录堆叠临时文档

## 最小验证要求

- 文档或目录规则改动完成后，至少运行：
  - `rtk pnpm check:docs-drift`
  - `rtk pnpm check:structure`
- 涉及 eval runner、judge、fixtures、contracts、平台适配的改动，至少补跑：
  - `rtk pnpm eval:smoke`
- 涉及共享 contracts、平台事件模型或跨包导入路径时，再补跑直接受影响包测试与 `rtk pnpm typecheck`

## 背景归档入口

- 上一版根索引：[`docs/archived/archived-plans/plan-2026-07-03-agent-eval-platform-index-archived.md`](docs/archived/archived-plans/plan-2026-07-03-agent-eval-platform-index-archived.md)
- 历史 closeout 主线：[`docs/archived/README.md`](docs/archived/README.md)
