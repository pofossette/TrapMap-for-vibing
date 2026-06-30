# TrapMap 执行计划索引

根 `plan.md` 只做索引，不承载实现细节、代码示例或大段配置。所有任务拆解、验收标准、风险、代码与配置细节统一维护在 `docs/todos/` 下的活跃细则文档中。

## 当前主线

- 状态：`进行中`
- 主线：服务发现和可观测性升级
- 目标：为 TrapMap 引入完整的服务发现机制和可观测性三大支柱（追踪、指标、日志），并同步纳入两类成熟能力替换方向：LLM 结构化输出解析优先评估以 LangChain 结构化输出能力替换、自研 `executeWithResilience` 优先评估以成熟 resilience 库替换；同时补齐运行时、测试、部署与文档闭环
- 主细则：[`docs/todos/service-discovery-and-observability-plan.md`](docs/todos/service-discovery-and-observability-plan.md)

## 索引使用规则

- 更新根计划时，只维护阶段状态、总体要求、文档/测试回写要求、以及指向 `docs/todos/` 的相对路径链接
- 新发现的问题、风险、deferred 事项，优先回写到主细则的问题池或 [`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md)
- 若当前主线完成，根计划只保留归档状态、deferred 落点与历史入口；执行细节归档到 `docs/archived/archived-plans/`

## 总体要求

### 架构与技术边界

- 服务发现采用 `Consul`
- 指标采用 `Prometheus`
- 追踪采用 `Tempo + OpenTelemetry`
- 日志采用 `Loki`
- 可视化采用 `Grafana`
- LLM 结构化输出解析需要显式评估并记录是否以 LangChain `.withStructuredOutput()` 等成熟能力替换当前实现
- `packages/server/src/lib/runtime/resilience.ts` 的 `executeWithResilience` 需要显式评估并记录是否以成熟 resilience 库替换当前手搓实现
- 共享契约、Schema、API shape 以 `packages/contracts/src/index.ts` 和 `packages/contracts/src/domain/` 为准

### 文档回写要求

- [ ] 任何 API surface、运行时默认值、健康检查、部署行为变化，先更新对应权威事实页，再更新 `docs/architecture/*`、`docs/operations/*`、`docs/guides/*`
- [ ] 新增或修改启动命令、测试命令、评测命令、目录落点或工程约束时，同步更新 `README.md`、`AGENTS.md`、`docs/README.md` 的相关入口
- [ ] 若服务发现/可观测性主线涉及 LLM 结构化输出或 resilience 能力替换判断，同步回写对应替换结论、适用边界、暂缓原因与后续条件，避免根计划与技术债文档分叉
- [ ] 真实且可能复发的问题，需要判断是否沉淀到测试、文档规则、Skill、badcase 或 debt register；如果不沉淀，需要在变更说明中写明原因
- [ ] 若同类文档漂移可能复发，优先补 `pnpm check:docs-drift`、`pnpm check:structure` 或 truth smoke，而不是只补说明文字

### 测试与验证要求

- [ ] 修改后优先运行与改动直接相关的最小验证集合，不默认跑根级全量 `pnpm test`
- [ ] 涉及检索、摘要、治理、feedback、fixtures、eval runner 的改动，至少补跑 `rtk pnpm eval:smoke`
- [ ] 涉及 runtime/profile/route surface、部署默认值、健康检查或服务发现链路时，补跑对应 smoke，例如 `rtk pnpm test:deployment-smoke`、`rtk pnpm test:runtime-foundations`
- [ ] 文档、入口、结构规则变更完成后，至少补跑 `rtk pnpm check:docs-drift` 和 `rtk pnpm check:structure`

## 阶段索引与进度

### Phase 0 基础架构设计

- [ ] 完成阶段目标与验收
- [ ] 细则文档：[`docs/todos/service-discovery-and-observability-plan.md#2-阶段-0基础架构设计`](docs/todos/service-discovery-and-observability-plan.md#2-阶段-0基础架构设计)
- [ ] 文档更新：补齐可观测性/服务发现架构说明、部署概览入口、相关 Mermaid 图和技术选型理由
- [ ] 测试更新：如新增文档规则或结构约束，补跑 `rtk pnpm check:docs-drift`、`rtk pnpm check:structure`

### Phase 1 服务发现集成

- [ ] 完成阶段目标与验收
- [ ] 细则文档：[`docs/todos/service-discovery-and-observability-plan.md#3-阶段-1服务发现集成consul`](docs/todos/service-discovery-and-observability-plan.md#3-阶段-1服务发现集成consul)
- [ ] 文档更新：同步服务发现接入方式、部署配置、故障排查与使用指南
- [ ] 测试更新：补齐 Consul 相关单测/集成测试，并按改动范围补跑 `rtk pnpm test:deployment-smoke` 或受影响包最小测试

### Phase 2 可观测性三大支柱

- [ ] 完成阶段目标与验收
- [ ] 细则文档：[`docs/todos/service-discovery-and-observability-plan.md#4-阶段-2可观测性三大支柱`](docs/todos/service-discovery-and-observability-plan.md#4-阶段-2可观测性三大支柱)
- [ ] 文档更新：同步指标、追踪、日志三条链路的架构说明、运行方式、仪表板或查询入口
- [ ] 测试更新：补齐 Prometheus、Tempo、Loki 相关单测/集成测试，并按改动范围补跑部署或 runtime smoke

### Phase 3 Nest.js 深度集成

- [ ] 完成阶段目标与验收
- [ ] 细则文档：[`docs/todos/service-discovery-and-observability-plan.md#5-阶段-3nestjs-深度集成`](docs/todos/service-discovery-and-observability-plan.md#5-阶段-3nestjs-深度集成)
- [ ] 文档更新：同步模块边界、配置管理、健康检查端点、容错机制与运行时默认值，并记录 LLM 结构化输出解析 / `executeWithResilience` 是否进入成熟库替换
- [ ] 测试更新：补齐模块级单测、配置回滚测试、健康检查测试、容错链路测试；若触及 LangChain 结构化输出或 resilience 替换，补跑对应 AI/runtime 最小验证与 `rtk pnpm test:runtime-foundations`

### Phase 4 测试与验证

- [ ] 完成阶段目标与验收
- [ ] 细则文档：[`docs/todos/service-discovery-and-observability-plan.md#6-阶段-4测试和验证`](docs/todos/service-discovery-and-observability-plan.md#6-阶段-4测试和验证)
- [ ] 文档更新：同步测试入口、测试范围、真实环境依赖、性能基准与验收结论
- [ ] 测试更新：补齐单元、集成、端到端、性能、部署验证清单，并沉淀为可重复执行的最小验证命令

### Phase 5 文档与交付

- [ ] 完成阶段目标与验收
- [ ] 细则文档：[`docs/todos/service-discovery-and-observability-plan.md#7-阶段-5文档和交付`](docs/todos/service-discovery-and-observability-plan.md#7-阶段-5文档和交付)
- [ ] 文档更新：收口架构、指南、部署、运维、演示材料，并确认索引入口完整
- [ ] 测试更新：对最终文档和入口变更补跑 `rtk pnpm check:docs-drift`、`rtk pnpm check:structure`，对交付链路补跑对应 smoke

## 活跃配套文档

- 主细则：[`docs/todos/service-discovery-and-observability-plan.md`](docs/todos/service-discovery-and-observability-plan.md)
- 活跃 debt register：[`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md)
- 背景输入：[`docs/todos/microservice-architecture-and-observability.md`](docs/todos/microservice-architecture-and-observability.md)
- 成熟库替换相关活跃细则：[`docs/todos/nestjs-langchain-debt-cleanup.md`](docs/todos/nestjs-langchain-debt-cleanup.md)
- 相关残余任务：[`docs/todos/nestjs-service-evolution-residual-tasks.md`](docs/todos/nestjs-service-evolution-residual-tasks.md)

## Deferred 与后续入口

- Kubernetes / Ingress / Service Mesh 平台化
- 多集群服务发现（Consul Federation）
- 高可用 Consul 集群
- 商业级告警集成（PagerDuty、OpsGenie）
- 实时日志流与高级运维能力

上述 deferred 若转为新主线，应在 `docs/todos/` 新建对应细则，再由根 `plan.md` 追加索引入口。
