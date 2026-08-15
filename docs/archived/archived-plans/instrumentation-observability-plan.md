# TrapMap 数据埋点增强细则计划

> 当前角色：数据埋点、监控、追踪与 debug 能力增强的执行细则。对应根索引：[`../../plan.md`](../../plan.md)

## 1. 计划定位

- 本文档承接根 `plan.md`，负责维护执行细节、复选框、落点建议、测试要求、文档回写和关闭条件
- 目标不是“多打日志”，而是为整个项目建立统一的 instrumentation / observability 约束，使监控运行情况、链路追踪和 debug 有稳定入口
- 本文档默认覆盖：
  - request / trace / query / async job / worker 关联
  - runtime metrics、operator status、failure taxonomy
  - retrieval / governance / feedback / badcase trace
  - CLI / client-core / web-panel 可见 debug surface
- 本文档默认不覆盖：
  - 新监控平台选型
  - 引入全新业务状态机
  - 为 observability 单独造第二套 deployment profile 或第二套 config model

## 2. 关闭规则

- 任一任务或阶段勾选为完成前，必须同时满足：
  - [ ] 实现已落地，或冻结为明确结论并写清 deferred 理由
  - [ ] 受影响最小测试已执行
  - [ ] 受影响文档已回写
  - [ ] `pnpm check:docs-drift` 已通过
  - [ ] `pnpm check:structure` 已通过
- 若改动涉及 retrieval、summary、governance、feedback、fixtures、eval runner：
  - [ ] 补跑 `pnpm eval:smoke`

## 3. 文档与测试回写总表

### 文档

- [ ] `plan.md`：只保留当前阶段、勾选状态、总体要求和细则入口
- [ ] `docs/README.md`：更新当前根计划主线与细则入口描述
- [ ] `docs/todos/README.md`：更新本细则的主题和当前活跃主线说明
- [ ] `docs/archived/README.md`：补记旧根计划归档记录
- [ ] `docs/reference/SYSTEM_TRUTH_SOURCES.md`：补 instrumentation/trace/metrics/debug surface 的权威入口
- [ ] `docs/reference/REPO_STRUCTURE.md`：仅在目录落点或计划治理规则变化时更新
- [ ] `docs/operations/ENVIRONMENT.md`：回写 trace header、runtime metrics、相关 env/config
- [ ] `docs/operations/TESTING.md`：回写最小验证矩阵、trace/metrics/operator status 验证方法
- [ ] `docs/PACKAGES.md` 与相关 `packages/*/README.md`：回写 owner、surface、可见性边界
- [ ] 相关 `docs/architecture/*`：回写 request flow、async flow、client debug surface、operator surface

### 测试

- [ ] 文档-only 变更：`pnpm check:docs-drift`
- [ ] 文档-only 变更：`pnpm check:structure`
- [ ] contract / 类型 / client-server shape 变化：`pnpm typecheck`
- [ ] runtime / operator / distributed hop 变化：`pnpm test:runtime-foundations`
- [ ] deployment / host / route surface 变化：`pnpm test:deployment-smoke`
- [ ] retrieval / summary / governance / feedback / eval 相关变化：`pnpm eval:smoke`
- [ ] 受影响包最小测试：优先使用 `pnpm test:file -- <path>` 或包级 `--filter` 测试

## 4. 分阶段执行

### Phase 0 基线盘点与范围冻结

**目标：** 先把现有可观测面和缺口盘清，避免“以为没有，实际已有另一套”。

**建议读取入口：**

- `packages/contracts/src/domain/`
- `packages/backend-core/src/runtime/`
- `packages/server/src/lib/runtime/`
- `packages/server/src/routes/operations/`
- `packages/service-knowledge-read/src/`
- `docs/operations/ENVIRONMENT.md`
- `docs/operations/TESTING.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/todos/backend-engineering-optimization-plan.md`

**检查清单：**

- [x] 盘点现有 requestId、trace header、queryId 的生成、传播、暴露和持久化位置
- [x] 盘点现有 runtime metrics、cache metrics、operator stats、async status 的真实落点
- [x] 盘点 retrieval query trace、badcase trace、feedback export draft 的现有关系
- [x] 盘点 distributed hop、worker、internal client 的 header/trace 传播现状
- [x] 盘点 CLI / client-core / web-panel 当前能看到哪些 debug 信息，哪些仍盲区
- [x] 列出本轮优先补齐的缺口，按“必须有 / 应该有 / 可延后”分组
- [x] 明确非目标，避免把 MQ、平台接入、日志平台替换混进本轮

**Phase 0 盘点结论（2026-06-28 冻结）：**

- request/request-trace 真实落点：
  - `packages/host-local/src/nest/runtime/request-context.middleware.ts` + `request-context.service.ts` 是默认 `light` 宿主的 request context truth seam，负责提取/生成 `requestId`、透传 `traceId` 并回写响应 header。
  - `packages/server/src/lib/runtime/request-context.ts` 是 Fastify compatibility shell / shared consumer 的并行 seam，字段形状与 host-local 基本一致。
  - `packages/server/src/lib/runtime/runtime-metadata.ts` 与 `packages/backend-core/src/runtime/status.ts` 负责把 request/trace header 名纳入 runtime/status surface；这已经是 operator 可见事实，不需要再造第二套“trace config”。
- query trace / queryId 真实落点：
  - `packages/server/src/lib/retrieval/orchestration/orchestrator.ts` 是 retrieval `queryId` 生成与 pipeline trace 组装主落点，`packages/server/src/lib/rag-log.ts` 负责日志化。
  - `queryId` 当前已进入 retrieval log、部分 response/debug path、feedback/badcase capture 与 analytics repository，但还没有统一扩展到更广的 async/operator 关联键约束。
- runtime metrics / cache metrics / operator status 真实落点：
  - `packages/server/src/lib/runtime/metrics.ts` 维护 runtime execution/retry/reclaim/failure latency 计数。
  - `packages/server/src/lib/cache/metrics.ts` 提供 retrieval/cache invalidation 相关 snapshot。
  - `packages/server/src/routes/operations/status.ts` + `packages/contracts/src/domain/operations.ts` 已经把 `runtimeContract`、`idempotencyContract`、`retryResumeContract`、`freshnessContract`、`failureTaxonomy`、queue/outbox/workflow/cache/operator home 收口为 operator truth surface。
- badcase trace / feedback export draft 真实落点：
  - `packages/server/src/routes/feedback.ts` 在 feedback 持久化后，以 best-effort 方式写入 `retrieval_badcase_traces`，并调度 `feedback.badcase-export-draft` shared job。
  - `packages/server/src/lib/persistence/schema/retrieval.ts` 中的 `retrieval_badcase_traces` 是 durable badcase trace truth，不依赖 analytics retention。
  - `packages/server/src/routes/operations/badcases.ts` 从 durable trace 导出 deterministic eval draft；`packages/server/src/lib/jobs/handlers/badcase-export-draft.ts` 用 workflow run 把 draft-ready 这类异步状态接入 operator/runtime substrate。
- distributed hop / internal client 真实落点：
  - `packages/host-distributed/src/gateway/internal-client.ts` 是内部 HTTP hop 的基础 transport seam。
  - 分布式 header/trace 传播当前主要由 `packages/host-distributed/src/gateway/distributed-acceptance.test.ts`、`distributed-runtime-closeout.test.ts` 和相关 internal-client 测试守护，说明“传播证据主要在 acceptance/test，而不是单独的 runtime contract 字段”。
- 可见 debug/operator 面现状：
  - operator 当前可通过 `/v1/operations/status/async` 看到 async/runtime/freshness/failure/cache/workflow/badcase summary。
  - badcase export 有独立 operator route。
  - CLI / client-core / web-panel 目前没有统一的 trace drill-down surface；更多是复用现有 response additive field 与 operator route，因此 client-facing debug 仍是盲区。

**缺口分级（本轮冻结）：**

- 必须有：
  - 统一 request/trace/query/job/workflow/feedback/badcase 的 correlation key 命名与 owner 分层，避免 host/server/worker/client 各自发明别名。
  - 明确 logs、runtime metrics、cache metrics、operator status、durable badcase trace 各自职责边界，特别是“什么是 operator truth，什么只是日志”。
  - 明确 distributed hop / async path 的关联传播要求应该落在 contracts/runtime seam/testing matrix，而不是只存在于 acceptance 测试经验。
- 应该有：
  - 收敛 client/CLI 可见的最小 debug envelope，至少让 query/badcase/operator 之间的关联方式可解释。
  - 为 retrieval/governance/feedback 常见失败分类与 operator taxonomy 建立一致映射，减少 badcase 分类与 async failure taxonomy 各说各话。
  - 补齐文档中的 instrumentation truth matrix，减少现有事实散落在 plan、testing、packages README 的漂移风险。
- 可延后：
  - 新监控平台、外部 tracing backend、日志平台替换或统一 exporter 接入。
  - MQ / transport 产品化本身；本轮只消费现有 task transport truth，不重开平台选型。
  - 大范围 client/web-panel 新 debug UI；先冻结语义，再决定展示层。

**本轮优先范围冻结：**

- 只推进统一命名、truth source、contract 边界、runtime/operator/debug 文档与最小 additive shape 收敛。
- 优先覆盖 request -> route -> retrieval/feedback -> async job/workflow -> operator/badcase export 这条现有高频排障链路。
- 不修改 deployment profile、runtime mode、owner matrix、truth source 所定义的业务 owner 语义。

**非目标冻结：**

- 不引入新的业务状态机、队列系统、部署 profile、配置模型。
- 不把 observability 做成第二套 authoritative data plane。
- 不在本阶段新增大规模 client/web-panel 可视化或平台接入工作。

**与既有计划关系：**

- `docs/todos/backend-engineering-optimization-plan.md` 继续充当问题池与后续工程化方向，其中“为检索、摘要、治理失败补齐 queryId、结果快照和失败分类”已被本计划吸收为 observability 主线的一部分；后续实现以本页阶段推进为准。
- Nest/service 演进细则继续提供 host、owner、distributed hop、async ownership 的边界事实；本页只定义 instrumentation 应如何复用这些边界，不重复维护服务拆分任务。

**本阶段文档回写要求：**

- [x] 在本页冻结盘点结论与优先级
- [x] 如 root 索引范围有变化，同步更新 `plan.md`
- [x] 如发现已有 truth source 与实际不符，更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`

**本阶段最小验证：**

- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

### Phase 1 埋点模型与 contract 收敛

**目标：** 统一字段、事件、指标和 surface 边界，让后续新增埋点不再各自为政。

**需要冻结的内容：**

- [x] correlation key 命名：例如 request、trace、query、job、workflow、feedback、candidate 的关联键
- [x] metric namespace 与标签维度约束：哪些能做 label，哪些只能做 event field
- [x] failure taxonomy 与 degraded/retry/timeout 口径
- [x] public response additive field 与 internal-only trace/debug payload 的边界
- [x] backend-core port / host runtime / server compatibility seam / client surface 的 owner 分层
- [x] logs、metrics、trace、operator status、durable badcase trace 之间各自承担什么职责

**输出物：**

- [x] 在本页补一份统一命名与 owner 约束清单
- [x] 在 `docs/reference/SYSTEM_TRUTH_SOURCES.md` 增加 instrumentation 事实源条目
- [x] 在 `docs/operations/TESTING.md` 明确 trace / metrics / operator status 的验证入口
- [x] 在 `docs/operations/ENVIRONMENT.md` 明确相关 env/config 与 header 语义

**本阶段最小验证：**

- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`
- [ ] 如 contract 或类型变更：`pnpm typecheck`
- [ ] 如改到相关包：补受影响包最小测试

**Phase 1 冻结结论（2026-06-28）：**

- 统一 correlation keys 冻结为：`requestId`、`traceId`、`queryId`、`feedbackId`、`asyncJobId`、`workflowRunId`、`candidateId`、`entryId`、`artifactId`。其中默认 public additive 只允许 `requestId`、`traceId`、`queryId`、`feedbackId`、`asyncJobId`；`workflowRunId`、`candidateId`、`entryId`、`artifactId` 默认仅限 internal/operator/durable trace surface。
- 统一 event taxonomy 冻结为：`request`、`retrieval`、`feedback`、`async-job`、`workflow`、`operator`、`badcase-export`。新增埋点必须先归入该 taxonomy，再决定 log/metric/operator 表达，不得再按包自造同义类别。
- 统一 metric namespace 冻结为：`trapmap.runtime`、`trapmap.async`、`trapmap.retrieval`、`trapmap.cache`、`trapmap.feedback`、`trapmap.operator`。允许做低基数 label 的只有 `eventCategory`、`eventName`、`failureClassification`、`runtimeMode`、`serviceUnit`、`routeFamily`、`dependencyName`、`cacheNamespace`、`taskType`、`workflowType`；`requestId` / `queryId` / `feedbackId` / `asyncJobId` 一类高基数键只能进入日志、trace 或 durable trace，不进入 metrics label。
- 统一 failure taxonomy 继续沿用现有 async/runtime 口径：`user-error`、`auth-policy-error`、`dependency-error`、`timeout`、`stale-projection`、`retryable-async-failure`、`permanent-failure`。badcase taxonomy 仍独立服务于 retrieval/feedback reproducibility，不取代 runtime/operator failure taxonomy。
- owner 分层冻结为：
  - `contracts`：只冻结共享 key 命名、public additive 字段、taxonomy enum。
  - `backend-core-port`：声明跨 service / async 边界需要传播哪些关联键，不拥有日志或 metrics 真相。
  - `runtime-seam`：拥有 request/trace header、runtime metrics snapshot、degraded/timeout/retry 语义。
  - `server-compatibility-seam`：只桥接 shared runtime/status consumer，不得演化成第二套 observability truth source。
  - `client-surface`：仅暴露 additive debug handles，不直接暴露 internal workflow/candidate/artifact trace internals。
  - `operator-surface`：解释 backlog、freshness、failure taxonomy、runtime mode 与 async follow-up 状态。
  - `durable-trace`：持久化 badcase/export 所需 reproducibility 上下文，不依赖日志 retention。
- 职责边界冻结为：
  - logs：记录高基数 correlation fields 与事件细节；
  - metrics：记录低基数 runtime/async/cache/operator 健康与容量口径；
  - operator status：提供当前运行状态和排障摘要；
  - durable badcase trace：提供 retrieval/feedback/export 可复现场景真相；
  - public response additive fields：只提供用户/客户端后续排障所需最小句柄，而不是完整内部 trace payload。

### Phase 2 运行时与异步链路埋点补齐

**目标：** 让“请求怎么走到异步任务、哪里失败、为什么重试、现在是否退化”可解释。

**重点链路：**

- [ ] ingress request -> route -> application service -> queue/job enqueue
- [ ] worker dequeue -> execution -> retry / dead-letter / completion
- [ ] gateway -> internal client -> distributed service hop
- [ ] readiness / status / operator summary -> runtime explanation

**补齐清单：**

- [x] request/trace header 传播在 light 与 heavy 路径都可验证
- [x] runtime metrics 对 timeout、retry、degraded、queue/backlog 有统一统计口径
- [x] operator/status surface 能解释 queue 积压、失败分类和运行时模式
- [x] async path 的 jobId / workflowId / request 关联关系可追踪
- [x] 关键错误映射在 route、worker、internal client 之间保持一致

**Phase 2 本轮落地（2026-06-28）：**

- `feedback -> badcase export draft` 这条现有高频 async follow-up 已补齐 request context 到 async payload 的最小传播：`requestId` / `traceId` 从 runtime seam 进入 shared job payload，并随 `workflow_runs.stats` 持久化。
- `/v1/operations/status/async` 现在通过 `workflows[*].correlation` 暴露 operator 可读的最小关联句柄：`requestId`、`traceId`、`queryId`、`feedbackId`、`asyncJobId`。该字段属于 internal/operator surface，不新增通用 public additive field。
- 共享 runtime metrics 现已对 `timeout`、`retryable-async-failure`、`permanent-failure`、`degraded`、`reclaim`、`queue backlog`、`outbox backlog`、`stale workers` 使用同一套低基数统计口径；`/v1/operations/status/async` 通过 additive `runtimeMetrics` 暴露 operator/internal 汇总，不新增第二套 metric namespace。
- distributed internal client 现已补充 focused 测试，固定 `x-request-id` / `x-trace-id` / `x-correlation-id` 透传行为，并确认超时/不可用/冲突等 canonical error kind 在 gateway -> internal client -> owner service hop 上不漂移。
- 本轮把 runtime/status 与 distributed hop 的最小闭环补齐到现有 async/operator 路径；candidate、knowledge lifecycle 之外的更大 retrieval/governance/debug 面增强仍留在后续阶段。

**文档回写要求：**

- [x] `docs/operations/ENVIRONMENT.md`
- [x] `docs/operations/TESTING.md`
- [x] 相关 `docs/architecture/*`
- [ ] 必要 package README

**最小验证：**

- [ ] `pnpm test:runtime-foundations`
- [ ] `pnpm test:deployment-smoke`
- [ ] 受影响包最小测试
- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

### Phase 3 检索、治理、feedback 与 debug 面增强

**目标：** 让高频故障排查路径拥有稳定 trace/debug contract，并能进入 badcase/eval 闭环。

**重点对象：**

- [ ] retrieval query trace
- [ ] governance / review failure path
- [ ] feedback -> badcase export draft
- [ ] queryId、feedbackId、badcase trace、eval draft 的关联
- [ ] client 可见 debug envelope 或 operator-drilldown surface

**补齐清单：**

- [ ] 明确 retrieval trace 与 badcase durable truth 的边界
- [ ] 明确哪些 debug 信息允许暴露给 client，哪些只在 operator/internal surface
- [ ] retrieval / governance / feedback 的失败分类可映射到统一 taxonomy
- [ ] eval smoke、badcase 回放和 operator 排障看到的是同一套关键字段语义
- [ ] 如新增 trace 字段，会同步更新 eval normalizer / README / testing 文档

**文档回写要求：**

- [ ] `docs/operations/TESTING.md`
- [ ] `evals/retrieval/README.md`、`evals/summary/README.md`（如受影响）
- [ ] `docs/architecture/components/*`
- [ ] `docs/reference/api-surface.md`、必要时 `docs/reference/DATA_MODEL.md`

**最小验证：**

- [ ] 受影响包最小测试
- [ ] `pnpm eval:smoke`
- [ ] 如涉及 route/deployment：`pnpm test:deployment-smoke`
- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`

### Phase 4 客户端、文档与守卫收尾

**目标：** 关闭入口漂移，补齐长期守卫，保证后续新增功能不会绕开已冻结的 instrumentation 约束。

**收尾清单：**

- [ ] CLI / client-core / web-panel 对外可见的 debug/trace 语义已冻结
- [ ] docs 索引、truth source、testing、environment、architecture 入口已统一
- [ ] 若同类漂移可能复发，补 docs drift / structure / truth smoke / focused tests
- [ ] 根 `plan.md` 与本页复选框状态和真实进度一致
- [ ] 剩余 deferred 项显式记录，不伪装成已完成

**最小验证：**

- [ ] `pnpm check:docs-drift`
- [ ] `pnpm check:structure`
- [ ] `pnpm typecheck`（如有 shape 变化）
- [ ] 相关最小测试与 `pnpm eval:smoke`（如受影响）

## 5. 与现有计划的关系

- [ ] `docs/todos/backend-engineering-optimization-plan.md` 继续保留为工程化问题池；本页是当前 instrumentation 主线执行细则
- [ ] `docs/todos/backend-build-targets-plan.md` 退回历史活跃细则，不再作为根计划主线
- [ ] Nest/service 演进相关 todo 继续提供 host、owner、distributed 边界事实；本页不重复维护那套迁移任务
- [ ] 如后续需要分拆为子专题，应继续落在 `docs/todos/`，并由根 `plan.md` 链接

## 6. 完成定义

- [ ] 根 `plan.md` 只保留索引职责，本页承担执行细节
- [ ] 统一的 instrumentation 术语、关联键、metrics/debug/trace 边界已经冻结
- [ ] 关键运行链路、异步链路和 retrieval/governance/feedback 排障链路都有最小可用观测能力
- [ ] 文档、测试、eval smoke 与实现一致
