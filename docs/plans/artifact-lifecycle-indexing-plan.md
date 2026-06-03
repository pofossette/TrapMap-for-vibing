# Artifact Lifecycle Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make artifact lifecycle transitions the single source of truth for skill-side retrieval index creation and removal.

**Architecture:** Reuse the existing skill indexing seam instead of keeping route-local post-commit callbacks. Normalize all artifact transitions that change retrieval visibility onto one shared indexing runner, and remove indexes whenever an artifact leaves `approved`, not only when it becomes `deactivated`.

**Tech Stack:** TypeScript, Fastify, Vitest.

---

## Scope

- `packages/server/src/lib/indexing/skill-events.ts`
- `packages/server/src/lib/indexing/artifact-pipeline.ts`
- `packages/server/src/routes/operations/skill-review.ts`
- `packages/server/src/routes/operations/skill-edit.ts`
- `packages/server/src/routes/operations/artifacts-activate.ts`
- `packages/server/src/routes/operations/artifacts-import.ts` if needed

## Phase 0: Freeze lifecycle trigger matrix

- [x] Confirm every artifact route that can move lifecycle state or derived revision visibility.
- [x] Lock the trigger matrix for:
  - enter `approved` => upsert indexes
  - leave `approved` => remove indexes
  - all other transitions => noop

**Completion standard**

- There is one explicit table of transitions and expected index actions.
- No route-specific exceptions remain undocumented.

**Document updates**

- [x] Add or update trigger matrix text in `docs/architecture/components/INDEXING.md`.

**Test and eval updates**

- [x] Record baseline tests:
  - `rtk pnpm test -- --run packages/server/src/lib/indexing/skill-events.test.ts packages/server/src/routes/operations/skill-review.test.ts packages/server/src/routes/operations/skill-edit.test.ts packages/server/src/routes/operations/artifacts-activate.test.ts`

**Example structure or code**

```ts
type SkillIndexAction = 'upsert' | 'remove' | 'noop';
```

## Phase 1: Fix transition semantics in skill indexing

- [x] Update `determineSkillIndexAction()` so leaving `approved` always removes indexes.
- [x] Preserve `approved` entry into the runner only for real upsert transitions.

**Completion standard**

- `approved -> agent-pass`
- `approved -> agent-rejected`
- `approved -> rejected`
- `approved -> deactivated`
all yield remove.

**Document updates**

- [x] Update `docs/architecture/components/INDEXING.md`.

**Test and eval updates**

- [x] Extend `packages/server/src/lib/indexing/skill-events.test.ts` with the four transitions above.

**Example structure or code**

```ts
if (previousState === 'approved' && nextState !== 'approved') {
  return 'remove';
}
```

## Phase 2: Remove route-local indexing special cases

- [x] Refactor `skill-review.ts`, `skill-edit.ts`, and `artifacts-activate.ts` to use the shared artifact indexing seam consistently.
- [x] Avoid route-local assumptions such as "only refresh graph if artifact ends in approved state".

**Completion standard**

- Routes do not manually encode index semantics differently from the shared runner.
- A regression in one route cannot leave stale indexes while another route behaves correctly.

**Document updates**

- [x] Update `docs/architecture/components/RETRIEVAL.md` or `INDEXING.md` if route semantics are mentioned there.

**Test and eval updates**

- [x] Extend route tests to assert stale removal after transitions out of `approved`.

**Example structure or code**

```ts
await runSkillIndexEvent({
  services,
  artifactId,
  previousState,
  nextState,
  reason,
  adapters: getArtifactAdapters(),
});
```

## Phase 3: Cover import/other lifecycle entrypoints

- [x] Decide whether artifact import or future repo-level lifecycle writers must call the same runner.
- [x] Wire any missing production entrypoints.

**Completion standard**

- All production artifact transitions that affect retrieval visibility are covered.

**Document updates**

- [x] Update `docs/architecture/components/ARTIFACTS.md` if import/review flow descriptions change.

**Test and eval updates**

- [x] Add one regression test for any newly covered entrypoint.

**Example structure or code**

```ts
const requiresIndexRefresh = previousState !== nextState || reason === 'updated';
```

## Phase 4: Verification and closeout

- [x] Run focused tests.
- [x] Run `rtk pnpm typecheck`.
- [x] Update this plan with completion notes if executed.

**Completion standard**

- All relevant tests pass.
- Docs and routes describe the same lifecycle-to-index contract.
