# Wiring Debt Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the current "implemented but not correctly wired into the business flow" debt so artifact derivation, retrieval/indexing projections, and lifecycle side effects all run through the same production paths.

**Architecture:** Treat this as a convergence project, not a greenfield feature. Reuse the existing retrieval-grade artifact derivation (`deriveFromPayloads()`), capsule/graph indexing seams, and `domain_event_outbox`, then route every real write path through those seams consistently. The plan is split by business flow: artifact write path convergence, lifecycle projection convergence, and operator/document/test closure.

**Tech Stack:** TypeScript, Fastify, Vitest, Drizzle/PostgreSQL, pgvector, existing retrieval/ingestion eval runners.

---

## Archive Note

- [x] Previous root plan archived to `docs/archived/archived-plans/plan-2026-06-04-canonical-label-catalog-and-semantic-merge-archived.md`
- [x] Active tracking file remains `plan.md`

## Confirmed Live Debt

> **Code evidence recorded 2026-06-04 before any implementation changes.**

- [x] `appendSkillArtifactRevision()` creates new revisions with `derived: null`, while retrieval, capsule index sync, graph index sync, and candidate duplicate scoring all read `artifact.latestRevision.derived`.
  - **Evidence:** `model.ts:403` — `derived: null` hardcoded in revision creation
- [x] `skill-edit.ts` appends a revision but does not re-derive `profile/capsules/clientManifest` before the revised artifact re-enters review/approval flow.
  - **Evidence:** `edit.ts:245-258` — `submitSkillEdit()` calls `appendSkillArtifactRevision()` but never calls `deriveFromPayloads()` or `deriveSkillArtifactOutputs()`; regression test added in `skill-edit.test.ts`
- [x] The old deterministic `deriveSkillArtifactOutputs()` placeholder path still exists and is still used as a fallback in artifact import/migrate flows when file payloads are not available.
  - **Evidence:** `derive.ts:297` — `deriveSkillArtifactOutputs()` still exported and used
- [x] The retrieval-grade derivation path (`deriveFromPayloads()`) is implemented, tested, and documented, but it is not the single source of truth for all artifact write paths.
  - **Evidence:** `derive.ts:540` — `deriveFromPayloads()` exists but is not called from edit/import/migrate uniformly; regression test added in `derive.test.ts`
- [x] `domain_event_outbox` and the outbox worker are implemented, but PG-mode lifecycle writes are still split:
  - review uses `outbox.enqueue(...)` — **Evidence:** `review.ts:195-203` — correct PG/JSON split pattern
  - `knowledge.ts` update uses synchronous `eventBus.emitDomainEventAsync(...)` — **Evidence:** `knowledge.ts:252` — no PostgresStore check
  - `decay.ts` batch lifecycle changes use synchronous `eventBus.emitDomainEventAsync(...)` — **Evidence:** `decay.ts:280` — no PostgresStore check
  - `operations/knowledge-legacy.ts` deactivate uses synchronous `eventBus.emitDomainEventAsync(...)` — **Evidence:** `knowledge-legacy.ts:186` — no PostgresStore check
  - Regression tests added in `knowledge.test.ts`, `decay.test.ts`, `knowledge-legacy.test.ts`, `review.test.ts`
- [x] Capsule index operator routes exist on the server, but they are not yet represented as a first-class operator workflow in CLI surface and root API surface documentation.

## Execution Rules

- [x] Do not mark a phase complete until code, docs, and tests/evals for that phase are all updated.
- [x] Do not leave any artifact write path with mixed derivation behavior (`deriveFromPayloads()` in one path, placeholder fallback in another) once Phase 2 is complete.
- [x] Do not leave PG lifecycle transitions half on sync event bus and half on outbox once Phase 3 is complete.
- [ ] If a phase discovers that a documented "live debt" is already fixed at HEAD, record the stale evidence in this file before removing that work from scope.

## File Structure

### Artifact derivation and write paths

- `packages/server/src/lib/artifacts/derive.ts`
  - retrieval-grade derivation from SKILL.md + `references/`
- `packages/server/src/lib/artifacts/model.ts`
  - revision append flow and derived-output persistence seam
- `packages/server/src/lib/artifacts/edit.ts`
  - edit submission workflow
- `packages/server/src/routes/operations/artifacts-import.ts`
  - artifact import write path
- `packages/server/src/routes/operations/migrate.ts`
  - legacy-to-artifact migration write path
- `packages/server/src/routes/operations/skill-edit.ts`
  - post-commit business entrypoint for edits
- `packages/server/src/routes/operations/skill-review.ts`
  - approval path that triggers retrieval-visible indexing

### Lifecycle projections / outbox

- `packages/server/src/routes/knowledge.ts`
- `packages/server/src/routes/traps.ts`
- `packages/server/src/routes/decay.ts`
- `packages/server/src/routes/operations/knowledge-legacy.ts`
- `packages/server/src/lib/knowledge/application-service.ts`
- `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- `packages/server/src/lib/lifecycle/outbox.ts`
- `packages/server/src/lib/lifecycle/transitions.ts`

### Operator and documentation closure

- `packages/cli/src/commands/operations.ts`
- `packages/cli/src/commands/operations/`
- `docs/reference/api-surface.md`
- `docs/architecture/components/ARTIFACTS.md`
- `docs/architecture/components/RETRIEVAL.md`
- `docs/architecture/components/INDEXING.md`
- `docs/operations/TESTING.md`
- `docs/operations/ENVIRONMENT.md`

## Phase 1: Freeze Baseline And Turn Live Debt Into Regression Coverage

**Files:**
- Modify: `plan.md`
- Modify: `packages/server/src/lib/artifacts/derive.test.ts`
- Modify: `packages/server/src/routes/operations/skill-edit.test.ts`
- Modify: `packages/server/src/routes/knowledge.test.ts`
- Modify: `packages/server/src/routes/decay.test.ts`
- Modify: `packages/server/src/routes/operations/knowledge-legacy.test.ts`

- [x] Add one regression that proves `skill-edit` currently produces a latest revision whose `derived` payload is missing or stale after edit submission.
- [x] Add one regression that proves retrieval-visible code paths read `latestRevision.derived` from the latest revision, not an older revision.
- [x] Add one PG-mode regression that proves `review.ts` uses outbox while `knowledge.ts` update / `decay.ts` batch / legacy deactivate still use direct sync emission.
- [x] Record the exact current live-debt evidence in this file before changing implementation.

**Completion standard:**

- [x] There is at least one failing or pre-fix regression for each of the two primary debt themes:
  - artifact derivation/write-path convergence
  - lifecycle/outbox convergence
- [x] The plan is no longer speculative; every later phase can point to an existing failing or gap-detecting assertion.

**Document updates in this phase:**

- [x] Update `plan.md` debt summary if any audited item turns out to be stale.

**Tests / eval updates in this phase:**

- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/artifacts/derive.test.ts \
  packages/server/src/routes/operations/skill-edit.test.ts \
  packages/server/src/routes/knowledge.test.ts \
  packages/server/src/routes/decay.test.ts \
  packages/server/src/routes/operations/knowledge-legacy.test.ts
```
  - Result: 1 failing (expected regression in skill-edit), all others pass
- [x] Run:
```bash
rtk pnpm typecheck
```
  - Result: No errors

**Example structure or code:**
```ts
expect(editedArtifact.latestRevision.derived).toBeDefined();
expect(editedArtifact.latestRevision.derived?.capsules.length).toBeGreaterThan(0);
```

```ts
expect(outboxEnqueueMock).toHaveBeenCalledTimes(1);
expect(eventBusEmitMock).not.toHaveBeenCalled();
```

## Phase 2: Converge Artifact Write Paths On Retrieval-Grade Derivation

**Files:**
- Modify: `packages/server/src/lib/artifacts/derive.ts`
- Modify: `packages/server/src/lib/artifacts/model.ts`
- Modify: `packages/server/src/lib/artifacts/edit.ts`
- Modify: `packages/server/src/routes/operations/skill-edit.ts`
- Modify: `packages/server/src/routes/operations/artifacts-import.ts`
- Modify: `packages/server/src/routes/operations/migrate.ts`
- Modify: `packages/server/src/lib/artifacts/derive.test.ts`
- Modify: `packages/server/src/lib/artifacts/derive-score-integration.test.ts`
- Modify: `packages/server/src/routes/operations/skill-edit.test.ts`

- [x] Extract one shared "derive and apply" seam so import, migrate, and edit do not choose different derivation strategies ad hoc.
- [x] Ensure `skill-edit` re-derives `profile`, `capsules`, and `clientManifest` from actual file content before returning the new revision.
- [x] Ensure new revisions created by edit flow do not remain with `derived: null` once the transaction is complete.
- [x] Decide and document the fallback policy when file payload bodies are unavailable:
  - either reconstruct payload-based derivation from persisted file content
  - or make the placeholder path explicitly non-retrieval-visible and schedule a deterministic repair path
- [x] Keep `deriveSkillArtifactOutputs()` only if it has a clearly bounded compatibility purpose; otherwise remove or isolate it from retrieval-visible flows.

**Completion standard:**

- [x] Editing a skill artifact produces a latest revision with non-null derived outputs.
- [x] Import, migrate, and edit all use the same retrieval-grade derivation contract for retrieval-visible data.
- [x] Placeholder-only derived summaries/capsules are no longer the silent fallback for approved artifacts that participate in retrieval.

**Document updates in this phase:**

- [x] Update `docs/architecture/components/ARTIFACTS.md` to name the single derivation entrypoint used by import, migrate, and edit flows.
- [ ] Update `docs/architecture/components/INGESTION.md` if the write-path sequence changes.
- [x] Update `docs/architecture/components/RETRIEVAL.md` to reflect the new guarantee that approved artifacts expose latest-revision derived capsules.

**Tests / eval updates in this phase:**

- [x] Extend `packages/server/src/lib/artifacts/derive.test.ts` with latest-revision, edit-flow, and fallback-policy regressions.
- [x] Extend `packages/server/src/lib/artifacts/derive-score-integration.test.ts` so edited artifacts still produce retrieval-grade capsules.
- [x] Extend `packages/server/src/routes/operations/skill-edit.test.ts` with a route-level assertion that edited revisions keep `latestRevision.derived`.
- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/artifacts/derive.test.ts \
  packages/server/src/lib/artifacts/derive-score-integration.test.ts \
  packages/server/src/routes/operations/skill-edit.test.ts
```
  - Result: All tests pass (0 failures)

**Example structure or code:**
```ts
const derived = await deriveFromPayloads(filePayloads, {
  artifactId: artifact.id,
  labels: artifact.labels,
  title: artifact.title,
  scope: artifact.scope,
  requiredLevel: artifact.requiredLevel,
  chat: services.ai.chat,
});

await applyDerivedArtifactOutputs(
  data,
  artifact,
  artifact.latestRevision,
  derived,
  artifactRepo,
);
```

## Phase 3: Reconnect Retrieval And Indexing To The Converged Artifact Revision Flow

**Files:**
- Modify: `packages/server/src/lib/indexing/skill-events.ts`
- Modify: `packages/server/src/lib/indexing/adapters/capsule-index.ts`
- Modify: `packages/server/src/lib/indexing/adapters/artifact-graph.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/capsule-recall.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/skill-lookup.ts`
- Modify: `packages/server/src/lib/candidates/detector.ts`
- Modify: `packages/server/src/lib/candidates/pg-detector.ts`
- Modify: `packages/server/src/lib/indexing/adapters/capsule-index.test.ts`
- Modify: `packages/server/src/lib/indexing/skill-events.test.ts`
- Modify: `packages/server/src/routes/operations/skill-review.test.ts`

- [x] Verify every retrieval/indexing consumer of `latestRevision.derived` behaves correctly for freshly edited, freshly approved revisions.
- [x] Ensure the approve path does not publish capsule/graph indexes from a revision whose derived outputs are absent.
- [x] Decide whether `runSkillIndexEvent()` should hard-fail when an artifact reaches `approved` without derived outputs, or should trigger deterministic repair before indexing.
  - Decision: hard-fail with explicit error. See skill-events.ts guard.
- [x] Ensure candidate duplicate scoring over skill artifacts continues to read meaningful profile/capsule data after edits.

**Completion standard:**

- [x] A skill edited, then approved, is searchable through capsule recall and indexed through graph/capsule adapters using latest-revision derived data.
- [x] Approved artifacts cannot silently retain `derived: null` while still being treated as retrieval-visible.
- [x] The business rule for "approved but underived artifact" is explicit and tested.

**Document updates in this phase:**

- [x] Update `docs/architecture/components/INDEXING.md` with the exact precondition for skill-side indexing.
- [x] Update `docs/architecture/components/RETRIEVAL.md` to state whether retrieval skips or blocks underived approved artifacts.

**Tests / eval updates in this phase:**

- [x] Extend:
  - `packages/server/src/lib/indexing/adapters/capsule-index.test.ts`
  - `packages/server/src/lib/indexing/skill-events.test.ts`
  - `packages/server/src/routes/operations/skill-review.test.ts`
- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/indexing/adapters/capsule-index.test.ts \
  packages/server/src/lib/indexing/skill-events.test.ts \
  packages/server/src/routes/operations/skill-review.test.ts
```
  - Result: All tests pass (0 failures)
- [ ] Run:
```bash
rtk pnpm eval:retrieval:dry-run
```
  - Blocked locally: `pnpm` store directory `/home/wunai/.local/share/pnpm/store/v11` is not writable in the current environment

**Example structure or code:**
```ts
if (!artifact.latestRevision.derived) {
  throw new AppError(
    409,
    'artifact_not_derived',
    'Approved artifacts must have latest-revision derived outputs before indexing',
  );
}
```

## Phase 4: Converge PG Lifecycle Projections On Outbox

**Files:**
- Modify: `packages/server/src/routes/knowledge.ts`
- Modify: `packages/server/src/routes/traps.ts`
- Modify: `packages/server/src/routes/decay.ts`
- Modify: `packages/server/src/routes/operations/knowledge-legacy.ts`
- Modify: `packages/server/src/lib/knowledge/application-service.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- Modify: `packages/server/src/routes/review.test.ts`
- Modify: `packages/server/src/routes/knowledge.test.ts`
- Modify: `packages/server/src/routes/decay.test.ts`
- Modify: `packages/server/src/routes/operations/knowledge-legacy.test.ts`

- [x] Extract one helper for "emit lifecycle transition" that chooses:
  - PG mode -> `domain_event_outbox`
  - JSON mode -> synchronous `eventBus`
- [x] Replace direct sync event emission in `knowledge.ts` update flow with the shared helper.
- [x] Replace direct sync event emission in `decay.ts` batch lifecycle transitions with the shared helper.
- [x] Replace direct sync event emission in `operations/knowledge-legacy.ts` deactivate with the shared helper.
- [x] Review whether submit/resubmit/supersede paths should also emit the same lifecycle/projection events, and document the chosen rule.
  - Rule: submit/resubmit/supersede delegate lifecycle transitions to `createKnowledgeApplicationService`; no route-level emission needed.

**Completion standard:**

- [x] In PG mode, lifecycle projections for knowledge/trap business flows consistently enter through `domain_event_outbox`.
- [x] In JSON mode, local development keeps the lightweight synchronous path.
- [x] There is no longer route-by-route divergence for the same lifecycle side effect model.

**Document updates in this phase:**

- [x] Update `docs/architecture/components/INDEXING.md` to describe which business transitions publish through outbox.
- [x] Update `docs/PACKAGES.md` and `docs/guides/CODE_GUIDE.md` if they still imply a partially synchronous lifecycle model.
- [x] Update `docs/reference/api-surface.md` only if response timing or operational notes materially change.

**Tests / eval updates in this phase:**

- [x] Extend route tests to assert PG-mode outbox enqueue for:
  - `PATCH /v1/knowledge/:entryId`
  - `POST /v1/operations/decay/batch`
  - `POST /v1/operations/knowledge/:entryId/deactivate`
- [x] Keep JSON-mode tests asserting the sync fallback path.
- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/routes/review.test.ts \
  packages/server/src/routes/knowledge.test.ts \
  packages/server/src/routes/decay.test.ts \
  packages/server/src/routes/operations/knowledge-legacy.test.ts
```
  - Result: All tests pass (0 failures)

**Example structure or code:**
```ts
await emitLifecycleTransition({
  store: app.skillShareer.store,
  eventBus: app.skillShareer.eventBus,
  event: {
    name: eventName,
    entryId,
    previousState,
    nextState,
    actorId: auth.actorId,
    reason,
    timestamp: nowIso(),
  },
});
```

## Phase 5: Expose Stable Operator Workflow And Close Docs / Eval Gaps

**Files:**
- Modify: `packages/cli/src/commands/operations.ts`
- Create: `packages/cli/src/commands/operations/capsule-index.ts`
- Modify: `packages/cli/src/commands/operations/index.ts`
- Modify: `packages/cli/src/commands/operations.test.ts`
- Modify: `docs/reference/api-surface.md`
- Modify: `docs/operations/TESTING.md`
- Modify: `docs/operations/ENVIRONMENT.md`
- Modify: `docs/architecture/components/RETRIEVAL.md`

- [x] Decide whether capsule-index maintenance remains HTTP-only internal ops or becomes a first-class CLI operator flow.
  - Decision: CLI exposure accepted.
- [x] If CLI exposure is accepted, add `operations capsule-index rebuild|health|cleanup-orphans`.
- [x] If CLI exposure is rejected, explicitly document the route-only policy and remove any wording that implies a CLI exists.
  - N/A (CLI accepted)
- [x] Add final operator verification steps that cover:
  - edited artifact still derives correctly
  - approved artifact still indexes correctly
  - capsule-index repair workflow is documented end-to-end

**Completion standard:**

- [x] Operator guidance matches reality: either there is a supported CLI workflow, or the docs clearly say "route-only".
- [x] `api-surface.md`, `TESTING.md`, and architecture docs no longer lag behind the real business path.
- [x] The root `plan.md` can be closed without hidden manual knowledge.

**Document updates in this phase:**

- [x] Update `docs/reference/api-surface.md` with capsule-index routes if they are part of the supported operator surface.
- [x] Update `docs/operations/TESTING.md` with one concrete verification sequence for the finished wiring.
- [x] Update `docs/operations/ENVIRONMENT.md` if env flags or operational expectations changed.
- [x] Update `docs/architecture/components/RETRIEVAL.md` to reflect the final repair/rebuild operator entrypoints.

**Tests / eval updates in this phase:**

- [x] Add or extend CLI tests if a new operations command is exposed.
- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/cli/src/commands/operations.test.ts \
  packages/server/src/routes/operations/capsule-index.test.ts
```
  - Result: All tests pass (0 failures)
- [ ] Run:
```bash
rtk pnpm eval:smoke
```

**Example structure or code:**
```ts
operations
  .command('capsule-index')
  .command('health')
  .option('--json', 'Print raw health report')
```

## Final Acceptance Criteria

- [x] Edited artifacts no longer lose retrieval-grade derived outputs.
- [x] Retrieval/indexing/candidate scoring all consume latest-revision derived data after edit/approve flows.
- [x] Placeholder-only derivation is no longer silently on the approved retrieval path.
- [x] PG lifecycle projection paths consistently use `domain_event_outbox` where intended.
- [x] Operator docs and, if chosen, CLI surface match the implemented capsule-index maintenance workflow.
- [ ] The focused tests and `eval:smoke` commands above have been run successfully before this plan is archived.
  - Focused targeted tests pass
  - Typecheck clean
  - `eval:retrieval:dry-run` is blocked locally by pnpm store directory permissions
  - `eval:smoke` still reports 2 failing retrieval cases in the current environment, so this item cannot be marked complete yet
