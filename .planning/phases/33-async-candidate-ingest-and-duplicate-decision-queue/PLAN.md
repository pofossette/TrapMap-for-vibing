# Phase 33: Async Candidate Ingest and Duplicate Decision Queue - Plan Summary

**Created:** 2026-04-24
**Status:** Ready for execution
**Goal:** Introduce asynchronous ingestion boundary for new skill and trap submissions so duplicate analysis happens after upload, not inline in the request path.

## Overview

Phase 33 establishes the infrastructure for async candidate processing:

1. **Candidate Types & Store** - Define candidate submission and duplicate case types
2. **Fingerprint & Detection** - Implement deterministic fingerprinting and unified duplicate detection
3. **Store Operations** - CRUD for candidates with lifecycle state management
4. **Async Processor** - Fire-and-forget processing with retry logic
5. **API Routes** - REST endpoints for submission and status queries
6. **Startup Recovery** - Reprocess interrupted candidates on server restart

## Plans (6 total)

| Plan | Wave | Description | Depends On |
|------|------|-------------|------------|
| [33-01](./33-01-PLAN.md) | 1 | Candidate submission types and store integration | - |
| [33-02](./33-02-PLAN.md) | 2 | Fingerprint computation and unified duplicate detector | 33-01 |
| [33-03](./33-03-PLAN.md) | 3 | Candidate store CRUD operations | 33-01, 33-02 |
| [33-04](./33-04-PLAN.md) | 4 | Async candidate processor | 33-02, 33-03 |
| [33-05](./33-05-PLAN.md) | 5 | Candidate API routes | 33-01, 33-03, 33-04 |
| [33-06](./33-06-PLAN.md) | 6 | Startup recovery for in-flight candidates | 33-04, 33-05 |

## Execution Order

```
Wave 1: 33-01 (types and store schema)
    ↓
Wave 2: 33-02 (fingerprint and detector)
    ↓
Wave 3: 33-03 (store CRUD operations)
    ↓
Wave 4: 33-04 (async processor)
    ↓
Wave 5: 33-05 (API routes)
    ↓
Wave 6: 33-06 (startup recovery)
```

## Key Architectural Decisions

### 1. Async Processing Pattern
- **Choice:** In-process async (fire-and-forget) using Fastify's async capabilities
- **Rationale:** No external queue infrastructure required for MVP; store state enables recovery
- **Future:** Can migrate to BullMQ + Redis for production scale

### 2. Duplicate Detection Thresholds
- **High overlap:** 0.72 (same as existing pre-review.ts)
- **Medium overlap:** 0.38 (same as existing pre-review.ts)
- **Rationale:** Maintain consistency with existing duplicate risk scoring

### 3. Candidate Lifecycle States
```
received → queued → analyzing → duplicate_detected
                              → ready_for_review
                              → error
```

### 4. Cross-Domain Comparison
- Detects duplicates against both `knowledgeEntries` (traps) and `skillArtifacts`
- Only compares against `lifecycleState === 'approved'` entities

### 5. Original Payload Preservation
- Immutable snapshot stored before any processing
- Enables later manual review and decision making

## Files Created

```
packages/contracts/src/domain/candidates.ts     # Candidate and duplicate types
packages/server/src/lib/candidates/
├── types.ts                                    # Internal type definitions
├── fingerprint.ts                              # Fingerprint computation
├── detector.ts                                 # Unified duplicate detector
├── store.ts                                    # CRUD operations
├── processor.ts                                # Async processing pipeline
├── index.ts                                    # Barrel exports
packages/server/src/routes/candidates.ts        # REST API routes
```

## Files Modified

```
packages/server/src/lib/store.ts                # Add candidateSubmissions, duplicateCases
packages/server/src/app.ts                      # Register routes, startup recovery
packages/contracts/src/index.ts                 # Export candidate types
```

## Success Criteria

1. **Async Boundary:** Submission endpoints return immediately with candidate ID and status `received`
2. **Payload Preservation:** Original payload stored immutably before any processing
3. **Duplicate Detection:** Async processing detects duplicates against both traps and skills
4. **Duplicate Case Record:** Persistent record with matched entities and similarity details
5. **No Publication:** Published entries/artifacts remain untouched during candidate lifecycle
6. **Recovery:** Server restart recovers in-flight candidates for processing

## Out of Scope (Deferred to Later Phases)

- CLI fetch command for duplicate-case bundles (Phase 34)
- Manual resolution result schema and validation (Phase 34)
- Final merge/trim/supersede publication logic (Phase 35)
- Automatic cluster cleanup after case resolution (Phase 35)
- Semantic embedding similarity (future enhancement)

## Verification Commands

```bash
# Build contracts
pnpm --filter @trapmap/contracts build

# Build server
pnpm --filter @trapmap/server build

# Start server and verify routes
pnpm --filter @trapmap/server dev &
curl http://localhost:3000/docs/json | grep '/v1/candidates'

# Submit a candidate
curl -X POST http://localhost:3000/v1/candidates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sourceType":"trap","payload":{"scope":"global","labels":["test"],"shortcut":"Test","detail":"Test detail"}}'

# Check status
curl http://localhost:3000/v1/candidates/candidate_1 \
  -H "Authorization: Bearer $TOKEN"
```

## Traceability

| Requirement | Coverage |
|-------------|----------|
| Async ingestion | Plans 33-04, 33-05 |
| Original payload preservation | Plans 33-01, 33-03 |
| Cross-domain duplicate detection | Plan 33-02 |
| Duplicate case record | Plans 33-01, 33-02, 33-03 |
| Startup recovery | Plan 33-06 |
