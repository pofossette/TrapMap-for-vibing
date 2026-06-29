# Phase 6 Mature-Capability / Library-Replacement Freeze

## Source requirements

Read these first and treat them as binding requirements:
- `plan.md` Phase 6 / Wave 6A-6F
- `docs/todos/trapmap-architecture-remediation-plan.md`
- `docs/todos/backend-engineering-optimization-plan.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/PACKAGES.md`
- `docs/operations/ENVIRONMENT.md`
- `docs/operations/TESTING.md`
- `docs/architecture/DEPLOYMENT.md`
- `packages/host-local/README.md`
- `packages/host-distributed/README.md`
- `packages/server/src/__tests__/docs-truth-smoke.test.ts`

## Task

Complete Phase 6 as a documentation/truth-source freeze task, not a runtime refactor.

You must:
1. Add a `Phase 6 closure freeze` section to `docs/todos/trapmap-architecture-remediation-plan.md` and close Wave 6A-6F with explicit facts.
2. Update `docs/reference/SYSTEM_TRUTH_SOURCES.md` with a Phase 6 truth-source row and a matching Phase 6 freeze rule entry.
3. Update `docs/PACKAGES.md` with a dedicated `Phase 6 Mature capability freeze` section.
4. Update `docs/operations/ENVIRONMENT.md` with frozen Phase 6 wording for resilience/metrics, graph runtime flags, and current-vs-deferred boundaries.
5. Update `docs/operations/TESTING.md` with a focused Phase 6 minimum verification matrix.
6. Add the new Phase 6 assertions to `packages/server/src/__tests__/docs-truth-smoke.test.ts` and make them pass.
7. Only mark Wave 6A-6F complete if the closure freeze text, truth-source/docs updates, and focused validation results are all in place.

## Required freeze content

The Phase 6 freeze must explicitly state these boundaries:
- `internal client + resilience` is already on the current mainline as a shared runtime seam, but it is not yet a full mature-service platform stack.
- `tracing + metrics` current truth is limited to the existing request/trace headers, runtime metrics snapshots, operator-visible summaries, and documented low-cardinality rules; full distributed tracing / external observability platform remains deferred.
- `rate limiting + bulkhead / backpressure` are not current built-in runtime defaults. They must be described as ordered follow-up capabilities, not as already-landed platform guarantees.
- `cache + invalidation` has current truth and active operator/testing surfaces; it is not a reason to claim service-autonomous cache infrastructure.
- `service discovery`, `DB budget / PgBouncer`, and richer `health indicator` rollout rules must be frozen as adoption conditions / deferred capability gates rather than current-state claims.
- `light` and `heavy` must be described with different default strategy posture where current evidence supports it, without inventing new runtime behavior.
- `graph runtime` config entry must be frozen against current evidence: the same env family exists today, but host-local default mainline, distributed profile, and compatibility shell must not be overstated as perfectly identical if docs/source do not prove that.
- Do not invent stronger implementation claims than current code/tests/docs support.

## Constraints

- Keep edits focused to the files above unless a minimal adjacent doc change is strictly needed.
- Do not introduce runtime behavior changes.
- Respect the Phase 1-5 freeze writing style.
- Shared repo: do not revert unrelated changes.

## Validation

Run focused checks:
- `rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`
- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`

Record exact commands and results in the report.
