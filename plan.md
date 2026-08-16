# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线目录：说明任务背景、总体要求和验收边界；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在链接的 active detail 中。

## 计划使用方式

- 根索引只允许链接一个 active mainline；当前主线的任务顺序、owner、证据和回写记录以主细则为准。
- 主细则中的复选框只有在代码或文档变更、focused test、事实守卫和必要的 closeout 都有证据后才能勾选；根索引不复制这些复选框。
- 新发现的问题先进入主细则的问题池或 [长期债务登记册](docs/todos/open-debt-and-compromises.md)，不得因为"仍有参考价值"而创建第二条并行主线。
- 主线范围、入口或验收边界发生变化时，先更新主细则，再同步本索引；所有阶段完成并留存证据后才归档主细则。

## 当前主线

- **主题：** 统一优雅组装中心（assembly）Phase 2 试点
- **目标：** host-local 改由 assembly boot（localAgentAssembly / teamMonolithAssembly → boot()）+ Nest 以 transport 插件接入；各 service 包新增 node.ts、assembly infra/transport 节点与 profiles；现有行为不变为硬约束。
- **状态：** `进行中`
- **主细则：** [Unified Assembly Center Phase 2](docs/todos/assembly-phase2.md)
- **设计规格：** [《TrapMap 统一优雅组装中心设计》](docs/superpowers/specs/2026-08-16-unified-assembly-center-design.md)
- **状态口径：** `进行中` 只表示该主细则仍是 active execution surface；任务完成度、阻塞项和证据以主细则复选框与 closeout 记录为准。

## 上一主线

- **Unity Assembly Center Phase 1 已完成并归档（2026-08-16）：** 提交 fd0f8ee0 / 1f18d745 / 61dd0cbb / bae2c813 + 合并 d70a1cd6 / e6be1581；细则见 [docs/archived/archived-plans/unified-assembly-center-phase1-archived.md](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)，closeout 证据在该文档 Closeout 记录。
- **Dead Code and Architecture Order Cleanup 主线已提交（2026-08-16）：** 主细则 [Dead Code and Architecture Order Cleanup](docs/todos/dead-code-and-architecture-order-cleanup.md) 的实现已提交；其 closeout（Task 11-13，包括 debt register 回写与归档）延后，见 [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md) 登记。

## 执行路线图

| 阶段 | 主细则任务 | 阶段交付 | 放行条件 |
|---|---|---|---|
| 1. service node.ts | T1 | 各 service 包新增 src/node.ts（defineNode 包装现有工厂，provides/inject 按设计 D2 映射表；不删除现有工厂，双轨） | 节点定义可装载、typecheck/fallow 全绿 |
| 2. infra/transport 节点 | T2 | assembly 侧 pg / task-transport / outbox / nest-transport 节点（observability / service-discovery 保持 host-local 现有接线） | 节点可装载、assembly 测试全绿 |
| 3. profiles | T3 | local-agent.ts + team-monolith.ts（全部节点 embedded，含 nestTransport(options)）+ 三形态断言测试 | profiles 断言测试通过、typecheck 全绿 |
| 4. host-local 试点切换 | T4 | bootstrapNest 改经 assembly boot；双轨期保留旧路径直至 golden 全绿 | golden（app/main）回归全绿 |
| 5. golden 回归 | T5 | app.test.ts / main.test.ts / test:deployment-smoke / test:runtime-foundations / 受影响包测试；行为不变 diff 核验 | golden 全绿、行为不变 |
| 6. closeout | T6 | 守卫 + 文档回写 + 归档评估 | 证据齐全后归档并切换下一主线（Phase 3） |

阶段必须按顺序推进；任一阶段未通过放行条件，不得用后续阶段的实现掩盖前置事实或守卫失败。具体步骤和证据位置见[主细则](docs/todos/assembly-phase2.md)。

## 任务背景

2026-08-16 用户 goal 激活"统一优雅组装中心（assembly）"主线。Phase 1（packages/assembly 内核 + cordis + 测试 + 根级接线 + 文档）已完成并归档（见 [docs/archived/archived-plans/unified-assembly-center-phase1-archived.md](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)）。本期承接设计文档 D6 Phase 2 试点：host-local 改由 assembly boot（`localAgentAssembly` / `teamMonolithAssembly` → `boot()`），Nest 以 transport 插件接入；各 service 包新增 `src/node.ts`（defineNode 包装现有工厂，不删除现有工厂，双轨），assembly 侧新增 infra/transport 节点（pg / task-transport / outbox / nest-transport），新增 profiles（local-agent / team-monolith，全部节点 embedded）。平行分支 `feat/phase2-core`（另一 worktree）实现 service node.ts、assembly profiles 与 host-local assembly boot；现有行为不变为硬约束。判断类节点契约、host-distributed 收敛、OTel/Consul 收敛、集群化验证与 yml/json 装配均不在本阶段。

## 范围边界

**Phase 2 纳入：** 各 service 包 `src/node.ts`（defineNode 包装现有工厂，provides/inject 按设计 D2 映射表；不删除现有工厂，双轨）；assembly infra/transport 节点（pg / task-transport / outbox / nest-transport；observability / service-discovery 保持 host-local 现有接线）；profiles（local-agent / team-monolith，全部节点 embedded，含 nestTransport(options)；三形态断言测试）；host-local 试点切换（bootstrapNest 改经 assembly boot，双轨期保留旧路径直至 golden 全绿；apps/light 不变或薄调整）；golden 回归（app.test.ts / main.test.ts / test:deployment-smoke / test:runtime-foundations / 受影响包测试；行为不变 diff 核验）。

**Phase 2 不纳入：** 判断类节点契约（intent-recognition / dedup-strategy 等，D8 后续独立收编）、host-distributed 收敛（Phase 3）、OTel/Consul 双份收敛与 shared/ports.ts 退役（Phase 3/4）、集群化验证（Phase 4）、任何 yml/json 装配。

## 验证门禁

- **行为不变是硬约束：** Phase 2 不改变任何现有运行时语义；golden 回归（app.test.ts / main.test.ts / deployment-smoke / runtime-foundations）必须全绿，diff 核验 host-local 行为不变；`host-distributed` 与其它 `apps/*` 保持零源码改动。
- 每任务至少运行相关包 focused tests 与 `pnpm typecheck`。
- 跨包导入或边界变化必须运行 `pnpm exec fallow audit --base main`。
- 文档变化至少运行 `pnpm check:docs` 和 `pnpm check:structure`。
- 边界接入后运行 `pnpm exec check:fallow`（含 assembly zone）。

## 验收边界

- 各 service 包均新增 `src/node.ts`（defineNode 包装现有工厂），现有工厂保留（双轨），业务文件零改动 diff。
- assembly infra/transport 节点（pg / task-transport / outbox / nest-transport）可装载；observability / service-discovery 保持 host-local 现有接线。
- profiles（local-agent / team-monolith）全部节点 embedded、含 `nestTransport(options)`；三形态断言测试通过。
- host-local `bootstrapNest` 经 assembly boot；双轨期旧路径保留至 golden 全绿。
- golden 回归全绿：`app.test.ts` / `main.test.ts` / `pnpm test:deployment-smoke` / `pnpm test:runtime-foundations` / 受影响包测试；行为不变 diff 核验通过。
- `pnpm typecheck` 全绿；`check:fallow`（含 assembly zone）无 issue；文档守卫（check:docs / check:structure）全绿；`host-distributed`、其它 `apps/*` 在本阶段无源码变更（文档除外）。

完成主线还必须满足：所有 active detail completion gates 均有命令输出或测试证据，CI 中的文档守卫为 blocking，未完成事项已在主细则或长期债务登记册中标明后续落点。

## 长期债务与历史入口

- [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)：不构成第二条 active mainline。
- [已归档 Unity Assembly Center Phase 1](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)：assembly Phase 1 地基已完成并归档（2026-08-16）。
- [Dead Code and Architecture Order Cleanup 主线](docs/todos/dead-code-and-architecture-order-cleanup.md)：更早上一主线，实现已提交 2026-08-16，closeout（Task 11-13）延后，见 open-debt 登记。
- [已归档 Documentation Validation and Observability Platform 主线](docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md)：更早完成主线的历史证据。
- [历史归档总表](docs/archived/README.md)。
