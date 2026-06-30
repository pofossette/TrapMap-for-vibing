# TrapMap 微服务平台能力增强计划

## 状态

- 状态：`完成`
- 对应根索引：[`../../plan.md`](../../plan.md)
- 输入参考：[`microservice-architecture-and-observability.md`](microservice-architecture-and-observability.md)
- 主题：在当前 `Level 2 / transitional-microservice` distributed 基线之上，增强服务发现、内部 RPC、可观测性与资源治理能力
- 归档说明：Phase 0-4 closeout 已完成；本计划只保留为历史 closeout 证据，未继续落地的平台化议题统一留在 [`open-debt-and-compromises.md`](open-debt-and-compromises.md) 的 deferred 落点

## 目标

- 收敛 distributed profile 的服务发现方式，消除 compose/容器环境下依赖 `localhost` 回退的脆弱路径
- 为内部服务调用建立可渐进替换 HTTP/JSON 的 RPC seam，并给出明确的采用门槛、试点范围与回滚策略
- 把 metrics、tracing、structured logging 从契约和 requestId 级别推进到真实可运行、可验证的平台能力
- 补齐运行时探针、dashboard/告警/SLO 所需的最小文档与验证入口，并把超出本轮最小真实落地范围的资源治理默认值明确转 deferred

## 非目标

- 不把 `distributed` 直接写成成熟自治微服务平台
- 不在本计划内完成 Kubernetes、Service Mesh、per-service database 或 MQ 全面产品化
- 不改变 `gateway only` 外部接入模型
- 不引入第二套业务 contract、第二套路由真相或绕开 `backend-core` port 的 service-to-service 调用方式

## 冻结原则

- 服务发现增强优先走“显式配置 -> compose DNS -> 统一 resolver seam”的渐进路径，不直接跳到注册中心
- RPC 采用必须继续遵守 `port-first, transport-agnostic`；只有在调用频率、类型稳定性、延迟压力被证实后才替换局部 internal HTTP hop
- 可观测性增强必须先冻结 contract、字段命名、可见性边界与 label/cardinality 规则，再接 SDK 和后端
- 每个阶段都要带最小验证集合、文档回写要求与 deferred 落点，避免再次只留下分析文档

## 执行阶段

### Phase 0: 基线冻结与问题池收口

- [x] 从 [`microservice-architecture-and-observability.md`](microservice-architecture-and-observability.md) 提炼当前事实、缺口和优先级，映射到本计划的阶段 checklist
- [x] 在 `docs/reference/SYSTEM_TRUTH_SOURCES.md` 明确当前微服务增强主线的 truth source、deferred 边界与不承诺事项
- [x] 统一本计划与 `docs/architecture/DEPLOYMENT.md`、`docs/operations/ENVIRONMENT.md` 中关于 distributed 成熟度的表述，避免把 deferred 能力写成已落地
- [x] 为本计划建立完成定义：服务发现、RPC、可观测性、资源治理四条线都必须有“代码/配置 + 测试 + 文档”三件套

文档更新要求：
- [x] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [x] 更新 `docs/architecture/DEPLOYMENT.md`
- [x] 更新 `docs/operations/ENVIRONMENT.md`

最小验证：
- [x] `rtk pnpm check:docs-drift`

### Phase 1: 服务发现与配置收口

- [x] 盘点 `packages/host-distributed` 与相关 `service-*` 中的服务 URL 解析入口、默认端口、回退逻辑和 `TRAPMAP_*_URL` 覆盖规则
- [x] 设计统一的 service resolver seam，明确 compose、local dev、测试环境下的解析优先级和错误语义
- [x] 为 distributed compose 补齐显式 network、服务 URL 注入或基于 Docker DNS 的默认值策略，消除跨容器 `localhost` 回退
- [x] 为服务发现新增最小 smoke 或集成测试，验证 gateway 到 candidate/governance/job-runtime 等内部跳转在容器内可达
- [x] 记录仍然 deferred 的注册中心 / Kubernetes Service / Service Mesh 路线，避免在当前阶段混入

文档更新要求：
- [x] 更新 `docs/architecture/DEPLOYMENT.md`
- [x] 更新 `docs/operations/ENVIRONMENT.md`
- [x] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [x] 更新 `docs/reference/REPO_STRUCTURE.md`（如新增 resolver/config seam）

最小验证：
- [x] `rtk pnpm test:deployment-smoke`
- [x] 受影响 host/service 包的最小测试
- [x] `rtk pnpm check:docs-drift`

### Phase 2: 内部 RPC seam 与试点

- [x] 盘点内部服务调用矩阵，挑出最值得试点的高频、类型稳定调用链
- [x] 明确 RPC 方案选择标准，比较“保持 HTTP/JSON + 优化”、“Connect RPC”、“gRPC”等候选，并给出本仓库适配约束
- [x] 在 `backend-core` port contract 不变的前提下，为 `host-distributed` 增加 transport seam，使 internal client 可以在 HTTP 与 RPC adapter 间切换
- [x] 选择一个 bounded-context 间调用作为 RPC 试点，补齐错误映射、超时、trace propagation 和回退策略
- [x] 为 RPC 试点增加最小测试、deployment smoke 或 runtime closeout 证据

文档更新要求：
- [x] 更新 `docs/architecture/TARGET_ARCHITECTURE.md`
- [x] 更新 `docs/architecture/SERVICE_BOUNDARIES.md`
- [x] 更新 `docs/operations/ENVIRONMENT.md`
- [x] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`

最小验证：
- [x] 受影响 host/service 包的最小测试
- [x] `rtk pnpm test:deployment-smoke`
- [x] `rtk pnpm typecheck`

当前试点事实：

- 已确认 `governance-review -> knowledge-write` 与 `candidate-ingestion -> knowledge-write` 是当前最适合的高频、类型稳定 owner-hop；首个 RPC seam 先冻结在 `governance-review -> knowledge-write`
- `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` 现在支持 `http` / `rpc` 可切换 transport，默认仍为 `http`
- `packages/service-knowledge-write/src/routes.ts` 新增 `/internal/rpc/knowledge-write` envelope route，只覆盖冻结后的 review / maintenance / decay / candidate publish command surface
- 环境开关当前只冻结到 `TRAPMAP_KNOWLEDGE_WRITE_TRANSPORT=http|rpc`
- 第二条运行证据已补齐到 distributed closeout：`gateway -> candidate-ingestion -> knowledge-write` 的 `manual-result` 链路在 `TRAPMAP_KNOWLEDGE_WRITE_TRANSPORT=rpc` 下已通过 closeout 测试，并验证 `x-request-id` / `x-trace-id` 继续传到 `knowledge-write`

Phase 2 transport decision（2026-06-30）：

- 选择标准：
  - 是否要求新增 `proto` / Buf / codegen 作为第二套 contract truth
  - 是否能继续保持 `packages/contracts` 与 `packages/backend-core/src/ports/internal-ports.ts` 为主线真相
  - 是否适合当前仅有的少量 unary internal owner-hop，而不是 repo-wide streaming/RPC 平台
  - 是否能延续当前 Fastify + request/trace header + `InvocationError` 映射，而不引入新的基础设施门槛
  - 是否会扩大 distributed profile 的 operator/deploy complexity（TLS、HTTP/2、proxy/ingress、codegen drift）
- 仓库约束：
  - 当前仓库没有 `.proto`、Buf、Protobuf codegen 或 gRPC/Connect 依赖链
  - 共享 contract 真相当前冻结在 `packages/contracts/src/index.ts` 与 `packages/contracts/src/domain/**` 的 Zod/TS surface
  - 当前试点链路是 server-to-server unary command hop，不涉及浏览器直连、双向流、跨语言 SDK 或公开 API surface
  - 当前 gateway only、shared PostgreSQL、Level 2 transitional-microservice posture 不支持把 internal transport 试点写成平台级协议切换
- 结论：
  - 当前 seam 继续停在自有 RPC envelope，作为 host-owned pilot seam；不在本阶段抽到 Connect RPC 或 gRPC
  - `HTTP/JSON + 当前 envelope RPC` 胜出的原因是迁移面最小、无需第二套 schema truth、可以直接复用现有错误语义/trace headers/测试模式
  - `Connect RPC` 是后续最优先的 formal protocol 候选，因为它支持 Connect / gRPC / gRPC-Web 多协议、Fastify/Node 集成成熟，但前提是仓库先接受 Protobuf/Buf 成为新增 truth surface
  - `gRPC` 当前不采纳：它同样要求 proto/codegen，同时对 HTTP/2/TLS/dev ergonomics 的要求更重，而本仓库现阶段没有 streaming 或跨语言收益来覆盖成本
- 触发重新评估的 adoption gate：
  - 至少两个以上高频 owner-hop 需要复用同一正式 RPC stack
  - internal unary envelope 数量明显扩张，手写 route/client 映射开始重复
  - 需要标准化 streaming、跨语言消费端，或需要 Connect/gRPC 生态现成拦截器/观测能力
  - 团队接受 `proto + Buf + generated code` 成为新的仓库事实源

### Phase 3: Metrics、Tracing、Structured Logging 落地

- [x] 把现有 `MetricsPort` / observability contract 映射到真实实现，至少收口 Prometheus metrics export 的 owner、命名空间和标签规则
- [x] 为 distributed internal hop 接入 trace propagation 与 span 生命周期，优先保证 HTTP、DB、queue 三类关键链路可观测
- [x] 统一结构化 JSON 日志字段，保证 requestId/traceId/serviceName/workerId/attempt 等关键字段可检索
- [x] 定义 observability backend 的最小接入面：OTEL collector、Prometheus scrape、日志采集方案的仓库内事实边界
- [x] 补齐对应测试或 smoke，证明 metrics/tracing/logging 不是只停留在 contract 层

文档更新要求：
- [x] 更新 `docs/operations/ENVIRONMENT.md`
- [x] 更新 `docs/operations/TESTING.md`
- [x] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [x] 更新 `docs/architecture/components/ASYNC_MODEL.md`
- [x] 更新 `docs/reference/api-surface.md`（如新增 `/metrics` 或 operator/debug surface）

最小验证：
- [x] 受影响 contracts/host/service/server 包测试
- [x] `rtk pnpm test:deployment-smoke`
- [x] `rtk pnpm eval:smoke`
- [x] `rtk pnpm typecheck`

### Phase 4: 资源治理、告警与运维收口

- [x] 明确 health/readiness/metrics/logging/tracing 的 operator runbook 和故障排查入口
- [x] 为 task queue、internal hop latency、error rate 等关键指标定义首批 dashboard/alert/SLO 文档
- [x] 把未完成的平台化议题转入 `open-debt-and-compromises.md` 或明确 deferred 文档，不留模糊 later
- [x] 在 closeout 前完成文档索引、测试入口与验证矩阵收口

文档更新要求：
- [x] 更新 `docs/operations/ENVIRONMENT.md`
- [x] 更新 `docs/operations/TESTING.md`
- [x] 更新 `docs/operations/SECURITY.md`（如涉及 service-to-service auth / trust boundary）
- [x] 更新 `docs/README.md`
- [x] 更新 `docs/todos/README.md`

最小验证：
- [x] `rtk pnpm test:deployment-smoke`
- [x] `rtk pnpm check:docs-drift`
- [x] `rtk pnpm check:structure`

## 文档回写矩阵

- [x] 服务发现行为、默认 URL、compose/network、deferred platformization：`docs/architecture/DEPLOYMENT.md`、`docs/operations/ENVIRONMENT.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [x] RPC seam、transport adapter、错误语义、回退策略：`docs/architecture/TARGET_ARCHITECTURE.md`、`docs/architecture/SERVICE_BOUNDARIES.md`、`docs/operations/ENVIRONMENT.md`
- [x] metrics/tracing/logging contract 与 operator surface：`docs/operations/TESTING.md`、`docs/architecture/components/ASYNC_MODEL.md`、`docs/reference/api-surface.md`
- [x] 活跃细则状态、入口索引与归档关系：`plan.md`、`docs/todos/README.md`、`docs/archived/README.md`、必要时 `docs/README.md`

## 测试与完成定义

- [x] 每个 Phase 至少有一组与改动直接相关的最小测试，不允许只跑根级全量 `pnpm test`
- [x] 任何 shared contract、环境变量或 API surface 变化，都要补 `rtk pnpm typecheck`
- [x] 涉及 distributed runtime、queue、retrieval、governance、feedback 或 operator surface 的改动，都要判断并补跑 `rtk pnpm eval:smoke`
- [x] 所有文档回写完成后，补跑 `rtk pnpm check:docs-drift`
- [x] 如新增目录或文档落点规则，再补 `rtk pnpm check:structure`
- [x] 完成时本计划中的阶段 checklist、文档回写矩阵和最小验证项全部打勾

## Deferred 落点

- [x] Kubernetes Service / Headless Service / Ingress 等平台化编排：转入后续独立计划，不在本计划内承诺
- [x] Service Mesh、mTLS、零信任网络：仅保留目标架构与 adoption 条件说明
- [x] container CPU/memory checked-in defaults、Node heap presets、PgBouncer / pool introspection contract：转入 deferred，不阻塞本轮 closeout
- [x] per-service database、MQ 全面替换、外部缓存平台、全量 dashboard-as-code：进入独立平台化或数据/runtime 计划
- [x] 本计划过程中发现的阶段性妥协、短期兜底或未完成项，统一回写 [`open-debt-and-compromises.md`](open-debt-and-compromises.md)
