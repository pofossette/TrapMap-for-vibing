# Runtime Recomposition Plan 02: Backend Core Kernel Extraction

## 状态

- 状态：`active`
- 依赖：`00-baseline-and-target-architecture.md`

## 目标

把当前 `packages/server` 中与宿主无关的核心能力抽成 `backend core`，让 `gateway / identity-access / knowledge-read / knowledge-write / candidate-ingestion / governance-review / job-runtime` 这些逻辑服务都复用同一套应用编排、端口和 capability model。

## 当前问题

- `packages/server` 同时承担了：
  - Fastify app host
  - route registration
  - runtime startup sequence
  - worker bootstrap
  - repo wiring
  - application service orchestration
- 这些层次混在一个包中，导致“能跑”但不容易“多宿主复用”。

## 核心抽取对象

### 1. Runtime capability model

保留并上提现有运行时语义：

- `deploymentProfile`
- `runtimeMode`
- `serviceUnit`
- `taskTransport`
- `routeSurface`
- `asyncOwnershipExpectation`

### 2. Application ports

抽象并稳定：

- repo ports
- queue/outbox ports
- retrieval read model ports
- actor/auth lookup ports
- audit/metrics/telemetry ports
- internal service invocation ports

### 3. Use-case orchestration

把以下逻辑从“Fastify route 内实现”进一步收口为 host-agnostic use cases：

- command handling
- review / governance flows
- retrieval query orchestration
- async job scheduling
- lifecycle follow-up

### 4. Service ownership model

核心内核不仅要抽公共逻辑，还要冻结服务拥有权模型：

- 哪些能力属于 `identity-access`
- 哪些能力属于 `knowledge-read`
- 哪些能力属于 `knowledge-write`
- 哪些能力属于 `candidate-ingestion`
- 哪些能力属于 `governance-review`
- 哪些能力属于 `job-runtime`

### 5. Invocation contract model

核心内核必须定义“内部服务如何被调用”，而不是把这件事留给宿主随意发挥：

- 哪些调用是同步 request/response
- 哪些调用是 fire-and-forget command
- 哪些调用必须经由 queue / workflow
- 哪些调用允许 in-process shortcut
- 哪些错误允许 fail-open，哪些必须 fail-closed

## 建议包布局

- `packages/backend-core/src/runtime/*`
- `packages/backend-core/src/ports/*`
- `packages/backend-core/src/use-cases/*`
- `packages/backend-core/src/modules/*`
- `packages/backend-core/src/testing/*`

其中：

- `modules` 负责按 bounded context 组合 use cases
- `ports` 负责定义宿主需要注入的依赖
- `runtime` 负责 capability / service boundary / topology contracts

建议新增：

- `packages/backend-core/src/ports/internal/*`
- `packages/backend-core/src/ports/config/*`
- `packages/backend-core/src/runtime/invocation/*`

## 边界划分建议

### Identity-access

- auth / session
- access key issuance
- membership / team lookup
- RBAC policy evaluation

### Knowledge-read

- retrieval query
- query trace / feedback correlation read side
- retrieval caches / read-model projections
- 只读 status / dashboard oriented read models

### Knowledge-write

- knowledge / trap / skill command
- lifecycle transitions
- maintenance / decay / activation / deactivation
- authoritative follow-up trigger

### Candidate-ingestion

- candidate intake
- normalization / duplicate pre-processing
- candidate status advancement

### Governance-review

- review / governance decisions
- human-in-the-loop queues
- conflict resolution / remediation queue

### Job-runtime

- task queue
- outbox publisher
- workflow runs
- projection follow-up
- invalidation events

## Internal Port Contract 要求

所有 internal port 至少要有同一套 contract 维度，不能只定义函数签名：

### 通用 contract 字段

- `requestId`
- `traceContext`
- `actorContext`
- `teamContext`
- `deadlineMs`
- `idempotencyKey`（仅 command 型调用必填）
- `consistencyMode`（强一致 / 最终一致 / 可降级）

### 通用行为约束

- 明确是否允许重试
- 明确超时后的调用方责任
- 明确是否允许 partial response
- 明确错误是用户错误、权限错误、依赖错误、超时错误还是一致性错误
- 明确日志和指标标签

### 每类 port 的调用语义

#### `IdentityAccessPort`

- 同步调用
- 默认 fail-closed
- 超时后不得自动放宽权限
- 必须支持批量 permission decision

#### `KnowledgeReadPort`

- 同步调用
- 允许 read-side timeout budget
- 允许按 capability 决定是否 fallback 到本地 read model
- 必须传播 query correlation id

#### `KnowledgeWritePort`

- 同步 command entry
- 必须支持 idempotency
- 明确 authoritative write ack 与 async follow-up 已排队是两个不同状态

#### `CandidateIngestionPort`

- 允许同步 submit + 异步处理
- 返回值要区分“已接收”和“已处理”
- 必须携带 candidate correlation id

#### `GovernanceReviewPort`

- 同步查询人工介入状态可以存在
- 真正的治理推进通常是 command + queue
- 必须清楚记录人工处理人与队列状态变迁

#### `JobRuntimePort`

- 主要是 command / enqueue / workflow control
- 不暴露业务域语义
- 必须支持 retry metadata 与 lease / reclaim metadata

## Transport-Agnostic 配置模型

为避免后续引入 RPC 时重新发明配置，`backend-core` 需要先定义可由宿主消费的统一配置模型。

### 每个 internal service 的基础配置

- `enabled`
- `mode`: `in-process | http | rpc`
- `baseUrl` 或 endpoint descriptor
- `timeoutMs`
- `connectTimeoutMs`
- `maxRetries`
- `retryBackoffMs`
- `circuitBreakerEnabled`
- `failOpen`

### 每个异步服务的基础配置

- `transport`: `in-memory | postgres | rabbitmq`
- `queueName`
- `consumerGroup` 或 worker identity
- `leaseTtlMs`
- `reclaimIntervalMs`
- `maxAttempts`
- `deadLetterPolicy`

### 每个调用面都应支持的横切配置

- `traceHeaderName`
- `requestIdHeaderName`
- `authContextHeaderName`
- `teamContextHeaderName`
- `correlationIdHeaderName`
- `defaultDeadlineMs`
- `maxPayloadBytes`

## 首期必须预留的可配置项

下面这些配置即使第一阶段只做 in-process 或 internal HTTP，也必须先预留命名和语义：

### Internal service mode

- `TRAPMAP_INTERNAL_IDENTITY_ACCESS_MODE`
- `TRAPMAP_INTERNAL_KNOWLEDGE_READ_MODE`
- `TRAPMAP_INTERNAL_KNOWLEDGE_WRITE_MODE`
- `TRAPMAP_INTERNAL_CANDIDATE_INGESTION_MODE`
- `TRAPMAP_INTERNAL_GOVERNANCE_REVIEW_MODE`
- `TRAPMAP_INTERNAL_JOB_RUNTIME_MODE`

可选值建议统一为：

- `in-process`
- `http`
- `rpc`

### Internal endpoint

- `TRAPMAP_INTERNAL_IDENTITY_ACCESS_URL`
- `TRAPMAP_INTERNAL_KNOWLEDGE_READ_URL`
- `TRAPMAP_INTERNAL_KNOWLEDGE_WRITE_URL`
- `TRAPMAP_INTERNAL_CANDIDATE_INGESTION_URL`
- `TRAPMAP_INTERNAL_GOVERNANCE_REVIEW_URL`
- `TRAPMAP_INTERNAL_JOB_RUNTIME_URL`

### Internal timeout / retry

- `TRAPMAP_INTERNAL_DEFAULT_TIMEOUT_MS`
- `TRAPMAP_INTERNAL_IDENTITY_ACCESS_TIMEOUT_MS`
- `TRAPMAP_INTERNAL_KNOWLEDGE_READ_TIMEOUT_MS`
- `TRAPMAP_INTERNAL_KNOWLEDGE_WRITE_TIMEOUT_MS`
- `TRAPMAP_INTERNAL_MAX_RETRIES`
- `TRAPMAP_INTERNAL_RETRY_BACKOFF_MS`

### Internal propagation

- `TRAPMAP_INTERNAL_TRACE_HEADER_NAME`
- `TRAPMAP_INTERNAL_REQUEST_ID_HEADER_NAME`
- `TRAPMAP_INTERNAL_CORRELATION_ID_HEADER_NAME`
- `TRAPMAP_INTERNAL_TEAM_HEADER_NAME`
- `TRAPMAP_INTERNAL_ACTOR_HEADER_NAME`

### Internal async routing

- `TRAPMAP_INTERNAL_JOB_RUNTIME_TRANSPORT`
- `TRAPMAP_INTERNAL_GOVERNANCE_QUEUE_NAME`
- `TRAPMAP_INTERNAL_CANDIDATE_QUEUE_NAME`
- `TRAPMAP_INTERNAL_OUTBOX_QUEUE_NAME`

## 配置原则

- 同一类配置必须对所有 internal services 使用一致命名模式。
- `mode` 必须是宿主可切换项，而不是代码里散落的条件分支。
- `rpc` 可以暂时未实现，但配置枚举值要先保留。
- 轻宿主可把所有 mode 解析为 `in-process`。
- 重宿主可按 service 粒度混用 `in-process`、`http`、`rpc`。

## 分阶段实施

### Phase 1. 抽 runtime and ports

- 先把 runtime contracts 和 host 注入接口抽出
- 同时冻结 internal port contract 和配置模型
- 不急于改所有 route 文件

### Phase 2. 抽 use cases 和 service ownership

- 从更细粒度服务边界中挑最稳定的高价值流先抽
- 优先 RBAC decision、retrieval、operations/status、knowledge lifecycle、review queue
- 为这些高价值流补 invocation semantics、timeout、retry、idempotency 约束

### Phase 3. 抽 bounded-context modules

- 把 route host 改为只做 transport mapping
- 让 worker host 改为只做 handler registration
- 把各逻辑服务对核心内核的装配边界固定下来
- 把 env/config 到 internal port adapter 的映射固定下来

### Phase 4. 收敛 server 为兼容壳层

- 让 `packages/server` 成为过渡期宿主或 facade
- 为后续 `host-local` / `host-distributed` 接管做准备

## 风险

- 如果 ports 抽得过粗，最终只会把整个 `app.skillShareer` 原样搬过去。
- 如果 internal port 没有统一 contract 维度，后续 HTTP adapter 和 RPC adapter 会产生双重语义。
- 如果 use cases 抽得过早但没有 bounded context 归属，会制造新的耦合层。
- 如果不先冻结 `identity-access` 与 `governance-review` 这类高耦合服务的 ownership，后续仍会在 gateway 或 write path 中重复判断权限和人工介入状态。
- 如果 runtime capability model 不先冻结，轻宿主和重宿主会各自发明一套 capability 解释。

## 验收标准

- 核心业务编排不再依赖 Fastify 或进程入口文件。
- 各逻辑服务都能通过注入 ports 复用核心逻辑，而不是复制一份服务内业务编排。
- internal port contract、配置语义和 transport adapter seam 都有单一权威定义。
- `packages/server` 中 transport/wiring 与 application orchestration 的边界明显变清楚。
