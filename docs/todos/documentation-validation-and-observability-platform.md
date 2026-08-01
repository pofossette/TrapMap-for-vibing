# Documentation Validation And Observability Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **状态：** active  
> **根入口：** [`../../plan.md`](../../plan.md)  
> **设计规格：** [`../superpowers/specs/2026-08-01-documentation-validation-and-observability-platform-design.md`](../superpowers/specs/2026-08-01-documentation-validation-and-observability-platform-design.md)

**Goal:** 建立 source-aware 文档校验、可导出的 OTel 信号和可选 Sentry 异常智能层，使文档、配置、运行时与运维事实可长期一致维护。

**Architecture:** 文档守卫以仓库源码生成或验证事实，active docs 仅引用可解析的权威路径。`host-local` 与 `host-distributed` 负责 OTel、Prometheus 和 Sentry SDK 接线；`contracts` 定义关联/脱敏契约，`backend-core` 仅消费 telemetry ports。Sentry 是 opt-in error-intelligence adapter，不复制全量 trace 或 metrics。

**Tech Stack:** TypeScript, Zod, Vitest, Fastify, NestJS, OpenTelemetry, prom-client, `@sentry/node`, GitHub Actions, markdownlint.

## 任务背景

当前文档体系已有 phrase/regex drift、目录结构、Markdown、Mermaid 和链接检查，但 active 文档仍可把已退役的 `packages/server` 写成现行权威来源；链接检查也被 CI 的 `|| true` 放行。当前 OTel 已有宿主 bootstrap、distributed HTTP span 和 Prometheus endpoint，但 host-local 请求指标尚未绑定真实请求生命周期，distributed internal-hop 指标仍只保留进程内 snapshot，配置行为与文档并不完全一致。仓库尚未接入 Sentry。

本主线不把外部 observability backend 宣称为仓库默认运行时。它先修复“事实是否真实”和“信号是否真正产生”，再接入异常聚合和运营闭环。

## 全局约束

- **长期维护优先：** 接受短期工作量膨胀，用于消除重复 truth source、重复 telemetry pipeline、无 owner 的 runtime seam 和无自动验证的文档事实；不得以短期省工保留已知漂移出口。
- **避免伪平台化：** 不引入完整 Collector/LGTM/Sentry 部署资产、retention 平台、多集群路由或 dashboard-as-code 作为本主线完成条件。
- **分层归属：** `contracts` 是 correlation/redaction/config schema 的唯一来源；`backend-core` 不依赖 OTel/Sentry SDK；SDK 只在 host composition root 初始化。
- **安全优先：** 不上报 request body、prompt、知识正文、headers、cookies、token、password、session、access key 或原始敏感 query；所有新增出口在测试中证明脱敏。
- **低基数：** Prometheus labels 只能使用有限枚举（method、status class、route family、service、profile、owner surface）；动态 ID 只允许进入受控 trace/log body。
- **可降级：** `OTEL_DISABLED=true` 与缺失 `SENTRY_DSN` 必须 no-op；exporter/Sentry unavailable 不得让同步请求或异步业务失败。
- **阶段门禁：** 每个 task 完成前必须完成对应 RED/GREEN、focused test、typecheck、doc guard 与文档回写；不得以模拟 signal 代替运行时信号。
- **前置风险：** 已归档 compatibility-shell 主线仍保留 Wave-10 package retirement 未完成证据；本计划不得重新引用已退役 `packages/server`，若该遗留项阻塞本计划，单独从 debt register 重开 scoped mainline。

## 工作流与依赖

```text
事实修正/计划切换
  -> 文档 reference + truth guards
  -> 阻断 CI
  -> 共享 OTel policy
  -> HTTP/internal-hop/async/domain signals
  -> Sentry privacy adapter
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
| `packages/contracts/src/domain/observability-config.ts` | OTel/Sentry 配置 schema 与关闭语义。 |
| `packages/contracts/src/domain/log-schema.ts` | 跨 exporter 的脱敏字段规则。 |
| `packages/host-local/src/nest/observability/` | local OTel、metrics、Sentry 与 framework middleware。 |
| `packages/host-distributed/src/shared/telemetry.ts` | distributed OTel bootstrap、context propagation 和 shutdown。 |
| `packages/host-distributed/src/shared/observability.ts` | distributed metrics registry/export。 |
| `packages/host-distributed/src/shared/sentry.ts` | distributed optional Sentry adapter。 |
| `docs/architecture/OBSERVABILITY.md` | 已实现能力、ownership 和非目标。 |
| `docs/operations/ENVIRONMENT.md` | env/default/disabled/privacy semantics。 |
| `docs/operations/OBSERVABILITY-OPERATIONS.md` | alert/runbook/SLO baseline instructions。 |

## 执行任务

### Task 1: Active Mainline Transition And Historical Boundary

**Files:**
- Modify: `plan.md`, `docs/todos/README.md`, `docs/README.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Modify: `docs/todos/open-debt-and-compromises.md`, `docs/archived/README.md`
- Move: `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md` to `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md`
- Create: this document

**Consumes:** root-plan one-active-mainline rule and archived compatibility evidence.

**Produces:** this detail is the only active execution surface; the former compatibility plan is historical evidence and its incomplete Wave-10 is a named deferred risk.

- [ ] Confirm `plan.md` links only `docs/todos/documentation-validation-and-observability-platform.md` and contains the long-term-maintainability principle verbatim.
- [ ] Confirm `docs/todos/README.md`, `docs/README.md`, `docs/archived/README.md`, and `SYSTEM_TRUTH_SOURCES.md` describe the new active detail and old detail as archived.
- [ ] Add a debt-register entry with source path, impact, re-entry condition, and required verification for compatibility Wave-10; do not mark it completed.
- [ ] Run `rtk pnpm check:docs-drift`, `rtk pnpm check:structure`, `rtk pnpm check:md-lint`, and `rtk git diff --check`.
- [ ] Commit: `docs: activate documentation and observability mainline`.

### Task 2: Correct Existing Active Documentation Facts

**Files:**
- Modify: `docs/reference/DOCS_TRUTH_MATRIX.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Modify: `docs/architecture/OBSERVABILITY.md`, `docs/operations/ENVIRONMENT.md`, `docs/operations/OBSERVABILITY-VERIFICATION.md`
- Test: focused reference-guard fixtures added in Task 3

**Consumes:** current package layout and host-owned OTel implementation.

**Produces:** active docs point only at existing host/service/contracts sources and distinguish implemented facts from future infrastructure.

- [ ] Inventory every active-doc occurrence of `packages/server`, classify it as retired, historical, or still valid, and remove/replace retired claims.
- [ ] Replace the Fastify compatibility-shell OTel authority entries with actual host-local/distributed source paths; retain archived references only as historical context.
- [ ] Correct local-agent exporter and sampling descriptions so they exactly match implemented behavior after Task 5.
- [ ] Write a regression fixture whose source reference does not exist; expected guard result is a precise file/line/path failure.
- [ ] Run active-doc checks and `rtk pnpm check:links`; expected result is zero active-document dead links before Task 4 removes CI bypass.
- [ ] Commit: `docs: align active observability truth sources`.

### Task 3: Source-Aware Documentation Reference Guard

**Files:**
- Create: `scripts/check-doc-references.ts`, `scripts/__tests__/check-doc-references.test.ts`
- Modify: `package.json`, `scripts/run-ci.ts`, `.github/workflows/ci.yml`
- Modify: `docs/guides/DOCUMENTATION_GOVERNANCE.md`, `docs/operations/CI_CD.md`, `docs/operations/TESTING.md`

**Consumes:** active root plan, docs directory policy, Markdown documents.

**Produces:** `pnpm check:doc-references` checks local Markdown targets/anchors plus backticked repository paths in active docs.

- [ ] Write failing tests for valid relative link, missing file, missing anchor, valid code path, retired/missing code path, archived-document exemption, and active-plan inclusion.
- [ ] Implement a deterministic parser that scans active surfaces only: `README.md`, `AGENTS.md`, `plan.md`, `docs/{architecture,guides,operations,reference,todos}/**`; exclude `docs/archived/**`, `docs/plans/**`, and `docs/superpowers/**` unless root plan explicitly reactivates them.
- [ ] Report failures as `file:line`, reference kind, and resolved path/anchor; reject path traversal outside the repository root.
- [ ] Add `check:doc-references` to package scripts, local CI runner, GitHub `doc-guardrails`, documentation governance, CI docs, and testing matrix.
- [ ] Run `rtk pnpm test:file -- scripts/__tests__/check-doc-references.test.ts`, `rtk pnpm check:doc-references`, and `rtk pnpm typecheck`.
- [ ] Commit: `feat(docs): validate active document references`.

### Task 4: Typed Documentation Truth Manifest And Blocking CI

**Files:**
- Create: `scripts/extract-doc-truth.ts`, `scripts/check-doc-truth.ts`, `scripts/__tests__/extract-doc-truth.test.ts`, `scripts/__tests__/check-doc-truth.test.ts`
- Modify: `package.json`, `scripts/run-ci.ts`, `.github/workflows/ci.yml`, `scripts/complexity-budgets.json`
- Modify: `docs/reference/DOCS_TRUTH_MATRIX.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`, `docs/operations/CI_CD.md`, `docs/operations/TESTING.md`

**Consumes:** workspace manifests, package scripts, CI workflow, host config schema, route declarations, and active truth documentation.

**Produces:** `pnpm check:docs-truth` validates generated facts and all documentation guards are blocking.

- [ ] Define Zod schemas for `scripts`, `workspacePackages`, `ciGuardrails`, `environment`, `runtimeRoutes`, `deploymentProfiles`, and `telemetry`; reject unknown/duplicate facts.
- [ ] Write RED tests that use minimal fixtures with a missing script, stale package path, changed env default, missing health route, and a non-blocking CI guard.
- [ ] Extract facts from structured sources first (`package.json`, workspace manifests, config schemas); keep AST/text extraction narrowly scoped and tested for routes that lack a structured registry.
- [ ] Make the checker compare declared authority/source paths and documented environment/config values against the generated manifest, printing field-level drift.
- [ ] Repair current `check:docs-drift` configuration so it contains only editorial/non-derivable assertions; move structured assertions into the truth checker.
- [ ] Remove `|| true` from `check:links` only after Task 2 yields a clean result; CI must run doc references, docs truth, and links as independent blocking steps.
- [ ] Run all four doc guards, focused tests, `rtk pnpm typecheck`, and `rtk git diff --check`.
- [ ] Commit: `feat(docs): enforce repository truth in CI`.

### Task 5: Shared OTel Configuration And Lifecycle Policy

**Files:**
- Create: host-owned shared OTel policy module at the smallest existing host/shared location that does not cross architecture zones
- Modify: `packages/contracts/src/domain/observability-config.ts`, `packages/contracts/src/domain/observability-config.test.ts`
- Modify: `packages/host-local/src/nest/observability/otel.service.ts`, `packages/host-local/src/nest/observability/otel.service.test.ts`
- Modify: `packages/host-distributed/src/shared/telemetry.ts`, `packages/host-distributed/src/shared/observability.test.ts`
- Modify: `docs/architecture/OBSERVABILITY.md`, `docs/operations/ENVIRONMENT.md`

**Consumes:** existing `OTEL_DISABLED`, endpoint, profile, and correlation contracts.

**Produces:** identical validated OTel disable/sample/resource/exporter/shutdown semantics in both hosts.

- [ ] Write failing tests for disabled mode, valid sample rates `0`, `0.1`, `1`, invalid sample rates, absent endpoint, exporter startup failure, and shutdown failure.
- [ ] Define a typed configuration result with `enabled`, `sampleRate`, `endpoint`, `serviceName`, `serviceVersion`, `environment`, `deploymentProfile`, and a safe diagnostic reason.
- [ ] Implement dynamic SDK loading only after configuration validates; disabled mode must not load exporters or schedule export work.
- [ ] Give both hosts consistent resource attributes and bounded shutdown; log safe structured diagnostics instead of silently swallowing bootstrap errors.
- [ ] Either install/configure a real local console exporter or document local-agent as no-exporter; do not keep contradictory comments.
- [ ] Run focused host-local/distributed tests, `rtk pnpm typecheck`, and `rtk pnpm test:observability-closeout`.
- [ ] Commit: `feat(otel): unify host telemetry lifecycle`.

### Task 6: Live HTTP Metrics And Trace Context

**Files:**
- Modify: `packages/host-local/src/nest/observability/prometheus.service.ts`, `prometheus.service.test.ts`
- Create/Modify: host-local request observability middleware/interceptor and its test
- Modify: `packages/host-local/src/nest/health/health.controller.ts`, `packages/host-local/src/nest/app.module.ts`
- Modify: `packages/host-distributed/src/shared/telemetry.ts`, `packages/host-distributed/src/shared/observability.test.ts`

**Consumes:** route-family normalizer, request-context service, Prometheus registry, OTel tracer.

**Produces:** live HTTP request count, duration, active connection, final status class, server spans, and trace context propagation.

- [ ] Write RED integration tests that issue successful, validation-failure, and 5xx requests and assert exact counter/histogram labels plus span error status.
- [ ] Make `TRAPMAP_METRICS_ENABLED=false` prevent metric registration and `/metrics` exposure, and make enabled mode expose only registered real signals.
- [ ] Record duration after the response finalizes using the actual status code, not a hard-coded `2xx`; normalize every path to the shared finite route family.
- [ ] Bind the request span to async context so child application spans inherit the server span; end spans exactly once on response/error.
- [ ] Ensure logs, spans, and metrics share route/service/owner fields without adding dynamic IDs to metric labels.
- [ ] Run focused tests, `rtk pnpm test:observability-closeout`, `rtk pnpm typecheck`, and a local `/metrics` smoke.
- [ ] Commit: `feat(otel): instrument live HTTP requests`.

### Task 7: Export Distributed Internal-Hop And Async Signals

**Files:**
- Modify: `packages/host-distributed/src/gateway/internal-observability.ts`, `internal-client.ts`, and tests
- Modify: `packages/host-distributed/src/shared/observability.ts`, `shared/observability.test.ts`
- Modify: job/outbox owner modules and focused tests identified by their existing queue/outbox contracts
- Modify: `packages/contracts/src/domain/observability.ts`, related tests, and `docs/architecture/components/ASYNC_MODEL.md`

**Consumes:** internal client timing/error data and durable correlation contract.

**Produces:** exportable internal-hop and async lifecycle metrics/traces with stable owner/failure semantics.

- [ ] Write RED tests proving an internal HTTP/RPC call increments exportable counter and histogram samples, including 2xx, 503, and 504 paths.
- [ ] Replace the process-local-only map with a registered Prometheus/OTel meter adapter while retaining a test-safe snapshot API only when it reads the same registry.
- [ ] Add spans/events or metrics for enqueue, execution start, retry, terminal failure, dead letter, outbox publish, and outbox consume; use existing operation/causation IDs.
- [ ] Emit finite labels: source service, target service, transport, status class, owner surface, and failure classification. Do not label entity/job IDs.
- [ ] Verify a gateway request through an internal hop has one continuous trace and one observable metric increment.
- [ ] Run `rtk pnpm test:distributed-closeout`, affected package tests, `rtk pnpm typecheck`, and `rtk pnpm eval:smoke`.
- [ ] Commit: `feat(otel): export internal and async runtime signals`.

### Task 8: Critical Domain Instrumentation And Safe Logging

**Files:**
- Modify: existing retrieval, candidate-ingestion, governance-review, knowledge-write, projection, and job-runtime owner entrypoints
- Modify: `packages/backend-core/src/ports/telemetry-ports.ts` and tests only if a missing generic port operation blocks owner instrumentation
- Modify: `packages/contracts/src/domain/log-schema.ts`, `log-schema.test.ts`
- Modify: `docs/architecture/OBSERVABILITY.md`, `docs/operations/OBSERVABILITY-OPERATIONS.md`

**Consumes:** Task 5 context propagation, Task 7 async signal adapter, logging schema.

**Produces:** consistent domain operation spans/logs/metrics for retrieval, candidate processing, review, publish, activation, and projection refresh.

- [ ] For each owner, write a RED test that asserts operation name, allowed attributes, error classification, and correlation propagation on success and terminal failure.
- [ ] Instrument only stable semantic operations; avoid high-frequency inner-loop spans and raw user/domain content attributes.
- [ ] Extend redaction tests to nested objects and arrays for authorization, token, password, secret, cookie, session, prompt, and content-like fields defined by the approved policy.
- [ ] Ensure expected validation/auth/policy outcomes are represented as normal outcomes or bounded metrics, not Sentry-worthy system errors.
- [ ] Run affected package tests, `rtk pnpm eval:smoke`, `rtk pnpm test:observability-closeout`, and `rtk pnpm typecheck`.
- [ ] Commit: `feat(otel): add owner-level operational signals`.

### Task 9: Optional Sentry Error-Intelligence Adapter

**Files:**
- Modify: `packages/host-local/package.json`, `packages/host-distributed/package.json`, `pnpm-lock.yaml`
- Create: host-local and distributed Sentry adapter/configuration modules with focused tests
- Modify: host composition roots, global error boundaries, and async terminal-failure handlers
- Modify: `packages/contracts/src/domain/observability-config.ts`, `packages/contracts/src/domain/log-schema.ts`
- Modify: `docs/operations/ENVIRONMENT.md`, `docs/operations/SECURITY.md`, `docs/architecture/OBSERVABILITY.md`

**Consumes:** correlation/redaction policy and host-level exception boundaries.

**Produces:** opt-in `@sentry/node` reporting for actionable errors, with deterministic privacy filtering and no domain dependency on Sentry.

- [ ] Write RED tests for absent DSN no-op, enabled DSN initialization, capture of startup/unhandled/5xx/terminal async failures, and suppression of expected 4xx/auth/validation outcomes.
- [ ] Define typed Sentry config: `enabled`, `dsn`, `environment`, `release`, `sampleRate`, `maxBreadcrumbs`, and `sendDefaultPii=false`; validate it at host boundaries.
- [ ] Implement `beforeSend` that strips headers, cookies, request data, sensitive query parameters, prompt/knowledge content, and secrets recursively before transport.
- [ ] Attach only safe tags/extras: service, environment, release, deployment profile, owner surface, failure classification, request ID, trace ID, and operation ID.
- [ ] Ensure capture/transport failure is locally diagnosable but cannot affect the original request or job completion path.
- [ ] Run focused Sentry tests, redaction tests, `rtk pnpm typecheck`, and affected host integration tests.
- [ ] Commit: `feat(sentry): add optional sanitized error reporting`.

### Task 10: Operational Verification, CI, And Decision Gates

**Files:**
- Modify: `.github/workflows/ci.yml`, `scripts/run-ci.ts`, `package.json`
- Modify: `docs/operations/OBSERVABILITY-VERIFICATION.md`, `OBSERVABILITY-OPERATIONS.md`, `REGRESSION-COMMANDS.md`, `TESTING.md`, `CI_CD.md`, `SECURITY.md`
- Create: focused observability/Sentry live verification script or extend existing `scripts/observability-benchmark.ts` with no-secret modes
- Modify: this plan with actual closeout evidence

**Consumes:** all prior guards and host signal paths.

**Produces:** repeatable no-secret local verification, blocking CI, operator runbook, and explicitly deferred long-term platform decisions.

- [ ] Add a verification flow that proves one request and one internal hop can be correlated through response headers, trace export seam, structured logs, and metrics without requiring a production Sentry DSN.
- [ ] Add an opt-in Sentry transport test harness that receives sanitized events locally; it must assert no raw sensitive payload appears.
- [ ] Define baseline collection instructions for readiness availability, 5xx rate, P95 latency, internal-hop timeout, queue/outbox lag, projection freshness, and unresolved actionable error count.
- [ ] Record that alert thresholds require at least three comparable environment baselines; do not encode speculative production SLO values as completed policy.
- [ ] Run `rtk pnpm check:docs-drift`, `rtk pnpm check:doc-references`, `rtk pnpm check:docs-truth`, `rtk pnpm check:links`, `rtk pnpm check:structure`, `rtk pnpm check:md-lint`, `rtk pnpm check:mermaid`, `rtk pnpm typecheck`, `rtk pnpm test:observability-closeout`, `rtk pnpm test:distributed-closeout`, `rtk pnpm test:deployment-smoke`, and `rtk pnpm eval:smoke`.
- [ ] When cross-package imports change, run `rtk pnpm exec fallow audit --base main`; record any baseline limitation rather than weakening the boundary check.
- [ ] Commit: `docs: close observability platform verification`.

## Completion Gates

- [ ] All active docs pass reference and truth validation; `check:links` is blocking in CI.
- [ ] Retired server source claims are absent from active documentation and present only in explicitly historical material.
- [ ] OTel disabled/no-exporter behavior, sampling validation, graceful shutdown, and exporter failures are tested.
- [ ] HTTP, internal-hop, async, and critical-domain signals originate from live code paths and maintain low-cardinality labels.
- [ ] Sentry is optional, never imported by `backend-core`/domain packages, and its privacy filter has regression coverage.
- [ ] A telemetry outage cannot fail product behavior; documented diagnostics identify the owning host/service.
- [ ] Operator documentation states implemented facts only and records long-term adoption gates for Collector, retention, dashboards, on-call/SLO policy, source maps, profiling, and service identity.
- [ ] This plan is archived only after every completion gate has evidence and all deferred work has an explicit landing location.
