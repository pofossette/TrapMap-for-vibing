# Phase 21: User Operations Logger - Research

**Gathered:** 2026-04-19
**Phase Goal:** Log user operations with independent .env switch
**Requirements:** LOG-01, LOG-03 (partial)

---

## Summary

This phase adds a dedicated user operations logger that writes structured JSON logs to files, controlled by an independent `.env` switch. This is **distinct from** the existing audit system (`lib/audit.ts`), which writes to the JsonStore database file. The user ops logger provides operational observability without affecting the core data store.

---

## Requirements Analysis

### LOG-01: Log user operations

> Server logs user operations (search, submit, edit, review, import, export) with actor, action, target, and timestamp

**Implications:**
- Must instrument all user-facing operations
- Must capture: `actorId`, `actionType`, `targetId`, `timestamp`
- Operations to cover:
  - `search`: `/v1/retrieval/search`, `/v2/retrieval/search`, `/v1/retrieval/skills/search-by-content`
  - `submit`: `/v1/knowledge`, `/v1/operations/artifacts/import`
  - `edit`: `/v1/knowledge/:entryId`, `/v1/operations/artifacts/:artifactId/edit`
  - `review`: `/v1/knowledge/review`, `/v1/operations/artifacts/:artifactId/review`
  - `import`: `/v1/operations/import`, `/v1/operations/artifacts/import`
  - `export`: `/v1/operations/export`, `/v1/operations/artifacts/export`

### LOG-03 (partial): Independent .env configuration

> Each log layer (user ops, RAG) can be independently enabled/disabled via .env configuration

**Implications:**
- `LOG_USER_OPS_ENABLED` env var (boolean, default `false`)
- Must NOT affect existing Fastify request logging (controlled by `LOG_LEVEL`)
- Phase 22 will add `LOG_RAG_ENABLED` for RAG-specific logging

---

## Existing Infrastructure

### Fastify Logger (Pino)

The server already uses Fastify's built-in Pino logger:

```typescript
// app.ts:55-61
const app = Fastify({
  logger: isTestEnv
    ? false
    : {
        level: process.env.LOG_LEVEL ?? 'info',
      },
});
```

- `app.log` - application-level logger
- `request.log` - request-scoped child logger
- Already writes to stdout (not files)
- Already controlled by `LOG_LEVEL` env var

### Audit System (`lib/audit.ts`)

The existing audit system writes to the JsonStore database:

```typescript
// Creates audit records in data.auditEvents (stored in .data/trapmap.json)
export function createAuditEvent(args: CreateAuditEventArgs) { ... }
```

**Audit action types currently defined:**
- `knowledge-submitted`, `knowledge-reviewed`, `knowledge-imported`, `knowledge-exported`, `knowledge-deactivated`
- `member-updated`
- `artifact-imported`, `artifact-exported`
- `artifact-edited`, `artifact-reviewed`, `artifact-history-viewed` (Phase 19/20)

**Key distinction:** Audit = domain model (persistent, queryable via API). User ops log = operational observability (ephemeral, file-based, for ops teams).

### Environment Configuration Pattern

From `config.ts`:

```typescript
export function loadConfig(): ServerConfig {
  return {
    dataFile: path.resolve(
      process.cwd(),
      process.env.TRAPMAP_DATA_FILE ?? '.data/skill-shareer.json',
    ),
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 4000),
    systemAdminKey: process.env.TRAPMAP_SYSTEM_ADMIN_KEY ?? null,
  };
}
```

**Pattern:** Read `process.env.VAR_NAME`, provide sensible default.

### File I/O Pattern

From `lib/store.ts`:

```typescript
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Used for JSON store persistence
```

**Pattern:** Use `node:fs/promises` for async file operations.

### Gitignore

From `.gitignore`:

```
logs/
.data/
```

**Already covered:** `logs/` directory is gitignored.

---

## Routes to Instrument

### Search Operations

| Route | File | Action Type |
|-------|------|-------------|
| `POST /v1/retrieval/search` | `routes/retrieval.ts` | `search` |
| `POST /v2/retrieval/search` | `routes/retrieval.ts` | `search` |
| `POST /v1/retrieval/skills/search-by-content` | `routes/retrieval.ts` | `search` |

### Submit Operations

| Route | File | Action Type |
|-------|------|-------------|
| `POST /v1/knowledge` | `routes/knowledge.ts` | `submit` |
| `POST /v1/operations/artifacts/import` | `routes/operations.ts` | `import` |

### Edit Operations

| Route | File | Action Type |
|-------|------|-------------|
| `PATCH /v1/knowledge/:entryId` | `routes/knowledge.ts` | `edit` |
| `POST /v1/knowledge/:entryId/resubmit` | `routes/knowledge.ts` | `edit` |
| `POST /v1/operations/artifacts/:artifactId/edit` | `routes/operations.ts` | `edit` |

### Review Operations

| Route | File | Action Type |
|-------|------|-------------|
| `GET /v1/knowledge/review-queue` | `routes/review.ts` | `review-list` |
| `POST /v1/knowledge/review` | `routes/review.ts` | `review` |
| `GET /v1/operations/artifacts/review-queue` | `routes/operations.ts` | `review-list` |
| `POST /v1/operations/artifacts/:artifactId/review` | `routes/operations.ts` | `review` |

### Import Operations

| Route | File | Action Type |
|-------|------|-------------|
| `POST /v1/operations/import` | `routes/operations.ts` | `import` |

### Export Operations

| Route | File | Action Type |
|-------|------|-------------|
| `POST /v1/operations/export` | `routes/operations.ts` | `export` |
| `POST /v1/operations/artifacts/export` | `routes/operations.ts` | `export` |

---

## Architecture Options

### Option A: Fastify Hook (onResponse)

Use Fastify's `onResponse` hook to log all completed requests:

```typescript
app.addHook('onResponse', async (request, reply) => {
  if (!config.userOpsLogEnabled) return;
  // Extract action type from route pattern
  // Log to file
});
```

**Pros:**
- Single integration point
- Automatically covers all routes

**Cons:**
- Harder to capture domain-specific context (targetId, actionType semantics)
- Requires route-to-action mapping
- Less control over what to log

### Option B: Explicit Logger Calls

Add explicit logging calls in each route handler:

```typescript
// In route handler
await logUserOperation({
  actorId: auth.actorId,
  action: 'submit',
  targetId: entry.id,
  metadata: { scope, labels },
});
```

**Pros:**
- Full control over logged context
- Clear action semantics
- Easy to add operation-specific metadata

**Cons:**
- More integration points (one per route)
- Must remember to add logging to new routes

### Recommendation: Option B (Explicit Logger Calls)

Explicit calls provide better domain context and align with the existing audit pattern used in routes. The `createAuditEvent` calls are already placed explicitly in handlers -- user ops logging follows the same pattern.

---

## Proposed Design

### New Module: `lib/user-ops-log.ts`

```typescript
export interface UserOpsLogEntry {
  timestamp: string;      // ISO 8601
  actorId: string;
  actorHandle: string;
  action: UserOpsAction;
  targetId: string | null;
  teamId: string | null;
  metadata: Record<string, unknown>;
}

export type UserOpsAction =
  | 'search'
  | 'submit'
  | 'edit'
  | 'review'
  | 'review-list'
  | 'import'
  | 'export';

export interface UserOpsLogConfig {
  enabled: boolean;
  logDir: string;
}

export function loadUserOpsLogConfig(): UserOpsLogConfig { ... }
export async function logUserOperation(entry: UserOpsLogEntry): Promise<void> { ... }
```

### Config Extension

Add to `config.ts` or create separate config loading:

```typescript
// Environment variables
LOG_USER_OPS_ENABLED=false  // default off
LOG_USER_OPS_DIR=logs/user-ops  // default directory
```

### File Output Format

JSON Lines (one JSON object per line) for easy parsing:

```json
{"timestamp":"2026-04-19T10:30:00Z","actorId":"user_1","actorHandle":"alice","action":"search","targetId":null,"teamId":"team_1","metadata":{"seed":"docker","mode":"semantic","resultCount":5}}
{"timestamp":"2026-04-19T10:31:00Z","actorId":"user_1","actorHandle":"alice","action":"submit","targetId":"knowledge_42","teamId":"team_1","metadata":{"scope":"project","labels":["docker","deployment"]}}
```

### File Naming

Daily log files for simplicity (rotation handled in Phase 22):

```
logs/user-ops/2026-04-19.log
logs/user-ops/2026-04-20.log
```

---

## Integration Points

### 1. Config Loading

In `app.ts`:

```typescript
import { loadUserOpsLogConfig } from './lib/user-ops-log.js';

const userOpsLogConfig = loadUserOpsLogConfig();
app.decorate('userOpsLogConfig', userOpsLogConfig);
```

### 2. Route Handler Integration

In each route handler, after auth resolution:

```typescript
// Example: search route
app.post('/v1/retrieval/search', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:search');
  const query = retrievalQuerySchema.parse(request.body);
  const result = await searchKnowledge(app.skillShareer, auth, query);

  // Log user operation (fire-and-forget)
  void logUserOperation({
    timestamp: nowIso(),
    actorId: auth.actorId,
    actorHandle: auth.handle,
    action: 'search',
    targetId: null,
    teamId: auth.activeTeamId,
    metadata: { mode: 'semantic', resultCount: result.items.length },
  });

  return retrievalResponseSchema.parse(result);
});
```

### 3. Decorate FastifyInstance

Add to `lib/context.ts`:

```typescript
declare module 'fastify' {
  interface FastifyInstance {
    skillShareer: SkillShareerServices;
    userOpsLogConfig?: UserOpsLogConfig;
  }
}
```

---

## Test Strategy

### Unit Tests (`lib/user-ops-log.test.ts`)

- Config loading with defaults and env overrides
- Log entry formatting
- File writing behavior
- Disabled mode (no file writes)

### Integration Tests (`routes/*.test.ts` extension)

- Verify logging occurs when enabled
- Verify no logging when disabled
- Verify log entry structure

### Test Pattern (from existing tests)

```typescript
describe('user ops logger', () => {
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

  it('logs search operation when enabled', async () => {
    // Set LOG_USER_OPS_ENABLED=true
    // Make search request
    // Verify log file written
  });
});
```

---

## Phase Boundary: What NOT to Do

**Out of scope for Phase 21:**

1. **File rotation** (LOG-04) -- Phase 22
2. **RAG logging** (LOG-02) -- Phase 22
3. **Log aggregation** (ELK, etc.) -- out of scope per REQUIREMENTS.md
4. **Real-time log streaming** -- out of scope per REQUIREMENTS.md
5. **API endpoint to query logs** -- logs are file-only, use `audit` API for queryable history

**Phase 22 will add:**
- Size-based rotation (e.g., 10MB max)
- Time-based rotation (daily or configurable)
- RAG-specific logging with `LOG_RAG_ENABLED`

---

## Environment Variables to Document

Add to `.env.example` and `.env.production.example`:

```bash
# --------------------------------------------
# User Operations Logging (Phase 21)
# --------------------------------------------
# Enable user operations logging to files
LOG_USER_OPS_ENABLED=false

# Directory for user ops log files (default: logs/user-ops)
# LOG_USER_OPS_DIR=logs/user-ops
```

---

## Dependencies

**No new dependencies required.**

- Use existing `node:fs/promises` for file I/O
- Use existing `zod` for config validation (optional)
- Fastify/Pino already available for internal logging (e.g., logging errors during file write)

---

## Design Decisions (Pre-Resolved)

1. **Log format:** JSON Lines -- easy to parse, standard for log aggregation
2. **Fire-and-forget vs await:** Fire-and-forget with void operator -- don't block responses on logging. Log errors to Fastify logger (`app.log.error`)
3. **Search result count in metadata:** Include result count in search logs -- valuable for understanding search patterns
4. **Failed operations:** Only log successful operations. Errors are captured by Fastify logger.

---

## Reference: Existing Audit Actions

For reference, audit actions currently in use:

```typescript
// From operations.ts contracts
action: z.enum([
  'knowledge-submitted',
  'knowledge-reviewed',
  'knowledge-imported',
  'knowledge-exported',
  'knowledge-deactivated',
  'member-updated',
  'artifact-imported',
  'artifact-exported',
])
```

Phase 19/20 added:
- `artifact-edited`
- `artifact-reviewed`
- `artifact-history-viewed`

User ops actions are intentionally simpler (`search`, `submit`, `edit`, `review`, `import`, `export`) for operational clarity.

---

## What You Need to Know to PLAN This Phase

### Core Question

**"How do I create a file-based user operations logger that can be toggled independently via .env and integrates cleanly into the existing Fastify route handlers?"**

### Key Decisions for Planning

| Decision | Options | Research Recommendation |
|----------|---------|------------------------|
| Logger architecture | Hook-based vs explicit calls | Explicit calls (aligns with existing audit pattern) |
| Log format | JSON Lines vs NDJSON vs text | JSON Lines (standard, parseable) |
| Write strategy | Await vs fire-and-forget | Fire-and-forget (don't block responses) |
| File naming | Daily vs sequential | Daily files (rotation in Phase 22) |
| Log directory | Fixed vs configurable | Configurable via `LOG_USER_OPS_DIR` |

### Files to Create

1. **`packages/server/src/lib/user-ops-log.ts`** -- Core logger module
   - `UserOpsLogEntry` interface
   - `UserOpsAction` type
   - `loadUserOpsLogConfig()` function
   - `logUserOperation()` async function

2. **`packages/server/src/lib/user-ops-log.test.ts`** -- Unit tests

### Files to Modify

1. **`packages/server/src/config.ts`** -- Add user ops log config to ServerConfig (or create separate config)

2. **`packages/server/src/lib/context.ts`** -- Extend FastifyInstance declaration

3. **`packages/server/src/app.ts`** -- Initialize and decorate user ops config

4. **Route files** (add logging calls):
   - `routes/retrieval.ts` (3 routes: search)
   - `routes/knowledge.ts` (3 routes: submit, edit, resubmit)
   - `routes/review.ts` (2 routes: review-queue, review)
   - `routes/operations.ts` (7 routes: import, export, edit, review, etc.)

5. **`.env.example`** -- Document new env vars

6. **`.env.production.example`** -- Document new env vars

### Success Criteria Checklist

Plan must ensure:

- [ ] `LOG_USER_OPS_ENABLED` env var controls logging independently
- [ ] Logs write to `logs/user-ops/` directory by default
- [ ] Each log entry includes: `actorId`, `action`, `targetId`, `timestamp`
- [ ] All 15 routes listed above are instrumented
- [ ] Logger is disabled by default (no log files created unless explicitly enabled)
- [ ] Unit tests cover config loading and file writing
- [ ] Integration tests verify logging behavior

### Constraints

- **No new npm dependencies** -- use existing `node:fs/promises`
- **Don't modify audit system** -- user ops log is separate
- **Don't affect existing Fastify logger** -- LOG_LEVEL remains independent
- **Phase 22 will add rotation** -- keep file writing simple for now

### Integration Pattern

Follow the existing audit integration pattern:

```typescript
// Existing audit pattern in routes:
const auditEvent = createAuditEvent({ store, data, actor, action, entityId, payload });
data.auditEvents.push(auditEvent);

// New user ops pattern (after successful operation):
void logUserOperation({ timestamp, actorId, action, targetId, teamId, metadata });
```

Key difference: Audit writes to store (synchronous, in transaction); user ops writes to file (async, fire-and-forget).

### Testing Strategy

1. **Unit tests** for `lib/user-ops-log.ts`:
   - Config loading defaults
   - Config env overrides
   - Log entry formatting
   - File append behavior
   - Disabled mode (no writes)

2. **Integration tests** (extend existing route tests or add new):
   - Build server with logging enabled
   - Make requests
   - Verify log file exists and contains expected entries
   - Build server with logging disabled
   - Verify no log files created

### Risk Areas

1. **Concurrent writes** -- Multiple requests may write simultaneously. Use `appendFile` with proper file handles or queue writes.

2. **Directory creation** -- Ensure `logs/user-ops/` exists before writing. Create on first write if needed.

3. **Error handling** -- Log write failures should not affect request responses. Catch and log to Fastify logger.

4. **Test isolation** -- Each test should use a unique log directory or clean up after itself to avoid cross-test contamination.

### Dependencies on Prior Phases

- **Phase 16** (Compatibility Migration) -- No direct dependency, but route handlers already instrumented with audit events provide the pattern to follow
- **No blocking dependencies** -- Can proceed independently of Phases 17-20