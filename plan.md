# Canonical Label Catalog and Semantic Merge Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a canonical label catalog plus LLM-assisted label alignment so semantically equivalent labels such as `timeout-issue` and `pod-timeout` resolve to one canonical label before graph persistence, retrieval, and later backfill/reindex workflows.

**Architecture:** Keep the existing raw graph extraction path, but split canonicalization into a second explicit stage. The implementation sequence is: persist a canonical label catalog, recall top-k candidate labels from that catalog, pass the compact label table to an LLM alignment prompt, rewrite graph nodes/edges to canonical IDs, then add backfill and repair flows that reuse the same alignment path instead of inventing a second merge algorithm.

**Tech Stack:** TypeScript, Zod, Drizzle/PostgreSQL, pgvector (384d), Fastify server internals, existing `ChatProvider` prompt system, Vitest, graph-extraction / dedup / ingestion eval runners.

---

## Audit Baseline

- [x] Audit completed: the previous plan document existed, but none of the canonical-label implementation was present in code.
- [x] Baseline confirmed: there is no `packages/server/src/lib/labels/` module yet.
- [x] Baseline confirmed: `AiPromptTaskType` does not include `label-alignment`.
- [x] Baseline confirmed: `GraphNodeRecord` has no `rawLabel`, `canonicalLabelId`, or `alignmentDecision`.
- [x] Baseline confirmed: `package.json` has no `backfill:labels` or `label-merge:repair` scripts.

## Execution Rules

- [ ] Do not mark a phase complete until its code, docs, and tests/evals have all landed.
- [ ] Do not start Phase 3 until Phase 1 and Phase 2 verification commands pass.
- [ ] Do not start Phase 4 until Phase 3 graph integration tests pass.
- [ ] Do not enable auto-merge by default until Phase 5 eval gates pass.
- [ ] If a phase lands partially, leave its phase checkbox unchecked and add the missing items here before moving on.

## File Structure

- `packages/server/src/lib/persistence/schema/labels.ts`
  Canonical label catalog tables, alias table, embedding table, alignment event table.
- `packages/server/src/lib/labels/repository.ts`
  Server truth-source repository for create/find/merge/event operations.
- `packages/server/src/lib/labels/candidate-recall.ts`
  Exact/normalized/semantic candidate recall for top-k label selection.
- `packages/server/src/lib/labels/llm-align.ts`
  LLM prompt orchestration and strict response parsing for `existing | new | unsure`.
- `packages/server/src/lib/labels/backfill.ts`
  Historical seeding and replay into the new catalog.
- `packages/server/src/lib/labels/merge-repair.ts`
  Repair/reindex path after manual or automatic label merges.
- `packages/server/src/lib/indexing/graph-lite/llm-extract.ts`
  Raw extraction plus post-extraction label alignment insertion point.
- `packages/server/src/lib/indexing/graph-lite/documents.ts`
  Durable graph node/edge/document shape; must store canonical metadata.
- `packages/server/src/lib/indexing/adapters/graph.ts`
  Trap-side graph adapter that must persist canonicalized graph docs.
- `packages/server/src/lib/indexing/skill-events.ts`
  Skill-side graph builder that must use the same canonicalization path.
- `evals/graph-extraction/*`
  Canonical-label fixtures, metrics, and smoke gates.
- `docs/architecture/components/INGESTION.md`
  Ingestion lane update showing label table recall and alignment.
- `docs/architecture/components/INDEXING.md`
  Indexing insertion point and graph persistence behavior.
- `docs/reference/DATA_MODEL.md`
  Canonical label schema and relationships to existing `knowledge_labels` / artifact `labels`.
- `docs/operations/TESTING.md`
  Operator commands and eval gates for backfill and repair.

## Proposed Runtime Flow

```text
candidate/knowledge/artifact text
  -> existing graph-extraction prompt
  -> raw labels/nodes/edges
  -> label catalog candidate recall
     -> exact alias hit
     -> normalized slug hit
     -> embedding top-k hit
  -> label-alignment prompt
     -> input: raw label + evidence + candidate label table
     -> output: existing | new | unsure
  -> canonical rewrite
     -> existing: attach canonicalLabelId and merge
     -> new: create canonical label + alias
     -> unsure: persist reviewable event, do not auto-hard-merge
  -> persist graph/index documents
  -> backfill/reindex historical rows with the same pipeline
```

## Phase 1: Add the canonical label catalog and repository

- [ ] **Phase 1 complete**

**Files:**
- Create: `packages/server/src/lib/persistence/schema/labels.ts`
- Modify: `packages/server/src/lib/persistence/schema/index.ts`
- Modify: `packages/server/src/lib/persistence/schema/knowledge.ts`
- Modify: `packages/server/src/lib/persistence/schema/artifacts.ts`
- Create: `packages/server/src/lib/persistence/__tests__/schema-label-catalog.test.ts`
- Create: `packages/server/src/lib/labels/repository.ts`
- Create: `packages/server/src/lib/labels/repository.test.ts`

**Execution steps:**
- [ ] Add `canonical_labels`, `label_aliases`, `canonical_label_embeddings`, and `label_alignment_events` tables with lifecycle/status fields and merge lineage.
- [ ] Export the new tables from `packages/server/src/lib/persistence/schema/index.ts`.
- [ ] Keep `knowledge_labels` and artifact `labels` as source-facing metadata; do not remove them in this phase.
- [ ] Implement a repository with methods for:
  `findCanonicalById()`, `findCanonicalByAlias()`, `upsertCanonicalLabel()`, `upsertAlias()`, `searchCandidates()`, `recordAlignmentEvent()`, `mergeCanonicalLabels()`.
- [ ] Ensure merge is reversible at the data level by using `status` + `merged_into_label_id`, not destructive deletes.
- [ ] Add schema and repository tests before proceeding.

**Completion standard:**
- [ ] A developer can create one canonical label, attach aliases, fetch by alias, and record an alignment event without touching graph extraction code.
- [ ] The schema clearly separates canonical names, observed aliases, embeddings, and event history.
- [ ] No table or repository API assumes that a raw source label is already canonical.

**Document updates in this phase:**
- [ ] Update `docs/reference/DATA_MODEL.md` with the new label catalog tables and how they relate to `knowledge_labels`, artifact labels, and `graph_index_documents`.
- [ ] Update `docs/architecture/components/INDEXING.md` to establish `canonical_labels` as the merge truth source.

**Tests / eval updates in this phase:**
- [ ] Add `packages/server/src/lib/persistence/__tests__/schema-label-catalog.test.ts`.
- [ ] Add `packages/server/src/lib/labels/repository.test.ts`.
- [ ] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/persistence/__tests__/schema-label-catalog.test.ts \
  packages/server/src/lib/labels/repository.test.ts
```

**Example structure:**
```ts
export interface CanonicalLabelRecord {
  id: string;
  kind: 'cue' | 'tool' | 'environment' | 'prerequisite' | 'mitigation';
  canonicalName: string;
  normalizedName: string;
  definition: string | null;
  status: 'active' | 'merged' | 'disabled';
  mergedIntoLabelId: string | null;
}

export interface LabelAliasRecord {
  alias: string;
  normalizedAlias: string;
  canonicalLabelId: string;
  source: 'manual' | 'llm' | 'backfill';
  confidence: number;
}
```

## Phase 2: Add candidate recall and the `label-alignment` LLM contract

- [ ] **Phase 2 complete**

**Files:**
- Modify: `packages/contracts/src/domain/graph-extraction.ts`
- Modify: `packages/contracts/src/domain/graph-extraction.test.ts`
- Modify: `packages/server/src/lib/ai/providers/types.ts`
- Modify: `packages/server/src/lib/ai/prompts.ts`
- Modify: `docs/reference/system-prompt-slots.default.json`
- Create: `packages/server/src/lib/labels/candidate-recall.ts`
- Create: `packages/server/src/lib/labels/candidate-recall.test.ts`
- Create: `packages/server/src/lib/labels/llm-align.ts`
- Create: `packages/server/src/lib/labels/llm-align.test.ts`

**Execution steps:**
- [ ] Add a new prompt task type `label-alignment` in `AiPromptTaskType`.
- [ ] Add prompt builder support in `packages/server/src/lib/ai/prompts.ts` for `label-alignment`.
- [ ] Extend `packages/contracts/src/domain/graph-extraction.ts` with strict schemas for:
  `LabelAlignmentCandidate`, `LabelAlignmentDecision`, and any helper response payloads.
- [ ] Build candidate recall with deterministic top-k fusion order:
  exact alias -> normalized name -> embedding similarity.
- [ ] Limit prompt inputs to a compact candidate table (recommended max 5, hard max 8).
- [ ] Implement strict parser/validator that only accepts:
  `existing | new | unsure`, optional `canonicalLabelId`, optional `canonicalName`, `confidence`, and short `reasoning`.
- [ ] Add unit tests for recall ranking, parse failure, invalid outputs, and `unsure`.

**Completion standard:**
- [ ] Given `pod-timeout`, candidate recall can surface `timeout-issue` when it already exists in the catalog.
- [ ] The alignment prompt never receives the entire catalog; it only receives curated candidates.
- [ ] The alignment response is Zod-validated and cannot silently fall back to raw text.

**Document updates in this phase:**
- [ ] Update `docs/architecture/components/INGESTION.md` to show the new `candidate recall -> label-alignment` lane.
- [ ] Update `docs/architecture/HYBRID_GRAPH_EXTRACTION.md` to document the two-step extraction pattern: raw extraction first, canonical alignment second.

**Tests / eval updates in this phase:**
- [ ] Extend `packages/contracts/src/domain/graph-extraction.test.ts`.
- [ ] Add `packages/server/src/lib/labels/candidate-recall.test.ts`.
- [ ] Add `packages/server/src/lib/labels/llm-align.test.ts`.
- [ ] Run:
```bash
rtk pnpm test -- --run \
  packages/contracts/src/domain/graph-extraction.test.ts \
  packages/server/src/lib/labels/candidate-recall.test.ts \
  packages/server/src/lib/labels/llm-align.test.ts
```

**Example structure:**
```ts
export interface LabelAlignmentCandidate {
  id: string;
  canonicalName: string;
  definition: string | null;
  aliases: string[];
  recallReason: 'exact-alias' | 'normalized-name' | 'semantic-embedding';
}

export interface LabelAlignmentDecision {
  rawLabel: string;
  rawEvidence: string;
  decision: 'existing' | 'new' | 'unsure';
  canonicalLabelId?: string;
  canonicalName?: string;
  confidence: number;
  reasoning: string;
}
```

**Example prompt payload:**
```json
{
  "rawLabel": "pod-timeout",
  "rawEvidence": "pod restarts after startup timeout in Kubernetes",
  "candidates": [
    {
      "id": "lbl_timeout_issue",
      "canonicalName": "timeout-issue",
      "definition": "startup or health-check timeout that aborts workload readiness",
      "aliases": ["container-timeout", "startup-timeout"]
    }
  ]
}
```

## Phase 3: Integrate canonical alignment into graph extraction and persistence

- [ ] **Phase 3 complete**

**Files:**
- Modify: `packages/server/src/lib/indexing/graph-lite/llm-extract.ts`
- Modify: `packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts`
- Modify: `packages/server/src/lib/indexing/graph-lite/documents.ts`
- Modify: `packages/server/src/lib/indexing/graph-lite/documents.test.ts`
- Modify: `packages/server/src/lib/indexing/adapters/graph.ts`
- Modify: `packages/server/src/lib/indexing/adapters/graph.test.ts`
- Modify: `packages/server/src/lib/indexing/adapters/graph-builders.ts`
- Modify: `packages/server/src/lib/indexing/adapters/graph-builders.test.ts`
- Modify: `packages/server/src/lib/indexing/skill-events.ts`
- Modify: `packages/server/src/lib/retrieval/recall/graph-assisted.ts`
- Modify: `packages/server/src/lib/retrieval/recall/graph-assisted.test.ts`

**Execution steps:**
- [ ] Add a post-extraction alignment step in `llm-extract.ts` after `mergeExtractions()` and before node ID generation.
- [ ] Pass raw node labels plus evidence into the new label alignment service.
- [ ] Rewrite node IDs and edge endpoints to canonical IDs when the decision is `existing`.
- [ ] Create new canonical label rows and aliases when the decision is `new`.
- [ ] Persist `rawLabel`, `canonicalLabelId`, and `alignmentDecision` on graph nodes.
- [ ] Keep `unsure` safe: record an alignment event, keep the raw label, and avoid forced merge.
- [ ] Change segment-level dedupe to prefer `canonicalLabelId` when present; only fall back to `normalizeValue(label)` when no canonical decision exists.
- [ ] Ensure both trap-side and skill-side graph building use the same canonicalization logic.

**Completion standard:**
- [ ] Two source texts that extract `timeout-issue` and `pod-timeout` produce one canonical graph node when the catalog and alignment decision agree.
- [ ] Graph documents remain deterministic for the same canonical decisions.
- [ ] Fallback mode still works when chat or embeddings are unavailable; it must skip canonical merge rather than corrupt graph state.

**Document updates in this phase:**
- [ ] Update `docs/architecture/components/INDEXING.md` with the exact insertion point inside `graph-lite/llm-extract.ts`.
- [ ] Update `docs/architecture/GRAPH_RETRIEVAL.md` if query-time graph traversal starts preferring `canonicalLabelId` over raw `label`.

**Tests / eval updates in this phase:**
- [ ] Add integration tests that mock extraction plus alignment and assert one canonical node is persisted.
- [ ] Add regression tests for false positives where similar labels must remain separate.
- [ ] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts \
  packages/server/src/lib/indexing/graph-lite/documents.test.ts \
  packages/server/src/lib/indexing/adapters/graph.test.ts \
  packages/server/src/lib/indexing/adapters/graph-builders.test.ts \
  packages/server/src/lib/retrieval/recall/graph-assisted.test.ts
```

**Example structure:**
```ts
export interface GraphNodeRecord {
  id: string;
  kind: GraphNodeKind;
  label: string;
  evidence: string;
  rawLabel?: string;
  canonicalLabelId?: string;
  alignmentDecision?: 'existing' | 'new' | 'unsure';
}
```

**Example merge rule:**
```ts
const mergeKey = node.canonicalLabelId
  ? `${node.kind}:${node.canonicalLabelId}`
  : `${node.kind}:${normalizeValue(node.label)}`;
```

## Phase 4: Add historical backfill and safe merge-repair tooling

- [ ] **Phase 4 complete**

**Files:**
- Create: `packages/server/src/lib/labels/backfill.ts`
- Create: `packages/server/src/lib/labels/backfill.test.ts`
- Create: `packages/server/src/lib/labels/merge-repair.ts`
- Create: `packages/server/src/lib/labels/merge-repair.test.ts`
- Modify: `packages/server/src/lib/persistence/backfill-indexes.ts`
- Modify: `package.json`
- Modify: `docs/operations/TESTING.md`

**Execution steps:**
- [ ] Add a backfill runner that reads `knowledge_labels`, artifact `labels`, and historical `graph_index_documents.nodes[*]`.
- [ ] Seed the canonical catalog and aliases from historical data.
- [ ] Reuse the same candidate recall and alignment pipeline from Phase 2; do not add a second semantic merge implementation.
- [ ] Add a safe threshold for auto-merge; low-confidence matches become `unsure`.
- [ ] Reindex affected graph documents after a canonical merge or repair.
- [ ] Add root scripts:
  `pnpm backfill:labels`
  `pnpm label-merge:repair`
  with `--dry-run` support.
- [ ] Add unit tests for seed-from-history, rerun idempotency, and merge repair.

**Completion standard:**
- [ ] Historical duplicates can be replayed into the new catalog without manual SQL edits.
- [ ] Re-running backfill does not duplicate aliases or events.
- [ ] Operators can see what was auto-merged, what was unresolved, and what graph docs were reindexed.

**Document updates in this phase:**
- [ ] Update `docs/operations/TESTING.md` with backfill, dry-run, and repair commands.
- [ ] Update `docs/reference/DATA_MODEL.md` with merge lifecycle fields and event history semantics.

**Tests / eval updates in this phase:**
- [ ] Add `packages/server/src/lib/labels/backfill.test.ts`.
- [ ] Add `packages/server/src/lib/labels/merge-repair.test.ts`.
- [ ] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/labels/backfill.test.ts \
  packages/server/src/lib/labels/merge-repair.test.ts
```
- [ ] Run:
```bash
rtk pnpm backfill:labels -- --dry-run
```

**Example structure:**
```ts
export interface LabelMergeRepairReport {
  examined: number;
  autoMerged: number;
  unresolved: number;
  reindexedDocuments: number;
  warnings: string[];
}
```

**Example backfill flow:**
```text
historical labels
  -> seed canonical rows
  -> seed aliases
  -> recall candidates
  -> llm align
  -> merge / unresolved event
  -> reindex affected graph docs
```

## Phase 5: Close with docs, eval fixtures, and rollout gates

- [ ] **Phase 5 complete**

**Files:**
- Modify: `evals/graph-extraction/fixtures.ts`
- Modify: `evals/graph-extraction/fixtures-real.ts`
- Modify: `evals/graph-extraction/run.ts`
- Modify: `evals/graph-extraction/run.test.ts`
- Modify: `evals/graph-extraction/dedup-eval.ts`
- Modify: `evals/graph-extraction/dedup-fixtures-real.ts`
- Modify: `evals/graph-extraction/README.md`
- Modify: `docs/architecture/components/INGESTION.md`
- Modify: `docs/architecture/components/INDEXING.md`
- Modify: `docs/reference/DATA_MODEL.md`
- Modify: `docs/operations/TESTING.md`

**Execution steps:**
- [ ] Add fixtures where different raw labels must resolve to one canonical label, including:
  `timeout-issue` vs `pod-timeout`,
  multilingual alias cases,
  near-miss false-positive controls.
- [ ] Extend graph-extraction reporting with canonical-label metrics or, at minimum:
  alignment hit rate, `new` rate, and `unsure` rate.
- [ ] Extend dedup eval fixtures so the same semantic trap can be judged as canonical-label-equivalent even when raw titles differ.
- [ ] Update docs with rollout gates and degraded-run troubleshooting.
- [ ] Verify that all prior phase docs reflect the final implementation rather than the intended design.

**Completion standard:**
- [ ] The repo has automated proof that canonical alignment improves synonym handling without unacceptable false merges.
- [ ] The docs state exactly where the label table is supplied to the LLM and how fallback mode behaves.
- [ ] Operators have one documented command set for smoke validation after deploy.

**Document updates in this phase:**
- [ ] Update `docs/architecture/components/INGESTION.md`.
- [ ] Update `docs/architecture/components/INDEXING.md`.
- [ ] Update `docs/reference/DATA_MODEL.md`.
- [ ] Update `docs/operations/TESTING.md`.
- [ ] Update `evals/graph-extraction/README.md`.

**Tests / eval updates in this phase:**
- [ ] Run:
```bash
rtk pnpm test -- --run \
  evals/graph-extraction/run.test.ts \
  packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts \
  packages/server/src/lib/candidates/llm-dedup.test.ts
```
- [ ] Run:
```bash
rtk pnpm eval:graph-extraction:smoke
```
- [ ] Run:
```bash
rtk pnpm eval:dedup:dry-run
```
- [ ] If chat is configured, run:
```bash
rtk pnpm eval:graph-extraction --smoke
```
- [ ] If the live run degrades to fallback, leave this phase incomplete and document the degraded reason.

**Example fixture:**
```ts
{
  id: 'canonical-cue-timeout-issue-vs-pod-timeout',
  input: 'Kubernetes pods fail readiness because the pod startup timeout is too short.',
  expectedNodes: [
    { kind: 'cue', label: 'timeout-issue' }
  ],
  expectedEdges: [
    { source: 'kubernetes', target: 'timeout-issue', type: 'co-occurs-with', strength: 'soft' }
  ]
}
```

## Final Acceptance Criteria

- [ ] `packages/server/src/lib/persistence/schema/labels.ts` exists and is covered by tests.
- [ ] `packages/server/src/lib/labels/` exists with repository, candidate recall, alignment, backfill, and repair modules.
- [ ] `AiPromptTaskType` includes `label-alignment`, and the prompt path is wired.
- [ ] Graph merge happens by canonical label identity when available, not only by raw label string.
- [ ] Backfill and repair scripts exist in `package.json` and are documented.
- [ ] Canonical-label fixtures and eval gates exist and pass.
- [ ] Every phase checkbox above is checked only after its verification commands have been run successfully.
