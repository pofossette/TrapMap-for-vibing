# Library Replacement Evaluation

> Phase 3 of the TrapMap production hardening plan. Evaluates whether to replace
> current hand-rolled implementations with mature libraries, or defer with
> explicit trigger conditions.

---

## 1. LangChain `.withStructuredOutput()` vs Current Zod Parsing

### Current Approach

The codebase uses a consistent manual parsing pattern across all LLM call sites:

1. Raw LLM response text received via `ChatProvider.invoke(systemPrompt, userMessage)`
2. `stripCodeFences()` removes markdown code fences (`packages/server/src/lib/ai/parse.ts`)
3. `JSON.parse()` parses the cleaned string
4. `zodSchema.safeParse()` validates structure and types

This pattern appears in five modules:

| Module | File | Schema Used |
|---|---|---|
| Graph extraction | `llm-extract-parsing.ts` | `llmGraphExtractionSchema`, `extractionPlanSchema` |
| Label alignment | `llm-align.ts` | `labelAlignmentDecisionSchema` |
| Duplicate judgment | `llm-dedup.ts` | `llmDuplicateJudgmentSchema` (local) |
| Conflict judgment | `llm-conflict.ts` | `llmConflictJudgmentSchema` (local) |

Each module also implements its own retry loop (2-3 attempts with exponential backoff)
around the `invoke -> parse` cycle, independent of `executeWithResilience`.

### What `.withStructuredOutput()` Would Change

LangChain's `ChatOpenAI.withStructuredOutput(zodSchema)` does two things:
- Forces the LLM API to return structured JSON matching the schema (via `response_format`
  or function calling depending on provider)
- Validates the response against the Zod schema automatically

### Evaluation

| Factor | Assessment |
|---|---|
| **Boilerplate reduction** | Minimal. The parsing pattern is already extracted into 15-line functions. The real duplication is the retry loops, not the parsing. |
| **Built-in retry on parse failure** | `.withStructuredOutput()` does NOT retry on parse failure at the LangChain level -- it throws a `ZodError`. Retry logic still needs to be in the caller. |
| **Type safety** | No improvement. Current `safeParse` + early return on failure is already type-safe. |
| **Provider support** | Requires the LLM provider to support structured output natively. The current `ChatProvider` abstraction supports 6+ providers (OpenAI, Anthropic, local, etc.) via a uniform `invoke()` interface. Adding `.withStructuredOutput()` would either require all providers to support it or create a split code path. |
| **Dependency cost** | Adds a hard dependency on `@langchain/openai` for structured output semantics. The codebase already has `@langchain/openai` as a dependency but uses it only for `ChatOpenAI` and `OpenAIEmbeddings` -- the chain/agent framework is not used. |
| **Migration effort** | Medium. All 5 call sites need refactoring. The `ChatProvider` interface needs a new `invokeStructured()` method. `FallbackChat` still needs the manual parse path. |
| **Risk** | The codebase's Zod schemas include `.min()`, `.max()`, `.optional()` refinements that LangChain's structured output path may not fully honor (it converts Zod to JSON Schema, which loses some constraints). |

### Decision: Keep Current Approach

The current parsing is clean, well-tested, and consistent. The boilerplate is small
(~15 lines per call site). The real value of `.withStructuredOutput()` is eliminating
the `stripCodeFences -> JSON.parse -> safeParse` chain, but that chain is already
extracted into reusable helpers.

**The actual duplication to fix** is the per-module retry loops (each module re-implements
`for attempt in 0..maxRetries { invoke -> parse; backoff }`). This is better solved by
adding a retry-on-parse-failure option to the existing `executeWithResilience` or by
creating a small `invokeWithParseRetry` wrapper -- not by pulling in LangChain's
structured output feature.

**Trigger condition for re-evaluation:**
- If the codebase migrates to a single LLM provider (e.g., OpenAI only) AND
  the manual `stripCodeFences -> JSON.parse -> safeParse` pattern breaks more
  than 5% of LLM calls in production logs, re-evaluate `.withStructuredOutput()`.
- If LangChain adds built-in retry-on-parse-failure to `.withStructuredOutput()`,
  the ROI calculation changes.

---

## 2. Resilience Library Evaluation

### Current Approach

`packages/server/src/lib/runtime/resilience.ts` implements `executeWithResilience<T>()`:
- Retry with configurable max attempts and backoff
- Timeout via `setTimeout` wrapping a Promise
- Fail-open (return fallback) or fail-closed (throw) modes
- Custom retryable-error classification
- Integration with `recordRuntimeExecution` / `recordRuntimeRetry` metrics
- Structured logging with requestId, traceId, dependencyName

**Known limitation** (documented in `docs/todos/nestjs-langchain-debt-cleanup.md`):
- `withTimeout` uses `setTimeout` to reject, but does NOT cancel the underlying
  operation via `AbortController`. On retry, the old Promise remains pending,
  which can leak connections or cause double-execution side effects.

**Call sites** (5 locations):
- `llm-extract.ts` -- LLM extraction with resilience
- `processor.ts` -- candidate processing retry schedule
- `bootstrap-repositories.ts` -- vector index creation, capsule index creation,
  health check (3 separate calls)

### Library Options

#### Option A: `cockatiel`

- **Pros:**
  - Pure TypeScript, zero external dependencies
  - Native `AbortSignal` support in retry/timeout
  - Supports retry, timeout, circuit breaker, bulkhead, fallback, hedging
  - API is composable (`Policy.wrap(retry, timeout, circuitBreaker)(fn)`)
  - Already recommended in `nestjs-langchain-debt-cleanup.md` (P0)
- **Cons:**
  - Less popular than `p-retry` (smaller community, fewer Stack Overflow answers)
  - No built-in metrics integration (need to wire `onRetry`, `onTimeout` events)
- **Migration effort:** Low. The `ResiliencePolicy` interface maps cleanly to
  `cockatiel`'s `RetryPolicy` + `TimeoutPolicy` composition.

#### Option B: `p-retry`

- **Pros:**
  - Very popular, well-maintained, minimal API surface
  - Supports AbortSignal natively
  - Good exponential backoff support
- **Cons:**
  - Retry only -- no timeout, no circuit breaker, no fallback composition
  - Would still need a separate timeout library (e.g., `p-timeout`)
  - No built-in circuit breaker; would need `opossum` as a second dependency
- **Migration effort:** Low for retry-only, but incomplete for the full pattern.

#### Option C: `opossum`

- **Pros:**
  - Full circuit breaker implementation
  - Event-based metrics (can wire to existing `recordRuntimeExecution`)
- **Cons:**
  - Heavier than `cockatiel` for the current use case (circuit breaker is not yet needed)
  - Retry is a secondary feature; primary focus is circuit breaking
  - No native AbortSignal support in timeout
- **Migration effort:** Medium. Would need to restructure the resilience pattern
  around circuit breaker semantics, which is premature.

### Decision: Replace with `cockatiel`

The current `executeWithResilience` has a real bug (no `AbortController` cancellation
on retry/timeout) that `cockatiel` solves natively. The migration is low-risk because:

1. `cockatiel`'s API (`RetryPolicy`, `TimeoutPolicy`, `Policy.wrap()`) maps directly
   to the existing `ResiliencePolicy` structure.
2. The `ResilienceResult` return type can be preserved via a thin adapter layer.
3. Metrics integration (`recordRuntimeExecution`, `recordRuntimeRetry`) can be wired
   through `cockatiel`'s `onRetry` and `onGiveUp` callbacks.
4. The 5 call sites all use the same `executeWithResilience` entry point, so the
   migration is concentrated.

**Migration scope:**
- Create `resilience-v2.ts` using `cockatiel` internally
- Keep `ResiliencePolicy`, `ResilienceResult`, `ExecuteWithResilienceOptions` interfaces
  unchanged (adapter pattern)
- Wire `onRetry` -> `recordRuntimeRetry`, `onGiveUp` -> `recordRuntimeExecution`
- Migrate call sites (5 locations)
- Add `AbortController` support to `withTimeout`
- Delete old `resilience.ts`
- Keep existing test cases as integration tests (they define the behavioral contract)

**Timeline:** Should be done as part of the current hardening phase, before production
traffic. The AbortController bug is a real connection leak risk.

---

## 3. Consul KV in the Main Plan

### Current Status

The `DiscoveryPort` interface (`packages/backend-core/src/ports/discovery-ports.ts`)
defines `getKV(key)` and `setKV(key, value)`. The `ConsulService` implementation
(`packages/host-local/src/nest/service-discovery/`) implements these with degraded-mode
fallback (returns undefined / no-ops when Consul is unavailable).

Phase 1B MVP explicitly excluded Consul KV from the service discovery rollout.
The `CachedDiscovery` decorator (`packages/backend-core/src/discovery/cached-discovery.ts`)
delegates `getKV`/`setKV` to upstream without caching.

### Near-Term Use Case Analysis

Consul KV would be useful for:
- **Feature flags / runtime config:** Currently handled by environment variables and
  `contracts/src/domain/observability-config.ts`. No runtime-toggle need identified
  that env vars cannot serve.
- **Shared state between service instances:** Not needed. Each service instance is
  currently stateless or uses Postgres for shared state.
- **Leader election / distributed locks:** Not needed. No leader election patterns exist.
- **Dynamic service configuration:** The `ChatProvider` and `EmbeddingsProvider` are
  configured at startup. No runtime reconfiguration use case exists.

### Decision: Defer to Future Phase

Consul KV has no concrete near-term use case. The port interface exists and is tested,
so adding a use case later requires only calling `getKV`/`setKV` at the relevant
call site -- no infrastructure work needed.

**Trigger condition for inclusion:**
- A concrete requirement for runtime feature flags that cannot be served by env vars
  - service restart (e.g., canary rollouts, kill switches that need sub-minute propagation)
- A distributed coordination need (leader election, distributed locks) that Postgres
  advisory locks cannot serve
- Dynamic configuration that changes more frequently than deploy cycles

**Risk of deferring:** None. The interface is already defined and tested. The Consul
implementation already handles degraded mode gracefully.

---

## Summary

| Component | Decision | Rationale |
|---|---|---|
| LangChain `.withStructuredOutput()` | **Keep current approach** | Parsing is clean and minimal; real duplication is retry loops, not parsing. Fix retry duplication with a shared wrapper instead. |
| Resilience library | **Replace with `cockatiel`** | Current implementation has a real AbortController bug (connection leak on retry). `cockatiel` solves this natively with a compatible API. |
| Consul KV | **Defer** | No concrete use case identified. Port interface exists and is tested; adding a use case later requires zero infrastructure work. |

---

## References

- Current resilience implementation: `packages/server/src/lib/runtime/resilience.ts`
- Current LLM parsing helpers: `packages/server/src/lib/ai/parse.ts`, `packages/server/src/lib/indexing/graph-lite/llm-extract-parsing.ts`
- LLM call sites: `llm-dedup.ts`, `llm-conflict.ts`, `llm-align.ts`, `llm-extract.ts`
- Existing debt analysis: `docs/todos/nestjs-langchain-debt-cleanup.md`
- Consul KV interface: `packages/backend-core/src/ports/discovery-ports.ts`
