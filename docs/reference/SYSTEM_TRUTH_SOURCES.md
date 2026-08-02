# 系统权威事实源

每个架构事实都有一个权威来源。当 secondary docs 发生漂移时，以权威来源为准。

| 主题 | 权威来源 | Secondary Docs |
|---|---|---|
| ~~Server compatibility-shell 入口~~ | **已删除**（Wave-10，`packages/server` 已退役）。历史证据见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md` | — |
| Light 默认宿主入口（冻结主线） | `plan.md` + `docs/archived/archived-plans/backend-build-targets-plan.md` + `packages/host-local/src/index.ts` + `packages/host-local/src/nest/app.module.ts` + `packages/host-local/src/nest/*/*.module.ts`（六个有界上下文模块）+ `packages/host-local/src/nest/main.ts` + `packages/host-local/package.json` | `README.md`、`docs/README.md`、`docs/architecture/DEPLOYMENT.md`、`docs/PACKAGES.md` |
| 启动序列 | `packages/host-local/src/nest/main.ts`（light 宿主）+ `packages/host-distributed/src/`（distributed 宿主） | `docs/architecture/ARCHITECTURE.md`、`docs/guides/CODE_GUIDE.md` |
| ~~Server 层归属~~ | **已删除**（Wave-10）。历史分层见 `docs/plans/backend-engineering-masterplan/01-boundaries-and-compat-convergence.md`。当前归属见六服务边界 | — |
| 持久化迁移状态 | `docs/reference/DATA_MODEL.md` | `docs/PACKAGES.md`、`docs/architecture/ARCHITECTURE.md` |
| 数据库 schema | `packages/persistence-schema/src/`（owner-local schema 模块）+ 各 `packages/service-*/src/schema.ts` | `docs/reference/DATABASE_SCHEMA.md` |
| ~~Server 数据访问边界~~ | **已删除**（Wave-10）。当前数据访问由各 service owner ports 管理 | — |
| ~~Server 有界上下文与层归属~~ | **已删除**（Wave-10）。当前归属见六服务边界 | — |
| 六服务归属边界（`identity-access` / `candidate-ingestion` / `knowledge-write` / `governance-review` [`backend-core` 描述符简称：`review`] / `knowledge-read` / `job-runtime`） | `packages/backend-core/src/ports/internal-ports.ts` + `packages/backend-core/src/<context>/{application/module.ts,index.ts}`（六个上下文目录：`identity-access/`、`knowledge-read/`、`knowledge-write/`、`candidate-ingestion/`、`governance-review/`、`job-runtime/`）+ `packages/host-distributed/src/config/service-config.ts` + `packages/service-*/src/index.ts` | `docs/architecture/ARCHITECTURE.md`、`packages/backend-core/README.md`、`packages/host-distributed/README.md` |
| `backend-core` / `host-*` 归属关系 | `docs/plans/backend-engineering-masterplan/01-boundaries-and-compat-convergence.md` + `packages/backend-core/src/use-cases/command-handling.ts` + `packages/host-local/src/nest/app.module.ts` + `packages/host-distributed/src/shared/ports.ts` | `docs/architecture/ARCHITECTURE.md`、`docs/plans/runtime-recomposition/`、`docs/plans/deployment-flexibility/` |
| Phase 1 server/backend-core 边界冻结 | `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md` + `packages/backend-core/src/ports/internal-ports.ts` + 各 `packages/service-*/src/migrations.ts`（`packages/server` 已删除，历史证据见归档计划） | `docs/PACKAGES.md`、`docs/reference/REPO_STRUCTURE.md` |
| Phase 2 store-snapshot / PG-first 姿态冻结 | `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md` + `docs/reference/DATA_MODEL.md`（`packages/server` 已删除，`store_snapshot`/`JsonStore`/`PostgresStore` 已退役） | `docs/PACKAGES.md`、`docs/architecture/components/PERSISTENCE.md` |
| Phase 3 统一适配器边界冻结 | `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md` + `packages/backend-core/src/ports/internal-ports.ts` + `packages/host-local/src/nest/adapters/adapter-factory.ts` + `packages/host-local/src/nest/adapters/remote.adapter.ts` + `packages/host-local/src/nest/runtime/shared-infra.ts` + `packages/host-distributed/src/gateway/internal-client.ts` + `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` | `docs/PACKAGES.md`、`docs/reference/REPO_STRUCTURE.md`、`docs/operations/TESTING.md`、`packages/host-local/README.md`、`packages/host-distributed/README.md`、`docs/architecture/ARCHITECTURE.md` |
| Phase 4 适配器环境 / 目标裁剪冻结 | `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md` + `packages/host-local/src/nest/config/config.ts` + `packages/host-distributed/src/config/service-config.ts`（packages/server/src/config.ts 已删除） | `docs/PACKAGES.md`、`docs/operations/ENVIRONMENT.md`、`docs/architecture/DEPLOYMENT.md` |
| Phase 5 分布式基线 / 运行时隔离冻结 | `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md` + `docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md` + `packages/host-distributed/README.md` + `docker-compose.yml` + `packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts` | `docs/PACKAGES.md`、`docs/architecture/DEPLOYMENT.md`、`docs/operations/TESTING.md`、`README.md`、`docs/README.md` |
| Phase 6 成熟能力 / 库替换冻结 | `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md` + `packages/host-distributed/src/gateway/internal-client.ts` + `packages/host-distributed/src/config/service-config.ts`（`packages/server` runtime/metrics/cache/config 已删除） | `docs/PACKAGES.md`、`docs/operations/ENVIRONMENT.md`、`docs/architecture/DEPLOYMENT.md` |
| Phase 7 可维护性 / CI 测试事实 / 文档 closeout 冻结 | `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md` + `.github/workflows/ci.yml` + `package.json` + `scripts/complexity-budgets.json` + `scripts/check-doc-drift.ts` + `scripts/check-structure.mjs` + `scripts/check-arch-freeze.ts` | `docs/README.md`、`docs/todos/README.md`、`docs/archived/README.md`、`docs/operations/TESTING.md`、`docs/operations/CI_CD.md`、`docs/reference/REPO_STRUCTURE.md` |
| Nest 服务演进 Phase 0 目标架构冻结 | `plan.md` + `docs/archived/archived-plans/nestjs-service-evolution-00-target-architecture.md` + `packages/backend-core/src/runtime/capability-model.ts` + `packages/backend-core/src/ports/internal-ports.ts` + `packages/contracts/src/domain/async.ts` | `README.md`、`architecture.md`、`docs/README.md`、`docs/PACKAGES.md`、`docs/architecture/ARCHITECTURE.md` |
| Nest 服务演进 Phase 1 宿主与契约基础冻结 | `plan.md` + `docs/archived/archived-plans/nestjs-service-evolution-01-host-and-contract-foundation-archived.md` + `packages/backend-core/src/invocation/invocation-model.ts` + `packages/service-knowledge-read/src/routes.ts` + `packages/service-knowledge-read/src/deps.ts` + `packages/host-distributed/src/gateway/internal-client.ts` + `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` + `docs/PACKAGE_STACK_RATIONALE.md` | `README.md`、`docs/README.md`、`docs/PACKAGES.md`、`docs/architecture/ARCHITECTURE.md`、`docs/architecture/DEPLOYMENT.md`、`docs/reference/api-surface.md` |
| Nest 服务演进 Phase 2 模块化单体边界冻结 | `plan.md` + `docs/archived/archived-plans/nestjs-service-evolution-02-modular-monolith-cutover-archived.md` + `packages/backend-core/src/<context>/{domain,application,module.ts,index.ts}`（六个上下文目录）+ `packages/host-local/src/nest/app.module.ts` + `packages/host-local/src/nest/*/*.module.ts`（六个有界上下文 Nest 模块）+ `packages/service-*/src/deps.ts` | `docs/README.md`、`docs/PACKAGES.md`、`docs/architecture/ARCHITECTURE.md`、`docs/reference/REPO_STRUCTURE.md`、package README |
| Nest 服务演进 Phase 4 归属矩阵 / 迁移窗口 / closeout 冻结 | `plan.md` + `docs/archived/archived-plans/nestjs-service-evolution-04-data-runtime-and-cutover-archived.md` + `packages/service-knowledge-write/README.md` + `packages/service-governance-review/README.md` + `docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md` | `README.md`、`docs/README.md`、`docs/PACKAGES.md`、`docs/operations/TESTING.md`、`docs/reference/REPO_STRUCTURE.md`、`docs/architecture/DEPLOYMENT.md` |
| 分布式成熟度基线（`Level 2 / transitional-microservice`） | `docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md` + `packages/host-distributed/src/gateway/distributed-acceptance.test.ts` + `packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts` + `packages/host-distributed/src/shared/database.ts` | `plan.md`、`README.md`、`docs/README.md`、`docs/PACKAGES.md`、`docs/architecture/DEPLOYMENT.md` |
| 后端构建目标映射、host ownership 与 root target commands（`light` / `heavy`） | `packages/contracts/src/enum-types/backend-target.ts`（profile-to-target contract）+ `scripts/backend-target-registry.ts`（registry owner）+ `scripts/run-dev.ts` + `scripts/run-backend-target.ts` + `package.json`（`build:light`、`build:heavy`、`test:light-target`、`test:heavy-target`） | `README.md`、`docs/architecture/CLI.md`、`docs/operations/TESTING.md`、`docs/operations/ENVIRONMENT.md`、package README |
| 持久化姿态 | `README.md` + `packages/persistence-schema/src/*.ts` + 各 `packages/service-*/src/schema.ts` | `docs/README.md`、`docs/guides/GETTING_STARTED.md`、`docs/architecture/DEPLOYMENT.md` |
| CI 任务 | `.github/workflows/ci.yml` | `docs/operations/CI_CD.md`、`docs/operations/TESTING.md` |
| Schema 数量 | `packages/persistence-schema/src/*.ts` + 各 `packages/service-*/src/schema.ts` | `docs/reference/DATABASE_SCHEMA.md`、`docs/README.md` |
| 护栏命令 | `scripts/complexity-budgets.json` + `.github/workflows/ci.yml` | `docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/operations/TESTING.md`、`docs/operations/CI_CD.md` |
| 启动命令 | `package.json` scripts 部分 + `scripts/run-dev.ts` | `docs/README.md`、`docs/guides/GETTING_STARTED.md`、`docs/guides/MIGRATION_GUIDE.md` |
| 评估入口 | `package.json` scripts 部分 + `scripts/run-eval.ts` | `docs/operations/TESTING.md`、`docs/operations/CI_CD.md` |
| 部署默认值 | `docker-compose.yml` + `packages/host-local/Dockerfile` + `packages/host-distributed/Dockerfile` | `docs/architecture/DEPLOYMENT.md`、`docs/README.md` |
| 部署配置术语表与兼容性边界 | `plan.md` + `packages/backend-core/src/runtime/capability-model.ts` + `packages/host-local/src/nest/config/config.ts` + `packages/host-distributed/src/config/service-config.ts` | `docs/PACKAGES.md`、`docs/architecture/DEPLOYMENT.md`、`docs/guides/MIGRATION_GUIDE.md` |
| 分布式宿主服务默认值与服务发现解析器 seam | `packages/host-distributed/src/config/service-config.ts` + `docker-compose.yml` | `docs/guides/MIGRATION_GUIDE.md`、`packages/host-distributed/README.md`、`docs/operations/ENVIRONMENT.md`、`docs/architecture/DEPLOYMENT.md` |
| 分布式宿主 DB 连接池预算环境 seam | `packages/host-distributed/src/config/service-config.ts` + `packages/host-distributed/src/shared/database.ts` | `packages/host-distributed/README.md`、`docs/operations/ENVIRONMENT.md`、`docs/architecture/DEPLOYMENT.md` |
| 分布式宿主 knowledge-write 传输 seam / Phase 2 RPC 试点 | `packages/host-distributed/src/config/service-config.ts` + `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` + `packages/host-distributed/src/governance-review/ports.ts` + `packages/host-distributed/src/candidate-ingestion/server.ts` + `packages/service-knowledge-write/src/routes.ts` | `docs/architecture/TARGET_ARCHITECTURE.md`、`docs/architecture/SERVICE_BOUNDARIES.md`、`docs/operations/ENVIRONMENT.md`、`packages/host-distributed/README.md` |
| 客户端后端目标配置（`backendTarget`） | `packages/contracts/src/enum-types/backend-target.ts`（`BackendTarget`、schema、normalization）+ `packages/cli/src/lib/config.ts`（当前持久化 consumer） | `docs/architecture/components/CLIENT.md`、`packages/cli/README.md`、`packages/client-core/README.md`、`docs/guides/CLIENT_INTEGRATION.md` |
| 根工作区命令 | `package.json`（scripts 部分）+ `scripts/run-dev.ts` + `scripts/run-eval.ts` | `README.md`、`docs/README.md`、`docs/operations/TESTING.md` |
| ~~Server 专属 DB 命令~~ | **已删除**（Wave-10）。DB 迁移由各 `packages/service-*/src/migrations.ts` 管理 | — |
| 运行时环境默认值 | `packages/host-local/src/nest/config/config.ts`（default `light` 宿主 owner）+ `packages/host-distributed/src/config/service-config.ts` | `docs/operations/ENVIRONMENT.md`、`docs/architecture/ARCHITECTURE.md`、`docs/guides/GETTING_STARTED.md` |
| 运行时请求/追踪 headers | `packages/host-local/src/nest/config/config.ts` + `packages/host-local/src/nest/runtime/request-context.service.ts`（default `light` 宿主）+ `packages/host-distributed/src/gateway/internal-client.ts` | `docs/operations/ENVIRONMENT.md`、`docs/architecture/DEPLOYMENT.md`、`docs/reference/api-surface.md` |
| 当前架构治理执行入口 | `plan.md` + `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md` | `docs/README.md`、`docs/todos/README.md`、`docs/archived/README.md`、`docs/PACKAGES.md`、`docs/reference/REPO_STRUCTURE.md` |
| 可观测性 key/分类/可见性契约 | `packages/contracts/src/domain/observability.ts` | `plan.md`、`docs/archived/archived-plans/instrumentation-observability-plan.md`、`docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md`、`docs/architecture/components/CLIENT.md`、`docs/architecture/components/ASYNC_MODEL.md`、`docs/reference/api-surface.md` |
| 工作流关联 public/operator seam | `packages/contracts/src/domain/observability.ts`（`workflowCorrelationSchema`）+ `packages/contracts/src/domain/operations.ts`（`workflowRunSnapshotSchema`）+ `packages/service-job-runtime/src/` | `docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md`、`docs/architecture/components/ASYNC_MODEL.md` |
| 运行时状态/就绪契约 | `packages/host-local/src/nest/` + `packages/host-distributed/src/`（packages/server/src/app.ts 已删除） | `docs/architecture/DEPLOYMENT.md`、`docs/architecture/ARCHITECTURE.md`、`docs/reference/api-surface.md` |
| 健康检查契约（Phase 1A） | `packages/contracts/src/domain/health.ts`（`healthStatusSchema`、`dependencyStatusSchema`） | `docs/operations/ENVIRONMENT.md`、`docs/architecture/OBSERVABILITY.md`、`docs/architecture/SERVICE-DISCOVERY.md` |
| 可观测性配置 schema（Phase 1A） | `packages/contracts/src/domain/observability-config.ts`（`observabilityConfigSchema`、`featureFlagsSchema`） | `docs/operations/ENVIRONMENT.md`、`docs/architecture/OBSERVABILITY.md` |
| 遥测端口（Phase 1A） | `packages/backend-core/src/ports/telemetry-ports.ts`（`MetricsPort`、`TracingPort`、`LoggingPort`、`SpanHandle`） | `docs/operations/ENVIRONMENT.md`、`docs/architecture/OBSERVABILITY.md` |
| 生命周期端口（Phase 1A） | `packages/backend-core/src/ports/lifecycle-ports.ts`（`LifecycleManager`、`HealthCheckRegistrar`、`HealthCheck`、`LifecycleHook`） | `docs/operations/ENVIRONMENT.md`、`docs/architecture/OBSERVABILITY.md` |
| 服务发现端口（Phase 1A） | `packages/backend-core/src/ports/discovery-ports.ts`（`DiscoveryPort`、`ServiceRegistration`、`DiscoveredService`） | `docs/operations/ENVIRONMENT.md`、`docs/architecture/SERVICE-DISCOVERY.md` |
| 检索 `queryId` 生成与查询追踪日志 | `packages/service-knowledge-read/src/`（retrieval orchestration）+ `packages/contracts/src/domain/observability.ts` | `docs/archived/archived-plans/instrumentation-observability-plan.md`、`docs/operations/TESTING.md` |
| 反馈 badcase 捕获与持久化 badcase 追踪 | `packages/service-governance-review/src/`（feedback/badcase owner）+ `packages/persistence-schema/src/` | `docs/archived/archived-plans/badcase-feedback-loop.md`、`docs/reference/DATA_MODEL.md` |
| Badcase 导出草稿操作者界面 | `packages/service-governance-review/src/`（badcase export owner）+ `scripts/export-badcase-to-eval.ts` | `docs/archived/archived-plans/instrumentation-observability-plan.md`、`docs/reference/api-surface.md` |
| 脚本专属 badcase 评估草稿 payload 边界 | `packages/contracts/src/domain/operations.ts`（`badcaseEvalDraftSchema`）+ `scripts/export-badcase-to-eval.ts` | `evals/README.md`、`docs/operations/TESTING.md`、`docs/reference/api-surface.md` |
| 异步操作者状态契约（`runtimeContract` / `freshnessContract` / `idempotencyContract` / `retryResumeContract` / `failureTaxonomy`） | `packages/contracts/src/domain/operations.ts` + `packages/contracts/src/domain/observability.ts`（`observabilityFailureTaxonomyItems`）+ `packages/service-job-runtime/src/` | `docs/architecture/components/ASYNC_MODEL.md`、`docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md` |
| Phase 3 操作者/配置/容量事实界面（`operatorHome` / `configGovernance` / `capacityModel` / `bulkOperations`） | `packages/contracts/src/domain/operations.ts` + `packages/host-local/src/nest/config/config.ts` | `docs/operations/ENVIRONMENT.md`、`docs/reference/api-surface.md`、`docs/reference/PERFORMANCE.md`、`docs/architecture/ARCHITECTURE.md` |
| 统计摘要缓存失效 / 待处理失效容量视图 | `packages/contracts/src/domain/operations.ts` + `packages/service-knowledge-read/src/` | `docs/reference/PERFORMANCE.md`、`docs/operations/TESTING.md`、`docs/reference/api-surface.md` |
| 分布式请求/追踪传播证据 | `packages/host-distributed/src/gateway/internal-client.ts` + `packages/host-distributed/src/gateway/distributed-acceptance.test.ts` + `packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts` | `docs/operations/TESTING.md`、`docs/archived/archived-plans/instrumentation-observability-plan.md`、`docs/operations/ENVIRONMENT.md` |
| Phase 3 指标导出 / 结构化请求日志 / HTTP-DB-queue 插桩 | `packages/host-local/src/nest/` + `packages/host-distributed/src/gateway/` + `packages/service-job-runtime/src/`（`packages/server` 已删除） | `docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md`、`docs/architecture/components/ASYNC_MODEL.md` |
| Phase 3 分布式内部跳 span 传播 / 宿主拥有的跳指标 | `packages/host-distributed/src/gateway/routes.ts` + `packages/host-distributed/src/gateway/internal-client.ts` + `packages/host-distributed/src/gateway/internal-observability.ts` + `packages/host-distributed/src/gateway/internal-client.test.ts` | `docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md`、`docs/architecture/components/ASYNC_MODEL.md` |
| 根执行计划治理与 closeout 规则 | `plan.md` + `docs/guides/DOCUMENTATION_GOVERNANCE.md` + `docs/reference/REPO_STRUCTURE.md` | `docs/plans/README.md`、`docs/todos/README.md`、`docs/README.md` |
| Phase 3 开放问题 closeout（`databasePool.maxConnections` 延迟细节、hot team/query/artifact 非默认深入） | `docs/plans/backend-engineering-masterplan/03-operator-config-capacity-and-cache-ops.md` + `packages/contracts/src/domain/operations.ts`（packages/server/src/routes/operations/status-phase3.ts 已删除） | `docs/reference/PERFORMANCE.md`、`docs/reference/api-surface.md` |
| 根计划治理延迟风险与扩展 seams | `plan.md` + `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md` + `docs/archived/archived-plans/backend-engineering-optimization-plan.md` + `docs/archived/archived-plans/nestjs-service-evolution-04-data-runtime-and-cutover-archived.md` + `docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md` | `docs/README.md`、`docs/todos/README.md`、`docs/archived/README.md`、`docs/operations/TESTING.md`、`docs/reference/api-surface.md` |
| 异步事件与共享任务幂等/重试目录 | `packages/contracts/src/domain/async.ts` | `docs/architecture/components/ASYNC_SHARED_JOB_CONTRACTS.md`、`docs/architecture/components/ASYNC_MODEL.md`、`docs/archived/archived-plans/backend-engineering-optimization-plan.md` |
| 共享弹性策略 | `packages/host-distributed/src/gateway/internal-client.ts`（packages/server/src/lib/runtime/resilience.ts 已删除） | `docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md` |
| 运行时指标快照语义 | `packages/host-local/src/nest/` + `packages/host-distributed/src/gateway/`（packages/server/src/lib/runtime/metrics.ts 已删除） | `docs/operations/ENVIRONMENT.md`、`docs/operations/TESTING.md` |
| 检索缓存失效策略 | `packages/service-knowledge-read/src/`（`packages/server/src/lib/cache/` 已删除） | `docs/PACKAGES.md`、`docs/operations/TESTING.md` |
| 队列 / outbox 可靠性策略 | `packages/service-job-runtime/src/`（`packages/server/src/lib/queue/` 已删除） | `docs/operations/TESTING.md`、`docs/operations/CI_CD.md`、`docs/architecture/DEPLOYMENT.md` |
| AI 提供者/模型默认值 | `packages/host-local/src/nest/config/config.ts` + `packages/host-distributed/src/config/service-config.ts`（packages/server/src/lib/ai/provider-config.ts 已删除） | `docs/operations/ENVIRONMENT.md`、`docs/architecture/ARCHITECTURE.md`、`docs/guides/GETTING_STARTED.md` |
| 评估工作流 | `.github/workflows/eval.yml` | `docs/operations/TESTING.md`、`docs/operations/CI_CD.md` |
| 深层架构持久化文档 | `packages/persistence-schema/src/*.ts` + 各 `packages/service-*/src/schema.ts` | `docs/architecture/components/PERSISTENCE.md`、`docs/reference/DATABASE_SCHEMA.md` |
| 健康/就绪端点 | `packages/host-local/src/nest/` + `packages/host-distributed/src/`（packages/server/src/app.ts 已删除） | `docs/architecture/DEPLOYMENT.md`、`docs/guides/GETTING_STARTED.md` |
| 深层架构组件文档 | `packages/persistence-schema/src/*.ts` + 各 service owner 源码 | `docs/architecture/components/*.md` |
| 操作者专属内部 API | `packages/service-knowledge-read/src/`（`packages/server` 已删除） | `docs/operations/ENVIRONMENT.md`、`docs/architecture/components/RETRIEVAL.md` |
| 仓库布局 | `docs/reference/REPO_STRUCTURE.md` | `README.md`、`docs/README.md`、`docs/guides/CODE_GUIDE.md` |

> 完整的跨文档事实矩阵（涵盖 CI、部署、测试、护栏和 schema 归属）参见 [`DOCS_TRUTH_MATRIX.md`](DOCS_TRUTH_MATRIX.md)。

## 规则

1. **权威事实源优先。** 当 secondary docs 与权威事实源冲突时，更新 secondary doc。
2. **~~`store_snapshot` 是兼容层。~~** `store_snapshot`、`JsonStore`、`PostgresStore` 已于 Wave-9 删除。参见 `docs/reference/DATA_MODEL.md`。
3. **路由/业务逻辑从 owner ports 读取当前聚合状态。** 各 service owner 通过 `packages/backend-core/src/ports/` 定义的 port contract 提供数据访问。Actor 查询由 `service-identity-access` 持有。
4. **路由是传输适配器，不是工作流编排器。** 路由处理器可以验证输入、授权、解析 actor/target 上下文、委托给应用服务和序列化响应。多步持久化、生命周期协调和兼容性存储债务属于应用服务或仓库层。
5. **运行时/引导归属留在基础设施层。** 启动序列、迁移执行、worker 监管、就绪/健康计算、恢复和其他进程级关注点属于 host composition、`service-job-runtime` 或相邻基础设施模块，不属于领域/应用服务。
6. **读模型组装留在读侧，除非另有明确文档说明。** 写侧应用服务不应悄悄组装 retrieval、review-queue 或 runtime 投影。如果写流必须返回派生读模型，该耦合必须在文档中命名并保持在文档边界内。
7. **~~`store.snapshot()` / `store.transact()` 的使用受限于显式白名单。~~** `store_snapshot`、`JsonStore`、`PostgresStore` 已于 Wave-9 删除。各 service owner 通过 PostgreSQL 事务管理数据一致性。历史白名单见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md`。
8. **~~`packages/server` 是 Fastify compatibility shell。~~** `packages/server` 已于 Wave-10 删除。`packages/backend-core` 定义 command/use-case/port contract，`packages/host-local/src/nest/**` 是 `light` 默认主入口，`packages/host-distributed` 是 `heavy` 的真实宿主实现。各 service owner 通过 `KnowledgeWritePort` 完成最终 aggregate mutation。
9. Phase 1 server/backend-core boundary freeze：`packages/server` 已删除。`backend-core` 提供 host-agnostic runtime capability model、invocation contract、internal ports 与 bounded-context module factory，`packages/service-*` 承载 thin assembly 和各自的 Drizzle baseline runner；distributed host 只协调固定 owner 顺序。
10. Stage 1 read-side收口现状：`packages/host-local/src/nest/gateway/candidate-review.controller.ts` 的 review-queue 投影与 `routes/decay.ts` 的 entries/search 投影都已委托给 `lib/operations/read-model.ts` 中的显式 projection helper，route/controller 自身只保留 transport / auth / response 映射。`routes/operations/status.ts` 和 `routes/operations/audit.ts` 也不再直接读取 compatibility snapshot；operator read-side snapshot access 当前仅局部保留在 `lib/operations/read-model.ts` 的命名 projection exception（artifact revision payload hydration）。Phase 1 遗留 open question 已在 Phase 2 核查关闭，目前不存在其他 operator 读侧 repo capability gap / projection exception。
11. ~~Phase 2 store-snapshot posture freeze：~~`store_snapshot`、`JsonStore`、`PostgresStore` 已于 Wave-9 删除。InMemory 继续是 repo-backed fallback/testing posture。各 service owner 通过 PostgreSQL 事务管理数据一致性，不再保留 live no-PG / InMemory fallback。artifactFilePayloads hydration 已随 store_snapshot 一起删除。历史冻结状态见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md`。
12. Phase 2 async contract 收口现状：`/v1/operations/status/async` 必须使用统一 schema 暴露 runtime mode semantics、freshness / projection lag、idempotency、retry / resume / reclaim 和 failure taxonomy；不要在 secondary docs 或 route-local helper 中再发明第二套术语。
13. Phase 1 truth-source 收口现状：`packages/contracts/src/domain/observability.ts` 还负责冻结 `workflowCorrelationSchema`、public additive correlation keys、internal-only correlation keys 和共享 failure taxonomy 文案；`packages/contracts/src/domain/operations.ts`、`packages/service-job-runtime/src/`、`packages/service-governance-review/src/` 只能复用这些定义，不能局部再扩一套字段。
14. 根计划 closeout 规则：根 `plan.md` 只有在"代码/contract + 聚焦测试 + facts/truth-source 回写 + `check:docs-drift` + `check:structure`"全部完成后才能勾选阶段复选框。
15. 根 `plan.md` 是当前执行索引；`docs/todos/` 中被根计划链接的文件可以承担当前细则执行角色。`docs/plans/` 默认保存 historical-reference 或长期参考，除非根计划显式重新激活某个目录。
16. 所有涉及架构或持久化文档的 PR 必须对照此表验证一致性。
17. 六服务边界冻结：`knowledge-write` 拥有所有 knowledge/trap/evidence 写事实，包括应用 review/maintenance/decay 决策和发布 candidate 结果；`review` 拥有治理 queue/decision/feedback/maintenance/decay 命令，但必须通过远程 `KnowledgeWritePort` 调用委托最终聚合变更，不得有本地 knowledge-repo fallback；`candidate-ingestion` 拥有 candidate 工作流事实，但必须通过远程 `KnowledgeWritePort` 发布已解析结果，且仅在发布成功后才能标记 candidate 为已解析；`knowledge-read` 只消费读投影或事件；`job-runtime` 只拥有 queue/outbox/runtime 传输和 worker 调度粘合层。
18. Compatibility-shell closeout 事实：`packages/server` 已于 Wave-10 删除。`review` 拥有治理 queue/decision/feedback/maintenance/decay 命令，通过 `KnowledgeWritePort` 委托最终聚合变更；`candidate-ingestion` 拥有 candidate 工作流事实，通过 `KnowledgeWritePort` 发布已解析结果。当前 `packages/host-local/src/nest/config/config.ts` 是 default `light` runtime env defaults 的 host-owned truth entry；`packages/host-local/src/nest/runtime/host-services.ts` 只负责 host-local service composition，`packages/host-local/src/nest/runtime/retrieval-assembly.ts` 收口 host-owned retrieval assembly。`packages/host-local/src/nest/gateway/candidate-review.controller.ts` 对 review、manual-result 和 apply-resolution 均直接委托 owner port。
19. Phase 4 closeout 事实：仓库级归属矩阵、compatibility-shell 退役列表和分布式成熟服务 closeout 任务类别已冻结在 `plan.md` 和 `docs/archived/archived-plans/nestjs-service-evolution-04-data-runtime-and-cutover-archived.md`；后续文档不得发明第二套矩阵或重新引入已删除的 rollback/compat 入口作为活跃运行时选项。
20. Badcase 导出边界事实：`GET /v1/operations/badcases/:feedbackId/export` 可以用操作者专属的 `debug` 包装确定性评估 `draft`，但 `scripts/export-badcase-to-eval.ts` 和评估 fixture 只能序列化 `badcaseEvalDraftSchema`。
21. 根计划治理延迟事实：MQ 产品化、新监控平台、新部署形态、完整服务发现/K8s 平台化以及大型 web/CLI 调试 UI 已延迟到专门的后续计划；它们不是 Phase 0 内的未解决事项，也不是重新开启并行根计划的理由。
22. 根计划治理扩展 seam 事实：compatibility-shell 退役在 Nest/服务演进背景文档下继续，分布式成熟度审计在其专门评估文档下继续，任何新的平台级主题必须进入当前治理详细计划或其显式延迟落点，而非创建并行活跃计划。
23. Phase 3 unified-adapter boundary freeze：统一适配器只覆盖 infrastructure/provider seam，不得扩张成混合 repository、application service、gateway client 与 host composition 的 mega-adapter。`packages/backend-core` 只拥有 port contract 与 invocation model，不拥有 concrete provider implementation；host-owned adapter selection 继续冻结在 `packages/host-local/src/nest/adapters/`；`packages/host-distributed/src/gateway/internal-client.ts` 是 thin transport helper / canonical error normalization seam；`packages/host-distributed/src/shared/internal-knowledge-write-client.ts` 是把 transport error 映射回 `InvocationError` / port semantics 的 remote client wrapper。gateway client 与 remote adapter 不是 repository adapter。
24. Phase 4 adapter env / target-pruning freeze：selector env truth 继续以 `TRAPMAP_DEPLOYMENT_PROFILE`、`TRAPMAP_DEPLOYMENT_PRESET` 与 `TRAPMAP_TASK_TRANSPORT` 为中心；provider-specific env 继续留在 owner seam，而不是抽成 generic mega-config taxonomy。当前 AI provider env 事实由 `packages/host-local/src/nest/config/config.ts` 驱动，distributed internal service URL env 事实继续由 `packages/host-distributed/src/config/service-config.ts` 驱动。推荐组合冻结为 `local-agent` / `team-monolith` -> `light` 与 `distributed` -> `heavy`；`rabbitmq` 需要 RabbitMQ config，`distributed` 需要 PostgreSQL，`local-agent` 仍可保持 `json-store-ok`，而 internal service URLs 在 `in-process` mode 下继续视为 ignored config。`light` / `heavy` 是 build/deployment target，不是新增 runtime profile；optional dependency / tree-shaking 只冻结为当前 intent 与 non-goal，不得写成已完成的自动化 package pruning。
25. Phase 5 distributed baseline / runtime-isolation freeze：distributed 当前成熟度继续冻结为 `Level 2 / transitional-microservice`。它已经是"真实分布式"而不是 fake split：gateway 仍是唯一外部入口，存在真实 service process 与真实内部 HTTP hop；但它仍不是成熟自治服务群：shared PostgreSQL 继续是主要持久化底座，retrieval 仍有逻辑服务 seam，compose 只证明当前 profile/topology 能运行而不是成熟编排。当前服务发现只冻结到"显式 `TRAPMAP_*_URL` 覆盖 + compose Docker DNS 默认值 + `packages/host-distributed/src/config/service-config.ts` 统一 resolver seam"，不承诺注册中心、Kubernetes Service、Service Mesh 或更强 autonomy claim。
25a. Phase 2 internal RPC pilot freeze：`TRAPMAP_KNOWLEDGE_WRITE_TRANSPORT=rpc` 当前只表示启用 `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` 与 `packages/service-knowledge-write/src/routes.ts` 提供的 repo-owned envelope RPC seam；它不等价于 Connect RPC、gRPC 或新的 Protobuf truth surface。正式协议层 adoption 需要单独接受 `proto`/Buf/codegen 成为新的 authoritative contract workflow。
25b. Phase 3 observability closeout freeze：当前仓库内真实落地的 observability backend 冻结到以下 seam：`packages/host-local/src/nest/` 提供 `/metrics` Prometheus text export 与结构化 request log，`packages/host-distributed/src/gateway/internal-client.ts` + `packages/host-distributed/src/gateway/internal-observability.ts` 提供 distributed internal-hop traceparent/span 传播与 host-owned hop metrics。packages/server/src/app.ts 和 packages/server/src/lib/runtime/metrics.ts 已删除。OTEL collector、Prometheus scrape target 和日志采集器在当前仓库中只冻结为接入边界，不提供完整 collector/agent 部署资产。
26. Phase 6 mature-capability / library-replacement freeze：`internal client + resilience` 当前已经是主线 shared runtime seam，但还不是完整 mature-service platform stack；`tracing + metrics` 当前只冻结 request/trace headers、runtime metrics snapshot、operator summary 与低基数 label 规则；`rate limiting + bulkhead / 背压` 不是当前内置运行时默认值；`cache + invalidation` 有真实 operator/testing surface，但只能证明 derived cache / invalidation seam，不证明 service-autonomous cache infrastructure；service discovery、DB budget / PgBouncer、以及 richer health indicator rollout 继续是 adoption condition / deferred capability gate；`light` / `heavy` 只冻结不同默认策略姿态，不得发明新 runtime behavior；graph runtime 只证明 today 共享同一 `TRAPMAP_GRAPH_DB_*` env family 与部分 shared consumer seam，不得被写成所有 host/profile 行为已经完全等价。
27. Documentation validation / observability platform mainline：当前唯一 active execution surface 是“Documentation Validation and Observability Platform”，由 `plan.md` 链接 `docs/todos/documentation-validation-and-observability-platform.md`。该主线以长期维护优先，接受为消除重复 truth source、文档漂移、无 owner telemetry seam 和隐私风险而增加短期工作量。compatibility-shell retirement、可观测性、shared PG 治理与分布式成熟度细则均已归档；`docs/todos/open-debt-and-compromises.md` 是受根索引管理的长期登记册，不构成第二条 active mainline。历史 todo 文档可作为背景/延迟参考保留，但不得被描述为仍由当前根计划并行拥有的检查清单。`docs/README.md`、`docs/todos/README.md`、`docs/archived/README.md`、`docs/plans/README.md`、以及其他 secondary docs 必须将其余历史材料写成 background、historical-reference、已完成 closeout、或 explicit deferred landing spot。
28. Phase 7 CI/testing truth freeze：CI authoritative source 继续是 `.github/workflows/ci.yml`，workspace command truth 继续是 `package.json` scripts。当前 documented Node version 必须是 Node `24` + pnpm `10.33.0`；`doc-guardrails` job runs `pnpm check:docs-drift`、`pnpm check:arch-freeze`、`pnpm check:deps`、`pnpm check:mermaid`、`pnpm check:structure`、`pnpm check:complexity`、`pnpm check:md-lint` 和 `pnpm check:links`；`pnpm run ci`、`pnpm eval:smoke`、`pnpm eval:ci`、`pnpm eval:ci:core` 的文案必须与 `package.json` 当前脚本 surface 保持一致，不得写回旧 node 版本、旧 CI job coverage 或替代命令表面。
29. Phase 7 deferred-landing freeze：Dockerfile / config maintainability 风险、平台化 deployment shape、MQ productization、monitoring platform、service discovery、K8s/platformization、以及更重的 service autonomy topic，都必须进入已命名 deferred landing spots，而不是留成模糊"later"事项。当前 deferred 路径继续冻结在 `docs/archived/archived-plans/backend-engineering-optimization-plan.md`、`docs/archived/archived-plans/nestjs-service-evolution-04-data-runtime-and-cutover-archived.md`、`docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md`、`docs/archived/archived-plans/robustness-scalability-closeout-plan.md` 与 `docs/archived/archived-plans/instrumentation-observability-plan.md`。

## CI 守卫

两个自动化守卫在每个 PR 上强制执行这些规则。它们在 CI 中作为 `doc-guardrails` 任务运行，也可以在本地运行。完整的跨文档事实矩阵参见 [`DOCS_TRUTH_MATRIX.md`](DOCS_TRUTH_MATRIX.md)。

### 文档漂移守卫

```bash
pnpm check:docs-drift
```

检查关键文档文件是否包含必需短语，且不包含过时或禁止的短语。规则定义在 `scripts/complexity-budgets.json` 的 `docRules` 下。

当前规则：
- `docs/guides/CODE_GUIDE.md` 必须包含 `buildServer()` 且不得包含 `createApp()`
- `docs/architecture/ARCHITECTURE.md` 必须包含对 `SYSTEM_TRUTH_SOURCES.md` 的引用
- Phase 7 相关 doc rules 继续守住 active-remediation entry、todos/archived index truth、CI/eval command surface 与 Node/job wording drift

**添加新规则：** 编辑 `scripts/complexity-budgets.json`，在 `docRules` 中添加一个包含 `file`、可选 `mustContain` 和可选 `mustNotContain` 数组的条目。

### 复杂度预算守卫

```bash
pnpm check:complexity
```

检查被跟踪的热点文件是否超过配置的行数预算。规则定义在 `scripts/complexity-budgets.json` 的 `lineBudgets` 下。

当前预算：
| 文件 | 预算 | 当前 |
|---|---|---|
| `packages/host-local/src/nest/app.module.ts` | 350 行 | — |
| `packages/host-local/src/nest/gateway/candidate-review.controller.ts` | 150 行 | — |
| `packages/persistence-schema/src/knowledge.ts` | 200 行 | — |

**调整预算：** 编辑 `scripts/complexity-budgets.json` 并更新相关文件的 `maxLines` 值。预算应设置在文件变得不可管理之前触发警告的水平，而非当前大小。

**添加新的跟踪文件：** 在 `lineBudgets` 中添加包含 `file` 和 `maxLines` 的条目。

## 维护

同时更新事实文档和护栏时：

1. 先更新权威事实源
2. 更新 [`DOCS_TRUTH_MATRIX.md`](DOCS_TRUTH_MATRIX.md) 中列出的 secondary docs
3. 如果漂移类别可能再次出现，在 `scripts/complexity-budgets.json` 中添加或更新文档漂移规则
4. 运行 `pnpm check:docs-drift`
