# Phase 8: 索引生命周期 - Research

**Researched:** 2026-04-14 [VERIFIED: system date]  
**Domain:** Lifecycle-driven indexing for approved knowledge in the server retrieval stack [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md]  
**Confidence:** MEDIUM [VERIFIED: codebase, npm registry, and official docs were checked] [ASSUMED: Phase 8 can stay entirely inside the current JSON-store server architecture without introducing a separate queue or database]

## User Constraints

- No Phase 8 `CONTEXT.md` exists, so planning must use the roadmap, requirements, AGENTS instructions, and current code only. [VERIFIED: `.planning/phases/08-索引生命周期/*-CONTEXT.md` absent] [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: AGENTS.md]
- Shared contracts remain the only public API truth. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: AGENTS.md]
- CLI must continue to depend only on API contracts and current server behavior. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: AGENTS.md] [VERIFIED: packages/cli/src/commands/retrieval.ts]
- Approval, RBAC, team filtering, and audit stay server-side. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: AGENTS.md] [VERIFIED: packages/server/src/routes/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/filters.ts]
- `global` and `project` remain business scope labels, not retrieval modes or index partitions exposed in the contract. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/assembly.ts]
- Search remains text-only in v1.1. [VERIFIED: AGENTS.md]
- This phase should reduce query-time recomputation by moving index work to lifecycle events. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md]

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IDX-01 | 创建索引管线 (`indexing/pipeline.ts`) | Build a server-internal pipeline that snapshots one `KnowledgeRecord`, normalizes it once, and then applies all index adapters against the same canonical document. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/store.ts] [ASSUMED: a single normalized document object is the cleanest Phase 8 seam] |
| IDX-02 | 创建内容标准化模块 (`indexing/normalize.ts`) | Put text shaping, label normalization, token derivation, and content hashing in a dedicated normalization module rather than inside adapters or retrieval code. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/keyword.ts] |
| IDX-03 | 创建索引事件触发器 (`indexing/events.ts`) | Convert lifecycle transitions that already exist in review, update, and deactivate flows into index sync triggers. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/routes/review.ts] [VERIFIED: packages/server/src/routes/knowledge.ts] [VERIFIED: packages/server/src/routes/operations.ts] |
| IDX-04 | 审批通过后自动建索引 | Trigger `upsert` immediately after a reviewer approval transition. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/knowledge.ts] [VERIFIED: packages/server/src/routes/review.ts] |
| IDX-05 | 知识更新时刷新索引 | Trigger re-sync after privileged updates and after approve-able resubmission flows that change searchable content. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/knowledge.ts] [VERIFIED: packages/server/src/routes/knowledge.ts] |
| IDX-06 | 知识停用时移除索引 | Trigger adapter removal when lifecycle moves to `deactivated`. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/routes/operations.ts] [VERIFIED: packages/server/src/lib/knowledge.ts] |
| IDX-07 | 实现向量索引 adapter (`indexing/adapters/vector.ts`) | Reuse the existing embeddings provider boundary, but make indexing explicit and lifecycle-driven instead of query-driven cache fill. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/embeddings.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| IDX-08 | 实现关键词索引 adapter (`indexing/adapters/keyword.ts`) | Materialize a keyword-friendly representation from normalized content so hybrid retrieval can stop tokenizing every approved entry on every query. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/recall/keyword.ts] |

## Summary

The current server already has the right business boundaries for Phase 8, but indexing is still only half-realized. Retrieval filters approved entries first, then computes semantic and keyword retrieval from the current snapshot; `embeddingCache` exists, but the only production implementation that writes it is `updateEntryEmbeddingCache`, and that function is exported yet never called from review, update, or deactivate flows. [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/store.ts] [VERIFIED: `rg -n "updateEntryEmbeddingCache\\(" packages/server/src -g '!**/dist/**'` on 2026-04-14]

Phase 8 should therefore be planned as an internal consistency layer, not a contract change. The right shape is: lifecycle event source in existing server workflows -> normalization boundary -> adapter fan-out -> persisted index state -> reconciliation path for drift. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/routes/review.ts] [VERIFIED: packages/server/src/routes/knowledge.ts] [VERIFIED: packages/server/src/routes/operations.ts] [ASSUMED: reconciliation can remain server-internal and does not need a public endpoint in this phase]

**Primary recommendation:** Implement Phase 8 as a server-internal `syncKnowledgeIndex(entryId)` pipeline triggered by reviewer approval, content-changing updates, and deactivation, with adapter operations defined as idempotent `upsert/remove` over one normalized document. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/knowledge.ts] [ASSUMED: `syncKnowledgeIndex` is the most maintainable orchestration seam]

## Current State

- Retrieval still pays query-time work for indexing concerns: semantic recall computes an embedding on cache miss, and keyword recall tokenizes every eligible entry during search. [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/keyword.ts]
- Approved-only visibility is already enforced before recall generation, so Phase 8 should not move any approval or authorization logic into adapters. [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
- Reviewer approval is recorded through `applyReviewDecision`, which changes lifecycle state to `approved` and appends a `reviewer-approved` lifecycle event inside the existing store transaction. [VERIFIED: packages/server/src/lib/knowledge.ts] [VERIFIED: packages/server/src/routes/review.ts]
- Privileged content updates create a new revision and append an `updated` lifecycle event, but they do not currently invalidate or refresh any search index state. [VERIFIED: packages/server/src/lib/knowledge.ts] [VERIFIED: packages/server/src/routes/knowledge.ts]
- Deactivation changes lifecycle state to `deactivated` and appends a `deactivated` lifecycle event, but it does not currently remove any index material. [VERIFIED: packages/server/src/routes/operations.ts]
- The public retrieval contract already supports `semantic` and `hybrid` modes, so Phase 8 can preserve the existing request and response shapes. [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/cli/src/commands/retrieval.ts]
- The roadmap source `docs/retrieval-structure-adjustment.md` is missing from the repository, so it cannot be treated as an authoritative design input for planning. [VERIFIED: `docs/retrieval-structure-adjustment.md` missing]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | Repo pin `^5.6.1`; npm latest `5.8.4` published 2026-03-23 [VERIFIED: packages/server/package.json] [VERIFIED: npm registry] | Server composition and internal service registration | The current app already uses `app.decorate('skillShareer', ...)` and route plugins, so indexing services should plug into the same server boundary instead of creating a parallel runtime. [VERIFIED: packages/server/src/app.ts] [CITED: https://fastify.dev/docs/latest/Reference/Decorators/] |
| Zod | Repo pins `^4.3.6` and `^4.1.12`; npm latest `4.3.6` published 2026-01-22 [VERIFIED: packages/server/package.json] [VERIFIED: packages/contracts/package.json] [VERIFIED: npm registry] | Contract and internal payload validation | Shared schemas are already the contract truth, and Zod 4 still targets modern TypeScript. [VERIFIED: AGENTS.md] [CITED: https://zod.dev/] |
| `@langchain/openai` | Repo pin `^1.4.4`; npm latest `1.4.4` published 2026-04-10 [VERIFIED: packages/server/package.json] [VERIFIED: npm registry] | Vector embedding implementation | Official LangChain JS docs still expose `OpenAIEmbeddings` with `embedQuery` and `embedDocuments`, which matches a vector adapter split between query embeddings and lifecycle document indexing. [VERIFIED: packages/server/src/lib/embeddings.ts] [CITED: https://docs.langchain.com/oss/javascript/integrations/text_embedding/openai] |
| `@langchain/core` | Repo pin `^1.1.39`; npm latest `1.1.39` published 2026-04-03 [VERIFIED: packages/server/package.json] [VERIFIED: npm registry] | Shared LangChain runtime types | Keep LangChain usage isolated behind the server embedding adapter. [VERIFIED: packages/server/src/lib/embeddings.ts] [VERIFIED: AGENTS.md] |
| TypeScript | Repo pin `^5.9.3`; npm latest `6.0.2` published 2026-03-23 [VERIFIED: package.json] [VERIFIED: npm registry] | Internal type boundaries across store, pipeline, and adapters | Phase 8 needs strong internal contracts for normalized docs and index state, but does not need a toolchain upgrade to deliver that. [VERIFIED: package.json] [ASSUMED: Phase 8 should avoid simultaneous TS 6 migration] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | Repo pin `^3.2.4`; npm latest `4.1.4` published 2026-04-09 [VERIFIED: package.json] [VERIFIED: npm registry] | Index lifecycle unit and workflow tests | Use for pipeline idempotency, adapter behavior, and approval/update/deactivate workflow coverage. [VERIFIED: vitest.workspace.ts] [VERIFIED: packages/server/package.json] |
| Existing server store | Internal JSON file store [VERIFIED: packages/server/src/config.ts] [VERIFIED: packages/server/src/lib/store.ts] | Phase 8 persistence for index state and reconciliation metadata | Use because the current server persists all domain state through `JsonStore`; introducing a second persistence layer would expand scope beyond this phase. [VERIFIED: packages/server/src/app.ts] [ASSUMED: JSON persistence remains acceptable for v1.1 indexing metadata] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Internal lifecycle trigger + reconciliation | A durable external queue or job runner [ASSUMED] | More resilient at scale, but unjustified in the current single-process JSON-store server. [VERIFIED: packages/server/src/lib/store.ts] [ASSUMED: Phase 8 scale does not require queue infrastructure] |
| Internal keyword adapter over normalized tokens | A full-text engine library such as MiniSearch [ASSUMED] | Could reduce custom token logic, but the repository already has deterministic tokenization and scoring that can be materialized first with less scope risk. [VERIFIED: packages/server/src/lib/retrieval/recall/keyword.ts] |

**Installation:** No new package is required to plan the minimum Phase 8 architecture. [VERIFIED: packages/server/package.json] [ASSUMED: index persistence can be implemented with current dependencies]

## Architecture Patterns

### Recommended Project Structure

```text
packages/server/src/lib/indexing/
├── pipeline.ts           # syncKnowledgeIndex / reconcileIndexes orchestration
├── normalize.ts          # canonical searchable document + content hash
├── events.ts             # trigger mapping from lifecycle transitions
├── types.ts              # normalized doc, adapter, sync result, index state
└── adapters/
    ├── vector.ts         # lifecycle-managed embedding index
    └── keyword.ts        # lifecycle-managed token/inverted representation
```

The indexing package should live under `packages/server/src/lib/` because Phase 8 is server-internal infrastructure and must not leak into contracts or CLI packages. [VERIFIED: AGENTS.md] [VERIFIED: packages/server/src/lib/retrieval] [ASSUMED: mirroring the retrieval module layout will minimize planner and reviewer friction]

### Pattern 1: Trigger From Business-State Mutations, Not From Retrieval

**What:** Index sync should start from the same mutation points that already own lifecycle transitions: reviewer approval, privileged update/resubmit, and deactivate. [VERIFIED: packages/server/src/routes/review.ts] [VERIFIED: packages/server/src/routes/knowledge.ts] [VERIFIED: packages/server/src/routes/operations.ts]

**When to use:** Any operation that changes `lifecycleState`, `latestRevision`, or searchable fields (`shortcut`, `detail`, `labels`). [VERIFIED: packages/server/src/lib/knowledge.ts] [VERIFIED: packages/server/src/lib/store.ts]

**Example:**

```ts
// Source: repository pattern derived from review/update/deactivate flows
await store.transact((data) => {
  // mutate knowledge state and append lifecycle event first
});

await syncKnowledgeIndex(services, entryId);
```

The planning implication is that lifecycle writes remain authoritative, while index sync is a derived step that must be retryable. [VERIFIED: packages/server/src/lib/store.ts] [ASSUMED: post-transaction sync is the simplest safe shape in the current store]

### Pattern 2: Normalize Once, Fan Out To Adapters

**What:** `normalize.ts` should produce one canonical `NormalizedIndexDocument` containing stable identity, revision, lifecycle state, canonical text, labels, scope, team, required level, tokens, and a content hash. [VERIFIED: packages/server/src/lib/store.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/keyword.ts] [ASSUMED: these fields are sufficient for both Phase 8 adapters]

**When to use:** Every adapter operation, including upsert, remove, and reconciliation comparisons. [ASSUMED]

**Example:**

```ts
// Source: recommended Phase 8 normalization contract
type NormalizedIndexDocument = {
  entryId: string;
  revision: number;
  lifecycleState: string;
  text: string;
  labels: string[];
  tokens: string[];
  scope: 'global' | 'project';
  teamId: string | null;
  requiredLevel: number;
  contentHash: string;
};
```

This keeps vector and keyword adapters consistent without letting each adapter invent its own hashing or token rules. [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/keyword.ts] [ASSUMED: duplicated normalization logic would drift]

### Pattern 3: Idempotent Adapter Contract

**What:** Both adapters should implement the same verbs: `upsert(doc)`, `remove(entryId)`, and optionally `hasFreshState(doc)` or `getState(entryId)` if reconciliation needs inspection. [ASSUMED]

**When to use:** Any lifecycle-driven sync and every reconciliation pass. [ASSUMED]

**Example:**

```ts
// Source: recommended Phase 8 internal contract
interface IndexAdapter {
  name: 'vector' | 'keyword';
  upsert(doc: NormalizedIndexDocument): Promise<void>;
  remove(entryId: string): Promise<void>;
}
```

The important planning rule is idempotency: a repeated approval or retry must not create duplicate keyword postings or stale vector state. [VERIFIED: .planning/ROADMAP.md] [ASSUMED: idempotent upsert/remove is sufficient for this phase]

### Pattern 4: Reconciliation As A First-Class Safety Valve

**What:** Add `reconcileIndexes()` that scans all knowledge entries, recomputes desired index state from current lifecycle and revision, and repairs drift. [ASSUMED]

**When to use:** On startup, in tests, and in any manual/admin maintenance path added later. [ASSUMED]

**Example:**

```ts
// Source: recommended Phase 8 repair loop
for (const entry of data.knowledgeEntries) {
  await syncKnowledgeIndex(services, entry.id);
}
```

This compensates for the current architecture's lack of a durable outbox or background worker. [VERIFIED: packages/server/src/lib/store.ts] [ASSUMED: reconciliation is necessary because post-commit sync can fail after state is already written]

### Anti-Patterns to Avoid

- **Indexing inside `searchKnowledge`:** That would preserve query-time recomputation and violate the phase goal. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
- **Embedding cache as the whole indexing model:** `embeddingCache` only covers vectors and says nothing about keyword materialization or sync status. [VERIFIED: packages/server/src/lib/store.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts]
- **Using route payloads directly inside adapters:** Adapters should consume normalized internal documents, not Fastify request shapes. [VERIFIED: packages/server/src/routes/review.ts] [VERIFIED: packages/server/src/routes/knowledge.ts] [ASSUMED: route-coupled adapters would be brittle]
- **Treating `updatedAt` as the sync version:** `history.length` and content hashing are more reliable for searchable-content freshness than generic timestamps. [VERIFIED: packages/server/src/lib/knowledge.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts]

## Don’t Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Embedding API surface | A new bespoke vector-provider abstraction with its own batch semantics | Extend the existing embeddings boundary and align it with LangChain `embedQuery` / `embedDocuments`. [VERIFIED: packages/server/src/lib/embeddings.ts] [CITED: https://docs.langchain.com/oss/javascript/integrations/text_embedding/openai] | The repository already has one embedding seam; Phase 8 should strengthen it, not fork it. [VERIFIED: packages/server/src/lib/embeddings.ts] |
| Authorization in adapters | Per-adapter approval/team/level checks | Reuse retrieval filtering and index only approved lifecycle state. [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/knowledge.ts] | Business boundaries already belong to the server lifecycle and retrieval filters. [VERIFIED: AGENTS.md] [VERIFIED: .planning/REQUIREMENTS.md] |
| Event sourcing infrastructure | A full broker/outbox subsystem for this phase [ASSUMED] | Use current mutation points plus reconciliation metadata in the existing store. [VERIFIED: packages/server/src/lib/store.ts] [ASSUMED: current scale does not justify external jobs] | Phase 8 needs consistency more than infrastructure expansion. [ASSUMED] |
| Query-time tokenization for approved corpus | Re-tokenizing every eligible entry on every hybrid query | Persist normalized tokens or a keyword posting structure as keyword adapter state. [VERIFIED: packages/server/src/lib/retrieval/recall/keyword.ts] [VERIFIED: .planning/ROADMAP.md] | This is the direct mechanism for reducing query-time compute. [VERIFIED: .planning/ROADMAP.md] |

**Key insight:** Phase 8 should hand-roll only the project-specific lifecycle orchestration and normalized document contract; it should not hand-roll a second embedding stack, a second auth path, or a premature queue system. [VERIFIED: packages/server/src/lib/embeddings.ts] [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/store.ts] [ASSUMED: this is the right scope boundary]

## Common Pitfalls

### Pitfall 1: Approval State And Index State Diverge

**What goes wrong:** An entry becomes `approved`, but the vector or keyword index is stale or missing, so search under-recalls approved content. [VERIFIED: packages/server/src/lib/knowledge.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/keyword.ts]

**Why it happens:** State mutation and index mutation are separate steps in the current architecture, and there is no reconciliation loop yet. [VERIFIED: packages/server/src/lib/store.ts] [VERIFIED: packages/server/src/routes/review.ts] [ASSUMED: post-commit failures are plausible]

**How to avoid:** Persist enough sync metadata to detect freshness and add reconciliation that recomputes desired state from current lifecycle and revision. [ASSUMED]

**Warning signs:** Tests pass for approval workflow but approved entries still miss in hybrid or semantic retrieval until a later query warm-up. [VERIFIED: packages/server/src/lib/retrieval-workflow.test.ts] [ASSUMED: missing lifecycle-triggered sync would create this symptom]

### Pitfall 2: Refresh Logic Misses Content-Changing Updates

**What goes wrong:** `shortcut`, `detail`, or `labels` change, but index state remains built from the previous revision. [VERIFIED: packages/server/src/lib/knowledge.ts]

**Why it happens:** Update and resubmit flows already create new revisions, but current index writes are not wired to them. [VERIFIED: packages/server/src/routes/knowledge.ts] [VERIFIED: packages/server/src/lib/knowledge.ts] [VERIFIED: `rg -n "updateEntryEmbeddingCache\\(" packages/server/src -g '!**/dist/**'` on 2026-04-14]

**How to avoid:** Define freshness by normalized content hash plus revision, not by existence of any prior cache. [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts] [ASSUMED: the same rule should drive keyword freshness]

**Warning signs:** Search still returns outdated wording after an entry revision is visible through `GET /v1/knowledge/:entryId`. [VERIFIED: packages/server/src/routes/knowledge.ts] [ASSUMED]

### Pitfall 3: Keyword Adapter Reintroduces Business Logic Drift

**What goes wrong:** The keyword index starts storing or serving entries that should be invisible because lifecycle or team boundaries were interpreted differently from retrieval. [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/retrieval/assembly.ts]

**Why it happens:** It is tempting to make keyword indexing "smart" about scopes or visibility. [ASSUMED]

**How to avoid:** Keep adapters dumb about caller authorization and make desired index presence depend only on lifecycle sync rules. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]

**Warning signs:** Retrieval and direct adapter-state assertions disagree on whether a deactivated or rejected entry should still exist in the index. [VERIFIED: packages/server/src/lib/knowledge.ts] [ASSUMED]

### Pitfall 4: Batching And API Shape Drift In Embedding Code

**What goes wrong:** Phase 8 hardcodes current local constructor options and misses the newer LangChain/OpenAI embeddings API shape or misses batch indexing opportunities. [VERIFIED: packages/server/src/lib/embeddings.ts] [CITED: https://docs.langchain.com/oss/javascript/integrations/text_embedding/openai]

**Why it happens:** Local code currently constructs `OpenAIEmbeddings` with `modelName` and `openAIApiKey`, while current docs show `model`, `apiKey`, and batch-oriented methods. [VERIFIED: packages/server/src/lib/embeddings.ts] [CITED: https://docs.langchain.com/oss/javascript/integrations/text_embedding/openai]

**How to avoid:** Keep Phase 8 vector indexing behind one adapter boundary so the embedding implementation can be updated without changing lifecycle orchestration. [VERIFIED: packages/server/src/lib/embeddings.ts] [ASSUMED]

**Warning signs:** Vector indexing code duplicates constructor config or calls single-document embedding in loops where document batching is possible. [CITED: https://docs.langchain.com/oss/javascript/integrations/text_embedding/openai] [ASSUMED]

## Code Examples

Verified patterns from current code and official docs:

### Lifecycle Trigger Skeleton

```ts
// Source: packages/server/src/routes/review.ts + packages/server/src/lib/knowledge.ts
const reviewedEntry = await app.skillShareer.store.transact((data) => {
  // applyReviewDecision(...) mutates lifecycle to approved/rejected
});

await syncKnowledgeIndex(app.skillShareer, reviewedEntry.id);
```

The current code already exposes the right mutation seam; Phase 8 should attach index sync after the state write completes. [VERIFIED: packages/server/src/routes/review.ts] [VERIFIED: packages/server/src/lib/knowledge.ts] [ASSUMED: sync should run after transaction commit]

### Batch-Capable Embedding Pattern

```ts
// Source: official LangChain JS OpenAI embeddings docs
const embeddings = new OpenAIEmbeddings({ model: 'text-embedding-3-small', apiKey: process.env.OPENAI_API_KEY });
const vectors = await embeddings.embedDocuments(['doc one', 'doc two']);
const queryVector = await embeddings.embedQuery('query');
```

LangChain documents separate document and query embedding methods, which is a better fit for lifecycle indexing than reusing only a single-text helper. [CITED: https://docs.langchain.com/oss/javascript/integrations/text_embedding/openai]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Query path computes or backfills index state opportunistically | Lifecycle-driven upsert/remove with periodic reconciliation [ASSUMED] | Current modern RAG systems generally separate ingestion/indexing from retrieval-time ranking; this repo has not completed that split yet. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [ASSUMED] | Phase 8 should move compute off the hot query path. [VERIFIED: .planning/ROADMAP.md] |
| Single-text embedding helper only | Explicit query/document embedding methods in LangChain docs [CITED: https://docs.langchain.com/oss/javascript/integrations/text_embedding/openai] | Current docs as of 2026-04-14 [VERIFIED: system date] | Vector adapter planning should allow batching and document-mode indexing. [CITED: https://docs.langchain.com/oss/javascript/integrations/text_embedding/openai] |

**Deprecated/outdated:**

- Treating `updateEntryEmbeddingCache` as sufficient Phase 8 coverage is outdated because it only manages vector cache state and is not wired into any production lifecycle trigger. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: `rg -n "updateEntryEmbeddingCache\\(" packages/server/src -g '!**/dist/**'` on 2026-04-14]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 8 can stay on the current JSON-store architecture without an external queue. | Summary / Standard Stack | Planner may under-scope operational reliability work. |
| A2 | One normalized document contract is the best seam for both vector and keyword adapters. | Phase Requirements / Architecture Patterns | Planner may need extra refactoring if adapters need divergent source material. |
| A3 | Reconciliation can remain internal and does not need a public admin endpoint in this phase. | Summary / Architecture Patterns | Recovery from drift may be harder to operate manually. |
| A4 | Idempotent `upsert/remove` is sufficient adapter API surface for Phase 8. | Architecture Patterns | Planner may miss needed inspection/status methods. |
| A5 | Phase 8 should avoid simultaneous TypeScript or dependency upgrades. | Standard Stack | Planner may miss a necessary compatibility fix if current pins block implementation. |
| A6 | JSON persistence remains acceptable for v1.1 index metadata. | Standard Stack | Planner may under-estimate persistence complexity if index data grows quickly. |
| A7 | Reconciliation is necessary because post-commit sync can fail after state is already written. | Architecture Patterns / Pitfalls | Planner may add unnecessary repair complexity if sync is made transactionally atomic another way. |
| A8 | Current scale does not justify external jobs or queue infrastructure. | Don’t Hand-Roll | Planner may under-provision if lifecycle sync volume is higher than expected. |

## Open Questions

1. **Should Phase 8 persist full keyword postings or only pre-tokenized fields?** [VERIFIED: packages/server/src/lib/retrieval/recall/keyword.ts]
   What we know: The current keyword recall logic tokenizes `shortcut`, `detail`, and `labels` on every query. [VERIFIED: packages/server/src/lib/retrieval/recall/keyword.ts]
   What's unclear: The requirements say "关键词索引 adapter" but do not specify whether that means an inverted index or a cheaper token cache. [VERIFIED: .planning/REQUIREMENTS.md]
   Recommendation: Plan the adapter contract so implementation can start with persisted normalized tokens and upgrade to postings if needed without changing the pipeline API. [ASSUMED]

2. **Should approved privileged updates remain immediately searchable without re-review?** [VERIFIED: packages/server/src/routes/knowledge.ts] [VERIFIED: packages/server/src/lib/knowledge.ts]
   What we know: `PATCH /v1/knowledge/:entryId` creates a new revision and keeps current lifecycle state; it does not force re-review. [VERIFIED: packages/server/src/lib/knowledge.ts]
   What's unclear: Whether product intent wants updated approved content searchable immediately or wants future tightening. [ASSUMED]
   Recommendation: Plan Phase 8 to mirror current business rules exactly and index whatever the current lifecycle semantics say is approved. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]

3. **Where should index sync metadata live?** [VERIFIED: packages/server/src/lib/store.ts]
   What we know: `KnowledgeRecord` already owns vector cache and lifecycle history, but no generic index sync state. [VERIFIED: packages/server/src/lib/store.ts]
   What's unclear: Whether planner should add generic per-entry metadata, adapter-specific metadata, or a separate index records collection. [ASSUMED]
   Recommendation: Prefer generic per-entry sync metadata plus adapter-owned payloads, because it keeps reconciliation local to the indexed entity. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server code, tests, indexing pipeline | ✓ [VERIFIED: local command] | `v20.19.5` [VERIFIED: `node --version` on 2026-04-14] | — |
| `pnpm` | Workspace test/typecheck commands | ✓ [VERIFIED: local command] | `10.33.0` [VERIFIED: `pnpm --version` on 2026-04-14] | `npm` for registry inspection only; not recommended for workspace execution. [VERIFIED: `npm --version` on 2026-04-14] [ASSUMED] |
| OpenAI API key | Live embedding provider in vector adapter | ✗ [VERIFIED: `OPENAI_API_KEY=absent` on 2026-04-14] | — | Deterministic fallback embeddings already exist for local/CI. [VERIFIED: packages/server/src/lib/embeddings.ts] |

**Missing dependencies with no fallback:** None for planning. [VERIFIED: local environment audit]

**Missing dependencies with fallback:** Live embedding credentials are absent, but the repository already falls back to deterministic vectors for local and CI use. [VERIFIED: packages/server/src/lib/embeddings.ts]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest workspace; repo pin `^3.2.4` [VERIFIED: package.json] [VERIFIED: vitest.workspace.ts] |
| Config file | `vitest.workspace.ts` [VERIFIED: vitest.workspace.ts] |
| Quick run command | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/operations.test.ts` [VERIFIED: packages/server/package.json] [VERIFIED: command run on 2026-04-14] |
| Full suite command | `pnpm test` [VERIFIED: package.json] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IDX-01 | Pipeline syncs one entry across adapters from one normalized doc | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/pipeline.test.ts` | ❌ Wave 0 [VERIFIED: no such file in current repo] |
| IDX-02 | Normalization is deterministic and content-hash based | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/normalize.test.ts` | ❌ Wave 0 [VERIFIED: no such file in current repo] |
| IDX-03 | Events map approval/update/deactivate transitions to index actions | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/events.test.ts` | ❌ Wave 0 [VERIFIED: no such file in current repo] |
| IDX-04 | Approval automatically builds index state | workflow/integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval-workflow.test.ts src/lib/indexing/pipeline.test.ts` | ◑ Extend existing + add new [VERIFIED: packages/server/src/lib/retrieval-workflow.test.ts] |
| IDX-05 | Update refreshes index state | workflow/integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/lib/indexing/pipeline.test.ts` | ❌ New targeted coverage [VERIFIED: packages/server/src/routes/operations.test.ts lacks Phase 8 assertions] |
| IDX-06 | Deactivate removes index state | workflow/integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts src/lib/indexing/pipeline.test.ts` | ◑ Extend existing + add new [VERIFIED: packages/server/src/routes/operations.test.ts] |
| IDX-07 | Vector adapter writes fresh vector state and skips stale rewrites | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/vector.test.ts` | ❌ Wave 0 [VERIFIED: no such file in current repo] |
| IDX-08 | Keyword adapter writes keyword state and removes it on deactivation | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/keyword.test.ts` | ❌ Wave 0 [VERIFIED: no such file in current repo] |

### Sampling Rate

- **Per task commit:** Run the targeted server indexing and workflow tests for the touched area. [VERIFIED: packages/server/package.json] [ASSUMED: planner should split tasks so each has a focused test set]
- **Per wave merge:** Run the Phase 8 server suite plus `pnpm test` if shared retrieval behavior changes. [VERIFIED: package.json] [ASSUMED]
- **Phase gate:** Full suite green and no Phase 8 regression in approval/update/deactivate workflows before `/gsd-verify-work`. [VERIFIED: .planning/config.json]

### Wave 0 Gaps

- [ ] `packages/server/src/lib/indexing/pipeline.test.ts` — pipeline orchestration, idempotency, reconciliation. [VERIFIED: file missing]
- [ ] `packages/server/src/lib/indexing/normalize.test.ts` — canonical text/tokens/hash behavior. [VERIFIED: file missing]
- [ ] `packages/server/src/lib/indexing/events.test.ts` — lifecycle trigger mapping. [VERIFIED: file missing]
- [ ] `packages/server/src/lib/indexing/adapters/vector.test.ts` — vector adapter freshness/removal. [VERIFIED: file missing]
- [ ] `packages/server/src/lib/indexing/adapters/keyword.test.ts` — keyword adapter upsert/remove semantics. [VERIFIED: file missing]
- [ ] Extend `packages/server/src/lib/retrieval-workflow.test.ts` to assert approval-triggered index build, not only search visibility. [VERIFIED: packages/server/src/lib/retrieval-workflow.test.ts]
- [ ] Extend `packages/server/src/routes/operations.test.ts` to assert deactivation/update index side effects. [VERIFIED: packages/server/src/routes/operations.test.ts]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: Phase 8 does not change login/session flows] | Existing auth routes unchanged. [VERIFIED: packages/server/src/app.ts] |
| V3 Session Management | no [VERIFIED: Phase 8 target area is indexing, not sessions] | Existing session resolution unchanged. [VERIFIED: packages/server/src/lib/session.ts] |
| V4 Access Control | yes [VERIFIED: search visibility still depends on approval/team/level checks] | Keep authorization in retrieval filters and business routes, not in adapters. [VERIFIED: packages/server/src/lib/retrieval/filters.ts] |
| V5 Input Validation | yes [VERIFIED: route payloads still enter through Zod-validated contracts] | Continue using existing Zod request parsing at route boundaries. [VERIFIED: packages/server/src/routes/review.ts] [VERIFIED: packages/server/src/routes/knowledge.ts] [VERIFIED: packages/server/src/routes/operations.ts] |
| V6 Cryptography | yes [VERIFIED: vector embeddings and content hashes are used] | Reuse SHA-256 hashing for content freshness and existing embeddings provider boundary; never hand-roll cryptographic primitives beyond current `createHash` usage. [VERIFIED: packages/server/src/lib/embeddings.ts] [VERIFIED: packages/server/src/lib/store.ts] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale approved index serving outdated content | Tampering | Content hash + revision freshness checks, plus reconciliation. [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts] [ASSUMED: same rule should govern all adapters] |
| Deactivated content remains in keyword/vector index | Information Disclosure | Lifecycle-triggered remove and deactivation workflow tests. [VERIFIED: packages/server/src/routes/operations.ts] [ASSUMED] |
| Cross-team or unapproved content enters index via adapter-local logic | Elevation of Privilege | Keep adapters authorization-agnostic and derive desired presence from lifecycle state only. [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [ASSUMED] |
| Replayed lifecycle sync duplicates adapter state | Denial of Service / Tampering | Make `upsert/remove` idempotent by `entryId` and content hash. [ASSUMED] |

## Sources

### Primary (HIGH confidence)

- `.planning/ROADMAP.md` — Phase 8 goal, plan breakdown, and success criteria. [VERIFIED: local file]
- `.planning/REQUIREMENTS.md` — `IDX-01`..`IDX-08` and boundary requirements. [VERIFIED: local file]
- `AGENTS.md` — project architecture, boundary, and workflow constraints. [VERIFIED: local file]
- `packages/server/src/lib/store.ts` — current persistence model, lifecycle record shape, and `embeddingCache`. [VERIFIED: local file]
- `packages/server/src/lib/knowledge.ts` — approval/update lifecycle mutations. [VERIFIED: local file]
- `packages/server/src/routes/review.ts` — approval entry point. [VERIFIED: local file]
- `packages/server/src/routes/knowledge.ts` — update/resubmit entry points. [VERIFIED: local file]
- `packages/server/src/routes/operations.ts` — deactivate entry point. [VERIFIED: local file]
- `packages/server/src/lib/retrieval/orchestrator.ts` — current retrieval flow and unused `updateEntryEmbeddingCache`. [VERIFIED: local file]
- `packages/server/src/lib/retrieval/recall/semantic.ts` — current vector cache read path. [VERIFIED: local file]
- `packages/server/src/lib/retrieval/recall/keyword.ts` — current query-time lexical tokenization. [VERIFIED: local file]
- `packages/contracts/src/domain/retrieval.ts` — public retrieval contract. [VERIFIED: local file]
- `package.json`, `packages/server/package.json`, `packages/contracts/package.json`, `vitest.workspace.ts` — toolchain and test infrastructure. [VERIFIED: local files]
- `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/operations.test.ts` run on 2026-04-14 — current server baseline passes. [VERIFIED: local command]
- `pnpm typecheck` run on 2026-04-14 — current workspace has pre-existing type errors outside Phase 8 files. [VERIFIED: local command]
- npm registry queries on 2026-04-14 for `fastify`, `zod`, `@langchain/core`, `@langchain/openai`, `vitest`, `typescript`, `commander` — latest versions and publish dates. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- Fastify Decorators reference — current service-registration guidance. [CITED: https://fastify.dev/docs/latest/Reference/Decorators/]
- LangChain JS OpenAI embeddings docs — current `OpenAIEmbeddings`, `embedDocuments`, `embedQuery`, and constructor examples. [CITED: https://docs.langchain.com/oss/javascript/integrations/text_embedding/openai]
- OpenAI embeddings guide — current official embeddings product guidance. [CITED: https://platform.openai.com/docs/guides/embeddings]

### Tertiary (LOW confidence)

- None. [VERIFIED: this research does not rely on standalone unverified web sources]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - repository pins and npm registry current versions were checked directly. [VERIFIED: package.json] [VERIFIED: npm registry]
- Architecture: MEDIUM - event boundaries are directly verified in code, but the recommended reconciliation and adapter contract are still design recommendations. [VERIFIED: packages/server/src/routes/review.ts] [VERIFIED: packages/server/src/routes/knowledge.ts] [VERIFIED: packages/server/src/routes/operations.ts] [ASSUMED: recommended internal contract]
- Pitfalls: MEDIUM - most pitfalls are grounded in verified current gaps, but failure-mode severity is partly inferred from the architecture. [VERIFIED: packages/server/src/lib/store.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [ASSUMED: likely drift scenarios]

**Research date:** 2026-04-14 [VERIFIED: system date]  
**Valid until:** 2026-05-14 for repository-local architecture; refresh npm/doc citations sooner if Phase 8 slips materially. [ASSUMED]
