# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线目录：说明任务背景、总体要求和验收边界；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在链接的 active detail 中。

## 计划使用方式

- 根索引只允许链接一个 active mainline；当前主线的任务顺序、owner、证据和回写记录以主细则为准。
- 主细则中的复选框只有在代码或文档变更、focused test、事实守卫和必要的 closeout 都有证据后才能勾选；根索引不复制这些复选框。
- 新发现的问题先进入主细则的问题池或 [长期债务登记册](docs/todos/open-debt-and-compromises.md)，不得因为"仍有参考价值"而创建第二条并行主线。
- 主线范围、入口或验收边界发生变化时，先更新主细则，再同步本索引；所有阶段完成并留存证据后才归档主细则。

## 当前主线（判断类节点契约 D8 已完成）
- **主题：** 判断类节点契约（D8）收编——契约优先：6 个判断类能力节点（intent-recognition / dedup-strategy / conflict-trigger / artifact-derivation / label-alignment / channel-merge）先立契约三件套（backend-core ports 端口接口 + contracts Zod 配置 schema + 数据契约），rule 实现为默认（= 现状逻辑，行为不变），host-local / host-distributed assembly 挂载判断类节点，startupChecks 契约校验生效。
- **状态：** `已完成`（2026-08-16）
- **主细则：** [判断类节点契约（D8）收编主线（已归档）](docs/archived/archived-plans/judgment-node-contracts-d8-archived.md)
- **设计规格：** [《TrapMap 统一优雅组装中心设计》](docs/superpowers/specs/2026-08-16-unified-assembly-center-design.md) D8
- **状态口径：** 主线完成后 `plan.md` 不再链接 active 主细则；消费方内嵌调用点迁移与 llm/hybrid 生产收编登记在 [长期债务登记册](docs/todos/open-debt-and-compromises.md)（逐节点独立评审）。前置主线 assembly 四阶段已全部完成并归档（Phase 4 细则见 [Unified Assembly Center Phase 4（已归档）](docs/archived/archived-plans/unified-assembly-center-phase4-archived.md)）。

## 上一主线

- **Unity Assembly Center Phase 4 收尾已完成并归档（2026-08-16）：** 合入 909550b7（T1 检索收敛 + 迁移/eval infra 修复）+ 904466f5（T2 OTel/Consul 单一插件 + T3 direct-run seam 退役 + T4 别名对齐 + T5 集群化验证）；golden 全绿（assembly 42 / host-local 228 / host-distributed 173 / backend-core 196 / distributed-closeout 35 / deployment-smoke 379 / runtime-foundations 130 / observability-closeout 222 / discovery-closeout 22），check:* 全绿、fallow 零 issue（2 项继承豁免）；eval:smoke 修复后可运行且与 main 基线一致。细则见 [docs/archived/archived-plans/unified-assembly-center-phase4-archived.md](docs/archived/archived-plans/unified-assembly-center-phase4-archived.md)，closeout 证据（含偏差记录）在该文档。

- **Unity Assembly Center Phase 3 收敛已完成并归档（2026-08-16）：** 合入 0a753aec / 8b75d25d，主线 closeout 同步 a2b9b2d2；golden 全绿（host-distributed 173 / distributed-closeout 35 / deployment-smoke 379 / runtime-foundations 130）、fallow 34 files 零 issue；检索 ILIKE 完整管线收敛、OTel/Consul 收敛、direct-run seam 退役、别名对齐、集群验证 deferred 到 Phase 4。细则见 [docs/archived/archived-plans/unified-assembly-center-phase3-archived.md](docs/archived/archived-plans/unified-assembly-center-phase3-archived.md)，closeout 证据在该文档 Closeout 记录。
- **Unity Assembly Center Phase 2 试点已完成并归档（2026-08-16）：** 提交 63c26029 / 26964daf / fc114c35 + 合并 dbf1461a；细则见 [docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md](docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)，closeout 证据在该文档 Closeout 记录。
- **Unity Assembly Center Phase 1 已完成并归档（2026-08-16）：** 提交 fd0f8ee0 / 1f18d745 / 61dd0cbb / bae2c813 + 合并 d70a1cd6 / e6be1581；细则见 [docs/archived/archived-plans/unified-assembly-center-phase1-archived.md](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)，closeout 证据在该文档 Closeout 记录。
- **Dead Code and Architecture Order Cleanup 主线已提交（2026-08-16）：** 主细则 [Dead Code and Architecture Order Cleanup](docs/todos/dead-code-and-architecture-order-cleanup.md) 的实现已提交；其 closeout（Task 11-13，包括 debt register 回写与归档）延后，见 [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md) 登记。

## 执行路线图

（assembly 主线四阶段 + 判断类节点契约（D8）主线已完成并归档。以下为推荐的后续候选主线，按推荐顺序排列；激活时新建 active 主细则并重建本段。）

1. **判断类节点（D8）消费方调用点迁移（已完成 2026-08-16）**——四个有生产调用点的节点已逐节点迁移（intent-recognition 6bc4226e / channel-merge bd3650e1 / dedup-strategy 729cdb52 / conflict-trigger e4b58c50）：service 包与双宿主 composition 改经 D8 port 消费，rule 默认 = 现状逻辑行为不变；门禁全绿（typecheck、deployment-smoke 388、eval:smoke 54/81 = main 基线、fallow audit exit 0）；artifact-derivation / label-alignment 无生产调用点，随 llm 变体收编评审；llm/hybrid 生产变体（intent llm / dedup llm / artifact llm / channel-merge 替换策略）仍为后续落点。登记：[open-debt「判断类节点（D8）消费方调用点迁移」](docs/todos/open-debt-and-compromises.md)。
2. **cron 检索版本联动数据流缺口（推荐第二）**——`versionMatchMultiplier` 恒 1、检索响应 version/revision 惰性的结构性空转：实现 host artifact→retrieval entry 合并后启用 versioned 衰减并真实填充版本字段。登记：[open-debt「cron 检索版本联动数据流缺口」](docs/todos/open-debt-and-compromises.md)。
3. **internal-client review/governanceReview 双组合并（快赢）**——`packages/host-distributed/src/gateway/internal-client.ts`（928 行）两组 7 方法逐字重复：合并为单组并按 baseUrl 来源选择 URL key。登记：[open-debt「internal-client review/governanceReview 双组合并」](docs/todos/open-debt-and-compromises.md)。

不推荐近期开：capability-model 拆分与 EvalSeedPort 收窄（进入条件未触发）；平台化/服务自治（需先冻结部署目标）。

## 任务背景

2026-08-16 用户 goal 激活"统一优雅组装中心（assembly）"主线。Phase 1（packages/assembly 内核 + cordis + 测试 + 根级接线 + 文档）、Phase 2（host-local 试点）与 Phase 3（host-distributed 收敛：`distributedAssembly(name)` boot、删除 `start<X>Service` 样板、`shared/ports.ts` 简化版退役、worker 子节点整体/拆分形态打通）均已完成并归档（Phase 1 / Phase 2 / Phase 3 归档见 [docs/archived/README.md](docs/archived/README.md)）。本期承接设计文档 D6 Phase 4 收尾：检索 ILIKE 完整管线收敛（D5，行为升级为 Phase 3 显式 deferred 项）、OTel/Consul 单一插件收敛（D5）、direct-run seam 退役、别名对齐（backend-target-registry / dev:* → shape 名→builder-command 映射）、集群化验证（compose replicas=2 起 candidate-worker + outbox-worker 跑 ownership/重复消费断言）。运行时语义不变为硬约束（检索行为升级除外）。判断类节点契约（D8：intent-recognition / dedup-strategy 等）、新增 yml/json 装配与 k8s 编排均不在本阶段。

## 范围边界

**Phase 4 纳入：** 检索收敛（D5：knowledge-read ILIKE legacy seam → 完整 retrieval-engine 管线，分布式检索行为与 monolith 一致；行为升级为 Phase 3 显式 deferred 项）；OTel/Consul 单一插件收敛（D5：host-local 与 host-distributed assembly 节点共用单一 otel / 单一 consul 插件，运行时语义不变）；direct-run seam 退役（`packages/host-local/src/index.ts` 的 `isDirectExecution` 判定与 host-distributed 等价入口移除，所有 boot 经 `apps/light` / `apps/distributed` app shells 经 assembly profiles）；别名对齐（`scripts/backend-target-registry.ts` 与根 `dev:*` 别名收敛为 shape 名→builder-command 映射）；集群化验证（compose replicas=2 起 candidate-worker + outbox-worker，跑 ownership/重复消费断言）；golden 回归（typecheck；assembly + host-local + host-distributed 包测试；distributed-closeout / distributed-acceptance / deployment-smoke / runtime-foundations / observability-closeout / discovery-closeout；`eval:smoke`；check:imports/asserts/deps/structure/docs；fallow audit --base main）。

**Phase 4 不纳入：** 判断类节点契约（intent-recognition / dedup-strategy 等，D8 后续独立收编主线）、任何新增 yml/json 装配文件、k8s 编排实现。

## 验证门禁

- **运行时语义不变是硬约束（检索行为升级除外）：** Phase 4 的 OTel/Consul 收敛、direct-run seam 退役、别名对齐、集群化验证均不改变现有运行时语义；检索收敛是本阶段唯一的行为升级（ILIKE → 完整 retrieval-engine 管线，分布式行为对齐 monolith，Phase 3 偏差显式 deferred），需评审留痕并通过 `eval:smoke` 与检索 focused tests。
- 每任务至少运行相关包 focused tests 与 `pnpm typecheck`。
- 跨包导入或边界变化必须运行 `pnpm exec fallow audit --base main`。
- 文档变化至少运行 `pnpm check:docs` 和 `pnpm check:structure`。
- 检索收敛变更必跑 `pnpm eval:smoke`；边界接入后运行 `pnpm exec check:fallow`（含 assembly zone）。

## 验收边界

- 检索收敛完成：`packages/host-distributed/src/knowledge-read/ports.ts` 的 ILIKE legacy seam 退役，改为消费完整 retrieval-engine 管线，分布式检索行为与 monolith 一致；`eval:smoke` 与检索 focused tests 全绿。
- `host-local` 与 `host-distributed` 的 assembly 节点共用单一 otel / 单一 consul 插件；OTel/Consul 运行时语义不变，`observability-closeout` / `discovery-closeout` 全绿。
- `packages/host-local/src/index.ts` 的 `isDirectExecution` 直连回退与 host-distributed 等价入口退役；所有 boot（dev / compose / closeout 测试链）均经 `apps/light` / `apps/distributed` app shells 经 assembly profiles。
- `scripts/backend-target-registry.ts` 与根 `dev:*` 别名收敛为 shape 名（local-agent / team-monolith / distributed:<service>）→ builder-command 映射，单测断言通过。
- 集群化验证通过：compose replicas=2 起 candidate-worker + outbox-worker，ownership / 重复消费断言通过（SKIP LOCKED / 租约语义）。
- golden 回归全绿：typecheck；assembly + host-local + host-distributed 包测试；`test:distributed-closeout` / `test:distributed-acceptance` / `test:deployment-smoke` / `test:runtime-foundations` / `test:observability-closeout` / `test:discovery-closeout`；`eval:smoke`；check:imports / asserts / deps / structure / docs；fallow audit --base main。
- 无新增 yml/json 装配文件；无新增断言豁免（`check:asserts` 全绿）；文档守卫（check:docs / check:structure）全绿。

完成主线还必须满足：所有 active detail completion gates 均有命令输出或测试证据，CI 中的文档守卫为 blocking，未完成事项已在主细则或长期债务登记册中标明后续落点。

## 长期债务与历史入口

- [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)：不构成第二条 active mainline。
- [已归档 Unity Assembly Center Phase 3](docs/archived/archived-plans/unified-assembly-center-phase3-archived.md)：assembly Phase 3 收敛已完成并归档（2026-08-16）。
- [已归档 Unity Assembly Center Phase 2](docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)：assembly Phase 2 试点已完成并归档（2026-08-16）。
- [已归档 Unity Assembly Center Phase 1](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)：assembly Phase 1 地基已完成并归档（2026-08-16）。
- [Dead Code and Architecture Order Cleanup 主线](docs/todos/dead-code-and-architecture-order-cleanup.md)：更早上一主线，实现已提交 2026-08-16，closeout（Task 11-13）延后，见 open-debt 登记。
- [已归档 Documentation Validation and Observability Platform 主线](docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md)：更早完成主线的历史证据。
- [历史归档总表](docs/archived/README.md)。
