# Phase 11: 索引生命周期集成 - Research

**Researched:** 2026-04-15 [VERIFIED: local env]  
**Domain:** Existing lifecycle indexing integration for review, update, and deactivate mutation paths [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: codebase grep]  
**Confidence:** HIGH [VERIFIED: codebase grep]

## Summary

Phase 11 is not a greenfield indexing phase. The core indexing pieces already exist in the repo: `packages/server/src/lib/indexing/events.ts`, `pipeline.ts`, `normalize.ts`, adapter implementations, and adapter/pipeline tests are present today. [VERIFIED: codebase grep] The remaining gap is integration: the mutation routes still update lifecycle state directly and do not invoke indexing events, and the server service container does not expose any registered index adapters. [VERIFIED: `packages/server/src/routes/review.ts`] [VERIFIED: `packages/server/src/routes/knowledge.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/app.ts`] [VERIFIED: `packages/server/src/lib/context.ts`]

The minimal plan for `IDX-03` through `IDX-06` is therefore: register the existing adapters once at server bootstrap, pass them through `app.skillShareer`, and call `runKnowledgeIndexEvent(...)` only after the domain transaction commits in the three existing mutation paths that can change indexed visibility or indexed content. [VERIFIED: `packages/server/src/lib/indexing/events.ts`] [VERIFIED: `packages/server/src/lib/indexing/adapters/index.ts`] [VERIFIED: `packages/server/src/routes/review.ts`] [VERIFIED: `packages/server/src/routes/knowledge.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`]

**Primary recommendation:** Treat Phase 11 as route/bootstrap plumbing around the existing indexing layer, not as another indexing redesign. [VERIFIED: codebase grep]

## Project Constraints

- Keep CLI, server, and shared contracts separated; this phase should stay server-internal. [VERIFIED: `AGENTS.md`]
- Preserve imperative CLI/API behavior; no contract changes are required for Phase 11. [VERIFIED: `AGENTS.md`] [VERIFIED: codebase grep]
- Preserve server-side RBAC, team filtering, approval flow, and audit ownership. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]
- Keep retrieval text-only and read-path compatible with legacy fallback behavior. [VERIFIED: `AGENTS.md`] [VERIFIED: `packages/server/src/lib/retrieval/recall/semantic.ts`] [VERIFIED: `packages/server/src/lib/retrieval/recall/keyword.ts`]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IDX-03 | 创建索引事件触发器 [VERIFIED: `.planning/REQUIREMENTS.md`] | `indexing/events.ts` already exists; Phase 11 must wire it into mutation routes and bootstrap adapter registration. [VERIFIED: `packages/server/src/lib/indexing/events.ts`] [VERIFIED: `packages/server/src/app.ts`] |
| IDX-04 | 审批通过后自动建索引 [VERIFIED: `.planning/REQUIREMENTS.md`] | Invoke `runKnowledgeIndexEvent(...)` after `applyReviewDecision(...)` commits an `approved` transition. [VERIFIED: `packages/server/src/routes/review.ts`] [VERIFIED: `packages/server/src/lib/knowledge.ts`] |
| IDX-05 | 知识更新时刷新索引 [VERIFIED: `.planning/REQUIREMENTS.md`] | Invoke `runKnowledgeIndexEvent(...)` after `updateKnowledgeEntry(...)` only when the entry remains `approved`. [VERIFIED: `packages/server/src/routes/knowledge.ts`] [VERIFIED: `packages/server/src/lib/knowledge.ts`] [VERIFIED: `packages/server/src/lib/indexing/events.test.ts`] |
| IDX-06 | 知识停用时移除索引 [VERIFIED: `.planning/REQUIREMENTS.md`] | Invoke `runKnowledgeIndexEvent(...)` after the deactivate route commits `deactivated`. [VERIFIED: `packages/server/src/routes/operations.ts`] [VERIFIED: `packages/server/src/lib/indexing/events.ts`] |
</phase_requirements>

## Current Repo State

### What Already Exists

- `determineKnowledgeIndexAction(...)` maps `approved -> upsert`, `deactivated -> remove`, and other states to `noop`. [VERIFIED: `packages/server/src/lib/indexing/events.ts`]
- `syncKnowledgeIndex(...)` already gates on `lifecycleState === 'approved'`, normalizes once, fans out to adapters, and clears index state for non-approved entries. [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`]
- Retrieval already prefers persisted index data when present and falls back for legacy entries. [VERIFIED: `packages/server/src/lib/retrieval/recall/semantic.ts`] [VERIFIED: `packages/server/src/lib/retrieval/recall/keyword.ts`]
- Adapter implementations and tests already exist for vector and keyword indexing. [VERIFIED: codebase grep]

### What Is Still Missing

- `review.ts` mutates lifecycle state and records audit events, but never calls indexing events. [VERIFIED: `packages/server/src/routes/review.ts`]
- `knowledge.ts` route patch mutates approved content, but never refreshes index state. [VERIFIED: `packages/server/src/routes/knowledge.ts`]
- `operations.ts` deactivate mutates lifecycle state, but never removes index artifacts. [VERIFIED: `packages/server/src/routes/operations.ts`]
- `buildServer()` and `SkillShareerServices` expose only `config` and `store`; there is no adapter registration surface yet. [VERIFIED: `packages/server/src/app.ts`] [VERIFIED: `packages/server/src/lib/context.ts`]

## Standard Stack

| Library/Module | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Node.js | `v20.19.5` [VERIFIED: local env] | Runtime for server integration and tests [VERIFIED: codebase grep] | Matches the installed workspace runtime. [VERIFIED: local env] |
| Fastify | `^5.6.1` in workspace [VERIFIED: `packages/server/package.json`] | Existing mutation route layer [VERIFIED: codebase grep] | All lifecycle mutations already flow through Fastify routes. [VERIFIED: codebase grep] |
| Vitest | `vitest run` via workspace script [VERIFIED: `packages/server/package.json`] | Route and indexing integration tests [VERIFIED: codebase grep] | Existing test runner; no new framework needed. [VERIFIED: codebase grep] |
| Existing indexing modules | in-repo [VERIFIED: codebase grep] | Event mapping, pipeline fan-out, adapter persistence [VERIFIED: codebase grep] | Phase 11 should reuse these modules directly. [VERIFIED: codebase grep] |

## Architecture Patterns

### Recommended Integration Pattern

1. Perform the business mutation inside the existing store transaction. [VERIFIED: `packages/server/src/routes/review.ts`] [VERIFIED: `packages/server/src/routes/knowledge.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`]
2. Capture the `entryId`, `previousState`, and `nextState` needed for indexing while still inside that transaction. [VERIFIED: `packages/server/src/lib/indexing/events.ts`] [VERIFIED: codebase grep]
3. Return from the transaction first. [VERIFIED: `packages/server/src/lib/store.ts`]
4. Call `runKnowledgeIndexEvent(...)` afterward with registered adapters. [VERIFIED: `packages/server/src/lib/indexing/events.ts`]

### Why Post-Commit Invocation Is Required

`runKnowledgeIndexEvent(...)` opens its own `store.transact(...)`. [VERIFIED: `packages/server/src/lib/indexing/events.ts`] `JsonStore.transact(...)` serializes writes through `writeChain` and awaits completion before returning. [VERIFIED: `packages/server/src/lib/store.ts`] Calling `runKnowledgeIndexEvent(...)` from inside an existing route transaction would wait on a nested transaction that itself is waiting for the outer transaction to finish, which is a deadlock risk. [INFERRED from VERIFIED sources: `packages/server/src/lib/indexing/events.ts`, `packages/server/src/lib/store.ts`]

### Minimal Mutation Points

| Mutation point | Requirement(s) | File | Minimal change |
|----------------|----------------|------|----------------|
| Review approval/rejection | IDX-03, IDX-04 [VERIFIED: `.planning/REQUIREMENTS.md`] | `packages/server/src/routes/review.ts` [VERIFIED: codebase grep] | After the existing transaction returns, call `runKnowledgeIndexEvent(...)` with the captured `previousState` and new `entry.lifecycleState`. [VERIFIED: `packages/server/src/lib/indexing/events.ts`] |
| Privileged knowledge update | IDX-05 [VERIFIED: `.planning/REQUIREMENTS.md`] | `packages/server/src/routes/knowledge.ts` [VERIFIED: codebase grep] | After patch commit, call `runKnowledgeIndexEvent(...)` only when the post-update state is still `approved`; pass `approved -> approved` so the event layer resolves to `upsert`. [VERIFIED: `packages/server/src/lib/indexing/events.test.ts`] |
| Knowledge deactivation | IDX-06 [VERIFIED: `.planning/REQUIREMENTS.md`] | `packages/server/src/routes/operations.ts` [VERIFIED: codebase grep] | After deactivate commit, call `runKnowledgeIndexEvent(...)` with `previousState -> deactivated`. [VERIFIED: `packages/server/src/lib/indexing/events.ts`] |
| Adapter registration | Supports all IDX-03..06 [VERIFIED: `.planning/ROADMAP.md`] | `packages/server/src/app.ts`, `packages/server/src/lib/context.ts` [VERIFIED: codebase grep] | Add an `indexAdapters` service field and initialize it from the existing vector and keyword adapters; keep graph registration out of Phase 11 unless the planner explicitly widens scope. [VERIFIED: `packages/server/src/lib/indexing/adapters/index.ts`] [ASSUMED: Phase 11 should stay limited to IDX-03..06] |

### Boundary Constraints For Planning

- Do not add new API routes or CLI commands for this phase. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: codebase grep]
- Do not move approval, RBAC, or audit logic into indexing modules. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/server/src/routes/review.ts`] [VERIFIED: `packages/server/src/routes/operations.ts`]
- Do not index submit, resubmit, agent-pass, agent-rejected, or reviewer-rejected transitions. [VERIFIED: `packages/server/src/lib/indexing/events.ts`]
- Do not break retrieval fallback for legacy entries with `indexState === null`. [VERIFIED: `packages/server/src/lib/retrieval/recall/semantic.ts`] [VERIFIED: `packages/server/src/lib/retrieval/recall/keyword.ts`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| New lifecycle mapping logic | Route-local `if/else` copies [VERIFIED: codebase grep] | `determineKnowledgeIndexAction(...)` and `runKnowledgeIndexEvent(...)` [VERIFIED: `packages/server/src/lib/indexing/events.ts`] | Keeps transition semantics centralized. [VERIFIED: codebase grep] |
| New indexing orchestration | Another route-specific sync helper [VERIFIED: codebase grep] | `syncKnowledgeIndex(...)` from `pipeline.ts` [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] | The pipeline already handles approved-only gating and fan-out. [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] |
| Another embedding refresh path | More direct calls to `updateEntryEmbeddingCache(...)` [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] | Registered adapters plus lifecycle events [VERIFIED: codebase grep] | Phase 11 should finish the migration toward lifecycle ownership. [VERIFIED: `.planning/ROADMAP.md`] |

## Common Pitfalls

### Pitfall 1: Nested Transactions

- What goes wrong: Calling `runKnowledgeIndexEvent(...)` inside an existing route transaction can block on the nested `store.transact(...)`. [INFERRED from VERIFIED sources: `packages/server/src/lib/indexing/events.ts`, `packages/server/src/lib/store.ts`]
- How to avoid: Commit the domain mutation first, then call the indexing event. [VERIFIED: `packages/server/src/lib/store.ts`] [VERIFIED: `packages/server/src/lib/indexing/events.ts`]

### Pitfall 2: Refreshing Unapproved Entries

- What goes wrong: Updating a non-approved entry and blindly emitting an upsert would violate the approval-first boundary. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/server/src/lib/indexing/events.ts`]
- How to avoid: Only emit the update event when the post-update lifecycle state is `approved`. [VERIFIED: `packages/server/src/routes/knowledge.ts`] [VERIFIED: `packages/server/src/lib/indexing/events.test.ts`]

### Pitfall 3: Forgetting Adapter Registration

- What goes wrong: Route code gains event calls but has no adapter array to pass, leaving indexing silently disconnected. [VERIFIED: `packages/server/src/app.ts`] [VERIFIED: `packages/server/src/lib/context.ts`]
- How to avoid: Add `indexAdapters` to `SkillShareerServices` and initialize it in `buildServer()`. [VERIFIED: `packages/server/src/lib/context.ts`] [VERIFIED: `packages/server/src/app.ts`] [VERIFIED: `packages/server/src/lib/indexing/adapters/index.ts`]

### Pitfall 4: Breaking Retrieval Fallback

- What goes wrong: Cleaning up old code too aggressively can make older entries unretrievable until they are reindexed. [VERIFIED: `packages/server/src/lib/retrieval/recall/semantic.ts`] [VERIFIED: `packages/server/src/lib/retrieval/recall/keyword.ts`]
- How to avoid: Keep the current fallback behavior in Phase 11; this phase is integration, not retrieval cleanup. [VERIFIED: codebase grep]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest [VERIFIED: `packages/server/package.json`] |
| Quick run command | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/events.test.ts src/lib/indexing/pipeline.test.ts src/routes/review.test.ts src/routes/operations.test.ts` [VERIFIED: `packages/server/package.json`] [ASSUMED: target route test files may need extension] |
| Full suite command | `pnpm --filter @skill-shareer/server test` [VERIFIED: `packages/server/package.json`] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IDX-03 | Route wiring calls existing event layer correctly [VERIFIED: `.planning/REQUIREMENTS.md`] | integration | `pnpm --filter @skill-shareer/server test -- src/routes/review.test.ts src/routes/operations.test.ts` [ASSUMED] | Existing route test files exist; indexing assertions need to be added. [VERIFIED: codebase grep] |
| IDX-04 | Approve transition triggers index upsert after commit [VERIFIED: `.planning/REQUIREMENTS.md`] | integration | `pnpm --filter @skill-shareer/server test -- src/routes/review.test.ts` [ASSUMED] | Likely missing direct coverage. [ASSUMED] |
| IDX-05 | Approved update triggers refresh, non-approved update does not [VERIFIED: `.planning/REQUIREMENTS.md`] | integration | `pnpm --filter @skill-shareer/server test -- src/routes/knowledge.test.ts` [ASSUMED] | Unknown route coverage file; likely Wave 0 gap. [ASSUMED] |
| IDX-06 | Deactivate transition removes index state/artifacts [VERIFIED: `.planning/REQUIREMENTS.md`] | integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts` [ASSUMED] | Existing operations route tests exist; indexing assertions need to be added. [VERIFIED: codebase grep] |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server execution and tests [VERIFIED: codebase grep] | ✓ [VERIFIED: local env] | `v20.19.5` [VERIFIED: local env] | — |
| pnpm | Workspace test execution [VERIFIED: `packages/server/package.json`] | ✓ [VERIFIED: local env] | `10.33.0` [VERIFIED: local env] | — |
| npm | Package inspection only [VERIFIED: local env] | ✓ [VERIFIED: local env] | `10.8.2` [VERIFIED: local env] | — |

## Canonical References

- Roadmap scope: `.planning/ROADMAP.md` [VERIFIED: codebase grep]
- Requirement mapping: `.planning/REQUIREMENTS.md` [VERIFIED: codebase grep]
- Prior lifecycle design intent: `.planning/phases/08-索引生命周期/08-RESEARCH.md` [VERIFIED: codebase grep]
- Event layer: `packages/server/src/lib/indexing/events.ts` [VERIFIED: codebase grep]
- Pipeline layer: `packages/server/src/lib/indexing/pipeline.ts` [VERIFIED: codebase grep]
- Mutation sources: `packages/server/src/routes/review.ts`, `packages/server/src/routes/knowledge.ts`, `packages/server/src/routes/operations.ts` [VERIFIED: codebase grep]
- Bootstrap/service boundary: `packages/server/src/app.ts`, `packages/server/src/lib/context.ts` [VERIFIED: codebase grep]
- Retrieval compatibility constraints: `packages/server/src/lib/retrieval/orchestrator.ts`, `packages/server/src/lib/retrieval/recall/semantic.ts`, `packages/server/src/lib/retrieval/recall/keyword.ts` [VERIFIED: codebase grep]

## Metadata

**Confidence breakdown:**  
- Standard stack: HIGH [VERIFIED: local env] [VERIFIED: `packages/server/package.json`]  
- Architecture: HIGH [VERIFIED: codebase grep]  
- Pitfalls: HIGH for nested transaction and missing wiring, MEDIUM for exact test-file targets. [VERIFIED: codebase grep] [ASSUMED]

**Valid until:** 2026-05-15 unless Phase 11 implementation changes route or service wiring first. [ASSUMED]

## RESEARCH COMPLETE
