# TrapMap 微服务平台能力增强计划

## 状态

- 状态：`进行中`
- 对应根索引：[`../../plan.md`](../../plan.md)
- 输入参考：[`microservice-architecture-and-observability.md`](microservice-architecture-and-observability.md)
- 主题：在当前 `Level 2 / transitional-microservice` distributed 基线之上，增强服务发现、内部 RPC、可观测性与资源治理能力

## 目标

- 收敛 distributed profile 的服务发现方式，消除 compose/容器环境下依赖 `localhost` 回退的脆弱路径
- 为内部服务调用建立可渐进替换 HTTP/JSON 的 RPC seam，并给出明确的采用门槛、试点范围与回滚策略
- 把 metrics、tracing、structured logging 从契约和 requestId 级别推进到真实可运行、可验证的平台能力
- 补齐资源限制、运行时探针、dashboard/告警/SLO 所需的最小文档与验证入口

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

- [ ] 从 [`microservice-architecture-and-observability.md`](microservice-architecture-and-observability.md) 提炼当前事实、缺口和优先级，映射到本计划的阶段 checklist
- [ ] 在 `docs/reference/SYSTEM_TRUTH_SOURCES.md` 明确当前微服务增强主线的 truth source、deferred 边界与不承诺事项
- [ ] 统一本计划与 `docs/architecture/DEPLOYMENT.md`、`docs/operations/ENVIRONMENT.md` 中关于 distributed 成熟度的表述，避免把 deferred 能力写成已落地
- [ ] 为本计划建立完成定义：服务发现、RPC、可观测性、资源治理四条线都必须有“代码/配置 + 测试 + 文档”三件套

文档更新要求：
- [ ] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] 更新 `docs/architecture/DEPLOYMENT.md`
- [ ] 更新 `docs/operations/ENVIRONMENT.md`

最小验证：
- [ ] `rtk pnpm check:docs-drift`

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
- [ ] `rtk pnpm test:deployment-smoke`
- [x] 受影响 host/service 包的最小测试
- [x] `rtk pnpm check:docs-drift`

### Phase 2: 内部 RPC seam 与试点

- [ ] 盘点内部服务调用矩阵，挑出最值得试点的高频、类型稳定调用链
- [ ] 明确 RPC 方案选择标准，比较“保持 HTTP/JSON + 优化”、“Connect RPC”、“gRPC”等候选，并给出本仓库适配约束
- [ ] 在 `backend-core` port contract 不变的前提下，为 `host-distributed` 增加 transport seam，使 internal client 可以在 HTTP 与 RPC adapter 间切换
- [ ] 选择一个 bounded-context 间调用作为 RPC 试点，补齐错误映射、超时、trace propagation 和回退策略
- [ ] 为 RPC 试点增加最小测试、deployment smoke 或 runtime closeout 证据

文档更新要求：
- [ ] 更新 `docs/architecture/TARGET_ARCHITECTURE.md`
- [ ] 更新 `docs/architecture/SERVICE_BOUNDARIES.md`
- [ ] 更新 `docs/operations/ENVIRONMENT.md`
- [ ] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`

最小验证：
- [ ] 受影响 host/service 包的最小测试
- [ ] `rtk pnpm test:deployment-smoke`
- [ ] `rtk pnpm typecheck`

### Phase 3: Metrics、Tracing、Structured Logging 落地

- [ ] 把现有 `MetricsPort` / observability contract 映射到真实实现，至少收口 Prometheus metrics export 的 owner、命名空间和标签规则
- [ ] 为 distributed internal hop 接入 trace propagation 与 span 生命周期，优先保证 HTTP、DB、queue 三类关键链路可观测
- [ ] 统一结构化 JSON 日志字段，保证 requestId/traceId/serviceName/workerId/attempt 等关键字段可检索
- [ ] 定义 observability backend 的最小接入面：OTEL collector、Prometheus scrape、日志采集方案的仓库内事实边界
- [ ] 补齐对应测试或 smoke，证明 metrics/tracing/logging 不是只停留在 contract 层

文档更新要求：
- [ ] 更新 `docs/operations/ENVIRONMENT.md`
- [ ] 更新 `docs/operations/TESTING.md`
- [ ] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] 更新 `docs/architecture/components/ASYNC_MODEL.md`
- [ ] 更新 `docs/reference/api-surface.md`（如新增 `/metrics` 或 operator/debug surface）

最小验证：
- [ ] 受影响 contracts/host/service/server 包测试
- [ ] `rtk pnpm test:deployment-smoke`
- [ ] `rtk pnpm eval:smoke`
- [ ] `rtk pnpm typecheck`

### Phase 4: 资源治理、告警与运维收口

- [ ] 为 distributed 容器补齐内存/CPU 预算、连接池与堆配置约束，形成可执行默认值
- [ ] 明确 health/readiness/metrics/logging/tracing 的 operator runbook 和故障排查入口
- [ ] 为 task queue、internal hop latency、error rate 等关键指标定义首批 dashboard/alert/SLO 文档
- [ ] 把未完成的平台化议题转入 `open-debt-and-compromises.md` 或明确 deferred 文档，不留模糊 later
- [ ] 在 closeout 前完成文档索引、测试入口与验证矩阵收口

文档更新要求：
- [ ] 更新 `docs/operations/ENVIRONMENT.md`
- [ ] 更新 `docs/operations/TESTING.md`
- [ ] 更新 `docs/operations/SECURITY.md`（如涉及 service-to-service auth / trust boundary）
- [ ] 更新 `docs/README.md`
- [ ] 更新 `docs/todos/README.md`

最小验证：
- [ ] `rtk pnpm test:deployment-smoke`
- [ ] `rtk pnpm check:docs-drift`
- [ ] `rtk pnpm check:structure`

## 文档回写矩阵

- [ ] 服务发现行为、默认 URL、compose/network、deferred platformization：`docs/architecture/DEPLOYMENT.md`、`docs/operations/ENVIRONMENT.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] RPC seam、transport adapter、错误语义、回退策略：`docs/architecture/TARGET_ARCHITECTURE.md`、`docs/architecture/SERVICE_BOUNDARIES.md`、`docs/operations/ENVIRONMENT.md`
- [ ] metrics/tracing/logging contract 与 operator surface：`docs/operations/TESTING.md`、`docs/architecture/components/ASYNC_MODEL.md`、`docs/reference/api-surface.md`
- [ ] 活跃细则状态、入口索引与归档关系：`plan.md`、`docs/todos/README.md`、`docs/archived/README.md`、必要时 `docs/README.md`

## 测试与完成定义

- [ ] 每个 Phase 至少有一组与改动直接相关的最小测试，不允许只跑根级全量 `pnpm test`
- [ ] 任何 shared contract、环境变量或 API surface 变化，都要补 `rtk pnpm typecheck`
- [ ] 涉及 distributed runtime、queue、retrieval、governance、feedback 或 operator surface 的改动，都要判断并补跑 `rtk pnpm eval:smoke`
- [ ] 所有文档回写完成后，补跑 `rtk pnpm check:docs-drift`
- [ ] 如新增目录或文档落点规则，再补 `rtk pnpm check:structure`
- [ ] 完成时本计划中的阶段 checklist、文档回写矩阵和最小验证项全部打勾

## Deferred 落点

- [ ] Kubernetes Service / Headless Service / Ingress 等平台化编排：转入后续独立计划，不在本计划内承诺
- [ ] Service Mesh、mTLS、零信任网络：仅保留目标架构与 adoption 条件说明
- [ ] per-service database、MQ 全面替换、外部缓存平台、全量 dashboard-as-code：进入独立平台化或数据/runtime 计划
- [ ] 本计划过程中发现的阶段性妥协、短期兜底或未完成项，统一回写 [`open-debt-and-compromises.md`](open-debt-and-compromises.md)
