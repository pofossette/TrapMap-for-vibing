# Documentation Validation And Observability Platform Design

## Goal

Replace the current text-centric documentation guardrails with source-aware
documentation validation, and establish OpenTelemetry as TrapMap's telemetry
standard with Sentry as an optional error-intelligence integration. The result
must keep documentation, runtime configuration, telemetry signals, and
operator guidance aligned without making external monitoring infrastructure a
repository-owned deployment default.

## Delivery Principle

Long-term maintainability takes priority over minimizing the short-term size of
this change. The mainline may accept additional near-term work when it removes
a duplicate source of truth, prevents a known class of drift, gives a runtime
signal a stable owner, or establishes a tested privacy boundary. It must not
add incidental abstraction, speculative platform infrastructure, or a second
telemetry pipeline merely to make the implementation look more complete.

## Context

The repository currently has `check:docs-drift`, `check:structure`, Markdown
linting, Mermaid validation, and link checking. The first two guards validate
configured phrases and a small set of directory rules, but cannot prove that a
source path documented as authoritative still exists. This allowed references
to the retired `packages/server` package to remain in active documentation.
`check:links` reports failures but is non-blocking in CI.

OpenTelemetry is already present in the local and distributed hosts. The
current implementation provides startup seams, HTTP spans for distributed
services, structured logging, and Prometheus endpoints. Its behavior is not
yet uniform: host-local request metrics are not connected to the request
lifecycle, distributed internal-hop metrics remain process-local snapshots,
and configuration/documentation semantics have drifted. No Sentry SDK is
currently installed.

## Scope

### In Scope

- Replace the current active execution surface with a unified documentation
  validation and observability platform plan.
- Validate active-document links, local source references, and declared truth
  sources in CI.
- Generate or verify machine-readable facts for workspace packages, scripts,
  CI guardrails, environment variables, runtime routes, deployment profiles,
  and telemetry configuration.
- Correct active documentation whose facts still refer to retired server
  sources or inaccurate OTel behavior.
- Standardize OTel configuration, lifecycle, propagation, resource metadata,
  sampling, exporter failure handling, and telemetry shutdown across hosts.
- Record and export real HTTP, internal-hop, asynchronous-runtime, and
  critical-domain signals while preserving low-cardinality metric labels.
- Add an opt-in Sentry Node integration for actionable failures and release
  context, with explicit privacy controls.
- Add unit, integration, security, regression, and documentation evidence for
  every new behavior.

### Out Of Scope

- Making a Collector, Tempo, Loki, Prometheus, Grafana, or Sentry deployment a
  mandatory repository runtime dependency.
- Sending raw request bodies, prompts, knowledge content, credentials,
  session identifiers, cookies, or access keys to any telemetry backend.
- Adding high-cardinality Prometheus labels.
- Introducing vendor SDK dependencies into `backend-core` or domain packages.
- Implementing dashboard-as-code, centralized retention policy, multi-cluster
  routing, service identity, mTLS, or a data warehouse in this mainline.

## Architecture

The design uses three independent layers with explicit ownership.

| Layer | Owner | Responsibility |
|---|---|---|
| Documentation truth | scripts and docs | Verify active docs against paths and extracted repository facts. |
| Telemetry runtime | `host-local` and `host-distributed` | Produce logs, metrics, and traces through OTel and Prometheus adapters. |
| Error intelligence | host composition roots | Optionally report sanitized actionable errors to Sentry. |

`packages/contracts` remains the source for correlation fields, log schemas,
and configuration shapes. `packages/backend-core` exposes only telemetry ports.
Host packages own SDK initialization, exporters, framework integration, and
external service failure behavior.

## Documentation Validation Design

### Guard Levels

1. Structure validation preserves allowed root Markdown files, permitted
   `docs/` directories, package README requirements, and archive placement.
2. Reference validation parses active Markdown links and local code-path
   references. It verifies file existence, heading anchors, and documented
   authority paths. Historical documents are excluded unless they are
   explicitly reactivated by the root plan.
3. Truth validation compares generated repository facts with declared docs.
   It covers scripts, CI commands, configuration keys/defaults, runtime
   endpoint ownership, workspace packages, deployment profiles, and
   observability settings.

The current phrase/regex checks remain only for rules that cannot be derived
from source, such as editorial language constraints or explicit deprecation
warnings. New semantic rules must not be added as prose substrings when a
structured source exists.

### Truth Manifest

A typed manifest is derived from repository-owned sources and used by both
guards and tests. It records:

- root package scripts and CI guardrail commands;
- active workspace packages and host/service ownership;
- declared environment variables, defaults, and disabling semantics;
- health, readiness, liveness, and metrics routes;
- OTel and Sentry configuration; and
- source paths designated by `SYSTEM_TRUTH_SOURCES.md`.

The manifest is a build/test artifact, not a second hand-maintained truth
source. Its extractor validates source inputs and reports a targeted failure
when it cannot derive a required fact.

### CI Policy

All documentation guardrails become blocking after existing failures are
corrected. `check:links` must no longer be followed by `|| true`. New scripts
are individually named so a failure identifies whether it is structural,
reference-based, or source-fact drift. Tests cover positive behavior and a
minimal invalid fixture for every parser or guard rule.

## OTel Design

### Shared Runtime Policy

Both host types use one policy for `OTEL_DISABLED`, endpoint selection,
sampling validation, resource attributes, exporter lifecycle, and graceful
shutdown. Invalid sample rates are rejected or replaced with a documented
safe default accompanied by a structured diagnostic. Exporter startup or
shutdown errors never fail a business request and always emit a safe local
diagnostic.

Every emitted resource has a stable service name, version, runtime
environment, deployment profile, and host/service ownership. `traceparent`,
`requestId`, `operationId`, and `causationId` use existing contract semantics.

### Signals

| Signal | Required coverage | Correlation |
|---|---|---|
| HTTP traces | External request server spans and final status | request ID, trace ID, route family |
| Internal-hop traces | Gateway client plus service server spans | W3C traceparent and operation IDs |
| Metrics | HTTP count/latency/concurrency, internal-hop count/latency, dependency and async failure signals | finite route/service/owner labels only |
| Logs | Completion and error records | request/trace/operation/causation IDs in JSON body |
| Async traces | enqueue, execute, retry, terminal failure, outbox publish/consume | operation and causation IDs |
| Domain spans | retrieval, candidate handling, review, publish, activation, projection refresh | stable operation names and failure classification |

Metrics are recorded from the actual runtime lifecycle. A feature flag disables
metric registration and route exposure consistently; it cannot merely log a
warning while continuing to collect. Distributed internal-hop measurements
must be exported through the registered Prometheus or OTel meter rather than
only retained in a process-local test snapshot.

### Data Boundaries

Prometheus labels remain restricted to finite values such as method, status
class, route family, service, deployment profile, and owner surface. Dynamic
identifiers appear only in structured logs and trace context where permitted.
Raw prompts, knowledge content, request bodies, authorization headers, and
credentials never become attributes, log fields, metric labels, or exception
extras.

## Sentry Design

Sentry is an optional error-intelligence adapter, not a parallel telemetry
platform. It is initialized only in host composition roots and only when an
explicit DSN/configuration enables it. Missing configuration leaves the
runtime fully functional and does not load network reporting behavior.

Sentry receives unhandled exceptions, startup failures, unhandled promise
rejections, framework-level 5xx failures, and terminal asynchronous failures.
Expected validation, authentication, authorization, and normal 4xx outcomes
are breadcrumbs or metrics only unless an explicit security policy says
otherwise.

Each event includes safe tags for service, environment, release, deployment
profile, owner surface, failure classification, request ID, and trace ID.
`beforeSend` removes headers, cookies, request payloads, URLs containing
sensitive query values, prompts, knowledge content, session/access tokens,
and credentials. Tests must prove nested-object and array redaction.

Sentry event rate limiting, sampling, and transport failure behavior are
configured so an outage cannot affect application availability. Sentry
performance tracing, profiling, session replay, source-map uploads, and
release-health adoption are deferred until production deployment and privacy
requirements justify them.

## Operational Model

The first production-ready outcome is a correlation-preserving operator loop:

`alert or Sentry issue -> service/owner -> request or operation ID -> trace -> structured log -> health, queue, outbox, and projection diagnostics`

Runbooks describe this path and each alert identifies an owning surface,
severity, query or issue filter, and recovery action. SLO thresholds are not
hard-coded until at least three comparable real-environment baselines exist.
The initial candidates are readiness availability, 5xx rate, P95 gateway
latency, internal-hop timeout rate, queue/outbox lag, projection freshness,
and unresolved actionable Sentry errors.

## Delivery Stages

1. Plan transition and active-document fact correction.
2. Source-aware documentation guards and blocking CI.
3. Shared OTel bootstrap and configuration semantics.
4. Real HTTP, internal-hop, async, and critical-domain instrumentation.
5. Optional Sentry error-intelligence adapter with privacy enforcement.
6. Closeout: operational docs, regression commands, live verification, and
   future-platform decision gates.

Each stage is independently testable and ends with documented evidence. A
later stage cannot hide a failed earlier guard or telemetry contract.

## Acceptance Criteria

- Active documentation contains no nonexistent authoritative source paths and
  all documentation checks are blocking in CI.
- Scripts, CI commands, route ownership, workspace packages, and telemetry
  configuration are validated from repository facts.
- OTel-disabled mode produces no SDK initialization or exporter network work.
- HTTP and distributed internal-hop metrics come from live request paths and
  are exportable through the configured metrics surface.
- Trace/log/metric correlation works across external requests, internal hops,
  and asynchronous work without high-cardinality labels.
- Sentry is optional, reports actionable errors, retains correlation tags, and
  demonstrably excludes sensitive data.
- Telemetry backend failures do not fail user requests or background jobs.
- Architecture, environment, security, testing, CI, and operator documents
  state only behavior that is implemented and verified.

## Deferred Decision Gates

Create a new active plan only when one or more conditions applies:

- sustained production traffic or multiple teams require Collector batching,
  tail sampling, retry policy, or multi-tenant routing;
- measured storage/cost or compliance requirements require telemetry
  retention, archival, or regional data handling;
- an established on-call process requires dashboard-as-code, burn-rate alerts,
  or formal SLO/error-budget policy;
- released web clients require source-map uploads, release health, profiling,
  or session replay after an explicit privacy review; or
- independently deployed services require service identity, mTLS, or
  telemetry isolation beyond the current deployment trust boundary.
