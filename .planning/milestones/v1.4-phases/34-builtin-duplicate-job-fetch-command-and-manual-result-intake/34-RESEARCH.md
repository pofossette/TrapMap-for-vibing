# Phase 34: Built-in Duplicate Job Fetch Command and Manual Result Intake - Research

**Gathered:** 2026-04-24
**Status:** Research complete

---

## Summary

Phase 34 builds operator-facing CLI commands for fetching duplicate-job bundles and submitting manual resolution results. This phase requires adding client commands to the existing `skill.ts` command family, enhancing server endpoints to return full job bundles, and creating new intake endpoints for manual resolution results.

---

## Prior Phase Analysis

### Phase 33 Deliverables (Foundation)

Phase 33 established the async candidate ingestion infrastructure:

| Component | Location | Purpose |
|-----------|----------|---------|
| `CandidateSubmission` type | `packages/contracts/src/domain/candidates.ts` | Stores submission with lifecycle states |
| `DuplicateCase` type | `packages/contracts/src/domain/candidates.ts` | Records detected duplicates with matches |
| Candidate store | `packages/server/src/lib/candidates/store.ts` | CRUD operations for candidates |
| Duplicate detector | `packages/server/src/lib/candidates/detector.ts` | Unified trap/skill duplicate detection |
| Async processor | `packages/server/src/lib/candidates/processor.ts` | Fire-and-forget candidate processing |
| REST API routes | `packages/server/src/routes/candidates.ts` | `/v1/candidates`, `/v1/duplicates` endpoints |

### Current API Surface

**Existing endpoints from Phase 33:**
```
POST   /v1/candidates           - Submit new candidate
GET    /v1/candidates/:id       - Get candidate status
GET    /v1/candidates           - List candidates (with status filter)
GET    /v1/duplicates           - List all duplicate cases
GET    /v1/duplicates/:id       - Get duplicate case for candidate
```

**Current `GET /v1/duplicates/:candidateId` returns:**
```typescript
{
  duplicateCase: {
    id: string;
    candidateId: string;
    detectedAt: string;
    detectionVersion: string;
    matches: DuplicateMatch[];
    highestSimilarity: number;
    hasExactDuplicate: boolean;
    duplicateType: 'exact' | 'semantic' | 'none';
  }
}
```

**Gap:** The endpoint returns the duplicate case but not the full job bundle needed for offline review (original candidate payload, matched entity data, analysis details).

---

## Current Architecture Analysis

### CLI Command Pattern

**Location:** `packages/cli/src/commands/skill.ts`

Existing command structure follows a consistent pattern:
1. Load CLI state and require session token
2. Call API endpoint via `apiRequest()`
3. Parse response with zod schema
4. Format output via `printResult()` with optional `--json` flag

```typescript
// Example pattern from skill.ts
skill
  .command('search-by-content')
  .description('Search for skills by content text')
  .argument('<text>', 'Search text')
  .option('--max-results <n>', 'Maximum number of matches', '10')
  .option('--json', 'Output JSON')
  .action(async (text: string, flags: { maxResults: string; json?: boolean }) => {
    const state = await loadCliState();
    requireSessionToken(state);
    const response = await apiRequest<SkillLookupResponse>(state, { ... });
    const parsed = skillLookupResponseSchema.parse(response.data);
    printResult(parsed, flags, formatSkillLookupResponse);
  });
```

### Artifact Export Pattern

**Location:** `packages/cli/src/commands/operations.ts`

The `artifact-export` command demonstrates the pattern for fetching and materializing artifact bundles:
- Request bundle from server
- Output as JSON or materialize to directory
- Validate output paths for security

```typescript
// artifact-export pattern
program
  .command('artifact-export')
  .requiredOption('--artifact <artifactId>')
  .option('--format <format>', 'bundle-json | distilled-json | skill-dir')
  .option('--output <path>')
  .option('--json')
  .action(async (flags) => {
    const response = await apiRequest<ArtifactExportResponse>(state, { ... });
    if (flags.output && parsed.bundle) {
      await materializeSkillDirectory({ bundle: parsed.bundle, outputDir: validatedOutput });
    }
  });
```

### Server Bundle Formatting Pattern

**Location:** `packages/server/src/routes/operations.ts`

Artifact export uses `normalizeArtifactBundle()` and returns full bundle content:
```typescript
app.post('/v1/operations/artifacts/export', async (request) => {
  // Returns ArtifactExportResponse with full bundle including file content
  return artifactExportResponseSchema.parse({
    artifactId,
    title,
    bundle: artifactBundle, // Contains files with content
    exportedAt,
  });
});
```

### Store Data Available

**From Phase 33 store:**
- `candidateSubmissions` - Contains `originalPayload` with trap/skill data
- `duplicateCases` - Contains detection results with matches
- `knowledgeEntries` - Trap data (for matched entities)
- `skillArtifacts` - Skill data (for matched entities)
- `artifactFilePayloads` - File content for skill artifacts

---

## Gap Analysis

### What's Missing for Phase 34

| Gap | Current State | Required State |
|-----|---------------|----------------|
| Job bundle endpoint | `/v1/duplicates/:id` returns only `DuplicateCase` | Endpoint returns full bundle with original payload, matched entity data, analysis |
| CLI fetch command | No command exists | `skill duplicate-job fetch <id>` or equivalent |
| CLI fetch output | N/A | Output bundle with retrieval command hint |
| Manual result schema | Not defined | Schema for two-independent-skills or one-merged-skill decisions |
| Manual result intake endpoint | Not defined | `POST /v1/candidates/:id/manual-result` or equivalent |
| Result retryable pattern | N/A | Allow correction of manual result without losing job |

---

## Proposed Architecture

### 1. Enhanced Job Bundle Endpoint

**Option A: Extend existing endpoint**
```
GET /v1/duplicates/:candidateId?include=bundle
```

**Option B: New dedicated endpoint**
```
GET /v1/duplicates/:candidateId/bundle
```

**Bundle Response Schema:**
```typescript
interface DuplicateJobBundleResponse {
  // Candidate metadata
  candidate: {
    id: string;
    sourceType: 'trap' | 'skill';
    status: CandidateStatus;
    receivedAt: string;
    submittedBy: string;
  };

  // Original submission payload
  originalPayload: {
    trap?: {
      scope: string;
      labels: string[];
      shortcut: string;
      detail: string;
      requiredLevel: number;
    };
    skill?: {
      files: Array<{
        path: string;
        sha256: string;
        sizeBytes: number;
        mediaType: string;
        content: string; // base64 or text
      }>;
      metadata: {
        title: string;
        slug: string;
        labels: string[];
      };
    };
  };

  // Analysis snapshot
  analysisSnapshot: {
    fingerprint: string;
    keywords: string[];
    tokens: string[];
    normalizedAt: string;
  };

  // Matched entities with full data
  matches: Array<{
    match: DuplicateMatch; // Existing type
    entity: {
      type: 'trap' | 'skill';
      id: string;
      title: string;
      // For traps
      shortcut?: string;
      detail?: string;
      labels?: string[];
      // For skills
      bundle?: ArtifactBundle;
    };
  }>;

  // Expected result schema
  expectedResultSchema: ManualResultSchema;
}
```

### 2. CLI Command Structure

**Recommended: Extend `skill` command family**

```bash
# Fetch duplicate job bundle
skill duplicate-job fetch <candidateId> [--output <dir>] [--json]

# Submit manual result
skill duplicate-job resolve <candidateId> --decision <independent|merged> [--notes <text>] [--json]
```

**Alternative: Separate `candidate` namespace**
```bash
candidate fetch <candidateId>
candidate resolve <candidateId> --decision <...>
```

### 3. Manual Result Schema

```typescript
interface ManualResultSubmission {
  candidateId: string;

  // Decision type
  decision: 'independent' | 'merged';

  // For 'independent': both are distinct, proceed with candidate
  // For 'merged': candidate should be rejected/merged into existing

  // Notes explaining the decision
  notes: string; // Required, 1-1000 characters

  // For 'merged' decision
  mergedWith?: {
    existingEntityId: string;
    existingEntityType: 'trap' | 'skill';
  };

  // Optional: suggested edits to existing entity
  suggestedEdits?: {
    title?: string;
    labels?: string[];
    detail?: string; // For traps
  };
}
```

### 4. Manual Result Intake Endpoint

```
POST /v1/candidates/:candidateId/manual-result
```

**Request:** `ManualResultSubmission`
**Response:**
```typescript
interface ManualResultResponse {
  candidateId: string;
  decision: 'independent' | 'merged';
  reviewedAt: string;
  reviewedBy: string;
  nextState: 'ready_for_review' | 'rejected' | 'merged';
}
```

---

## Implementation Considerations

### Security and Access Control

- Manual result submission requires `knowledge:review` permission
- Only candidates in `duplicate_detected` status can receive manual results
- Submission is idempotent - can replace previous manual result

### Retryable Pattern

The intake should allow correction:
```typescript
// Store manual result on candidate record
candidate.manualResult = {
  decision: 'independent',
  notes: '...',
  submittedAt: nowIso(),
  submittedBy: userId,
};

// Status remains duplicate_detected until final processing (Phase 35)
// This allows correction of the manual result
```

### File Content Handling

For skill candidates:
- Include file content inline in bundle (like artifact export)
- Support both JSON output and directory materialization
- Reuse `materializeSkillDirectory()` pattern from operations.ts

### Print Retrieval Command After Decision

After `skill duplicate-job resolve` succeeds, output should include:
```
Manual result submitted for candidate cand_abc123
Decision: independent
Status: ready_for_review

To fetch this job again:
  trapmap skill duplicate-job fetch cand_abc123
```

---

## File Changes Required

### New Files

| Path | Purpose |
|------|---------|
| `packages/contracts/src/domain/manual-result.ts` | Manual result submission types |
| `packages/server/src/routes/duplicate-jobs.ts` | Enhanced bundle endpoint and intake route |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/contracts/src/domain/candidates.ts` | Add bundle response types |
| `packages/contracts/src/index.ts` | Export new types |
| `packages/server/src/routes/candidates.ts` | Add manual result intake endpoint |
| `packages/server/src/lib/candidates/store.ts` | Add manual result storage functions |
| `packages/server/src/app.ts` | Register new routes |
| `packages/cli/src/commands/skill.ts` | Add duplicate-job subcommands |
| `packages/cli/src/lib/http.ts` | Add any needed API helpers |

---

## Dependencies

### Phase Dependencies

| Phase | Dependency Reason |
|-------|-------------------|
| Phase 33 | Candidate store, duplicate detection, API foundation |

### Code Dependencies

| Module | Uses | Impact |
|--------|------|--------|
| `candidates/store.ts` | Candidate CRUD operations | Extend for manual results |
| `candidates/detector.ts` | DuplicateCase type | Read for bundle building |
| `import-export.ts` | `normalizeArtifactBundle()` | Reuse for skill bundle formatting |
| `operations.ts` | Export patterns | Model for bundle endpoint |
| `skill.ts` (CLI) | Command patterns | Extend with duplicate-job commands |

---

## Open Questions for Planning

### 1. Command Namespace

**Question:** Should duplicate-job commands live under `skill` or a new namespace?

Options:
- `skill duplicate-job <subcommand>` - Consistent with skill-focused workflow
- `candidate duplicate-job <subcommand>` - Aligns with Phase 33 candidate terminology
- `duplicate-job <subcommand>` - Top-level, clearer for cross-domain cases

**Recommendation:** `skill duplicate-job` matches the skill-centric review workflow, but consider `candidate` if trap duplicates are equally common.

### 2. Bundle Endpoint Design

**Question:** Extend existing endpoint or create new dedicated endpoint?

**Recommendation:** New endpoint `/v1/duplicates/:candidateId/bundle` keeps concerns separate and allows cleaner caching/versioning.

### 3. File Content Strategy

**Question:** Include skill file content inline in bundle or require separate retrieval?

**Recommendation:** Inline content (like artifact export) for offline review. Support `--output` flag for directory materialization.

### 4. Manual Result Finality

**Question:** Should manual result be final or allow multiple submissions before Phase 35 processing?

**Recommendation:** Allow multiple submissions (retryable) until Phase 35 finalizes. Store `manualResult` on candidate, not a separate collection.

### 5. Matched Entity Data Depth

**Question:** How much data to include for matched entities?

Options:
- Full entity bundle (like export)
- Summary only (id, title, similarity)
- Configurable via query param

**Recommendation:** Full bundle for skills, full content for traps. Reviewers need complete data for merge decisions.

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Large bundle size for skill files | Medium | Medium | Support lazy loading via separate endpoints |
| Conflicting manual results | Low | Medium | Last-write-wins with timestamp tracking |
| Access control bypass | Low | High | Reuse existing permission checks |
| Breaking existing duplicate endpoints | Low | Medium | New endpoint, don't modify existing response shapes |

---

## Success Criteria

1. **CLI Fetch Command:** `skill duplicate-job fetch <id>` returns full bundle with original and matched data
2. **Bundle Output:** JSON output includes all data needed for offline review
3. **Directory Materialization:** `--output` flag materializes skill files locally
4. **Manual Result Intake:** `POST /v1/candidates/:id/manual-result` accepts and stores decisions
5. **Retryable Submission:** Can correct manual result without losing candidate state
6. **Print Command Hint:** After submission, CLI prints fetch command for future reference
7. **Permission Enforcement:** Only reviewers can fetch bundles and submit results

---

## Next Steps for Planning

1. Decide on CLI command namespace (`skill duplicate-job` vs `candidate duplicate-job`)
2. Design exact bundle response schema with file content handling
3. Design manual result schema with validation rules
4. Plan bundle endpoint implementation (reuse export patterns)
5. Plan manual result storage and state transitions
6. Define CLI output format for both fetch and resolve commands
