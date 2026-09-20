# 检索延迟可观测化主线

> 状态：Active（2026-09-19 起，由根 [`plan.md`](../../plan.md)「当前主线」显式链接）；T0-T8 与四路打通已落地，T6.2 与 v3 图计划编译转债务。
> Owner：待指派。范围：让四路检索端点 × 四召回通道的延迟**可衡量、可计算、可量化**。
> 真源：本细则只定执行顺序与验收；事实冲突时以源码、`packages/contracts`、`docs/reference/SYSTEM_TRUTH_SOURCES.md` 为准。

## 0. 目标与非目标

**目标**

1. 四路检索端点各自能给出端到端 P50 / P95 / P99 与吞吐。
2. 每次检索能分解到管道阶段（`parse / snapshot / eligibility / boundary-filter / routing / recall / assembly / summary / refinement`）。
3. 召回阶段能分解到通道（`keyword / semantic / graph`，`heuristic` 见 §2 退役现实）。
4. 上述三项在 Prometheus / OTel 里可直接查询，并在 eval 侧有可复现基线与回归门禁。

**非目标**

- 不做性能优化。本主线只产出度量，不改动召回、打分、合并、重排语义。
- 不改对客 API。延迟**不进** `RetrievalResponse`（沿用既有约定：`routingTrace` 之外的内部字段只落日志，见 `docs/superpowers/specs/2026-05-24-llm-intent-parsing-design.md:277`）。
- 不复活 `/v2/retrieval/search` 与 `heuristic` 通道（见 §2）。
- 不自建第二条 traces / metrics 管线（Sentry 只聚合 actionable error，已是既定约束）。

## 1. 事实基线（2026-09-19 核对源码）

### 1.1 四路端点定义与注册状态

| 端点 | 契约位 | host-local | host-distributed | 状态 |
|---|---|---|---|---|
| `/v1/retrieval/search` | `evals/types/retrieval.ts:43` | `packages/host-local/src/nest/gateway/gateway.route-defs.ts:130` | `packages/host-distributed/src/gateway/route-defs/knowledge.ts:275` | 活 |
| `/v1/retrieval/skills/search-by-content` | `evals/types/retrieval.ts:44` | `gateway.route-defs.ts:154` | `route-defs/knowledge.ts:291` | 活 |
| `/v2/retrieval/search` | `evals/types/retrieval.ts:45` | 未注册 | 未注册 | **死路由**，`scripts/check-route-surface.ts:44` 豁免项 |
| `/v3/retrieval/search` | `evals/types/retrieval.ts:46` | `gateway.route-defs.ts:142` | `route-defs/knowledge.ts:283` | 活 |

### 1.2 现有计时与指标

- 管道阶段计时**已存在**：`packages/service-knowledge-read/src/search-knowledge.ts:65` 的 `timedStep()`，共 9 个阶段，`totalLatencyMs` 在 `:121`。
- 落点只有文件：`rag-log.ts:143` 写 JSONL 到 `LOG_RAG_DIR`（默认 `logs/rag/`），默认关（`LOG_RAG_ENABLED`，`rag-log.ts:63`）。无指标、无 Loki、无聚合脚本。
- HTTP 直方图：`trapmap_http_request_duration_seconds{method,route_family,status_class}`（`packages/host-local/src/nest/observability/prometheus.service.ts:45`）。`normalizeObservabilityRouteFamily`（`packages/contracts/src/domain/observability.ts:70`）把 `/v1/*` 一律归 `gateway`，**检索与 candidates/cron/knowledge 混在一起**。
- OTel：只有 HTTP server span（`http-metrics.middleware.ts:50`），service 层无任何子 span。
- eval：`evals/retrieval-live/lib/backend-client.ts:54` 已有 `durationMs`，`run.ts:451` 进报告，但 `compare.ts:90-97` 的 verdict 只看 `hitAt1` / `mrr`，**延迟不判定**。
- 命名与命名空间：契约已预留 `'trapmap.retrieval'` 命名空间（`observability.ts:57`）与 `'retrieval'` 事件类别（`observability.ts:44`），当前无消费方——本主线复用，不新增枚举值。

### 1.3 可复用的既有模板

`ExperienceGeneMetricsPort`（`packages/backend-core/src/ports/experience-gene-ports.ts:77`）已经跑通完整三段式：backend-core 定 port → host-local 出 Prometheus 实现（`packages/host-local/src/nest/observability/experience-gene-metrics.ts:22`）→ host-distributed 出 OTel 实现（`packages/host-distributed/src/gateway/internal-observability.ts:115`）→ 组合根注入。本主线照抄这个形状，不发明第四种接法。

## 2. 两个切分维度与退役现实

**维度 A — 端点（四路）**：`v1-search` / `v1-skills` / `v2-capsule` / `v3-graph-plan`。
**维度 B — 通道（四通道）**：`heuristic` / `keyword` / `semantic` / `graph`（`docs/architecture/components/RETRIEVAL.md:42-47`）。

退役现实必须先说清，否则指标会给人错觉：

- `heuristic` 属于 v2 胶囊管道，随已删除的 `packages/server`（Wave-10 退役，历史包）一起退役，当前 `packages/` 内**无实现**（全仓 grep 仅 `routes.ts:243` 一处无关注释）。
- 活的召回通道只有三个：`keyword`（`retrieval-keyword.ts:31`）、`semantic`（`retrieval-semantic.ts:128`）、`graph`（`recall/graph-channel.ts:40` 的 `pgRecall.graphAssistedRecall`）。
- 注册进 `ChannelRegistry` 的只有 `semantic` 与 `keyword`（`server-retrieval-seam.ts:327`）；`graph` 由 `graphAssistedHybridRecall` 直接并发调用，不经注册表。

**处置**：枚举保留四位（与文档、eval 四路契约对齐），生产上 `v2-capsule` 与 `heuristic` 恒为 0 序列；告警与 compare verdict 对恒 0 序列不判定，避免把"没数据"误报成"变快了"。**不新增** `SURFACE_EXEMPTIONS` 条目。

## 3. 指标设计

三族直方图，单位统一 `ms`（对齐 gene 指标 `_duration_ms` 与 Go 侧 `trapmap_knowledge_read_duration_ms`；HTTP 直方图用秒是既有事实，不动）。

| 指标 | Labels | 组合数 | 用途 |
|---|---|---|---|
| `trapmap_retrieval_search_duration_ms` | `endpoint`, `mode`, `outcome` | 4×5×3=60 | 端点端到端延迟 |
| `trapmap_retrieval_stage_duration_ms` | `endpoint`, `stage` | 4×10=40 | 管道阶段分解 |
| `trapmap_retrieval_channel_duration_ms` | `endpoint`, `channel` | 4×4=16 | 召回通道分解 |

- Buckets：`[5, 10, 25, 50, 100, 200, 400, 800, 1600, 3200]`（覆盖本地内存召回到带 PG + embedding 的完整链路）。
- 序列预算：116 组合 ×（10 buckets + 2）≈ 1392 series，无高基数风险。
- **label 禁令**：`seed`、`entryId`、`teamId`、`userId`、prompt 文本一律禁止进 label（`docs/operations/OBSERVABILITY-OPERATIONS.md:132` 既有约束）。
- 不预设 SLO 数值。现有 `route_family="gateway"` P95 < 500ms（`OBSERVABILITY-OPERATIONS.md:167`）是**网关整体**目标，检索基线要等 T7 首次实测后回填，**禁止直接套用**。

查询形态（T8 落文档）：

```promql
histogram_quantile(0.95,
  sum by (le, endpoint) (
    rate(trapmap_retrieval_search_duration_ms_bucket[5m])
  )
)
```

## 4. 关键设计决策：endpoint 如何透传

`/v1/retrieval/search` 与 `/v3/retrieval/search` 共用同一个 `retrievalQuery` 实例（`packages/host-local/src/nest/runtime/host-runtime.ts:89-94`，两个 RouteDef handler 都调 `deps.knowledgeRead.search`），所以 endpoint **不能在构造期固化**，必须在调用期传入。

**决策**：给 `RetrievalSearchParams`（`packages/backend-core/src/ports/retrieval-ports.ts:15`）加可选字段 `latencyEndpoint?: RetrievalLatencyEndpoint`，由 RouteDef handler 在调用点传入，`searchKnowledge` 据此给三族指标打 `endpoint` 标签。缺省 `'unknown'`，保证所有现有调用点（含 `skillLookup` 内部那次 `searchKnowledge`）零改动即可编译。

- `/v1/retrieval/search` → `v1-search`（`gateway.route-defs.ts:135` / `route-defs/knowledge.ts:275`）
- `/v3/retrieval/search` → `v3-graph-plan`（`gateway.route-defs.ts:146` / `route-defs/knowledge.ts:283`）
- `/v1/retrieval/skills/search-by-content` → `v1-skills`（`server-retrieval-seam.ts:399` 内部调用，构造期固化即可，因为 skillLookup 不被其他端点复用）

## 5. 执行阶段

### T0 — 契约地基

- 新增 `packages/contracts/src/enum-types/retrieval-latency.ts`（`AGENTS.md` 要求新枚举就近 `enum-types/` + `index.ts` 聚合）：
  - `retrievalLatencyEndpointSchema` = `v1-search | v1-skills | v2-capsule | v3-graph-plan | unknown`
  - `retrievalPipelineStageSchema` = 现有 9 阶段 + `recall-channel` + `total`
  - `retrievalRecallChannelSchema` = `heuristic | keyword | semantic | graph`
- 新增 `packages/contracts/src/domain/retrieval-latency.ts`：`RetrievalLatencySample` / `RetrievalLatencySliceSummary`（P50/P95/P99/count），供 eval 报告与聚合脚本共用，`index.ts` 聚合导出。
- 验证：`pnpm --filter @trapmap/contracts test --run <path>`；`pnpm typecheck`。

### T1 — backend-core port

- 新增 `packages/backend-core/src/ports/retrieval-metrics-ports.ts`，定义 `RetrievalMetricsPort`（纯接口、零框架、零 DB，符合 `AGENTS.md` 领域规则落点约束）：
  - `recordSearch({ endpoint, mode, outcome, durationMs })`
  - `recordStage({ endpoint, stage, durationMs })`
  - `recordChannel({ endpoint, channel, durationMs })`
- 由 `packages/backend-core/src/index.ts` 聚合导出。
- 验证：`pnpm --filter @trapmap/backend-core test`。

### T2 — service-knowledge-read 打点接线（语义不变是硬约束）

- `search-knowledge.ts`：`timedStep()` 增加 `metrics?.recordStage(...)` 副作用；结束时 `recordSearch`。
- 通道计时插入点（只加计时，不改并发结构与结果）：
  - `recall/graph-channel.ts:31-45` 三路并发（semantic / keyword / graph）逐路计时；
  - `recall/hybrid-channel.ts:32-45`（DB 分支）与 `:88-97`（内存分支）逐路计时；
  - `recall/semantic-channel.ts` 单通道计时。
- `rag-log.ts` 的 `RagLogEntry` 扩展 `channelSteps`（`AGENTS.md` 要求：内部字段只落日志，不进响应体）。
- `endpoint` 按 §4 透传。
- 验证：`pnpm --filter @trapmap/service-knowledge-read test`；`pnpm --filter @trapmap/evals eval:smoke`（召回语义零变化）。

### T3 — host-local Prometheus 实现

- 新增 `packages/host-local/src/nest/observability/retrieval-metrics.ts`，照 `experience-gene-metrics.ts` 的 `counter`/`histogram` 复用写法（含 `register.getSingleMetric` 幂等处理与 `// lib type gap:` 注释约定）。
- 经 `createHostLocalServices`（`packages/host-local/src/nest/runtime/host-services.ts:95`）注入。
- 验证：`packages/host-local/test/nest/observability/` 下新增单测（对齐 `experience-gene-metrics.test.ts:37` 的断言形态）；`pnpm test:observability-closeout`。

### T4 — host-distributed OTel 实现

- `packages/host-distributed/src/gateway/internal-observability.ts` 增三族同名直方图（照 `:111-115` 的 `createExperienceGeneOtelMetrics` 模式）。
- 经 `createDistributedRetrievalServices`（`packages/host-distributed/src/knowledge-read/converged-retrieval.ts:57`）注入。
- 验证：`packages/host-distributed/test/gateway/` 新增单测；`pnpm test:runtime-foundations`；`pnpm test:distributed-closeout`。

### T5 — `route_family` 扩展

- `packages/contracts/src/domain/observability.ts:66` 的 `observabilityRouteFamilySchema` 增 `'retrieval'`，`:70` 的归一化函数把 `/v1/retrieval`、`/v3/retrieval` 归到新族。
- 影响面必须一次改全：contracts 测试、`prometheus.service.ts:64/79`、`http-metrics.middleware.ts:57/88`、`host-distributed/src/gateway/server.ts` 的标签、`OBSERVABILITY-OPERATIONS.md:167` 的 SLO 查询（原 `route_family="gateway"` 语义会变窄）。
- 验证：`pnpm --filter @trapmap/contracts test`；`pnpm test:observability-closeout`；`pnpm test:runtime-foundations`。

### T6 — RAG log 可查询化（先离线，后接平台）

- T6.1：新增 `scripts/retrieval-latency-report.ts`，读 `logs/rag/*.log`，按 `endpoint × stage` 与 `endpoint × channel` 输出 P50 / P95 / P99 表。离线可跑、可进 CI，是"计算与量化"的最低门槛产物。
- T6.2（后续）：把 `RagLogEntry` 结构化推 Loki。`host-local/src/nest/observability/` 已有 Loki adapter 与 `LOKI_HOST` 边界，接线不改采集开关语义。
- 验证：脚本单测 + `LOG_RAG_ENABLED=true` 本地跑一次出表。

### T7 — eval 侧延迟基线与门禁

- `evals/types/retrieval-live.ts:220` 的 `liveEvalSliceDiffSchema` 增 `p50Baseline/p50Current/p95Baseline/p95Current/latencyVerdict`；`:199` 的 caseDiff 增 `durationMsDiff`。
- `evals/retrieval-live/run.ts`：slice 级聚合 P50/P95（当前只有 per-case 打印，`run.ts:203`）。
- `evals/retrieval-live/compare.ts:90-97`：把延迟计入 verdict。**阈值不拍脑袋**——先跑一次 frozen snapshot 存 `reports/` 作 baseline，用实测噪声带定回归阈值；恒 0 序列（`v2-capsule`）跳过判定。
- 验证：`pnpm --filter @trapmap/evals eval:retrieval:live:smoke`；`evals/retrieval-live/lib/live-eval.test.ts`。

### T8 — 文档与守卫回写

- `docs/architecture/OBSERVABILITY.md`：归属小节增 retrieval metrics 落点；顺带修正 Go 指标名漂移（`:9` 写的 `trapmap_go_*`，实际是 `trapmap_knowledge_read_*`，见 `services/knowledge-read-go/internal/observability/metrics.go:11-25`）。
- `docs/operations/OBSERVABILITY-OPERATIONS.md`：SLO 表增"四路检索 P95"（数值由 T7 实测回填，初版留"待基线"）；告警增 `RetrievalLatencyRegressed`。
- `docs/reference/SYSTEM_TRUTH_SOURCES.md:30`：可观测性真源增 retrieval metrics 落点。
- `docs/architecture/components/RETRIEVAL.md`：增「延迟可观测」节，写明 §2 的退役现实。
- 守卫：`pnpm check:docs`、`pnpm check:structure`、`pnpm check:asserts`（禁止新增 `@ts-expect-error` 与裸 `as never`/`as unknown as` 桥接）、`pnpm exec fallow audit --base main`（跨包导入与 zone 边界）。

## 6. 验收门禁

1. `pnpm typecheck` + `pnpm check:docs` + `pnpm check:structure` + `pnpm check:asserts` 全绿。
2. `pnpm test:observability-closeout` + `pnpm test:runtime-foundations` 全绿。
3. `pnpm --filter @trapmap/evals eval:smoke` 绿，且检索质量指标（hitAt1 / mrr）与基线一致——**语义不变**的硬证据。
4. 能实际产出一张 `endpoint × channel` 与 `endpoint × stage` 的 P95 表（T6.1 脚本或 Grafana 查询任一）。
5. `pnpm test:deployment-smoke` 绿（T5 动了路由族与环境面）。
6. 无新增 `SURFACE_EXEMPTIONS` 条目，无新增断言豁免。

## 7. 风险与已知债务

| 风险 | 处置 |
|---|---|
| 通道计时侵入 `Promise.all` 并发结构，可能改变调度 | 只在每路外层包计时，不改并发组合与结果合并；T2 用 `eval:smoke` 兜底 |
| `endpoint` 透传改了共享 `RetrievalSearchParams` | 可选字段 + 缺省 `'unknown'`，现有调用点零改动 |
| T5 让既有 `route_family="gateway"` SLO 语义变窄 | 同批次改 SLO 文档与告警，不留双解释 |
| 延迟基线受机器与数据量影响，compare 误报 | 阈值由 T7 首次实测噪声带定，不预设；恒 0 序列跳过 |
| `/v2` 与 `heuristic` 恒 0，容易被误读为"性能极好" | 文档显式标注退役状态；告警与 verdict 排除 |
| 阶段计时与 RAG log 双写可能造成口径不一致 | 同一 `timedStep` 数据同时供指标与日志，不引入第二套计时源 |

## 8. 执行记录（2026-09-19）

| 阶段 | 状态 | 落点 |
|---|---|---|
| T0 契约地基 | 完成 | `packages/contracts/src/enum-types/retrieval-latency.ts`、`packages/contracts/src/domain/retrieval-latency.ts`（`summarizeLatency` 是唯一百分位实现） |
| T1 port | 完成 | `packages/backend-core/src/ports/retrieval-metrics-ports.ts` |
| T2 打点接线 | 完成 | `search-knowledge.ts`（`timedStep` + per-request `scopedServices`）、`recall/{hybrid,semantic,graph}-channel.ts` 的 `timedChannel`、`rag-log.ts` 增 `channelSteps` / `metadata.latencyEndpoint`；endpoint 经 `retrievalQuerySchema.latencyEndpoint` 与 `RetrievalSearchParams.latencyEndpoint` 逐次传入 |
| T3 host-local | 完成 | `packages/host-local/src/nest/observability/retrieval-metrics.ts`，经 `host-services.ts` → `host-runtime.ts` 注入 |
| T4 host-distributed | 完成 | `internal-observability.ts:createRetrievalOtelMetrics`，经 `converged-retrieval.ts` 注入 |
| T5+ 四路打通 | 完成 | v3 走 `variant='graph-plan'` → `searchV3`；v2 新实现 `search/capsule-recall.ts` + `capsule-scoring.ts` 并注册 `/v2/retrieval/search`；内部 hop 用 `retrievalInternalSearchBodySchema` 承载内部字段 |
| T5 route_family | 完成 | `observability.ts` 增 `retrieval` 族，`/v1/retrieval` 与 `/v3/retrieval` 不再落进 `gateway` |
| T6 可查询化 | T6.1 完成 / T6.2 未做 | `scripts/retrieval-latency-report.ts`（读 JSONL）；接 Loki 转债务 |
| T7 eval 门禁 | 完成（无 live 基线） | `evals/types/retrieval-latency` 字段 + `compare.ts` 的 `latencyVerdict` 与总体判定；阈值取相对 50%，**live 基线因环境无 PG/docker 未采集** |
| T8 文档 | 完成 | OBSERVABILITY、OBSERVABILITY-OPERATIONS、SYSTEM_TRUTH_SOURCES、RETRIEVAL 四篇 |

实测基线见 `benchmarks/retrieval-latency/`。

**离线 bench（内存语料，无 PG，CPU 下限）** — `bench-1000.json` / `scaling-sweep.txt`：

| 语料 | total P50 | total P95 | semantic P50 |
|---|---|---|---|
| 100 | 5 | 33 | 5 |
| 500 | 41 | 63 | 23 |
| 1000 | 70 | 95 | 64 |
| 2000 | 146 | 167 | 136 |

随语料**线性增长**，因为无连接池时召回走内存分支，逐条算 embedding。

**live bench（真 PG + pgvector + 真 HTTP）** — `live-pg-{200,1000,3000}.json` / `live-report-from-rag-log.json`：

| 语料 | v1-search P50 | v1-skills P50 | v3 P50 | P95 |
|---|---|---|---|---|
| 200 | 5.19 | 5.20 | 4.96 | ~22 |
| 1000 | 5.04 | 5.04 | 4.66 | ~20 |
| 3000 | 5.32 | 4.99 | 4.86 | ~22 |

随语料**基本持平**（200→3000 条 P50 不变），延迟由 HTTP + SQL 往返的固定开销主导，不是语料规模。1000 条时 DB 路径比内存 fallback 快约 14 倍（5ms vs 70ms）。

live 的阶段/通道分解（1000 条，`channel:graph` 缺席是因为默认 mode 为 hybrid，不跑图通道）：recall P50 4ms 占总 4–5ms 的绝大部分，其中 semantic 约 4ms、keyword 约 0.2–0.5ms；parse / snapshot / routing / assembly 均在 0–1ms。

**口径差异**：live bench 走 `scripts/testing/postgres-server-composition.ts`，没有 gateway/Nest 会话守卫层，embedding 用默认哈希实现（无外网调用），所以仍是**下限**；但已包含 PG 与 HTTP。

### 四路打通（2026-09-19 补做）

初版测量暴露 v3 是 v1 的路由别名、v2 无实现，两路都不可解读。本轮把两路补成了真实管道：

- **v3**：`/v3/retrieval/search` 经 `RetrievalSearchParams.variant='graph-plan'` 转发到 `searchV3`，强制 `mode='graph-assisted'`，真实多跑 graph 通道。
- **v2**：新实现 `search/capsule-recall.ts` + `search/capsule-scoring.ts`，走 `skill_artifact_capsules` 胶囊池 + keyword/semantic/heuristic 三通道 + RRF + 阈值门控，返回 `RetrievalV2Response`；两宿主注册 `/v2/retrieval/search`。
- 内部 hop 新增 `retrievalInternalSearchBodySchema` 承载 `variant` / `latencyEndpoint`；公开请求体不含这两个字段，客户端无法选择管道或伪造标签。
- 途中修掉三个真实缺陷：`KnowledgeReadModule.search` 逐字段重建参数导致 `latencyEndpoint` 被静默丢弃；`skill_artifact_capsules` 在迁移后没有 `keyword_tokens` / `team_id`（Drizzle schema 与实际 schema.sql 漂移）；`required_level <= $n` 在 system-admin 上下文下 int4 溢出。

**v3 图计划编译已补齐（2026-09-19 第二轮）**：`backend-core/src/knowledge-read/domain/graph-plan.ts` 实现 Kahn 拓扑编译与置信度门控，`search/search-v3-plan.ts` 重写为图扩张 → 计划编译 → 门控 → `GraphPlanSearchResponse`（plan + 治理 fallback）。请求契约换用 `graphPlanSearchQuerySchema`（seed/skillBudget/maxDepth/fallbackMode），与 `trapmap load` 的真实请求一致；两宿主路由、distributed 内部 hop（`/internal/retrieval/graph-plan/search`）与 eval 组装服务器全部接通。端到端验证：3 组 trap/skill 图文档下 `executionPlan` 产出 trap(rank 0) → skill(rank 1, blockedBy=[trap])，`routingReason=graph-plan-selected`；证据不足时按预期走 `graph-plan-low-confidence` + entry 回退。retrieval eval 通过数 5→7（v2/v3 用例首次真实可达）。

### gene 检索（第五检索面，2026-09-19 核实并接通验证）

gene 检索（`POST /v1/retrieval/genes/search`）不属于 eval 契约的四路切片，是 Experience Gene 计划的独立检索面，路由双宿主注册、`PgExperienceGeneSearchPort` 走 PG 双通道召回（`experience_gene_search_documents` 全文 + `experience_gene_embeddings` pgvector，JOIN `experience_genes` 且 `status='solidified'`），并由专属指标族 `trapmap_experience_gene_search_duration_ms{mode,outcome}` 打延迟。

**关键事实**：它受 `TRAPMAP_EXPERIENCE_GENES_MODE` 门控，默认 **off**——对外路由在 off/shadow 下返回治理空响应，只有 `serve` 才真实召回。生产是否"接通"取决于这个环境变量。

本轮补齐：eval 组装服务器注册 gene 路由（与 distributed 相同的 `registerFastifyRoutes` 路径）；serve 模式下端到端验证通过——播种 solidified gene 后 `/v1/retrieval/genes/search` 命中（score 0.525，reason 含 exact-signal），双通道召回真实工作。

### 五路实测（真 PG + pgvector + 真 HTTP，2026-09-19）

P50 / P95，单位 ms，`live-pg-5way-{200,1000,3000}.json`（gene 池固定 10 条种子，随语料规模不变）：

| 语料 | v1-search | v1-skills | v2-capsule | v3-graph-plan | v4-gene |
|---|---|---|---|---|---|
| 200 | 11.10 / 29.82 | 22.42 / 34.78 | 10.03 / 11.80 | 21.30 / 32.54 | 1.10 / 4.58 |
| 1000 | 41.55 / 50.79 | 87.85 / 97.89 | 50.98 / 52.44 | 80.12 / 87.84 | 1.02 / 1.55 |
| 3000 | 108.79 / 123.81 | 250.12 / 276.84 | 95.75 / 103.08 | 244.87 / 255.69 | 1.24 / 2.10 |

各端点 P50 的 200→3000 增长倍数：v1-search ≈9.8×、v1-skills ≈11×、v2-capsule ≈9.5×、v3-graph-plan ≈11.5×、**v4-gene ≈1.1×（持平）**。gene 与语料规模无关：其索引池（solidified gene）独立于条目语料派生，成本由自身索引规模决定——这也是五路里唯一不随主语料扩展的路径。gene 延迟同时进自己的指标族（`trapmap_experience_gene_search_duration_ms`）与本次 HTTP 口径，两套并存。

P50 / P95，单位 ms，`live-pg-4way-*.json`：

| 语料 | v1-search | v1-skills | v2-capsule | v3-graph-plan |
|---|---|---|---|---|
| 200 | 11.21 / 26.59 | 22.25 / 36.76 | 8.50 / 9.50 | 45.80 / 59.73 |
| 1000 | 40.55 / 46.35 | 89.21 / 102.62 | 42.44 / 44.17 | 206.90 / 286.68 |
| 3000 | 108.63 / 113.66 | 259.32 / 275.60 | 82.66 / 86.19 | 638.58 / 900.20 |

阶段与通道分解（1000 条，`live-4way-report.json`）：

| 端点 | 主导阶段 | 通道 P50 |
|---|---|---|
| v1-search | recall 37ms | semantic 36 / keyword 2 |
| v1-skills | recall 38ms | semantic 37 / keyword 2 |
| v2-capsule | snapshot 15ms + recall 26ms | keyword 26 / semantic 22 / heuristic 4 |
| v3-graph-plan | recall 199ms | **graph 196** / semantic 34 / keyword 2 |

三点结论：

1. **v3 的成本几乎全是 graph 通道**（196ms / 206ms，占 95%）。`graphAssistedRecall` 对每个候选逐条 `await calculateSourceRelationStrength`，是 O(n) 次异步查询。
2. **v2 比 v1 快且扩展更平缓**（8.5→82.7 vs 11.2→108.6），因为胶囊池远小于条目池、且 keyword 通道是单次 SQL 全文检索。
3. 各端点的并行通道之和大于 `recall` 阶段耗时（v2 为 52ms vs 26ms），因为三通道 `Promise.all` 并发——**不要把通道 P50 相加当作阶段耗时**。

守卫与回归：`pnpm typecheck`、`check:docs`、`check:structure`、`check:asserts`、`test:observability-closeout`（79）、`test:runtime-foundations`（182）、`test:deployment-smoke`（453）、`contracts`（955）、`backend-core`（242）、`service-knowledge-read`（123）、`host-local`（260）、`host-distributed`（240）全绿。`pnpm --filter @trapmap/evals eval:smoke` 因环境无 docker/PG 无法执行——**语义不变的证据目前只有包级测试，缺 live eval 佐证**。

## 9. 回写与归档

- 完成后在根 `plan.md`「当前主线」标记收口，本细则转 `docs/todos/README.md` 索引的 Queued，最终按 `AGENTS.md` 归档规则 `git mv` 进 `docs/archived/archived-plans/`，结论写回 §8 涉及的权威页。
- 归档前先跑 `pnpm exec tsx scripts/check-doc-references.ts` 确认引用不断裂。
- 残留项（如 T6.2 接 Loki）进 `docs/todos/open-debt-and-compromises.md`，不另开并行主线。
