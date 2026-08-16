# Documentation Validation And Observability Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **状态：** active  
> **根入口：** [`../../../plan.md`](../../../plan.md)  
> **设计规格：** 原设计规格已随归档保留在 `docs/superpowers/specs/2026-08-01-documentation-validation-and-observability-platform-design.md`

**Goal:** 建立 source-aware 文档校验、可导出的 OTel 信号、完整接线的 Sentry 异常智能层和可选 Langfuse LLM/eval 观测，使文档、配置、运行时与运维事实可长期一致维护。

**Architecture:** 文档守卫以仓库源码生成或验证事实，active docs 仅引用可解析的权威路径。`host-local` 与 `host-distributed` 负责 OTel、Prometheus 和 Sentry 接线；实际创建 AI provider 的 host composition root 负责运行时 Langfuse SDK，eval platform adapter 负责 Langfuse 的显式 suite 镜像。`contracts` 定义关联/脱敏/config policy，`ai-providers` 仅提供无 vendor SDK 的可观测包装接缝，`backend-core` 与领域/service 包仅消费 ports/provider interface。Sentry 不复制全量 trace/metrics；Langfuse 不参与 eval 判定，也不构成第二条 trace/metrics 管线。

**Tech Stack:** TypeScript, Zod, Vitest, Fastify, NestJS, OpenTelemetry, prom-client, `@sentry/node`, `langfuse`, GitHub Actions, markdownlint.

## 任务背景

当前文档体系已有 phrase/regex drift、目录结构、Markdown、Mermaid 和链接检查，但 active 文档仍可把已退役的 `packages/server` 写成现行权威来源；链接检查也被 CI 的 `|| true` 放行。当前 OTel 已有宿主 bootstrap、distributed HTTP span 和 Prometheus endpoint，但 host-local 请求指标尚未绑定真实请求生命周期，distributed internal-hop 指标仍只保留进程内 snapshot，配置行为与文档并不完全一致。

Sentry 不是待安装的空白能力：`contracts` 已有 shared policy，`host-local` 已注册 module/service，`host-distributed` 已有 adapter，且两侧都有脱敏与 no-op 测试。主线要补的是 composition root 的可达性：local 全局 exception filter、distributed 服务启动/关闭、异步终态失败和本地 sanitized transport evidence。Langfuse 也不是从零开始：eval platform 已在显式 `--platform langfuse` 下镜像 run/case/score/assertion/trace-step，并保留 native TrapMap JSON report 为判定事实；但产品运行时的 `ChatProvider`/`EmbeddingsProvider` 尚无 generation/embedding observation，也没有可复用的配置、脱敏和 OTel correlation policy。

本主线不把外部 observability backend 宣称为仓库默认运行时。它先修复“事实是否真实”和“信号是否真正产生”，再接入异常聚合和运营闭环。

## 全局约束

- **长期维护优先：** 接受短期工作量膨胀，用于消除重复 truth source、重复 telemetry pipeline、无 owner 的 runtime seam 和无自动验证的文档事实；不得以短期省工保留已知漂移出口。
- **避免伪平台化：** 不引入完整 Collector/LGTM/Sentry/Langfuse 部署资产、retention 平台、多集群路由或 dashboard-as-code 作为本主线完成条件。
- **分层归属：** `contracts` 是 correlation/redaction/config schema 的唯一来源；`backend-core`、领域包和 service 包不依赖 OTel/Sentry/Langfuse SDK；SDK 只在 host composition root 或 eval platform adapter 初始化。
- **安全优先：** 不上报 request body、prompt、知识正文、headers、cookies、token、password、session、access key 或原始敏感 query；所有新增出口在测试中证明脱敏。
- **低基数：** Prometheus labels 只能使用有限枚举（method、status class、route family、service、profile、owner surface）；动态 ID 只允许进入受控 trace/log body。
- **可降级：** `OTEL_DISABLED=true`、缺失 `SENTRY_DSN`、`LANGFUSE_ENABLED=false` 或 Langfuse 配置不完整必须 no-op；exporter、Sentry 或 Langfuse backend unavailable 不得让同步请求、异步业务或 eval 退出语义失败。
- **Eval 判定：** native TrapMap JSON report 是唯一 eval truth source；Langfuse 只镜像明确启用的结果，不能改变 suite 通过/失败、重试或退出码，也不复制全量 OTel metrics。
- **阶段门禁：** 每个 task 完成前必须完成对应 RED/GREEN、focused test、typecheck、doc guard 与文档回写；不得以模拟 signal 代替运行时信号。
- **前置风险：** 已归档 compatibility-shell 主线仍保留 Wave-10 package retirement 未完成证据；本计划不得重新引用已退役 `packages/server`，若该遗留项阻塞本计划，单独从 debt register 重开 scoped mainline。

## 工作流与依赖

```text
事实修正/计划切换
  -> 文档 reference + truth guards
  -> 阻断 CI
  -> 共享 OTel policy
  -> HTTP/internal-hop/async/domain signals
  -> Sentry composition/error-boundary closeout
  -> Langfuse runtime provider observation + eval mirror policy
  -> live closeout + SLO decision gates
```

## 文件结构

| 文件 | 责任 |
|---|---|
| `scripts/check-doc-references.ts` | 解析 active 文档的本地链接、anchor 和源码引用。 |
| `scripts/extract-doc-truth.ts` | 从 package/config/route/workspace 源提取 typed truth manifest。 |
| `scripts/check-doc-truth.ts` | 比较 manifest 与 declared truth 文档。 |
| `scripts/__tests__/check-doc-references.test.ts` | reference guard 正/反例。 |
| `scripts/__tests__/extract-doc-truth.test.ts` | manifest extraction 与 malformed-source 回归。 |
| `packages/contracts/src/domain/observability-config.ts` | OTel/Sentry/Langfuse 配置、关联和关闭 policy。 |
| `packages/contracts/src/domain/log-schema.ts` | 跨 exporter 的脱敏字段规则。 |
| `packages/ai-providers/src/observability.ts` | 无 vendor SDK 的 `ChatProvider`/`EmbeddingsProvider` observation wrapping seam。 |
| `packages/host-local/src/nest/observability/` | local OTel、metrics、Sentry 与 framework middleware。 |
| `packages/host-local/src/nest/observability/langfuse.service.ts` | local Langfuse client、privacy filter 和 provider-observation sink。 |
| `packages/host-distributed/src/shared/telemetry.ts` | distributed OTel bootstrap、context propagation 和 shutdown。 |
| `packages/host-distributed/src/shared/observability.ts` | distributed metrics registry/export。 |
| distributed optional Sentry adapter | 未实现（当前仅 host-local 提供 Sentry 适配器）。 |
| `packages/host-distributed/src/shared/` (langfuse 未实现) | distributed runtime Langfuse adapter；仅在该 host 创建 AI provider 时接线。当前未创建该文件。 |
| `evals/lib/platform/langfuse-adapter.ts` | 显式 Langfuse eval mirror，不能作为 eval 判定来源。 |
| `docs/architecture/OBSERVABILITY.md` | 已实现能力、ownership 和非目标。 |
| `docs/operations/ENVIRONMENT.md` | env/default/disabled/privacy semantics。 |
| `docs/operations/OBSERVABILITY-OPERATIONS.md` | alert/runbook/SLO baseline instructions。 |

## 执行任务

### Task 1: Active Mainline Transition And Historical Boundary

**Files:**
- Modify: `plan.md`, `docs/todos/README.md`, `docs/README.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Modify: `docs/todos/open-debt-and-compromises.md`, `docs/archived/README.md`
- Move: docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md to `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md`
- Create: this document

**Consumes:** root-plan one-active-mainline rule and archived compatibility evidence.

**Produces:** this detail is the only active execution surface; the former compatibility plan is historical evidence and its incomplete Wave-10 is a named deferred risk.

- [x] Confirm `plan.md` links only `docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md` and contains the long-term-maintainability principle verbatim.
- [x] Confirm `docs/todos/README.md`, `docs/README.md`, `docs/archived/README.md`, and `SYSTEM_TRUTH_SOURCES.md` describe the new active detail and old detail as archived.
- [x] Add a debt-register entry with source path, impact, re-entry condition, and required verification for compatibility Wave-10; do not mark it completed.
- [x] Run `pnpm check:docs-drift`, `pnpm check:structure`, `pnpm check:md-lint`, and `git diff --check`.
- [x] Commit: `docs: activate documentation and observability mainline`.

### Task 2: Correct Existing Active Documentation Facts

**Files:**
- Modify: `docs/reference/DOCS_TRUTH_MATRIX.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Modify: `docs/architecture/OBSERVABILITY.md`, `docs/operations/ENVIRONMENT.md`, `docs/archived/operations/OBSERVABILITY-VERIFICATION.md`
- Test: focused reference-guard fixtures added in Task 3

**Consumes:** current package layout and host-owned OTel implementation.

**Produces:** active docs point only at existing host/service/contracts sources and distinguish implemented facts from future infrastructure.

- [x] Inventory every active-doc occurrence of `packages/server`, classify it as retired, historical, or still valid, and remove/replace retired claims.
- [x] Replace the Fastify compatibility-shell OTel authority entries with actual host-local/distributed source paths; retain archived references only as historical context.
- [x] Correct local-agent exporter and sampling descriptions so they exactly match implemented behavior after Task 5.
- [x] Write a regression fixture whose source reference does not exist; expected guard result is a precise file/line/path failure.
- [x] Run active-doc checks and `pnpm check:links`; expected result is zero active-document dead links before Task 4 removes CI bypass.
- [x] Commit: `docs: align active observability truth sources`.

### Task 3: Source-Aware Documentation Reference Guard

**Files:**
- Create: `scripts/check-doc-references.ts`, `scripts/__tests__/check-doc-references.test.ts`
- Modify: `package.json`, `scripts/run-ci.ts`, `.github/workflows/ci.yml`
- Modify: `docs/guides/DOCUMENTATION_GOVERNANCE.md`, `docs/operations/CI_CD.md`, `docs/operations/TESTING.md`

**Consumes:** active root plan, docs directory policy, Markdown documents.

**Produces:** `pnpm check:doc-references` checks local Markdown targets/anchors plus backticked repository paths in active docs.

- [x] Write failing tests for valid relative link, missing file, missing anchor, valid code path, retired/missing code path, archived-document exemption, and active-plan inclusion.
- [x] Implement a deterministic parser that scans active surfaces only: `README.md`, `AGENTS.md`, `plan.md`, `docs/{architecture,guides,operations,reference,todos}/**`; exclude `docs/archived/**`, `docs/plans/**`, and `docs/superpowers/**` unless root plan explicitly reactivates them.
- [x] Report failures as `file:line`, reference kind, and resolved path/anchor; reject path traversal outside the repository root.
- [x] Add `check:doc-references` to package scripts, local CI runner, GitHub `doc-guardrails`, documentation governance, CI docs, and testing matrix.
- [x] Run `pnpm test:file -- scripts/__tests__/check-doc-references.test.ts`, `pnpm check:doc-references`, and `pnpm typecheck`.
- [x] Commit: `feat(docs): validate active document references`.

### Task 4: Typed Documentation Truth Manifest And Blocking CI

**Files:**
- Create: `scripts/extract-doc-truth.ts`, `scripts/check-doc-truth.ts`, `scripts/__tests__/extract-doc-truth.test.ts`, `scripts/__tests__/check-doc-truth.test.ts`
- Modify: `package.json`, `scripts/run-ci.ts`, `.github/workflows/ci.yml`, `scripts/complexity-budgets.json`
- Modify: `docs/reference/DOCS_TRUTH_MATRIX.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`, `docs/operations/CI_CD.md`, `docs/operations/TESTING.md`

**Consumes:** workspace manifests, package scripts, CI workflow, host config schema, route declarations, and active truth documentation.

**Produces:** `pnpm check:docs-truth` validates generated facts and all documentation guards are blocking.

- [x] Define Zod schemas for `scripts`, `workspacePackages`, `ciGuardrails`, `environment`, `runtimeRoutes`, `deploymentProfiles`, and `telemetry`; reject unknown/duplicate facts.
- [x] Write RED tests that use minimal fixtures with a missing script, stale package path, changed env default, missing health route, and a non-blocking CI guard.
- [x] Extract facts from structured sources first (`package.json`, workspace manifests, config schemas); keep AST/text extraction narrowly scoped and tested for routes that lack a structured registry.
- [x] Make the checker compare declared authority/source paths and documented environment/config values against the generated manifest, printing field-level drift.
- [x] Repair current `check:docs-drift` configuration so it contains only editorial/non-derivable assertions; move structured assertions into the truth checker.
- [x] Remove `|| true` from `check:links` only after Task 2 yields a clean result; CI must run doc references, docs truth, and links as independent blocking steps.
- [x] Run all four doc guards, focused tests, `pnpm typecheck`, and `git diff --check`.
- [x] Commit: `feat(docs): enforce repository truth in CI`.

### Task 5: Shared OTel Configuration And Lifecycle Policy

**Files:**
- Create: host-owned shared OTel policy module at the smallest existing host/shared location that does not cross architecture zones
- Modify: `packages/contracts/src/domain/observability-config.ts`, `packages/contracts/src/domain/observability-config.test.ts`
- Modify: `packages/host-local/src/nest/observability/otel.service.ts`, `packages/host-local/src/nest/observability/otel.service.test.ts`
- Modify: `packages/host-distributed/src/shared/telemetry.ts`, `packages/host-distributed/src/shared/observability.test.ts`
- Modify: `docs/architecture/OBSERVABILITY.md`, `docs/operations/ENVIRONMENT.md`

**Consumes:** existing `OTEL_DISABLED`, endpoint, profile, and correlation contracts.

**Produces:** identical validated OTel disable/sample/resource/exporter/shutdown semantics in both hosts.

- [x] Write failing tests for disabled mode, valid sample rates `0`, `0.1`, `1`, invalid sample rates, absent endpoint, exporter startup failure, and shutdown failure.
- [x] Define a typed configuration result with `enabled`, `sampleRate`, `endpoint`, `serviceName`, `serviceVersion`, `environment`, `deploymentProfile`, and a safe diagnostic reason.
- [x] Implement dynamic SDK loading only after configuration validates; disabled mode must not load exporters or schedule export work.
- [x] Give both hosts consistent resource attributes and bounded shutdown; log safe structured diagnostics instead of silently swallowing bootstrap errors.
- [x] Either install/configure a real local console exporter or document local-agent as no-exporter; do not keep contradictory comments.
- [x] Run focused host-local/distributed tests, `pnpm typecheck`, and `pnpm test:observability-closeout`.
- [x] Commit: `feat(otel): unify host telemetry lifecycle`.

### Task 6: Live HTTP Metrics And Trace Context

**Files:**
- Modify: `packages/host-local/src/nest/observability/prometheus.service.ts`, `prometheus.service.test.ts`
- Create/Modify: host-local request observability middleware/interceptor and its test
- Modify: `packages/host-local/src/nest/health/health.controller.ts`, `packages/host-local/src/nest/app.module.ts`
- Modify: `packages/host-distributed/src/shared/telemetry.ts`, `packages/host-distributed/src/shared/observability.test.ts`

**Consumes:** route-family normalizer, request-context service, Prometheus registry, OTel tracer.

**Produces:** live HTTP request count, duration, active connection, final status class, server spans, and trace context propagation.

- [x] Write RED integration tests that issue successful, validation-failure, and 5xx requests and assert exact counter/histogram labels plus span error status.
- [x] Make `TRAPMAP_METRICS_ENABLED=false` prevent metric registration and `/metrics` exposure, and make enabled mode expose only registered real signals.
- [x] Record duration after the response finalizes using the actual status code, not a hard-coded `2xx`; normalize every path to the shared finite route family.
- [x] Bind the request span to async context so child application spans inherit the server span; end spans exactly once on response/error.
- [x] Ensure logs, spans, and metrics share route/service/owner fields without adding dynamic IDs to metric labels.
- [x] Run focused tests, `pnpm test:observability-closeout`, `pnpm typecheck`, and a local `/metrics` smoke.
- [x] Commit: `feat(otel): instrument live HTTP requests`.

### Task 7: Export Distributed Internal-Hop And Async Signals

**Files:**
- Modify: `packages/host-distributed/src/gateway/internal-observability.ts`, `internal-client.ts`, and tests
- Modify: `packages/host-distributed/src/shared/observability.ts`, `shared/observability.test.ts`
- Modify: job/outbox owner modules and focused tests identified by their existing queue/outbox contracts
- Modify: `packages/contracts/src/domain/observability.ts`, related tests, and `docs/architecture/components/ASYNC_MODEL.md`

**Consumes:** internal client timing/error data and durable correlation contract.

**Produces:** exportable internal-hop and async lifecycle metrics/traces with stable owner/failure semantics.

- [x] Write RED tests proving an internal HTTP/RPC call increments exportable counter and histogram samples, including 2xx, 503, and 504 paths.
- [x] Replace the process-local-only map with a registered Prometheus/OTel meter adapter while retaining a test-safe snapshot API only when it reads the same registry.
- [x] Add spans/events or metrics for enqueue, execution start, retry, terminal failure, dead letter, outbox publish, and outbox consume; use existing operation/causation IDs.
- [x] Emit finite labels: source service, target service, transport, status class, owner surface, and failure classification. Do not label entity/job IDs.
- [x] Verify a gateway request through an internal hop has one continuous trace and one observable metric increment.
- [x] Run `pnpm test:distributed-closeout`, affected package tests, `pnpm typecheck`, and `pnpm eval:smoke`.
- [x] Commit: `feat(otel): export internal and async runtime signals`.

### Task 8: Critical Domain Instrumentation And Safe Logging

**Files:**
- Modify: existing retrieval, candidate-ingestion, governance-review, knowledge-write, projection, and job-runtime owner entrypoints
- Modify: `packages/backend-core/src/observability/index.ts` and tests only if a missing generic port operation blocks owner instrumentation
- Modify: `packages/contracts/src/domain/log-schema.ts`, `log-schema.test.ts`
- Modify: `docs/architecture/OBSERVABILITY.md`, `docs/operations/OBSERVABILITY-OPERATIONS.md`

**Consumes:** Task 5 context propagation, Task 7 async signal adapter, logging schema.

**Produces:** consistent domain operation spans/logs/metrics for retrieval, candidate processing, review, publish, activation, and projection refresh.

- [x] For each owner, write a RED test that asserts operation name, allowed attributes, error classification, and correlation propagation on success and terminal failure.
- [x] Instrument only stable semantic operations; avoid high-frequency inner-loop spans and raw user/domain content attributes.
- [x] Extend redaction tests to nested objects and arrays for authorization, token, password, secret, cookie, session, prompt, and content-like fields defined by the approved policy.
- [x] Ensure expected validation/auth/policy outcomes are represented as normal outcomes or bounded metrics, not Sentry-worthy system errors.
- [x] Run affected package tests, `pnpm eval:smoke`, `pnpm test:observability-closeout`, and `pnpm typecheck`.
- [x] Commit: `feat(otel): add owner-level operational signals`.

### Task 9: Sentry Composition And Error-Intelligence Closeout

**Files:**
- Modify: `packages/contracts/src/domain/observability-config.ts`, `packages/contracts/src/domain/observability-config.test.ts`
- Modify: `packages/host-local/src/nest/observability/sentry.service.ts`, `sentry.service.test.ts`, `sentry.module.ts`
- Modify: `packages/host-local/src/nest/runtime/exception.filter.ts`, its test, and local async terminal-failure owners
- Create: distributed shared optional Sentry adapter（当前不存在）、其测试、各 distributed service startup/shutdown composition root 与 async terminal-failure owners
- Modify: `packages/contracts/src/domain/log-schema.ts` and its test only where newly reachable event shapes require redaction coverage
- Modify: `docs/operations/ENVIRONMENT.md`, `docs/operations/SECURITY.md`, `docs/architecture/OBSERVABILITY.md`

**Consumes:** existing Sentry policy/adapter tests, correlation/redaction policy, host composition roots, global exception boundaries, and async terminal-failure ownership.

**Produces:** existing opt-in `@sentry/node` adapters are reachable from every required host lifecycle/error boundary, with deterministic privacy filtering and no domain dependency on Sentry.

- [x] Preserve existing RED coverage for absent DSN no-op, enabled initialization, `beforeSend` recursive redaction, safe tags/extras, and suppression of expected 4xx/auth/validation outcomes; add RED integration tests proving the local global exception filter invokes `SentryService` only for actionable 5xx/unhandled errors.
- [x] Add RED lifecycle tests for every distributed executable composition root: it calls `initDistributedSentry(serviceName)` before serving traffic, calls `closeDistributedSentry()` on bounded shutdown, and never fails startup/shutdown when configuration or transport fails.
- [x] Add RED tests for startup failure, unhandled rejection, framework 5xx, and terminal async/job/outbox failure; assert they reach the existing adapter with service, environment, release, deployment profile, owner surface, failure classification, request ID, trace ID, and operation ID only.
- [x] Keep `validateSentryPolicy` as the sole Sentry configuration policy (`enabled`, `dsn`, `environment`, `release`, `sampleRate`, `maxBreadcrumbs`, `sendDefaultPii=false`); do not add a second config parser in hosts.
- [x] Ensure the existing `beforeSend` strips headers, cookies, request data, sensitive query parameters, prompt/knowledge content, credentials and nested secrets; extend tests only where a newly reachable boundary changes event shape.
- [x] Add an opt-in local transport harness that asserts the emitted event is sanitized. Capture/transport failure must create a safe local diagnostic but cannot alter original request or job completion.
- [x] Run focused Sentry and error-boundary tests, redaction tests, `pnpm typecheck`, `pnpm test:observability-closeout`, affected host integration tests, and `pnpm test:distributed-closeout` when distributed composition roots change.
- [x] Commit: `feat(sentry): close host lifecycle and error-boundary reporting`.

### Task 10: Langfuse Runtime LLM And Eval Observation

**Files:**
- Modify: `packages/contracts/src/domain/observability-config.ts`, related contract tests, and `packages/contracts/src/index.ts` only if new exported policy types require aggregation
- Create: `packages/ai-providers/src/observability.ts`, `observability.test.ts`; modify `types.ts`, `providers.ts`, and `index.ts` only for a vendor-neutral wrapping interface
- Modify: `packages/host-local/src/nest/runtime/shared-infra.ts` and add/modify `packages/host-local/src/nest/observability/langfuse.service.ts` with focused tests
- Modify: `packages/host-distributed/src/shared/` (langfuse adapter, if created) and its tests only where a distributed composition root constructs AI providers; do not create a speculative distributed client otherwise
- Modify: `evals/lib/platform/langfuse-adapter.ts`, `langfuse-config.ts`, their tests, and `evals/scripts/__tests__/eval-all.test.ts`
- Modify: `docs/archived/guides/AGENT_EVAL_PLATFORM_INTEGRATION.md`, `docs/architecture/OBSERVABILITY.md`, `docs/operations/ENVIRONMENT.md`, `docs/operations/SECURITY.md`, and `docs/operations/TESTING.md`

**Consumes:** `ChatProvider`/`EmbeddingsProvider`, host-local `createAiProviders(config.ai)` composition seam, existing explicit eval Langfuse mirror, OTel correlation context, and shared redaction policy.

**Produces:** optional Langfuse generation/embedding observation at provider composition boundaries and explicit eval mirrors, correlated to OTel without allowing Langfuse to change business or eval behavior.

- [x] Write RED contract tests for a Langfuse policy with `LANGFUSE_ENABLED=false`, missing `LANGFUSE_BASE_URL`/`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`, valid configuration, bounded flush timeout, and safe diagnostics that never print keys or endpoint credentials.
- [x] Define one typed policy result in `observability-config.ts`: disabled/incomplete configuration returns a no-op sink; enabled configuration supplies only host/eval-owned SDK inputs, bounded flush behavior, service/environment/release metadata, and an explicit privacy mode. Reuse the eval adapter's existing environment names unless a tested compatibility alias is required.
- [x] Write RED provider-wrapper tests: a successful and failed `ChatProvider` call and `EmbeddingsProvider` call emit provider, model, operation/task category, start/end/latency, outcome/error classification, available token counts, and OTel trace/request/operation correlation. Assert raw prompts, outputs, embedding vectors, request bodies, knowledge content, headers, credentials and dynamic IDs never leave the wrapper; use approved redacted metadata, hashes or lengths only.
- [x] Implement the wrapper in `@trapmap/ai-providers` without importing `langfuse`: it must preserve the existing provider interfaces and result/error semantics exactly, invoke an injected best-effort observation sink after completion, and treat sink/flush failure as a safe diagnostic rather than a provider failure.
- [x] Implement the Langfuse SDK sink in the host-local observability boundary, then wrap the providers returned by `createAiProviders(config.ai)` in `shared-infra.ts`. Apply the same pattern to a distributed host only after locating an actual distributed AI-provider composition root; service/domain call sites continue to consume `ChatProvider`/`EmbeddingsProvider` unchanged.
- [x] Extend the existing eval Langfuse adapter tests to prove explicit `--platform langfuse` mirror failure is warning-only, native TrapMap JSON reports remain the sole pass/fail truth source, and mirrored metadata follows the same redaction/correlation policy where those fields are available.
- [x] Add architecture-boundary coverage that rejects `langfuse` imports from `backend-core`, domain and service packages; run `pnpm exec fallow audit --base main` whenever the wrapping/export boundary changes across packages.
- [x] Run contract, ai-provider, host-local, eval-platform and affected distributed tests; run `pnpm eval:smoke`, `pnpm typecheck`, `pnpm test:observability-closeout`, and a no-secret disabled-mode smoke.
- [x] Commit: `feat(langfuse): observe runtime LLM and eval execution safely`.

### Task 11: Operational Verification, CI, And Decision Gates

**Files:**
- Modify: `.github/workflows/ci.yml`, `scripts/run-ci.ts`, `package.json`
- Modify: `docs/archived/operations/OBSERVABILITY-VERIFICATION.md`, `OBSERVABILITY-OPERATIONS.md`, `REGRESSION-COMMANDS.md`, `TESTING.md`, `CI_CD.md`, `SECURITY.md`
- Create: focused observability/Sentry/Langfuse live verification script or extend existing `scripts/observability-benchmark.ts` with no-secret modes
- Modify: this plan with actual closeout evidence

**Consumes:** all prior guards and host signal paths.

**Produces:** repeatable no-secret local verification, blocking CI, operator runbook, and explicitly deferred long-term platform decisions.

- [x] Add a verification flow that proves one request and one internal hop can be correlated through response headers, trace export seam, structured logs, and metrics without requiring a production Sentry DSN or Langfuse project.
- [x] Add an opt-in Sentry transport test harness that receives sanitized events locally; it must assert no raw sensitive payload appears.
- [x] Add an opt-in Langfuse client/test harness that proves a runtime chat call, embedding call and each explicit eval suite mirror have correlation metadata but no raw prompt/output/vector/content; backend/flush failure must be warning-only and native eval JSON must retain its original exit semantics.
- [x] Define baseline collection instructions for readiness availability, 5xx rate, P95 latency, internal-hop timeout, queue/outbox lag, projection freshness, and unresolved actionable error count.
- [x] Record that alert thresholds require at least three comparable environment baselines; do not encode speculative production SLO values as completed policy.
- [x] Run `pnpm check:docs-drift`, `pnpm check:doc-references`, `pnpm check:docs-truth`, `pnpm check:links`, `pnpm check:structure`, `pnpm check:md-lint`, `pnpm check:mermaid`, `pnpm typecheck`, `pnpm test:observability-closeout`, `pnpm test:distributed-closeout`, `pnpm test:deployment-smoke`, and `pnpm eval:smoke`; when a Langfuse project is explicitly configured, also preserve the documented explicit `--platform langfuse` closeout evidence.
- [x] When cross-package imports change, run `pnpm exec fallow audit --base main`; record any baseline limitation rather than weakening the boundary check.
- [x] Commit: `docs: close observability platform verification`.

## Completion Gates

- [x] All active docs pass reference and truth validation; `check:links` is blocking in CI.
- [x] Retired server source claims are absent from active documentation and present only in explicitly historical material.
- [x] OTel disabled/no-exporter behavior, sampling validation, graceful shutdown, and exporter failures are tested.
- [x] HTTP, internal-hop, async, and critical-domain signals originate from live code paths and maintain low-cardinality labels.
- [x] Sentry is optional, fully reachable from required host lifecycle/error boundaries, never imported by `backend-core`/domain packages, and its privacy filter has regression coverage.
- [x] Langfuse is optional, is owned only by host/eval boundaries, observes runtime chat/embedding and explicit eval mirrors through vendor-neutral provider interfaces, preserves native JSON eval truth, and has redaction/correlation/failure-isolation regression coverage.
- [x] A telemetry outage cannot fail product behavior; documented diagnostics identify the owning host/service.
- [x] Operator documentation states implemented facts only and records long-term adoption gates for Collector, retention, dashboards, on-call/SLO policy, source maps, profiling, and service identity.
- [x] This plan is archived only after every completion gate has evidence and all deferred work has an explicit landing location.
