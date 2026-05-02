# Phase 50: Batch Management Interface - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 10
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/contracts/src/domain/decay.ts` | model | CRUD | `packages/contracts/src/domain/operations.ts` | exact |
| `packages/server/src/lib/decay/batch.ts` | service | CRUD | `packages/server/src/lib/decay/supersede.ts` | exact |
| `packages/server/src/lib/decay/batch.test.ts` | test | CRUD | `packages/server/src/lib/decay/supersede.test.ts` | exact |
| `packages/server/src/routes/decay.ts` | route | request-response | `packages/server/src/routes/operations.ts` | exact |
| `packages/server/src/routes/decay.test.ts` | test | request-response | `packages/server/src/routes/operations.test.ts` | exact |
| `packages/cli/src/commands/decay.ts` | component | request-response | `packages/cli/src/commands/operations.ts` | exact |
| `packages/cli/src/commands/decay.test.ts` | test | request-response | `packages/cli/src/commands/operations.test.ts` | exact |
| `packages/server/src/lib/knowledge.ts` | service | transform | (existing, extending) | exact |
| `packages/server/src/app.ts` | config | request-response | (existing, extending) | exact |
| `packages/cli/src/index.ts` | config | request-response | (existing, extending) | exact |

## Pattern Assignments

### `packages/contracts/src/domain/decay.ts` (model, extending)

**Analog:** `packages/contracts/src/domain/operations.ts`

This is an existing file. New schemas (batch operation request/response, decay-aware list item, decay search query) are appended following the same pattern.

**Existing imports to extend** (lines 1-3):
```typescript
import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema } from './common.js';
```

**Schema pattern to copy** (from `operations.ts` lines 27-45):
```typescript
export const knowledgeDeactivateRequestSchema = z.object({
  entryId: entityIdSchema,
  reason: z.string().min(1).max(500),
});

export const knowledgeListRequestSchema = z.object({
  scope: scopeSchema.optional(),
  lifecycleState: z.array(lifecycleStateSchema).optional(),
  requiredLevelMax: securityLevelSchema.optional(),
  ownerUserId: entityIdSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(128).optional(),
});

export const knowledgeListResponseSchema = z.object({
  items: z.array(knowledgeListItemSchema),
  nextCursor: z.string().min(1).max(128).nullable(),
  total: z.number().int().min(0),
});
```

**Type export pattern** (from `operations.ts` lines 330-334):
```typescript
export type ExportBundle = z.infer<typeof exportBundleSchema>;
export type ImportEntry = z.infer<typeof importEntrySchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
```

**Additional imports needed:**
```typescript
// In decay.ts, add these imports from common.js (not yet present):
import { labelSchema, scopeSchema, securityLevelSchema } from './common.js';
```

---

### `packages/server/src/lib/decay/batch.ts` (service, CRUD)

**Analog:** `packages/server/src/lib/decay/supersede.ts`

This is the core batch mutation logic module. It follows the same pure-function-with-StoreData pattern as `supersede.ts`.

**Imports pattern** (from `supersede.ts` lines 1-12):
```typescript
import type { DecayState } from '@trapmap/contracts';

import { AppError } from '../errors.js';
import type { KnowledgeLifecycleEventRecord, KnowledgeRecord, SkillShareerStore, StoreData } from '../store.js';
import { nowIso } from '../store.js';
```

**Input interface pattern** (from `supersede.ts` lines 17-28):
```typescript
export interface SupersedeInput {
  store: SkillShareerStore;
  data: StoreData;
  entryId: string;
  replacementId: string;
  actorId: string;
}
```

**Core mutation pattern** (from `supersede.ts` lines 45-105):
```typescript
export function supersedeEntry({
  store,
  data,
  entryId,
  replacementId,
  actorId,
}: SupersedeInput): KnowledgeRecord {
  // Reject self-supersede
  if (entryId === replacementId) {
    throw new AppError(400, 'invalid_supersede', 'Cannot supersede an entry with itself');
  }

  // Find the entry
  const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);
  if (!entry) {
    throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
  }

  // Validate entry state
  if (entry.lifecycleState !== 'approved') {
    throw new AppError(400, 'invalid_state', 'Only approved entries can be superseded');
  }

  // Initialize or update decayMeta
  entry.decayMeta = {
    lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
    decayState: 'superseded' as DecayState,
    supersededById: replacementId,
    decayStateComputedAt: nowIso(),
    freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
  };

  // Create lifecycle event
  const event: KnowledgeLifecycleEventRecord = {
    id: store.nextId(data, 'evt'),
    type: 'deactivated',
    createdAt: nowIso(),
    actorUserId: actorId,
    submissionId: null,
    revision: null,
    state: entry.lifecycleState,
    note: `Superseded by ${replacementId}`,
  };
  entry.lifecycleHistory.push(event);

  // Update timestamp
  entry.updatedAt = nowIso();

  return entry;
}
```

**Key patterns for batch.ts:**
- Use `AppError` for validation failures (400, 404, 403)
- Use `store.nextId(data, 'evt')` for lifecycle event IDs
- Use `nowIso()` for timestamps
- Push to `entry.lifecycleHistory` for audit trail
- Update `entry.decayMeta` following the same structure
- Update `entry.updatedAt` at the end
- Call `computeDecayState` from `./state-machine.js` for decay state computation
- The `planBatchOperation` function should be pure (no mutations, returns a plan object)
- The `executeBatchOperation` function should mutate `data` entries in-place and push lifecycle events

---

### `packages/server/src/lib/decay/batch.test.ts` (test, CRUD)

**Analog:** `packages/server/src/lib/decay/supersede.test.ts`

**Imports pattern** (from `supersede.test.ts` lines 1-5):
```typescript
import { describe, expect, it } from 'vitest';

import type { KnowledgeRecord } from '../store.js';
import { createEmptyStoreData, nowIso } from '../store.js';
import { supersedeEntry } from './supersede.js';
```

**Mock store helper** (from `supersede.test.ts` lines 9-22):
```typescript
function makeMockStore() {
  return {
    snapshot: async () => createEmptyStoreData(),
    transact: async <T>(_mutator: (data: ReturnType<typeof createEmptyStoreData>) => T) => {
      throw new Error('not implemented');
    },
    nextId: (data: ReturnType<typeof createEmptyStoreData>, prefix: string) => {
      const nextValue = (data.counters[prefix] ?? 0) + 1;
      data.counters[prefix] = nextValue;
      return `${prefix}_${nextValue}`;
    },
  };
}
```

**Test entry factory** (from `supersede.test.ts` lines 27-72):
```typescript
function makeTestEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  const now = nowIso();
  return {
    id: 'knowledge_1',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    shortcut: 'Test shortcut',
    detail: 'Test detail',
    requiredLevel: 5,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: now,
      submittedByUserId: 'user_1',
      shortcut: 'Test shortcut',
      detail: 'Test detail',
      labels: ['test'],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'submission_1',
      latestSubmittedAt: now,
      latestReviewedAt: now,
      latestDecision: 'approve',
    },
    latestSubmissionId: 'submission_1',
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    decayMeta: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
```

**Test structure pattern** (from `supersede.test.ts` lines 74-100):
```typescript
describe('supersedeEntry', () => {
  it('successfully supersedes an entry', () => {
    const store = makeMockStore();
    const data = createEmptyStoreData();
    const entry = makeTestEntry({ id: 'knowledge_1' });
    const replacement = makeTestEntry({ id: 'knowledge_2' });
    data.knowledgeEntries.push(entry, replacement);

    const result = supersedeEntry({
      store,
      data,
      entryId: 'knowledge_1',
      replacementId: 'knowledge_2',
      actorId: 'user_admin',
    });

    expect(result.decayMeta).not.toBeNull();
    expect(result.decayMeta!.supersededById).toBe('knowledge_2');
    expect(result.lifecycleHistory).toHaveLength(1);
  });

  it('rejects when entry not found', () => {
    // ... setup ...
    expect(() => supersedeEntry({ ... })).toThrow('Knowledge entry not found');
  });
});
```

---

### `packages/server/src/routes/decay.ts` (route, request-response)

**Analog:** `packages/server/src/routes/operations.ts`

**Imports pattern** (from `operations.ts` lines 1-61):
```typescript
import {
  knowledgeDeactivateRequestSchema,
  knowledgeDeactivateResponseSchema,
  knowledgeListRequestSchema,
  knowledgeListResponseSchema,
  // ... other schema imports
} from '@trapmap/contracts';
import type { LifecycleState } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { toKnowledgeListItem } from '../lib/knowledge.js';
import { requirePermission, requireTeamAccess } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';
import { logUserOperation } from '../lib/user-ops-log.js';
```

**Route plugin export pattern** (from `operations.ts` line 62):
```typescript
export const operationsRoutes: FastifyPluginAsync = async (app) => {
  // route handlers...
};
```

**Auth + permission pattern** (from `operations.ts` lines 63-68, 93-95):
```typescript
app.get('/v1/operations/knowledge', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:export');

  const query = knowledgeListRequestSchema.parse(request.query as Record<string, unknown>);
  const data = await app.skillShareer.store.snapshot();
  // ...
});
```

**Permission-filtered listing pattern** (from `operations.ts` lines 100-115):
```typescript
let entries = data.knowledgeEntries;

// Filter based on user permissions
if (auth.subjectType !== 'system-admin') {
  entries = entries.filter((entry) => {
    if (auth.securityLevel > entry.requiredLevel) {
      return true;
    }
    if (entry.teamId && auth.activeTeamId === entry.teamId) {
      return true;
    }
    return false;
  });
}
```

**List response pattern** (from `operations.ts` lines 138-151):
```typescript
const limit = query.limit;
const total = entries.length;
entries = entries.slice(0, limit);

const items = entries.map((entry) => toKnowledgeListItem(entry));

return knowledgeListResponseSchema.parse({
  items,
  nextCursor: null,
  total,
});
```

**Mutation with transact + lifecycle event pattern** (from `operations.ts` lines 153-216):
```typescript
app.post('/v1/operations/knowledge/:entryId/deactivate', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:update');

  const entryId = (request.params as { entryId: string }).entryId;
  const payload = knowledgeDeactivateRequestSchema.parse({
    ...((request.body as Record<string, unknown>) ?? {}),
    entryId,
  });

  let previousState: LifecycleState | undefined;

  const updatedEntry = await app.skillShareer.store.transact((data) => {
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    previousState = entry.lifecycleState;
    entry.lifecycleState = 'deactivated';

    // Add lifecycle event
    entry.lifecycleHistory.push({
      id: app.skillShareer.store.nextId(data, 'knowledge_event'),
      type: 'deactivated',
      createdAt: nowIso(),
      actorUserId: auth.user?.id ?? null,
      submissionId: entry.latestSubmissionId,
      revision: entry.latestRevision.revision,
      state: 'deactivated',
      note: payload.reason,
    });

    entry.updatedAt = nowIso();
    return toKnowledgeEntry(data, entry);
  });

  // Log user operation (fire-and-forget)
  void logUserOperation(app.skillShareer.config.userOpsLog, {
    timestamp: nowIso(),
    actorId: auth.actorId,
    actorHandle: auth.handle,
    action: 'deactivate',
    targetId: entryId,
    teamId: auth.activeTeamId,
    metadata: { reason: payload.reason, previousState },
  });

  return knowledgeDeactivateResponseSchema.parse({ entry: updatedEntry });
});
```

**Supersede route pattern** (from `knowledge.ts` lines 299-332):
```typescript
app.post('/v1/knowledge/:entryId/supersede', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:update');

  const entryId = (request.params as { entryId: string }).entryId;
  const body = request.body as { replacementId?: string } ?? {};
  if (!body.replacementId || typeof body.replacementId !== 'string') {
    throw new AppError(400, 'replacement_required', 'replacementId is required');
  }

  const supersededEntry = await app.skillShareer.store.transact((data) => {
    return supersedeEntry({
      store: app.skillShareer.store,
      data,
      entryId,
      replacementId: body.replacementId!,
      actorId: auth.actorId,
    });
  });

  void logUserOperation(app.skillShareer.config.userOpsLog, {
    timestamp: nowIso(),
    actorId: auth.actorId,
    actorHandle: auth.handle,
    action: 'supersede',
    targetId: entryId,
    teamId: auth.activeTeamId,
    metadata: { replacementId: body.replacementId },
  });

  return knowledgeEntryResponseSchema.parse({
    entry: toKnowledgeEntry(await app.skillShareer.store.snapshot(), supersededEntry),
  });
});
```

---

### `packages/server/src/routes/decay.test.ts` (test, request-response)

**Analog:** `packages/server/src/routes/operations.test.ts`

**Imports pattern** (from `operations.test.ts` lines 1-8):
```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { KnowledgeSubmission } from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import type { KnowledgeRecord, SkillShareerStore } from '../lib/store.js';
import { hashSecret, nowIso } from '../lib/store.js';
```

**Test setup pattern** (from `operations.test.ts` lines 10-22):
```typescript
describe('operations routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
```

**Unauthenticated request test pattern** (from `operations.test.ts` lines 24-34):
```typescript
describe('GET /v1/operations/knowledge', () => {
  it('returns 401 for unauthenticated request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/operations/knowledge',
    });

    expect(response.statusCode).toBe(401);
    const json = response.json();
    expect(json.code).toBeDefined();
  });
```

**Authenticated request test pattern** -- inject with auth headers. From the test file, authenticated tests use `app.inject()` with `headers` including `authorization: 'Bearer ...'` and seed data via `app.skillShareer.store.transact()`.

---

### `packages/cli/src/commands/decay.ts` (component, request-response)

**Analog:** `packages/cli/src/commands/operations.ts`

**Imports pattern** (from `operations.ts` lines 1-45):
```typescript
import type { /* response types */ } from '@trapmap/contracts';
import { /* schema validators */ } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';
```

**Command registration pattern** (from `operations.ts` lines 409-460):
```typescript
export function registerOperationsCommands(
  program: Command,
  options: OperationsCommandOptions,
): void {
  if (options.allowExport) {
    program
      .command('list')
      .description('List knowledge entries with optional filters')
      .option('--scope <scope>', 'Filter by scope: global or project')
      .option('--state <state>', 'Filter by lifecycle state (comma-separated)')
      .option('--json', 'Output JSON')
      .action(async (flags: { json?: boolean; /* ... */ }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const queryParams = new URLSearchParams();
        if (flags.scope !== undefined) {
          queryParams.set('scope', flags.scope);
        }

        const path = queryParams.size > 0
          ? `/v1/operations/knowledge?${queryParams}`
          : '/v1/operations/knowledge';
        const response = await apiRequest<KnowledgeListResponse>(state, { path });
        const parsed = knowledgeListResponseSchema.parse(response.data);

        printResult(parsed, flags, (value) => formatListResponse(value));
      });
  }
```

**Mutation command pattern** (from `operations.ts` lines 523-548):
```typescript
program
  .command('deactivate')
  .description('Deactivate a knowledge entry')
  .argument('<entryId>', 'Knowledge entry identifier')
  .requiredOption('--reason <text>', 'Reason for deactivation (1-500 characters)')
  .option('--json', 'Output JSON')
  .action(async (entryId: string, flags: { json?: boolean; reason: string }) => {
    const state = await loadCliState();
    requireSessionToken(state);

    const response = await apiRequest<KnowledgeDeactivateResponse>(state, {
      method: 'POST',
      path: `/v1/operations/knowledge/${entryId}/deactivate`,
      body: { entryId, reason: flags.reason },
    });
    const parsed = knowledgeDeactivateResponseSchema.parse(response.data);

    printResult(parsed, flags, ({ entry }) =>
      [`Deactivated ${entry.id}`, `Lifecycle: ${entry.lifecycleState}`].join('\n'),
    );
  });
```

---

### `packages/cli/src/commands/decay.test.ts` (test, request-response)

**Analog:** `packages/cli/src/commands/operations.test.ts`

**Imports and mock setup pattern** (from `operations.test.ts` lines 1-34):
```typescript
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(),
}));

// Import after mocking
import { Command } from 'commander';
import { loadCliState } from '../lib/config.js';
import { apiRequest } from '../lib/http.js';
import { registerOperationsCommands } from './operations.js';

const mockedApiRequest = vi.mocked(apiRequest);
const mockedLoadCliState = vi.mocked(loadCliState);
```

**Test setup pattern** (from `operations.test.ts` lines 51-97):
```typescript
describe('CLI operations commands (Phase 13)', () => {
  let program: Command;
  const mockState = {
    serverUrl: 'http://localhost:3000',
    sessionToken: 'test-token',
    session: null,
  };

  beforeEach(async () => {
    mockedApiRequest.mockReset();
    mockedLoadCliState.mockReset();

    mockedLoadCliState.mockResolvedValue(mockState);
    mockedApiRequest.mockResolvedValue(mockArtifactImportResponse);

    program = new Command();
    registerOperationsCommands(program, {
      allowImport: true,
      allowExport: true,
      allowEdit: false,
      allowDeactivate: false,
    });
  });

  // Test cases use: await program.parseAsync(['node', 'test', 'command-name', ...args])
  // Then assert: expect(mockedApiRequest).toHaveBeenCalledWith(...)
```

**Mock response structure pattern:**
```typescript
const mockResponse = {
  data: { /* response fields matching schema */ },
  sessionToken: 'test-token',
};
mockedApiRequest.mockResolvedValue(mockResponse);
```

**Console spy pattern for output verification:**
```typescript
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
// ... run command ...
const calls = consoleSpy.mock.calls;
expect(calls.length).toBeGreaterThan(0);
const output = calls[0]?.[0] as string;
expect(output).toContain('expected text');
consoleSpy.mockRestore();
```

---

### `packages/server/src/lib/knowledge.ts` (service, extending)

**Analog:** (existing file, extending `toKnowledgeListItem`)

This file already contains `toKnowledgeListItem`. The planner should extend this function or add a new `toDecayAwareListItem` that adds decay metadata fields.

**Current function** (from `knowledge.ts` lines 496-506):
```typescript
export function toKnowledgeListItem(record: KnowledgeRecord) {
  return knowledgeListItemSchema.parse({
    id: record.id,
    scope: record.scope,
    labels: record.labels,
    shortcut: record.shortcut,
    lifecycleState: record.lifecycleState,
    requiredLevel: record.requiredLevel,
    updatedAt: record.updatedAt,
  });
}
```

---

### `packages/server/src/app.ts` (config, extending)

**Analog:** (existing file, extending route registration)

**Import pattern** (from `app.ts` lines 26-27, 33):
```typescript
import { knowledgeRoutes } from './routes/knowledge.js';
import { operationsRoutes } from './routes/operations.js';
// ... add:
// import { decayRoutes } from './routes/decay.js';
```

**Registration pattern** (from `app.ts` lines 124-133):
```typescript
app.register(authRoutes);
app.register(teamRoutes);
// ... existing registrations ...
app.register(operationsRoutes);
// ... add:
// app.register(decayRoutes);
```

---

### `packages/cli/src/index.ts` (config, extending)

**Analog:** (existing file, extending command registration)

**Import pattern** (from `index.ts` line 7):
```typescript
import { registerOperationsCommands } from './commands/operations.js';
// ... add:
// import { registerDecayCommands } from './commands/decay.js';
```

**Registration pattern** (from `index.ts` lines 134-139):
```typescript
registerOperationsCommands(program, {
  allowExport: visibility.allowKnowledgeExport,
  allowEdit: visibility.allowKnowledgeUpdate,
  allowDeactivate: visibility.allowKnowledgeDeactivate,
  allowImport: visibility.allowKnowledgeImport,
});
// ... add:
// registerDecayCommands(program, { allowManage: visibility.allowKnowledgeUpdate });
```

## Shared Patterns

### Authentication and Authorization
**Source:** `packages/server/src/lib/session.ts` + `packages/server/src/lib/rbac.ts`
**Apply to:** All route handlers in `packages/server/src/routes/decay.ts`
```typescript
const auth = await resolveAuthContext(app.skillShareer, request);
requirePermission(auth, 'knowledge:update');
```
Permission `'knowledge:update'` for all batch mutation endpoints. Permission `'knowledge:export'` for the listing/search endpoints.

### Error Handling
**Source:** `packages/server/src/lib/errors.ts`
**Apply to:** All server-side code (batch.ts service, routes)
```typescript
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
```
Throw `AppError(statusCode, code, message)` for all validation failures.

### Lifecycle Event Audit Trail
**Source:** `packages/server/src/routes/operations.ts` lines 190-199
**Apply to:** Every batch action that modifies an entry
```typescript
entry.lifecycleHistory.push({
  id: app.skillShareer.store.nextId(data, 'knowledge_event'),
  type: 'deactivated',  // or appropriate type
  createdAt: nowIso(),
  actorUserId: auth.user?.id ?? null,
  submissionId: entry.latestSubmissionId,
  revision: entry.latestRevision.revision,
  state: 'deactivated',
  note: payload.reason,
});
```
Note: `KnowledgeLifecycleEventRecord.type` currently allows: `'submitted' | 'resubmitted' | 'agent-reviewed' | 'reviewer-approved' | 'reviewer-rejected' | 'updated' | 'deactivated'`. The planner may need to extend this union type with `'extended' | 'mark-review' | 'superseded'` or reuse `'updated'` for extend/mark-review and `'deactivated'` for supersede.

### User Operation Logging
**Source:** `packages/server/src/routes/operations.ts` lines 219-227
**Apply to:** All mutation route handlers
```typescript
void logUserOperation(app.skillShareer.config.userOpsLog, {
  timestamp: nowIso(),
  actorId: auth.actorId,
  actorHandle: auth.handle,
  action: 'deactivate',
  targetId: entryId,
  teamId: auth.activeTeamId,
  metadata: { reason: payload.reason },
});
```

### Store Transaction Pattern
**Source:** `packages/server/src/routes/operations.ts` lines 167-216
**Apply to:** All batch mutation endpoints
```typescript
const result = await app.skillShareer.store.transact((data) => {
  // Find entries, validate, mutate, push lifecycle events
  // Return result
});
```
For dry-run mode, do NOT call `store.transact()` -- instead call `store.snapshot()` and run the pure planning function.

### Decay State Computation
**Source:** `packages/server/src/lib/decay/state-machine.ts` lines 58-120
**Apply to:** Listing/search endpoints that need to enrich entries with current decay state
```typescript
import { computeDecayState } from '../lib/decay/state-machine.js';
import { loadDecayConfig } from '../lib/decay/config.js';

const config = loadDecayConfig();
const decayResult = computeDecayState(
  entry.decayMeta ? {
    lastVerifiedAt: entry.decayMeta.lastVerifiedAt,
    decayState: entry.decayMeta.decayState,
    supersededById: entry.decayMeta.supersededById,
  } : null,
  config,
  new Date(), // or fixed date for testing
);
```

### CLI Output Formatting
**Source:** `packages/cli/src/lib/output.ts`
**Apply to:** All CLI command actions
```typescript
printResult(parsed, flags, (value) => formatHumanReadable(value));
```
Where `flags` includes `{ json?: boolean }`. JSON mode outputs raw parsed data; human-readable mode uses the formatter function.

### CLI HTTP Client
**Source:** `packages/cli/src/lib/http.ts`
**Apply to:** All CLI command actions
```typescript
const state = await loadCliState();
requireSessionToken(state);

// For GET:
const response = await apiRequest<ResponseType>(state, { path: '/v1/...' });

// For POST:
const response = await apiRequest<ResponseType>(state, {
  method: 'POST',
  path: '/v1/...',
  body: { /* ... */ },
});

const parsed = responseSchema.parse(response.data);
```

## No Analog Found

All files have close analogs in the existing codebase. No files require falling back to RESEARCH.md patterns alone.

## Metadata

**Analog search scope:**
- `packages/server/src/routes/` -- all route files
- `packages/server/src/lib/decay/` -- all decay modules
- `packages/server/src/lib/` -- knowledge.ts, errors.ts, rbac.ts, store.ts, context.ts
- `packages/cli/src/commands/` -- all command files
- `packages/cli/src/lib/` -- http.ts, output.ts, config.ts
- `packages/contracts/src/domain/` -- all schema files

**Files scanned:** 30+
**Pattern extraction date:** 2026-05-02
