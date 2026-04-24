# Phase 33: 异步候选入库与重复判定队列，保留原始上传快照 - Research

**Gathered:** 2026-04-24
**Status:** Research complete

---

## Summary

Phase 33 introduces an asynchronous ingestion boundary for new skill and trap submissions, moving duplicate detection from inline request handling to post-upload processing. This phase establishes the candidate capture, duplicate detection, and durable provenance infrastructure without changing the final publication flow.

---

## Current Architecture Analysis

### Submission Flow (Inline, Synchronous)

| Endpoint | Handler | Duplicate Check | Outcome |
|----------|---------|-----------------|---------|
| `POST /v1/traps` | `trapRoutes` | `runPreReview()` inline | Immediate creation with `agent-pass` or `agent-rejected` |
| `POST /v1/operations/artifacts/import` | `operationsRoutes` | `runPreReview()` inline | Immediate artifact creation |
| `POST /v1/knowledge` | `knowledgeRoutes` | `runPreReview()` inline | Immediate entry creation |

**Current Pre-Review Flow:**
```
Request → Auth Validation → runPreReview() → Store Entry → Response
                                   ↓
                           Token-based overlap scoring
                           against existing entries
                           (synchronous, blocking)
```

### Existing Duplicate Detection Logic

**Location:** `packages/server/src/lib/pre-review.ts`

```typescript
// Current implementation
function overlapScore(a: Set<string>, b: Set<string>): number {
  // Jaccard-like overlap: shared / union
  return shared / new Set([...a, ...b]).size;
}

// Risk thresholds
function toRisk(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.72) return 'high';  // ~72% overlap
  if (score >= 0.38) return 'medium'; // ~38% overlap
  return 'low';
}
```

**Limitations:**
- Only compares against `knowledgeEntries` (traps), not `skillArtifacts`
- Blocking call during request handling
- No persistent duplicate-case record
- Single similarity metric (token overlap)
- No distinction between exact vs semantic duplicates

### Lifecycle States (Current)

```typescript
// From contracts/src/domain/common.ts
const lifecycleStateSchema = z.enum([
  'draft',
  'submitted',
  'agent-pass',
  'agent-rejected',
  'approved',
  'rejected',
  'deactivated',
]);
```

**State Transitions (Current):**
```
submitted → agent-pass → approved (via reviewer)
submitted → agent-rejected → rejected (or resubmitted)
agent-pass → approved (via reviewer approval)
```

### Data Models

**KnowledgeEntry (Trap):**
- Inline `shortcut` and `detail` text fields
- `agentReview` field captures pre-review result
- `submissionHistory` tracks revisions

**SkillArtifact:**
- Structured revision history with `files[]`
- `derived` outputs (profile, capsules, manifest)
- Similar `agentReview` and `reviewHistory` patterns

---

## Gap Analysis

### What's Missing for Async Candidate Flow

| Gap | Current State | Required State |
|-----|---------------|----------------|
| Candidate lifecycle | No candidate concept; immediate creation | States: `received`, `queued`, `analyzing`, `duplicate_detected` |
| Original payload preservation | Not stored separately | Immutable snapshot before any processing |
| Duplicate-case record | Only `duplicateRisk: 'low'|'medium'|'high'` | Full duplicate-case with matched IDs, similarity scores, overlap details |
| Async processing | All inline | Job queue with post-commit execution |
| Cross-domain comparison | Only `knowledgeEntries` | Both `skillArtifacts` and `knowledgeEntries` |
| Duplicate type distinction | Single risk score | Exact vs semantic duplicate signals |

---

## Proposed Architecture

### New Data Structures

#### 1. Candidate Submission Record

```typescript
interface CandidateSubmissionRecord {
  id: string;
  // Source identification
  sourceType: 'trap' | 'skill';
  submittedBy: string; // userId
  teamId: string | null;

  // Lifecycle
  status: 'received' | 'queued' | 'analyzing' | 'duplicate_detected' | 'ready_for_review';

  // Original payload (immutable)
  originalPayload: {
    // For trap submissions
    trap?: KnowledgeSubmission;
    // For skill submissions
    skill?: ArtifactBundle;
  };

  // Derived analysis snapshot
  analysisSnapshot: {
    normalizedAt: string;
    fingerprint: string; // Hash of derived content
    profile?: DerivedSkillProfileRecord; // For skills
    keywords: string[];
    tokens: string[];
  } | null;

  // Duplicate case (if detected)
  duplicateCase: DuplicateCaseRecord | null;

  // Timestamps
  receivedAt: string;
  queuedAt: string | null;
  analyzingAt: string | null;
  completedAt: string | null;

  // Error tracking
  lastError: string | null;
  retryCount: number;
}
```

#### 2. Duplicate Case Record

```typescript
interface DuplicateCaseRecord {
  id: string;
  candidateId: string;

  // Detection metadata
  detectedAt: string;
  detectionVersion: string; // Algorithm version for reproducibility

  // Matched entities
  matches: DuplicateMatchRecord[];

  // Aggregate signals
  highestSimilarity: number;
  hasExactDuplicate: boolean;
  duplicateType: 'exact' | 'semantic' | 'none';

  // Analysis preserved for review
  candidateSnapshot: {
    fingerprint: string;
    keywords: string[];
    profile?: DerivedSkillProfileRecord;
  };
}

interface DuplicateMatchRecord {
  // Matched entity reference
  entityType: 'trap' | 'skill';
  entityId: string;
  entityTitle: string; // shortcut or title for display

  // Similarity metrics
  similarityScore: number; // 0-1
  matchType: 'exact' | 'high-overlap' | 'semantic-similar';

  // Overlap details for manual review
  overlapDetails: {
    sharedKeywords: string[];
    sharedTokens: string[];
    textOverlapPercent: number;
  };
}
```

### New Store Collections

```typescript
interface StoreData {
  // Existing...
  knowledgeEntries: KnowledgeRecord[];
  skillArtifacts: SkillArtifactRecord[];

  // New for Phase 33
  candidateSubmissions: CandidateSubmissionRecord[];
  duplicateCases: DuplicateCaseRecord[];
}
```

### Candidate Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     SUBMISSION REQUEST                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │    received     │
                    │  (store origin  │
                    │   payload)      │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     queued      │
                    │ (awaiting       │
                    │  analysis)      │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   analyzing     │
                    │ (fingerprint,   │
                    │  dedupe check)  │
                    └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
      ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
      │ duplicate_  │ │ready_for_   │ │   error     │
      │ detected    │ │ review      │ │             │
      └─────────────┘ └─────────────┘ └─────────────┘
              │               │
              │               ▼
              │      Creates published
              │      entry/artifact
              │      (Phase 34/35)
              ▼
      Manual resolution
      (Phase 34/35)
```

### Async Processing Pattern

**Option A: In-Process Async (Recommended for MVP)**
- No external queue infrastructure required
- Use Fastify's async capabilities with fire-and-forget pattern
- Similar to existing `logUserOperation()` pattern
- Store state transitions enable recovery/retry

```typescript
// In route handler
app.post('/v1/traps', async (request) => {
  // ... auth validation ...

  const candidate = await store.transact((data) => {
    const record = createCandidateSubmission({
      sourceType: 'trap',
      payload,
      status: 'received',
      submittedBy: auth.user.id,
      teamId: auth.activeTeamId,
    });
    data.candidateSubmissions.push(record);
    return record;
  });

  // Fire-and-forget async processing
  void processCandidateAsync(candidate.id, app.skillShareer);

  return { candidateId: candidate.id, status: 'received' };
});
```

**Option B: Dedicated Job Queue (Future Enhancement)**
- BullMQ or similar for production scale
- Requires Redis or SQLite backing
- Better retry, scheduling, and monitoring
- Out of scope for Phase 33

---

## Cross-Domain Duplicate Detection

### Unified Duplicate Detector

```typescript
interface UnifiedDuplicateDetector {
  // Check candidate against both traps and skills
  detectDuplicates(
    candidate: CandidateSubmissionRecord,
    options: {
      trapEntries: KnowledgeRecord[];
      skillArtifacts: SkillArtifactRecord[];
      threshold: number;
    },
  ): Promise<DuplicateCaseRecord | null>;
}
```

### Comparison Strategies

| Strategy | Trap vs Trap | Skill vs Skill | Cross-Domain |
|----------|--------------|----------------|--------------|
| Token overlap | ✓ Primary | ✓ Primary | ✓ (derived content) |
| Exact hash match | ✓ (full text) | ✓ (sourceHash) | ✗ (different structure) |
| Semantic embedding | Future | Future | Future |
| Keyword intersection | ✓ | ✓ | ✓ (labels) |

### Fingerprint Computation

**For Traps:**
```typescript
function computeTrapFingerprint(submission: KnowledgeSubmission): string {
  const content = `${submission.shortcut}\n${submission.detail}`;
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
```

**For Skills:**
```typescript
function computeSkillFingerprint(bundle: ArtifactBundle): string {
  // Use sourceHash from normalization
  return normalizeArtifactBundle({ bundle, ... }).sourceHash;
}
```

---

## Implementation Considerations

### Immutability Guarantees

1. **Original Payload:** Stored as-is before any processing
2. **Analysis Snapshot:** Computed once, never modified
3. **Duplicate Case:** Created at detection time, preserved for review

### Error Handling

```typescript
// Retry policy
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function processCandidateWithRetry(
  candidateId: string,
  services: SkillShareerServices,
): Promise<void> {
  const candidate = await loadCandidate(candidateId);

  if (candidate.retryCount >= MAX_RETRIES) {
    await markCandidateError(candidateId, 'Max retries exceeded');
    return;
  }

  try {
    await processCandidate(candidateId, services);
  } catch (error) {
    await incrementRetryCount(candidateId);
    // Schedule retry (in-process: setTimeout, queue: automatic)
    setTimeout(() => processCandidateWithRetry(candidateId, services), RETRY_DELAY_MS);
  }
}
```

### Idempotency

- Candidate processing must be idempotent
- Status transitions must be atomic
- Duplicate detection must be deterministic

### Backward Compatibility

| Concern | Mitigation |
|---------|------------|
| Existing submission endpoints | Keep working, add candidate mode behind feature flag |
| Existing pre-review | Continue to work for inline mode |
| CLI commands | Add `--async` flag for candidate mode |

---

## Files to Create/Modify

### New Files

| Path | Purpose |
|------|---------|
| `packages/server/src/lib/candidates/types.ts` | Candidate and duplicate-case types |
| `packages/server/src/lib/candidates/store.ts` | Candidate CRUD operations |
| `packages/server/src/lib/candidates/processor.ts` | Async processing logic |
| `packages/server/src/lib/candidates/detector.ts` | Unified duplicate detection |
| `packages/server/src/lib/candidates/fingerprint.ts` | Fingerprint computation |
| `packages/server/src/routes/candidates.ts` | Candidate API routes |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/server/src/lib/store.ts` | Add `candidateSubmissions`, `duplicateCases` to StoreData |
| `packages/server/src/routes/traps.ts` | Add candidate mode to submission |
| `packages/server/src/routes/operations.ts` | Add candidate mode to artifact import |
| `packages/server/src/app.ts` | Register candidate routes |
| `packages/contracts/src/domain/candidates.ts` | Candidate contracts (new file) |

---

## Dependencies

### Phase Dependencies

| Phase | Dependency Reason |
|-------|-------------------|
| Phase 32 | Governance module provides eligibility checking for existing entities |

### Code Dependencies

| Module | Uses | Impact |
|--------|------|--------|
| `governance/eligibility.ts` | `isGovernanceEligible()` | Check existing entity accessibility |
| `indexing/events.ts` | Post-commit pattern | Model for async processing |
| `pre-review.ts` | Token overlap logic | Starting point for duplicate detection |
| `import-export.ts` | `normalizeArtifactBundle()` | Skill fingerprint computation |

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Processing backlog with large corpus | Medium | Medium | Pagination for duplicate checks, background throttling |
| Lost candidates on server restart | Medium | High | Persist state immediately, recovery job on startup |
| Duplicate detection false positives | Medium | Medium | Keep overlap details for manual review |
| Breaking existing submission flow | Low | High | Feature flag for candidate mode, extensive testing |
| Storage bloat from candidate retention | Low | Low | Cleanup policy after resolution (Phase 35) |

---

## Open Questions for Planning

1. **Feature Flag Name:** What should the flag be named? `CANDIDATE_MODE_ENABLED`? `ASYNC_INGEST_ENABLED`?

2. **Processing Trigger:** Should processing start immediately on `received` or wait for explicit `queued`? Fire-and-forget vs explicit queue endpoint?

3. **Duplicate Detection Thresholds:** Keep existing thresholds (0.72 high, 0.38 medium) or adjust for cross-domain comparison?

4. **Candidate Retention:** How long to keep candidate records after resolution? Part of Phase 35?

5. **API Response Shape:** Should submission endpoints return `{ candidateId, status }` or existing `{ entry }` shape for compatibility?

6. **Cross-Domain Similarity:** Should semantic similarity (embeddings) be included in Phase 33 or deferred?

---

## Success Criteria

1. **Async Boundary:** Submission endpoints return immediately with candidate ID and status `received`
2. **Payload Preservation:** Original payload stored immutably before any processing
3. **Duplicate Detection:** Async processing detects duplicates against both traps and skills
4. **Duplicate Case Record:** Persistent record with matched entities and similarity details
5. **No Publication:** Published entries/artifacts remain untouched during candidate lifecycle
6. **Recovery:** Server restart recovers in-flight candidates for processing

---

## Next Steps for Planning

1. Decide on feature flag approach (env var vs config)
2. Define exact candidate lifecycle states and transitions
3. Design candidate API routes and contracts
4. Plan async processing implementation (fire-and-forget pattern)
5. Define duplicate-case schema with all required fields
6. Plan migration path for existing pre-review logic
