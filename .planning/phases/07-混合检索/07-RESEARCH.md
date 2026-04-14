# Phase 7: 混合检索 - Research

**Date:** 2026-04-14 [VERIFIED: system date]
**Status:** Complete [VERIFIED: this document created for Phase 7 planning]
**Scope:** Phase 7 only (`HYBR-01`..`HYBR-05` plus relevant `BOUND-*`) [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md]
**Confidence:** MEDIUM [VERIFIED: current codebase and Phase 6 outputs were reviewed] [ASSUMED: Phase 7 quality improvement can be demonstrated with repository-local fixtures rather than a separate benchmark corpus]

## User Constraints

- No `CONTEXT.md` exists for Phase 7, so planning is based on roadmap, requirements, current code, and Phase 6 artifacts only. [VERIFIED: `.planning/phases/07-混合检索/*-CONTEXT.md` absent] [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/phases/06-检索架构重构/06-RESEARCH.md] [VERIFIED: .planning/phases/06-检索架构重构/06-VERIFICATION.md]
- Contracts remain the source of truth. [VERIFIED: .planning/REQUIREMENTS.md]
- CLI continues to depend only on contracts and API behavior. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/cli/src/commands/retrieval.ts]
- Approval, permission, team filtering, and audit boundaries stay server-side. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/routes/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/filters.ts]
- `global` and `project` continue to represent business scope, not retrieval mode. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/assembly.ts]
- Retrieval order must remain approval -> permission/team filtering -> retrieval -> output. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: .planning/phases/06-检索架构重构/06-VERIFICATION.md]

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HYBR-01 | 实现关键词召回通道 (`retrieval/recall/keyword.ts`) | Add a server-only keyword recall adapter over already-filtered `KnowledgeRecord[]`, using `shortcut`, `detail`, and `labels` as searchable text. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/store.ts] [VERIFIED: packages/server/src/lib/retrieval/filters.ts] |
| HYBR-02 | 实现向量与关键词候选集合并逻辑 | Merge semantic and keyword candidate lists in the orchestrator after filtering and before assembly, with entry-id deduplication. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/types.ts] |
| HYBR-03 | 引入简单 rerank 模块 (`retrieval/rerank.ts`) | Add an internal rerank stage after merge and before `assembleResponseBuckets`. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/assembly.ts] |
| HYBR-04 | 支持混合查询模式 (hybrid mode) | Replace the current controlled 501 for `mode: 'hybrid'` with the new hybrid pipeline while keeping `semantic` default behavior unchanged. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/cli/src/commands/retrieval.ts] |
| HYBR-05 | 验证混合检索对短文本查询的改进效果 | Add deterministic tests that compare semantic-only vs hybrid ordering/recall on short queries using repository fixtures. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval.test.ts] [VERIFIED: packages/server/src/lib/retrieval-workflow.test.ts] [ASSUMED: repository-local synthetic fixtures are acceptable evidence for Phase 7 rather than production telemetry] |
| BOUND-01 | contracts 仍然是唯一契约真源 | Keep Phase 7 contract changes minimal or zero; mode already exists in contracts. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/contracts/src/domain/retrieval.ts] |
| BOUND-02 | cli 继续只依赖 API 契约 | CLI should keep sending `mode` and rendering the same response shape. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/cli/src/commands/retrieval.ts] |
| BOUND-03 | RBAC、team 过滤、审批和审计仍在 server 内 | Hybrid recall must consume `eligibleEntries` from `filterEligibleEntries` rather than bypassing it. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| BOUND-04 | global/project 继续表示业务范围，不是检索模式 | Merge and rerank must operate on entries first; scope split still happens only in assembly. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/assembly.ts] |
| BOUND-05 | 所有增强服从 审批 → 权限过滤 → 检索 → 输出 的顺序 | Phase 7 should extend only the retrieval stage between filtering and assembly. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |

## Current State Summary

- Phase 6 already established the seam that Phase 7 needs: `searchKnowledge` parses the shared contract, snapshots the store, filters eligible entries, dispatches by mode, assembles buckets, and only then attempts refinement. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: .planning/phases/06-检索架构重构/06-VERIFICATION.md]
- `hybrid` mode is already present in the shared request schema and CLI flag, but the server currently throws a 501 for it. [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/cli/src/commands/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
- The current retrieval contract exposes only `score` and `reason`; it does not expose recall channel metadata or a separate rerank score yet. [VERIFIED: packages/contracts/src/domain/retrieval.ts]
- Approved, security-eligible, and team-eligible filtering happens before any retrieval work, and workflow tests already verify that unapproved content is not searchable. [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/retrieval-workflow.test.ts]
- Searchable source fields already available for a keyword adapter are `shortcut`, `detail`, and `labels`. [VERIFIED: packages/server/src/lib/store.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts]
- There is no keyword index or keyword cache in the current data model, so Phase 7 keyword recall must work from the filtered snapshot at query time. [VERIFIED: packages/server/src/lib/store.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: .planning/REQUIREMENTS.md]

## Architectural Recommendation

- Implement `packages/server/src/lib/retrieval/recall/keyword.ts` as a pure adapter that scores already-filtered `KnowledgeRecord` items using normalized query tokens against `shortcut`, `detail`, and `labels`. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/store.ts] [ASSUMED: token-overlap scoring is sufficient for the first hybrid iteration]
- Extend internal retrieval types so a candidate can carry enough internal metadata for merge and rerank, but keep the public response schema unchanged for Phase 7. [VERIFIED: packages/server/src/lib/retrieval/types.ts] [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: .planning/ROADMAP.md]
- Replace `dispatchByMode('hybrid')` with a pipeline of `semantic recall + keyword recall -> merge -> rerank -> existing assembly`. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: .planning/ROADMAP.md]
- Put merge logic in a dedicated internal module or a clearly named orchestrator helper so later phases can reuse it without mixing mode dispatch and scoring details. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [ASSUMED: a separate module is the cleaner long-term seam than a private inline function]
- Add `packages/server/src/lib/retrieval/rerank.ts` as a deterministic module that operates on merged candidates only and does not call external models. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [ASSUMED: "simple rerank" is intended to be heuristic, not model-based, in Phase 7]

## Recommended Pipeline

1. `filterEligibleEntries(...)` stays first and unchanged. [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
2. `semanticRecall(...)` runs exactly as today for embedding-based candidates. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts]
3. `keywordRecall(...)` runs on the same eligible set and returns scored candidates keyed by `entry.id`. [VERIFIED: packages/server/src/lib/store.ts] [ASSUMED: scoring by exact token hits in labels/shortcut/detail is sufficient]
4. `mergeCandidates(...)` deduplicates by `entry.id` and combines channel evidence before limiting to a working candidate set. [ASSUMED: merge should happen before final `maxResults` truncation to avoid dropping useful cross-channel candidates]
5. `rerankCandidates(...)` produces the final ordered list for existing assembly. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED: rerank should be deterministic and local]
6. `assembleResponseBuckets(...)` continues to split only by business scope. [VERIFIED: packages/server/src/lib/retrieval/assembly.ts]

## Invariants

- Do not change `retrievalResponseSchema` in Phase 7. [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: .planning/ROADMAP.md]
- Do not move filtering into keyword recall, merge, or rerank helpers. [VERIFIED: packages/server/src/lib/retrieval/filters.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
- Do not reinterpret `scope` as retrieval mode. [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/assembly.ts]
- Do not make the CLI aware of semantic-vs-keyword internals beyond the existing `--mode` flag. [VERIFIED: packages/cli/src/commands/retrieval.ts] [VERIFIED: .planning/REQUIREMENTS.md]
- Keep hybrid mode optional; omitted mode must still resolve to semantic behavior. [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/routes/retrieval.test.ts]
- Keep refinement best-effort and downstream of retrieval ordering. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

## Don’t Hand-Roll

| Problem | Don’t Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query-time authorization | A second filtering path inside keyword recall | Reuse `filterEligibleEntries` output directly. [VERIFIED: packages/server/src/lib/retrieval/filters.ts] | Duplicate security logic would risk server-side boundary drift. [VERIFIED: .planning/REQUIREMENTS.md] |
| Scope bucketing | Mode-specific global/project branching | Reuse `assembleResponseBuckets`. [VERIFIED: packages/server/src/lib/retrieval/assembly.ts] | Scope is already a stable business concept and must stay separate from retrieval mode. [VERIFIED: .planning/REQUIREMENTS.md] |
| Public contract expansion | New response fields for channel/rerank details in Phase 7 | Keep extra metadata internal until Phase 10. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/contracts/src/domain/retrieval.ts] | Citation/channel exposure is explicitly deferred. [VERIFIED: .planning/REQUIREMENTS.md] |

## Risks

### Risk 1: Hybrid logic bypasses the existing security order

- If keyword recall or merge starts from raw `data.knowledgeEntries`, unapproved or cross-team entries can leak into candidates. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/filters.ts]
- Mitigation: design all hybrid helpers to accept only `eligibleEntries`. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

### Risk 2: Keyword scores dominate because they are not normalized

- Semantic scores are already clamped to `[0,1]`. [VERIFIED: packages/server/src/lib/retrieval/recall/semantic.ts]
- A keyword adapter that emits raw hit counts would make merge behavior unstable across query lengths. [ASSUMED: unnormalized lexical scores would distort final ordering]
- Mitigation: normalize keyword scores into `[0,1]` before merge and keep merge weights explicit. [ASSUMED: normalized weighted merge is the simplest stable approach]

### Risk 3: `maxResults` is applied too early

- The current semantic path sorts then slices before assembly. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
- If each channel slices independently to `maxResults`, hybrid mode can lose cross-channel winners before rerank. [ASSUMED: pre-merge truncation would reduce recall for short queries]
- Mitigation: use a larger intermediate candidate cap for each channel, then apply final truncation after rerank. [ASSUMED: a small multiple of `maxResults` is sufficient]

### Risk 4: Phase 7 accidentally becomes Phase 8

- There is no keyword index adapter or store field yet. [VERIFIED: packages/server/src/lib/store.ts] [VERIFIED: .planning/REQUIREMENTS.md]
- Building persistent lexical indexing in Phase 7 would overlap with `IDX-08`. [VERIFIED: .planning/REQUIREMENTS.md]
- Mitigation: keep Phase 7 query-time and in-memory; leave persistence and lifecycle refresh to Phase 8. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md]

## Missing Prerequisites Or Contradictions

- `docs/retrieval-structure-adjustment.md` is still missing, so roadmap/requirements/code are the only authoritative inputs available for Phase 7 planning. [VERIFIED: `docs/retrieval-structure-adjustment.md` missing] [VERIFIED: .planning/REQUIREMENTS.md]
- Workspace `pnpm typecheck` currently fails in `packages/server/src/routes/operations.ts` and `packages/cli/src/commands/audit.ts`, which is a pre-existing baseline issue outside the hybrid retrieval files. [VERIFIED: `pnpm typecheck` on 2026-04-14]
- The current public retrieval match schema has nowhere to expose channel provenance or post-rerank scores, so Phase 7 should treat those as internal-only until Phase 10. [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: .planning/REQUIREMENTS.md]

## Validation Architecture

**Current test surface**

- Retrieval unit tests exist and currently pass for filtering, result shaping, cache behavior, and refinement fallbacks. [VERIFIED: packages/server/src/lib/retrieval.test.ts] [VERIFIED: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts` on 2026-04-14]
- Workflow tests exist and currently pass for the approval-before-search boundary. [VERIFIED: packages/server/src/lib/retrieval-workflow.test.ts] [VERIFIED: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts` on 2026-04-14]
- CLI retrieval tests exist and currently pass for flag wiring and output formatting. [VERIFIED: packages/cli/src/commands/retrieval.test.ts] [VERIFIED: `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` on 2026-04-14]

**Phase 7 additions**

- Add unit tests for `keywordRecall` scoring and normalization on short queries. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED: lexical scoring can be tested deterministically without provider access]
- Add unit tests for merge deduplication and tie-breaking when the same entry appears in both channels. [VERIFIED: .planning/REQUIREMENTS.md]
- Add rerank tests that prove ordering changes while returned IDs remain authorization-safe. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/filters.ts]
- Add orchestrator tests for `mode: 'hybrid'` that compare hybrid vs semantic behavior on fixtures representing short-text queries. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
- Add route tests for successful `mode: 'hybrid'` requests and keep semantic default coverage. [VERIFIED: packages/server/src/routes/retrieval.ts] [VERIFIED: packages/server/src/routes/retrieval.test.ts]
- Add CLI tests that verify `--mode hybrid` is passed through without changing output shape. [VERIFIED: packages/cli/src/commands/retrieval.ts] [VERIFIED: packages/cli/src/commands/retrieval.test.ts]

**Recommended commands**

- Quick: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts` [VERIFIED: package.json] [VERIFIED: packages/server/package.json]
- CLI quick: `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` [VERIFIED: package.json] [VERIFIED: packages/cli/package.json]
- Full: `pnpm test` plus `pnpm typecheck`, with the current known typecheck baseline issue tracked separately. [VERIFIED: package.json] [VERIFIED: `pnpm typecheck` on 2026-04-14]

## Security Domain

- Applicable controls for Phase 7 are V4 Access Control and V5 Input Validation because retrieval still depends on permission-gated routes and schema-validated requests. [VERIFIED: packages/server/src/routes/retrieval.ts] [VERIFIED: packages/contracts/src/domain/retrieval.ts]
- The main threat pattern is data exposure through bypassed filtering, and the standard mitigation is to preserve the existing filter-first orchestrator order. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/filters.ts]
- Another threat pattern is score manipulation through unbounded lexical boosts, and the mitigation is normalized channel scores plus deterministic rerank rules. [ASSUMED: unbounded lexical boosts are a realistic ranking risk in hybrid retrieval]

## Planning Implications

- **Plan 07-01: Keyword recall adapter.** Create `recall/keyword.ts`, define internal candidate metadata needed for channel-aware merge, and cover lexical scoring behavior with unit tests. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md]
- **Plan 07-02: Merge logic.** Implement hybrid mode in the orchestrator, merge semantic and keyword candidate sets with deduplication and normalized scores, and keep public response shape unchanged. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/contracts/src/domain/retrieval.ts]
- **Plan 07-03: Simple rerank.** Add `retrieval/rerank.ts`, apply rerank after merge, and add comparative tests that show short-query improvement over semantic-only fixtures. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED: comparative fixture tests are enough to satisfy HYBR-05 at this phase]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Token-overlap scoring over `shortcut`/`detail`/`labels` is sufficient for the first keyword adapter. | Architectural Recommendation | Phase 7 may need a more complex lexical scorer than planned. |
| A2 | A deterministic heuristic rerank is the intended scope of "simple rerank". | Architectural Recommendation | Plan 07-03 could under-scope or over-scope implementation. |
| A3 | Repository-local fixture comparisons are acceptable evidence for HYBR-05 without separate benchmark data. | Phase Requirements / Planning Implications | Validation may be considered too weak by reviewers. |
| A4 | Merge should use an intermediate candidate cap larger than `maxResults`. | Risks | If unnecessary, implementation becomes slightly more complex than needed. |

## Sources

- `.planning/ROADMAP.md` [VERIFIED: roadmap scope, plan breakdown, dependencies]
- `.planning/REQUIREMENTS.md` [VERIFIED: HYBR and BOUND requirements]
- `.planning/STATE.md` [VERIFIED: milestone state and prior-phase dependency context]
- `.planning/phases/06-检索架构重构/06-RESEARCH.md` [VERIFIED: Phase 6 architectural intent]
- `.planning/phases/06-检索架构重构/06-VERIFICATION.md` [VERIFIED: Phase 6 seam is implemented and tested]
- `packages/contracts/src/domain/retrieval.ts` [VERIFIED: public request/response schema and mode support]
- `packages/server/src/lib/retrieval/orchestrator.ts` [VERIFIED: current pipeline order, mode dispatch, semantic path, 501 hybrid placeholder]
- `packages/server/src/lib/retrieval/filters.ts` [VERIFIED: approval/team/level/scope/label filtering]
- `packages/server/src/lib/retrieval/assembly.ts` [VERIFIED: response bucketing and unchanged output shape]
- `packages/server/src/lib/retrieval/types.ts` [VERIFIED: current internal candidate types]
- `packages/server/src/lib/retrieval/recall/semantic.ts` [VERIFIED: current scoring bounds and searchable fields]
- `packages/server/src/routes/retrieval.ts` [VERIFIED: permission-gated route behavior]
- `packages/server/src/lib/retrieval.test.ts` [VERIFIED: current retrieval unit coverage]
- `packages/server/src/lib/retrieval-workflow.test.ts` [VERIFIED: approval-before-search workflow coverage]
- `packages/server/src/routes/retrieval.test.ts` [VERIFIED: route schema/default coverage]
- `packages/cli/src/commands/retrieval.ts` [VERIFIED: CLI mode passthrough and unchanged output behavior]
- `packages/cli/src/commands/retrieval.test.ts` [VERIFIED: CLI retrieval test surface]
- `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts` run on 2026-04-14 [VERIFIED: retrieval-focused server tests passing]
- `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` run on 2026-04-14 [VERIFIED: CLI retrieval tests passing]
- `pnpm typecheck` run on 2026-04-14 [VERIFIED: pre-existing workspace typecheck failures outside Phase 7]
