# Phase 9: 图辅助检索 - Research

**Researched:** 2026-04-15 [VERIFIED: system date]  
**Domain:** Lightweight graph-assisted retrieval layered onto the existing hybrid retrieval and lifecycle indexing architecture [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`]  
**Confidence:** MEDIUM [VERIFIED: current codebase, prior phase artifacts, npm registry, and official LangChain docs were reviewed] [ASSUMED: deterministic extraction from existing knowledge fields is sufficient to satisfy Phase 9 without requiring model-based extraction in the first iteration]

<user_constraints>
## User Constraints

- Must address `GRAPH-01` through `GRAPH-07`. [VERIFIED: `.planning/REQUIREMENTS.md`]  
- There is no `CONTEXT.md` for this phase, so planning must use the requirements, roadmap, Phase 6-8 artifacts, and the current codebase only. [VERIFIED: user prompt] [VERIFIED: `.planning/phases/09-图辅助检索` contains no `*-CONTEXT.md`]  
- Research must focus on lightweight entity extraction using existing knowledge record fields, lightweight graph storage without a heavy graph database, relationship-assisted expansion/recall composed with the current semantic/hybrid architecture, preserving response contracts unless Phase 9 explicitly requires otherwise, and repo-appropriate testing/validation. [VERIFIED: user prompt]  
- `## Validation Architecture` must be included so downstream validation artifacts can be generated. [VERIFIED: user prompt] [VERIFIED: `.planning/config.json` has `workflow.nyquist_validation: true`]  
- Heavy graph platforms are out of scope for v1.1. [VERIFIED: `.planning/REQUIREMENTS.md`]  
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRAPH-01 | 创建实体图 adapter (`indexing/adapters/graph.ts`) [VERIFIED: `.planning/REQUIREMENTS.md`] | Extend the Phase 8 indexing pipeline with a third adapter kind, `graph`, rather than creating a separate indexing path. [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] [VERIFIED: `packages/server/src/lib/indexing/types.ts`] |
| GRAPH-02 | 创建图辅助召回模块 (`retrieval/recall/graph-assisted.ts`) [VERIFIED: `.planning/REQUIREMENTS.md`] | Implement graph recall as an internal recall channel that feeds the existing merge/rerank/assembly pipeline. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/lib/retrieval/merge.ts`] [VERIFIED: `packages/server/src/lib/retrieval/rerank.ts`] |
| GRAPH-03 | 实现高价值实体抽取 (`service`, `tool`, `symptom`, `root-cause`, `fix`, `environment`) [VERIFIED: `.planning/REQUIREMENTS.md`] | Use deterministic extraction over `shortcut`, `detail`, `labels`, and normalized tokens first; make any model-assisted extraction optional and best-effort only. [VERIFIED: `packages/server/src/lib/indexing/normalize.ts`] [VERIFIED: `packages/server/src/lib/pre-review.ts`] [CITED: https://docs.langchain.com/oss/javascript/langchain/structured-output] |
| GRAPH-04 | 实现实体扩展查询 [VERIFIED: `.planning/REQUIREMENTS.md`] | Extract entities from the query, resolve to stored graph nodes, then expand one hop to related entities and supporting entries. [VERIFIED: user prompt] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [ASSUMED] |
| GRAPH-05 | 实现关系辅助召回 [VERIFIED: `.planning/REQUIREMENTS.md`] | Score graph candidates from entity overlap plus relation strength, then merge them with semantic/hybrid candidates instead of replacing them. [VERIFIED: `packages/server/src/lib/retrieval/merge.ts`] [VERIFIED: `packages/server/src/lib/retrieval/rerank.ts`] [ASSUMED] |
| GRAPH-06 | 支持图辅助查询模式 (`graph-assisted`) [VERIFIED: `.planning/REQUIREMENTS.md`] | Replace the current 501 placeholder for `mode: 'graph-assisted'` with `hybrid baseline + graph expansion`, keeping `semantic` as the default mode. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] |
| GRAPH-07 | 创建轻量图索引存储（非重型知识图谱平台） [VERIFIED: `.planning/REQUIREMENTS.md`] | Persist graph nodes/edges in the existing JSON store and track graph sync state through `KnowledgeRecord.indexState`, rather than introducing Neo4j or another external graph system. [VERIFIED: `packages/server/src/lib/store.ts`] [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED] |
</phase_requirements>

## Summary

Phase 9 should be planned as an extension of the Phase 7 and Phase 8 seams, not as a new retrieval subsystem. The public contract already reserves `mode: 'graph-assisted'`, but the current server still throws a 501 for that mode, while the response schema remains fixed to `globalConstraints`, `projectKnowledge`, and `refinementSummary`. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] That means Phase 9 should keep graph evidence internal and feed it into the existing internal candidate pipeline instead of adding new response fields; Phase 10 is the planned phase for richer citation/channel metadata. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/server/src/lib/retrieval/merge.ts`] [VERIFIED: `packages/server/src/lib/retrieval/rerank.ts`]

The cleanest design is: normalize approved knowledge once through the Phase 8 indexing pipeline, extract a bounded set of typed entities plus simple typed relations into a lightweight store-backed graph index, then use that graph only as a recall booster over the already-safe candidate set. [VERIFIED: `packages/server/src/lib/indexing/normalize.ts`] [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] [VERIFIED: `packages/server/src/lib/retrieval/filters.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] The graph should support one-hop entity expansion and relation-assisted entry lookup, not arbitrary graph querying. [VERIFIED: `.planning/REQUIREMENTS.md`] [ASSUMED]

The current codebase also has baseline debt that planning must absorb explicitly: `indexing/adapters/vector.test.ts` and `indexing/adapters/keyword.test.ts` reference missing implementation files, and `pnpm --filter @skill-shareer/server exec tsc --noEmit` currently fails in retrieval/indexing-adjacent tests. [VERIFIED: `rg --files packages/server/src/lib/indexing` run on 2026-04-15] [VERIFIED: `pnpm --filter @skill-shareer/server exec tsc --noEmit` run on 2026-04-15] [VERIFIED: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts src/lib/indexing/pipeline.test.ts src/lib/indexing/normalize.test.ts` run on 2026-04-15]

**Primary recommendation:** Implement `graph-assisted` as `hybrid + bounded graph expansion` on top of a deterministic, lifecycle-indexed JSON graph store; do not add a graph database and do not change the retrieval response contract in Phase 9. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [ASSUMED]

## Project Constraints (from AGENTS.md)

- Keep the monorepo separation between CLI, server, and shared contracts. [VERIFIED: `AGENTS.md`]  
- Keep the CLI as an imperative contract-driven client; retrieval behavior changes must remain server-side. [VERIFIED: `AGENTS.md`]  
- Keep retrieval text-only in v1.x. [VERIFIED: `AGENTS.md`]  
- Keep access control server-side and preserve approval, permission, and team filtering before retrieval work. [VERIFIED: `AGENTS.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`]  
- No repo `CLAUDE.md` exists, so there are no additional CLAUDE-specific constraints to copy into this phase. [VERIFIED: `test -f ./CLAUDE.md` run on 2026-04-15]  

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `20.19.5` installed locally [VERIFIED: local env] | Runtime for server indexing and retrieval code [VERIFIED: `package.json`] | The repo already runs on Node and Phase 9 does not require another runtime. [VERIFIED: `AGENTS.md`] |
| TypeScript | workspace `5.9.3`; npm current `6.0.2` published `2026-03-23` [VERIFIED: `package.json`] [VERIFIED: npm registry] | Implement graph adapter, graph recall, and tests [VERIFIED: current repo layout] | Phase 9 should stay in the existing TS monorepo and shared-type workflow. [VERIFIED: `AGENTS.md`] |
| Zod | workspace `4.3.6`/`4.1.12`; npm current `4.3.6` published `2026-01-22` [VERIFIED: `packages/server/package.json`] [VERIFIED: `packages/contracts/package.json`] [VERIFIED: npm registry] | Keep request/response contracts authoritative [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] | The graph mode is already exposed through contracts; Phase 9 should not fork request/response typing elsewhere. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] |
| Internal indexing pipeline | in-repo [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] | Lifecycle-driven graph index synchronization [VERIFIED: `.planning/REQUIREMENTS.md`] | Phase 8 already established normalization plus adapter fan-out, which is the right seam for graph indexing. [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] [VERIFIED: `packages/server/src/lib/indexing/types.ts`] |
| Internal `JsonStore` | in-repo [VERIFIED: `packages/server/src/lib/store.ts`] | Lightweight durable graph storage without external infrastructure [VERIFIED: `.planning/REQUIREMENTS.md`] | The repo already persists all domain state in JSON; extending that is lower-risk than introducing a graph service mid-milestone. [VERIFIED: `packages/server/src/lib/store.ts`] [ASSUMED] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@langchain/openai` | workspace `1.4.4`; npm current `1.4.4` published `2026-04-10` [VERIFIED: `packages/server/package.json`] [VERIFIED: npm registry] | Optional model-assisted structured extraction if later enabled [CITED: https://docs.langchain.com/oss/javascript/integrations/chat/openai] | Use only behind an optional branch when `OPENAI_API_KEY` is present; do not make Phase 9 depend on it. [VERIFIED: local env shows `OPENAI_API_KEY=missing`] [ASSUMED] |
| `@langchain/core` | workspace `1.1.39`; npm current `1.1.40` published `2026-04-15` [VERIFIED: `packages/server/package.json`] [VERIFIED: npm registry] | Existing LangChain primitives already used in pre-review flows [VERIFIED: `packages/server/src/lib/pre-review.ts`] | Reuse only if a structured-extraction fallback is added; otherwise deterministic extraction is simpler. [VERIFIED: `packages/server/src/lib/pre-review.ts`] [ASSUMED] |
| Vitest | workspace `3.2.4`; npm current `4.1.4` published `2026-04-09` [VERIFIED: `package.json`] [VERIFIED: npm registry] | Unit, workflow, and route validation [VERIFIED: current test suite] | Existing test runner for retrieval and indexing phases. [VERIFIED: `package.json`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending the in-repo JSON store with graph records [VERIFIED: `packages/server/src/lib/store.ts`] | Neo4j or another graph platform [VERIFIED: `.planning/REQUIREMENTS.md` out-of-scope heavy graph platform] | External graph infra violates the intended lightweight scope and adds operational complexity the repo does not currently have. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| Deterministic field-based entity extraction [VERIFIED: current available fields in `packages/server/src/lib/indexing/normalize.ts`] | LLM-only extraction [CITED: https://docs.langchain.com/oss/javascript/langchain/structured-output] | LLM-only extraction is heavier, requires provider config, and is not available in the current local environment by default. [VERIFIED: local env shows `OPENAI_API_KEY=missing`] |
| Graph-assisted mode as a superset of hybrid recall [VERIFIED: current hybrid seam in `packages/server/src/lib/retrieval/orchestrator.ts`] | Graph-only retrieval path [ASSUMED] | Graph-only retrieval would discard Phase 7 ranking work and would be more likely to miss direct lexical/semantic matches. [VERIFIED: `packages/server/src/lib/retrieval/merge.ts`] [VERIFIED: `packages/server/src/lib/retrieval/rerank.ts`] [ASSUMED] |

**Installation:**  
```bash
# No new package is required for the recommended Phase 9 design.
# Optional structured extraction can use already-installed @langchain/core and @langchain/openai.
```

## Architecture Patterns

### Recommended Project Structure
```text
packages/server/src/lib/
├── indexing/
│   ├── adapters/
│   │   └── graph.ts          # graph sync/remove over the normalized document
│   ├── graph/
│   │   ├── extract.ts        # deterministic entity + relation extraction
│   │   └── types.ts          # entity, edge, and entry-reference records
│   └── types.ts              # extend adapter kinds and graph sync state
└── retrieval/
    ├── recall/
    │   └── graph-assisted.ts # query entity extraction + one-hop graph recall
    ├── merge.ts              # extend internal channels to include graph
    ├── rerank.ts             # add graph evidence weighting
    └── orchestrator.ts       # replace graph-assisted 501 with actual pipeline
```

### Pattern 1: Deterministic Extraction First
**What:** Extract typed entities and simple relations from `shortcut`, `detail`, `labels`, and normalized tokens using bounded heuristics. [VERIFIED: `packages/server/src/lib/indexing/normalize.ts`] [VERIFIED: `packages/server/src/lib/pre-review.ts`]  
**When to use:** Use this as the default Phase 9 extractor because it works in CI and local development with no provider keys. [VERIFIED: local env shows `OPENAI_API_KEY=missing`] [ASSUMED]  
**Recommended typed outputs:**  
- `service`: stable service/product/runtime names such as APIs, databases, frameworks, runtimes, or internal service identifiers found in labels or capitalized/package-like phrases. [ASSUMED]  
- `tool`: CLI, library, framework, package, or operational tool names such as `pnpm`, `tsc`, `pgBouncer`, `Vitest`. [VERIFIED: repo terminology in `AGENTS.md`, `package.json`, and tests] [ASSUMED]  
- `symptom`: error/problem phrases, especially clauses with `error`, `fail`, `timeout`, `crash`, `cannot`, `undefined`, `leak`, `bypass`. [VERIFIED: current knowledge/test vocabulary in `packages/server/src/lib/retrieval.test.ts`] [ASSUMED]  
- `root-cause`: clauses introduced by `because`, `caused by`, `due to`, `root cause`. [VERIFIED: `packages/server/src/lib/pre-review.ts`] [ASSUMED]  
- `fix`: remediation clauses introduced by `fix`, `use`, `enable`, `set`, `add`, `configure`, `validate`. [VERIFIED: `packages/server/src/lib/pre-review.ts`] [ASSUMED]  
- `environment`: OS/runtime/version/team-context markers such as Node versions, package versions, CI/local, or project-only context phrases. [VERIFIED: repo already stores `teamId`, `scope`, `requiredLevel`, package/runtime versions] [ASSUMED]  

### Pattern 2: Top-Level Graph Index with Entry References
**What:** Store a global graph index in `StoreData` and keep per-entry graph sync status in `KnowledgeRecord.indexState.graph`. [VERIFIED: current `StoreData` and `KnowledgeRecord.indexState` live in `packages/server/src/lib/store.ts`] [ASSUMED]  
**When to use:** Use this when graph queries must traverse across entries, dedupe node identities, and support remove/update by entry revision. [ASSUMED]  
**Recommended shape:**  
- `graphEntities`: deduped node records keyed by `(type, normalizedValue)` with aliases and supporting `entryRefs`. [ASSUMED]  
- `graphEdges`: typed relations such as `mentions`, `causes`, `fixed-by`, `observed-in`, `uses-tool`, `runs-in`, each carrying supporting `entryRefs` and a bounded weight/count. [ASSUMED]  
- `entryGraphArtifacts`: optional per-entry extracted entities/edges for fast remove/refresh bookkeeping if not derivable from node refs alone. [ASSUMED]  

### Pattern 3: Graph-Assisted Recall as Another Internal Channel
**What:** `graph-assisted` should execute `filter eligible entries -> baseline hybrid retrieval -> query entity extraction -> graph expansion -> internal merge/rerank -> existing assembly`. [VERIFIED: existing filter/merge/rerank/assembly seams in `packages/server/src/lib/retrieval/orchestrator.ts`, `merge.ts`, `rerank.ts`, `assembly.ts`] [ASSUMED]  
**When to use:** Use only for `mode: 'graph-assisted'`; keep `semantic` default behavior unchanged. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`]  
**Scoring guidance:**  
- Base graph candidate score on exact query-entity hit, relation type, support count, and whether the candidate entry was directly linked or reached through a neighbor entity. [ASSUMED]  
- Keep graph expansion bounded to one hop and cap candidate fan-out before merge. [ASSUMED]  
- Resolve final entry visibility only against the already filtered eligible set, never directly from raw graph refs. [VERIFIED: security order in `packages/server/src/lib/retrieval/orchestrator.ts`] [ASSUMED]  

### Anti-Patterns to Avoid
- **Do not create a separate graph retrieval path that bypasses `filterEligibleEntries(...)`.** That would violate the required approval/permission ordering. [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`]  
- **Do not store graph evidence only inside `RetrievalMatch.reason`.** The public response contract is not the right place for internal graph metadata in Phase 9. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`]  
- **Do not introduce arbitrary-depth graph traversal.** One-hop expansion is enough for the stated goal of surfacing hidden but related knowledge. [VERIFIED: user prompt success criteria] [ASSUMED]  
- **Do not make model-based extraction mandatory.** Current local execution does not have an OpenAI key, and the repo already uses deterministic fallbacks for embeddings. [VERIFIED: local env] [VERIFIED: `packages/server/src/lib/embeddings.ts`]  

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph storage | A full graph database integration [VERIFIED: `.planning/REQUIREMENTS.md`] | JSON-store-backed node/edge records with entry refs [VERIFIED: `packages/server/src/lib/store.ts`] [ASSUMED] | Phase 9 explicitly excludes heavy graph platforms. [VERIFIED: `.planning/REQUIREMENTS.md`] |
| Query expansion | Unbounded BFS or custom graph query language [ASSUMED] | One-hop entity expansion plus weighted relation lookup [ASSUMED] | Bounded traversal is easier to reason about, test, and keep safe. [ASSUMED] |
| Extraction | Free-form regex soup duplicated across index and query code [ASSUMED] | One shared extractor module reused by graph adapter and query parser [ASSUMED] | Shared extraction logic keeps entity normalization consistent across indexing and retrieval. [ASSUMED] |
| Contract changes | New retrieval response fields for graph evidence in Phase 9 [VERIFIED: `.planning/ROADMAP.md`] | Keep graph evidence internal until Phase 10 citation work [VERIFIED: `.planning/ROADMAP.md`] | Prevents scope bleed into the planned citations phase. [VERIFIED: `.planning/ROADMAP.md`] |

**Key insight:** Phase 9 is not “add a graph product.” It is “add one more indexed recall channel using typed entities and relations, while preserving the Phase 6-8 business and architecture boundaries.” [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/REQUIREMENTS.md`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`]

## Common Pitfalls

### Pitfall 1: Hard-Coding `vector` and `keyword` Everywhere
**What goes wrong:** The graph adapter cannot be indexed, removed, or reconciled consistently because the current Phase 8 types and pipeline state are still specialized to `vector` and `keyword`. [VERIFIED: `packages/server/src/lib/indexing/types.ts`] [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] [VERIFIED: `packages/server/src/lib/store.ts`]  
**Why it happens:** `IndexAdapter.kind`, `KnowledgeIndexStateRecord`, and `initializeIndexState(...)` currently only know about two adapter kinds. [VERIFIED: `packages/server/src/lib/indexing/types.ts`] [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`]  
**How to avoid:** Generalize the adapter kind union and persisted state before adding `graph.ts`; otherwise Phase 9 will create a special-case path that Phase 8 was meant to avoid. [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] [ASSUMED]  
**Warning signs:** Graph indexing code appears outside `indexing/pipeline.ts`, or removal/reconciliation ignores graph artifacts. [ASSUMED]  

### Pitfall 2: Over-Extracting Generic Nouns
**What goes wrong:** The graph becomes noisy, and graph-assisted mode starts recalling vaguely related entries that hurt ranking quality. [ASSUMED]  
**Why it happens:** `shortcut` and `detail` contain many generic engineering nouns that are not useful graph pivots. [VERIFIED: current test and knowledge wording in `packages/server/src/lib/retrieval.test.ts`] [ASSUMED]  
**How to avoid:** Require type-specific evidence, minimum token lengths, stopword filtering, and bounded alias normalization; prefer precision over coverage in the first version. [ASSUMED]  
**Warning signs:** Common tokens like `test`, `issue`, `system`, or `error` dominate graph hits across unrelated entries. [ASSUMED]  

### Pitfall 3: Using Raw Graph References as Authorization
**What goes wrong:** Cross-team or unapproved entries can leak if graph refs are treated as directly retrievable. [VERIFIED: required server-side boundary in `.planning/REQUIREMENTS.md`]  
**Why it happens:** Node and edge records naturally store `entryId` references, which can tempt shortcutting the eligible-entry filter. [ASSUMED]  
**How to avoid:** Always intersect graph-derived entry IDs with the already filtered `eligibleEntries` set before merge. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [ASSUMED]  
**Warning signs:** Graph recall module reads the full store snapshot and returns entries without taking an eligible-entry map as input. [ASSUMED]  

### Pitfall 4: Treating `graph-assisted` as Graph-Only
**What goes wrong:** Direct semantic or lexical matches can rank worse or disappear because the graph stage replaces, rather than augments, the hybrid baseline. [VERIFIED: current hybrid pipeline in `packages/server/src/lib/retrieval/orchestrator.ts`] [ASSUMED]  
**Why it happens:** The mode name suggests a standalone pipeline, but the success criterion is assistance, not replacement. [VERIFIED: `.planning/ROADMAP.md`]  
**How to avoid:** Keep graph-assisted mode as `hybrid baseline + graph candidates + rerank`. [ASSUMED]  
**Warning signs:** `graph-assisted` code path skips `keywordRecall`, `mergeCandidates`, or `rerankCandidates`. [VERIFIED: current hybrid path exists in `packages/server/src/lib/retrieval/orchestrator.ts`] [ASSUMED]  

### Pitfall 5: Planning Against a Green Baseline That Does Not Exist
**What goes wrong:** The phase plan assumes clean adapter and typecheck baselines, but current retrieval/indexing tests already fail for unrelated reasons. [VERIFIED: local test/typecheck commands run on 2026-04-15]  
**Why it happens:** `indexing/adapters/vector.ts` and `keyword.ts` are missing even though tests reference them, and retrieval tests contain out-of-scope broken persisted-state cases. [VERIFIED: `rg --files packages/server/src/lib/indexing` run on 2026-04-15] [VERIFIED: local test/typecheck commands run on 2026-04-15]  
**How to avoid:** Reserve Wave 0 or the first plan for restoring a usable retrieval/indexing baseline before claiming Phase 9 completion. [ASSUMED]  
**Warning signs:** `pnpm --filter @skill-shareer/server exec tsc --noEmit` still fails after graph code lands, and failures are blamed on pre-existing files. [VERIFIED: local typecheck command run on 2026-04-15] [ASSUMED]  

## Code Examples

Verified patterns from current sources:

### Shared Canonical Index Document
```typescript
// Source: packages/server/src/lib/indexing/normalize.ts
export function normalizeKnowledgeIndexDocument(
  entry: KnowledgeRecord,
): NormalizedIndexDocument {
  const canonicalText = buildCanonicalText(entry);
  const tokens = buildTokens(canonicalText);
  const contentHash = buildContentHash(canonicalText);
  const normalizedAt = new Date().toISOString();

  return {
    entryId: entry.id,
    teamId: entry.teamId,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    lifecycleState: entry.lifecycleState,
    revision: entry.history.length,
    updatedAt: entry.updatedAt,
    shortcut: entry.shortcut,
    detail: entry.detail,
    labels: entry.labels,
    canonicalText,
    tokens,
    contentHash,
    normalizedAt,
  };
}
```

### Existing Retrieval Dispatch Seam
```typescript
// Source: packages/server/src/lib/retrieval/orchestrator.ts
switch (mode) {
  case 'semantic':
    return await semanticRecall(seed, eligibleEntries, parsed);
  case 'hybrid':
    return await hybridRecall(seed, eligibleEntries, parsed);
  case 'graph-assisted':
    throw new AppError(
      501,
      'mode_not_implemented',
      'Graph-assisted retrieval mode is not yet implemented. Use semantic or hybrid mode.',
    );
}
```

### Existing Heuristic Extraction Style
```typescript
// Source: packages/server/src/lib/pre-review.ts
const evidenceTerms = ['because', 'fix', 'root cause', 'verify', 'caused by', 'solution'];
```

### Optional Structured Output Direction
```typescript
// Source basis: official LangChain JS structured output docs
// Use only as an optional fallback, not a Phase 9 requirement.
const entitySchema = z.object({
  entities: z.array(z.object({
    type: z.enum(['service', 'tool', 'symptom', 'root-cause', 'fix', 'environment']),
    value: z.string(),
  })),
});
```
[CITED: https://docs.langchain.com/oss/javascript/langchain/structured-output]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `graph-assisted` exists only as a contract enum and orchestrator placeholder. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] | Phase 9 should turn it into an actual indexed recall channel. [VERIFIED: `.planning/ROADMAP.md`] | Planned for 2026-04-14 roadmap update. [VERIFIED: `.planning/ROADMAP.md`] | The public request surface is already reserved, so Phase 9 can stay contract-compatible. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] |
| Hybrid retrieval already merges and reranks internal channels. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] [VERIFIED: `packages/server/src/lib/retrieval/merge.ts`] [VERIFIED: `packages/server/src/lib/retrieval/rerank.ts`] | Graph should be added as another internal evidence channel rather than a separate response layer. [ASSUMED] | Phase 7 on 2026-04-14 established this seam. [VERIFIED: `.planning/phases/07-混合检索/07-RESEARCH.md`] | Reuses proven pipeline ordering and keeps output shape unchanged. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] |
| Index lifecycle is already centralized around normalization and adapter fan-out. [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] | Graph indexing should plug into that same lifecycle model. [ASSUMED] | Phase 8 on 2026-04-14. [VERIFIED: `.planning/phases/08-索引生命周期/08-RESEARCH.md`] | Approval/update/deactivate handling stays consistent across all retrieval artifacts. [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] |

**Deprecated/outdated:**  
- Planning graph-assisted retrieval as a query-time-only derivation from raw entry text is outdated relative to the Phase 8 lifecycle indexing direction. [VERIFIED: `.planning/ROADMAP.md`] [VERIFIED: `.planning/phases/08-索引生命周期/08-RESEARCH.md`]  
- Planning a graph database integration for this phase is explicitly out of scope. [VERIFIED: `.planning/REQUIREMENTS.md`]  

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Deterministic extraction from `shortcut`, `detail`, `labels`, and normalized tokens is enough for the first graph-assisted iteration. | Summary / Architecture Patterns | If false, Phase 9 may need optional or mandatory LLM extraction earlier than planned. |
| A2 | One-hop entity expansion is sufficient for “隐性相关知识” in this milestone. | Phase Requirements / Architecture Patterns | If false, recall quality may remain weak and require deeper traversal or different relation modeling. |
| A3 | A top-level JSON graph index plus per-entry graph sync state is the right persistence shape. | Phase Requirements / Architecture Patterns | If false, store mutations may become awkward or overly expensive. |
| A4 | Graph-assisted mode should be implemented as `hybrid + graph`, not graph-only. | Summary / Architecture Patterns | If false, the planner may over-couple Phase 9 to Phase 7 assumptions. |
| A5 | Baseline red tests/type errors should be treated as Wave 0 planning work for this phase or a prerequisite fix. | Summary / Validation Architecture | If false, the plan may include extra stabilization work that should instead be split into another phase. |

## Open Questions (RESOLVED)

1. **Where should the persisted graph live exactly?**  
   - What we know: `KnowledgeRecord.indexState` currently stores per-adapter sync state, but cross-entry traversal needs shared node/edge records. [VERIFIED: `packages/server/src/lib/store.ts`]  
   - What's unclear: whether the best shape is a top-level `StoreData.graphIndex` object, per-entry artifacts plus rebuild-time aggregation, or both. [ASSUMED]  
   - Resolution: Phase 9 planning will use a top-level `StoreData.graphIndex` for traversal plus per-entry graph sync state and optional extracted-artifact refs for fast remove/update. Plans 01-02 now assume that shape explicitly. [RESOLVED]

2. **Should model-assisted extraction be in scope at all for Phase 9?**  
   - What we know: official LangChain JS supports structured output patterns, but the local environment currently has no `OPENAI_API_KEY`. [CITED: https://docs.langchain.com/oss/javascript/langchain/structured-output] [VERIFIED: local env]  
   - What's unclear: whether the project wants Phase 9 to ship with deterministic extraction only or to include an optional provider-backed path. [ASSUMED]  
   - Resolution: deterministic extraction is the only required Phase 9 path; any model-assisted extraction is explicitly out of the required plan scope and non-blocking if considered later. [RESOLVED]

3. **How much baseline repair belongs inside this phase?**  
   - What we know: current server typecheck and retrieval/indexing tests are not green. [VERIFIED: local commands run on 2026-04-15]  
   - What's unclear: whether the planner should fold these into Phase 9 Wave 0 or open a prerequisite stabilization task outside the requirement scope. [ASSUMED]  
   - Resolution: baseline stabilization needed for trustworthy retrieval/indexing verification is in scope for this phase and is scheduled explicitly in Plans 01 and 04. [RESOLVED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server code, tests, tooling | ✓ [VERIFIED: local env] | `20.19.5` [VERIFIED: local env] | — |
| npm | Registry verification, package inspection | ✓ [VERIFIED: local env] | `10.8.2` [VERIFIED: local env] | — |
| pnpm | Workspace scripts/tests | ✓ [VERIFIED: local env] | `10.33.0` [VERIFIED: local env] | — |
| `node_modules` | Local test/typecheck execution | ✓ [VERIFIED: local env] | workspace installed [VERIFIED: local env] | — |
| OpenAI API key | Optional model-assisted extraction only [ASSUMED] | ✗ [VERIFIED: local env] | — | Use deterministic extraction only. [VERIFIED: `packages/server/src/lib/embeddings.ts`] [ASSUMED] |

**Missing dependencies with no fallback:**  
- None identified for the recommended deterministic Phase 9 design. [VERIFIED: local env + current repo dependencies]

**Missing dependencies with fallback:**  
- `OPENAI_API_KEY` is missing, so any optional structured-extraction path must degrade to deterministic heuristics. [VERIFIED: local env] [VERIFIED: `packages/server/src/lib/embeddings.ts`]  

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` in workspace; npm current `4.1.4` [VERIFIED: `package.json`] [VERIFIED: npm registry] |
| Config file | none detected; package scripts call `vitest run` directly [VERIFIED: `package.json`] [VERIFIED: `packages/server/package.json`] |
| Quick run command | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts src/lib/indexing/pipeline.test.ts src/lib/indexing/normalize.test.ts` [VERIFIED: `packages/server/package.json`] |
| Full suite command | `pnpm test` and `pnpm --filter @skill-shareer/server exec tsc --noEmit` [VERIFIED: `package.json`] [VERIFIED: `packages/server/package.json`] |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRAPH-01 | Graph adapter sync/remove plugs into lifecycle indexing | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/graph.test.ts src/lib/indexing/pipeline.test.ts` | ❌ Wave 0 |
| GRAPH-02 | Graph recall returns candidates through the internal retrieval pipeline | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/recall/graph-assisted.test.ts src/lib/retrieval.test.ts` | ❌ Wave 0 |
| GRAPH-03 | High-value entities are extracted deterministically from existing fields | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/graph/extract.test.ts` | ❌ Wave 0 |
| GRAPH-04 | Query entity expansion resolves related entities and supporting entries | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/recall/graph-assisted.test.ts` | ❌ Wave 0 |
| GRAPH-05 | Relationship-assisted recall improves hidden-related-hit coverage without bypassing safety | unit/integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts` | ✅ existing files, new cases needed |
| GRAPH-06 | `mode: 'graph-assisted'` works end to end and preserves response shape | route/workflow | `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts src/lib/retrieval-workflow.test.ts` | ✅ existing files, new cases needed |
| GRAPH-07 | Lightweight graph storage persists and refreshes/removes correctly | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/graph.test.ts src/lib/indexing/pipeline.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/routes/retrieval.test.ts src/lib/indexing/pipeline.test.ts` [VERIFIED: current repo scripts]  
- **Per wave merge:** `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts src/lib/indexing/pipeline.test.ts src/lib/indexing/normalize.test.ts` [VERIFIED: current repo test surface]  
- **Phase gate:** `pnpm test` and `pnpm --filter @skill-shareer/server exec tsc --noEmit` should be green, but they are not green today. [VERIFIED: local commands run on 2026-04-15]  

### Wave 0 Gaps
- [ ] `packages/server/src/lib/indexing/adapters/graph.test.ts` — covers GRAPH-01 and GRAPH-07. [ASSUMED]  
- [ ] `packages/server/src/lib/indexing/graph/extract.test.ts` — covers GRAPH-03. [ASSUMED]  
- [ ] `packages/server/src/lib/retrieval/recall/graph-assisted.test.ts` — covers GRAPH-02 and GRAPH-04. [ASSUMED]  
- [ ] Fix current server baseline: missing `packages/server/src/lib/indexing/adapters/vector.ts` and `keyword.ts` or equivalent test expectations. [VERIFIED: `rg --files packages/server/src/lib/indexing` run on 2026-04-15]  
- [ ] Fix current server baseline: persisted-index retrieval tests in `packages/server/src/lib/retrieval.test.ts` reference out-of-scope variables and currently fail. [VERIFIED: local test/typecheck commands run on 2026-04-15]  

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: Phase 9 changes are server-internal retrieval/indexing, not auth flows] | Existing session/auth routes remain unchanged. [VERIFIED: current route structure] |
| V3 Session Management | no [VERIFIED: Phase 9 does not alter session handling] | Existing session code remains unchanged. [VERIFIED: `packages/server/src/lib/session.ts`] |
| V4 Access Control | yes [VERIFIED: `.planning/REQUIREMENTS.md`] | Continue to use `filterEligibleEntries(...)` before any graph recall work. [VERIFIED: `packages/server/src/lib/retrieval/orchestrator.ts`] |
| V5 Input Validation | yes [VERIFIED: existing retrieval contract] | Keep `mode` and query payloads validated through shared Zod schemas. [VERIFIED: `packages/contracts/src/domain/retrieval.ts`] |
| V6 Cryptography | no [VERIFIED: Phase 9 does not introduce encryption features] | Use existing hashes only for content identity/change detection. [VERIFIED: `packages/server/src/lib/indexing/normalize.ts`] |

### Known Threat Patterns for This Stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Graph refs bypass eligible-entry filtering | Information Disclosure | Intersect graph-derived entry IDs with the already filtered eligible-entry map before merge. [VERIFIED: existing filter-first order] [ASSUMED] |
| Stale graph edges survive deactivation/update | Tampering | Route all graph sync/remove through lifecycle indexing and reconciliation. [VERIFIED: `packages/server/src/lib/indexing/pipeline.ts`] [ASSUMED] |
| Noisy entity extraction degrades ranking | Denial of Service / Quality degradation | Use bounded entity types, stopwords, one-hop traversal, and candidate caps. [ASSUMED] |
| Cross-team shared node contamination | Information Disclosure | Store raw refs, but only resolve candidate entries from the team-safe eligible-entry set. [VERIFIED: current team filter architecture] [ASSUMED] |

## Sources

### Primary (HIGH confidence)
- `.planning/REQUIREMENTS.md` - Phase 9 requirements, out-of-scope heavy graph platform, and boundary rules.  
- `.planning/ROADMAP.md` - Phase 9 goal, success criteria, and dependency on earlier retrieval/indexing phases.  
- `.planning/STATE.md` - Current milestone context and v1.1 decisions.  
- `.planning/phases/06-检索架构重构/06-RESEARCH.md` - Query-mode seam and contract-preserving design intent.  
- `.planning/phases/06-检索架构重构/06-03-PLAN.md` - Contract-first mode design constraints.  
- `.planning/phases/06-检索架构重构/06-03-SUMMARY.md` - Implemented `graph-assisted` mode placeholder seam.  
- `.planning/phases/07-混合检索/07-RESEARCH.md` - Hybrid merge/rerank design intent.  
- `.planning/phases/07-混合检索/07-02-PLAN.md` - Merge path details.  
- `.planning/phases/07-混合检索/07-03-PLAN.md` - Rerank and short-query validation details.  
- `.planning/phases/08-索引生命周期/08-RESEARCH.md` - Lifecycle indexing architecture and pitfalls.  
- `.planning/phases/08-索引生命周期/08-01-SUMMARY.md` - Persisted index state and normalization decisions.  
- `packages/contracts/src/domain/retrieval.ts` - Public mode/request/response contract.  
- `packages/server/src/lib/retrieval/orchestrator.ts` - Current filter -> dispatch -> assembly flow and `graph-assisted` 501 placeholder.  
- `packages/server/src/lib/retrieval/recall/semantic.ts` - Current semantic text and embedding behavior.  
- `packages/server/src/lib/retrieval/recall/keyword.ts` - Current lexical matching behavior.  
- `packages/server/src/lib/retrieval/merge.ts` - Current internal channel merge model.  
- `packages/server/src/lib/retrieval/rerank.ts` - Current deterministic rerank stage.  
- `packages/server/src/lib/indexing/normalize.ts` - Current canonical document shape.  
- `packages/server/src/lib/indexing/pipeline.ts` - Current lifecycle-driven index sync/remove flow.  
- `packages/server/src/lib/indexing/types.ts` - Current adapter and state model.  
- `packages/server/src/lib/store.ts` - Current persistence model and index state shape.  
- `packages/server/src/lib/pre-review.ts` - Existing heuristic extraction precedent.  
- `packages/server/src/routes/retrieval.test.ts` - Current route contract coverage for `graph-assisted` mode.  
- `https://docs.langchain.com/oss/javascript/langchain/structured-output` - Official structured output patterns for optional extraction.  
- `https://docs.langchain.com/oss/javascript/integrations/chat/openai` - Official `@langchain/openai` integration reference.  
- npm registry package metadata verified on 2026-04-15 for `@langchain/openai`, `@langchain/core`, `zod`, `fastify`, `vitest`, and `typescript`.  

### Secondary (MEDIUM confidence)
- Local environment commands on 2026-04-15: `node --version`, `npm --version`, `pnpm --version`, `pnpm --filter @skill-shareer/server exec tsc --noEmit`, and targeted server test runs.  

### Tertiary (LOW confidence)
- None beyond the assumptions explicitly listed in `## Assumptions Log`.  

## Metadata

**Confidence breakdown:**  
- Standard stack: HIGH - based on current repo manifests, npm registry checks, and existing in-repo architecture. [VERIFIED: package manifests] [VERIFIED: npm registry]  
- Architecture: MEDIUM - strongly constrained by current seams, but graph persistence shape and traversal depth still require implementation choices. [VERIFIED: current codebase] [ASSUMED]  
- Pitfalls: MEDIUM - several are directly evidenced by current code/test state, while ranking-noise risks remain heuristic. [VERIFIED: local baseline commands] [ASSUMED]  

**Research date:** 2026-04-15 [VERIFIED: system date]  
**Valid until:** 2026-05-15 for repo-local architecture facts; re-check npm versions and LangChain docs sooner if Phase 9 planning slips. [VERIFIED: npm registry is time-sensitive] [ASSUMED]  
