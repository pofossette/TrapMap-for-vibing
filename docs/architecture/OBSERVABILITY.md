# 可观测性架构

> 本文档只讲架构侧归属与接缝。操作侧（面板、告警值班）见 operations 下对应文档。可观测术语、契约与环境变量以源码、contracts 以及 [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md) 为准。状态：Active。

## 归属

- `packages/host-local/src/nest/observability/` 持有 light 宿主的 `/metrics`、OTel bootstrap 与 shutdown、Prometheus、Loki 与对应 adapter（含 `otel.service.ts`、`prometheus.service.ts`、`sentry.service.ts`、`langfuse.service.ts`、`langfuse-sink.ts`、`http-metrics.middleware.ts`）。
- `packages/host-distributed/src/shared/telemetry.ts` 负责 distributed 内部 hop 的 traceparent / span 传播与 OTLP traces / metrics 导出。
- `services/knowledge-read-go/internal/api/router.go:21` 暴露 Go 侧 `GET /metrics`（Prometheus 文本，`trapmap_go_requests_total` / `trapmap_go_fallback_total` / `trapmap_go_duration_ms`）。

## Sentry

Sentry 只聚合 actionable errors，不做第二条 traces / metrics 管线。初始化在 `packages/host-local/src/nest/observability/sentry.service.ts`（Nest 模块）；`SENTRY_DSN` 为空时 no-op。`backend-core` 与领域包不直接依赖 `@sentry/node`，SDK 只在 host 组合根动态导入。distributed 宿主的函数式适配器未实现（2026-09-08）。

## Langfuse

Langfuse 只做 LLM / embedding 生成运行时观测。初始化在 `packages/host-local/src/nest/observability/langfuse-sink.ts`（组合边界 sink）与 `langfuse.service.ts`（Nest 模块）；凭证缺失时 no-op。`packages/ai-providers/src/observability.ts` 为 vendor-neutral wrapper，只接收注入的 `LlmObservationSink`，不依赖 `langfuse` SDK；SDK 只在 host-local 可观测边界内动态导入。eval 侧 mirror 经 `--platform langfuse` 在 aggregate runner 中启用。

## 打点接缝

HTTP / DB / queue / internal-hop 四条 seam 在 `host-local` 与 `host-distributed` 中统一打点。命名与失败分类以 `packages/contracts/src/domain/observability.ts` 为准。`workflowRunId` 表 async / durable 语义，不等同于对客 `asyncJobId`。
