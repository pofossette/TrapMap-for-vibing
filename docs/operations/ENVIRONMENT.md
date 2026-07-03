# TrapMap 环境变量参考

本文档是 TrapMap 所有环境变量的完整参考。

## 常用起步变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `TRAPMAP_SYSTEM_ADMIN_KEY` | 管理员密钥；仅在需要 system-admin 能力时配置 | `openssl rand -hex 32` 生成 |
| `OPENAI_API_KEY` | OpenAI API 密钥；未配置时 AI provider 会回退到 `fallback` | `sk-...` |
| `GEMINI_API_KEY` | Google GenAI 密钥；设置后 provider 可自动切到 `google-genai` | `AIza...` |

## 数据库配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRAPMAP_DATABASE_URL` | PostgreSQL 连接字符串（设置后启用 PostgresStore） | 空（使用 JsonStore） |
| `DATABASE_URL` | PostgreSQL 连接字符串（`host-local` / `host-distributed` 同样接受） | 空 |
| `TRAPMAP_DATA_FILE` | JSON 文件存储路径（兼容回退，可选） | `.data/skill-shareer.json` |

> 设置 `TRAPMAP_DATABASE_URL` 或 `DATABASE_URL` 后，宿主启动时会连接 PostgreSQL。Drizzle migration runner 的权威迁移目录仍是 `packages/server/drizzle/`。

### 可选部署拆分与任务传输

以下变量用于“按部署拆分进程”和“可选切换 task transport”。默认值保持当前模块化单体 + PostgreSQL task queue，不需要 MQ。

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRAPMAP_DEPLOYMENT_PROFILE` | 目标部署形态：`local-agent`、`team-monolith`、`distributed`。这是产品/部署叙事层，不直接替代 runtime/preset | 未设置（按 `TRAPMAP_DEPLOYMENT_PRESET` 推断） |
| `TRAPMAP_DEPLOYMENT_PRESET` | 部署预设：`monolith`、`api`、`candidate-worker`、`governance-worker`、`outbox-worker` | `monolith` |
| `TRAPMAP_GATEWAY_URL` | CLI 默认连接的单一 gateway URL；即使 `distributed` 也不改成多服务地址 | `http://127.0.0.1:4000` |
| `TRAPMAP_TASK_TRANSPORT` | 异步任务传输提供者：`postgres` 或 `rabbitmq` | `postgres` |
| `TRAPMAP_RABBITMQ_URL` | RabbitMQ 连接串；仅在 `TRAPMAP_TASK_TRANSPORT=rabbitmq` 时必填 | 空 |
| `TRAPMAP_RABBITMQ_TASK_EXCHANGE` | RabbitMQ task exchange 名称 | `trapmap.tasks` |
| `TRAPMAP_RABBITMQ_TASK_QUEUE` | 当前 worker 绑定的 task queue 名称 | `trapmap.default` |
| `TRAPMAP_RABBITMQ_PREFETCH` | RabbitMQ consumer prefetch | `1` |

profile 兼容约定：

- 未设置 `TRAPMAP_DEPLOYMENT_PROFILE` 时：
  - `monolith` 默认推断为 `team-monolith`
  - `api` / `candidate-worker` / `governance-worker` / `outbox-worker` 默认推断为 `distributed`
- 显式设置 `TRAPMAP_DEPLOYMENT_PROFILE=local-agent` 时：
  - 允许本地单进程、最小能力面
  - 不要求 PostgreSQL 或完整 async ownership
  - CLI 仍通过单一 gateway 接入
- 显式设置 `TRAPMAP_DEPLOYMENT_PROFILE=distributed` 时：
  - 表示 gateway + async ownership 的分布式目标形态
  - 不是 `runtimeMode=combined` 的别名

profile capability 语义：

- `local-agent`
  - `routeSurface=minimal-agent`
  - `asyncOwnershipExpectation=local-owned`
  - `storagePosture=json-store-ok`
  - `authTeamExpectation=single-user`
- `team-monolith`
  - `routeSurface=gateway-core`
  - `asyncOwnershipExpectation=split-owned`
  - `storagePosture=postgres-required`
  - `authTeamExpectation=team-auth`
- `distributed`
  - gateway 进程通常是 `routeSurface=gateway-core`
  - worker 进程通常是 `routeSurface=worker-status`
  - `asyncOwnershipExpectation=remote-expected`
  - `storagePosture=postgres-required`
  - `authTeamExpectation=team-auth`

预设映射约定：

- `monolith` -> `runtimeMode=combined`, `serviceUnit=full-platform`
- `api` -> `runtimeMode=api`, `serviceUnit=full-platform`
- `candidate-worker` -> `runtimeMode=task-worker`, `serviceUnit=candidate-ingestion`
- `governance-worker` -> `runtimeMode=task-worker`, `serviceUnit=knowledge-governance`
- `outbox-worker` -> `runtimeMode=outbox-worker`, `serviceUnit=knowledge-governance`

支持组合：

- 默认：`TRAPMAP_DEPLOYMENT_PRESET=monolith` + `TRAPMAP_TASK_TRANSPORT=postgres`
- 拆分但仍走 PG task queue：`TRAPMAP_DEPLOYMENT_PRESET=api|candidate-worker|governance-worker|outbox-worker` + `TRAPMAP_TASK_TRANSPORT=postgres`
- 可选 RabbitMQ task transport：通常用于 `candidate-worker` 或 `governance-worker`

关键约束：

- `domain_event_outbox` 在所有模式下都保留 PostgreSQL，不受 `TRAPMAP_TASK_TRANSPORT` 影响。
- `TRAPMAP_TASK_TRANSPORT=rabbitmq` 只适用于 task-capable runtime。
- 没有明确 backlog / isolation 需求时，建议保持 `TRAPMAP_TASK_TRANSPORT=postgres`。
- `TRAPMAP_TASK_TRANSPORT=rabbitmq` 且 `runtimeMode=api` 时，不应假设 API 进程自己拥有 shared-job backlog；应确保独立 worker preset 在运行，这类风险会通过 `configGovernance.conflictWarnings` 暴露。

### Phase 4 freeze

Phase 4 freeze 只冻结当前 selector env / provider-specific env / fail-fast posture 的 truth surface，不引入新的运行时配置模型。

- selector env truth 以 `TRAPMAP_DEPLOYMENT_PROFILE`、`TRAPMAP_DEPLOYMENT_PRESET`、`TRAPMAP_TASK_TRANSPORT` 为中心。它们决定 profile、preset 与 task transport 的选择面；secondary docs 不得再把这些入口改写成新的 generic config taxonomy。
- provider-specific env 继续留在 owner seam。AI provider env 仍以 `AI_PROVIDER`、`OPENAI_API_KEY`、`GEMINI_API_KEY` 等当前 server/shared runtime 事实为准；distributed internal service URLs 仍以 `TRAPMAP_GATEWAY_URL`、`TRAPMAP_IDENTITY_ACCESS_URL`、`TRAPMAP_KNOWLEDGE_READ_URL`、`TRAPMAP_KNOWLEDGE_WRITE_URL`、`TRAPMAP_CANDIDATE_INGESTION_URL`、`TRAPMAP_GOVERNANCE_REVIEW_URL`、`TRAPMAP_JOB_RUNTIME_URL` 为当前 owner-specific env。
- `packages/host-distributed/src/config/service-config.ts` 现在同时冻结内部服务发现默认值：`distributed` profile 默认走 compose Docker DNS（`gateway`、`identity-access`、`knowledge-read`、`knowledge-write`、`candidate-worker`、`governance-worker`、`outbox-worker`），非 distributed / 本地进程默认走 `localhost`，显式 `TRAPMAP_*_URL` 覆盖优先级最高。
- `packages/host-distributed/src/config/service-config.ts` 现在还冻结了首个 host-distributed transport seam：`TRAPMAP_KNOWLEDGE_WRITE_TRANSPORT` 只允许 `http` 或 `rpc`，默认值是 `http`。当前它只影响 `governance-review -> knowledge-write` 与 `candidate-ingestion -> knowledge-write` 这两个 owner-hop 的 host wiring，不改变 gateway external surface，也不改变 `KnowledgeWritePort` contract。
- 当前 `rpc` 值表示仓库自有 envelope RPC，而不是 Connect RPC 或 gRPC。切到更正式协议层需要额外接受 Protobuf schema、Buf/codegen、以及对应 operator/runtime 复杂度进入主线 truth source；在此之前 `TRAPMAP_KNOWLEDGE_WRITE_TRANSPORT=rpc` 只代表启用当前 pilot seam。
- 当前 closeout 证据已覆盖两条 owner-hop：
  - `gateway -> governance-review -> knowledge-write`
  - `gateway -> candidate-ingestion -> knowledge-write`（通过 `manual-result` distributed closeout 样板验证）
- 推荐组合冻结为：`local-agent` -> `light` + in-process/internal defaults + `json-store-ok`；`team-monolith` -> `light` + `postgres-required` + `gateway-core` + `split-owned`；`distributed` -> `heavy` + service/gateway split + `remote-expected`。
- fail-fast / fallback 规则冻结为：`TRAPMAP_TASK_TRANSPORT=rabbitmq` 时必须同时提供 RabbitMQ config；`distributed` profile 需要 PostgreSQL；`local-agent` 仍允许 `.data/skill-shareer.json` 这类 JSON store fallback；internal service URLs 在 `in-process` mode 下继续视为 ignored config，而不是必填值。
- target-pruning 仅是文档边界。`light` / `heavy` 不是新的 env value，也不是新的 runtime profile；optional dependency / tree-shaking 规则只表达当前 intent 与 non-goal，不表示仓库已经实现自动化 package pruning。

Phase 2 runtime / failure contract 补充约定：

- `GET /v1/operations/status/async` 现在是 async operator truth surface，统一暴露：
  - `runtimeContract`
  - `idempotencyContract`
  - `retryResumeContract`
  - `freshnessContract`
  - `failureTaxonomy`
- `runtimeMode=api` 在 PostgreSQL 部署下允许报告 `remote` worker state；这不是故障。
- `runtimeMode=combined`、`task-worker`、`outbox-worker` 只有在本地应拥有的 async work 未运行时才应报告 `degraded` / `not-ready`。
- `freshnessContract.writeVisibility.authoritativeWriteCommitted=true` 表示真相写已提交；若仍然读到旧结果，应优先排查 projection lag，而不是直接回滚写路径。
- `retryResumeContract.workflowCheckpointSource` 的当前权威落点是 `workflow_runs.stats`。

Phase 3 operator / config governance 补充约定：

- `GET /v1/operations/status/async` 现在额外暴露：
  - `operatorHome`
  - `configGovernance`
  - `capacityModel`
  - `bulkOperations`
- `configGovernance.fingerprint` 是当前 deployment/runtime/task-transport/profile-aware capability 组合的稳定摘要，不是 secrets dump。
- `configGovernance.deprecatedEnvKeys` 当前用于提示仍被读取或仍在环境中出现的旧变量，例如 `DATABASE_URL` 与旧 embedding env alias。
- `configGovernance.conflictWarnings` 用于暴露 profile/preset/task-transport 之间的高风险组合，而不是替代启动期 schema 校验。
- `capacityModel` 当前提供 backlog、平均 handler latency、cache pending invalidation 与 database-pool 是否配置的摘要；它是 operator 容量建模入口，不是性能基准报告。

### 预留的内部服务通信配置

以下变量是为 runtime recomposition / 重后端微服务化预留的 planned config surface。当前版本可以尚未全部实现，但命名和语义应尽量按这里冻结，避免后续宿主、adapter 和文档各自发明一套。

#### Internal service mode

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_INTERNAL_IDENTITY_ACCESS_MODE` | `identity-access` 内部调用模式：`in-process`、`http`、`rpc` | `in-process` |
| `TRAPMAP_INTERNAL_KNOWLEDGE_READ_MODE` | `knowledge-read` 内部调用模式 | `in-process` |
| `TRAPMAP_INTERNAL_KNOWLEDGE_WRITE_MODE` | `knowledge-write` 内部调用模式 | `in-process` |
| `TRAPMAP_INTERNAL_CANDIDATE_INGESTION_MODE` | `candidate-ingestion` 内部调用模式 | `in-process` |
| `TRAPMAP_INTERNAL_GOVERNANCE_REVIEW_MODE` | `governance-review` 内部调用模式 | `in-process` |
| `TRAPMAP_INTERNAL_JOB_RUNTIME_MODE` | `job-runtime` 内部调用模式 | `in-process` |

语义约定：

- `in-process`：宿主内直接调用核心内核 port
- `http`：通过内部 HTTP/JSON adapter 调用
- `rpc`：为未来正式 RPC adapter 预留；首期可未实现

#### Internal service endpoint

以下 `TRAPMAP_INTERNAL_*_URL` 仍是未来内部 transport mode/rpc seam 的预留 planned surface，不是当前 `host-distributed` 已生效的服务发现变量。当前真实生效的是上面的 `TRAPMAP_*_URL` 系列。

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_INTERNAL_IDENTITY_ACCESS_URL` | `identity-access` 内部 endpoint | 空 |
| `TRAPMAP_INTERNAL_KNOWLEDGE_READ_URL` | `knowledge-read` 内部 endpoint | 空 |
| `TRAPMAP_INTERNAL_KNOWLEDGE_WRITE_URL` | `knowledge-write` 内部 endpoint | 空 |
| `TRAPMAP_INTERNAL_CANDIDATE_INGESTION_URL` | `candidate-ingestion` 内部 endpoint | 空 |
| `TRAPMAP_INTERNAL_GOVERNANCE_REVIEW_URL` | `governance-review` 内部 endpoint | 空 |
| `TRAPMAP_INTERNAL_JOB_RUNTIME_URL` | `job-runtime` 内部 endpoint | 空 |

约定：

- 仅当对应 service mode 为 `http` 或 `rpc` 时必填
- `in-process` 模式下应忽略这些地址

#### Internal timeout / retry

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_INTERNAL_DEFAULT_TIMEOUT_MS` | 内部同步调用默认超时预算 | `3000` |
| `TRAPMAP_INTERNAL_IDENTITY_ACCESS_TIMEOUT_MS` | `identity-access` 调用超时 | 继承默认值 |
| `TRAPMAP_INTERNAL_KNOWLEDGE_READ_TIMEOUT_MS` | `knowledge-read` 调用超时 | 继承默认值 |
| `TRAPMAP_INTERNAL_KNOWLEDGE_WRITE_TIMEOUT_MS` | `knowledge-write` 调用超时 | 继承默认值 |
| `TRAPMAP_INTERNAL_MAX_RETRIES` | 内部同步调用默认最大重试次数 | `1` |
| `TRAPMAP_INTERNAL_RETRY_BACKOFF_MS` | 内部同步调用默认退避时间 | `200` |

约定：

- `identity-access` 默认应 fail-closed，不因超时自动放宽权限
- `knowledge-read` 可按 capability 允许更短 timeout 或有限 fallback
- `knowledge-write` 的 retry 必须考虑 idempotency

#### Internal propagation headers

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_INTERNAL_TRACE_HEADER_NAME` | 内部 trace header 名 | `traceparent` |
| `TRAPMAP_INTERNAL_REQUEST_ID_HEADER_NAME` | 内部 request id header 名 | `x-request-id` |
| `TRAPMAP_INTERNAL_CORRELATION_ID_HEADER_NAME` | 内部 correlation id header 名 | `x-correlation-id` |
| `TRAPMAP_INTERNAL_TEAM_HEADER_NAME` | 内部 team context header 名 | `x-team-id` |
| `TRAPMAP_INTERNAL_ACTOR_HEADER_NAME` | 内部 actor context header 名 | `x-actor-id` |

#### Internal async routing

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_INTERNAL_JOB_RUNTIME_TRANSPORT` | 内部 job runtime transport：`in-memory`、`postgres`、`rabbitmq` | `postgres` |
| `TRAPMAP_INTERNAL_GOVERNANCE_QUEUE_NAME` | governance review 队列名 | `trapmap.governance` |
| `TRAPMAP_INTERNAL_CANDIDATE_QUEUE_NAME` | candidate ingestion 队列名 | `trapmap.candidate` |
| `TRAPMAP_INTERNAL_OUTBOX_QUEUE_NAME` | outbox runtime 队列名 | `trapmap.outbox` |

当前建议：

- `local-agent` 与 `team-monolith` 默认保持全部 internal service `in-process`
- `distributed` 首期可以按服务逐步切到 `http`
- `rpc` 不再只是纯预留值：当前仅为 `knowledge-write` owner-hop 试点开放，通过 `TRAPMAP_KNOWLEDGE_WRITE_TRANSPORT=rpc` 启用；除该 seam 外，其余内部调用仍按现状保持 `http` 或 `in-process`

### 预留的重后端缓存配置

以下变量同样属于 runtime recomposition / 重后端微服务化的 planned config surface。它们主要面向 `knowledge-read` 及其相关只读消费者，目标是冻结缓存层级、key 语义、失效与预热策略，而不是让缓存成为新的真相源。

#### Retrieval local cache

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_RETRIEVAL_LOCAL_CACHE_ENABLED` | 启用 read-side 本地缓存 | `true` |
| `TRAPMAP_RETRIEVAL_READ_MODEL_CACHE_TTL_MS` | retrieval read-model cache TTL | `60000` |
| `TRAPMAP_RETRIEVAL_INTENT_CACHE_TTL_MS` | intent cache TTL | `1800000` |
| `TRAPMAP_RETRIEVAL_INTENT_CACHE_MAX_SIZE` | intent cache 最大条目数 | `200` |
| `TRAPMAP_RETRIEVAL_QUERY_RESULT_CACHE_TTL_MS` | exact query result cache TTL | `30000` |
| `TRAPMAP_RETRIEVAL_QUERY_RESULT_CACHE_MAX_SIZE` | exact query result cache 最大条目数 | `500` |
| `TRAPMAP_RETRIEVAL_FILTER_CACHE_TTL_MS` | filter/intermediate cache TTL | `60000` |
| `TRAPMAP_RETRIEVAL_FILTER_CACHE_MAX_SIZE` | filter/intermediate cache 最大条目数 | `500` |
| `TRAPMAP_RETRIEVAL_REVISION_OBJECT_CACHE_TTL_MS` | immutable revision object cache TTL | `3600000` |
| `TRAPMAP_RETRIEVAL_REVISION_OBJECT_CACHE_MAX_SIZE` | immutable revision object cache 最大条目数 | `2000` |

约定：

- 本地缓存适合 `knowledge-read` 的 process-local 热点复用。
- query result cache 仅适用于确定性请求，不建议缓存带调试/实验参数的请求。
- revision object cache 应优先使用 `artifactId + revisionNo` / `knowledgeId + revisionNo` 这类不可变 key。

#### Distributed invalidation

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_CACHE_INVALIDATION_MODE` | 缓存失效传播模式：`in-process`、`outbox`、`queue` | `in-process` |
| `TRAPMAP_CACHE_INVALIDATION_CHANNEL` | 分布式失效 channel / topic 名称 | `trapmap.cache.invalidate` |
| `TRAPMAP_CACHE_INVALIDATION_BATCH_SIZE` | 单次失效广播批量大小 | `100` |
| `TRAPMAP_CACHE_INVALIDATION_FLUSH_INTERVAL_MS` | 失效事件批量刷出间隔 | `500` |
| `TRAPMAP_CACHE_INVALIDATION_MAX_LAG_MS` | 允许的失效传播滞后预算 | `5000` |

约定：

- `local-agent` / `team-monolith` 可保持 `in-process`。
- `distributed` 应逐步切到 `outbox` 或 `queue` 驱动。
- 先做 distributed invalidation，再决定是否引入 shared remote cache。

#### Remote cache 预留

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_REMOTE_CACHE_ENABLED` | 启用远程共享缓存 | `false` |
| `TRAPMAP_REMOTE_CACHE_PROVIDER` | 远程缓存提供者；建议预留 `redis` | `redis` |
| `TRAPMAP_REMOTE_CACHE_URL` | 远程缓存连接地址 | 空 |
| `TRAPMAP_REMOTE_CACHE_PREFIX` | 远程缓存 key 前缀 | `trapmap` |
| `TRAPMAP_REMOTE_CACHE_DEFAULT_TTL_MS` | 远程缓存默认 TTL | `60000` |
| `TRAPMAP_REMOTE_CACHE_FAIL_OPEN` | 远程缓存不可用时是否降级为本地/直查 | `true` |

当前建议：

- 首期不要把远程缓存设为必需依赖。
- 若启用远程缓存，优先用于：
  - exact query result cache
  - immutable revision object cache
- 不建议首期把 candidate processing state、governance queue state 或全量 permission decision 直接塞进远程缓存。

#### Cache key / warmup 约束

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_RETRIEVAL_CACHE_KEY_INCLUDE_POLICY_REVISION` | retrieval cache key 是否强制包含 policy/security revision | `true` |
| `TRAPMAP_RETRIEVAL_CACHE_KEY_INCLUDE_INDEX_REVISION` | retrieval cache key 是否强制包含 index/data revision | `true` |
| `TRAPMAP_RETRIEVAL_WARMUP_ENABLED` | 是否启用 read-host 启动预热 | `false` |
| `TRAPMAP_RETRIEVAL_WARMUP_TOP_QUERY_LIMIT` | 启动时预热的热点 query 数量 | `100` |
| `TRAPMAP_RETRIEVAL_WARMUP_TOP_CAPSULE_LIMIT` | 启动时预热的热点 capsule 数量 | `100` |

关键约束：

- retrieval cache key 不应使用 `queryId`。
- retrieval 结果缓存必须带 `teamId` 与 policy/security revision 维度。
- 不要依赖 TTL 作为唯一一致性手段；写路径仍要负责 invalidation。

### 预留的批量入库 / bulk ingestion 配置

以下变量用于重后端下的导入、回填、批量候选入库、索引重建和 projection refresh 等 bulk path。目标是把 online command path 与 bulk path 明确分离，并冻结 batch commit、retry、resume 的控制面。

#### Bulk write limits

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_BULK_WRITE_BATCH_SIZE` | 单批默认记录数 | `100` |
| `TRAPMAP_BULK_WRITE_MAX_ROWS_PER_TX` | 单事务最大写入行数 | `500` |
| `TRAPMAP_BULK_WRITE_MAX_BYTES_PER_BATCH` | 单批最大 payload 大小（字节） | `1048576` |
| `TRAPMAP_BULK_WRITE_MAX_CONCURRENT_BATCHES` | 并发批次数 | `2` |

约定：

- bulk path 应分批提交，不建议把超大导入放进单个长事务。
- 这些限制既适用于 bulk ingestion，也适用于 rebuild/backfill 类作业。

#### Bulk retry / resume

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_BULK_WRITE_RETRY_LIMIT` | 单批最大重试次数 | `3` |
| `TRAPMAP_BULK_WRITE_RETRY_BACKOFF_MS` | 单批重试退避时间 | `1000` |
| `TRAPMAP_BULK_WRITE_JOB_LEASE_TTL_MS` | bulk job lease TTL | `60000` |
| `TRAPMAP_BULK_WRITE_RESUME_ENABLED` | 是否允许从 offset/checkpoint 恢复 | `true` |
| `TRAPMAP_BULK_WRITE_IDEMPOTENCY_REQUIRED` | 是否要求 bulk job 提供 idempotency key | `true` |

约定：

- bulk job 应支持 `jobId / batchId / idempotencyKey / resumeFromOffset`。
- authoritative write 与 outbox append 仍要在每批事务内原子提交。
- 不同批次之间不要求单一大事务。

Phase 2 补充：

- `TRAPMAP_BULK_WRITE_IDEMPOTENCY_REQUIRED=true` 不只是建议项；它与 `/v1/operations/status/async.idempotencyContract.bulkJobKey` 一起构成当前 bulk contract。
- bulk path 的 retry / resume 解释必须和 queue/outbox 共享同一套 failure taxonomy：
  - transient infra / timeout -> `retryable-async-failure`
  - retry budget exhausted -> `permanent-failure`
  - committed write but projection still stale -> `stale-projection`

#### Bulk write mode

| 变量 | 说明 | 计划默认值 |
|------|------|------------|
| `TRAPMAP_BULK_WRITE_MODE` | 默认 bulk write 模式：`multi-row-upsert`、`staging-merge`、`copy-merge` | `multi-row-upsert` |
| `TRAPMAP_BULK_WRITE_STAGING_ENABLED` | 是否启用 staging table + merge | `false` |
| `TRAPMAP_BULK_WRITE_COPY_ENABLED` | 是否启用 `COPY` 类批量导入 | `false` |

当前建议：

- 当前阶段优先 `multi-row-upsert`
- 当导入量或重建量明显上升后，再评估：
  - `staging-merge`
  - `copy-merge`

关键约束：

- 不要让 bulk path 直接复用在线 API 的逐条写逻辑无限循环。
- online command path 继续优先小事务、低延迟。
- derived projection / index rebuild 应作为 Phase B follow-up，而不是和所有 truth write 强绑定在同一超大事务里。

### 可选 Graph DB 查询后端

TrapMap 的 graph DB 是可选查询后端。PostgreSQL `graph_index_documents` 仍是图索引的权威真相源；可选 graph DB 仅用于查询期图遍历与扩张，不接管图数据所有权。

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRAPMAP_GRAPH_DB_ENABLED` | 启用可选 graph DB 查询后端 | `false` |
| `TRAPMAP_GRAPH_DB_PROVIDER` | 图查询后端提供者；当前仅支持 `neo4j` | `neo4j` |
| `TRAPMAP_GRAPH_DB_URI` | Neo4j 连接地址；仅在启用 graph DB 时必填 | 空 |
| `TRAPMAP_GRAPH_DB_USERNAME` | Neo4j 用户名；仅在启用 graph DB 时必填 | 空 |
| `TRAPMAP_GRAPH_DB_PASSWORD` | Neo4j 密码；仅在启用 graph DB 时必填 | 空 |
| `TRAPMAP_GRAPH_DB_DATABASE` | Neo4j database 名称 | `neo4j` |
| `TRAPMAP_GRAPH_DB_FAIL_OPEN` | graph DB 不可用时是否自动回退到内存 `graphology` backend | `true` |
| `TRAPMAP_GRAPH_DB_SYNC_ON_WRITE` | 图索引写入时是否同步刷新 graph DB 投影 | `true` |

行为约定：

- `TRAPMAP_GRAPH_DB_ENABLED=false` 时，查询路径保持现状，使用内存 `graphology` backend。
- `TRAPMAP_GRAPH_DB_ENABLED=true` 且后端健康时，查询路径可切到 `neo4j` backend。
- `TRAPMAP_GRAPH_DB_ENABLED=true` 且后端异常、同时 `TRAPMAP_GRAPH_DB_FAIL_OPEN=true` 时，请求会回退到内存 `graphology` backend，而不是阻断检索。
- `TRAPMAP_GRAPH_DB_ENABLED=true` 但缺少 `URI`、`USERNAME`、`PASSWORD` 等必需配置时，服务启动阶段会明确报错。

本地最小启动示例：

```bash
# 1. 启动本地 Neo4j（与默认 docker compose 分离，按需启用）
docker run --name trapmap-neo4j \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/neo4jpass \
  -d neo4j:5

# 2. 启用 TrapMap graph DB flags
export TRAPMAP_GRAPH_DB_ENABLED=true
export TRAPMAP_GRAPH_DB_PROVIDER=neo4j
export TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:7687
export TRAPMAP_GRAPH_DB_USERNAME=neo4j
export TRAPMAP_GRAPH_DB_PASSWORD=neo4jpass
export TRAPMAP_GRAPH_DB_DATABASE=neo4j
export TRAPMAP_GRAPH_DB_FAIL_OPEN=true
export TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true

# 3. 可选：先做连通性检查，再启动服务
pnpm --filter @trapmap/server graph-db:check
pnpm dev:local-agent
```

补充说明：

- checked-in `docker-compose.yml` 默认只启动 `server + postgres`；Neo4j 需要你本地额外启动或通过 compose override 自行接入。
- 当前 rollout 默认值保持保守策略：所有环境都默认 `TRAPMAP_GRAPH_DB_ENABLED=false`，只有显式设置环境变量时才启用 Neo4j backend。
- `TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true` 时，图索引写入会额外尝试刷新 Neo4j projection；若 Neo4j 短暂不可用且 `TRAPMAP_GRAPH_DB_FAIL_OPEN=true`，主检索路径仍会继续使用 memory fallback。

开发入口建议：

- `pnpm dev -- local-agent`
- `pnpm dev -- team-monolith`
- `pnpm dev -- gateway`
- `pnpm dev -- candidate-worker`
- `pnpm dev -- governance-worker`
- `pnpm dev -- outbox-worker`

兼容脚本 `pnpm dev:server:compat*` 与旧根别名 `pnpm dev:local-agent`、`pnpm dev:team-monolith`、`pnpm dev:distributed:*` 仍可使用，但不再作为主要文档入口。正式入口优先使用 `pnpm dev -- <target>`，由 `scripts/run-dev.ts` 统一分发到 `@trapmap/host-local` 与 `@trapmap/host-distributed`。

### PG Recall 配置 (Phase 6，多路召回已全线落地)

多路召回管线（heuristic + keyword + semantic + graph 四通道）已是 v2 检索的默认唯一路径，无需额外开关启用。以下环境变量控制 keyword 和 semantic 通道的 PostgreSQL 索引增强：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `RETRIEVAL_CAPSULE_PG_KEYWORD` | 启用 capsule keyword PG recall（通过 `skill_artifact_capsule_keywords` 表 GIN 索引） | `false` |
| `RETRIEVAL_CAPSULE_PG_SEMANTIC` | 启用 capsule semantic PG recall（通过 `skill_artifact_capsule_embeddings` 表 HNSW 索引） | `false` |

**Fallback 行为**: PG recall 不可用时，keyword 和 semantic 通道自动回退到内存版本。单通道失败（包括 PG 连接错误）不会阻断 `/v2/retrieval/search` 主流程。

**Lifecycle sync**: capsule keyword / embedding index rows are now maintained by the shared artifact lifecycle indexing seam in PostgreSQL mode. There is currently no separate environment flag to disable only the write-side capsule index sync path.

**索引重建**: 当启用 PG 后，需运行 capsule index 运维入口将现有 approved artifact capsules 同步到 PG。稳定内部运维面已暴露为：

- `POST /v1/operations/capsule-index/rebuild` with `{ "mode": "full" }` for full rebuild
- `POST /v1/operations/capsule-index/rebuild` with `{ "mode": "artifact", "artifactId": "<artifact-id>" }` for artifact-scoped rebuild
- `GET /v1/operations/capsule-index/health` for source/index reconciliation
- `POST /v1/operations/capsule-index/cleanup-orphans` for orphan row cleanup

这些端点要求 system-admin 会话，并且仅在 PostgreSQL-backed store 启用时可用。

如果你使用 CLI，也可以通过以下运维命令调用同一组端点：

- `trapmap operations capsule-index rebuild`
- `trapmap operations capsule-index rebuild --mode artifact --artifact-id <artifact-id>`
- `trapmap operations capsule-index health`
- `trapmap operations capsule-index cleanup-orphans`

## 可观测性配置

以下变量控制 TrapMap 的可观测性三大支柱（metrics、tracing、logging）以及服务发现集成。所有可选组件在 `local-agent` 开发环境中默认关闭，不引入任何外部依赖。

### 可观测性 Feature Flags

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRAPMAP_METRICS_ENABLED` | 是否暴露 `/metrics` Prometheus 端点并收集 `prom-client` 指标 | `true` |
| `OTEL_DISABLED` | 是否禁用 OpenTelemetry SDK 初始化（`true` 时所有 OTel 操作为空操作） | `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP exporter 端点；`local-agent` 默认走 console exporter，其他 profile 走此端点 | `http://localhost:4318` |

### 服务发现配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRAPMAP_CONSUL_ENABLED` | 是否启用 Consul 服务发现模块 | `false` |
| `TRAPMAP_CONSUL_ADDRESS` | Consul agent 地址（`host:port`）；仅在 Consul 启用时必填 | 空 |

### 日志聚合配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRAPMAP_LOKI_ENABLED` | 是否启用 Loki 日志传输 | `false` |
| `TRAPMAP_LOKI_URL` | Loki push API 地址；仅在 Loki 启用时必填 | 空 |

### Dev-minimal 默认值

本地开发 (`local-agent`) 启动时的可选组件状态：

| 组件 | 默认状态 | 说明 |
|------|---------|------|
| Prometheus `/metrics` | 启用 | 暴露 `trapmap_*` 前缀指标与 `prom-client` 默认 Node.js 指标 |
| OpenTelemetry SDK | 启用（console exporter） | `OTEL_DISABLED=true` 可完全关闭 |
| Consul 服务发现 | 关闭 | `TRAPMAP_CONSUL_ENABLED=false` 时不加载 ConsulModule |
| Loki 日志传输 | 关闭 | `TRAPMAP_LOKI_ENABLED=false` 时只使用 NestJS 内置 Logger |

生产环境建议组合：

```bash
# team-monolith：启用全部可观测性组件，OTLP 推送到 Collector
TRAPMAP_METRICS_ENABLED=true
OTEL_DISABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
TRAPMAP_LOKI_ENABLED=true
TRAPMAP_LOKI_URL=http://loki:3100

# distributed：同上，额外启用 Consul 服务发现
TRAPMAP_CONSUL_ENABLED=true
TRAPMAP_CONSUL_ADDRESS=consul:8500
```

### 健康检查端点

Phase 1A 新增的 NestJS 宿主（`packages/host-local/src/nest/health/health.controller.ts`）提供四个 HTTP 端点，全部兼容 Kubernetes 探针语义：

| 端点 | 用途 | 响应格式 |
|------|------|---------|
| `GET /health` | 综合健康检查，包含依赖状态摘要 | `HealthStatus`（见下文） |
| `GET /ready` | Readiness 探针：服务是否可以接收流量 | `{ status, timestamp }` |
| `GET /live` | Liveness 探针：进程是否存活 | `{ status, timestamp }` |
| `GET /metrics` | Prometheus scrape 端点（`text/plain`） | Prometheus text exposition format |

### HealthStatus 响应结构

`GET /health` 返回符合 `packages/contracts/src/domain/health.ts` 中 `healthStatusSchema` 定义的 JSON：

```jsonc
{
  "status": "ok" | "degraded" | "unhealthy",
  "timestamp": "2026-07-02T12:00:00.000Z",
  "startedAt": "2026-07-02T11:00:00.000Z",
  "uptime": 3600.0,
  "version": "0.1.0",         // optional
  "readiness": "ready" | "not-ready" | "degraded",
  "liveness": "alive" | "dead",
  "dependencies": [
    {
      "name": "database",
      "status": "healthy" | "degraded" | "unhealthy" | "unknown",
      "latencyMs": 2.5,       // optional
      "message": "postgres",  // optional
      "lastChecked": "2026-07-02T12:00:00.000Z"  // optional
    }
    // ... more dependencies
  ],
  "deployment": {             // optional
    "profile": "local-agent",
    "preset": "monolith"      // optional
  }
}
```

聚合规则：

- `status = "unhealthy"` 当任一 dependency 的 `status` 为 `unhealthy`
- `status = "degraded"` 当任一 dependency 的 `status` 为 `degraded` 且无 `unhealthy`
- `status = "ok"` 当所有 dependency 为 `healthy` 或 `unknown`

### 可观测性配置 Schema

`packages/contracts/src/domain/observability-config.ts` 定义了 `observabilityConfigSchema`，供 host 层解析环境变量：

| 字段 | 类型 | 默认值 | 对应环境变量 |
|------|------|--------|------------|
| `consulAddress` | string (optional) | — | `TRAPMAP_CONSUL_ADDRESS` |
| `consulEnabled` | boolean | `false` | `TRAPMAP_CONSUL_ENABLED` |
| `otelEndpoint` | string (optional) | — | `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `otelDisabled` | boolean | `false` | `OTEL_DISABLED` |
| `lokiUrl` | string (optional) | — | `TRAPMAP_LOKI_URL` |
| `lokiEnabled` | boolean | `false` | `TRAPMAP_LOKI_ENABLED` |
| `prometheusEnabled` | boolean | `true` | `TRAPMAP_METRICS_ENABLED` |
| `metricsPrefix` | string | `trapmap_` | — |

Feature flags 子 schema（`featureFlagsSchema`）：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `metricsEnabled` | `true` | 指标采集总开关 |
| `tracingEnabled` | `true` | 链路追踪总开关 |
| `loggingEnabled` | `true` | 结构化日志总开关 |
| `serviceDiscoveryEnabled` | `false` | 服务发现总开关 |

## 服务器配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | 未设置（由部署环境控制） |
| `HOST` | 绑定地址；本地裸跑默认 `127.0.0.1`，容器内通常设为 `0.0.0.0` | `127.0.0.1` |
| `PORT` | 服务器端口 | `4000` |
| `RUNTIME_MODE` | 运行模式：`api`、`task-worker`、`outbox-worker`、`combined` | `combined` |
| `LOG_LEVEL` | Fastify 日志级别 | `info` |
| `TRAPMAP_REQUEST_ID_HEADER` | 运行时 request id 响应/透传头名 | `x-request-id` |
| `TRAPMAP_TRACE_HEADER_NAME` | 运行时 trace header 名 | `traceparent` |

> **Nest 宿主（默认 `light` 主线）**：`packages/host-local/src/nest/` 的 Nest 宿主现在通过 `packages/host-local/src/nest/config/config.ts` 自己加载 `HostLocalConfig`，这是 default `light` runtime env defaults 的 host-owned truth entry；`packages/server/src/config.ts` 仅保留 compatibility shell / shared consumer 侧入口。两者仍复用同一套环境变量与子配置 helper，不引入新的环境变量。`pnpm dev:local-agent`、`pnpm dev:team-monolith` 与 `pnpm --filter @trapmap/host-local dev` 都直接进入这条主线；旧 Fastify 宿主和相关 rollback 脚本已删除。

### Phase 1 instrumentation 语义冻结

- correlation key truth：`packages/contracts/src/domain/observability.ts`
- `packages/contracts/src/domain/observability.ts` 同时冻结 `workflowCorrelationSchema` 与共享 failure taxonomy 文案；`operations.ts`、`/v1/operations/status/async`、workflow snapshot repository、feedback badcase capture 都只消费这套定义
- request 入口统一使用 `TRAPMAP_REQUEST_ID_HEADER` 和 `TRAPMAP_TRACE_HEADER_NAME`，生成/透传的 public additive 句柄默认只包括 `requestId`、`traceId`、`queryId`、`feedbackId`、`asyncJobId`
- `workflowRunId`、`candidateId`、`entryId`、`artifactId` 默认属于 internal/operator/durable trace surface，不作为新的 public header 或通用 response additive field 扩散
- workflow correlation 只允许 `requestId`、`traceId`、`queryId`、`feedbackId`、`asyncJobId` 进入 `workflow_runs.stats` -> `workflows[*].correlation` 这条 operator seam；它是 public additive key 的 operator 视图，不承载 `workflowRunId`、`candidateId`、`artifactId` 之类 internal 扩展
- Phase 2 当前样板实现把 `requestId` / `traceId` 继续传播到 `feedback.badcase-export-draft` 这类 shared job payload，并以 `workflow_runs.stats` + `/v1/operations/status/async -> workflows[*].correlation` 暴露给 operator；这不是新增 public response field
- Phase 3 当前样板实现把 `retrieval_badcase_traces`、`workflow_runs.stats` 和 eval draft/export 收敛到同一份最小 debug contract：`GET /v1/operations/badcases/:feedbackId/export` 的 `debug.correlation` 只复用冻结的五个 public additive handle，`debug.durableTrace` 只承载 `sourceFeedbackId` / `queryId` / `routeFamily` 这组可复现句柄，`debug.workflow` 只承载 badcase draft async 状态；`draft.request` 仍不扩散 `asyncJobId`、`workflowRunId` 一类 operator-only 字段
- metric namespace 冻结为 `trapmap.runtime`、`trapmap.async`、`trapmap.retrieval`、`trapmap.cache`、`trapmap.feedback`、`trapmap.operator`
- 高基数关联键不得进入 metric label；它们只能进入日志、trace、workflow snapshot 或 durable badcase trace
- Phase 3 当前已把 `GET /metrics` 冻结为 Prometheus scrape surface：owner 仍是 `packages/server/src/app.ts` + `packages/server/src/lib/runtime/metrics.ts`，当前真实导出命名主要收口到 `trapmap_runtime_*` 与 `trapmap_async_*`
- distributed internal hop 现在除 `x-request-id` / `x-trace-id` 外，还继续透传 `traceparent`；`packages/host-distributed/src/gateway/internal-client.ts` 会补 `x-trapmap-span-id` 与 `x-trapmap-parent-span-id` 作为当前 host-owned internal span lifecycle 句柄

## Runtime Resilience

TrapMap 现在通过共享 runtime resilience 层统一处理部分 timeout / retry / degraded-fallback 行为。当前这层首先覆盖：

- graph backend bootstrap / healthcheck
- candidate retry scheduling
- graph LLM segment extraction
- outbox retry metrics

当前版本这些策略主要以内置代码常量为准，尚未全部开放为稳定 env surface。运维上需要知道的点是：

- `TRAPMAP_GRAPH_DB_FAIL_OPEN=true` 时，graph backend healthcheck 失败会进入 degraded fallback，而不是直接阻断启动
- `/ready` 会把 `queueWorker`、`outboxWorker`、`graphQuery` 的当前状态汇总到 `dependencies.*`
- `readiness === "not-ready"` 时，`GET /ready` 返回 HTTP `503`
- runtime metrics 目前同时承担内部/test-visible snapshot 与 `/metrics` Prometheus export 的最小 owner seam
- `/v1/operations/status/async` 现在会以 internal/operator additive `runtimeMetrics` 汇总这些 snapshot，统一包含 `executions`、`degraded`、`reclaims`、`timeouts`、`retryableFailures`、`permanentFailures`、`retries` 以及 queue/outbox/stale-worker 的平均 backlog 统计
- `executions`、`degraded`、`timeouts`、`retryableFailures`、`permanentFailures` 现在固定为 logical operation 终态计数：每个依赖调用无论中间经历多少次 attempt，最终只计一次 terminal outcome；只有 `retries` 统计首个 attempt 之后的额外尝试次数
- fail-open fallback 也只算一次 terminal execution：如果最终降级到 fallback，则 `executions += 1`、`degraded += 1`，并按最终 failure kind 只增加一次 `timeouts` / `retryableFailures` / `permanentFailures`
- runtime metrics 的语义 truth 仍在 `packages/server/src/lib/runtime/metrics.ts`；operator route 只做聚合展示，不复制另一套指标字段或高基数 label 规则
- runtime metrics label 仅允许低基数字段，例如 `failureClassification`、`runtimeMode`、`serviceUnit`、`routeFamily`、`dependencyName`、`cacheNamespace`、`taskType`、`workflowType`
- Phase 3 当前已把三类关键链路落到真实实现：
  - HTTP：`packages/server/src/app.ts` 记录 request-completed JSON log，并导出 request total / duration metrics
  - DB：`packages/server/src/lib/persistence/postgres-store.ts` 导出 `store_snapshot.select` / `store_snapshot.transact` metrics
  - queue/outbox：`packages/server/src/lib/queue/task-queue.ts` 与 `packages/server/src/lib/lifecycle/outbox.ts` 导出 enqueue / claim / complete / fail metrics
- 结构化日志字段当前至少收口到 `eventCategory`、`eventName`、`requestId`、`traceId`、`serviceName`、`ownerSurface`、`routeFamily`；async retry/failure 路径还会记录 `attempt` 与 `workItemId`
- observability backend 最小接入面当前只承诺：
  - Prometheus scrape `/metrics`
  - OTEL collector 通过现有 `traceparent` 传播和日志/指标接缝接入
  - 日志采集器读取 JSON stdout/stderr
- distributed hop 继续以现有 request/trace/correlation headers 为主，不引入第二套 public contract；如果 internal hop 返回空 body 或 transport 级错误，gateway/internal client 仍必须先归一化为 canonical `kind`（如 `timeout`、`unavailable`、`forbidden`、`conflict`、`not-found`）再交给 route/worker/operator surface 解释

## Phase 4 operator runbook

Phase 4 closeout 不新增第二套 runtime control plane。当前 operator runbook 只冻结现有入口与排查顺序：

1. `GET /health`
   - 用于确认进程存活、HTTP listener 正常、基础 runtime metadata 可读。
   - 如果这里失败，先排查进程启动日志、端口绑定、容器重启和基础依赖注入。
2. `GET /ready`
   - 用于确认 readiness 与依赖摘要，重点看 `dependencies.queueWorker`、`dependencies.outboxWorker`、`dependencies.graphQuery`。
   - `503` 或 `readiness === "not-ready"` 时，先区分是 profile 允许的 remote worker 缺席，还是本地应拥有的 worker/runtime 未就绪。
3. `GET /metrics`
   - 用于 Prometheus scrape 与现场数值检查；这里只看低基数聚合，不在 metrics label 里追 requestId/traceId。
   - 重点先看 task queue backlog、outbox backlog、runtime retries/timeouts，以及 internal hop latency 的聚合变化。
4. `GET /v1/operations/status/async`
   - 这是 async/operator truth surface。排查 task queue、worker reclaim、projection lag、failure taxonomy、bulk workflow checkpoint 时优先看这里。
   - `operatorHome`、`capacityModel`、`runtimeMetrics` 与 `bulkOperations` 是第一现场，不要求人工先查表。

### Runbook focus areas

- task queue
  - 先看 `/v1/operations/status/async` 的 queue backlog、dead letter、stale worker、reclaimCount。
  - 如果 backlog 持续上升，再结合 `/metrics` 判断是 handler latency、worker 缺席，还是 queue transport 配置不匹配。
- internal hop latency
  - 当前以 `/metrics` 中的 runtime/internal hop 聚合和 distributed closeout 证据为准，不单独承诺 per-request trace UI。
  - 延迟升高时，先区分 gateway -> service hop、DB 侧延迟、还是 queue/outbox 后压造成的连带症状。
- error rate
  - 先看 `/metrics` 与 `/v1/operations/status/async` 中的 `timeouts`、`retryableFailures`、`permanentFailures`、`failureTaxonomy`。
  - 再回到结构化 JSON 日志，用 `requestId`、`traceId`、`serviceName`、`attempt`、`workItemId` 做定点排查。
- logging/tracing
  - 当前真实落地的 tracing/logging 入口仍是 `traceparent` 传播、host-owned span headers、JSON stdout/stderr。
  - OTEL collector 和日志采集器在本仓库中只冻结为接入边界，不作为 checked-in deployment asset。

### Dashboard / alert / SLO starter surface

本轮只冻结首批文档面，不新增 checked-in Grafana/Prometheus 资产。operator 侧应围绕以下三组指标组织 dashboard/alert/SLO：

- task queue
  - dashboard: backlog、dead-letter count、reclaimCount、avg handler latency
  - alert: backlog 持续增长、dead-letter 突增、stale worker 未恢复
  - SLO: queue work 在约定 freshness budget 内被 claim 并完成
- internal hop latency
  - dashboard: gateway -> internal service hop latency、timeout rate、retry rate
  - alert: internal hop latency 持续高于基线、timeout rate 升高
  - SLO: owner-hop latency 维持在当前 distributed closeout 可接受预算内
- error rate
  - dashboard: `retryableFailures`、`permanentFailures`、canonical error kind 分布
  - alert: `permanentFailures` 或 `timeout` 连续超阈值
  - SLO: 关键 operator surface 的 success rate 与 freshness 不低于约定门槛

这些 dashboard/alert/SLO 当前是 operator 文档 truth，不等同于 dashboard-as-code、alert rule pack 或独立 monitoring platform 已落地。

### Phase 6 freeze

Phase 6 只冻结当前 mature-capability / library-replacement 边界，不把 follow-up platform capability 写成现状。

- `internal client + resilience` 当前已经在主线存在，但范围有限：现有证据只支持 internal HTTP client、canonical error normalization、shared timeout/retry/degraded helper、runtime metrics snapshot 和 operator-visible summary。它不是完整 mature-service platform stack，也不是所有 internal hop 都已有统一 externalized policy engine 的证据。
- `tracing + metrics` 当前只能按现有 surface 描述：request/trace header propagation、host-owned internal span headers、`/metrics` text export、`runtimeMetrics` snapshot、`/v1/operations/status/async` 与 stats summary 中的 operator 可见聚合、以及低基数 label 规则。不要把它写成全链路 distributed tracing 平台、外部 observability backend 已产品化、或 service-owned telemetry pipeline 已完全落地。
- `rate limiting + bulkhead / 背压` 当前不是 built-in runtime default。`rateLimitMaxPerMinute` 仍只是 compatibility config seam；没有源码证据表明 host-local、gateway、worker 或 distributed services 已默认启用 service bulkhead、adaptive backpressure、或统一 rate-policy rollout。
- `cache + invalidation` 当前是 active operator/testing surface，但只证明 derived cache / invalidation seam。retrieval read-model cache、intent cache、shared invalidation events、pending invalidation summary 都是当前真相；它们不是 remote cache platform、自治 cache infrastructure、或 cache-backed service discovery 的证据。
- `service discovery`、`DB budget / PgBouncer`、以及 richer `health indicator` rollout 继续是 adoption condition / deferred capability gate。当前分布式事实仍是 checked-in URL env + shared PostgreSQL + existing readiness endpoints；不能改写成动态 discovery、PgBouncer rollout default、或 richer health policy 已内建。
- 本轮 Phase 4 最小真实落地只补到 distributed host 的可执行 DB pool budget env seam：`TRAPMAP_SERVICE_POOL_SIZE` 提供 shared 默认值，`TRAPMAP_<SERVICE>_POOL_SIZE` 提供 per-service override。它只约束 Node `pg.Pool.max`，不等同于 PgBouncer rollout、连接池 introspection contract 或完整容量治理平台。
- `light` 与 `heavy` 的默认策略姿态不同，但 Phase 6 不引入新行为：`light` 继续偏向 in-process / fewer remote dependencies，`heavy` 继续偏向 gateway + internal HTTP hop + shared PostgreSQL 的 remote-expected posture。这里描述的是当前 adoption posture，不是 capability parity 或 platform maturity proof。
- graph runtime 配置入口继续冻结为同一组 `TRAPMAP_GRAPH_DB_*` env family 和 shared config parser。`TRAPMAP_GRAPH_DB_FAIL_OPEN`、provider、enabled state、worker-status conflict warning 都已存在；但当前文档不能宣称 `packages/server` compatibility shell、`host-local` 默认主线、distributed gateway/service/worker 在 graph provider、readiness、fail-open disposition 上已经完全一致，只能说它们复用同一 env family 与部分 shared consumer seam。

## AI 提供商配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_PROVIDER` | 提供商类型：`openai`、`openai-compatible`、`ollama`、`google-genai`。自动解析：显式值优先，其次 `OPENAI_API_KEY` → `openai`、`GEMINI_API_KEY` → `google-genai`，否则 `fallback`（使用确定性哈希向量） | 自动解析（见说明） |
| `AI_BASE_URL` | 兼容接口的 Base URL | `https://api.openai.com/v1` |
| `AI_API_KEY` | API 密钥 | `OPENAI_API_KEY` |
| `AI_CHAT_MODEL` | 聊天模型名称 | `gpt-4o-mini` |
| `AI_EMBEDDING_MODEL` | Embedding 模型名称 | `text-embedding-3-small` |
| `AI_PROMPT_TEMPLATE_FILE` | 可选的本地 JSON 槽位模板覆盖文件路径 | 未设置（不应用模板文件覆盖） |
| `AI_PROMPT_PROVIDER` | Prompt provider 选择：`anthropic`、`openai`、`deepseek`、`kimi`、`gemini`、`default` | 自动从模型 ID 推断 |

> 以上 AI 高级配置项未暴露为稳定 CLI 命令，仅通过环境变量控制。

### 独立 Embedding Provider

使用与 chat 不同的提供商处理 embedding：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EMBEDDING_PROVIDER` | Embedding 提供商类型 | 与 `AI_PROVIDER` 相同 |
| `EMBEDDING_BASE_URL` | Embedding API Base URL | 提供商默认值 |
| `EMBEDDING_API_KEY` | Embedding API 密钥 | 与 `AI_API_KEY` 相同 |
| `EMBEDDING_MODEL` | Embedding 模型名称 | 提供商默认值 |

## 检索 / Decay 开关

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `USE_DB_SEARCH` | 是否启用 DB search path；只有严格等于 `true` 才启用 | `false` |
| `TRAPMAP_DECAY_ENABLED` | 是否启用 decay 状态计算 | `false` |
| `TRAPMAP_DECAY_REVIEW_DUE_DAYS` | `review-due` 阈值天数 | `90` |
| `TRAPMAP_DECAY_STALE_DAYS` | `stale` 阈值天数 | `180` |
| `TRAPMAP_DECAY_EXPIRE_DAYS` | `expired` 阈值天数 | `365` |

说明：

- `USE_DB_SEARCH` 当前由检索编排层直接读取；文档化是为了部署可见性，不代表它已经成为长期稳定 public surface。
- decay 配置由 `packages/server/src/lib/decay/config.ts` 读取并做 Zod 校验。

## 系统提示词模板

TrapMap 的服务端 AI 提示词支持“插槽式”覆盖。你可以提供一个本地 JSON 文件，按任务覆盖以下字段：

- `role`
- `task`
- `corePrinciples`
- `outputInstructions`
- `constraints`
- `examples`

注意：

- 系统提示词统一使用 XML 语义标记（四层架构中的内容层）
- JSON 仅用于 API 传输层（消息结构、工具参数 Schema）和模板覆盖文件
- 只支持覆盖槽位内容，不支持覆盖渲染骨架
- 四层架构详见 [docs/reference/xml-system-prompt-methodology.md](../reference/xml-system-prompt-methodology.md)

## 安全配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CORS_ORIGINS` | 允许的 CORS 来源（逗号分隔，`*` 表示全部） | `*` |
| `RATE_LIMIT_MAX_PER_MINUTE` | 每分钟最大请求数（0 = 无限制） | `0` |
| `SESSION_TRANSPORT` | 会话传输方式：`bearer-header` 或 `cookie` | `bearer-header` |

## 日志配置

### 用户操作日志

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_USER_OPS_ENABLED` | 启用用户操作日志 | `false` |
| `LOG_USER_OPS_DIR` | 用户操作日志目录 | `logs/user-ops` |

### RAG 检索日志

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_RAG_ENABLED` | 启用 RAG 检索日志 | `false` |
| `LOG_RAG_DIR` | RAG 日志目录 | `logs/rag` |

### 日志轮转

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LOG_MAX_FILE_SIZE_MB` | 单个日志文件最大大小（MB） | `10` |
| `LOG_MAX_BACKUP_FILES` | 每日最大备份文件数 | `5` |

---

## 快速配置

```bash
# 复制环境变量模板
cp .env.example .env

# 生成管理员密钥
openssl rand -hex 32
# 将输出填入 TRAPMAP_SYSTEM_ADMIN_KEY
```

## 生产环境示例

```bash
# .env.production
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
TRAPMAP_DEPLOYMENT_PROFILE=team-monolith
TRAPMAP_GATEWAY_URL=https://trapmap.example.com
TRAPMAP_SYSTEM_ADMIN_KEY=<your-admin-key>
OPENAI_API_KEY=<your-openai-key>
TRAPMAP_DATABASE_URL=postgresql://user:pass@localhost:5432/trapmap
TRAPMAP_TASK_TRANSPORT=postgres
AI_PROVIDER=openai
LOG_LEVEL=info
LOG_USER_OPS_ENABLED=true
LOG_RAG_ENABLED=true
```

可选 RabbitMQ task transport 示例：

```bash
TRAPMAP_DATABASE_URL=postgresql://user:pass@postgres:5432/trapmap
TRAPMAP_DEPLOYMENT_PROFILE=distributed
TRAPMAP_DEPLOYMENT_PRESET=candidate-worker
TRAPMAP_TASK_TRANSPORT=rabbitmq
TRAPMAP_RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
TRAPMAP_RABBITMQ_TASK_EXCHANGE=trapmap.tasks
TRAPMAP_RABBITMQ_TASK_QUEUE=trapmap.candidate
TRAPMAP_RABBITMQ_PREFETCH=4
```
