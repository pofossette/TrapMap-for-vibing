# Feedback Escalation And Remediation Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the existing feedback storage, admin processing flow, manual review/edit channels, and index rebuild paths to add a threshold-based feedback escalation loop that temporarily suppresses trap/skill retrieval visibility, sends items into a human remediation queue with source content plus feedback context, and restores normal ranking/index state after confirmed fixes.

**Architecture:** Treat this as an additive governance workflow layered on top of the existing `feedback`, `knowledge review`, `skill review/edit`, `decay`, and lifecycle-driven indexing systems. Do not invent a second review universe: reuse the current feedback admin lane for threshold detection and queue operations, reuse the current trap/skill human edit-confirm flows for content correction, and reuse the existing lifecycle/index sync seams for suppress/remove/rebuild instead of bespoke direct index mutations from route handlers.

**Tech Stack:** TypeScript, Fastify, Zod contracts, Vitest, PostgreSQL/Drizzle, existing repository layer, existing lifecycle/indexing subscribers, existing retrieval rerank logic, existing `eval:smoke` pipeline.

---

## Archive Note

- [x] Previous root plan archived to `docs/archived/archived-plans/plan-2026-06-09-runtime-foundations-archived.md`
- [x] Active tracking file remains `plan.md`

## Scope

- [x] Threshold-based feedback escalation for both trap and skill entries
- [x] Reuse of existing feedback admin queue instead of introducing a parallel moderation surface
- [x] Reuse of existing trap review and skill edit/review paths for human remediation
- [ ] Reuse of existing index removal/rebuild mechanisms wherever possible
- [x] Explicit suppression state so feedback-driven hide/show is not overloaded onto `decayMeta`
- [x] Recovery flow that clears active feedback penalty after confirmed human fix
- [ ] Docs, tests, and eval coverage for the full feedback -> remediation -> reindex loop

## Non-Goals

- [ ] Do not redesign the entire review system into a single new aggregate if the existing trap/skill review lanes can be adapted.
- [ ] Do not delete historical feedback records when an issue is fixed; preserve raw history and only clear active suppression/penalty state.
- [ ] Do not build a full new operator UI in this plan; API/CLI/admin route support is sufficient.
- [ ] Do not change retrieval ranking formulas beyond the minimum needed to respect active suppression or active feedback penalty state.

## Confirmed Current Baseline

> **Code and doc evidence recorded 2026-06-09 before implementation changes.**

- [x] Feedback is already a first-class domain with dedicated contracts, route handlers, and repository abstractions.
  - **Evidence:** `packages/contracts/src/domain/feedback.ts`, `packages/server/src/routes/feedback.ts`, `packages/server/src/lib/feedback/repository.ts`
- [x] Feedback already persists for both `trap` and `skill` entries via `entryType: 'trap' | 'skill'`.
  - **Evidence:** `packages/contracts/src/domain/feedback.ts`, `packages/server/src/routes/feedback.ts`
- [x] The existing feedback admin flow can list, triage, resolve, dismiss, and mark transition metadata, but it does not yet create a true remediation work item or suppress retrieval/index visibility.
  - **Evidence:** `packages/server/src/routes/feedback-admin.ts`
- [x] Trap retrieval penalty already exists through `decayMeta.decayState === 'stale'`, but that penalty is knowledge-only and is not a proper feedback suppression state.
  - **Evidence:** `packages/server/src/lib/retrieval/scoring/rerank.ts`, `packages/server/src/routes/feedback-admin.ts`
- [x] Skill retrieval rerank currently has no feedback-aware decay/suppression concept.
  - **Evidence:** `packages/server/src/lib/retrieval/capsules/scoring/rerank.ts`
- [x] Trap indexing already follows a lifecycle-driven event path; index removal is currently tied to lifecycle transitions such as `deactivated`.
  - **Evidence:** `packages/server/src/lib/indexing/events.ts`, `packages/server/src/lib/lifecycle/subscribers/indexing.ts`
- [x] Skill indexing already has a reusable lifecycle/index seam through `runSkillIndexEvent()` and artifact adapter fan-out/removal.
  - **Evidence:** `packages/server/src/lib/indexing/skill-events.ts`, `packages/server/src/routes/operations/skill-review.ts`, `packages/server/src/routes/operations/skill-edit.ts`
- [x] Trap and skill both already have human-governed revision history and review/edit channels suitable for remediation after escalation.
  - **Evidence:** `packages/contracts/src/domain/knowledge.ts`, `packages/server/src/routes/review.ts`, `packages/server/src/routes/operations/skill-edit.ts`, `packages/server/src/routes/operations/skill-review.ts`
- [x] There is already a project TODO calling for a feedback/badcase loop, but it currently stops at queueing and eval conversion, not remediation-driven suppression/reindex.
  - **Evidence:** `docs/todos/badcase-feedback-loop.md`

## Execution Rules

- [ ] Reuse the existing feedback admin route family unless a concrete gap requires a narrowly scoped sub-route.
- [ ] Reuse the existing trap review and skill edit/review flows; do not add a duplicate “manual fix” workflow with overlapping authority.
- [ ] Keep “raw feedback facts”, “active suppression/remediation state”, and “retrieval penalty/index visibility state” logically separate even if they share tables or route surfaces.
- [ ] Any suppression state introduced must work for both trap and skill entries.
- [ ] Any reindex or unsuppress action must be explicit and auditable; do not silently reactivate entries on ordinary feedback resolution.
- [ ] Any new behavior must be testable in both JSON-store fallback mode and PostgreSQL-backed repository mode where practical.
- [ ] Do not mark a phase complete until code, docs, tests, and required eval updates for that phase are all done.

## File Structure

### Feedback domain and admin workflow

- `packages/contracts/src/domain/feedback.ts`
  - existing feedback contracts; extend with escalation/remediation queue request/response shapes only if required
- `packages/server/src/lib/feedback/repository.ts`
  - feedback repository interface; likely needs aggregate/stat/query helpers
- `packages/server/src/lib/feedback/pg-repository.ts`
  - PostgreSQL-backed feedback persistence and query expansion
- `packages/server/src/lib/feedback/lifecycle-triggers.ts`
  - current threshold logic; evolve into reusable threshold evaluation without overloading `decayMeta`
- `packages/server/src/routes/feedback.ts`
  - submission path; may stamp threshold metadata only, should not perform direct index mutation
- `packages/server/src/routes/feedback-admin.ts`
  - primary admin/remediation queue surface; preferred reuse point

### Trap and skill governance/remediation integration

- `packages/contracts/src/domain/knowledge.ts`
  - trap record shape; may need explicit suppression/remediation metadata
- `packages/contracts/src/domain/artifacts.ts`
  - skill artifact shape; may need explicit suppression/remediation metadata
- `packages/server/src/routes/review.ts`
  - trap manual review confirmation flow
- `packages/server/src/routes/operations/skill-edit.ts`
  - skill content correction flow
- `packages/server/src/routes/operations/skill-review.ts`
  - skill approval/re-approval flow after edits

### Retrieval and indexing

- `packages/server/src/lib/retrieval/scoring/rerank.ts`
  - trap retrieval penalty/suppression handling
- `packages/server/src/lib/retrieval/capsules/scoring/rerank.ts`
  - skill retrieval suppression handling
- `packages/server/src/lib/indexing/events.ts`
  - trap lifecycle-driven index upsert/remove behavior
- `packages/server/src/lib/indexing/skill-events.ts`
  - skill lifecycle-driven index upsert/remove behavior
- `packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts`
  - existing rebuild seam to be reused for skill/capsule recovery where needed
- `packages/server/src/routes/operations/capsule-index.ts`
  - existing operator surface for capsule index rebuild/repair

### Tests and docs

- `packages/server/src/routes/feedback.test.ts`
  - feedback submission and admin workflow assertions
- `packages/server/src/routes/retrieval.test.ts`
  - retrieval visibility/ranking behavior after suppression
- `packages/server/src/routes/operations/skill-review.test.ts`
  - remediation/review path for skill
- `packages/server/src/routes/operations/skill-edit.test.ts`
  - remediation/edit path for skill
- `packages/server/src/routes/review.test.ts`
  - remediation/review path for trap
- `packages/server/src/__tests__/skill-lifecycle-flow.test.ts`
  - cross-route lifecycle/index assertions for skill
- `packages/server/src/__tests__/candidate-pipeline.test.ts`
  - only if remediation state affects lifecycle event publication
- `docs/PACKAGES.md`
  - update package/responsibility map for feedback/remediation queue
- `docs/operations/TESTING.md`
  - new operator verification flow
- `docs/reference/api-surface.md`
  - contract updates for feedback admin/remediation endpoints
- `docs/reference/DATA_MODEL.md`
  - source-of-truth changes for feedback/remediation/suppression metadata
- `docs/todos/badcase-feedback-loop.md`
  - move from TODO direction to implemented loop and residual gaps

## Phase 1: Define Reusable Feedback Escalation Semantics

**Objective:** Add the smallest shared domain model that can express “10 feedbacks trigger human remediation and temporary suppression” without creating a second moderation system.

**Files:**
- Modify: `packages/contracts/src/domain/feedback.ts`
- Modify: `packages/contracts/src/domain/knowledge.ts`
- Modify: `packages/contracts/src/domain/artifacts.ts`
- Modify: `packages/server/src/lib/store/types/feedback-records.ts`
- Modify: `packages/server/src/lib/feedback/repository.ts`
- Modify: `packages/server/src/lib/feedback/pg-repository.ts`
- Modify: `plan.md`

- [x] Define one explicit remediation/suppression metadata shape that works for both trap and skill entries.
- [x] Keep raw feedback record history unchanged; add separate “active suppression/remediation” state instead of mutating/deleting historical feedback.
- [x] Represent threshold policy explicitly, with current target of “10 unresolved feedback items” and enough shape to support future policy tuning.
- [ ] Prefer adding repository methods for aggregate counts and active-remediation lookups instead of embedding threshold scans in route handlers.
- [ ] Record in `plan.md` the chosen semantic split between:
  - raw feedback facts
  - active remediation case / suppression state
  - retrieval/index consequences

**Completion standard:**

- [x] A developer can answer from contracts alone:
  - what gets stored as raw feedback
  - what marks an entry as escalated
  - what marks an entry as suppressed from retrieval/index
  - what must be cleared after human remediation
- [x] The new model works for both trap and skill without trap-only `decayMeta` assumptions.
- [x] No implementation in this phase directly couples threshold policy to rerank math or direct index writes.

**Document updates in this phase:**

- [ ] Update `docs/reference/DATA_MODEL.md` with the new remediation/suppression state fields and their lifecycle.
- [ ] Update `docs/PACKAGES.md` to explain that `feedback` now owns escalation/remediation orchestration inputs, while trap/skill review lanes remain the human correction path.
- [ ] Update `docs/reference/api-surface.md` if any contract-level admin route payloads change.

**Tests / eval updates in this phase:**

- [x] Add or extend contract tests in:
  - `packages/contracts/src/domain/feedback.test.ts`
  - `packages/contracts/src/domain/knowledge.test.ts`
  - `packages/contracts/src/domain/artifacts.test.ts`
- [ ] Add repository-level tests for any new aggregate/stat methods in:
  - `packages/server/src/lib/feedback/repository.test.ts`
  - `packages/server/src/lib/feedback/pg-repository.test.ts`
- [x] Run:
```bash
pnpm test -- --run \
  packages/contracts/src/domain/feedback.test.ts \
  packages/contracts/src/domain/knowledge.test.ts \
  packages/contracts/src/domain/artifacts.test.ts \
  packages/server/src/lib/feedback/repository.test.ts \
  packages/server/src/lib/feedback/pg-repository.test.ts
```
- [x] Run:
```bash
pnpm typecheck
```

Actual status:
- Targeted tests passed after adding remediation contract/state wiring plus retrieval suppression coverage.
- `pnpm typecheck` passed on 2026-06-09.

**Example structure or code:**
```ts
export interface FeedbackRemediationState {
  status: 'none' | 'pending-human-review' | 'in-remediation' | 'ready-to-reindex';
  triggeredByFeedbackCount: number;
  threshold: number;
  suppressedFromRetrieval: boolean;
  suppressedFromIndex: boolean;
  activeFeedbackIds: string[];
  openedAt: string | null;
  openedByUserId: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
}
```

```ts
export interface FeedbackThresholdPolicy {
  unresolvedCountThreshold: 10;
  eligibleStatuses: Array<'new' | 'triaged'>;
}
```

## Phase 2: Reuse Feedback Admin As The Remediation Queue

**Objective:** Extend the current feedback admin lane so operators can see escalated trap/skill items with source content and feedback context, without introducing a parallel queue product.

**Files:**
- Modify: `packages/server/src/routes/feedback-admin.ts`
- Modify: `packages/server/src/routes/feedback.test.ts`
- Modify: `packages/contracts/src/domain/feedback.ts`
- Modify: `packages/server/src/lib/feedback/repository.ts`
- Modify: `packages/server/src/lib/feedback/pg-repository.ts`
- Modify: `packages/server/src/lib/artifacts/pg-repository/index.ts`
- Modify: `plan.md`

- [x] Add a remediation-oriented listing/detail shape on top of the existing feedback admin surface.
- [ ] Ensure each escalated item includes:
  - entry identity and type
  - trap detail or skill latest revision content summary/body snapshot
  - aggregated unresolved feedback count
  - recent feedback records and problem-type breakdown
  - current remediation/suppression status
- [x] Reuse the current permissions gate from `feedback-admin` instead of adding a new authority model.
- [x] Keep the feedback queue and remediation queue logically connected:
  - a remediation item is derived from entry + unresolved feedback set
  - it is not an independent copy of all feedback data
- [x] Prefer additive route extensions under `/v1/operations/feedback` rather than a new top-level area.

**Completion standard:**

- [x] An operator can list escalated trap and skill items from the existing admin route family.
- [x] An operator can inspect both the underlying content and the unresolved feedback context needed to fix it.
- [ ] The implementation does not require direct store snapshot spelunking for content lookup where repositories already exist.

**Document updates in this phase:**

- [ ] Update `docs/reference/api-surface.md` with remediation queue list/detail semantics.
- [ ] Update `docs/PACKAGES.md` to note that `routes/feedback-admin.ts` now covers feedback queue plus remediation worklist behavior.
- [ ] Update `docs/todos/badcase-feedback-loop.md` to reflect that feedback can now carry remediation queue state even before eval conversion is added.

**Tests / eval updates in this phase:**

- [x] Extend `packages/server/src/routes/feedback.test.ts` with:
  - escalated trap visible in remediation list
  - escalated skill visible in remediation list
  - detail payload contains source content snapshot plus recent feedback
  - non-escalated items do not appear in remediation queue mode
- [ ] Add any missing repository assertions in:
  - `packages/server/src/lib/feedback/repository.test.ts`
  - `packages/server/src/lib/feedback/pg-repository.test.ts`
- [x] Run:
```bash
pnpm test -- --run \
  packages/server/src/routes/feedback.test.ts \
  packages/server/src/lib/feedback/repository.test.ts \
  packages/server/src/lib/feedback/pg-repository.test.ts
```

**Example structure or code:**
```ts
export interface FeedbackRemediationQueueItem {
  entryId: string;
  entryType: 'trap' | 'skill';
  title: string;
  remediationStatus: 'pending-human-review' | 'in-remediation' | 'ready-to-reindex';
  unresolvedFeedbackCount: number;
  suppressedFromRetrieval: boolean;
  sourceSnapshot: {
    trapDetail?: string;
    skillRevision?: number;
    skillProfileSummary?: string | null;
    skillCapsules?: Array<{ capsuleId: string; problem: string; content: string }>;
  };
  recentFeedback: Array<{
    feedbackId: string;
    problemType: 'incorrect' | 'outdated' | 'context-mismatch' | 'incomplete' | 'other';
    description: string;
    status: 'new' | 'triaged' | 'resolved' | 'dismissed';
    submittedAt: string;
  }>;
}
```

## Phase 3: Suppress Retrieval And Reuse Existing Index Removal Paths

**Objective:** Make escalation temporarily hide bad trap/skill content from retrieval, reusing lifecycle/indexing seams where possible and minimizing bespoke direct index mutation.

**Files:**
- Modify: `packages/server/src/lib/retrieval/scoring/rerank.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/scoring/rerank.ts`
- Modify: `packages/server/src/lib/indexing/events.ts`
- Modify: `packages/server/src/lib/indexing/skill-events.ts`
- Modify: `packages/server/src/routes/feedback-admin.ts`
- Modify: `packages/server/src/routes/retrieval.test.ts`
- Modify: `packages/server/src/__tests__/skill-lifecycle-flow.test.ts`
- Modify: `plan.md`

- [x] Decide and document the suppression strategy:
  - retrieval-time hard filter only
  - index removal only
  - or both, with retrieval filter as safety net
- [ ] Reuse existing trap and skill index removal/rebuild functions instead of open-coding adapter deletion in feedback routes.
- [x] Ensure suppression applies symmetrically to trap and skill retrieval surfaces.
- [ ] Do not overload ordinary `stale` decay penalty to mean “suppressed by feedback escalation”.
- [ ] Ensure repeated remediation toggles are idempotent and auditable.

**Completion standard:**

- [x] Escalated traps no longer surface in trap retrieval results.
- [x] Escalated skills no longer surface in skill/capsule retrieval results.
- [ ] Index suppression uses existing removal/rebuild seams, or if a new seam is required, it is shared by both trap and skill and not route-local.
- [x] Retrieval has a safety filter so suppressed content cannot leak back due to stale index rows.

**Document updates in this phase:**

- [ ] Update `docs/reference/api-surface.md` if remediation actions can now trigger suppression/unsuppression state transitions.
- [ ] Update `docs/PACKAGES.md` with the retrieval/indexing responsibility split for suppression.
- [ ] Update `docs/operations/TESTING.md` with a manual verification recipe for “escalate -> suppress -> verify retrieval absence”.

**Tests / eval updates in this phase:**

- [x] Extend `packages/server/src/routes/retrieval.test.ts` with:
  - suppressed trap excluded from retrieval
  - suppressed skill capsule excluded from retrieval
- [ ] Extend `packages/server/src/__tests__/skill-lifecycle-flow.test.ts` with suppression/removal/rebuild coverage for skill.
- [ ] Add targeted tests in:
  - `packages/server/src/lib/retrieval/scoring/rerank.test.ts`
  - `packages/server/src/lib/retrieval/capsules/scoring/rerank.test.ts`
  - `packages/server/src/lib/indexing/events.test.ts`
  - `packages/server/src/lib/indexing/skill-events.test.ts`
- [x] Run:
```bash
pnpm test -- --run \
  packages/server/src/routes/retrieval.test.ts \
  packages/server/src/__tests__/skill-lifecycle-flow.test.ts \
  packages/server/src/lib/retrieval/scoring/rerank.test.ts \
  packages/server/src/lib/retrieval/capsules/scoring/rerank.test.ts \
  packages/server/src/lib/indexing/events.test.ts \
  packages/server/src/lib/indexing/skill-events.test.ts
```

**Example structure or code:**
```ts
function isSuppressedByFeedback(entry: { remediation?: FeedbackRemediationState | null }) {
  return (
    entry.remediation?.suppressedFromRetrieval === true ||
    entry.remediation?.suppressedFromIndex === true
  );
}
```

```ts
if (isSuppressedByFeedback(candidate.entry)) {
  return null;
}
```

## Phase 4: Reuse Trap Review And Skill Edit/Review For Human Fix Confirmation

**Objective:** Connect remediation queue actions to the existing human correction paths, then explicitly clear active suppression/penalty state only after a confirmed fix and reindex.

**Files:**
- Modify: `packages/server/src/routes/feedback-admin.ts`
- Modify: `packages/server/src/routes/review.ts`
- Modify: `packages/server/src/routes/operations/skill-edit.ts`
- Modify: `packages/server/src/routes/operations/skill-review.ts`
- Modify: `packages/server/src/routes/review.test.ts`
- Modify: `packages/server/src/routes/operations/skill-edit.test.ts`
- Modify: `packages/server/src/routes/operations/skill-review.test.ts`
- Modify: `packages/server/src/lib/indexing/events.ts`
- Modify: `packages/server/src/lib/indexing/skill-events.ts`
- Modify: `plan.md`

- [x] Define the operator workflow for traps:
  - remediation item opened
  - human updates/reviews trap
  - explicit action marks remediation ready to reindex
  - reindex runs
  - active suppression/penalty state clears
- [x] Define the operator workflow for skills:
  - remediation item opened
  - human edits artifact through existing skill edit flow
  - human review/approval completes via existing review flow
  - reindex runs
  - active suppression/penalty state clears
- [x] Make the “clear active feedback penalty” action explicit and auditable.
- [x] Ensure old feedback history remains queryable after remediation closure.
- [ ] Reuse existing index rebuild/refresh pathways, including capsule index rebuild utilities if needed for skill capsule recovery.

**Completion standard:**

- [x] Trap remediation can be completed without inventing a second trap editing surface.
- [x] Skill remediation can be completed without inventing a second skill editing surface.
- [ ] Reactivation is blocked until human correction plus explicit queue transition is complete.
- [ ] Reindex and active penalty clear happen in a deterministic order that tests assert.

**Document updates in this phase:**

- [ ] Update `docs/operations/TESTING.md` with the full operator playbook:
  - submit feedback
  - hit threshold
  - verify suppression
  - correct content
  - review/approve
  - reindex
  - verify restoration
- [ ] Update `docs/PACKAGES.md` with trap vs skill remediation integration points.
- [ ] Update `docs/todos/badcase-feedback-loop.md` to note which parts of the remediation loop are now implemented and which eval conversion work remains future scope.

**Tests / eval updates in this phase:**

- [x] Extend:
  - `packages/server/src/routes/review.test.ts`
  - `packages/server/src/routes/operations/skill-edit.test.ts`
  - `packages/server/src/routes/operations/skill-review.test.ts`
  - `packages/server/src/routes/feedback.test.ts`
- [x] Add end-to-end workflow assertions for:
  - trap suppressed -> reviewed/fixed -> reindexed -> visible again
  - skill suppressed -> edited/reviewed -> reindexed -> visible again
- [x] Run:
```bash
pnpm test -- --run \
  packages/server/src/routes/review.test.ts \
  packages/server/src/routes/operations/skill-edit.test.ts \
  packages/server/src/routes/operations/skill-review.test.ts \
  packages/server/src/routes/feedback.test.ts \
  packages/server/src/routes/retrieval.test.ts \
  packages/server/src/__tests__/skill-lifecycle-flow.test.ts
```

Actual status:
- `skill edit` now pushes escalated unresolved feedback into `in-remediation`.
- `trap review approve` and `skill review approve` now push escalated unresolved feedback into `ready-to-reindex`.
- Targeted route tests passed on 2026-06-09.

**Example structure or code:**
```ts
export interface CompleteRemediationRequest {
  entryId: string;
  entryType: 'trap' | 'skill';
  action: 'mark-ready-to-reindex' | 'reindex-and-reactivate';
  notes?: string;
}
```

```ts
async function clearActiveFeedbackPenaltyAfterRepair(args: {
  entryId: string;
  entryType: 'trap' | 'skill';
  resolvedByUserId: string;
  resolvedAt: string;
}) {
  // Preserve feedback history, clear only active remediation/suppression state.
}
```

## Phase 5: Close The Loop With Docs And Eval Coverage

**Objective:** Make the new feedback escalation loop operable, documented, and regression-protected, including at least one eval/backcase linkage update.

**Files:**
- Modify: `docs/operations/TESTING.md`
- Modify: `docs/reference/api-surface.md`
- Modify: `docs/reference/DATA_MODEL.md`
- Modify: `docs/PACKAGES.md`
- Modify: `docs/todos/badcase-feedback-loop.md`
- Modify: `evals/retrieval/README.md`
- Modify: `evals/summary/README.md` if any feedback-loop references belong there
- Modify: `packages/server/src/__tests__/docs-truth-smoke.test.ts`
- Modify: `plan.md`

- [x] Document the final state machine and operator workflow in one place.
- [x] Add at least one explicit “feedback badcase -> remediation -> eval follow-up” note or helper workflow in docs.
- [ ] Update docs truth tests if new canonical docs or required phrases are introduced.
- [ ] Run the minimum regression and smoke commands needed to prove this feature does not break retrieval/index flows.

**Completion standard:**

- [ ] Operators can execute the full loop from docs without tribal knowledge.
- [ ] The plan records which commands were actually run and whether they passed.
- [ ] The repository has at least one documented bridge from feedback remediation to future eval accumulation work.

**Document updates in this phase:**

- [x] Update `docs/operations/TESTING.md`
- [x] Update `docs/reference/api-surface.md`
- [x] Update `docs/reference/DATA_MODEL.md`
- [x] Update `docs/PACKAGES.md`
- [x] Update `docs/todos/badcase-feedback-loop.md`
- [ ] Update `evals/retrieval/README.md`

**Tests / eval updates in this phase:**

- [ ] Extend `packages/server/src/__tests__/docs-truth-smoke.test.ts` if needed for new required docs references.
- [x] Run:
```bash
pnpm test -- --run \
  packages/server/src/routes/feedback.test.ts \
  packages/server/src/routes/review.test.ts \
  packages/server/src/routes/operations/skill-edit.test.ts \
  packages/server/src/routes/operations/skill-review.test.ts \
  packages/server/src/routes/retrieval.test.ts \
  packages/server/src/__tests__/skill-lifecycle-flow.test.ts \
  packages/server/src/__tests__/docs-truth-smoke.test.ts
```
- [x] Run:
```bash
pnpm typecheck
```
- [ ] Run:
```bash
pnpm eval:smoke
```

## Final Acceptance Checklist

- [ ] `trap` and `skill` feedback both contribute to threshold-based escalation.
- [ ] Existing feedback admin surface is reused as the remediation queue entrypoint.
- [ ] Existing trap review and skill edit/review flows are reused for human correction.
- [ ] Existing index removal/rebuild seams are reused for suppression and restoration.
- [ ] Raw feedback history is preserved after remediation closure.
- [ ] Active suppression/penalty state is cleared only after confirmed human fix and reindex.
- [ ] Retrieval tests cover suppressed and restored visibility for both trap and skill.
- [ ] Docs cover the end-to-end operator flow and the feedback-to-eval bridge.
