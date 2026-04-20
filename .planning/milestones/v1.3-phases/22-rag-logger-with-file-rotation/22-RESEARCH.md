# Phase 22: RAG Logger with File Rotation - Research

**Gathered:** 2026-04-19
**Phase Goal:** Log RAG retrieval details with independent switch and file rotation
**Requirements:** LOG-02, LOG-03 (partial), LOG-04

---

## Summary

This phase adds a RAG-specific logger that captures retrieval pipeline details (strategy, steps, latency), controlled independently by `LOG_RAG_ENABLED`. Additionally, both user ops and RAG log layers gain size-based file rotation to complement the existing daily time-based rotation.

---

## Requirements Analysis

### LOG-02: Log RAG retrieval details

> Server logs RAG retrieval details including retrieval strategy, pipeline steps, and latency per query

**Implications:**
- Must capture retrieval mode (semantic, hybrid, graph-assisted)
- Must log pipeline step timings (eligibility, recall, rerank, assembly, summary)
- Must log per-query latency from start to response
- Must integrate into `searchKnowledge()` and `searchKnowledgeV2()` orchestrator functions

**RAG Log Entry Fields:**
| Field | Description | Source |
|-------|-------------|--------|
| timestamp | ISO 8601 timestamp | Query start time |
| queryId | Unique identifier for the query | Generated per query |
| seed | The search seed text | Query parameter |
| mode | Retrieval mode (semantic/hybrid/graph-assisted) | Query parameter |
| actorId | User performing the search | Auth context |
| teamId | Team context | Auth context |
| pipelineSteps | Array of step timings | Instrumented pipeline |
| totalLatencyMs | Total query latency | Calculated |
| resultCount | Number of results returned | Response |
| metadata | Additional context (filters, maxResults) | Query parameters |

### LOG-03 (partial): Independent .env configuration

> Each log layer (user ops, RAG) can be independently enabled/disabled via .env configuration

**Already implemented for user ops:**
- `LOG_USER_OPS_ENABLED` (Phase 21)

**New for RAG:**
- `LOG_RAG_ENABLED` env var (boolean, default `false`)
- `LOG_RAG_DIR` env var (default `logs/rag`)

### LOG-04: Log file rotation

> Log output writes to structured files with size-based and time-based rotation

**Implications:**
- Size-based rotation: Rotate when file exceeds max size (e.g., 10MB)
- Time-based rotation: Already implemented via daily YYYY-MM-DD.log naming
- Must apply to BOTH user ops and RAG log layers
- Rotation creates numbered backup files (e.g., `2026-04-19.log.1`, `2026-04-19.log.2`)

---

## Existing Infrastructure

### User Ops Logger (Phase 21 Reference)

Location: `packages/server/src/lib/user-ops-log.ts`

```typescript
export interface UserOpsLogConfig {
  enabled: boolean;
  logDir: string;
}

export interface UserOpsLogEntry {
  timestamp: string;
  actorId: string;
  actorHandle: string;
  action: UserOpsAction;
  targetId: string | null;
  teamId: string | null;
  metadata: Record<string, unknown>;
}

export function loadUserOpsLogConfig(): UserOpsLogConfig { ... }
export async function logUserOperation(config, entry): Promise<void> { ... }
```

**Key patterns to follow:**
- Env-driven config loading
- Fire-and-forget async writes (swallow errors)
- JSON Lines format (one object per line)
- Daily file naming: `YYYY-MM-DD.log`
- Integrated into ServerConfig

### Retrieval Orchestrator

Location: `packages/server/src/lib/retrieval/orchestrator.ts`

The `searchKnowledge()` function has a well-defined pipeline:

```typescript
export async function searchKnowledge(services, auth, query): Promise<RetrievalResponse> {
  // 1. Parse and validate query
  const parsed = retrievalQuerySchema.parse(query);

  // 2. Get data snapshot
  const data = await services.store.snapshot();

  // 3. Filter eligible entries
  const eligibleEntries = filterEligibleEntries(data.knowledgeEntries, auth, parsed.filters);

  // 4. Dispatch by mode (semantic/hybrid/graph-assisted)
  const { scoredEntries, mergedCandidates } = await dispatchByMode(...);

  // 5. Build citations
  const citations = mergedCandidates ? new Map(buildCitations(...) : undefined;

  // 6. Assemble response buckets
  const { globalConstraints, projectKnowledge } = assembleResponseBuckets(...);

  // 7. Generate summary (if requested)
  const summary = parsed.includeSummary ? buildSummary(...) : null;

  // 8. Generate refinement (if requested)
  const refinementSummary = parsed.includeRefinement ? await generateRefinement(...) : null;

  return buildRetrievalResponse(...);
}
```

**Instrumentation points:**
- Step 2: Data snapshot fetch timing
- Step 3: Eligibility filtering timing
- Step 4: Recall timing (semantic/hybrid/graph-assisted)
- Step 5-6: Assembly timing
- Step 7-8: Summary/refinement timing

### Retrieval Types

Location: `packages/server/src/lib/retrieval/types.ts`

```typescript
export interface RetrievalStats {
  totalEntries: number;
  eligibleEntries: number;
  returnedEntries: number;
  refinementAttempted: boolean;
}

export type RecallChannel = 'semantic' | 'keyword' | 'graph';

export interface MergedCandidate {
  entry: KnowledgeRecord;
  semanticScore: number;
  keywordScore: number;
  graphScore?: number;
  combinedScore: number;
  channels: RecallChannel[];
  // ... other fields
}
```

### ServerConfig Pattern

Location: `packages/server/src/config.ts`

```typescript
export interface ServerConfig {
  dataFile: string;
  host: string;
  port: number;
  systemAdminKey: string | null;
  userOpsLog: UserOpsLogConfig;
}
```

**Extension for RAG:**
```typescript
export interface ServerConfig {
  // ... existing fields
  userOpsLog: UserOpsLogConfig;
  ragLog: RagLogConfig;
}
```

---

## File Rotation Design

### Current State (Phase 21)

Daily files without size limits:
```
logs/user-ops/
├── 2026-04-18.log
├── 2026-04-19.log
└── 2026-04-20.log
```

### Proposed Rotation Strategy

**Size-based rotation on write:**
1. Before appending, check current file size
2. If size >= maxFileSize, rotate:
   - Rename current file: `2026-04-19.log` → `2026-04-19.log.1`
   - Shift existing backups: `.1` → `.2`, `.2` → `.3`, etc.
   - Create new empty file
3. Append log entry to current file

**New config fields:**
```typescript
export interface RotationConfig {
  maxFileSizeBytes: number;   // e.g., 10 * 1024 * 1024 = 10MB
  maxBackupFiles: number;     // e.g., 5 backup files per day
}
```

**Environment variables:**
- `LOG_MAX_FILE_SIZE_MB` (default: 10)
- `LOG_MAX_BACKUP_FILES` (default: 5)

**Resulting file structure:**
```
logs/user-ops/
├── 2026-04-19.log           # Current file
├── 2026-04-19.log.1         # First backup (most recent)
├── 2026-04-19.log.2         # Second backup
├── 2026-04-19.log.3         # Third backup
└── 2026-04-20.log           # New day's file
```

### Rotation Implementation Options

#### Option A: Check-then-append (simple)

```typescript
async function appendWithRotation(filepath, line, config) {
  const stats = await stat(filepath).catch(() => null);

  if (stats && stats.size >= config.maxFileSizeBytes) {
    await rotateFile(filepath, config.maxBackupFiles);
  }

  await appendFile(filepath, line);
}
```

**Pros:** Simple, minimal overhead
**Cons:** Race condition if multiple writes happen simultaneously

#### Option B: Write-then-check (post-rotation)

```typescript
async function appendWithRotation(filepath, line, config) {
  await appendFile(filepath, line);

  const stats = await stat(filepath);
  if (stats.size >= config.maxFileSizeBytes) {
    await rotateFile(filepath, config.maxBackupFiles);
  }
}
```

**Pros:** No missed writes during rotation
**Cons:** File may exceed limit slightly before rotation

#### Option C: Lock-based rotation

Use a mutex/lock to ensure only one write/rotation at a time.

**Pros:** No race conditions
**Cons:** More complex, potential contention

**Recommendation: Option A (Check-then-append)**

For fire-and-forget logging, occasional race conditions are acceptable. The log will be slightly over the limit at most.

---

## RAG Logging Design

### New Module: `lib/rag-log.ts`

```typescript
export interface RagLogConfig {
  enabled: boolean;
  logDir: string;
  maxFileSizeBytes: number;
  maxBackupFiles: number;
}

export interface PipelineStep {
  name: string;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}

export interface RagLogEntry {
  timestamp: string;
  queryId: string;
  seed: string;
  mode: 'semantic' | 'hybrid' | 'graph-assisted' | 'v2-capsule';
  actorId: string;
  teamId: string | null;
  pipelineSteps: PipelineStep[];
  totalLatencyMs: number;
  resultCount: number;
  metadata: {
    filters?: { labels: string[]; scopes: string[] };
    maxResults: number;
    includeSummary: boolean;
    includeRefinement: boolean;
  };
}

export function loadRagLogConfig(): RagLogConfig { ... }
export async function logRagRetrieval(config, entry): Promise<void> { ... }
```

### Pipeline Step Names

| Step | Description | Function |
|------|-------------|----------|
| `parse` | Query parsing and validation | `retrievalQuerySchema.parse()` |
| `snapshot` | Store snapshot fetch | `services.store.snapshot()` |
| `eligibility` | Filter eligible entries | `filterEligibleEntries()` |
| `recall` | Mode-specific recall (semantic/hybrid/graph) | `dispatchByMode()` |
| `citations` | Build citations from candidates | `buildCitations()` |
| `assembly` | Assemble response buckets | `assembleResponseBuckets()` |
| `summary` | Generate summary | `buildSummary()` |
| `refinement` | Generate refinement | `generateRefinement()` |

### Instrumentation Pattern

Wrap pipeline stages with timing:

```typescript
async function timedStep<T>(
  name: string,
  fn: () => Promise<T>,
  steps: PipelineStep[],
): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const latencyMs = Date.now() - start;
  steps.push({ name, latencyMs });
  return result;
}

// In searchKnowledge:
const steps: PipelineStep[] = [];

const parsed = await timedStep('parse',
  () => retrievalQuerySchema.parse(query), steps);

const data = await timedStep('snapshot',
  () => services.store.snapshot(), steps);

const eligibleEntries = await timedStep('eligibility',
  () => filterEligibleEntries(...), steps);

// ... etc.

// Log at the end (fire-and-forget)
void logRagRetrieval(config, {
  timestamp: startTime,
  queryId: generateQueryId(),
  seed: parsed.seed,
  mode: parsed.mode,
  actorId: auth.actorId,
  teamId: auth.activeTeamId,
  pipelineSteps: steps,
  totalLatencyMs: Date.now() - startMs,
  resultCount: globalConstraints.length + projectKnowledge.length,
  metadata: { ... },
});
```

---

## Integration Points

### 1. Config Loading

Update `packages/server/src/config.ts`:

```typescript
import { loadUserOpsLogConfig } from './lib/user-ops-log.js';
import { loadRagLogConfig } from './lib/rag-log.js';

export interface ServerConfig {
  dataFile: string;
  host: string;
  port: number;
  systemAdminKey: string | null;
  userOpsLog: UserOpsLogConfig;
  ragLog: RagLogConfig;
}

export function loadConfig(): ServerConfig {
  return {
    // ... existing fields
    userOpsLog: loadUserOpsLogConfig(),
    ragLog: loadRagLogConfig(),
  };
}
```

### 2. RAG Logging in Orchestrator

Update `packages/server/src/lib/retrieval/orchestrator.ts`:

- Add timing instrumentation to `searchKnowledge()`
- Add timing instrumentation to `searchKnowledgeV2()`
- Add `logRagRetrieval()` call at the end of each function

### 3. Update User Ops Logger for Rotation

Update `packages/server/src/lib/user-ops-log.ts`:

- Add rotation config fields
- Implement `appendWithRotation()` function
- Update `logUserOperation()` to use rotation

---

## Environment Variables

Add to `.env.example` and `.env.production.example`:

```bash
# --------------------------------------------
# RAG Logging (Phase 22)
# --------------------------------------------
# Enable RAG retrieval logging to files
LOG_RAG_ENABLED=false

# Directory for RAG log files (default: logs/rag)
# LOG_RAG_DIR=logs/rag

# --------------------------------------------
# Log Rotation (Phase 22)
# --------------------------------------------
# Maximum log file size in MB before rotation (default: 10)
# LOG_MAX_FILE_SIZE_MB=10

# Maximum number of backup files per day (default: 5)
# LOG_MAX_BACKUP_FILES=5
```

---

## Test Strategy

### Unit Tests for RAG Logger

Location: `packages/server/src/lib/rag-log.test.ts`

- Config loading with defaults and env overrides
- Log entry formatting
- Pipeline step timing
- File writing behavior
- Disabled mode (no file writes)

### Unit Tests for Rotation

Location: `packages/server/src/lib/log-rotation.test.ts`

- File size checking
- Rotation when exceeding limit
- Backup file naming
- Max backup count enforcement
- Rotation with no existing backups

### Integration Tests

Location: `packages/server/src/routes/retrieval.test.ts` (extend)

- RAG logging occurs when enabled
- No RAG logging when disabled
- Log entry contains expected pipeline steps
- Log entry contains correct latency

---

## Files to Create

1. **`packages/server/src/lib/rag-log.ts`** - RAG logger module
   - `RagLogConfig` interface
   - `RagLogEntry` interface
   - `PipelineStep` interface
   - `loadRagLogConfig()` function
   - `logRagRetrieval()` async function

2. **`packages/server/src/lib/rag-log.test.ts`** - Unit tests for RAG logger

3. **`packages/server/src/lib/log-rotation.ts`** - Shared rotation logic
   - `RotationConfig` interface
   - `appendWithRotation()` function
   - `rotateFile()` function
   - `getFileSize()` function

4. **`packages/server/src/lib/log-rotation.test.ts`** - Unit tests for rotation

## Files to Modify

1. **`packages/server/src/config.ts`** - Add ragLog to ServerConfig

2. **`packages/server/src/lib/user-ops-log.ts`** - Add rotation support

3. **`packages/server/src/lib/retrieval/orchestrator.ts`** - Add RAG logging instrumentation

4. **`.env.example`** - Document new env vars

5. **`.env.production.example`** - Document new env vars

---

## Success Criteria Checklist

Plan must ensure:

- [ ] `LOG_RAG_ENABLED` env var controls RAG logging independently
- [ ] RAG logs write to `logs/rag/` directory by default
- [ ] Each RAG log entry includes: timestamp, queryId, seed, mode, pipelineSteps, totalLatencyMs
- [ ] Pipeline steps are timed: eligibility, recall, assembly, summary, refinement
- [ ] Both user ops and RAG logs support size-based rotation
- [ ] Rotation creates numbered backup files (`.1`, `.2`, etc.)
- [ ] Rotation respects max file size (default 10MB) and max backup count (default 5)
- [ ] Logger is disabled by default (no log files created unless explicitly enabled)
- [ ] Unit tests cover config loading, file writing, and rotation
- [ ] Integration tests verify logging behavior

---

## Dependencies

**No new npm dependencies required.**

- Use existing `node:fs/promises` for file I/O
- Use existing `node:fs` `stat` for file size checking
- Use existing timing via `Date.now()`

---

## Risk Areas

1. **Concurrent writes to same log file** - Multiple retrieval requests may write simultaneously. Use fire-and-forget with try/catch.

2. **Rotation race conditions** - Two requests may try to rotate simultaneously. Acceptable for fire-and-forget logging.

3. **Large log entries** - Very long seeds or large metadata could create large log entries. Consider truncating seeds in logs.

4. **Performance overhead** - Timing instrumentation adds minimal overhead. Measure in tests.

5. **Disk space** - With rotation limits, disk usage is bounded. Without limits, could fill disk.

---

## Design Decisions (Pre-Resolved)

1. **Shared rotation logic:** Create `log-rotation.ts` module used by both loggers -- DRY principle
2. **Timing method:** Use `Date.now()` for milliseconds -- no need for nanosecond precision
3. **Query ID:** Generate unique ID per query using existing ID generation pattern
4. **Step timing:** Time each major pipeline stage, not every sub-operation -- balance detail vs overhead
5. **Fire-and-forget:** Log writes don't block response -- same pattern as user ops logger

---

## What You Need to Know to PLAN This Phase

### Core Question

**"How do I create a RAG-specific logger with pipeline timing, add size-based rotation to both log layers, and integrate cleanly into the retrieval orchestrator?"**

### Key Decisions for Planning

| Decision | Options | Research Recommendation |
|----------|---------|------------------------|
| Rotation strategy | Check-then-append vs write-then-check vs lock-based | Check-then-append (simple, acceptable race) |
| Shared rotation code | New module vs duplicate | New `log-rotation.ts` module (DRY) |
| Pipeline granularity | Per-stage vs per-function | Per-stage (eligibility, recall, assembly, etc.) |
| Query ID generation | UUID vs counter-based | Counter-based (matches existing ID pattern) |
| Timing precision | ms vs ns | Milliseconds (sufficient for latency tracking) |

### Implementation Order

1. **Rotation module first** - `log-rotation.ts` with shared rotation logic
2. **Update user ops logger** - Add rotation support to existing logger
3. **Create RAG logger** - New `rag-log.ts` module following user ops pattern
4. **Instrument orchestrator** - Add timing and logging to retrieval functions
5. **Config integration** - Add ragLog to ServerConfig
6. **Env documentation** - Update .env.example files
7. **Tests** - Unit and integration tests for all new functionality

### Constraints

- **No new npm dependencies** -- use existing `node:fs/promises`
- **Don't break existing user ops logger** -- rotation is additive
- **Keep fire-and-forget pattern** -- logging must not affect response latency
- **RAG logging must be independent** -- LOG_RAG_ENABLED separate from LOG_USER_OPS_ENABLED

### Dependencies on Prior Phases

- **Phase 21** (User Operations Logger) -- Provides the logging pattern to follow
- **Phase 6-7** (Retrieval Pipeline) -- Provides the orchestrator to instrument
- **Phase 14** (v2 Retrieval) -- Provides searchKnowledgeV2 to instrument

### Testing Strategy

1. **Unit tests for rotation:**
   - File size checking
   - Rotation execution
   - Backup file management
   - Max backup count enforcement

2. **Unit tests for RAG logger:**
   - Config loading
   - Entry formatting
   - File writing
   - Disabled mode

3. **Integration tests:**
   - RAG logging enabled/disabled
   - Log entry content verification
   - Pipeline step timing presence
   - Rotation triggered in high-volume test