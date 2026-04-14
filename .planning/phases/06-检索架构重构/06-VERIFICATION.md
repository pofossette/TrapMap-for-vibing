---
phase: 06-检索架构重构
verified: 2026-04-14T16:30:00Z
status: gaps_found
score: 4/6 must-haves verified
gaps:
  - truth: "Query mode is defined in shared contracts and wired through CLI and server dispatch"
    status: partial
    reason: "Contracts define mode schema (semantic/hybrid/graph-assisted) with default, but orchestrator doesn't read or dispatch on mode field, CLI lacks --mode flag, and tests don't include mode field"
    artifacts:
      - path: "packages/server/src/lib/retrieval/orchestrator.ts"
        issue: "Does not read parsed.mode or dispatch based on query mode - mode field accepted but ignored"
      - path: "packages/cli/src/commands/retrieval.ts"
        issue: "Missing --mode CLI flag despite contracts defining mode enum"
      - path: "packages/server/src/lib/retrieval.test.ts"
        issue: "Test queries don't include mode field for type compatibility"
    missing:
      - "Orchestrator dispatchByMode function to route semantic/hybrid/graph-assisted modes"
      - "CLI --mode flag with semantic default"
      - "Mode field in all test query objects"
      - "Controlled 501 errors for unimplemented hybrid and graph-assisted modes"
  - truth: "Business scope (global/project) remains separate from query mode concept"
    status: failed
    reason: "Scope filters work correctly, but without mode dispatch there's no enforcement that mode doesn't replace scope - the architectural boundary is implied but not implemented"
    artifacts:
      - path: "packages/server/src/lib/retrieval/orchestrator.ts"
        issue: "No validation or documentation that mode and scope are independent concepts"
    missing:
      - "Explicit separation of mode (retrieval strategy) from scope (business boundary) in code or tests"
---

# Phase 06: 检索架构重构 Verification Report

**Phase Goal:** 重构为可扩展检索骨架，不改变产品行为 (Refactor retrieval architecture into modular, extensible pipeline with filter/recall/assembly stages and query mode interface)

**Verified:** 2026-04-14T16:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | searchKnowledge has a dedicated orchestrator entrypoint under packages/server/src/lib/retrieval/ | ✓ VERIFIED | orchestrator.ts exists with `export async function searchKnowledge(` |
| 2   | The pipeline order stays approval → permission/team filtering → retrieval → response assembly | ✓ VERIFIED | orchestrator.ts calls filterEligibleEntries → getQueryEmbedding → assembleResponseBuckets |
| 3   | Server route integration keeps the current retrieval API behavior | ✓ VERIFIED | routes/retrieval.ts imports from facade and requires knowledge:search permission |
| 4   | Filtering, recall, and result assembly are split into dedicated modules | ✓ VERIFIED | filters.ts, recall/semantic.ts, assembly.ts all exist and are imported by orchestrator |
| 5   | The semantic retrieval path still returns the same response buckets | ✓ VERIFIED | assembly.ts assembles globalConstraints and projectKnowledge buckets |
| 6   | Query mode is defined in shared contracts and wired through CLI and server dispatch | ✗ PARTIAL | Contracts define mode schema but orchestrator ignores it, CLI lacks --mode flag |
| 7   | Business scope (global/project) remains separate from query mode concept | ✗ FAILED | Scope works but mode dispatch missing means boundary not enforced |

**Score:** 5/7 truths verified (71%)

### Deferred Items

None identified.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `packages/server/src/lib/retrieval/orchestrator.ts` | retrieval orchestration entrypoint | ✓ VERIFIED | Exists with searchKnowledge export, imports from filters/recall/assembly |
| `packages/server/src/lib/retrieval/types.ts` | internal pipeline types | ✓ VERIFIED | Exists with RetrievalPipelineContext, ScoredEntry, RetrievalStats |
| `packages/server/src/lib/retrieval.ts` | compatibility facade | ✓ VERIFIED | Re-exports searchKnowledge and updateEntryEmbeddingCache from orchestrator |
| `packages/server/src/lib/retrieval/filters.ts` | eligibility and metadata filtering | ✓ VERIFIED | Contains isEntryEligible and filterEligibleEntries with approval/team/level/scope/label filtering |
| `packages/server/src/lib/retrieval/recall/semantic.ts` | semantic recall adapter | ✓ VERIFIED | Contains buildEmbeddingText, cosineSimilarity, computeScore, getEntryEmbedding, getQueryEmbedding |
| `packages/server/src/lib/retrieval/assembly.ts` | response shaping module | ✓ VERIFIED | Contains generateMatchReason, toRetrievalMatch, assembleResponseBuckets, buildRetrievalResponse |
| `packages/contracts/src/domain/retrieval.ts` | shared retrieval query mode contract | ⚠️ PARTIAL | Defines retrievalQueryModeSchema with semantic/hybrid/graph-assisted and mode field with default, but not used by orchestrator or CLI |
| `packages/cli/src/commands/retrieval.ts` | CLI mode flag wired to shared contract | ✗ MISSING | No --mode option despite contracts defining mode enum |
| `packages/server/src/lib/retrieval/orchestrator.ts` | mode-aware dispatch seam | ✗ MISSING | No dispatchByMode function, mode field not read from parsed query |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `packages/server/src/routes/retrieval.ts` | `packages/server/src/lib/retrieval/orchestrator.ts` | searchKnowledge import | ✓ WIRED | Route imports searchKnowledge from facade which re-exports from orchestrator |
| `packages/server/src/lib/retrieval/orchestrator.ts` | `packages/server/src/lib/retrieval/filters.ts` | filterEligibleEntries import | ✓ WIRED | Orchestrator calls filterEligibleEntries at line 48 |
| `packages/server/src/lib/retrieval/orchestrator.ts` | `packages/server/src/lib/retrieval/recall/semantic.ts` | semantic recall imports | ✓ WIRED | Orchestrator imports and calls getQueryEmbedding, cosineSimilarity, computeScore |
| `packages/server/src/lib/retrieval/orchestrator.ts` | `packages/server/src/lib/retrieval/assembly.ts` | assembly imports | ✓ WIRED | Orchestrator imports and calls assembleResponseBuckets, buildRetrievalResponse |
| `packages/cli/src/commands/retrieval.ts` | `packages/contracts/src/domain/retrieval.ts` | shared request schema | ⚠️ PARTIAL | CLI uses contracts for schema but doesn't send mode field |
| `packages/server/src/lib/retrieval/orchestrator.ts` | `packages/contracts/src/domain/retrieval.ts` | mode interpretation | ✗ NOT_WIRED | Orchestrator doesn't read or dispatch on parsed.mode |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `filters.ts` | eligibleEntries | filterEligibleEntries() | ✓ FLOWING | Filters data.knowledgeEntries by auth context and query filters |
| `recall/semantic.ts` | queryVector | getQueryEmbedding() | ✓ FLOWING | Generates embedding from parsed.seed |
| `recall/semantic.ts` | scoredEntries | cosineSimilarity + computeScore | ✓ FLOWING | Computes similarity scores with metadata-aware boosts |
| `assembly.ts` | globalConstraints/projectKnowledge | assembleResponseBuckets() | ✓ FLOWING | Splits scored entries by scope field |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Retrieval API returns expected buckets | `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts` | 6/6 tests pass | ✓ PASS |
| Unit tests cover retrieval pipeline | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts` | 21/21 tests pass | ✓ PASS |
| Workflow tests cover approval filtering | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval-workflow.test.ts` | 7/7 tests pass | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| ARCH-01 | 06-01 | 抽出 `retrieval/orchestrator.ts` 作为检索编排入口 | ✓ SATISFIED | orchestrator.ts exists with searchKnowledge export |
| ARCH-02 | 06-02 | 分离过滤逻辑到 `retrieval/filters.ts` | ✓ SATISFIED | filters.ts contains isEntryEligible and filterEligibleEntries |
| ARCH-03 | 06-02 | 分离召回逻辑到 `retrieval/recall/` 目录 | ✓ SATISFIED | recall/semantic.ts contains embedding and similarity logic |
| ARCH-04 | 06-02 | 分离结果组装逻辑到独立模块 | ✓ SATISFIED | assembly.ts contains bucket assembly and response shaping |
| ARCH-05 | 06-02, 06-03 | 保持现有 API 返回结构兼容 | ✓ SATISFIED | Response still has globalConstraints + projectKnowledge + refinementSummary |
| ARCH-06 | 06-03 | 定义 query mode 接口（semantic / hybrid / graph-assisted） | ⚠️ PARTIAL | Contracts define mode schema but orchestrator doesn't dispatch, CLI lacks flag |
| BOUND-01 | 06-03 | contracts 仍然是唯一契约真源 | ✓ SATISFIED | Mode schema defined in contracts, imported by server |
| BOUND-02 | 06-03 | cli 继续只依赖 API 契约 | ✓ SATISFIED | CLI uses contracts for request schema validation |
| BOUND-03 | 06-01 | RBAC、team 过滤、审批和审计仍在 server 内 | ✓ SATISFIED | Filters and permission checks remain in server, not moved to contracts/CLI |
| BOUND-04 | 06-02, 06-03 | global/project 继续表示业务范围，不是检索模式 | ⚠️ PARTIAL | Scope filtering works correctly but mode dispatch missing means boundary not enforced |
| BOUND-05 | 06-01, 06-02 | 所有增强服从 审批 → 权限过滤 → 检索 → 输出 的顺序 | ✓ SATISFIED | Orchestrator enforces filter → recall → assembly → refinement order |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `packages/server/src/lib/retrieval/orchestrator.ts` | 118 | TODO: Implement actual LLM-based refinement | ℹ️ Info | Future enhancement, returns null correctly (not a blocker) |

### Human Verification Required

None identified. All verification criteria are testable via automated tests and code inspection.

### Gaps Summary

**Critical Gap: Query Mode Interface Not Fully Implemented**

Phase 06-03 claimed to implement query mode interface with dispatch, but the actual implementation is incomplete:

1. **Contracts define mode schema** ✓ - retrievalQueryModeSchema exists with semantic/hybrid/graph-assisted values
2. **Mode field added to query schema** ✓ - retrievalQuerySchema includes mode with default 'semantic'
3. **Orchestrator dispatch missing** ✗ - orchestrator.ts doesn't read parsed.mode or dispatch based on it
4. **CLI mode flag missing** ✗ - CLI search command has no --mode option
5. **Test coverage missing** ✗ - Test queries don't include mode field

**Root Cause Analysis:**

The 06-03 SUMMARY.md references commits (8a4e55b, 20b8d59) that exist in a worktree branch but were not merged into the current HEAD. The diff shows:
- Worktree has dispatchByMode function with switch statement for modes
- Worktree has CLI --mode flag with semantic default
- Worktree has controlled 501 errors for unimplemented modes
- Current HEAD lacks all of these implementations

**Impact:**

- ARCH-06 is only partially satisfied (schema exists but not wired)
- BOUND-04 cannot be verified (mode/scope separation not enforced)
- Phase 7 (hybrid retrieval) will need to implement mode dispatch before adding keyword recall
- The architectural seam for query modes exists in contracts but not in implementation

**Recommendation:**

Treat 06-03 as incomplete. Either:
1. Merge the worktree branch commits to complete the implementation, or
2. Create a gap closure plan to add mode dispatch, CLI flag, and test coverage

**Completed Successfully:**

- ✓ Orchestrator entrypoint extraction (ARCH-01)
- ✓ Filter module extraction (ARCH-02)
- ✓ Recall module extraction (ARCH-03)
- ✓ Assembly module extraction (ARCH-04)
- ✓ API response structure compatibility (ARCH-05)
- ✓ Contract-first architecture (BOUND-01, BOUND-02)
- ✓ Server-side business boundary enforcement (BOUND-03, BOUND-05)

**Requires Closure:**

- ✗ Query mode dispatch in orchestrator (ARCH-06)
- ✗ CLI --mode flag (ARCH-06)
- ✗ Mode field in tests (ARCH-06)
- ✗ Explicit mode/scope separation validation (BOUND-04)

---

_Verified: 2026-04-14T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
