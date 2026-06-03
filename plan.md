# Wiring Debt Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement any linked sub-plan task-by-task. Steps in sub-plans use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use this file as the root index for the current "implemented but not wired" debt across retrieval, artifact indexing, and candidate duplicate adjudication.

**Architecture:** The work has been split into separate executable plans by subsystem so each track can land independently: artifact lifecycle/indexing correctness, capsule PG retrieval indexing and operator repair, old skill lookup retrieval convergence, and candidate duplicate LLM adjudication wiring.

**Tech Stack:** TypeScript, Fastify, Vitest, Drizzle, PostgreSQL, pgvector, existing retrieval and ingestion eval runners.

---

## Archive Note

- [x] Previous root plan archived to `docs/archived/archived-plans/plan-2026-06-03-root-duplicate-validation-layering-archived.md`
- [x] Unified interim audit plan archived to `docs/archived/archived-plans/plan-2026-06-03-root-retrieval-and-artifact-indexing-wiring-unified.md`
- [x] Active tracking file remains `plan.md`

## How To Use This File

- [x] Treat this file as an index only.
- [x] Execute one sub-plan at a time unless a user explicitly asks for parallel workstreams.
- [x] Update the status checkboxes here when a sub-plan is started or completed.
- [x] Keep subsystem-specific execution detail in the linked sub-plan, not in this root file.

## Audited Debt Summary

### Retrieval and artifact indexing

- [x] Capsule PG keyword/vector recall exists, but lifecycle sync into `skill_artifact_capsule_keywords` and `skill_artifact_capsule_embeddings` is incomplete or absent.
- [x] Artifact lifecycle index removal is incomplete when a skill leaves `approved` for `agent-pass`, `agent-rejected`, or `rejected`.
- [x] `/v1/retrieval/skills/search-by-content` still bypasses the shared capsule coordinator and PG recall path.
- [x] Capsule rebuild/health/orphan cleanup helpers exist only as library APIs/tests, not a stable operator path.
- [x] Capsule HNSW vector index ensure exists as a function, but startup does not ensure it.

### Candidate duplicate adjudication

- [x] Candidate duplicate LLM adjudication is implemented but not wired end-to-end because `ChatProvider` is never injected into candidate processing services or duplicate detectors.

## Sub-Plan Index

### A. Artifact lifecycle and stale-index correctness

- [x] Status: completed
- [x] Plan: [artifact-lifecycle-indexing-plan.md](docs/plans/artifact-lifecycle-indexing-plan.md)
- [x] Scope:
  artifact lifecycle transitions, shared skill indexing seam, stale graph/capsule index removal when leaving `approved`

### B. Capsule PG index sync and operator repair

- [x] Status: completed
- [x] Plan: [capsule-pg-index-operations-plan.md](docs/plans/capsule-pg-index-operations-plan.md)
- [x] Scope:
  `syncArtifactCapsules()`, stale capsule row cleanup, startup `ensureCapsuleVectorIndex()`, rebuild/health/orphan operator entrypoints

### C. Skill lookup convergence onto shared recall

- [x] Status: completed
- [x] Plan: [skill-lookup-convergence-plan.md](docs/plans/skill-lookup-convergence-plan.md)
- [x] Scope:
  `/v1/retrieval/skills/search-by-content`, shared capsule coordinator reuse, PG recall reuse, retrieval eval or smoke coverage decision

### D. Candidate duplicate LLM adjudication wiring

- [x] Status: completed
- [x] Plan: [candidate-llm-dedup-wiring-plan.md](docs/plans/candidate-llm-dedup-wiring-plan.md)
- [x] Scope:
  `bootstrap-workers.ts`, `CandidateProcessorServices`, `processor.ts`, `detector.ts`, `pg-detector.ts`, end-to-end `ChatProvider` injection

## Execution Order

- [x] Recommended order:
  1. `artifact-lifecycle-indexing-plan.md`
  2. `capsule-pg-index-operations-plan.md`
  3. `skill-lookup-convergence-plan.md`
  4. `candidate-llm-dedup-wiring-plan.md`

## Completion Criteria For The Index

- [x] Every linked sub-plan is either completed or explicitly deferred.
- [x] `plan.md` status lines match the real state of the sub-plans.
- [x] Any new wiring debt discovered during execution is added here as a new indexed sub-plan, not appended as ad hoc prose.

## Completion Notes

- [x] Artifact lifecycle indexing now uses the shared artifact adapter seam instead of route-local graph/capsule dual wiring.
- [x] Capsule PG operator routes now exist under `/v1/operations/capsule-index/*`.
- [x] Retrieval eval now includes `/v1/retrieval/skills/search-by-content` as a first-class endpoint.
- [x] Candidate duplicate LLM adjudication now receives `ChatProvider` through worker bootstrap and processor services.
