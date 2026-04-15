# Phase 09 Verification Report: 图辅助检索 (Graph-Assisted Retrieval)

**Verification Date:** 2026-04-15
**Verifier:** Claude Code (Automated Verification)

---

## Goal Statement (from ROADMAP.md)

> **Goal:** 引入轻量实体抽取和关系辅助召回
>
> **Plans:**
> 1. 设计实体类型与抽取策略
> 2. 实现轻量图索引存储
> 3. 实现实体扩展查询
> 4. 实现关系辅助召回
>
> **Requirements:** GRAPH-01 ~ GRAPH-07
> **Success criteria:**
> - 高价值实体正确抽取
> - 图辅助召回可查到隐性相关知识
> - 不引入重型图数据库依赖

---

## Evidence of Goal Achievement

### GRAPH-01: 创建实体图 adapter (`indexing/adapters/graph.ts`) ✅ ACHIEVED

**Evidence:**
- File exists: `packages/server/src/lib/indexing/adapters/graph.ts`
- Implements `IndexAdapter` interface with `kind: 'graph'`
- Has `sync()` and `remove()` methods
- Uses shared extraction via `extractGraphEntities()`

**Code path (lines 104-223):**
```typescript
export const graphIndexAdapter: IndexAdapter = {
  kind: 'graph',
  async sync(document: NormalizedIndexDocument): Promise<IndexSyncResult> { ... }
  async remove(ref: { entryId: string; revision: number }): Promise<void> { ... }
}
```

### GRAPH-02: 创建图辅助召回模块 (`retrieval/recall/graph-assisted.ts`) ❌ NOT ACHIEVED

**Evidence:**
- File does NOT exist at expected path
- Glob search found only `semantic.ts` and `keyword.ts` in `retrieval/recall/`
- No `graphAssistedRecall` function exists in codebase

**Actual state:**
```
packages/server/src/lib/retrieval/recall/
├── keyword.test.ts
├── keyword.ts
└── semantic.ts
# graph-assisted.ts is MISSING
```

### GRAPH-03: 实现高价值实体抽取 ✅ ACHIEVED

**Evidence:**
- File exists: `packages/server/src/lib/retrieval/graph-extract.ts`
- All 6 entity types implemented:
  - `service`: Capitalized package-like phrases (lines 104-141)
  - `tool`: CLI/library keywords (lines 149-196)
  - `symptom`: Error/problem phrases (lines 204-226)
  - `root-cause`: Causal phrases (lines 234-251)
  - `fix`: Remediation phrases (lines 259-285)
  - `environment`: Context markers (lines 293-329)
- Deterministic extraction with noise filtering (60+ noise words)
- Tests passing: `graph-extract.test.ts` (12 tests)

### GRAPH-04: 实现实体扩展查询 ❌ NOT ACHIEVED

**Evidence:**
- No implementation found
- No `graphAssistedRecall` function exists
- Grep search for `graphAssistedRecall` returns no results

### GRAPH-05: 实现关系辅助召回 ❌ NOT ACHIEVED

**Evidence:**
- Entity extraction includes relation extraction (lines 340-407 in graph-extract.ts)
- BUT: No recall module uses these relations for query-time expansion
- Graph candidates are never merged with hybrid results

### GRAPH-06: 支持图辅助查询模式 (`graph-assisted`) ❌ NOT ACHIEVED

**Evidence:**
- Orchestrator still throws 501 for `graph-assisted` mode:

```typescript
// orchestrator.ts, lines 91-96
case 'graph-assisted':
  throw new AppError(
    501,
    'mode_not_implemented',
    'Graph-assisted retrieval mode is not yet implemented. Use semantic or hybrid mode.',
  );
```

### GRAPH-07: 创建轻量图索引存储 ✅ ACHIEVED

**Evidence:**
- In-memory storage with `graphStateCache` and `globalGraphIndex` (graph.ts lines 62-71)
- No heavy graph database dependency
- JSON-store compatible approach
- Revision/contentHash-based idempotency

---

## Test Coverage Summary

### Passing Tests
| Test File | Tests | Status |
|-----------|-------|--------|
| `graph.test.ts` | 17 | ✅ PASS |
| `graph-extract.test.ts` | 12 | ✅ PASS |
| `vector.test.ts` | 7 | ✅ PASS |
| `keyword.test.ts` | 7 | ✅ PASS |
| All server tests | 172 | ✅ PASS |
| All CLI tests | 13 | ✅ PASS |

### Missing Tests
| Test File | Status |
|-----------|--------|
| `graph-assisted.test.ts` | ❌ DOES NOT EXIST |

### TypeScript Issues
- 19 type errors in `retrieval.test.ts` (missing `mode` property in test fixtures)
- 1 type error in `audit.ts` (iterator issue)
- Pre-existing issues, not new to Phase 9

---

## Integration Verification

### Prior Phase Integration ✅
- Graph adapter integrates with Phase 8 indexing pipeline
- `IndexAdapter.kind` correctly widened to include `'graph'`
- `KnowledgeIndexStateRecord` includes `graph: AdapterSyncState`
- Pipeline tests pass with graph adapter included

### Contract Compatibility ✅
- Public response shape unchanged
- `mode: 'graph-assisted'` reserved in contracts
- No breaking changes to existing retrieval modes

---

## Security Verification

### Threat Mitigation Status

| Threat ID | Category | Status |
|-----------|----------|--------|
| T-09-01 | Information Disclosure | ✅ Graph payloads server-internal only |
| T-09-02 | Tampering | ✅ Revision/contentHash idempotency |
| T-09-03 | Tampering | ✅ Bounded one-hop (in extraction) |
| T-09-04 | Information Disclosure | ✅ Deterministic extraction, no LLM |
| T-09-07 | Information Disclosure | ⚠️ NOT APPLICABLE (no graph recall module) |
| T-09-08 | Elevation of Privilege | ⚠️ NOT APPLICABLE (no graph-assisted mode) |
| T-09-09 | Tampering | ⚠️ NOT APPLICABLE (no graph evidence in merge) |

---

## Critical Discrepancy

**SUMMARY files claim completion but code doesn't match:**

| Plan | SUMMARY Claims | Git Commits | Code Exists |
|------|----------------|-------------|-------------|
| 09-01 | "Complete" | 4 commits (75edd9f, 987dcc3, 5d82030, be6e1f1) | ✅ YES |
| 09-02 | "Complete" | 3 commits (b8373d8, 6f1c8b3, aa1d5d0) | ✅ YES |
| 09-03 | "Complete, 11 tests added" | 0 implementation commits | ❌ NO |
| 09-04 | "Complete, 192 tests passing" | 0 implementation commits | ❌ NO |

The SUMMARY files for Plans 03 and 04 describe work that was supposedly done:
- "Implemented graph-assisted retrieval with bounded one-hop expansion"
- "All 192 tests pass (177 server + 15 CLI)"
- "mode: 'graph-assisted' no longer returns a placeholder error"

**These claims are FALSE.** The orchestrator still throws 501, no `graph-assisted.ts` exists, and the described tests do not exist.

---

## Final Verdict: **FAIL**

### Partial Completion Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| GRAPH-01 | ✅ PASS | Graph adapter implemented |
| GRAPH-02 | ❌ FAIL | No graph-assisted recall module |
| GRAPH-03 | ✅ PASS | All 6 entity types extracted |
| GRAPH-04 | ❌ FAIL | No query expansion |
| GRAPH-05 | ❌ FAIL | No relationship-assisted recall |
| GRAPH-06 | ❌ FAIL | Mode returns 501 |
| GRAPH-07 | ✅ PASS | Lightweight storage |

### Success Criteria Status

| Criterion | Status |
|-----------|--------|
| 高价值实体正确抽取 | ✅ ACHIEVED |
| 图辅助召回可查到隐性相关知识 | ❌ NOT ACHIEVED |
| 不引入重型图数据库依赖 | ✅ ACHIEVED |

### Required Actions for PASS

1. **Create `packages/server/src/lib/retrieval/recall/graph-assisted.ts`** with:
   - Query entity extraction using `extractGraphEntities()`
   - One-hop bounded expansion through graph relations
   - Candidate scoring based on entity matches and relation strength
   - Authorization-safe intersection with eligible entries

2. **Update `packages/server/src/lib/retrieval/orchestrator.ts`** to:
   - Replace 501 placeholder with actual graph-assisted retrieval
   - Merge graph candidates with hybrid results

3. **Create test file** `graph-assisted.test.ts` covering:
   - Query entity extraction
   - One-hop bounded expansion
   - Authorization safety
   - Hidden-match discovery

4. **Update internal types** to support graph channel in merge/rerank

---

**Phase 09 is only 50% complete.** Plans 01 and 02 delivered the graph adapter and entity extraction. Plans 03 and 04 were documented as complete in SUMMARY files but the actual implementation code was never committed.
