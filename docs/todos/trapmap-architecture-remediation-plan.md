# TrapMap 架构问题整改细则

## 状态

- 状态：`进行中`
- 日期：`2026-06-28`
- 对应根索引：[`../../plan.md`](../../plan.md)
- 本文件角色：当前主线唯一执行细则，承接问题分组、阶段复选框、文档回写矩阵、测试矩阵与关闭条件

## 目标

- 把当前“兼容壳名不副实、backend-core 空心化、store_snapshot JSONB 遗留、distributed 成熟度不足、可维护性失衡”五类问题收敛成一条可执行整改主线
- 用单一问题池和阶段关闭标准替代散落的历史迁移文档，避免继续在计划层面重复建模
- 以 `store_snapshot` 迁移为触发点，统一基础设施接入模型：集中定义存储、缓存、队列、图适配器接口，集中实现 `pg`、`redis`、`rabbitmq`、`neo4j`、内存替身等 provider
- 让宿主和服务装配通过环境变量选择 provider，并为 `light` / `heavy` 构建目标提供可摇树裁剪的静态入口
- 为后续代码整改建立统一的文档回写要求、最小测试集合和 deferred 规则

## 总体约束

- 所有复选框都以“代码/结构结论 + 测试证据 + 文档回写”三者同时完成为关闭条件
- 根 `plan.md` 只保留目标、阶段索引和入口；本文件保留执行细节、问题池、冻结边界和验收口径
- 涉及架构事实冲突时，以 [`../reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md) 和对应源码入口为准
- 不允许再新增与本主题平行的 Phase 文档；新增细化任务应落在本文件对应章节，或在确有必要时新增被本文件直接链接的单一专题细则
- 任何整改如果改变 API、目录归属、包职责、部署默认值或测试入口，必须同步更新权威文档与索引
- 统一适配器必须遵守：
  - 接口集中在 shared seam，不在各域重复发明 provider contract
  - provider 实现集中放置，不允许 route/host/service 私有 new client
  - 环境变量只负责 provider 选择与连接参数，不驱动第二套业务逻辑
  - `light` / `heavy` 必须支持 target-scoped import 或等价手段，避免所有 provider 一并打包

## 统一适配器设计冻结

### 范围

- [ ] 关系型主存储适配器：`postgres`、`in-memory`
- [ ] snapshot/兼容存储适配器：`json-file`、`postgres-jsonb`、`in-memory`
- [ ] 缓存适配器：`memory`、`redis`
- [ ] 任务传输适配器：`in-memory`、`postgres`、`rabbitmq`
- [ ] 图存储 / 图检索适配器：`graphology`、`neo4j`
- [ ] 明确统一适配器只处理基础设施协议与 client lifecycle，不替代 repository / application service / use case

### 目录与 owner

- [ ] 冻结统一适配器目录：
  - [ ] `packages/backend-core/src/adapters/ports/`
  - [ ] `packages/backend-core/src/adapters/provider-factories/`
  - [ ] `packages/backend-core/src/adapters/providers/memory/`
  - [ ] `packages/backend-core/src/adapters/providers/postgres/`
  - [ ] `packages/backend-core/src/adapters/providers/redis/`
  - [ ] `packages/backend-core/src/adapters/providers/rabbitmq/`
  - [ ] `packages/backend-core/src/adapters/providers/neo4j/`
  - [ ] `packages/backend-core/src/adapters/providers/json-file/`
- [ ] 冻结 host 装配目录：
  - [ ] `packages/host-local/src/nest/runtime/infrastructure/`
  - [ ] `packages/host-distributed/src/runtime/infrastructure/`
- [ ] 明确 `packages/server` 只允许消费统一适配器 seam，不再新增 provider 私有工厂

### 环境变量矩阵

- [ ] 冻结 selector env：
  - [ ] `TRAPMAP_PRIMARY_STORE_PROVIDER`
  - [ ] `TRAPMAP_SNAPSHOT_STORE_PROVIDER`
  - [ ] `TRAPMAP_CACHE_PROVIDER`
  - [ ] `TRAPMAP_GRAPH_PROVIDER`
  - [ ] `TRAPMAP_TASK_TRANSPORT`
- [ ] 冻结 provider-specific env：
  - [ ] PG
  - [ ] Redis
  - [ ] RabbitMQ
  - [ ] Neo4j
  - [ ] 本地文件/内存
- [ ] 定义 profile 推荐组合：
  - [ ] `local-agent`
  - [ ] `team-monolith`
  - [ ] `distributed`
- [ ] 定义 fail-fast 与 fallback 规则

### Tree-Shaking / Build Target

- [ ] 冻结 `light` target 的 provider 裁剪规则
- [ ] 冻结 `heavy` target 的 provider 裁剪规则
- [ ] 明确运行时切换和构建时裁剪的边界
- [ ] 明确 provider registry 的 target-scoped import 规则
- [ ] 明确 optional dependency / lazy import 规则

## 分布式成熟度实现冻结

### 设计原则

- [ ] 分布式成熟度能力通过统一适配器和 internal client seam 暴露，不直接散落在 route / controller / repository 中
- [ ] `light` 与 `heavy` 共用一套 contract、状态语义和配置模型；差异只体现在默认 provider 组合和是否启用 remote 能力
- [ ] `local-agent` 默认启用 no-op / in-memory / local-only 实现，避免单机体验被重型依赖绑架
- [ ] `team-monolith` 允许启用与 `heavy` 相同的 contract，但默认仍以单进程简化形态运行
- [ ] `distributed` 才默认启用 remote internal client、跨实例限流、远程 tracing export、按服务资源隔离

### 熔断器

- [ ] 统一在 internal client adapter 层引入熔断器，不在业务代码里手写 retry + timeout + open/close 状态机
- [ ] 建议库：`opossum`
- [ ] 适用位置：
  - [ ] `gateway -> service-*`
  - [ ] `governance-review -> knowledge-write`
  - [ ] `candidate-ingestion -> knowledge-write`
  - [ ] 未来 graph / cache / remote store 调用
- [ ] `light` 落地策略：
  - [ ] `in-process` 调用默认不开 remote breaker，只保留 timeout / metrics / error mapping
  - [ ] 对可选 remote provider（如 Neo4j、Redis）允许启用本地 breaker
- [ ] `heavy` 落地策略：
  - [ ] 每个 remote dependency 一条 breaker policy
  - [ ] breaker 状态进入 operator status
  - [ ] fallback 必须显式区分 fail-open 与 fail-closed
- [ ] 配置冻结：
  - [ ] timeout
  - [ ] error threshold
  - [ ] reset timeout
  - [ ] fallback policy
  - [ ] half-open probe budget

### 限流

- [ ] 统一在 gateway ingress 和高价值 operator surface 引入限流，不把限流散到各路由框架插件中
- [ ] 建议库：`rate-limiter-flexible`
- [ ] 适用位置：
  - [ ] public API / gateway
  - [ ] auth / session / access-key
  - [ ] retrieval 高成本入口
  - [ ] operations / admin 高风险入口
- [ ] `light` 落地策略：
  - [ ] `local-agent` 默认 `memory` limiter
  - [ ] `team-monolith` 默认 `memory` 或 `postgres` limiter，按部署需要升级
- [ ] `heavy` 落地策略：
  - [ ] 默认 `redis` limiter
  - [ ] 如未启用 Redis，可退回 `postgres` limiter，但必须标注为过渡态
- [ ] 统一 key 维度：
  - [ ] IP
  - [ ] actorId
  - [ ] teamId
  - [ ] route class
  - [ ] token / access key
- [ ] 统一 operator 输出：
  - [ ] block counts
  - [ ] remaining budget
  - [ ] store provider
  - [ ] fail-open / insurance mode 是否生效

### Bulkhead

- [ ] 统一在 dependency adapter 层做并发隔离，不在业务 handler 中手拼 semaphore
- [ ] 建议库：`p-limit`
- [ ] 如后续需要跨实例共享配额，再评估 `bottleneck + redis`，但不作为第一轮默认方案
- [ ] 适用位置：
  - [ ] internal HTTP client
  - [ ] embedding / rerank / AI provider
  - [ ] graph backend
  - [ ] remote cache
  - [ ] 异步 worker 高成本 handler
- [ ] `light` 落地策略：
  - [ ] 单进程按依赖类型设置本地并发上限
  - [ ] 不引入跨实例共享 bulkhead
- [ ] `heavy` 落地策略：
  - [ ] 每个 dependency / 每类 worker 单独并发池
  - [ ] backlog / pending queue / rejection 进入 operator status
- [ ] 配置冻结：
  - [ ] max concurrent
  - [ ] max queue
  - [ ] queue shed strategy
  - [ ] reject-on-clear / shutdown drain policy

### 服务发现

- [ ] 先把“调用模式”和“地址发现”拆开：`in-process` / `http` / 预留 `rpc` 走统一 service client seam，endpoint 解析走 discovery adapter
- [ ] 建议库：
  - [ ] `undici` 作为统一 HTTP client / pool / dispatcher
  - [ ] `node:dns/promises` 作为第一阶段 DNS discovery 能力
- [ ] 当前阶段不建议先引入 Consul client；Compose 与未来 K8s 都可先通过 DNS/service name 解决
- [ ] `light` 落地策略：
  - [ ] 默认 `in-process`
  - [ ] 若启用 remote mode，只支持 `static` endpoint 和本地 DNS
- [ ] `heavy` 落地策略：
  - [ ] 默认 `dns` 或 `static` discovery
  - [ ] 支持按 service name 解析多个实例并交给 `undici` pool / balanced pool
- [ ] discovery adapter 需要支持：
  - [ ] static env endpoint
  - [ ] DNS A/AAAA
  - [ ] DNS SRV（如后续需要）
  - [ ] health-aware endpoint 剔除策略
- [ ] 明确 future option：
  - [ ] 若后续进入 K8s，优先使用原生 Service DNS
  - [ ] 若后续进入 Consul，再新增 provider，而不是改动业务 client

### 数据库物理隔离

- [ ] 不通过新 ORM 解决，继续复用现有 `pg` / Drizzle 能力，把隔离收敛到 adapter 与配置层
- [ ] 第一阶段目标不是立刻“一服务一库”，而是先做到“一服务一连接配置 + 一服务一 pool owner + 一服务一 migration owner”
- [ ] `light` 落地策略：
  - [ ] `local-agent` 允许单库或无 PG
  - [ ] `team-monolith` 默认单库，但要按 owner service 拆 pool / schema owner 语义
- [ ] `heavy` 落地策略：
  - [ ] 每个 owner service 独立 `DATABASE_URL` 或独立 role/schema
  - [ ] queue/outbox 可先独立数据库或独立实例，避免与主业务查询共池
- [ ] 配置冻结：
  - [ ] `TRAPMAP_DATABASE_URL_<SERVICE>`
  - [ ] `TRAPMAP_DATABASE_ROLE_<SERVICE>`
  - [ ] `TRAPMAP_DATABASE_SCHEMA_<SERVICE>`
  - [ ] queue/outbox 专用连接配置
- [ ] 基础设施建议：
  - [ ] 继续使用现有 `pg` / Drizzle
  - [ ] 部署侧引入 `PgBouncer` 作为连接池守卫，而不是在应用内再造连接代理

### Trace System

- [ ] 统一采用 OpenTelemetry 作为 trace / metrics / log correlation 基座
- [ ] 建议库：
  - [ ] `@opentelemetry/sdk-node`
  - [ ] `@opentelemetry/auto-instrumentations-node`
  - [ ] `@opentelemetry/exporter-trace-otlp-proto`
  - [ ] `@opentelemetry/exporter-metrics-otlp-proto`
  - [ ] 如需 Prometheus scrape，再加 `@opentelemetry/exporter-prometheus`
- [ ] `light` 落地策略：
  - [ ] `local-agent` 默认 console / disabled exporter
  - [ ] `team-monolith` 默认 OTLP 可选，至少保留本地 trace id / request id / span correlation
- [ ] `heavy` 落地策略：
  - [ ] gateway 与 worker 全部启用 OTLP exporter
  - [ ] internal HTTP client 自动传播 `traceparent`
  - [ ] queue/outbox 消息头传播 trace context
- [ ] tracing adapter 需要覆盖：
  - [ ] ingress span
  - [ ] internal client span
  - [ ] async enqueue / dequeue span
  - [ ] DB / cache / graph / MQ dependency span
  - [ ] log correlation
- [ ] operator status 需要汇总：
  - [ ] otel enabled/disabled
  - [ ] exporter health
  - [ ] last export failure
  - [ ] propagation coverage

## 成熟库引入优先级矩阵

### P0 优先引入

- [ ] `internal client + resilience`
  - 当前现状：
    - `packages/host-distributed/src/gateway/internal-client.ts` 手写 `fetch + AbortController + canonical error mapping`
    - `packages/host-local/src/nest/adapters/remote.adapter.ts` 维护另一套平行 remote adapter
    - `packages/server/src/lib/runtime/resilience.ts` 只覆盖 `timeout + retry + fail-open/fail-closed`
  - 建议库：
    - [ ] `undici`
    - [ ] `cockatiel`
  - `light` 落地：
    - [ ] host-local 继续保留 port seam
    - [ ] remote adapter 底层统一改为 shared `undici` client factory
    - [ ] in-process 模式只保留 timeout / metrics / error mapping
  - `heavy` 落地：
    - [ ] gateway 和各 service 间调用统一走 typed internal client
    - [ ] breaker / bulkhead / retry policy 进入 shared internal client layer
  - 主要收益：
    - [ ] 消除多套 `fetch` 包装
    - [ ] 统一 timeout / retry / breaker / bulkhead / error taxonomy
    - [ ] 为 service discovery 与 trace propagation 提供单一入口

- [ ] `tracing + metrics`
  - 当前现状：
    - `packages/server/src/lib/runtime/request-context.ts` 与 `packages/host-local/src/nest/runtime/request-context.service.ts` 只做 header/request metadata 处理
    - `packages/server/src/lib/runtime/metrics.ts` 是进程内计数器
    - observability contract 已在 `packages/contracts/src/domain/observability.ts` 冻结，但缺标准实现基座
  - 建议库：
    - [ ] `@opentelemetry/api`
    - [ ] `@opentelemetry/sdk-node`
    - [ ] `@opentelemetry/auto-instrumentations-node`
    - [ ] `@opentelemetry/exporter-trace-otlp-proto`
    - [ ] `@opentelemetry/exporter-metrics-otlp-proto`
    - [ ] 如需 scrape：`prom-client` 或 `@opentelemetry/exporter-prometheus`
  - `light` 落地：
    - [ ] local-agent 默认 disabled 或 console exporter
    - [ ] team-monolith 默认可选 OTLP，至少统一 span / request id / logger correlation
  - `heavy` 落地：
    - [ ] gateway、service-*、worker 全部启用 propagation + exporter
    - [ ] internal client、queue、DB、graph、cache 全部进入统一 span 体系
  - 主要收益：
    - [ ] 补齐真实 distributed trace
    - [ ] 替换进程内 metrics 为标准 telemetry
    - [ ] 让 operator status 与 trace/metrics 使用同一套依赖状态语义

- [ ] `gateway rate limiting + bulkhead / 背压`
  - 当前现状：
    - `rateLimitMaxPerMinute` 已存在于 `packages/server/src/config.ts` 与 `packages/host-local/src/nest/config/config.ts`
    - 代码面缺少系统化 rate limit、internal concurrency gate、queue backlog admission control
  - 建议库：
    - [ ] `rate-limiter-flexible`
    - [ ] `@fastify/rate-limit` 或 Nest throttle guard
    - [ ] `p-limit` 或 `Bottleneck`
  - `light` 落地：
    - [ ] local-agent 默认 memory limiter
    - [ ] team-monolith 先启用 memory / postgres limiter 与单进程 bulkhead
  - `heavy` 落地：
    - [ ] distributed gateway 默认 redis-backed limiter
    - [ ] worker / remote dependency 使用独立 bulkhead 与 backlog budget
  - 主要收益：
    - [ ] 补齐 ingress 防护
    - [ ] 防止 gateway / worker 抢占同一资源池
    - [ ] 为 readiness 增加 admission-control 语义

### P1 条件成熟后引入

- [ ] `distributed cache + invalidation`
  - 当前现状：
    - `packages/server/src/lib/cache/retrieval-cache.ts`、`invalidation.ts`、`retrieval-read-model-cache.ts` 都是进程内实现
  - 建议库：
    - [ ] `lru-cache`
    - [ ] `Keyv + @keyv/redis`
    - [ ] 或 `ioredis`
  - `light` 落地：
    - [ ] 继续允许 process-local cache
    - [ ] 统一抽象成本地 provider
  - `heavy` 落地：
    - [ ] retrieval / read-model cache 切到 remote cache + distributed invalidation
    - [ ] fail-open / stale cache 语义进入统一 adapter contract
  - 启动条件：
    - [ ] distributed cache invalidation 成为真实需求
    - [ ] retrieval/read-model 跨实例命中收益明确

- [ ] `service discovery / endpoint resolution`
  - 当前现状：
    - `packages/host-distributed/src/config/service-config.ts` 主要靠静态 env / localhost URL
    - runtime topology 仍偏文档型元数据
  - 建议库/模式：
    - [ ] `node:dns/promises`
    - [ ] `undici` pool / balanced pool
    - [ ] 如确有需要再加 Consul client
  - `light` 落地：
    - [ ] 默认 env/static resolver
  - `heavy` 落地：
    - [ ] 默认 DNS / service-name resolver
    - [ ] 允许扩展到 Consul / K8s service discovery
  - 启动条件：
    - [ ] distributed 进入多实例或滚动升级场景
    - [ ] 需要真正的 endpoint set / failover / rebalance

- [ ] `DB 资源隔离与池化守卫`
  - 当前现状：
    - `packages/host-distributed/src/shared/database.ts` 每服务自己 new `pg.Pool`
    - pool size 和健康检查都较原始
  - 建议库/模式：
    - [ ] 继续用 `pg` / Drizzle
    - [ ] 引入统一 DB factory
    - [ ] 部署侧引入 `PgBouncer`
  - `light` 落地：
    - [ ] 单 pool，但区分 gateway/request path 与 async path 预算
  - `heavy` 落地：
    - [ ] per-service pool config
    - [ ] worker / API 分池预算
    - [ ] queue/outbox 优先做独立连接配置
  - 启动条件：
    - [ ] shared PG pool 争用开始成为稳定瓶颈
    - [ ] operator 需要 service-level pool metrics

- [ ] `health / readiness indicator 模式`
  - 当前现状：
    - readiness 主要是少数 dependency state 汇总
    - service 侧 `/internal/health` 仍偏薄
  - 建议库/模式：
    - [ ] `@nestjs/terminus` 思路
    - [ ] Fastify 服务保持同一 indicator contract
  - `light` 落地：
    - [ ] host-local 先冻结 dependency-classified readiness 语义
  - `heavy` 落地：
    - [ ] service package 统一 `liveness/readiness/startup`
    - [ ] gateway 汇总 downstream aggregate readiness，但不替代 service owner readiness

### P2 有争议或暂缓替换

- [ ] `Postgres task queue` 暂不优先整体替换
  - 当前现状：
    - `packages/server/src/lib/queue/task-queue.ts` 与 `lib/lifecycle/outbox.ts` 已深度绑定 workflow snapshot、operator status、dedupe、lease/reclaim 语义
  - 备选库：
    - [ ] `pg-boss`
    - [ ] `bullmq`
  - 暂缓原因：
    - [ ] 当前自研 queue 已被测试矩阵和 contract 深度冻结
    - [ ] 整体替换会先打穿 status / workflow / reclaim 语义
  - 允许的近期动作：
    - [ ] 先抽 adapter seam
    - [ ] 先统一 queue observability contract
    - [ ] 先把 RabbitMQ 分支收敛，后再决定是否替换 PG queue 主干

- [ ] `RabbitMQ runtime` 不继续扩写自研 broker 语义
  - 当前现状：
    - `packages/server/src/lib/async/rabbitmq-task-queue.ts` 仍缺 DLQ、publisher confirm、reconnect、真实 status snapshot
  - 建议库：
    - [ ] `rascal`
  - 暂缓原则：
    - [ ] 若最终队列主路线仍是 PG，则不应继续把 RabbitMQ 分支做成第二套重型产品面
    - [ ] 若 RabbitMQ 成为正式主路线，再引成熟库补齐 broker 语义

- [ ] `graph query / graph store` 暂不整体替换
  - 当前现状：
    - `graphology + optional neo4j-driver` 已形成当前 graph-assisted 与 fallback 策略
    - `packages/server/src/lib/graph-query/neo4j-backend.ts` 仍依赖 PG 中的图索引投影
  - 暂缓原因：
    - [ ] 当前问题主要在 resilience/fallback/observability，不在图客户端本身不成熟
    - [ ] 在 graph-assisted 没成为主瓶颈前，整体换图库收益有限
  - 允许的近期动作：
    - [ ] 用统一 resilience adapter 替代 graph 子系统内部 fallback 状态机
    - [ ] 补 graph provider focused tests 和 health/operator contract

- [ ] `feature flag / operability guard` 暂不上专门平台
  - 当前现状：
    - 当前 guard 更像架构护栏与运维 contract，而不是产品实验系统
  - 暂缓原因：
    - [ ] LaunchDarkly / Unleash 无法直接解决当前核心架构问题
    - [ ] 容易把“架构边界守卫”误改成“远程开关”

### 实施优先级排序

- [ ] Top 1：`undici + cockatiel` 统一 internal client / resilience / bulkhead
- [ ] Top 2：OpenTelemetry 统一 tracing / metrics / propagation
- [ ] Top 3：gateway rate limiting + backlog admission control
- [ ] Top 4：Redis-backed cache / invalidation
- [ ] Top 5：PgBouncer + per-service DB budget
- [ ] Top 6：service discovery resolver

### 纳入计划的代码落点

- [ ] `packages/backend-core/src/adapters/ports/`
- [ ] `packages/backend-core/src/adapters/provider-factories/`
- [ ] `packages/backend-core/src/runtime/`
- [ ] `packages/host-local/src/nest/adapters/`
- [ ] `packages/host-local/src/nest/runtime/`
- [ ] `packages/host-distributed/src/gateway/`
- [ ] `packages/host-distributed/src/shared/`
- [ ] `packages/server/src/lib/runtime/`
- [ ] `packages/server/src/lib/cache/`
- [ ] `packages/server/src/lib/async/`
- [ ] `packages/server/src/lib/queue/`

## 问题池与优先级

### P0 结构性主问题

- [ ] `packages/server` 从“兼容壳”恢复为真实兼容层定位，不再继续承载主应用事实源
- [ ] `packages/backend-core` 从接口集合收敛为真正承载业务规则和可复用实现的核心
- [ ] `store_snapshot` / InMemory 双轨从默认路径降级为受控兼容路径，避免继续主导生产与测试语义
- [ ] distributed 形态的调用链、容错、追踪和运行隔离拥有最小成熟度基线
- [ ] 文档、contracts、测试矩阵与代码当前状态重新对齐

### P1 文档与历史计划收口

- [ ] 减少重复迁移文档，把历史计划改为参考背景而不是继续作为并行执行面
- [ ] 在索引层明确当前唯一主线、deferred 问题池和后续独立审计入口

## Phase 0 盘点冻结与计划归并

### Waves

- [ ] Wave 0A：把 30 个问题映射到 5 个治理主题，避免后续整改以单点 patch 失控扩散
- [ ] Wave 0B：标记哪些问题必须通过代码整改关闭，哪些允许先冻结文档事实与 deferred 条件
- [ ] Wave 0C：明确历史文档的角色：
  - `docs/todos/nestjs-service-evolution-*.md` 作为服务演进背景输入
  - `docs/todos/backend-build-targets-plan.md` 作为 host/server 形态背景输入
  - `docs/todos/backend-engineering-optimization-plan.md` 作为平台化 deferred 问题池
- [ ] Wave 0D：冻结本轮非目标：
  - 不在本轮直接引入全新服务发现体系、K8s 平台或 MQ 产品替换
  - 不在本轮为了“清理文档”重写所有历史设计，只做入口收口和 truth source 对齐
  - 不在本轮把所有测试一次性改写为 PG-first；先收敛优先域和入口判据
- [ ] Wave 0E：冻结统一适配器非目标：
  - 不把 repository、application service、gateway client 混成 mega-adapter
  - 不为了 provider 可插拔牺牲当前默认路径清晰度
  - 不在第一轮强迫所有域同步完成迁移

## Phase 1 Server / Backend-Core 边界整改

### 目标

- 关闭问题 `#1-#10` 中关于 `server`、`backend-core`、`service-*` 角色错位的核心矛盾

### Waves

### 复选框

- [ ] Wave 1A：盘点 `packages/server` 中仍属主应用主体的模块，并按“host 层 / adapter 层 / domain/application 层 / persistence 层”分类
- [ ] Wave 1A：明确哪些 HTTP 路由应迁出 `packages/server/src/routes/`，并为迁移顺序建立 owner matrix
- [ ] Wave 1B：盘点 `packages/server/src/repositories/`、schema 与 migration 事实，冻结哪些 port/interface 必须迁入 `backend-core` 或独立 persistence 包
- [ ] Wave 1B：为 `backend-core` 六个 bounded context 写清“已有实现 / 缺失实现 / 仍在 server 的算法与 AI 逻辑”差距矩阵
- [ ] Wave 1C：评估 `service-*` 包是继续保留 assembly-only 定位，还是补入服务内业务编排；若保持 assembly-only，文档必须明确其约束和非目标
- [ ] Wave 1C：盘点基础设施接入创建点：
  - [ ] `packages/server`
  - [ ] `packages/host-local`
  - [ ] `packages/host-distributed`
  - [ ] `packages/service-*`
- [ ] Wave 1C：冻结哪些 client factory / connector / provider 先迁入统一适配器层
- [ ] Wave 1D：形成单一整改策略：
  - `server` 仅保留 compatibility shell、shared runtime seam、过渡 adapter
  - 业务规则优先收敛到 `backend-core`
  - provider 选择和 client lifecycle 优先收敛到统一适配器装配层
  - Drizzle schema / repo 实现若继续存在于 `server`，需标注为过渡态并给出退役条件

### 直接对应问题

- [ ] `#1` “兼容壳仍是应用主体” 已有量化事实和整改 owner
- [ ] `#2` `server` 与 `backend-core` 断联的导入依赖和运行依赖有明确收口方向
- [ ] `#3` 路由留存于 `server` 的迁移优先级已定义
- [ ] `#4` Repository 接口归属的目标包已冻结
- [ ] `#5` Drizzle schema / migration 归属策略已冻结
- [ ] `#6` `backend-core` 的“只有接口没有实现”状态有关闭路径
- [ ] `#7` 算法复杂度留在 `server` 的领域模块有迁移分层方案
- [ ] `#8` AI provider / prompt / caching 的 core port 与 adapter 边界已定义
- [ ] `#9` persistence 实现的复用路径已定义
- [ ] `#10` `service-*` 包角色与未来边界已写成文档事实

## Phase 2 Store Snapshot 现状盘点与迁移口径冻结

### 目标

- 关闭问题 `#11-#16` 中关于 JSONB God Object、双写一致性和测试/运行双轨的核心风险

### Waves

### 复选框

- [ ] Wave 2A：盘点 `store_snapshot` 当前承载的 17 个域，分出“必须先结构化”“允许保留兼容缓存”“仅限 local/test”三类
- [ ] Wave 2A：统计生产代码对 `store.snapshot()` / `store.transact()` 的剩余入口，并按运维路由、InMemory 仓库、pipeline handler 分类
- [ ] Wave 2B：梳理 `routes/operations/` 中直接读写 God Object 的入口，冻结是否必须经 Repository / application service 收口
- [ ] Wave 2B：统计基础设施 provider 使用面：
  - [ ] PG / Drizzle
  - [ ] Graphology
  - [ ] Neo4j
  - [ ] RabbitMQ
  - [ ] Redis / remote cache
  - [ ] JSON file / in-memory

- [ ] Step 2.2 统一适配器接口冻结
- [ ] 定义基础 provider contract：
  - [ ] `PrimaryStoreAdapter`
  - [ ] `SnapshotStoreAdapter`
  - [ ] `CacheAdapter`
  - [ ] `TaskQueueAdapter`
  - [ ] `GraphStoreAdapter`
- [ ] 定义 provider capability contract：
  - [ ] 事务
  - [ ] 分布式失效
  - [ ] 图查询
  - [ ] 重试 / ack / reclaim
- [ ] 明确 repository 与 adapter 的边界

- [ ] Step 2.3 集中实现与装配设计
- [ ] 设计 provider registry / factory：
  - [ ] `memory`
  - [ ] `postgres`
  - [ ] `redis`
  - [ ] `rabbitmq`
  - [ ] `graphology`
  - [ ] `neo4j`
  - [ ] `json-file`
- [ ] 设计 host 装配入口：
  - [ ] `host-local`
  - [ ] `host-distributed`
  - [ ] compatibility shell 最小保留路径
- [ ] 明确禁止继续在 host/service/route 私有 new provider client

- [ ] Step 2.4 环境变量与 target 策略
- [ ] 定义统一 selector env matrix
- [ ] 明确 `local-agent` 推荐组合
- [ ] 明确 `team-monolith` 推荐组合
- [ ] 明确 `distributed` 推荐组合
- [ ] 定义 fallback 与 fail-fast 规则
- [ ] 定义 build target tree-shaking 规则：
  - [ ] `light` 默认不打入 heavy-only provider
  - [ ] `heavy` 显式带入 remote provider
  - [ ] provider registry 支持 target-scoped import

- [ ] Wave 2C：为 InMemory 与 PG 双轨定义未来关系：
  - 哪些域必须 PG-first
  - 哪些测试允许内存替身
  - 哪些入口保留 snapshot 仅作兼容缓存
- [ ] Wave 2C：为基础设施迁移定义波次：
  - [ ] Wave A：snapshot / primary store seam
  - [ ] Wave B：task transport seam
  - [ ] Wave C：cache seam
  - [ ] Wave D：graph / retrieval seam
- [ ] Wave 2C：定义每个波次的代码落点、文档落点和最小验证
- [ ] Wave 2C：给 `store_snapshot` 表设置退役判据或长期保留判据，避免无限期“暂时保留”
- [ ] Wave 2C：对双写一致性写明事实：
  - 当前是否继续允许“结构化事实源 + JSONB 兼容缓存”
  - 若继续允许，谁负责同步、校验和回归测试

- [ ] Wave 2C：区分 adapter contract tests、provider implementation tests、repository tests、host assembly smoke
- [ ] Wave 2C：明确哪些测试允许 memory provider，哪些必须跑真实 PG / MQ / Redis / Neo4j
- [ ] Wave 2C：为 tree-shaking / target 裁剪补最小验证

### 直接对应问题

- [ ] `#11` 单行 JSONB 表承载整个状态的风险已转成明确整改策略
- [ ] `#12` 生产代码 190 处引用已形成清单与优先级
- [ ] `#13` 运维路由绕过抽象的行为有收口准则
- [ ] `#14` InMemory / PG 双轨的 owner 和测试口径已冻结
- [ ] `#15` `store_snapshot` 无法删除的条件已明确
- [ ] `#16` 双写一致性的验收和监控策略已明确

## Phase 3 统一适配器范围、目录与接口冻结

### 目标

- 先冻结统一适配器的边界、目录、接口和 owner，避免后续一边迁移一边发明新 seam

### 复选框

- [ ] 冻结统一适配器覆盖范围：
  - [ ] primary store
  - [ ] snapshot store
  - [ ] cache
  - [ ] task transport
  - [ ] graph provider
- [ ] 冻结统一适配器目录：
  - [ ] `packages/backend-core/src/adapters/ports/`
  - [ ] `packages/backend-core/src/adapters/provider-factories/`
  - [ ] `packages/backend-core/src/adapters/providers/*`
- [ ] 冻结 host 装配目录：
  - [ ] `packages/host-local/src/nest/runtime/infrastructure/`
  - [ ] `packages/host-distributed/src/runtime/infrastructure/`
- [ ] 明确 repository / adapter / host 装配边界
- [ ] 明确 `packages/server`、`host-*`、`service-*` 不再私有 new provider client

## Phase 4 统一适配器环境变量与构建裁剪冻结

### 目标

- 冻结 provider 选择规则、env surface 和 `light` / `heavy` target 裁剪约束

### 复选框

- [ ] 冻结 selector env：
  - [ ] `TRAPMAP_PRIMARY_STORE_PROVIDER`
  - [ ] `TRAPMAP_SNAPSHOT_STORE_PROVIDER`
  - [ ] `TRAPMAP_CACHE_PROVIDER`
  - [ ] `TRAPMAP_GRAPH_PROVIDER`
  - [ ] `TRAPMAP_TASK_TRANSPORT`
- [ ] 冻结 provider-specific env：
  - [ ] PG
  - [ ] Redis
  - [ ] RabbitMQ
  - [ ] Neo4j
  - [ ] 本地文件/内存
- [ ] 定义 profile 推荐组合：
  - [ ] `local-agent`
  - [ ] `team-monolith`
  - [ ] `distributed`
- [ ] 定义 fail-fast / fallback 规则
- [ ] 定义 `light` target provider 裁剪规则
- [ ] 定义 `heavy` target provider 裁剪规则
- [ ] 定义 optional dependency / lazy import 规则

## Phase 5 Distributed 成熟度基线与运行隔离

### 目标

- 关闭问题 `#17-#24` 中关于 shared PG、无服务发现、无熔断、无 tracing、编排薄弱的成熟度缺口

### 复选框

- [ ] 为 distributed 形态定义“当前过渡态基线”与“未来成熟态目标”，避免文档把过渡态写成已完成微服务
- [ ] 共享 PostgreSQL、task queue、outbox 共池的已知影响被写入运维真相页
- [ ] internal service 调用链的最小保障要求被写清：
  - timeout
  - retry/failover 策略
  - 熔断/降级是否 deferred
  - 请求聚合与 cache 是否 deferred
- [ ] request-id 与 trace context 的现状、缺口和后续方案被写入 observability / architecture 文档
- [ ] compose 编排的能力边界和非能力边界被明确，不再把它描述成成熟编排方案
- [ ] 与 `docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md` 的关系被写清，避免形成第二套成熟度定义
- [ ] distributed 适配器装配被明确：
  - [ ] gateway provider 组合
  - [ ] worker provider 组合
  - [ ] queue / cache / graph provider 组合
  - [ ] provider capability 暴露到 operator status 的规则
- [ ] 分布式成熟度实现波次被明确：
  - [ ] Wave 3A：`undici` internal client + discovery adapter
  - [ ] Wave 3B：`opossum` breaker policy + error taxonomy
  - [ ] Wave 3C：`p-limit` bulkhead + dependency queue metrics
  - [ ] Wave 3D：`rate-limiter-flexible` gateway limiter
  - [ ] Wave 3E：OpenTelemetry tracing + propagation
  - [ ] Wave 3F：per-service DB config / pool isolation
- [ ] 成熟库引入优先级矩阵被回写到文档和实施顺序：
  - [ ] 哪些立即引入
  - [ ] 哪些条件成熟后引入
  - [ ] 哪些暂不替换

### 直接对应问题

- [ ] `#17` shared PG 隔离不足的事实与风险已冻结
- [ ] `#18` 服务发现现状被准确记录
- [ ] `#19` 熔断/降级缺失被归入明确问题池
- [ ] `#20` gateway 薄转发定位被准确记录
- [ ] `#21` 同步 RPC 缺少重试/多实例保障的现状已明确
- [ ] `#22` 无分布式追踪的事实与补强方向已明确
- [ ] `#23` queue/outbox 与业务查询共享 PG 的影响已明确
- [ ] `#24` docker-compose 编排限制已明确

## Phase 6 分布式成熟能力与成熟库替换矩阵冻结

### 目标

- 冻结哪些能力要引成熟库、什么时候引、在 `light` / `heavy` 下怎么落地，避免后续替换策略反复摇摆

### 复选框

- [ ] 冻结 `internal client + resilience` 的优先级、建议库和落地顺序
- [ ] 冻结 `tracing + metrics` 的优先级、建议库和落地顺序
- [ ] 冻结 `rate limiting + bulkhead / 背压` 的优先级、建议库和落地顺序
- [ ] 冻结 `cache + invalidation` 的引入条件
- [ ] 冻结 `service discovery` 的引入条件
- [ ] 冻结 `DB budget / PgBouncer` 的引入条件
- [ ] 冻结 `health/readiness indicator` 的统一模式
- [ ] 冻结“暂不替换”的边界：
  - [ ] PG queue 主干
  - [ ] graph query / graph store 整体替换
  - [ ] feature flag / operability guard 平台

## Phase 7 可维护性与文档真相收口

### 目标

- 关闭问题 `#25-#30` 中关于文档漂移、contracts 膨胀、计划过多、Dockerfile 重复、配置过度工程和测试路径依赖的问题

### 复选框

- [ ] 文档中的“终态架构”改写为“当前事实 + 目标态 + 过渡态边界”，不再把未来态直接写成已落地
- [ ] `packages/contracts` 中运维专属类型膨胀问题形成拆分策略或至少形成真相文档
- [ ] 历史计划文档的角色重新分类：
  - 当前执行面
  - 历史参考
  - deferred 问题池
- [ ] `host-local` / `host-distributed` Dockerfile 同步痛点被纳入结构治理或 deferred 问题池
- [ ] `config.ts` 的 profile / preset / capability 复杂度与实际使用差距被记录，并决定是收敛还是暂时冻结
- [ ] 测试矩阵明确区分“兼容层行为覆盖”和“生产路径覆盖”，避免继续把 snapshot/InMemory 结果当作主生产语义
- [ ] 统一适配器的可维护性约束被收口：
  - [ ] provider 文档集中
  - [ ] env 命名收敛
  - [ ] package 依赖边界清晰
  - [ ] optional dependency / tree-shaking 规则可验证

### 直接对应问题

- [ ] `#25` 文档与代码状态脱节已通过 truth source 修正
- [ ] `#26` contracts 膨胀的边界与处理方向已明确
- [ ] `#27` 迁移计划过多的问题已通过索引收口
- [ ] `#28` Dockerfile 手动同步的风险已纳入问题池
- [ ] `#29` 部署配置过度工程的状态已准确定性
- [ ] `#30` 测试对旧架构路径依赖的现状与整改优先级已明确

## 文档回写矩阵

- [ ] 根计划切换与当前唯一细则入口：更新 [`../../plan.md`](../../plan.md)、[`README.md`](README.md)、[`../README.md`](../README.md)、[`../archived/README.md`](../archived/README.md)
- [ ] 架构角色、包职责、compatibility shell / backend-core / hosts / services 真相：更新 [`../reference/REPO_STRUCTURE.md`](../reference/REPO_STRUCTURE.md)、[`../reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md)、[`../PACKAGES.md`](../PACKAGES.md)
- [ ] distributed 成熟度、部署与运行默认值：更新 [`../architecture/DEPLOYMENT.md`](../architecture/DEPLOYMENT.md)、[`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)、[`../operations/ENVIRONMENT.md`](../operations/ENVIRONMENT.md)
- [ ] 测试入口、PG-first / InMemory / snapshot 口径：更新 [`../operations/TESTING.md`](../operations/TESTING.md)
- [ ] 统一适配器目录、provider 组合、环境变量矩阵、target 裁剪规则：更新相关 host/build 文档和受影响 package README
- [ ] 熔断器、限流、bulkhead、discovery、trace、DB 隔离的默认策略与 env：更新 `ENVIRONMENT.md`、`DEPLOYMENT.md`、`ARCHITECTURE.md`、必要 package README
- [ ] 成熟库引入优先级、替换边界和暂缓原因：更新当前细则与必要的 architecture/deployment/testing 文档
- [ ] 如有 API、contracts、schema、owner 变化：更新对应 `docs/reference/*`、`docs/architecture/*`、受影响 package `README.md`

## 测试矩阵

- [ ] 仅本轮计划/索引文档更新：运行 `rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure`
- [ ] 触及共享类型、contracts、导出边界：补 `rtk pnpm typecheck`
- [ ] 触及统一适配器接口或 provider registry：补 adapter contract tests 与受影响 host/service focused tests
- [ ] 触及 `packages/server`、`backend-core`、`service-*`、`host-*` 的运行边界：补受影响包最小测试
- [ ] 触及 runtime / distributed / 调用链 / 配置默认值：补 `rtk pnpm test:runtime-foundations`，必要时补 `rtk pnpm test:deployment-smoke`
- [ ] 触及 provider 真实集成：
  - [ ] PG / Drizzle focused tests
  - [ ] RabbitMQ transport focused tests
  - [ ] Redis cache focused tests
  - [ ] Neo4j / graph provider focused tests
- [ ] 触及分布式成熟度能力：
  - [ ] breaker / fallback / half-open tests
  - [ ] rate limiting contract tests
  - [ ] bulkhead rejection / draining tests
  - [ ] discovery resolution / rebalance tests
  - [ ] trace propagation tests
  - [ ] per-service DB config isolation tests
- [ ] 触及 retrieval、governance、feedback、fixture、eval runner：补 `rtk pnpm eval:smoke`
- [ ] 在任何阶段勾选“完成”前，确认对应 focused tests、文档回写和结构守卫已一起通过

## 关闭条件

- [ ] 根 `plan.md` 与本细则形成单一执行入口，不再并行激活多份主线计划
- [ ] 30 个问题都被归类为：
  - 已关闭
  - 有明确 owner 与下一步的进行中项
  - 明确 deferred 且在权威文档中记录原因
- [ ] 统一适配器的接口、provider、环境变量和 target 规则已冻结并进入权威文档
- [ ] 文档不再把未来态误写为当前态
- [ ] 测试矩阵能区分兼容层与生产路径
- [ ] 后续如要继续深入某一主题，转入新的独立计划，而不是在本文件外继续扩散
