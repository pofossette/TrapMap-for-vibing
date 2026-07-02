# TrapMap 执行计划索引

根 `plan.md` 只做索引，不承载实现细节、代码示例或大段配置。所有任务拆解、依赖、验收标准、风险、代码与配置细节统一维护在 `docs/todos/` 下的活跃细则文档中。

## 当前主线

- 当前主线：服务发现与可观测性升级
- 状态：`进行中`
- 主细则：[`docs/todos/service-discovery-and-observability-plan.md`](docs/todos/service-discovery-and-observability-plan.md)
- 背景输入：[`docs/todos/microservice-architecture-and-observability.md`](docs/todos/microservice-architecture-and-observability.md)
- 活跃 debt register：[`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md)
- 历史主线归档：[`docs/archived/archived-plans/microservice-platform-evolution-plan.md`](docs/archived/archived-plans/microservice-platform-evolution-plan.md)

### 前置工作：六边形架构清理

- 状态：`完成`
- 目标：在引入服务发现与可观测性能力前，先清理架构边界、重复代码、依赖和模块耦合风险
- 细则：[`docs/todos/hexagonal-architecture-cleanup.md`](docs/todos/hexagonal-architecture-cleanup.md)
- 关键依赖：服务发现主线开始前，至少完成 Phase 0.1 架构边界配置

## 索引使用规则

- 根计划只维护阶段状态、总体要求、文档/测试回写要求，以及指向 `docs/todos/` 的相对路径链接
- 所有计划任务文档都必须包含用于追踪进度的复选框；阶段、任务、验收项至少有一层采用 `- [ ]` / `- [x]` 形式维护
- 新发现的问题、风险、deferred 事项，优先回写到主细则的问题池或 [`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md)
- 当前主线完成后，根计划只保留归档状态、deferred 落点与历史入口；执行细节归档到 `docs/archived/archived-plans/`

## 总体要求

### 架构与技术边界

- 服务发现采用 `Consul`
- 指标采用 `Prometheus`
- 追踪采用 `Tempo + OpenTelemetry`
- 日志采用 `Loki`
- 可视化采用 `Grafana`
- 共享契约、Schema、API shape 以 `packages/contracts/src/index.ts` 和 `packages/contracts/src/domain/` 为准
- LLM 结构化输出解析需要显式评估并记录是否以 LangChain `.withStructuredOutput()` 等成熟能力替换当前实现
- `packages/server/src/lib/runtime/resilience.ts` 的 `executeWithResilience` 需要显式评估并记录是否以成熟 resilience 库替换当前手搓实现

### 文档回写要求

- [ ] 任何 API surface、运行时默认值、健康检查、部署行为变化，先更新对应权威事实页，再更新 `docs/architecture/*`、`docs/operations/*`、`docs/guides/*`
- [ ] 新增或修改启动命令、测试命令、评测命令、目录落点或工程约束时，同步更新 `README.md`、`AGENTS.md`、`docs/README.md` 的相关入口
- [ ] 若服务发现/可观测性主线涉及 LLM 结构化输出或 resilience 能力替换判断，同步回写对应替换结论、适用边界、暂缓原因与后续条件
- [ ] 真实且可能复发的问题，需要判断是否沉淀到测试、文档规则、Skill、badcase 或 debt register；如果不沉淀，需要在变更说明中写明原因
- [ ] 若同类文档漂移可能复发，优先补 `rtk pnpm check:docs-drift`、`rtk pnpm check:structure` 或 truth smoke，而不是只补说明文字

### 测试与验证要求

- [ ] 修改后优先运行与改动直接相关的最小验证集合，不默认跑根级全量 `pnpm test`
- [ ] 涉及 runtime/profile/route surface、部署默认值、健康检查或服务发现链路时，补跑对应 smoke，例如 `rtk pnpm test:deployment-smoke`、`rtk pnpm test:runtime-foundations`
- [ ] 涉及检索、摘要、治理、feedback、fixtures、eval runner 的改动，至少补跑 `rtk pnpm eval:smoke`
- [ ] 文档、入口、结构规则变更完成后，至少补跑 `rtk pnpm check:docs-drift` 和 `rtk pnpm check:structure`
- [ ] 涉及跨包导入路径变更或新增包时，补跑 `rtk pnpm exec fallow audit --base main`

## 阶段索引与进度

### Phase -1 六边形架构清理（前置工作）

- [x] 状态：`完成`
- [x] 细则：[`docs/todos/hexagonal-architecture-cleanup.md`](docs/todos/hexagonal-architecture-cleanup.md)
- [x] 验收摘要：循环依赖 `4 -> 0`，边界违规 `0`，重复率显著下降，CI 门禁已接入

### Phase 0 基础架构设计

- [x] 状态：`完成`
- [x] 细则：[`docs/todos/service-discovery-and-observability-plan.md#2-phase-0-基础架构设计`](docs/todos/service-discovery-and-observability-plan.md#2-phase-0-基础架构设计)
- [x] 目标：明确技术选型、运行模式矩阵、最小可交付面、降级策略与本地基础设施拓扑
- [x] 产出物：架构文档、技术选型文档、`docker-compose.observability.yml` 与配套 `config/`

### Phase 1A 应用接入骨架

- [x] 状态：`完成`
- [x] 细则：[`docs/todos/service-discovery-and-observability-plan.md#3-phase-1a-应用接入骨架`](docs/todos/service-discovery-and-observability-plan.md#3-phase-1a-应用接入骨架)
- [x] 目标：先稳定 Nest bootstrap、配置模型、健康检查语义和统一 discovery/telemetry 接口

### Phase 1B 服务发现 MVP

- [ ] 状态：`待开始`
- [ ] 细则：[`docs/todos/service-discovery-and-observability-plan.md#4-phase-1b-服务发现-mvp`](docs/todos/service-discovery-and-observability-plan.md#4-phase-1b-服务发现-mvp)
- [ ] 目标：打通服务注册、注销、查询、缓存、故障降级

### Phase 2A Metrics 与 Dashboard MVP

- [ ] 状态：`待开始`
- [ ] 细则：[`docs/todos/service-discovery-and-observability-plan.md#5-phase-2a-metrics-与-dashboard-mvp`](docs/todos/service-discovery-and-observability-plan.md#5-phase-2a-metrics-与-dashboard-mvp)
- [ ] 目标：先交付最早产生运维价值的指标链路

### Phase 2B Tracing MVP

- [ ] 状态：`待开始`
- [ ] 细则：[`docs/todos/service-discovery-and-observability-plan.md#6-phase-2b-tracing-mvp`](docs/todos/service-discovery-and-observability-plan.md#6-phase-2b-tracing-mvp)
- [ ] 目标：打通请求级 trace、trace id 透传和 Tempo 查询入口

### Phase 2C Logging MVP

- [ ] 状态：`待开始`
- [ ] 细则：[`docs/todos/service-discovery-and-observability-plan.md#7-phase-2c-logging-mvp`](docs/todos/service-discovery-and-observability-plan.md#7-phase-2c-logging-mvp)
- [ ] 目标：统一结构化日志 schema 与 Loki 查询入口

### Phase 3 生产化增强

- [ ] 状态：`待开始`
- [ ] 细则：[`docs/todos/service-discovery-and-observability-plan.md#8-phase-3-生产化增强`](docs/todos/service-discovery-and-observability-plan.md#8-phase-3-生产化增强)
- [ ] 目标：补齐采样、标签基数控制、资源限制、告警和成熟库替换评估

### Phase 4 跨阶段回归与基准

- [ ] 状态：`待开始`
- [ ] 细则：[`docs/todos/service-discovery-and-observability-plan.md#9-phase-4-跨阶段回归与基准`](docs/todos/service-discovery-and-observability-plan.md#9-phase-4-跨阶段回归与基准)
- [ ] 目标：统一 E2E、故障注入、性能基准与部署 smoke

### Phase 5 文档与交付收口

- [ ] 状态：`待开始`
- [ ] 细则：[`docs/todos/service-discovery-and-observability-plan.md#10-phase-5-文档与交付收口`](docs/todos/service-discovery-and-observability-plan.md#10-phase-5-文档与交付收口)
- [ ] 目标：收口架构、运行、运维、故障排查和演示材料

## 活跃配套文档

- 主细则：[`docs/todos/service-discovery-and-observability-plan.md`](docs/todos/service-discovery-and-observability-plan.md)
- 六边形架构清理：[`docs/todos/hexagonal-architecture-cleanup.md`](docs/todos/hexagonal-architecture-cleanup.md)
- 静态分析审计：[`docs/todos/static-analysis-audit-2026-06-29.md`](docs/todos/static-analysis-audit-2026-06-29.md)
- 成熟库替换相关细则：[`docs/todos/nestjs-langchain-debt-cleanup.md`](docs/todos/nestjs-langchain-debt-cleanup.md)
- 相关残余任务：[`docs/todos/nestjs-service-evolution-residual-tasks.md`](docs/todos/nestjs-service-evolution-residual-tasks.md)

## Deferred 与后续入口

- Kubernetes / Ingress / Service Mesh 平台化
- 多集群服务发现（Consul Federation）
- 高可用 Consul 集群
- 商业级告警集成（PagerDuty、OpsGenie）
- 实时日志流与高级运维能力

上述 deferred 若转为新主线，应在 `docs/todos/` 新建对应细则，再由根 `plan.md` 追加索引入口。
