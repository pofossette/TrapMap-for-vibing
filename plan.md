# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线目录：说明任务背景、总体要求和验收边界；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在链接的 active detail 中。

## 计划使用方式

- 根索引只允许链接一个 active mainline；当前主线的任务顺序、owner、证据和回写记录以主细则为准。
- 主细则中的复选框只有在代码或文档变更、focused test、事实守卫和必要的 closeout 都有证据后才能勾选；根索引不复制这些复选框。
- 新发现的问题先进入主细则的问题池或 [长期债务登记册](docs/todos/open-debt-and-compromises.md)，不得因为"仍有参考价值"而创建第二条并行主线。
- 主线范围、入口或验收边界发生变化时，先更新主细则，再同步本索引；所有阶段完成并留存证据后才归档主细则。

## 当前主线

当前无 active mainline（2026-08-22）。上一主线「债务全量派发 + Agent MCP 接入 + 微服务平台化」已完成并归档：[docs/archived/archived-plans/debt-mcp-platformization-mainline-archived.md]。残余环境门控验证与运营项见 [长期债务登记册](docs/todos/open-debt-and-compromises.md)。

## 上一主线

- **判断类节点契约（D8）收编已完成并归档（2026-08-16）：** 6 个判断类能力节点契约三件套 + rule 默认实现 + assembly 挂载与 startupChecks 契约校验；消费方调用点迁移、cron 检索版本联动、internal-client 双组合并三项后续主线亦已完成（2026-08-16）。细则见 [docs/archived/archived-plans/judgment-node-contracts-d8-archived.md](docs/archived/archived-plans/judgment-node-contracts-d8-archived.md)；llm/hybrid 生产变体收编保留在 [长期债务登记册](docs/todos/open-debt-and-compromises.md)。
- **Unity Assembly Center Phase 4 收尾已完成并归档（2026-08-16）：** 合入 909550b7（T1 检索收敛 + 迁移/eval infra 修复）+ 904466f5（T2 OTel/Consul 单一插件 + T3 direct-run seam 退役 + T4 别名对齐 + T5 集群化验证）；golden 全绿（assembly 42 / host-local 228 / host-distributed 173 / backend-core 196 / distributed-closeout 35 / deployment-smoke 379 / runtime-foundations 130 / observability-closeout 222 / discovery-closeout 22），check:* 全绿、fallow 零 issue（2 项继承豁免）；eval:smoke 修复后可运行且与 main 基线一致。细则见 [docs/archived/archived-plans/unified-assembly-center-phase4-archived.md](docs/archived/archived-plans/unified-assembly-center-phase4-archived.md)，closeout 证据（含偏差记录）在该文档。

- **Unity Assembly Center Phase 3 收敛已完成并归档（2026-08-16）：** 合入 0a753aec / 8b75d25d，主线 closeout 同步 a2b9b2d2；golden 全绿（host-distributed 173 / distributed-closeout 35 / deployment-smoke 379 / runtime-foundations 130）、fallow 34 files 零 issue；检索 ILIKE 完整管线收敛、OTel/Consul 收敛、direct-run seam 退役、别名对齐、集群验证 deferred 到 Phase 4。细则见 [docs/archived/archived-plans/unified-assembly-center-phase3-archived.md](docs/archived/archived-plans/unified-assembly-center-phase3-archived.md)，closeout 证据在该文档 Closeout 记录。
- **Unity Assembly Center Phase 2 试点已完成并归档（2026-08-16）：** 提交 63c26029 / 26964daf / fc114c35 + 合并 dbf1461a；细则见 [docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md](docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)，closeout 证据在该文档 Closeout 记录。
- **Unity Assembly Center Phase 1 已完成并归档（2026-08-16）：** 提交 fd0f8ee0 / 1f18d745 / 61dd0cbb / bae2c813 + 合并 d70a1cd6 / e6be1581；细则见 [docs/archived/archived-plans/unified-assembly-center-phase1-archived.md](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)，closeout 证据在该文档 Closeout 记录。
- **Dead Code and Architecture Order Cleanup 主线已提交（2026-08-16）：** 主细则 [Dead Code and Architecture Order Cleanup](docs/todos/dead-code-and-architecture-order-cleanup.md) 的实现已提交；其 closeout（Task 11-13，包括 debt register 回写与归档）延后，见 [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md) 登记。

## 执行路线图

（本主线激活后，原候选主线 1-3 已完成并归档；capability-model 拆分、EvalSeedPort 收窄、平台化/服务自治、DB 隔离等原"不推荐近期开"项已由 2026-08-21 用户裁决全量纳入当前主细则 Workstream A/C 派发，不再单独排队。）

## 任务背景

2026-08-21 用户 goal 激活本主线：以 git worktree + subagent-driven development 并行清偿 [长期债务登记册](docs/todos/open-debt-and-compromises.md) 全部条目（含已被 assembly Phase 3/4 实际完成但未关闭的陈旧条目清理）、交付 agent 接入的 MCP server（完整读写面）、并将 distributed 形态向 Level 3 平台化推进。登记册"进入条件"由用户显式激活覆盖（登记册使用规则的"用户显式要求开始实施"路径）；DEPLOYMENT.md 的 Level 2 / 不做 DB 拆分 / 先不做清单等冻结声明由主细则 C1 显式解除并回写。

## 范围边界

**纳入：** 登记册全量 triage 派发与净收缩；`apps/mcp` MCP server（stdio，读 + 草稿写 + 角色门控治理工具）；internal-client 韧性硬化（幂等重试/熔断/分级超时）；trace 跨 hop 透传；gateway 会话级限流；readiness/liveness 分离与依赖摘要契约；k8s 编排资产；amqp task transport 特性开关适配器；job-runtime 选择性数据库隔离试点；golden 回归与文档回写。

**不纳入：** TrapMap 服务本体实现 MCP 协议（MCP 仅经 apps/mcp 外层封装）；全量 database-per-service 拆分与跨服务事务/XA；broker 成为默认任务通道（pg 保持 transport of record）；Helm/服务网格/mTLS。

## 验证门禁

- **运行时语义不变是硬约束（检索行为升级除外）：** A1/A3/A5/A8/A11/A12 与 B 的协议封装层不改变现有运行时语义；行为升级只发生在显式声明的任务内（A4/A7/A10/B 工具面/C2-C8），需评审留痕并通过对应 focused tests。
- 每任务至少运行相关包 focused tests 与 `pnpm typecheck`。
- 跨包导入或边界变化必须运行 `pnpm exec fallow audit --base main`。
- 文档变化至少运行 `pnpm check:docs` 和 `pnpm check:structure`。
- 检索相关变更必跑 `pnpm eval:smoke`（离线部分；A14 负责完整补跑回填）。
- 新 HTTP 面必须走 RouteDef 工厂；新领域规则落 backend-core domain 层；禁止新增断言豁免。
- 两个人工门（A6 / C1）未获人类结论前对应后续任务不得开工。

## 验收边界

- 登记册净收缩：全部条目呈"已关闭（带证据）/ 刷新后 deferred"二态，无并行 tranche。
- `apps/mcp` 可用：10 个工具（读 3 + 写 3 + 治理 4）经 stdio 暴露，角色门控 deny-by-default，审计日志脱敏，文档映射表齐全。
- Level 3 落地：韧性硬化（重试/熔断/超时预算/限流/trace 透传）合入并有测试证据；k8s/base 资产就绪（集群验证环境门控留痕）；平台化五项决策冻结并回写 DEPLOYMENT/SERVICE-DISCOVERY/ENVIRONMENT。
- 全量 Completion Gates（见主细则文末）在主仓库全绿；主细则归档三件套完成。

## 长期债务与历史入口

- [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)：不构成第二条 active mainline。
- [已归档 Unity Assembly Center Phase 3](docs/archived/archived-plans/unified-assembly-center-phase3-archived.md)：assembly Phase 3 收敛已完成并归档（2026-08-16）。
- [已归档 Unity Assembly Center Phase 2](docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md)：assembly Phase 2 试点已完成并归档（2026-08-16）。
- [已归档 Unity Assembly Center Phase 1](docs/archived/archived-plans/unified-assembly-center-phase1-archived.md)：assembly Phase 1 地基已完成并归档（2026-08-16）。
- [Dead Code and Architecture Order Cleanup 主线](docs/todos/dead-code-and-architecture-order-cleanup.md)：更早上一主线，实现已提交 2026-08-16，closeout（Task 11-13）延后，见 open-debt 登记。
- [已归档 Documentation Validation and Observability Platform 主线](docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md)：更早完成主线的历史证据。
- [历史归档总表](docs/archived/README.md)。
