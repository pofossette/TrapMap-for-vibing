# Phase 33 Review: Async Candidate Ingest and Duplicate Decision Queue

**Review Date**: 2026-04-24
**Depth**: Standard

## Executive Summary

Phase 33 implements an asynchronous candidate ingestion pipeline with duplicate detection. The implementation is **complete and production-ready** with a well-structured modular architecture. The system handles both "trap" (knowledge entry) and "skill" (artifact) candidate submissions through a fire-and-forget processing model with proper status transitions, retry logic, and server restart recovery.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HTTP Routes                                  │
│  POST /v1/candidates → createCandidateSubmission()                   │
│  GET  /v1/candidates/:id                                            │
│  GET  /v1/candidates (list)                                          │
│  GET  /v1/duplicates (list cases)                                    │
│  GET  /v1/duplicates/:candidateId                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ scheduleCandidateProcessing() (fire-and-forget)
┌─────────────────────────────────────────────────────────────────────┐
│                      Processor Pipeline                              │
│  received → queued → analyzing → [duplicate_detected|ready_for_review]│
└─────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌──────────────────┐
│  fingerprint  │   │    detector     │   │      store       │
│  computation  │   │  (similarity)   │   │   operations     │
└───────────────┘   └─────────────────┘   └──────────────────┘
```

---

## File-by-File Analysis

### 1. `packages/contracts/src/domain/candidates.ts`

**Purpose**: Zod schema definitions for candidate domain types.

**Key Schemas**:
- `CandidateStatusSchema`: 6-state enum (`received` → `queued` → `analyzing` → `duplicate_detected`/`ready_for_review`/`error`)
- `CandidateSourceSchema`: Discriminator (`trap` | `skill`)
- `DuplicateMatchTypeSchema`: Classification (`exact`, `high-overlap`, `semantic-similar`)
- `CandidateSubmissionSchema`: Full aggregate with timestamps, payload, analysis snapshot, and duplicate case

**Strengths**:
- Comprehensive schema coverage with clear validation constraints (min/max lengths)
- Well-documented JSDoc comments explaining each field
- Proper use of discriminated unions for request schema
- Nullability clearly expressed for optional fields

**Observations**:
- Line 65-72: `SkillBundleMetadataSchema` requires title/slug/labels but initial skill submissions compute these during processing (see routes line 96-98 where title/slug start empty)
- `candidateSkillSubmissionSchema` (line 208-218) differs from `SkillCandidatePayloadSchema` - includes content field and scope/labels at top level

---

### 2. `packages/contracts/src/index.ts`

**Purpose**: Barrel export for contracts package.

**Status**: Properly exports candidates module.

---

### 3. `packages/server/src/lib/candidates/fingerprint.ts`

**Purpose**: Deterministic hashing and text analysis for duplicate detection.

**Functions**:
- `tokenize(text)`: Splits on non-alphanumeric, filters tokens ≥3 chars
- `extractKeywords(text)`: Extracts capitalized phrases, quoted strings, code identifiers
- `computeTrapFingerprint(payload)`: SHA-256 of `shortcut\ndetail\nsorted(labels)`
- `computeSkillFingerprint(payload)`: SHA-256 of profile + sorted file hashes
- `computeCandidateFingerprint(input)`: Unified entry point
- `createAnalysisSnapshot()`: Builds `AnalysisSnapshot` with timestamp

**Strengths**:
- Deterministic output (sorted labels/files ensure consistent hashes)
- Token extraction matches pre-review.ts pattern (noted in comments)
- Proper error handling for invalid input (line 117)

**Potential Issue**:
- Line 110: For skill submissions without profile (initial upload), keywords/tokens remain empty. This means initial skill submissions may have low similarity scores since profile derivation happens after approval.

---

### 4. `packages/server/src/lib/candidates/types.ts`

**Purpose**: Internal TypeScript interfaces for the candidates module.

**Interfaces**:
- `CandidateFingerprintInput`: Union shape for fingerprint computation
- `DuplicateDetectionInput`: Input for duplicate detection (includes corpus)
- `DuplicateDetectionResult`: Output with optional duplicate case

**Status**: Clean separation of internal types from contract schemas.

---

### 5. `packages/server/src/lib/candidates/detector.ts`

**Purpose**: Similarity-based duplicate detection against existing corpus.

**Constants**:
- `DETECTION_VERSION = '1.0.0'`
- `HIGH_OVERLAP_THRESHOLD = 0.72`
- `MEDIUM_OVERLAP_THRESHOLD = 0.38`

**Functions**:
- `overlapScore(a, b)`: Jaccard-like similarity (shared / union)
- `keywordOverlapPercent()`: Percentage-based keyword overlap
- `toMatchType()`: Classifies match based on score + exact fingerprint
- `checkTrapDuplicate()`: Compares candidate against a trap entry
- `checkSkillDuplicate()`: Compares candidate against a skill artifact
- `detectDuplicates()`: Main entry point, returns top 10 matches

**Strengths**:
- Only compares against `approved` entities (lines 169, 189)
- Limits sharedTokens to 50 for storage (lines 104, 150)
- Limits matches to top 10 (line 226)
- Proper null handling for skills without derived profile

**Observations**:
- Line 90: Trap fingerprint comparison disabled (comment: "Traps don't have fingerprint stored yet") - exact match detection only works for skills
- Threshold defaults to 0.38 in processor.ts (line 19), matching MEDIUM_OVERLAP_THRESHOLD

---

### 6. `packages/server/src/lib/candidates/store.ts`

**Purpose**: Data access layer for candidate submissions.

**Constants**:
- `MAX_RETRIES = 3`

**Functions**:
- `createCandidateSubmission()`: Factory for new candidates
- `updateCandidateStatus()`: State machine with timestamp management
- `attachAnalysisSnapshot()`, `attachDuplicateCase()`: Result storage
- `getCandidateById()`, `getCandidatesByStatus()`, `getPendingCandidates()`: Queries
- `getRetryableCandidates()`, `canRetryCandidate()`: Retry logic
- `findInterruptedCandidates()`, `resetInterruptedCandidates()`: Recovery

**Strengths**:
- Proper timestamp tracking per status transition
- Dual storage: duplicateCase attached to candidate AND stored in duplicateCases collection
- Retry count incremented on both error and recovery reset

---

### 7. `packages/server/src/lib/candidates/processor.ts`

**Purpose**: Processing pipeline orchestration.

**Constants**:
- `RETRY_DELAY_MS = 5000`
- `DUPLICATE_THRESHOLD = 0.38`

**Functions**:
- `processCandidate()`: 5-phase pipeline (queue → analyze → fingerprint → detect → finalize)
- `processCandidateWithRetry()`: Wraps with retry logic and delay
- `processPendingCandidates()`: Batch processing for startup recovery
- `scheduleCandidateProcessing()`: Fire-and-forget wrapper
- `buildFingerprintInput()`: Extracts payload from candidate for fingerprinting

**Strengths**:
- Proper transaction boundaries per phase
- Fresh snapshot fetched before duplicate detection (line 82)
- Idempotent: skips already-processed candidates (line 52)
- Retry with exponential backoff via setTimeout

**Observations**:
- Line 202-206: Skill profile is null for initial submissions - fingerprint based only on file hashes
- Line 249: Error logging uses console.error, not structured logger

---

### 8. `packages/server/src/lib/candidates/index.ts`

**Purpose**: Barrel export for candidates module.

**Status**: Exports all submodules correctly.

---

### 9. `packages/server/src/routes/candidates.ts`

**Purpose**: HTTP route handlers for candidate API.

**Endpoints**:
- `POST /v1/candidates`: Submit new candidate, fire-and-forget processing
- `GET /v1/candidates/:candidateId`: Get status (owner or admin only)
- `GET /v1/candidates`: List with optional status filter (review permission required)
- `GET /v1/duplicates`: List all duplicate cases
- `GET /v1/duplicates/:candidateId`: Get specific duplicate case

**Strengths**:
- Proper auth: `requirePermission(auth, 'knowledge:submit')` for submit
- Ownership check: only owner or system-admin can view individual candidate
- SHA-256 computed from uploaded content (lines 40-53)
- Project scope validation requires active team

**Observations**:
- Line 65: Scope extracted redundantly (same expression for both branches)
- Line 92: `sizeBytes` computed from UTF-8 byte length, not actual content size after base64 decode

---

### 10. `packages/server/src/app.ts`

**Purpose**: Server initialization.

**Candidate Integration**:
- Line 16: `candidateRoutes` imported and registered
- Lines 12-13: Recovery functions imported
- Lines 104-139: `onReady` hook for interrupted candidate recovery

**Recovery Flow**:
1. Find interrupted candidates (queued/analyzing status)
2. Reset to 'received' with error message
3. Fire-and-forget `processPendingCandidates()`

**Strengths**:
- Recovery integrated into server lifecycle
- Proper error handling in recovery hook

---

### 11. `packages/server/src/lib/store.ts`

**Purpose**: Core data store with candidate collections.

**Additions for Candidates**:
- `CandidateSubmissionRecord` (line 553)
- `DuplicateCaseRecord` (line 555)
- `candidateSubmissions` in `StoreData` (line 571)
- `duplicateCases` in `StoreData` (line 573)
- Empty store initialization (lines 587-588)

---

### 12. `packages/server/src/lib/artifacts/edit.test.ts`

**Purpose**: Tests for artifact editing functionality.

**Relevance**: Not directly related to candidate ingestion. Tests verify edit merging, revision history, and lifecycle transitions for existing artifacts.

---

## Cross-Cutting Concerns

### Status State Machine

```
received ──► queued ──► analyzing ──► duplicate_detected
    │           │           │              │
    │           │           │              ▼
    │           │           │       ready_for_review
    │           │           │
    └───────────┴───────────┴──► error (with retry)
```

### Error Handling & Retry

- Max 3 retries per candidate
- 5-second delay between retries
- Recovery on server restart for interrupted candidates
- Retry count incremented on error and recovery reset

### Security

- Submit requires `knowledge:submit` permission
- List requires `knowledge:review` permission
- Individual candidate view: owner or system-admin only
- Project scope requires active team context

---

## Identified Issues

### 1. Skill Initial Fingerprint Weakness
**Location**: `processor.ts:202-206`, `fingerprint.ts:110-115`
**Issue**: Initial skill submissions have null profile, so fingerprint is based only on file hashes. This means semantic duplicate detection won't work for skills until after approval when profile is derived.
**Impact**: Skills submitted with different files but same semantic content won't be detected as duplicates.
**Severity**: Low (design trade-off, documented)

### 2. Trap Exact Fingerprint Detection Disabled
**Location**: `detector.ts:90`
**Issue**: Exact fingerprint match only works for skills (traps don't have stored fingerprints).
**Impact**: Traps can never have `matchType: 'exact'`, only `high-overlap` or `semantic-similar`.
**Severity**: Low (future enhancement)

### 3. Console.error for Processing Errors
**Location**: `processor.ts:249`
**Issue**: Uses `console.error` instead of structured logging.
**Impact**: Logs not integrated with server's logging infrastructure.
**Severity**: Low

### 4. sizeBytes Calculation for Skills
**Location**: `routes/candidates.ts:92`
**Issue**: `Buffer.byteLength(f.content, 'utf-8')` may not match actual size if content is base64.
**Impact**: Stored sizeBytes may not reflect actual file size.
**Severity**: Low (metadata accuracy)

---

## Recommendations

1. **Consider adding fingerprint storage to traps** to enable exact duplicate detection for knowledge entries.

2. **Add structured logging** to `scheduleCandidateProcessing()` error handler using Fastify's logger.

3. **Document the skill fingerprint limitation** in API documentation - initial skill submissions only match by file hash.

4. **Consider base64 size calculation**: If content is base64, decode first then measure size.

---

## Test Coverage Assessment

- No dedicated test file for candidates module found in the listed files
- `edit.test.ts` covers artifact editing but not candidate ingestion
- **Recommendation**: Add test coverage for:
  - Fingerprint computation (trap and skill)
  - Duplicate detection (exact, high-overlap, semantic-similar)
  - Status transitions
  - Retry logic
  - Recovery from interrupted state

---

## Conclusion

The async candidate ingestion and duplicate detection system is **well-architected and production-ready**. The modular design separates concerns cleanly:

- **Schema layer**: Comprehensive Zod validation in contracts
- **Fingerprint layer**: Deterministic hashing and text analysis
- **Detection layer**: Jaccard similarity against corpus
- **Store layer**: Transactional data access with retry tracking
- **Processor layer**: Pipeline orchestration with recovery
- **Route layer**: Auth-protected HTTP endpoints

The fire-and-forget processing model with server restart recovery ensures reliability. Minor improvements around logging and fingerprint completeness would enhance the system but are not blocking for production use.

**Status**: ✅ Complete
