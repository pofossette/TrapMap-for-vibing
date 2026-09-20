# 可观测性架构

> 本文档只讲架构侧归属与接缝。操作侧（面板、告警值班）见 operations 下对应文档。可观测术语、契约与环境变量以源码、contracts 以及 [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md) 为准。状态：Active。

## 归属

- `packages/host-local/src/nest/observability/` 持有 light 宿主的 `/metrics`、OTel bootstrap 与 shutdown、Prometheus、Loki 与对应 adapter（含 `otel.service.ts`、`prometheus.service.ts`、`sentry.service.ts`、`langfuse.service.ts`、`langfuse-sink.ts`、`http-metrics.middleware.ts`、`retrieval-metrics.ts`）。
- 检索延迟：port 在 `packages/backend-core/src/ports/retrieval-metrics-ports.ts`（`RetrievalMetricsPort`），host-local 的 Prometheus 实现在 `packages/host-local/src/nest/observability/retrieval-metrics.ts`，host-distributed 的 OTel 实现在 `packages/host-distributed/src/gateway/internal-observability.ts:createRetrievalOtelMetrics`；打点在 `packages/service-knowledge-read/src/search-knowledge.ts:timedStep` 与 `src/recall/*-channel.ts` 的 `timedChannel`。
- 检索降级：同一 port 的 `recordDegraded({ endpoint, reason })`，落 `trapmap_retrieval_degraded_total{endpoint,reason}`。`reason` 取自契约枚举 `RETRIEVAL_DEGRADED_REASONS`（`packages/contracts/src/enum-types/retrieval-latency.ts`）：`db-search-failed`（hybrid 的 DB 召回降级到内存路径）、`db-vector-search-failed`（semantic 同理）、`rerank-fallback`（Go 排序加速器降级为本地排序）。这三条路径**都会正常返回结果**，计数器是它们唯一的外部信号——没有它，一条彻底坏掉的 DB 分支与"很快的健康路径"在面板上完全一样（检索延迟事故的教训）。打点收口在 `packages/service-knowledge-read/src/retrieval-latency.ts:emitDegraded`，与 `emitStage` / `timedChannel` 同源。
- `packages/host-distributed/src/shared/telemetry.ts` 负责 distributed 内部 hop 的 traceparent / span 传播与 OTLP traces / metrics 导出。
- `services/knowledge-read-go/internal/api/router.go:21` 暴露 Go 侧 `GET /metrics`（Prometheus 文本，实际序列名为 `trapmap_knowledge_read_requests_total` / `trapmap_knowledge_read_fallback_total` / `trapmap_knowledge_read_duration_ms`，见 `services/knowledge-read-go/internal/observability/metrics.go:11-25`）。

## Sentry

Sentry 只聚合 actionable errors，不做第二条 traces / metrics 管线。初始化在 `packages/host-local/src/nest/observability/sentry.service.ts`（Nest 模块）；`SENTRY_DSN` 为空时 no-op。`backend-core` 与领域包不直接依赖 `@sentry/node`，SDK 只在 host 组合根动态导入。distributed 宿主的函数式适配器未实现（2026-09-08）。

## Langfuse

Langfuse 只做 LLM / embedding 生成运行时观测。初始化在 `packages/host-local/src/nest/observability/langfuse-sink.ts`（组合边界 sink）与 `langfuse.service.ts`（Nest 模块）；凭证缺失时 no-op。`packages/ai-providers/src/observability.ts` 为 vendor-neutral wrapper，只接收注入的 `LlmObservationSink`，不依赖 `langfuse` SDK；SDK 只在 host-local 可观测边界内动态导入。eval 侧 mirror 经 `--platform langfuse` 在 aggregate runner 中启用。

## 打点接缝

HTTP / DB / queue / internal-hop 四条 seam 在 `host-local` 与 `host-distributed` 中统一打点。命名与失败分类以 `packages/contracts/src/domain/observability.ts` 为准。`workflowRunId` 表 async / durable 语义，不等同于对客 `asyncJobId`。

## 常见用法

### 你读 Go 读服务指标

前置条件：`knowledge-read-go` 运行中。

```bash
curl -s http://localhost:4101/metrics
```

端口见 `docker-compose.yml:582-647` 的 Go 平面范围；网关聚合见 [服务发现架构](SERVICE-DISCOVERY.md)。

### 你跑可观测收口测试

前置条件：依赖已装；离线可跑。

```bash
pnpm test:observability-closeout
```

脚本定义在根 `package.json`。

### 你验证 Sentry 缺省 no-op

前置条件：`SENTRY_DSN` 置空。

```bash
SENTRY_DSN= pnpm run dev -- local-agent
```

初始化在 `packages/host-local/src/nest/observability/sentry.service.ts`。
