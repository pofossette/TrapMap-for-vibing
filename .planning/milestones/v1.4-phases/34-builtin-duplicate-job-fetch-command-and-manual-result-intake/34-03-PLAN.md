---
wave: 3
depends_on:
  - 34-01
  - 34-02
files_modified:
  - packages/server/src/routes/candidates.ts
autonomous: true
---

# Plan 34-03: Add Duplicate Job Bundle and Manual Result Endpoints

## Objective

Add server endpoints to fetch duplicate job bundles and accept manual result submissions.

## Context

Plan 34-01 defined the bundle response and manual result types. Plan 34-02 added store functions. Now we need:
1. `GET /v1/duplicates/:candidateId/bundle` - Full bundle for offline review
2. `POST /v1/candidates/:candidateId/manual-result` - Accept manual decisions

## Tasks

### Task 1: Add bundle endpoint for duplicate job

<read_first>
- packages/server/src/routes/candidates.ts
- packages/contracts/src/domain/candidates.ts
</read_first>

<acceptance_criteria>
- `GET /v1/duplicates/:candidateId/bundle` endpoint exists
- Endpoint requires `knowledge:review` permission
- Returns full bundle with candidate metadata, original payload, matches with entity data
- Returns 404 if candidate not found or no duplicate case
</acceptance_criteria>

<action>
Add to `packages/server/src/routes/candidates.ts`:

```typescript
import {
  // ... existing imports
  duplicateJobBundleResponseSchema,
  type DuplicateJobBundleResponse,
  type DuplicateJobMatchEntity,
} from '@trapmap/contracts';

// Helper to build entity data for matched trap
function buildTrapEntity(data: StoreData, entityId: string): DuplicateJobMatchEntity | null {
  const trap = data.knowledgeEntries.find(e => e.id === entityId);
  if (!trap) return null;

  return {
    entityType: 'trap',
    entityId: trap.id,
    title: trap.shortcut,
    shortcut: trap.shortcut,
    detail: trap.detail,
    labels: trap.labels,
    scope: trap.scope,
    requiredLevel: trap.requiredLevel,
  };
}

// Helper to build entity data for matched skill
function buildSkillEntity(data: StoreData, entityId: string): DuplicateJobMatchEntity | null {
  const skill = data.skillArtifacts.find(a => a.id === entityId);
  if (!skill) return null;

  return {
    entityType: 'skill',
    entityId: skill.id,
    title: skill.title,
    slug: skill.slug,
    files: skill.latestRevision.files.map(f => ({
      path: f.path,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      mediaType: f.mediaType,
    })),
  };
}

// GET /v1/duplicates/:candidateId/bundle - Get full bundle for offline review
app.get('/v1/duplicates/:candidateId/bundle', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:review');

  const candidateId = (request.params as { candidateId: string }).candidateId;
  const data = await app.skillShareer.store.snapshot();

  const candidate = getCandidateById(data, candidateId);
  if (!candidate) {
    throw new AppError(404, 'candidate_not_found', 'Candidate not found');
  }

  const duplicateCase = candidate.duplicateCase;
  if (!duplicateCase) {
    throw new AppError(404, 'duplicate_case_not_found', 'No duplicate case for this candidate');
  }

  // Build match entries with entity data
  const matches: DuplicateJobBundleResponse['matches'] = [];

  for (const match of duplicateCase.matches) {
    const entity = match.entityType === 'trap'
      ? buildTrapEntity(data, match.entityId)
      : buildSkillEntity(data, match.entityId);

    if (entity) {
      matches.push({ match, entity });
    }
  }

  // Expected result schema for manual submission
  const expectedResultSchema = {
    description: 'Manual resolution decision for duplicate candidate',
    fields: [
      { name: 'decision', type: 'enum', required: true, description: "'independent' or 'merged'" },
      { name: 'notes', type: 'string', required: true, description: 'Explanation of the decision (1-1000 chars)' },
      { name: 'mergedWith', type: 'object', required: false, description: 'Required if decision is "merged": { entityType, entityId }' },
    ],
  };

  const response: DuplicateJobBundleResponse = {
    candidate: {
      id: candidate.id,
      sourceType: candidate.sourceType,
      status: candidate.status,
      receivedAt: candidate.receivedAt,
      submittedBy: candidate.submittedBy,
    },
    originalPayload: candidate.originalPayload,
    analysisSnapshot: candidate.analysisSnapshot,
    matches,
    expectedResultSchema,
  };

  return duplicateJobBundleResponseSchema.parse(response);
});
```

</action>

### Task 2: Add manual result intake endpoint

<read_first>
- packages/server/src/routes/candidates.ts
- packages/server/src/lib/candidates/store.ts
</read_first>

<acceptance_criteria>
- `POST /v1/candidates/:candidateId/manual-result` endpoint exists
- Endpoint requires `knowledge:review` permission
- Endpoint validates candidate is in `duplicate_detected` status
- Endpoint stores manual result and returns success response
- Returns 400 if decision is 'merged' but mergedWith is missing
</acceptance_criteria>

<action>
Add to `packages/server/src/routes/candidates.ts`:

```typescript
import {
  // ... existing imports
  manualResultSubmissionSchema,
  manualResultResponseSchema,
} from '@trapmap/contracts';
import { attachManualResult } from '../lib/candidates/store.js';

// POST /v1/candidates/:candidateId/manual-result - Submit manual resolution
app.post('/v1/candidates/:candidateId/manual-result', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:review');

  const candidateId = (request.params as { candidateId: string }).candidateId;
  const reviewedBy = auth.user?.id;

  if (!reviewedBy) {
    throw new AppError(403, 'user_required', 'Manual result requires a real user account');
  }

  const body = manualResultSubmissionSchema.parse(request.body);

  // Validate mergedWith is present for merged decision
  if (body.decision === 'merged' && !body.mergedWith) {
    throw new AppError(
      400,
      'validation_error',
      'mergedWith is required when decision is "merged"',
    );
  }

  // Store the manual result
  let nextState: 'duplicate_detected' | 'ready_for_review' | 'rejected';

  await app.skillShareer.store.transact((data) => {
    const result = attachManualResult({
      data,
      candidateId,
      result: body,
      reviewedBy,
    });

    // Determine next state based on decision
    // Phase 35 will handle actual state transition and publishing
    // For now, keep status as duplicate_detected with manual result attached
    nextState = body.decision === 'independent' ? 'ready_for_review' : 'rejected';
  });

  // Log user operation
  void logUserOperation(app.skillShareer.config.userOpsLog, {
    timestamp: nowIso(),
    actorId: auth.actorId,
    actorHandle: auth.handle,
    action: 'manual-result',
    targetId: candidateId,
    teamId: auth.activeTeamId,
    metadata: { decision: body.decision },
  });

  return manualResultResponseSchema.parse({
    candidateId,
    decision: body.decision,
    reviewedAt: nowIso(),
    reviewedBy,
    nextState,
  });
});
```

</action>

### Task 3: Register endpoints in documented routes

<read_first>
- packages/server/src/app.ts
</read_first>

<acceptance_criteria>
- New endpoints added to `documentedRoutes` array in app.ts
</acceptance_criteria>

<action>
Add to the `documentedRoutes` array in `packages/server/src/app.ts`:

```typescript
const documentedRoutes = [
  // ... existing routes
  'GET /v1/duplicates/:candidateId/bundle',
  'POST /v1/candidates/:candidateId/manual-result',
] as const;
```

</action>

## Verification

```bash
# Verify endpoints exist
grep -c "duplicates.*bundle\|manual-result" packages/server/src/routes/candidates.ts
# Build succeeds
pnpm --filter @trapmap/server build
```

## Files Modified

- `packages/server/src/routes/candidates.ts` - Added bundle and manual-result endpoints
- `packages/server/src/app.ts` - Added routes to documentedRoutes