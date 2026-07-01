# TrapMap 执行计划索引

根 `plan.md` 只做索引，不承载实现细节、代码示例或大段配置。所有任务拆解、验收标准、风险、代码与配置细节统一维护在 `docs/todos/` 下的活跃细则文档中。

## 当前主线

- 当前主线：微服务平台能力增强
- 状态：`完成`
- 主线：已归档
- 历史入口：[`docs/archived/archived-plans/microservice-platform-evolution-plan.md`](docs/archived/archived-plans/microservice-platform-evolution-plan.md)
- 当前活跃细则：[`docs/todos/service-discovery-and-observability-plan.md`](docs/todos/service-discovery-and-observability-plan.md)

### 前置工作：六边形架构清理

- 状态：`计划中`
- 目标：在引入服务发现之前，解决六边形架构的技术债和质量缺陷（架构边界、代码重复、依赖管理、模块大小等）
- 细则：[`docs/todos/hexagonal-architecture-cleanup.md`](docs/todos/hexagonal-architecture-cleanup.md)
- 时间线：7 周（Week 1-7）
- 依赖：必须在服务发现主线 Phase 1 之前完成 Phase 0.1（边界配置）

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
- [ ] 六边形架构清理计划涉及的架构边界规则、测试编写指南、模块结构文档、质量门禁使用指南，完成后需同步更新 `docs/architecture/*`、`docs/guides/*`、`AGENTS.md`

### 测试与验证要求

- [ ] 修改后优先运行与改动直接相关的最小验证集合，不默认跑根级全量 `pnpm test`
- [ ] 涉及检索、摘要、治理、feedback、fixtures、eval runner 的改动，至少补跑 `rtk pnpm eval:smoke`
- [ ] 涉及 runtime/profile/route surface、部署默认值、健康检查或服务发现链路时，补跑对应 smoke，例如 `rtk pnpm test:deployment-smoke`、`rtk pnpm test:runtime-foundations`
- [ ] 文档、入口、结构规则变更完成后，至少补跑 `rtk pnpm check:docs-drift` 和 `rtk pnpm check:structure`
- [ ] 六边形架构清理涉及的代码变更（Phase 0.1-0.7），需补跑 `fallow audit --base main` 验证不引入新违规

## 阶段索引与进度

### Phase -1 六边形架构清理（前置工作）

- 状态：`进行中`
- 目标：解决六边形架构的技术债和质量缺陷（架构边界、代码重复、依赖管理、模块大小、死代码）
- 细则：[`docs/todos/hexagonal-architecture-cleanup.md`](docs/todos/hexagonal-architecture-cleanup.md)
- 时间线：Week 1-7
- 子阶段：
  - Phase 0.1：架构边界配置（Week 1）— `完成`
  - Phase 0.2：依赖清理（Week 1-2）— `完成`
  - Phase 0.3：测试代码去重（Week 2-3）— `完成`
  - Phase 0.4：模块大小拆分（Week 3-4）— `进行中`（P0+P1 完成，P2 待续）
  - Phase 0.5：死代码清理（Week 4-5）— `完成`
  - Phase 0.6：耦合度优化（Week 5-6）— `计划中`
  - Phase 0.7：架构边界验证自动化（Week 6-7）— `进行中`（CI+pre-commit 已集成）
- 验收标准：
  - [x] 健康评分从 70.3 提升到 75.9（目标 85+，持续优化中）
  - [x] 架构边界违规降至 0（11 zones 配置，0 违规）
  - [ ] 代码重复率降低 50%+
  - [x] CI 门禁已集成（fallow audit + boundary check + unused-deps check）
- 文档更新：补齐 fallow 配置说明、架构边界规则、测试编写指南、质量门禁使用指南
- 测试更新：每个子阶段完成后运行 `fallow audit --base main` 和受影响包的最小测试

### Phase 0 基础架构设计（服务发现）

- [ ] 完成阶段目标与验收
- [ ] 细则文档：[`docs/todos/service-discovery-and-observability-plan.md#2-阶段-0基础架构设计`](docs/todos/service-discovery-and-observability-plan.md#2-阶段-0基础架构设计)
- [ ] 文档更新：补齐可观测性/服务发现架构说明、部署概览入口、相关 Mermaid 图和技术选型理由
- [ ] 测试更新：如新增文档规则或结构约束，补跑 `rtk pnpm check:docs-drift`、`rtk pnpm check:structure`
- [ ] 前置依赖：Phase -1 的 Phase 0.1（架构边界配置）必须完成

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
- 六边形架构清理（前置工作）：[`docs/todos/hexagonal-architecture-cleanup.md`](docs/todos/hexagonal-architecture-cleanup.md)
- 静态分析审计：[`docs/todos/static-analysis-audit-2026-06-29.md`](docs/todos/static-analysis-audit-2026-06-29.md)
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
