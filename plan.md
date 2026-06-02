# Duplicate Validation Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-scan duplicate validation with a layered pipeline: exact-match fingerprinting first, indexed PostgreSQL recall second, and narrow LLM/manual review only on the final candidate set.

**Architecture:** Keep `packages/server/src/lib/candidates/processor.ts` as the orchestration entry, but stop treating duplicate detection as one monolithic pass. The new path adds normalized candidate text builders, exact fingerprint lookup for traps and skills, trap+skill PostgreSQL recall, and queue-level deduplication so repeated submissions do not spawn duplicate processing work.

**Tech Stack:** TypeScript, Fastify, Drizzle, PostgreSQL, pgvector, Vitest, eval runners under `evals/graph-extraction/`.

---

## Archive Note

- [x] Previous root plan archived to `docs/archived/archived-plans/plan-2026-06-02-optional-graph-database-root-archived.md`
- [x] Active tracking file remains `plan.md`

## Execution Index

- [x] Phase 0: Freeze baseline and target architecture
- [ ] Phase 1: Add exact fingerprint duplicate lane
- [x] Phase 2: Normalize duplicate inputs and fix skill candidate text
- [ ] Phase 3: Extend PostgreSQL recall to cover both traps and skills
- [ ] Phase 4: Add queue dedupe and duplicate-path observability
- [ ] Phase 5: Align docs, tests, and eval thresholds for rollout

## File Structure

### Core implementation files

- `packages/server/src/lib/candidates/fingerprint.ts`
  - canonical normalization, fingerprinting, and shared duplicate input builders
- `packages/server/src/lib/candidates/types.ts`
  - duplicate input/output contracts, including normalized candidate text and exact-match metadata
- `packages/server/src/lib/candidates/processor.ts`
  - candidate orchestration, queue submission, detector selection
- `packages/server/src/lib/candidates/detector.ts`
  - in-memory fallback detector for JSON/file mode
- `packages/server/src/lib/candidates/pg-detector.ts`
  - PostgreSQL detector with exact lookup + trap/skill recall + top-K narrowing
- `packages/server/src/lib/queue/task-queue.ts`
  - task enqueue/dequeue semantics and dedupe guard use

### Persistence and index files

- `packages/server/src/lib/persistence/schema/knowledge.ts`
  - trap-side durable exact-match fields or lookup support
- `packages/server/src/lib/persistence/schema/artifacts.ts`
  - skill-side profile/capsule fields already used for exact and semantic matching
- `packages/server/drizzle/`
  - migration(s) for exact-match lookup columns or indexes if trap-side persistence changes

### Validation and truth-source files

- `packages/server/src/lib/candidates/*.test.ts`
  - unit and repository tests for duplicate pipeline behavior
- `packages/server/src/__tests__/candidate-pipeline.test.ts`
  - end-to-end candidate processing expectations
- `evals/graph-extraction/dedup-eval.ts`
  - duplicate eval runner
- `evals/graph-extraction/dedup-fixtures-real.ts`
  - real duplicate fixtures and thresholds
- `docs/architecture/components/INGESTION.md`
  - candidate ingestion and duplicate detection behavior
- `docs/operations/TESTING.md`
  - duplicate-path test and eval commands
- `docs/README.md`
  - active plan/doc index if duplicate strategy docs are added or promoted

## Example Target Shapes

### Shared normalized duplicate input

```ts
export interface NormalizedDuplicateInput {
  sourceType: 'trap' | 'skill';
  fingerprint: string;
  titleText: string;
  bodyText: string;
  keywordTerms: string[];
  tokenTerms: string[];
  exactLookupKey: string;
}
```

### Exact-first detector contract

```ts
export interface ExactDuplicateHit {
  entityType: 'trap' | 'skill';
  entityId: string;
  entityTitle: string;
  matchType: 'exact';
  similarityScore: 1;
}
```

### Queue enqueue contract

```ts
await queue.enqueue(
  CANDIDATE_PROCESSING_TASK_TYPE,
  { candidateId, retryCount: 0 },
  {
    maxAttempts: getMaxRetries(),
    dedupeKey: candidateId,
  },
);
```

## Phase 0: Freeze Baseline and Target Architecture

- [x] Confirm current duplicate pipeline scope and record the exact gaps this plan closes.
- [x] Freeze the target detector shape before schema or code changes.
- [x] Record current verification commands and baseline eval expectations in this file as the execution source of truth.

**Completion standard**

- Current behavior is explicitly documented: in-memory path full-scans approved traps and skills, PostgreSQL path narrows candidates but is trap-only and does not build skill candidate text correctly.
- The future-state contract is stable enough that later phases do not need to rename core types or rewrite the plan.

**Document updates**

- [x] Update `plan.md` phase checkboxes and completion notes.
- [x] If architecture wording must be promoted out of the plan, add a short target-state section to `docs/architecture/components/INGESTION.md`.

**Test and eval updates**

- [x] Record baseline commands:
  - `rtk pnpm test -- --run packages/server/src/lib/candidates/detector.test.ts packages/server/src/lib/candidates/pg-detector.test.ts`
  - `rtk pnpm test -- --run packages/server/src/__tests__/candidate-pipeline.test.ts`
  - `rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/dedup-eval.ts --dry-run`
- [x] Capture which cases currently fail or are known blind spots before code changes.

**Example architecture note**

```md
Duplicate detection becomes:
1. Normalize candidate input.
2. Check exact fingerprint lane.
3. Run indexed recall against traps and skills.
4. Score/rerank top candidates.
5. Invoke LLM only on narrowed candidates when configured.
```

### Phase 0 Completion Notes (2026-06-02)

**Confirmed current behavior (the exact gaps later phases close)**

1. **Trap exact-match lane is missing.** `packages/server/src/lib/candidates/detector.ts:112` hardcodes `const isExact = false; // Traps don't have fingerprint stored yet`, so trap candidates can never short-circuit through an exact-fingerprint comparison and always go through Jaccard scoring.
2. **Skill candidates send empty text to the PostgreSQL detector.** `packages/server/src/lib/candidates/processor.ts:117-120` builds `candidateText` only for the `trap` branch (`${shortcut}\n${detail}`) and falls back to `''` for skills, which then becomes a meaningless embedding for `pg-detector.ts`. The PG path is effectively unusable for skill candidates today.
3. **Skill fingerprint is computed with `profile: null` at candidate time.** `packages/server/src/lib/candidates/processor.ts:283-289` passes `profile: null` into the skill fingerprint builder, so only `files[].sha256` participates — content-level skill exactness depends entirely on post-approval profile derivation.
4. **In-memory detector is a full scan.** `packages/server/src/lib/candidates/detector.ts:194-` iterates every approved `trapEntries` and `skillArtifacts` record per candidate, with no indexed recall or top-K narrowing.
5. **PostgreSQL detector is trap-only.** `packages/server/src/lib/candidates/pg-detector.ts:116-150` queries only `knowledgeEmbeddings` and `knowledgeKeywords` (both trap-side). There is no parallel skill recall — skill matches only happen if `fallbackData` is provided and the in-memory path runs.
6. **Queue enqueue has no dedupe guard.** `packages/server/src/lib/candidates/processor.ts:332-340` (`scheduleCandidateProcessing`) and the retry path at lines 247-258 both call `queue.enqueue(...)` without a `dedupeKey`, so a repeated submit/schedule for the same `candidateId` can stack parallel processing work.

**Frozen target detector contract**

The "Example Target Shapes" section above (`NormalizedDuplicateInput`, `ExactDuplicateHit`, queue `dedupeKey: candidateId`) is the frozen contract for later phases. Field names and value types in those shapes are locked: later phases extend the implementation but must not rename `sourceType`, `fingerprint`, `titleText`, `bodyText`, `keywordTerms`, `tokenTerms`, `exactLookupKey`, or the `matchType: 'exact'` literal.

**Baseline command results (recorded 2026-06-02)**

Note: `packages/server/src/lib/candidates/pg-detector.test.ts` does not exist yet — Phase 1 creates it. Until then the baseline test command is:

```bash
rtk pnpm --filter @trapmap/server exec vitest run \
  src/lib/candidates/detector.test.ts \
  src/lib/candidates/processor.test.ts \
  src/__tests__/candidate-pipeline.test.ts

rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/dedup-eval.ts --dry-run
```

Vitest results on `main` at baseline:

- `src/lib/candidates/detector.test.ts` — 18 tests pass.
- `src/lib/candidates/processor.test.ts` — 25 tests pass.
- `src/__tests__/candidate-pipeline.test.ts` — 11 tests pass.

Dedup eval dry-run on `main` (Jaccard column = in-memory detector behavior; LLM column = LLM refinement on top of Jaccard pre-filter):

| Class      | Jaccard P / R / F1 | LLM P / R / F1   |
| ---------- | ------------------ | ---------------- |
| exact      | 1.00 / 0.43 / 0.60 | 1.00 / 0.57 / 0.73 |
| semantic   | 0.00 / 0.00 / 0.00 | 0.40 / 0.14 / 0.21 |
| none       | 0.39 / 1.00 / 0.56 | 0.43 / 1.00 / 0.60 |
| Macro F1   | **0.388**          | **0.513**        |
| Accuracy   | 0.400              | 0.500            |

Known blind spots before any code change:

- Jaccard never returns `semantic` (P/R/F1 all zero) — by construction, the in-memory detector only emits `exact` (skill `contentHash` hits) or `high-overlap`/`semantic-similar` based on Jaccard score, and the dedup eval's reporting bucket maps low-overlap to `none`. Anything that needs semantic recall to fire today gets `none`.
- All four trap-side "exact under cosmetic change" cases — `exact-minor-differences`, `exact-paraphrased`, `exact-restructured`, `exact-formatting` — are misclassified by Jaccard (semantic or worse). Trap canonicalization + exact lookup (Phase 1) is expected to lift these to `exact`.
- All six `real-semantic-*` skill near-duplicate cases — including `real-semantic-docx-vs-pdf`, `real-semantic-network-vs-cloudflare`, `real-semantic-research-vs-factcheck`, `real-semantic-financial-vs-competitors`, `real-semantic-frontend-vs-testing`, `real-semantic-doccoauthoring-vs-handoff` — miss on both Jaccard and LLM. Skill-side PG recall (Phase 3) with non-empty skill candidate text (Phase 2) is the intended fix.
- LLM column already separates the three eval-reported "disagreements" (`semantic-npm-eresolve`, `exact-minor-differences`, `semantic-similar-scope`) where Jaccard lost the case but LLM recovered it. Phase 5 must keep LLM-vs-Jaccard parity from regressing as Phase 2 changes inputs.

These four bullets are the regression watch-list for Phase 5: trap-cosmetic-exact lift, skill-near-duplicate semantic recall, no regression on the `none` cases (Jaccard already has perfect recall on `none`), and no regression on the LLM disagreement set.

## Phase 1: Add Exact Fingerprint Duplicate Lane

- [ ] Add trap-side exact lookup support so traps no longer rely only on overlap scoring.
- [ ] Reuse existing skill `contentHash`/profile exact data instead of re-deriving exactness late in scoring.
- [ ] Return an exact duplicate case immediately when the exact lane hits.

**Completion standard**

- A trap candidate that matches an approved trap by canonical fingerprint returns `duplicateType: 'exact'` without a full similarity pass.
- A skill candidate with the same normalized content/file fingerprint returns an exact hit consistently in both in-memory and PostgreSQL modes.
- Exact hits preserve current duplicate-case persistence shape and reviewer workflow.

**Document updates**

- [ ] Update `docs/architecture/components/INGESTION.md` with an "exact match first" subsection.
- [ ] Update `docs/reference/DATABASE_SCHEMA.md` if a new trap fingerprint column or index is added.

**Test and eval updates**

- [ ] Add unit tests in `packages/server/src/lib/candidates/fingerprint.test.ts` for trap and skill canonicalization.
- [ ] Add detector tests in `packages/server/src/lib/candidates/detector.test.ts` and `packages/server/src/lib/candidates/pg-detector.ts` covering exact-hit short-circuit behavior.
- [ ] Add or update at least one exact duplicate fixture in `evals/graph-extraction/dedup-fixtures-real.ts`.

**Example structure or code**

```ts
function buildTrapExactLookupKey(payload: {
  shortcut: string;
  detail: string;
  labels: string[];
}): string {
  return createHash('sha256')
    .update(
      [payload.shortcut.trim(), payload.detail.trim(), [...payload.labels].sort().join(',')].join(
        '\n',
      ),
      'utf8',
    )
    .digest('hex');
}
```

## Phase 2: Normalize Duplicate Inputs and Fix Skill Candidate Text

- [x] Replace ad hoc candidate text building in `processor.ts` with one shared normalization helper.
- [x] Ensure skill candidates produce meaningful title/body/keywords/tokens for PostgreSQL recall and LLM review.
- [x] Make in-memory and PostgreSQL detectors consume the same normalized input contract.

**Completion standard**

- `packages/server/src/lib/candidates/processor.ts` no longer has trap-only `candidateText` logic.
- Skill candidates send non-empty normalized text into PostgreSQL embeddings and duplicate review.
- LLM comparison input uses real title/body pairs instead of partial keyword fallbacks where source text exists.

**Document updates**

- [ ] Update `docs/architecture/components/INGESTION.md` to show how trap and skill submissions are normalized before duplicate detection.
- [ ] If new helper contracts are broadly reused, add a short note to `docs/PACKAGES.md` under server candidate processing responsibilities.

**Test and eval updates**

- [ ] Add normalization tests to `packages/server/src/lib/candidates/fingerprint.test.ts`.
- [ ] Add regression coverage in `packages/server/src/lib/candidates/processor.test.ts` for skill submissions.
- [ ] Re-run duplicate fixtures that currently under-detect skill similarity and update expected outputs if the new normalized text changes scores.

**Example structure or code**

```ts
export function buildNormalizedDuplicateInput(candidate: CandidateSubmission): NormalizedDuplicateInput {
  if (candidate.sourceType === 'trap' && candidate.originalPayload.trap) {
    return {
      sourceType: 'trap',
      fingerprint: computeTrapFingerprint(candidate.originalPayload.trap),
      titleText: candidate.originalPayload.trap.shortcut,
      bodyText: candidate.originalPayload.trap.detail,
      keywordTerms: [...candidate.originalPayload.trap.labels],
      tokenTerms: [...tokenize(`${candidate.originalPayload.trap.shortcut}\n${candidate.originalPayload.trap.detail}`)],
      exactLookupKey: computeTrapFingerprint(candidate.originalPayload.trap),
    };
  }

  const skill = candidate.originalPayload.skill!;
  return {
    sourceType: 'skill',
    fingerprint: computeSkillFingerprint({
      profile: extractCandidateSkillProfile(skill),
      files: skill.files,
    }),
    titleText: extractCandidateSkillProfile(skill)?.title ?? skill.files[0]?.path ?? candidate.id,
    bodyText: extractCandidateSkillProfile(skill)?.summary ?? skill.files.map((file) => file.path).join('\n'),
    keywordTerms: extractCandidateSkillProfile(skill)?.keywords ?? [],
    tokenTerms: [...tokenize(extractCandidateSkillProfile(skill)?.summary ?? skill.files.map((file) => file.path).join('\n'))],
    exactLookupKey: computeSkillFingerprint({
      profile: extractCandidateSkillProfile(skill),
      files: skill.files,
    }),
  };
}
```

### Phase 2 Completion Notes (2026-06-02)

**Implementation**

- Added `NormalizedDuplicateInput` interface in `packages/server/src/lib/candidates/types.ts` (frozen field names per the plan contract).
- Added `extractCandidateSkillProfile(skill)` and `buildNormalizedDuplicateInput(candidate)` in `packages/server/src/lib/candidates/fingerprint.ts`:
  - Trap: `fingerprint = computeTrapFingerprint({shortcut, detail, labels})`, `titleText = shortcut`, `bodyText = detail`, `keywordTerms = labels`, `tokenTerms = tokenize(shortcut\ndetail)`, `exactLookupKey = fingerprint`.
  - Skill: profile derived from SKILL.md `content`/`text` (first `#` heading as title, rest as summary, `extractKeywords()` for keywords) when present; otherwise title falls back to first file path / `candidate.id` and body falls back to joined file paths.
- Refactored `packages/server/src/lib/candidates/processor.ts` to call `buildNormalizedDuplicateInput` once and feed both detectors; removed the trap-only `candidateText` ternary at the old `processor.ts:117-120`.
- Extended `DuplicateDetectionInput` with optional `candidateTitle` / `candidateBody` (backward compatible); updated `detector.ts` and `pg-detector.ts` LLM refinement to consume the new fields when present, otherwise fall back to the previous keyword/token slicing.

**Verification**

- `packages/server/src/lib/candidates/`: 196 tests pass (183 prior + 13 new fingerprint / processor tests).
- `rtk pnpm typecheck`: clean.
- `rtk pnpm lint`: clean.
- `rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/dedup-eval.ts --dry-run`: runs; macro F1 within baseline noise (dedup-eval uses its own internal Jaccard/heuristic classifier, so changes to the detector normalization flow don't surface in dry-run metrics; the real detector inputs now carry non-empty skill text on the live path).
- `rtk pnpm test -- --run`: 4166 tests pass; no regressions outside candidates.

**Deferred (Phase 3 / Phase 5)**

- Skill-side PG recall (Phase 3) — the normalized contract is the input the recall stage will consume; the helper is already wired through `processor.ts`.
- Recalibration of LLM thresholds (Phase 5 deferred risk) — skill candidates now send real title/body to LLM refinement for the first time, so score distributions may shift slightly; Phase 5 should verify.

## Phase 3: Extend PostgreSQL Recall to Cover Both Traps and Skills

- [ ] Keep the indexed PostgreSQL path as the primary scalable detector.
- [ ] Add skill-side recall sources so PostgreSQL duplicate detection is no longer trap-only.
- [ ] Narrow both channels into one scored candidate list before optional LLM refinement.

**Completion standard**

- PostgreSQL duplicate detection returns trap and skill candidates in one sorted result set.
- Skill-side matches come from structured index reads, not fallback full scans.
- LLM refinement only sees the narrowed top-K set and preserves exact hits without reclassification drift.

**Document updates**

- [ ] Update `docs/architecture/components/INGESTION.md` with the new recall pipeline.
- [ ] Update `docs/operations/TESTING.md` with focused commands for trap-only, skill-only, and mixed duplicate scenarios.

**Test and eval updates**

- [ ] Add PG detector tests for trap-only, skill-only, and mixed candidate sets.
- [ ] Add repository/schema tests if new SQL paths or indexes are introduced.
- [ ] Expand `evals/graph-extraction/dedup-fixtures-real.ts` with one false-positive control and one skill-near-duplicate case.
- [ ] Re-run `rtk pnpm eval:dedup:dry-run` and then the live dedup eval once fixtures and expectations stabilize.

**Example structure or code**

```ts
const recallCandidates = [
  ...await recallTrapDuplicates(db, normalizedInput, governanceFilter),
  ...await recallSkillDuplicates(db, normalizedInput, governanceFilter),
];

const ranked = mergeAndRankDuplicateMatches(recallCandidates)
  .filter((match) => match.similarityScore >= MEDIUM_OVERLAP_THRESHOLD)
  .slice(0, maxMatches);
```

## Phase 4: Add Queue Dedupe and Duplicate-Path Observability

- [ ] Use queue `dedupeKey` so a candidate cannot be enqueued multiple times while pending/running.
- [ ] Emit enough structured metadata to explain which duplicate lane fired: exact, indexed recall, or fallback.
- [ ] Keep retry semantics unchanged for real failures.

**Completion standard**

- Repeated enqueue attempts for the same candidate do not create parallel processing work.
- Logs or persisted metadata make it possible to distinguish exact-hit cases from semantic-hit cases during review and debugging.
- Retry-on-error still works and does not accidentally suppress legitimate reprocessing after failure or resolution.

**Document updates**

- [ ] Update `docs/operations/TESTING.md` with queue-dedupe verification steps.
- [ ] If operational visibility changes materially, update `docs/operations/ENVIRONMENT.md` or the relevant operations doc for any new flags/logging notes.

**Test and eval updates**

- [ ] Add queue tests around `dedupeKey` use in `packages/server/src/lib/queue/task-queue.ts` coverage or adjacent tests.
- [ ] Add integration coverage in `packages/server/src/__tests__/candidate-pipeline.test.ts` for repeated scheduling.
- [ ] Confirm eval runners still work when duplicate-path metadata is present in stored cases.

**Example structure or code**

```ts
await queue.enqueue<CandidateProcessingPayload>(
  CANDIDATE_PROCESSING_TASK_TYPE,
  { candidateId, retryCount: 0 },
  {
    maxAttempts: getMaxRetries(),
    dedupeKey: candidateId,
  },
);
```

## Phase 5: Align Docs, Tests, and Eval Thresholds for Rollout

- [ ] Finish the truth-source docs after behavior is stable.
- [ ] Lock in the verification matrix for local development and CI.
- [ ] Record follow-up risks that are deliberately deferred.

**Completion standard**

- Docs explain when the system does exact duplicate rejection, indexed semantic recall, and fallback/manual review.
- The plan checklist is fully updated with actual completion state and any deferred work is explicit.
- The final test/eval command set is short enough for routine use and strong enough to catch regressions.

**Document updates**

- [ ] Update `docs/architecture/components/INGESTION.md`.
- [ ] Update `docs/operations/TESTING.md`.
- [ ] Update `docs/README.md` if any new long-lived duplicate strategy doc is added.
- [ ] Mark completed phases in `plan.md`.

**Test and eval updates**

- [ ] Run the smallest focused Vitest targets first.
- [ ] Run the candidate pipeline integration tests.
- [ ] Run `rtk pnpm eval:dedup:dry-run`.
- [ ] Run the live dedup eval if the environment is configured.
- [ ] If score distributions move, update the dedup eval acceptance notes in the plan and the relevant eval README.

**Example verification block**

```bash
rtk pnpm test -- --run \
  packages/server/src/lib/candidates/fingerprint.test.ts \
  packages/server/src/lib/candidates/detector.test.ts \
  packages/server/src/lib/candidates/pg-detector.test.ts \
  packages/server/src/lib/candidates/processor.test.ts \
  packages/server/src/__tests__/candidate-pipeline.test.ts

rtk pnpm eval:dedup:dry-run
```

## Deferred Risks

- [ ] Trap exact-match persistence may need a migration if existing retrieval-derived hashes cannot safely serve as the canonical duplicate fingerprint.
- [ ] Skill duplicate quality may still need capsule-level recall if profile-only matching proves too coarse.
- [ ] LLM refinement thresholds may need recalibration after exact and indexed recall reduce the candidate set.
