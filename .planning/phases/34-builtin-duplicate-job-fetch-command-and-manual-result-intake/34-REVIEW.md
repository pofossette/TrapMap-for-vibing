# Phase 34 Review: Builtin Duplicate Job Fetch Command and Manual Result Intake

**Review Date**: 2026-04-24
**Reviewer**: Claude Opus 4.6
**Depth**: Standard

## Summary

Phase 34 implements CLI commands and server routes for fetching duplicate job bundles and submitting manual resolutions. The implementation is well-structured with proper validation, type safety, and user operation logging.

## Files Reviewed

| File | Purpose |
|------|---------|
| `packages/contracts/src/domain/candidates.ts` | Schema definitions for candidates, duplicate cases, and manual results |
| `packages/server/src/lib/candidates/store.ts` | Store operations for candidate submissions and manual results |
| `packages/server/src/routes/candidates.ts` | API routes for duplicate bundle fetch and manual result submission |
| `packages/server/src/app.ts` | Server configuration and route registration |
| `packages/server/src/lib/user-ops-log.ts` | User operation logging utilities |
| `packages/cli/src/commands/skill.ts` | CLI commands for duplicate job workflow |
| `packages/cli/src/index.ts` | CLI entry point and command registration |

## Findings

### 1. Contract Layer (`candidates.ts`)

**Strengths:**
- Comprehensive schema definitions with proper Zod validation
- `DuplicateJobBundleResponse` schema provides all necessary data for offline review
- `ManualResultSubmission` schema correctly requires `mergedWith` only for merged decisions
- Type exports are complete and consistent

**Observations:**
- `DuplicateJobMatchEntitySchema` handles both trap and skill entities with optional fields appropriately
- `ExpectedManualResultSchemaSchema` provides self-documenting schema for manual submissions

### 2. Store Layer (`store.ts`)

**Strengths:**
- `attachManualResult` correctly enforces `duplicate_detected` status requirement
- Returns previous result allowing correction/override functionality
- `ManualResultRecord` properly extends `ManualResultSubmission` with audit fields

**Code Quality:**
- Clean separation between candidate management and manual result handling
- Error messages are descriptive for debugging

### 3. Routes Layer (`candidates.ts`)

**Strengths:**
- `GET /v1/duplicates/:candidateId/bundle` builds comprehensive match entries with entity data
- Helper functions `buildTrapEntity` and `buildSkillEntity` properly handle different entity types
- Proper permission checks using `requirePermission(auth, 'knowledge:review')`
- Validates `mergedWith` requirement when decision is `merged`

**Observations:**
- Lines 342-344 indicate Phase 35 will handle actual state transitions
- Currently keeps status as `duplicate_detected` with manual result attached
- `nextState` calculation: `independent` → `ready_for_review`, `merged` → `rejected`

**Minor Issue:**
- Line 113 has redundant scope assignment: `const scope = body.sourceType === 'trap' ? body.payload.scope : body.payload.scope;` — both branches return the same value

### 4. Server Configuration (`app.ts`)

**Strengths:**
- New routes properly documented in `documentedRoutes` array
- `candidateRoutes` correctly registered with Fastify

### 5. User Operations Logging (`user-ops-log.ts`)

**Strengths:**
- `manual-result` action type added to `UserOpsAction` union
- Logging called correctly in routes (fire-and-forget pattern)

### 6. CLI Commands (`skill.ts`)

**Strengths:**
- `duplicate-job fetch` command properly fetches and formats bundle
- `duplicate-job resolve` command validates arguments thoroughly
- `formatDuplicateJobBundle` provides clear, structured text output
- Validates `--decision` must be `independent` or `merged`
- Requires `--merged-with` and `--merged-type` when decision is `merged`

**Code Quality:**
- Error messages are user-friendly
- Proper use of `requiredOption` for mandatory flags

### 7. CLI Entry Point (`index.ts`)

**Strengths:**
- Commands gated behind `visibility.allowKnowledgeReview` permission
- Commands listed in `api:list` output for discoverability

## Verification Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| `trapmap skill duplicate-job fetch <candidateId>` | ✅ Implemented | Fetches bundle, formats output |
| `trapmap skill duplicate-job resolve <candidateId>` | ✅ Implemented | Validates and submits resolution |
| `GET /v1/duplicates/:candidateId/bundle` | ✅ Implemented | Returns full bundle with entity data |
| `POST /v1/candidates/:candidateId/manual-result` | ✅ Implemented | Validates and stores manual result |
| Permission checks | ✅ Verified | `knowledge:review` required |
| User operation logging | ✅ Verified | `manual-result` action logged |
| Schema validation | ✅ Verified | Zod schemas parse all I/O |

## Recommendations

1. **Minor Code Cleanup**: Fix redundant scope assignment on line 113 of `candidates.ts` routes
2. **Future Phase**: Phase 35 should handle the actual state transitions currently stubbed

## Conclusion

Phase 34 implementation is complete and well-structured. The code follows established patterns, includes proper validation, and integrates cleanly with existing systems. No blocking issues found.
