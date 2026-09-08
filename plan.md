# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线索引和状态页；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在由本页显式链接的 active detail 中。

## 计划使用方式

- 根索引只允许链接一个 active mainline；当前主线的任务顺序、owner、证据和回写记录以主细则为准。
- 主细则中的复选框只有在代码或文档变更、focused test、事实守卫和必要的 closeout 都有证据后才能勾选；根索引不复制这些复选框。
- 新发现的问题先进入主细则的问题池或 [长期债务登记册](docs/todos/open-debt-and-compromises.md)，不得因为“仍有参考价值”而创建第二条并行主线。
- 主线范围、入口或验收边界发生变化时，先更新主细则，再同步本索引；所有阶段完成并留存证据后才归档主细则。
- 长期执行原则保持不变：运行时语义不变是硬约束（检索行为升级除外）。

## 当前主线

- **暂无 active mainline（2026-09-08 收口）：** 依赖升级与 AI SDK 统一已完成 closeout 并归档，见 `docs/archived/archived-plans/ai-sdk-and-deps-upgrade-mainline-archived.md（已归档，路径冻结）`。新工作须先建 active 细则并由本索引显式链接，不得直接复用归档文档。

## 已排队（按顺序，非 active）

- **CLI 真实服务对接测试 Phase 5.3 归档：** Phase 0-4 + Phase 5.1-5.2 已勾，仅剩归档（`git mv` + 索引更新）；细则见 [cli-server-integration-mainline.md](docs/todos/cli-server-integration-mainline.md)。
- **Web Panel 功能补全与 UI 美化：** Phase2 路由覆盖已闭环，仅剩 audit 断言（已转长期债务）；恢复执行需 owner 另行确认；细则见 [web-panel-feature-and-ui-optimization.md](docs/todos/web-panel-feature-and-ui-optimization.md)。
- **Gene 检索评测扩展（spec）：** [gene-retrieval-eval.md](docs/todos/gene-retrieval-eval.md) 为 T0-T6 任务规格，代码实现尚未 dispatch；进入执行需按 subagent-driven 顺序并由本索引显式链接。

## 下一候选

- `open-debt-and-compromises.md` 6 项（`security advisory` / `gateway parity` 等）待主线 closeout 后按阈值漂移评估选取；`go-accelerator` 深化已由 CLI 主线 C 产物覆盖。

## 历史主线与入口

- **依赖升级与 AI SDK 统一已完成并归档（2026-09-08）：** TS pin 6.0.3 + Biome 2 / Nest 12 + langchain 移除 + AI SDK 统一（`packages/ai-providers/src/adapters/aisdk.ts` 唯一接入面），`outdated` 57→仅 TS 一项（有意 pin），compose closeout EXIT 0（6247ms），`check:asserts` 0；残留 Responses-API 传输与 light 镜像验证已转长期债务。见 `docs/archived/archived-plans/ai-sdk-and-deps-upgrade-mainline-archived.md（已归档，路径冻结）`。

- **Web Panel 功能补全与 UI 美化优化 main 侧曾于 2026-09-02 归档：** Phase 0-4 39/39（7-route baseline 18 images + Phase2 runtime-overview + json-edits 双宿主），`check:docs/structure/complexity` green，见 `docs/archived/archived-plans/web-panel-feature-and-ui-optimization-archived.md（已归档，路径冻结）`。注：pre 侧 2026-09-03 曾恢复为 active，2026-09-06 已收口为排队项（见上）。
- **Go 计算中枢深化已完成并归档（2026-09-02）：** P0 `generate:contracts:check` 22 schemas + `go vet/test` ok，见 `docs/archived/archived-plans/go-compute-hub-mainline-archived.md（已归档，路径冻结）`。
- **跨语言类型对齐已完成并归档（2026-09-02）：** P0 `Zod→JSON Schema→Go` 22 schemas sync，见 `docs/archived/archived-plans/type-alignment-mainline-archived.md（已归档，路径冻结）`。
- **Experience Gene Infrastructure and Pipeline 已完成并归档（2026-09-03）：** 5 阶段串行（infra → contracts/storage → derivation → retrieval/activation → governance/evaluation/rollout）全部完成，deterministic offline precision 1.0 / promotionEligible true，20-Gene 治理抽样与 rollback 验证均绿，架构已标注两篇论文灵感。归档见 `docs/archived/archived-plans/experience-gene-program-mainline-archived.md（已归档，路径冻结）` 及其 5 个 delegated phase 归档，验证命令见主细则 `Execution record` 与第四检查点。
- **Skill Lookup 契约漂移修复已完成并归档（2026-08-22）：** 集成验证与 deferred 问题处置记录见 `docs/archived/archived-plans/skill-lookup-surface-mainline-archived.md（已归档，路径冻结）`。
- **债务全量派发 + Agent MCP 接入 + 微服务平台化已完成并归档（2026-08-22）：** 见 `docs/archived/README.md（已归档，路径冻结）` 中 `debt-mcp-platformization-mainline-archived.md` 行；残余项以长期登记册为准。
- **判断类节点契约（D8）收编已完成并归档（2026-08-16）：** 细则见 `docs/archived/archived-plans/judgment-node-contracts-d8-archived.md（已归档，路径冻结）`；llm/hybrid 生产变体收编保留在 [长期债务登记册](docs/todos/open-debt-and-compromises.md)。
- **Unity Assembly Center Phase 4 收尾已完成并归档（2026-08-16）：** 细则见 `docs/archived/archived-plans/unified-assembly-center-phase4-archived.md（已归档，路径冻结）`。
- **Unity Assembly Center Phase 3 收敛已完成并归档（2026-08-16）：** 细则见 `docs/archived/archived-plans/unified-assembly-center-phase3-archived.md（已归档，路径冻结）`。
- **Unity Assembly Center Phase 2 试点已完成并归档（2026-08-16）：** 细则见 `docs/archived/archived-plans/unified-assembly-center-phase2-pilot-archived.md（已归档，路径冻结）`。
- **Unity Assembly Center Phase 1 地基已完成并归档（2026-08-16）：** 细则见 `docs/archived/archived-plans/unified-assembly-center-phase1-archived.md（已归档，路径冻结）`。
- **Documentation Validation and Observability Platform 已完成并归档：** 历史证据见 `docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md（已归档，路径冻结）`。
- **Dead Code and Architecture Order Cleanup 实现已提交（2026-08-16）：** 挂起的历史实现细节见 `docs/archived/archived-plans/dead-code-and-architecture-order-cleanup-archived.md（已归档，路径冻结）`；Task 11-13 closeout 与归档延后，登记在 [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)。
- 更多历史材料见 `docs/archived/README.md（已归档，路径冻结）`。
