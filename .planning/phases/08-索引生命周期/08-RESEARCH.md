# Phase 8: 索引生命周期 - Research

**Researched:** 2026-04-14 [VERIFIED: codebase grep]
**Domain:** Retrieval index lifecycle orchestration inside the existing server approval and retrieval flow [VERIFIED: codebase grep]
**Confidence:** MEDIUM [VERIFIED: codebase grep]

<user_constraints>
## User Constraints

- Must cover `IDX-01` through `IDX-08`. [VERIFIED: user prompt]
- Must preserve `BOUND-01` through `BOUND-05`. [VERIFIED: user prompt]
- Must focus on lifecycle events, normalization, adapter seams, idempotent rebuild/refresh/remove, retry/reconciliation, and integration with the existing retrieval and approval flows. [VERIFIED: user prompt]
- No `*-CONTEXT.md` exists for Phase 8, so there are no additional locked decisions beyond the roadmap, requirements, and direct user request. [VERIFIED: codebase grep]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IDX-01 | 创建索引管线 (`indexing/pipeline.ts`) [VERIFIED: `.planning/REQUIREMENTS.md`] | Use a server-only pipeline that accepts lifecycle intents and fan-outs to adapters after approval/state checks. [VERIFIED: codebase grep] |
| IDX-02 | 创建内容标准化模块 (`indexing/normalize.ts`) [VERIFIED: `.planning/REQUIREMENTS.md`] | Normalize one canonical document shape for both vector and keyword adapters so rebuilds and refreshes stay deterministic. [VERIFIED: codebase grep] |
| IDX-03 | 创建索引事件触发器 (`indexing/events.ts`) [VERIFIED: `.planning/REQUIREMENTS.md`] | Trigger from existing mutation points: review approval, privileged update, deactivate, and approved import paths. [VERIFIED: codebase grep] |
| IDX-04 | 审批通过后自动建索引 [VERIFIED: `.planning/REQUIREMENTS.md`] | Hook `applyReviewDecision(...approve)` to enqueue a build intent after lifecycle flips to `approved`. [VERIFIED: codebase grep] |
| IDX-05 | 知识更新时刷新索引 [VERIFIED: `.planning/REQUIREMENTS.md`] | Hook `updateKnowledgeEntry(...)` to enqueue refresh when the entry is still `approved`; otherwise mark pending until approval exists. [VERIFIED: codebase grep] |
| IDX-06 | 知识停用时移除索引 [VERIFIED: `.planning/REQUIREMENTS.md`] | Hook deactivate to remove all adapter artifacts by `entryId` and last indexed revision. [VERIFIED: codebase grep] |
| IDX-07 | 实现向量索引 adapter (`indexing/adapters/vector.ts`) [VERIFIED: `.planning/REQUIREMENTS.md`] | Move embedding cache write responsibility out of query-time code and behind an adapter interface. [VERIFIED: codebase grep] |
| IDX-08 | 实现关键词索引 adapter (`indexing/adapters/keyword.ts`) [VERIFIED: `.planning/REQUIREMENTS.md`] | Persist normalized lexical artifacts for hybrid retrieval instead of recomputing only at query time. [ASSUMED] |
</phase_requirements>

## Summary

Phase 8 should convert the current lazy, query-adjacent indexing behavior into a lifecycle-driven server pipeline. The current code already has the right domain signals: `knowledge.ts` records lifecycle events (`submitted`, `agent-reviewed`, `reviewer-approved`, `updated`, `deactivated`), `review.ts` owns approval decisions, `knowledge.ts` and `operations.ts` own update/deactivate mutations, and `retrieval/orchestrator.ts` still exposes `updateEntryEmbeddingCache(...)` as a direct embedding-cache writer. [VERIFIED: codebase grep]

The primary gap is that indexing is not yet a first-class state machine. Semantic retrieval currently calls `getEntryEmbedding(...)`, which re-computes vectors on cache miss and explicitly does not persist them from the snapshot path, while `updateEntryEmbeddingCache(...)` mutates the store separately and only covers the semantic cache. [VERIFIED: codebase grep] Phase 8 should centralize all indexing behind `indexing/pipeline.ts`, fed by `indexing/events.ts`, with a shared normalized payload and adapter contracts for vector and keyword channels. [VERIFIED: codebase grep]

**Primary recommendation:** Build a server-only indexing pipeline that consumes lifecycle intents from approval/update/deactivate flows, uses one canonical normalized document, persists per-adapter index state for idempotent retries, and keeps retrieval read-only. [VERIFIED: codebase grep]

## Project Constraints (from AGENTS.md)

- Keep the monorepo separation between CLI, server, and shared contracts. [VERIFIED: `AGENTS.md`]
- Keep CLI interaction imperative and API-contract-driven. [VERIFIED: `AGENTS.md`]
- Keep text-only retrieval in v1.x. [VERIFIED: `AGENTS.md`]
- Keep access control as role templates plus explicit permissions, enforced on the server. [VERIFIED: `AGENTS.md`]
- Do not make direct repo edits outside a GSD workflow unless explicitly asked to bypass it; this request explicitly asked for a phase research artifact. [VERIFIED: `AGENTS.md`]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `v20.19.5` installed locally [VERIFIED: local env] | Runtime for Phase 8 server logic and tests [VERIFIED: codebase grep] | Existing workspace scripts and packages run on Node and no additional runtime is required for this phase. [VERIFIED: codebase grep] |
| TypeScript | workspace `5.9.3`; npm current `6.0.2` [VERIFIED: codebase grep] [VERIFIED: npm registry] | Implement pipeline, adapters, and tests [VERIFIED: codebase grep] | Phase 8 should stay in the existing TS monorepo instead of introducing another language/runtime. [VERIFIED: `AGENTS.md`] |
| Fastify | workspace `^5.6.1`; npm current `5.8.4` [VERIFIED: codebase grep] [VERIFIED: npm registry] | Existing mutation routes where lifecycle triggers attach [VERIFIED: codebase grep] | Approval/update/deactivate flows already live in Fastify routes, so lifecycle hooks belong there or immediately below them. [VERIFIED: codebase grep] |
| Zod | workspace `^4.3.6`/`^4.1.12`; npm current `4.3.6` [VERIFIED: codebase grep] [VERIFIED: npm registry] | Contracts remain the schema authority [VERIFIED: `.planning/REQUIREMENTS.md`] | Preserves `BOUND-01` and avoids route-local contract drift. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| Internal `JsonStore` | in-repo [VERIFIED: codebase grep] | Source-of-truth persistence for knowledge, lifecycle history, and new index state [VERIFIED: codebase grep] | Current server uses `JsonStore` for all knowledge mutations, so Phase 8 should extend that store instead of adding a second persistence layer mid-milestone. [VERIFIED: codebase grep] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@langchain/openai` | workspace `^1.4.4`; npm current `1.4.4` [VERIFIED: codebase grep] [VERIFIED: npm registry] | Existing embedding provider path [VERIFIED: codebase grep] | Use only inside the vector adapter, not in route handlers or retrieval orchestration. [VERIFIED: codebase grep] |
| `@langchain/core` | workspace `^1.1.39`; npm current `1.1.39` [VERIFIED: codebase grep] [VERIFIED: npm registry] | Shared model abstractions already in server deps [VERIFIED: codebase grep] | Keep provider details isolated inside adapter code. [VERIFIED: `AGENTS.md`] |
| Vitest | workspace `^3.2.4`; npm current `4.1.4` [VERIFIED: codebase grep] [VERIFIED: npm registry] | Unit and workflow tests for lifecycle-driven indexing [VERIFIED: codebase grep] | Existing repo test runner; no new framework is justified for Phase 8. [VERIFIED: codebase grep] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `JsonStore` index state [VERIFIED: codebase grep] | External queue/database [ASSUMED] | External infrastructure would add operational scope not present in the current repo or milestone requirements. [VERIFIED: codebase grep] |
| Server-side lifecycle hooks [VERIFIED: codebase grep] | Query-time lazy indexing [VERIFIED: codebase grep] | Query-time indexing repeats work, complicates deactivation cleanup, and blurs the required approval-before-retrieval order. [VERIFIED: codebase grep] |

**Installation:**
```bash
pnpm install
```

**Version verification:** Current npm registry checks on 2026-04-14 confirmed `typescript@6.0.2`, `vitest@4.1.4`, `zod@4.3.6`, `fastify@5.8.4`, `pino@10.3.1`, `@langchain/core@1.1.39`, and `@langchain/openai@1.4.4`. [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure
```text
packages/server/src/lib/
├── indexing/
│   ├── pipeline.ts        # lifecycle intent handler and adapter fan-out
│   ├── normalize.ts       # canonical searchable document builder
│   ├── events.ts          # route/lib hooks that translate domain mutations to index intents
│   ├── state.ts           # index status helpers and reconciliation queries
│   └── adapters/
│       ├── vector.ts      # semantic index adapter
│       └── keyword.ts     # lexical index adapter
├── retrieval/
│   ├── orchestrator.ts    # read-only query orchestration
│   └── recall/            # channel readers only
└── knowledge.ts           # lifecycle mutation source of truth
```

### Pattern 1: Lifecycle Intents, Not Direct Route Logic
**What:** Routes and mutation helpers should emit a narrow index intent such as `build`, `refresh`, `remove`, or `reconcile` after the domain mutation commits. [VERIFIED: codebase grep]
**When to use:** On `reviewer-approved`, `updated`, `deactivated`, and any future approved-import path. [VERIFIED: codebase grep]
**Why:** Approval, RBAC, team filtering, and audit stay in the current business flow, while indexing becomes a side-effect with explicit state. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: codebase grep]
**Example:**
```typescript
// Source pattern: packages/server/src/routes/review.ts + packages/server/src/lib/knowledge.ts
await store.transact((data) => {
  applyReviewDecision({ store, data, entry, reviewerUserId, decidedAt, decision: 'approve', notes });
  queueIndexIntent(data, {
    entryId: entry.id,
    operation: 'build',
    revision: entry.latestRevision.revision,
    triggeredBy: 'reviewer-approved',
    requestedAt: decidedAt,
  });
});
```

### Pattern 2: Shared Normalized Document for All Adapters
**What:** `normalize.ts` should build one canonical `IndexDocument` from `KnowledgeRecord`. [VERIFIED: codebase grep]
**When to use:** Before any adapter build/refresh/remove operation. [VERIFIED: codebase grep]
**Required fields:** `entryId`, `teamId`, `scope`, `requiredLevel`, `lifecycleState`, `revision`, `updatedAt`, `shortcut`, `detail`, `labels`, `embeddingText`, and `keywordText`. [VERIFIED: codebase grep]
**Why:** Current semantic text is built from `shortcut + detail + labels`; keyword recall also tokenizes content, so one normalization pass avoids drift between channels. [VERIFIED: codebase grep]
**Example:**
```typescript
// Source pattern: packages/server/src/lib/retrieval/recall/semantic.ts
export interface IndexDocument {
  entryId: string;
  teamId: string | null;
  scope: 'global' | 'project';
  requiredLevel: number;
  lifecycleState: string;
  revision: number;
  shortcut: string;
  detail: string;
  labels: string[];
  embeddingText: string;
  keywordText: string;
}
```

### Pattern 3: Adapter Seams Must Be Idempotent
**What:** Each adapter should expose `build(document)`, `refresh(document)`, `remove(ref)`, and `getStatus(entryId)` semantics, with identical inputs producing identical stored state. [ASSUMED]
**When to use:** Every pipeline run and retry. [VERIFIED: codebase grep]
**Why:** Phase 8 explicitly requires rebuild/refresh/remove and retry/reconciliation; idempotency prevents duplicate keyword postings or repeated vector writes. [VERIFIED: user prompt] [VERIFIED: `.planning/REQUIREMENTS.md`]
**Example:**
```typescript
// Source pattern: proposed seam derived from current updateEntryEmbeddingCache()
export interface IndexAdapter {
  kind: 'vector' | 'keyword';
  build(document: IndexDocument): Promise<void>;
  refresh(document: IndexDocument): Promise<void>;
  remove(ref: { entryId: string; revision: number }): Promise<void>;
}
```

### Pattern 4: Retrieval Stays Read-Only
**What:** Retrieval code should consume adapter artifacts and never write index state while answering a search. [VERIFIED: codebase grep]
**When to use:** In `retrieval/orchestrator.ts`, `recall/semantic.ts`, and `recall/keyword.ts`. [VERIFIED: codebase grep]
**Why:** `BOUND-05` requires approval → permission filtering → retrieval → output ordering, and query-time writes blur that boundary. [VERIFIED: `.planning/REQUIREMENTS.md`]

### Anti-Patterns to Avoid
- **Embedding writes inside search flow:** `getEntryEmbedding(...)` currently computes on cache miss, which is acceptable as a temporary fallback but should not remain the primary indexing path after Phase 8. [VERIFIED: codebase grep]
- **Per-adapter normalization logic:** Building embedding text in one place and keyword text in another will eventually diverge labels, revision handling, or state filtering. [VERIFIED: codebase grep]
- **Indexing before lifecycle state is `approved`:** `filterEligibleEntries(...)` already excludes non-approved and deactivated entries; pre-indexing them weakens the approval boundary. [VERIFIED: codebase grep]
- **Treating `global/project` as retrieval mode:** Those values are output buckets and business scope, not query strategy. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: codebase grep]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Search-time semantic cache refresh [VERIFIED: codebase grep] | Ad hoc writes from retrieval code [VERIFIED: codebase grep] | `indexing/pipeline.ts` + `adapters/vector.ts` [VERIFIED: `.planning/REQUIREMENTS.md`] | Keeps retrieval read-only and makes retries observable. [VERIFIED: codebase grep] |
| Channel-specific content shaping [VERIFIED: codebase grep] | Separate string builders in each adapter [VERIFIED: codebase grep] | `indexing/normalize.ts` [VERIFIED: `.planning/REQUIREMENTS.md`] | Prevents normalization drift across vector and keyword indices. [VERIFIED: user prompt] |
| Retry bookkeeping [ASSUMED] | Boolean flags like `needsReindex` on `KnowledgeRecord` [ASSUMED] | Explicit per-adapter index status records with `pending/running/succeeded/failed` and `lastError`. [ASSUMED] | Phase 8 needs reconciliation, not just one-shot updates. [VERIFIED: user prompt] |
| Scope/permission enforcement in adapters [VERIFIED: codebase grep] | Re-implementing RBAC/team checks in each adapter [VERIFIED: codebase grep] | Keep business gating in existing server mutation/retrieval flow, and store scope metadata only for retrieval filtering. [VERIFIED: `.planning/REQUIREMENTS.md`] |

**Key insight:** The phase is not “add two index implementations”; it is “move index ownership to lifecycle state while preserving the existing approval and retrieval boundaries.” [VERIFIED: user prompt] [VERIFIED: `.planning/REQUIREMENTS.md`]

## Common Pitfalls

### Pitfall 1: Refreshing Only the Vector Channel
**What goes wrong:** `approved` entries get fresh embeddings but stale lexical artifacts, so hybrid retrieval drifts by channel. [VERIFIED: codebase grep] [ASSUMED]
**Why it happens:** Current explicit cache update only exists for semantic embeddings via `updateEntryEmbeddingCache(...)`. [VERIFIED: codebase grep]
**How to avoid:** Run both adapters from the same pipeline intent and persist per-adapter status separately. [ASSUMED]
**Warning signs:** Hybrid tests pass for semantic results but keyword-specific fixtures remain stale after updates. [ASSUMED]

### Pitfall 2: Coupling Index State to `updatedAt`
**What goes wrong:** Non-searchable mutations can look like content changes, or index writes can themselves change `updatedAt` and create false refresh churn. [VERIFIED: codebase grep]
**Why it happens:** `updateEntryEmbeddingCache(...)` currently mutates `updatedAt`, and several domain mutations also set `updatedAt`. [VERIFIED: codebase grep]
**How to avoid:** Track index freshness by `revision` plus normalized content hash, not by `updatedAt` alone. [VERIFIED: codebase grep]
**Warning signs:** Reconciliation keeps rebuilding unchanged approved entries. [ASSUMED]

### Pitfall 3: Removing Only Approval Visibility, Not Index Artifacts
**What goes wrong:** A deactivated entry stops showing up after filter checks, but stale index payloads remain and complicate later reconciliation or exports. [VERIFIED: codebase grep] [ASSUMED]
**Why it happens:** Current deactivate flow only flips lifecycle state and adds a lifecycle event. [VERIFIED: codebase grep]
**How to avoid:** Trigger adapter `remove(...)` on deactivation and mark index state removed for every adapter. [VERIFIED: codebase grep] [ASSUMED]
**Warning signs:** Rebuild jobs detect “existing” vector/keyword state for deactivated entries. [ASSUMED]

### Pitfall 4: Indexing Rejected or Agent-Rejected Content
**What goes wrong:** Unapproved content becomes queryable through a side channel or later reconciliation. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]
**Why it happens:** Submission and resubmission already create revisions before approval, so a naive “any revision changed” trigger is insufficient. [VERIFIED: codebase grep]
**How to avoid:** `events.ts` must gate build/refresh intents on lifecycle state `approved` only. [VERIFIED: codebase grep]
**Warning signs:** Index jobs exist for `submitted`, `agent-pass`, `agent-rejected`, or `rejected` revisions. [ASSUMED]

## Code Examples

Verified patterns from current sources:

### Existing Lifecycle Mutation Sources
```typescript
// Source: packages/server/src/lib/knowledge.ts
args.entry.lifecycleHistory.push(
  createLifecycleEvent(args.store, args.data, {
    type: args.decision === 'approve' ? 'reviewer-approved' : 'reviewer-rejected',
    createdAt: args.decidedAt,
    actorUserId: args.reviewerUserId,
    submissionId: latestSubmission?.id ?? null,
    revision: args.entry.latestRevision.revision,
    state: args.entry.lifecycleState,
    note: args.notes,
  }),
);
```

### Existing Semantic Text Builder
```typescript
// Source: packages/server/src/lib/retrieval/recall/semantic.ts
export function buildEmbeddingText(entry: KnowledgeRecord): string {
  const labelsText = entry.labels.join(' ');
  return `${entry.shortcut}\n${entry.detail}\n${labelsText}`.trim();
}
```

### Recommended Reconciliation Pass
```typescript
// Source basis: proposed from current lifecycle + cache model
for (const entry of data.knowledgeEntries) {
  if (entry.lifecycleState === 'approved') {
    await pipeline.ensureIndexed(entry.id, entry.latestRevision.revision);
  } else {
    await pipeline.ensureRemoved(entry.id, entry.latestRevision.revision);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Search path can compute embeddings on demand from `getEntryEmbedding(...)`. [VERIFIED: codebase grep] | Lifecycle-driven adapters should precompute and persist artifacts before retrieval needs them. [VERIFIED: user prompt] | Planned for Phase 8 on 2026-04-14. [VERIFIED: `.planning/ROADMAP.md`] | Lowers query-time work and makes deactivation/update handling explicit. [VERIFIED: `.planning/ROADMAP.md`] |
| Semantic cache is the only explicit persisted retrieval artifact. [VERIFIED: codebase grep] | Phase 8 adds both vector and keyword adapters under one pipeline. [VERIFIED: `.planning/REQUIREMENTS.md`] | Planned for v1.1. [VERIFIED: `.planning/ROADMAP.md`] | Hybrid retrieval can rely on stable artifacts instead of mixed lazy computation. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| Retrieval owns a write helper `updateEntryEmbeddingCache(...)`. [VERIFIED: codebase grep] | Retrieval should become read-only; indexing ownership should move to `indexing/*`. [VERIFIED: user prompt] | Phase 8. [VERIFIED: `.planning/ROADMAP.md`] | Cleaner seam between search orchestration and index maintenance. [VERIFIED: codebase grep] |

**Deprecated/outdated:**
- Relying on query-triggered embedding refresh as the primary indexing strategy is outdated for this milestone because Phase 8 explicitly requires lifecycle-driven indexing. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Keyword retrieval should persist lexical artifacts rather than always tokenize from raw entry content at query time. [ASSUMED] | Phase Requirements, Standard Stack, Patterns | Planner may overbuild storage if Phase 7 keyword recall remains cheap enough without persistence. |
| A2 | `JsonStore` should gain explicit per-adapter index status records rather than only reusing `embeddingCache`. [ASSUMED] | Don't Hand-Roll, Pitfalls | Planner may schedule data model work that could be simplified if a lighter status model is acceptable. |
| A3 | Adapter contract should include `build/refresh/remove/getStatus` semantics. [ASSUMED] | Architecture Patterns | Exact method names may differ, though the idempotent behavior is still needed. |

## Open Questions (RESOLVED)

1. **Approved imports should auto-index immediately when the imported entry already lands in `approved`.**
   - What we know: Imported entries are created through `createImportedEntry(...)`, which delegates to `createKnowledgeEntryRecord(...)` and therefore starts with pre-review-derived lifecycle state. [VERIFIED: codebase grep]
   - Resolution for Phase 8: Treat any import that lands in `approved` exactly like reviewer approval and route it through the same lifecycle-driven `upsert` path. Imports that remain non-approved stay unindexed until a later approval transition. [RESOLVED: aligns with BOUND-05 and the approved-only indexing model in this phase]
   - Planning consequence: Phase 8 plans may reuse the same `runKnowledgeIndexEvent`/pipeline contract for any future approved-import hook, but they do not need to add new CLI or contract surface in this phase. [RESOLVED]

2. **Reconciliation should exist as a synchronous helper in this phase, not as a new background system or public admin operation.**
   - What we know: The current server has no background worker or external queue. [VERIFIED: codebase grep]
   - Resolution for Phase 8: Implement reconciliation as an internal helper exposed from `indexing/pipeline.ts` so execution and tests can call it directly, but defer startup scheduling and any manual/admin endpoint to a later phase. [RESOLVED: keeps the phase server-internal and within current architecture scope]
   - Planning consequence: Phase 8 plans should build `reconcileKnowledgeIndexes(...)` and test it, but must not introduce a separate control plane, external queue, or new API route just to trigger reconciliation. [RESOLVED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server code, tests, local scripts [VERIFIED: codebase grep] | ✓ [VERIFIED: local env] | `v20.19.5` [VERIFIED: local env] | — |
| pnpm | Workspace test/build commands [VERIFIED: codebase grep] | ✓ [VERIFIED: local env] | `10.33.0` [VERIFIED: local env] | `npm` for registry inspection only, not workspace execution. [VERIFIED: local env] |
| npm | Registry verification [VERIFIED: npm registry] | ✓ [VERIFIED: local env] | `10.8.2` [VERIFIED: local env] | — |

**Missing dependencies with no fallback:**
- None identified for this research scope. [VERIFIED: local env]

**Missing dependencies with fallback:**
- None identified for this research scope. [VERIFIED: local env]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest via workspace scripts [VERIFIED: codebase grep] |
| Config file | none; packages use script-level `vitest run` [VERIFIED: codebase grep] |
| Quick run command | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/operations.test.ts` [VERIFIED: codebase grep] |
| Full suite command | `pnpm test` [VERIFIED: codebase grep] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IDX-01 | Pipeline fans out lifecycle intents to adapters deterministically. [VERIFIED: `.planning/REQUIREMENTS.md`] | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/pipeline.test.ts` [ASSUMED] | ❌ Wave 0 |
| IDX-02 | Normalization outputs one canonical searchable document for both adapters. [VERIFIED: `.planning/REQUIREMENTS.md`] | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/normalize.test.ts` [ASSUMED] | ❌ Wave 0 |
| IDX-03 | Event trigger mapping from approval/update/deactivate emits correct intents. [VERIFIED: `.planning/REQUIREMENTS.md`] | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/events.test.ts` [ASSUMED] | ❌ Wave 0 |
| IDX-04 | Approval automatically builds index state. [VERIFIED: `.planning/REQUIREMENTS.md`] | integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval-workflow.test.ts src/routes/review.test.ts` [ASSUMED] | `retrieval-workflow.test.ts` exists; review hook test missing |
| IDX-05 | Approved updates refresh index state idempotently. [VERIFIED: `.planning/REQUIREMENTS.md`] | integration | `pnpm --filter @skill-shareer/server test -- src/routes/knowledge-indexing.test.ts` [ASSUMED] | ❌ Wave 0 |
| IDX-06 | Deactivation removes artifacts and prevents stale retrieval reuse. [VERIFIED: `.planning/REQUIREMENTS.md`] | integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/lib/indexing/pipeline.test.ts` [ASSUMED] | `operations.test.ts` exists; pipeline test missing |
| IDX-07 | Vector adapter writes and reuses revision/content-hash keyed artifacts. [VERIFIED: `.planning/REQUIREMENTS.md`] | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/vector.test.ts` [ASSUMED] | ❌ Wave 0 |
| IDX-08 | Keyword adapter writes/removes lexical artifacts with same lifecycle guarantees. [VERIFIED: `.planning/REQUIREMENTS.md`] | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/keyword.test.ts` [ASSUMED] | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @skill-shareer/server test -- src/lib/indexing/pipeline.test.ts src/lib/indexing/events.test.ts` [ASSUMED]
- **Per wave merge:** `pnpm --filter @skill-shareer/server test` [VERIFIED: codebase grep]
- **Phase gate:** `pnpm test` [VERIFIED: codebase grep]

### Wave 0 Gaps
- [ ] `packages/server/src/lib/indexing/pipeline.test.ts` — covers IDX-01, IDX-04, IDX-05, IDX-06. [ASSUMED]
- [ ] `packages/server/src/lib/indexing/normalize.test.ts` — covers IDX-02. [ASSUMED]
- [ ] `packages/server/src/lib/indexing/events.test.ts` — covers IDX-03 and approval/update/deactivate trigger mapping. [ASSUMED]
- [ ] `packages/server/src/lib/indexing/adapters/vector.test.ts` — covers IDX-07. [ASSUMED]
- [ ] `packages/server/src/lib/indexing/adapters/keyword.test.ts` — covers IDX-08. [ASSUMED]
- [ ] `packages/server/src/routes/review-indexing.test.ts` or equivalent route/workflow coverage — verifies approval hook integration. [ASSUMED]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes [VERIFIED: codebase grep] | Existing `resolveAuthContext(...)` on mutation and retrieval routes. [VERIFIED: codebase grep] |
| V3 Session Management | yes [VERIFIED: codebase grep] | Existing session and access-key flows remain unchanged in this phase. [VERIFIED: codebase grep] |
| V4 Access Control | yes [VERIFIED: `.planning/REQUIREMENTS.md`] | Keep `requirePermission`, `requireHigherLevel`, and `requireTeamAccess` ahead of index-triggering mutations. [VERIFIED: codebase grep] |
| V5 Input Validation | yes [VERIFIED: codebase grep] | Existing Zod schemas in contracts remain the only contract source. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| V6 Cryptography | no material change [VERIFIED: codebase grep] | Reuse existing hashing for embedding text freshness; do not add custom crypto. [VERIFIED: codebase grep] |

### Known Threat Patterns for This Stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Indexing unapproved content through side effects [VERIFIED: codebase grep] | Elevation of Privilege | Gate all build/refresh intents on lifecycle state `approved` after review decision commit. [VERIFIED: codebase grep] |
| Cross-team leakage through shared index artifacts [VERIFIED: `.planning/REQUIREMENTS.md`] | Information Disclosure | Persist `teamId`, `scope`, and `requiredLevel` in normalized documents and keep final eligibility filtering in retrieval before output assembly. [VERIFIED: codebase grep] |
| Stale deactivated content resurfacing in retrieval [VERIFIED: codebase grep] | Tampering | Remove adapter artifacts on deactivation and reconcile non-approved entries to removed state. [VERIFIED: codebase grep] [ASSUMED] |
| Infinite retry loop on adapter failure [ASSUMED] | Denial of Service | Persist failure count and `lastError`, and require explicit reconciliation or capped retry behavior. [ASSUMED] |

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` - Phase 8 goal, plan items, and dependency position. [VERIFIED: codebase grep]
- `.planning/REQUIREMENTS.md` - `IDX-01`..`IDX-08` and `BOUND-01`..`BOUND-05`. [VERIFIED: codebase grep]
- `AGENTS.md` - project constraints and workflow constraints. [VERIFIED: codebase grep]
- `packages/server/src/lib/knowledge.ts` - lifecycle mutations and revision/history model. [VERIFIED: codebase grep]
- `packages/server/src/routes/review.ts` - approval flow entry point. [VERIFIED: codebase grep]
- `packages/server/src/routes/knowledge.ts` - submit/resubmit/update flows. [VERIFIED: codebase grep]
- `packages/server/src/routes/operations.ts` - deactivation flow. [VERIFIED: codebase grep]
- `packages/server/src/lib/retrieval/orchestrator.ts` and `packages/server/src/lib/retrieval/recall/semantic.ts` - current retrieval and semantic cache behavior. [VERIFIED: codebase grep]
- `packages/contracts/src/domain/retrieval.ts`, `knowledge.ts`, `operations.ts` - contract boundaries that must remain authoritative. [VERIFIED: codebase grep]
- npm registry package metadata for TypeScript, Vitest, Zod, Fastify, Pino, `@langchain/core`, and `@langchain/openai`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- `package.json`, `packages/server/package.json`, `packages/contracts/package.json` - workspace versions and test scripts. [VERIFIED: codebase grep]
- Local environment checks for `node`, `pnpm`, and `npm`. [VERIFIED: local env]

### Tertiary (LOW confidence)
- None. [VERIFIED: codebase grep]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package versions, workspace scripts, and available tooling were directly verified. [VERIFIED: codebase grep] [VERIFIED: npm registry] [VERIFIED: local env]
- Architecture: MEDIUM - lifecycle sources and retrieval seams are verified, but exact adapter/state shapes are still design recommendations. [VERIFIED: codebase grep] [ASSUMED]
- Pitfalls: MEDIUM - most pitfalls follow directly from the current lazy semantic cache and mutation flows, but retry-state specifics are still assumed. [VERIFIED: codebase grep] [ASSUMED]

**Research date:** 2026-04-14 [VERIFIED: codebase grep]
**Valid until:** 2026-05-14 for codebase-coupled guidance unless Phase 6 or Phase 7 materially changes retrieval seams first. [VERIFIED: `.planning/STATE.md`] [ASSUMED]
