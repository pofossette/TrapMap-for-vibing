# Candidate LLM Dedup Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Wire `ChatProvider` end-to-end into candidate duplicate detection so the already-implemented LLM adjudication path can run in production.

**Architecture:** The LLM dedup code already exists in `llm-dedup.ts`, `detector.ts`, and `pg-detector.ts`. The missing work is dependency propagation: `bootstrap-workers.ts` -> `CandidateProcessorServices` -> `processor.ts` -> both duplicate detectors. This plan is intentionally scoped to the candidate subsystem and should not be mixed with retrieval/indexing work.

**Tech Stack:** TypeScript, Fastify, Vitest.

---

## Scope

- `packages/server/src/bootstrap/bootstrap-workers.ts`
- `packages/server/src/lib/candidates/processor.ts`
- `packages/server/src/lib/candidates/detector.ts`
- `packages/server/src/lib/candidates/pg-detector.ts`
- `packages/server/src/lib/candidates/processor.test.ts`
- `packages/server/src/lib/candidates/detector.test.ts`
- `packages/server/src/lib/candidates/pg-detector.test.ts`
- any candidate end-to-end tests that exercise worker processing

## Phase 0: Freeze the broken dependency chain

- [x] Confirm the missing injection points:
  - worker bootstrap
  - candidate processor service interface
  - PG detector construction
  - in-memory detector invocation

**Completion standard**

- The missing `chat` propagation points are explicitly documented before code changes begin.

**Document updates**

- [x] Update the root `plan.md` status if this plan starts.

**Test and eval updates**

- [x] Record baseline tests:
  - `pnpm test -- --run packages/server/src/lib/candidates/processor.test.ts packages/server/src/lib/candidates/detector.test.ts packages/server/src/lib/candidates/pg-detector.test.ts`

**Example structure or code**

```ts
interface CandidateProcessorServices {
  store: SkillShareerStore;
  getSnapshot: () => Promise<StoreData>;
  pool?: Pool;
  usePgDuplicateDetection?: () => boolean;
  candidateRepo?: CandidateRepository;
  chat?: ChatProvider;
}
```

## Phase 1: Propagate ChatProvider through worker bootstrap

- [x] Pass `app.skillShareer.ai.chat` into candidate processing services in `bootstrap-workers.ts`.
- [x] Preserve existing PG feature flag behavior.

**Completion standard**

- Production worker-created candidate processors receive `chat`.

**Document updates**

- [x] Update comments in `bootstrap-workers.ts` if they describe service construction.

**Test and eval updates**

- [x] Add or update worker/bootstrap tests proving `chat` is passed into the handler config path.

**Example structure or code**

```ts
const handler = createCandidateProcessingHandler({
  store,
  getSnapshot: () => store.snapshot(),
  pool,
  usePgDuplicateDetection: () => app.skillShareer.ai.embeddings.isConfigured,
  candidateRepo: app.skillShareer.repos.candidate,
  chat: app.skillShareer.ai.chat,
});
```

## Phase 2: Propagate ChatProvider through candidate processor and both detector paths

- [x] Add `chat` to `CandidateProcessorServices`.
- [x] Pass `chat` into `createPgDuplicateDetector(...)`.
- [x] Pass `chat` into `detectDuplicates(...)`.

**Completion standard**

- Both PG and in-memory duplicate detection can observe `chat?.isConfigured`.
- No code path still hardcodes the detectors to operate without `chat`.

**Document updates**

- [x] Update any subsystem docs if candidate duplicate detection architecture is documented.

**Test and eval updates**

- [x] Add processor tests for:
  - PG path with `chat`
  - in-memory path with `chat`
  - fallback path with `chat` undefined still behaves as today

**Example structure or code**

```ts
const pgDetector = createPgDuplicateDetector({
  pool: services.pool,
  featureFlag: services.usePgDuplicateDetection,
  chat: services.chat,
});

result = await detectDuplicates(detectionInput, services.chat);
```

## Phase 3: Add explicit LLM-path assertions

- [x] Stop relying only on unit coverage inside detector internals.
- [x] Add higher-level assertions that candidate processing can actually reach the LLM gate when `chat.isConfigured === true`.

**Completion standard**

- At least one processor-level test fails if `chat` stops being propagated.

**Document updates**

- [x] Update `docs/operations/TESTING.md` if candidate duplicate verification commands are documented there.

**Test and eval updates**

- [x] Add processor-level test doubles where `chat.invoke` is expected to be called under an LLM-eligible duplicate scenario.

**Example structure or code**

```ts
expect(mockChat.invoke).toHaveBeenCalled();
```

## Phase 4: Verification and closeout

- [x] Run focused tests.
- [x] Run `pnpm typecheck`.
- [x] Update completion notes if executed.

**Completion standard**

- Candidate duplicate LLM adjudication is reachable in production wiring when chat is configured.
- Non-LLM fallback still works when chat is not configured.
