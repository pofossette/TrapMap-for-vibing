# Runtime Recomposition Plan 04: Heavy Microservice Assembly

## 状态

- 状态：`active`
- 依赖：`02-backend-core-kernel-extraction.md`

## 目标

定义重型微服务宿主，使 TrapMap 能在保持统一 gateway 对外模型的前提下，将 `gateway / identity-access / knowledge-read / knowledge-write / candidate-ingestion / governance-review / job-runtime` 拆成可独立装配、独立扩缩容的服务组合。

## 设计原则

- 重型微服务化的第一步是边界清晰，不是服务数量尽可能多。
- 对外只有稳定 gateway；对内按 authoritative ownership、读写语义和故障域拆分。
- 所有服务共享 `backend-core`、`contracts`、统一事件语义和 PostgreSQL / outbox / queue 基线。
- 对内同步调用必须预留 `RPC seam`，但首期不要求引入正式 RPC 基础设施；先让服务接口、超时语义、幂等语义和错误模型稳定。

## 内部通信策略

### 外部通信

- CLI、未来 Web 面板和其他客户端继续只访问 gateway HTTP API。
- 不向外暴露内部服务地址或内部服务专用协议。

### 内部同步通信

- 在 `backend-core` 中先定义 internal ports，而不是先绑定某个 RPC 框架。
- 轻宿主下允许进程内直接调用这些 ports。
- 重宿主下首期允许使用 internal HTTP/JSON adapter。
- 当调用频率、类型稳定性和延迟压力足够高时，再把 adapter 升级为正式 RPC。

### 内部异步通信

- `candidate-ingestion`
- `governance-review`
- `job-runtime`

这三类服务首期仍然优先使用 queue / outbox / workflow，而不是同步 RPC。

## RPC 采用规则

### 当前结论

- 现在不做 `RPC-first microservices`。
- 现在要做的是 `port-first` 和 `transport-agnostic`。

### 适合优先评估 RPC 的服务

#### 1. `identity-access`

- 高频、小请求、强类型同步判权
- 适合后续演进为 RPC

#### 2. `knowledge-read`

- 如果 retrieval/read-model 查询频繁并需要批量查询或流式返回
- 适合后续演进为 RPC

#### 3. `knowledge-write`

- 可以评估 RPC，但优先级低于前两者
- 写路径更关注幂等、事务边界和异步 follow-up

### 暂不以 RPC 为主的服务

- `candidate-ingestion`
- `governance-review`
- `job-runtime`

这些服务更适合命令提交、任务投递和异步状态推进。

## 建议宿主与服务单元

### 1. Gateway host

- 外部唯一入口
- 负责 API surface、请求路由、聚合、限流和统一入口观测
- 不持有业务真相

### 2. Identity-access host

- 负责 auth、session、access-keys、membership、team 与 RBAC decision
- 给 gateway、write service、governance service 提供统一权限决策能力

### 3. Knowledge-read host

- 负责 retrieval、query tracing、只读 status projection
- 允许更激进的 cache / read model 优化
- 不拥有 authoritative write path

### 4. Knowledge-write host

- 负责 knowledge/trap/skill/maintenance/decay/lifecycle 等 command
- 负责 authoritative state mutation 和异步 follow-up 触发

### 5. Candidate-ingestion host

- 负责 candidate intake、归一化、去重预处理、候选状态推进
- 负载模型与普通 command path 不同，适合独立扩缩容

### 6. Governance-review host

- 负责人机协同审核、人工介入队列、冲突解决、remediation queue
- 不应只是普通 worker；它本质上是治理状态机服务

### 7. Job-runtime host

- 负责 task queue、workflow runs、outbox dispatch、shared jobs 执行
- 不拥有业务真相，只执行被上游服务调度的异步工作

## Internal Port 建议

在进入具体 RPC 选型之前，先在核心内核冻结以下 port：

- `IdentityAccessPort`
- `KnowledgeReadPort`
- `KnowledgeWritePort`
- `CandidateIngestionPort`
- `GovernanceReviewPort`
- `JobRuntimePort`

这些 port 必须定义：

- request / response shape
- timeout / cancellation expectation
- idempotency expectation
- error taxonomy
- tracing / correlation id propagation

## 数据库处理策略

### 当前结论

- 重后端首期继续共享 `TRAPMAP_DATABASE_URL` 指向的 PostgreSQL。
- 共享库不等于共享写权限；必须先冻结表级 ownership 和写入责任。
- 不做跨服务分布式事务；跨服务副作用通过 outbox / queue / projection 传播。

### 表级 ownership 建议

#### `identity-access`

- 拥有 auth、session、access-key、membership、team 等身份与权限相关真相表的写权限
- 其他服务只读或通过 `IdentityAccessPort` 访问，不直接写这些表

#### `knowledge-write`

- 拥有 knowledge、trap、skill lifecycle、maintenance、decay 等 authoritative 表的写权限
- 对应的 follow-up event / outbox 也由它负责落库

#### `candidate-ingestion`

- 拥有 candidate intake、candidate processing 状态、去重分析中间态等表的写权限
- 不直接改 knowledge authoritative 表，发布结果后交由 owning service 消费

#### `governance-review`

- 拥有人工介入队列、审核工作台状态、冲突解决状态、remediation queue 状态等表的写权限
- 不直接绕过 `knowledge-write` 去改知识生命周期真相表

#### `job-runtime`

- 拥有 task queue、workflow runs、outbox dispatch runtime、lease/reclaim 元数据等运行时表的写权限
- 不拥有业务域真相表

#### `knowledge-read`

- 不拥有 authoritative truth tables
- 可以拥有只读投影表、缓存表、搜索索引表、query trace read-side 表

### 读写约束

- 同一张 authoritative 表只能有一个 owning service 负责业务写入。
- 非 owning service 如需影响该表状态，必须通过 owning service 的 command port。
- `knowledge-read` 对投影表的重建可以由 `job-runtime` 执行，但投影失效责任仍来自 owning write service。

### 事务边界

#### 单服务事务

- 同一个 owning service 内允许使用本地 PostgreSQL 事务，保证 authoritative write + local outbox write 原子提交。

#### 跨服务流程

- 禁止把多个服务的写操作包进一个跨服务数据库事务。
- 跨服务流程采用：
  - authoritative write
  - outbox append
  - async delivery
  - projection / follow-up mutation

#### 同步查询 + 异步落地

- gateway 或上层调用方可以同步获得“已接收 / 已授权 / 已写入”结果
- 不应假设所有 follow-up projection、cache invalidation、governance side effect 已经同步完成

### 数据库访问模式

#### 推荐

- 每个服务只通过自身 repo / port 访问其拥有的表
- 需要别的域能力时优先走 internal port
- 只读场景优先走 read model / projection

#### 不推荐

- gateway 直接拿全量 repo 读写多个域表
- `knowledge-read` 直接改 write-side 表
- `governance-review` 或 `candidate-ingestion` 绕过 owning service 修改 lifecycle truth

### 迁移策略

#### Phase 1. 共享库 + 明确 ownership

- 保持单库
- 用 repo 边界、模块边界和文档边界先冻结 ownership

#### Phase 2. shared schema hygiene

- 为运行时表、投影表、真相表补齐清晰分组与命名规则
- 明确哪些表允许哪个服务写

#### Phase 3. projection hardening

- 把 read-side projection、治理队列状态、async runtime 状态从 route-local 逻辑彻底收敛到拥有者服务和 runtime 服务

#### Phase 4. selective split evaluation

- 只有在连接池压力、扩缩容压力、隔离域要求、数据生命周期差异持续存在时，才评估按域拆库

### 连接与容量规划

- 重后端多服务共享 PostgreSQL 时，必须提前规划连接池预算，避免每个服务都按单体时代默认值开满连接。
- 每个服务都应支持独立的 pool size、idle timeout、statement timeout 配置。
- `knowledge-read` 与 `job-runtime` 往往最容易形成连接高占用，需要优先观察。

### 未来拆库门槛

只有满足以下至少一类条件，才建议进入拆库规划：

- 单个服务长期需要独立扩容且数据库热点明显集中在该域
- 某域需要独立备份/恢复/保留策略
- 某域的访问模式对主库造成稳定干扰
- 安全或合规要求明确要求独立数据边界

在未满足这些门槛前，优先做表级 ownership、事务边界和投影治理，而不是先拆库。

## 缓存策略

### 目标

- 重后端缓存要服务于 `knowledge-read` 的低延迟和高并发，而不是成为新的真相来源。
- 缓存设计必须是多层、小而准、显式失效，而不是先引入一个统一远程缓存把所有读请求都塞进去。
- 先做分布式失效协议，再决定是否需要分布式数据缓存。

### 当前基础

- 当前已有 process-local retrieval read-model cache：
  - `packages/server/src/lib/cache/retrieval-read-model-cache.ts`
- 当前已有 process-local intent cache：
  - `packages/server/src/lib/retrieval/capsules/intent-cache.ts`
- 当前已有显式 invalidation event model，但仍以进程内 listener 为主：
  - `packages/server/src/lib/cache/invalidation.ts`

这说明项目已经具备“derived cache + invalidation contract”的基础，但在重后端下还需要把它升级为跨实例、跨服务可传播的缓存体系。

### 分层建议

#### Layer 1. process-local compute cache

适用对象：

- intent parsing
- query normalization
- embedding generation结果
- rerank feature extraction
- 轻量 query planning 中间结果

特点：

- TTL 短
- 单实例本地缓存
- 命中收益高，但跨实例共享必要性不一定高

#### Layer 2. retrieval filter/intermediate cache

适用对象：

- approved/active/team-scope/security-scope 过滤后的中间 doc set
- channel-specific candidate set
- query planning 产生的稳定中间结果

特点：

- 类似搜索系统的 filter/query cache
- 不直接缓存最终完整响应
- key 必须带 `teamId`、policy/security revision、channel、index revision

#### Layer 3. exact query result cache

适用对象：

- 规范化后完全相同的 retrieval 请求
- topK doc ids + scores + query metadata

特点：

- 只缓存确定性查询
- TTL 建议较短，如 `15s ~ 60s`
- 不直接缓存带强实时语义或调试/实验参数的请求

#### Layer 4. immutable revision object cache

适用对象：

- `artifactId + revisionNo`
- `knowledgeId + revisionNo`
- capsule summary / client manifest / derived profile

特点：

- 用 revision-based key，而不是 mutable key
- TTL 可以更长
- 命中稳定、失效简单、非常适合后续放入分布式缓存

#### Layer 5. distributed invalidation bus

适用对象：

- retrieval read-model cache
- intent cache
- result cache
- revision object cache 的命中保护层

特点：

- 首期先做 invalidation broadcast，不要求先做 shared remote cache
- authoritative write 成功后，通过 outbox / shared job / runtime event 驱动失效
- `knowledge-read`、gateway 和其他只读消费者据此清理本地缓存或标记 stale

### 服务级缓存建议

#### `gateway`

- 不作为主缓存层
- 只允许短 TTL 缓存无用户状态或明确带 `team + policy revision + request hash` 的聚合结果
- 不缓存模糊的 retrieval 最终响应

#### `identity-access`

- 允许缓存 permission decision
- key 必须包含 `actorId + teamId + permission + policyRevision`
- 失败策略必须 fail-closed，cache miss 或 timeout 不能放宽权限

#### `knowledge-read`

- 这是主缓存层
- 承担 query cache、filter cache、revision object cache、intent/embedding cache
- 同时负责消费 invalidation 事件并更新 freshness metrics

#### `knowledge-write`

- 不承担读缓存
- 负责 authoritative invalidation、projection refresh 和 outbox append

#### `governance-review`

- 只允许缓存统计/只读列表，TTL 应短
- 人工介入状态机、队列状态、决策状态不能依赖长 TTL 缓存

#### `job-runtime`

- 不做业务结果缓存
- 可做幂等去重、短期 workflow snapshot cache

### cache key 规则

所有可跨请求复用的 read-side cache key 至少要显式考虑：

- `teamId`
- `actor/policy/security revision`
- `index revision` 或 data revision
- canonical request hash
- channel / mode / topK / pagination

明确禁止：

- 使用 `queryId` 作为复用缓存 key
- 不带 team/policy 维度缓存 retrieval 结果
- 让 mutable object key 长时间承担版本缓存职责

### 失效策略

#### authoritative 触发

- lifecycle approval/deactivation
- remediation suppression/reactivation
- artifact/knowledge revision change
- candidate resolution 触发的知识发布

#### 传播路径

- authoritative write
- local outbox append
- async delivery
- read-side invalidation / projection refresh / stale flag clear

#### 失效方式

- filter/result cache：基于 namespace + team/topic/index revision 清理
- revision object cache：优先版本换 key，必要时再显式逐出
- process-local compute cache：按 namespace 事件清理

### 分布式缓存采用顺序

#### 首期

- 保留本地 LRU/TTL cache
- 把 invalidation 升级为 distributed event contract
- 给缓存 key 补齐 team/policy/revision 维度

#### 第二阶段

- 为 `knowledge-read` 增加共享远程缓存，仅先覆盖：
  - exact query result cache
  - immutable revision object cache

#### 暂缓项

- 不先把全部 permission decision 放入全局远程缓存
- 不先把 governance queue state 放入分布式缓存
- 不先把 candidate processing state 做成远程 cache

### 预热策略

- 新 read host 启动后，可按最近 usage log 中的高频 query / 热门 capsule 做有限预热
- 批量 lifecycle 变更后，只重建受影响 team/topic 的热集合
- 不建议全量预热整个 retrieval space

### 观测指标

- cache hit / miss / eviction by namespace
- stale recovery count
- invalidation lag
- query result cache hit rate
- revision object cache hit rate
- permission decision cache hit rate
- remote cache unavailable fallback count

### 风险

- 如果没有 distributed invalidation，本地缓存只在单实例有效，多实例下会产生隐性 stale 结果。
- 如果 result cache key 不带 team/policy/revision，容易产生跨团队或越权污染。
- 如果一开始就引入统一远程缓存而没有先定义失效协议，会把复杂度前置。

## 入库批量提交策略

### 当前结论

- 当前仓库已经有 authoritative write 与 queue/outbox 注册的事务化设计。
- 当前也已有若干 batch 操作和 rebuild 入口。
- 但还没有一套面向重后端的统一“批量入库 / 分批提交 / 背压控制”设计规范。

### 当前已有基础

#### 已有原子事务设计

- `createAndEnqueueCandidate()` 已通过 `transactWithPgClient()` 把候选创建和队列注册放进同一事务。
- knowledge lifecycle / async follow-up 也已经强调 authoritative write 与 outbox 的事务边界。

#### 已有批量或重建入口

- decay / maintenance / feedback 已有 batch operation 入口
- capsule index 已有 full rebuild / artifact rebuild
- artifact structured rows 写入已具备 upsert 语义

这说明项目已经有“批处理能力的局部实现”，但缺少统一的 ingestion batching policy。

### 重后端建议

#### 1. command path 与 bulk path 分离

- 普通在线请求继续走小事务、低延迟 command path
- 导入、回填、rebuild、candidate bulk ingestion、projection rebuild 走 bulk path
- 不能让 bulk job 复用在线 API 的逐条写逻辑无限循环

#### 2. 分批提交，而不是超大事务

建议所有 bulk ingestion 都遵循：

- `batchSize`
- `maxRowsPerTransaction`
- `maxBytesPerBatch`
- `maxConcurrentBatches`

原因：

- 过大事务会拖高锁持有时间
- 增加 WAL 压力
- 失败回滚成本高
- 容易把 shared PostgreSQL 打满

#### 3. authoritative write + outbox 同批事务

对于每一批：

- authoritative rows 写入
- 对应 outbox / queue registration 写入
- 同一事务提交

但不同批之间不要强求单事务。

#### 4. bulk job 必须幂等

建议 bulk ingestion 统一支持：

- `jobId`
- `batchId`
- `idempotencyKey`
- `resumeFromOffset`
- `upsert` / `skip-existing` / `replace-derived` mode

#### 5. write model 与 derived write 分阶段

建议把 bulk ingestion 分为两段：

- Phase A：authoritative truth rows 提交
- Phase B：derived projection / index / cache invalidation / rebuild follow-up

这样批量入库失败时更容易恢复，也更符合当前 outbox + projection 模型。

### 适合批量提交的场景

- candidate bulk ingestion
- knowledge import
- skill artifact import
- capsule index rebuild
- graph index rebuild / backfill
- projection refresh / maintenance repair

### 不适合做超大批量同步事务的场景

- 权限决策
- 普通 retrieval
- 单次 review decision
- 单个 lifecycle command

### 建议的批量配置项

- `TRAPMAP_BULK_WRITE_BATCH_SIZE`
- `TRAPMAP_BULK_WRITE_MAX_ROWS_PER_TX`
- `TRAPMAP_BULK_WRITE_MAX_BYTES_PER_BATCH`
- `TRAPMAP_BULK_WRITE_MAX_CONCURRENT_BATCHES`
- `TRAPMAP_BULK_WRITE_RETRY_LIMIT`
- `TRAPMAP_BULK_WRITE_RETRY_BACKOFF_MS`
- `TRAPMAP_BULK_WRITE_JOB_LEASE_TTL_MS`

### PostgreSQL 写入策略建议

- 中等规模优先用 multi-row insert / upsert
- 幂等场景优先 `INSERT ... ON CONFLICT`
- rebuild / backfill 类任务按批次逐批提交
- 当导入量明显上升后，再评估 `COPY` 或 staging table + merge

当前阶段不建议直接把所有 ingestion 重写成 `COPY` first，因为：

- 当前业务写入带有较多领域校验和 follow-up 语义
- 先把 batch contract、idempotency 和 resume 机制冻结更重要

### 验收标准

- bulk ingestion 与 online command path 有清晰分离
- 每批 authoritative write 与 outbox append 原子提交
- 大批量导入可以 resume / retry / observe
- 不会因为单个 bulk job 把共享 PostgreSQL 的在线读写完全压垮

## 读写拆分要求

### 外部要求

- CLI 与 Web 面板仍只访问 gateway URL。
- API surface 要保持语义稳定，不能把内部服务路由直接泄露给客户端。

### 内部要求

- `knowledge-read` 的缓存与投影必须被显式视为 derived state。
- `knowledge-write` 对投影和缓存失效负 authoritative responsibility。
- `governance-review` 对人工介入状态与审核队列推进负 authoritative responsibility。
- gateway 不应重新实现 retrieval、RBAC 或 governance 业务逻辑，只做编排/代理/聚合。

## 建议目录

- `packages/host-distributed/src/gateway/*`
- `packages/host-distributed/src/identity-access/*`
- `packages/host-distributed/src/knowledge-read/*`
- `packages/host-distributed/src/knowledge-write/*`
- `packages/host-distributed/src/candidate-ingestion/*`
- `packages/host-distributed/src/governance-review/*`
- `packages/host-distributed/src/job-runtime/*`
- `packages/host-distributed/src/topology/*`

## 首期建议拓扑

- `gateway`
- `identity-access`
- `knowledge-read`
- `knowledge-write`
- `candidate-ingestion`
- `governance-review`
- `job-runtime`

这里允许物理进程合并，但逻辑边界必须先独立定义。比如：

- 第一阶段可以先合并成 4 个宿主：
  - `gateway-host`
  - `core-api-host`：承载 `identity-access + knowledge-write`
  - `read-host`：承载 `knowledge-read`
  - `worker-host`：承载 `candidate-ingestion + governance-review + job-runtime`
- 后续再按 backlog、权限压力、治理负载和故障域把逻辑服务拆成独立进程

## 风险

- 如果 gateway 继续承载过多实际业务，会形成新的“大边车单体”。
- 如果 `identity-access` 不独立出来，RBAC 逻辑会继续散在 gateway、write path 和治理路径里。
- 如果读写拆分只停留在部署脚本，不落到包边界和 use-case ownership，就无法长期维护。
- 如果不先定义 cache invalidation、projection ownership 和人工介入 ownership，读服务与治理服务都会出现责任漂移。
- 如果过早绑定 RPC 框架，而 service ownership 和错误模型还不稳定，会把协议演进成本提前锁死。
- 如果共享数据库下没有表级 ownership 约束，微服务化只会变成“多个进程写同一批表”的伪拆分。

## 验收标准

- `distributed` 形态能用“统一 gateway + 明确逻辑服务 ownership”来描述，而不再只是“server 加几个 worker”。
- 新宿主目录能承接未来 compose / deployment 脚本与运维文档。
- RBAC、读写边界、人工介入队列、投影责任和 cache invalidation 责任都有明确归属。
- internal port、同步/异步通信策略，以及 RPC 的采用门槛都有明确归属。
- 数据库的表级 ownership、事务边界、投影责任和未来拆库门槛都有明确归属。
