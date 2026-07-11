# 可观测性与可追溯性闭环实施计划

> **For agentic workers:** 按任务顺序执行；每个任务使用复选框追踪，先运行失败测试，再完成最小实现和文档回写。未经用户明确要求，不创建 git commit。

**Goal:** 让一次业务操作通过稳定关联字段，在请求日志、OTel trace、低基数指标、异步处理和持久化审计事件之间可联查。

**Architecture:** 在 `packages/contracts` 扩展唯一的关联和日志 schema；server、host-local 与 host-distributed 只消费该 contract。W3C `traceparent` 负责同步调用的父子关系，`operationId` 与 `causationId` 负责跨异步边界的业务因果；审计仍作为独立持久化事实，不以日志替代。

**Tech Stack:** TypeScript、Zod、Vitest、Fastify、NestJS、OpenTelemetry、Prometheus `prom-client`、PostgreSQL、Loki（可选 transport）。

> **状态：** active  
> **根入口：** [`../../plan.md`](../../plan.md)  
> **目标：** 将日志、指标、追踪、异步执行和业务审计收敛为可联查、可验证、低基数且可运维的闭环。

## 问题基线

- 当前存在 Fastify compatibility shell、host-local 和 host-distributed 三套遥测接线；日志、指标和 tracing 的实现与字段并未完全统一。
- distributed tracing 主要透传已有 `traceparent`；缺少上游上下文时未必创建根 span，内部调用也没有统一通过 OTel 注入子 span context。
- 运行日志、`LoggingPort`、Loki transport 和 HTTP 日志的输出链路不一致，部分日志仍是文本拼接。
- 审计事件能记录操作者和业务动作，但未标准化记录 request/trace/operation/causation 关联字段，无法稳定关联运行排障证据。
- host-local 指标仍有原始 `route` 标签；不同宿主的指标名、单位与标签语义需要收敛。
- SLO、告警、保留期和 LGTM 组件目前主要是外部接入建议，尚未形成版本化的仓库内运维闭环。

## 全局约束

- [ ] 共享 schema、枚举和类型仅定义在 `packages/contracts/src/domain/` 的就近 `enum-types/` 目录并经 `index.ts` 导出。
- [ ] `backend-core` 只消费 telemetry / audit ports，不依赖 OTel、Prometheus、Loki 或具体 logger SDK。
- [ ] 所有 Prometheus 标签保持低基数；禁止使用 request ID、trace ID、用户 ID、实体 ID 和原始 URL。
- [ ] 日志、trace attribute 与审计 metadata 不记录 access token、会话密钥、完整敏感 payload 或未经审查的用户内容。
- [ ] 每个涉及 runtime/env/API surface 的 tranche 都更新权威文档，并运行 `rtk pnpm typecheck` 与对应最小测试。

## 实施任务

### Task 1：冻结共享关联 contract

**Files:**
- Modify: `packages/contracts/src/domain/observability.ts`
- Modify: `packages/contracts/src/domain/log-schema.ts`
- Modify: `packages/contracts/src/domain/observability.test.ts`
- Modify: `packages/contracts/src/domain/log-schema.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Consumes:** 已有 `OBSERVABILITY_CORRELATION_KEYS`、`workflowCorrelationSchema`、`logEntrySchema` 和 `LOKI_LOW_CARDINALITY_LABELS`。

**Produces:** 严格的共享 correlation schema，字段为 `requestId`、`traceparent`、`traceId`、`operationId`、`causationId`、`service`、`ownerSurface`；`LogEntry` 允许这些字段进入 JSON body，但 Loki labels 始终仅为 `service`、`environment`、`level`。

- [ ] **Step 1: Write failing contract tests.** 在 `observability.test.ts` 添加一个完整关联上下文的 `safeParse` 断言和一个非法 `traceparent` 的拒绝断言；在 `log-schema.test.ts` 断言 `operationId`、`causationId` 不会出现在 `buildLokiLabels()` 输出中。
- [ ] **Step 2: Verify RED.** 运行 `rtk pnpm --filter @trapmap/contracts test --run src/domain/observability.test.ts src/domain/log-schema.test.ts`；预期新增字段尚不存在或非法 W3C header 未被拒绝。
- [ ] **Step 3: Implement the minimum contract.** 在 `observability.ts` 新增 `operationId`、`causationId` 及 W3C 格式的 `traceparent` schema；在 `log-schema.ts` 增加可选 correlation fields，保持 `.passthrough()` 和三项 Loki label 白名单不变。
- [ ] **Step 4: Verify GREEN.** 重跑 Step 2 命令；再运行 `rtk pnpm typecheck`。
- [ ] **Step 5: Document the authority.** 更新 `docs/architecture/OBSERVABILITY.md`，说明 `observability.ts` 与 `log-schema.ts` 分别是关联字段和日志字段的唯一 contract source。

### Task 2：统一入口上下文与 HTTP trace 传播

**Files:**
- Modify: `packages/server/src/lib/runtime/request-context.ts`
- Create: `packages/server/src/lib/runtime/request-context.test.ts`
- Modify: `packages/host-local/src/nest/runtime/request-context.service.ts`
- Modify: `packages/host-local/src/nest/runtime/request-context.test.ts`
- Modify: `packages/host-distributed/src/shared/telemetry.ts`
- Create: `packages/host-distributed/src/shared/telemetry.test.ts`
- Modify: `packages/host-distributed/src/gateway/internal-client.ts`
- Modify: `packages/host-distributed/src/gateway/internal-client.test.ts`

**Consumes:** Task 1 的 correlation schema；Fastify request context；Nest `AsyncLocalStorage`；OTel `propagation` API。

**Produces:** 每个入口都有合法 `requestId` 和 trace context；无上游 `traceparent` 的入口创建 root server span；内部 client 注入 OTel child context，不再依赖 `x-trapmap-span-id` / `x-trapmap-parent-span-id` 表示 trace 父子关系。

- [ ] **Step 1: Write failing tests.** 为 server 与 host-local context 添加“无 header 生成 request ID、operation ID，且 traceparent 为空”的测试；为 distributed telemetry 添加“无上游 traceparent 仍创建并结束 server span”的测试；将 internal-client 测试改为断言 W3C header 注入且不包含自定义 span headers。
- [ ] **Step 2: Verify RED.** 运行 `rtk pnpm test:file -- packages/host-local/src/nest/runtime/request-context.test.ts` 和 `rtk pnpm --filter @trapmap/host-distributed test --run src/shared/telemetry.test.ts src/gateway/internal-client.test.ts`；预期 root span 和标准 child propagation 断言失败。
- [ ] **Step 3: Implement minimum propagation.** 仅通过 `propagation.extract()` / `propagation.inject()` 读取和写入 W3C carrier；在 `attachRuntimeTelemetry()` 无条件创建 server span，使用 extracted context 作为可选 parent；将 `requestId`、`operationId`、`causationId` 放进既有内部 header allowlist，不改变业务请求 body。
- [ ] **Step 4: Verify GREEN.** 重跑 Step 2，并运行 `rtk pnpm test:distributed-closeout`、`rtk pnpm typecheck`。
- [ ] **Step 5: Document transport compatibility.** 更新 `docs/architecture/OBSERVABILITY.md` 与 `docs/architecture/SERVICE-DISCOVERY.md`，声明 `traceparent` 是唯一 trace propagation header；保留的业务 correlation headers 只承载 operation/causation 语义。

### Task 3：将运行日志收敛为同一结构化出口

**Files:**
- Modify: `packages/host-local/src/nest/observability/logging-port.adapter.ts`
- Modify: `packages/host-local/src/nest/observability/loki.service.ts`
- Modify: `packages/host-local/src/nest/runtime/logging.middleware.ts`
- Modify: `packages/host-local/src/nest/runtime/logging.middleware.test.ts`
- Modify: `packages/host-local/src/nest/observability/observability-chain.test.ts`
- Modify: `packages/server/src/lib/runtime/logging-port-adapter.ts`
- Modify: `packages/server/src/lib/runtime/logging-port-adapter.test.ts`

**Consumes:** Task 1 的 `LogEntry`；Task 2 的 request context；Loki 低基数 label contract。

**Produces:** `LoggingPort`、HTTP completion 和异常日志均输出 schema-valid JSON；child logger 保留 inherited context；Loki 写入失败时仍以同一 JSON schema 输出 stdout。

- [ ] **Step 1: Write failing tests.** 在 host-local middleware test 断言输出可由 `logEntrySchema.parse()` 校验且含 request/trace/operation fields；在 adapter tests 断言 child context 合并；在 `log-schema.test.ts` 增加 `authorization`、token、session secret 不可进入 serialised log body 的断言。
- [ ] **Step 2: Verify RED.** 运行 `rtk pnpm --filter @trapmap/host-local test --run src/nest/runtime/logging.middleware.test.ts src/nest/observability/observability-chain.test.ts` 与 `rtk pnpm --filter @trapmap/server test --run src/lib/runtime/logging-port-adapter.test.ts`。
- [ ] **Step 3: Implement minimum logger adapter.** 使 adapter 接收 `LogEntry` context 并通过唯一 formatter 输出；以 request context 补全缺失 correlation fields；在 Loki transport 失败路径复用同一 entry；采用字段白名单或 redaction helper 移除 `authorization`、`accessToken`、`sessionToken`、`secret`。
- [ ] **Step 4: Verify GREEN.** 重跑 Step 2，执行 `rtk pnpm test:observability-closeout` 和 `rtk pnpm typecheck`。
- [ ] **Step 5: Update operating rules.** 更新 `docs/operations/SECURITY.md`、`docs/operations/OBSERVABILITY-OPERATIONS.md` 和 `docs/architecture/OBSERVABILITY.md`，列出允许字段、脱敏字段和 stdout fallback 语义。

### Task 4：使审计事件具备可查询的业务因果关系

**Files:**
- Modify: `packages/backend-core/src/ports/audit-ports.ts`
- Create: `packages/backend-core/src/ports/audit-ports.test.ts`
- Modify: `packages/server/src/lib/audit/repository.ts`
- Modify: `packages/server/src/lib/audit/pg-repository.ts`
- Modify: `packages/server/src/lib/persistence/schema/auth.ts`
- Create: `packages/server/drizzle/0020_observability_audit_correlation.sql`
- Modify: `packages/host-local/src/nest/runtime/backend-core-adapters.ts`
- Modify: `packages/host-distributed/src/shared/ports.ts`
- Modify: `packages/server/src/routes/operations/audit.ts`
- Modify: `packages/server/src/routes/operations/audit.test.ts`

**Consumes:** Task 1 correlation schema；`AuditLogEntry`；`AuditRepository.listByFilter()`；既有 `audit:read` permission。

**Produces:** 每个审计记录持久化 event version、source service、request/trace/operation/causation IDs 和 outcome；查询 filter 支持 `operationId`、`traceId`、`causationId`，不绕过团队和 `audit:read` 授权。

- [ ] **Step 1: Write failing repository and route tests.** 在 `audit-ports.test.ts` 断言完整 audit entry contract；在 repository test 覆盖 insert/query correlation fields；在 route test 使用有权限 session fixture 验证 `operationId` filter 不泄露其他 team 数据。
- [ ] **Step 2: Verify RED.** 运行 `rtk pnpm --filter @trapmap/backend-core test --run src/ports/audit-ports.test.ts` 与 `rtk pnpm --filter @trapmap/server test --run src/lib/audit/repository.test.ts src/routes/operations/audit.test.ts`。
- [ ] **Step 3: Implement migration and adapters.** 迁移只新增 nullable correlation columns、必要索引与 event version/source/outcome 列；更新 Drizzle schema、in-memory repository、PG repository、host-local 与 distributed adapters；扩展 contract/query schema 和受权限保护的 route 映射。
- [ ] **Step 4: Verify GREEN.** 重跑 Step 2，并运行 `rtk pnpm typecheck`、`rtk pnpm eval:smoke`（若治理、feedback 或 badcase 路径修改）。
- [ ] **Step 5: Update external semantics.** 更新 `docs/reference/DATA_MODEL.md`、`docs/reference/api-surface.md`、`docs/architecture/components/GOVERNANCE.md` 和 `docs/operations/SECURITY.md`，明确审计不可由调试日志替代及其访问控制。

### Task 5：收敛指标、健康与遥测自监控

**Files:**
- Modify: `packages/server/src/lib/runtime/metrics.ts`
- Modify: `packages/server/src/lib/runtime/metrics.test.ts`
- Modify: `packages/host-local/src/nest/observability/prometheus.service.ts`
- Modify: `packages/host-local/src/nest/observability/prometheus.service.test.ts`
- Modify: `packages/host-distributed/src/gateway/internal-observability.ts`
- Modify: `packages/host-distributed/src/shared/observability.test.ts`
- Modify: `packages/contracts/src/domain/health.ts`
- Modify: `packages/host-local/src/nest/health/health.controller.test.ts`

**Consumes:** `observabilityMetricNamespaceSchema` 和 `healthStatusSchema`；现有 `/metrics`、`/live`、`/ready`、`/health` surface。

**Produces:** 跨宿主一致的 metric name/unit/label registry；参数化 `routeFamily` 替代原始 URL；对 exporter、Loki 与 audit write 失败的计数或健康 diagnostics；readiness 不因可选 telemetry sink 不可用而被错误阻断。

- [ ] **Step 1: Write failing metric/health tests.** 在 Prometheus service test 断言 raw URL 不会成为 label value；在 runtime metrics test 断言 allowed labels 不含动态 IDs；在 health controller test 覆盖 audit write / OTLP exporter 失败为 `degraded` 而非 `not-ready` 的可选依赖语义。
- [ ] **Step 2: Verify RED.** 运行 `rtk pnpm --filter @trapmap/host-local test --run src/nest/observability/prometheus.service.test.ts src/nest/health/health.controller.test.ts`、`rtk pnpm --filter @trapmap/server test --run src/lib/runtime/metrics.test.ts`。
- [ ] **Step 3: Implement minimum registry.** 使用固定 label set `method`、`status_class`、`route_family`、`service_name`、`owner_surface`；在 host-local 入口将 route 规范化为注册路由模板；为可选遥测 sink 的失败添加低基数指标与 dependency diagnostic。
- [ ] **Step 4: Verify GREEN.** 重跑 Step 2，执行 `rtk pnpm test:observability-closeout`、`rtk pnpm test:runtime-foundations`、`rtk pnpm typecheck`。
- [ ] **Step 5: Document the catalogue.** 更新 `docs/architecture/OBSERVABILITY.md`、`docs/operations/OBSERVABILITY-OPERATIONS.md`、`docs/operations/REGRESSION-COMMANDS.md` 与 health/metrics API reference。

### Task 6：交付可执行的运维联查资产

**Files:**
- Modify: `docs/operations/OBSERVABILITY-OPERATIONS.md`
- Modify: `docs/operations/ENVIRONMENT.md`
- Modify: `docs/operations/SECURITY.md`
- Modify: `docs/architecture/OBSERVABILITY.md`
- Modify: `docs/operations/REGRESSION-COMMANDS.md`
- Modify: `README.md`（仅在用户可见部署/调试入口变化时）
- Modify: `scripts/complexity-budgets.json`（仅在新增稳定文档事实需守卫时）
- Modify: `scripts/__tests__/closeout-surface.test.ts`（仅在新增 doc-drift 规则时）

**Consumes:** Tasks 1–5 已落地的 field、metric、health 和 audit contract；外部 Prometheus、Loki、Tempo、Grafana、OTel Collector 的可选接入边界。

**Produces:** 版本化的 SLI/告警查询、trace → log → audit 联查 runbook、外部 retention/access-control 责任界定，以及可由 CI 验证的文档事实。

- [ ] **Step 1: Write failing document guard test.** 在 `closeout-surface.test.ts` 增加断言，要求运维文档包含 `trace → log → audit` 联查、OTLP/Loki 失败处置，以及“外部基础设施而非仓库默认部署”的边界。
- [ ] **Step 2: Verify RED.** 运行 `rtk pnpm test:file -- scripts/__tests__/closeout-surface.test.ts`；预期新断言失败。
- [ ] **Step 3: Implement runbook and guard rule.** 在运维文档中添加具体查询字段、告警信号、抑制逻辑与失败处置；在 `complexity-budgets.json` 增加对应 `mustContain` rule，禁止把 Collector/Grafana 描述为内置资产。
- [ ] **Step 4: Verify GREEN.** 重跑 Step 2，执行 `rtk pnpm check:docs-drift`、`rtk pnpm check:structure`、`rtk pnpm test:deployment-smoke`。
- [ ] **Step 5: Record external preconditions.** 在本计划的完成记录中列出验证所需的 Collector endpoint、Loki endpoint、Prometheus scrape 与 Grafana access；未提供时只标记为外部验收前置条件，不勾选为仓库内已验证。

## Tranche 0：冻结关联模型与基线

**目的：** 在改动行为前统一术语、字段归属和测试基线，避免各宿主再次发明不同的关联模型。

- [x] 在 `packages/contracts/src/domain/` 定义并导出关联上下文 schema：`requestId`、`traceparent`、`traceId`、`operationId`、`causationId`、`service`、`ownerSurface`。
- [x] 明确字段语义：`requestId` 标识单个入口请求，`traceparent` 遵循 W3C，`operationId` 标识可跨同步/异步边界的业务操作，`causationId` 标识直接起因事件或操作。
- [ ] 盘点 `packages/server`、`packages/host-local`、`packages/host-distributed` 的入口、中间件、内部 client、异步消息和审计写入点，记录采用新 contract 的迁移顺序。
- [x] 为 server 与 host-local 的 request-context 补齐最小测试，覆盖：上游字段存在、缺失 fallback、非法 traceparent、AsyncLocalStorage 保留，以及 operation/causation headers。
- [x] 更新 `docs/architecture/OBSERVABILITY.md` 和本文档，明确关联字段的权威来源与兼容边界；`SYSTEM_TRUTH_SOURCES.md` 未新增或变更权威条目，保持不变。
- [x] 验证（2026-07-11）：`rtk pnpm --filter @trapmap/contracts test --run src/domain/observability.test.ts src/domain/log-schema.test.ts`（20 passed）、`rtk pnpm test:file -- packages/server/src/lib/runtime/request-context.test.ts`（3 passed）、`rtk pnpm --filter @trapmap/host-local test --run src/nest/runtime/request-context.test.ts src/nest/observability/observability-chain.test.ts`（30 passed）、`rtk pnpm typecheck`（No errors found）、`rtk pnpm check:docs-drift`（46 rules passed）及 `rtk pnpm check:structure`（passed）。

## Tranche 1：完成端到端 trace 与上下文传播

**目的：** 让没有上游 trace 的入口也产生根 span，并让内部 HTTP 与异步后续动作形成正确父子或因果关联。

- [ ] 在 server、host-local、host-distributed 的入口统一提取或创建关联上下文；缺少有效 `traceparent` 时创建根 trace，而不是跳过 tracing。
- [ ] 由 OTel propagation 负责内部 HTTP 的 trace context 注入和提取；删除或明确兼容自定义 span header，避免与 W3C 语义并存冲突。
- [ ] 为 HTTP server span、internal client span、async producer/consumer span 统一记录低基数 service、route family、operation、错误分类和状态属性。
- [ ] 将 request/trace/operation/causation 关联字段写入响应、内部调用与异步消息的已定义 header 或 envelope，且不改变外部业务 payload。
- [ ] 补齐测试：无上游 trace 创建根 span；合法 W3C context 跨 gateway 到内部服务延续；错误与超时标记 span；异步任务可关联发起操作。
- [ ] 更新 `docs/architecture/OBSERVABILITY.md`、`docs/architecture/SERVICE-DISCOVERY.md`（仅涉及 internal hop 时）、`docs/operations/ENVIRONMENT.md` 与 `docs/operations/OBSERVABILITY-OPERATIONS.md`。
- [ ] 验证：受影响 server / host-local / host-distributed 包级测试、`rtk pnpm test:distributed-closeout`、`rtk pnpm test:observability-closeout`、`rtk pnpm typecheck`；若更改跨包导入，额外运行 `rtk pnpm exec fallow audit --base main`。

## Tranche 2：统一结构化日志与错误关联

**目的：** 所有运行日志走一致的 JSON 字段和 transport 选择，能够用 trace 或 operation 反向定位请求与错误。

- [ ] 定义共享结构化日志 schema，至少包含 timestamp、level、message、service、ownerSurface、requestId、traceId、operationId、causationId、eventName 与规范化 error 信息。
- [ ] 将 `LoggingPort`、HTTP request completion、异常处理、background worker 日志接入统一 logger adapter；不再以文本拼接承载关联字段。
- [ ] 保持 stdout 为可靠回退路径，`LOKI_HOST` 仅追加低基数 label 的 transport；记录 Loki 初始化、写入或降级失败的明确事件和指标。
- [ ] 定义日志脱敏与字段白名单测试，防止 token、session secret、authorization header 和完整敏感 payload 写入日志。
- [ ] 补齐测试：logger child context 继承；HTTP 成功/失败日志包含关联字段；Loki 不可用时 stdout JSON 保持可用；敏感字段被移除或掩码。
- [ ] 更新 `docs/architecture/OBSERVABILITY.md`、`docs/operations/SECURITY.md`、`docs/operations/OBSERVABILITY-OPERATIONS.md` 与相关环境变量说明。
- [ ] 验证：相关 package 单文件测试、`rtk pnpm typecheck`、`rtk pnpm test:observability-closeout`、`rtk pnpm check:docs-drift`。

## Tranche 3：加强审计事件与业务因果追溯

**目的：** 保持审计与运行日志分离，同时让审计事件能稳定关联请求、trace、业务操作和异步后续动作。

- [ ] 扩展 audit contract 与持久化模型，标准化事件 ID、event version、source service、requestId、traceId、operationId、causationId、outcome 与脱敏 metadata。
- [ ] 定义审计必记边界：权限、身份、治理决策、知识生命周期、候选处理、人工覆盖和失败/拒绝结果；非业务调试日志不得替代审计事件。
- [ ] 使 host-local、distributed 和 compatibility path 的 audit adapter 使用相同字段映射与查询返回 shape。
- [ ] 为 audit 查询增加按 operation、trace、因果事件的受权限保护过滤；确保分页、时间范围和团队隔离语义明确。
- [ ] 补齐测试：同步业务命令与审计事件关联；异步后续事件保留 causation；未授权审计查询被拒绝；metadata 脱敏；host-local / distributed 映射一致。
- [ ] 更新 `docs/reference/DATA_MODEL.md`、`docs/reference/api-surface.md`、`docs/architecture/components/GOVERNANCE.md`、`docs/operations/SECURITY.md` 和相关 CLI / API 文档。
- [ ] 验证：contracts、backend-core、受影响 host 与 route 测试，`rtk pnpm typecheck`；如涉及检索/治理/feedback 追溯，额外运行 `rtk pnpm eval:smoke`。

## Tranche 4：收敛指标、健康与遥测自监控

**目的：** 让指标在所有宿主保持可聚合、低基数和可解释，并暴露遥测链路自身的失败信号。

- [ ] 建立共享指标目录：名称、单位、类型、允许标签与 owner；统一 HTTP、internal hop、queue/outbox、retry、audit write、logger/Loki、OTLP export 指标。
- [ ] 将原始 URL 标签替换为参数化 route family；统一 status class、method、service、owner surface 等有限枚举标签。
- [ ] 对 health 注册关键依赖、审计写入、遥测 exporter、队列/outbox 和 worker 状态的清晰语义；区分 readiness 阻断、degraded 诊断与可选依赖故障。
- [ ] 补齐测试：指标中不出现高基数字段；失败路径递增正确计数；`/ready` 与 `/health` 聚合规则符合统一 contract；指标关闭或 exporter 不可用时应用不崩溃。
- [ ] 更新 `docs/architecture/OBSERVABILITY.md`、`docs/operations/OBSERVABILITY-OPERATIONS.md`、`docs/operations/REGRESSION-COMMANDS.md` 和 health / metrics API reference。
- [ ] 验证：`rtk pnpm test:observability-closeout`、`rtk pnpm test:discovery-closeout`、受影响包测试、`rtk pnpm typecheck`、`rtk pnpm check:docs-drift`。

## Tranche 5：落地运维联查与告警资产

**目的：** 把已有接入边界转化为可执行的运维资产，但不虚构仓库已内置的外部基础设施。

- [ ] 将已确认的 SLI/SLO 以版本化 dashboard、查询示例或部署模板落地到允许的基础设施目录；明确它们依赖外部 Prometheus、Loki、Tempo、Grafana 或 Collector 的部署。
- [ ] 为 readiness、错误率、延迟、关键依赖、队列积压、审计写入失败和遥测导出失败定义告警条件、严重级别、抑制关系与排障入口。
- [ ] 提供 trace → 日志 → 审计的联查步骤，以及缺少 trace、Loki/OTLP 不可达、审计失败、指标高基数的处置步骤。
- [ ] 明确日志、trace、metrics、audit 的外部保留期和访问控制由部署环境配置；仓库文档只写默认建议与必需配置项。
- [ ] 补齐 deploy/config 验证与文档测试；不将无法在仓库内验证的 Grafana UI 操作伪装为自动化通过。
- [ ] 更新 `docs/operations/OBSERVABILITY-OPERATIONS.md`、`docs/operations/ENVIRONMENT.md`、`docs/operations/SECURITY.md`、`docs/architecture/OBSERVABILITY.md` 与 README / 部署入口（仅在用户可见接入方式变化时）。
- [ ] 验证：`rtk pnpm test:deployment-smoke`、`rtk pnpm test:observability-closeout`、`rtk pnpm test:runtime-foundations`、`rtk pnpm check:docs-drift`、`rtk pnpm check:structure`。

## 完成与归档

- [ ] 每个 tranche 完成后，在本文件记录实际变更、验证命令和未覆盖的外部前置条件。
- [ ] 主线完成时，确认根 `plan.md`、`docs/todos/README.md`、`docs/archived/README.md` 只有一个 active execution surface。
- [ ] 使用 `git mv` 将本文件归档到 `docs/archived/archived-plans/`，更新归档表，并将根 `plan.md` 切换为下一个主线或“当前无 active mainline”。
