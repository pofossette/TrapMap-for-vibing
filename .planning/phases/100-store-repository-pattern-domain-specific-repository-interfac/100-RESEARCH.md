# Phase 100: Store Repository Pattern - Research

**Researched:** 2026-05-07
**Domain:** Repository pattern, store abstraction, Fastify decoration
**Confidence:** HIGH

## Summary

TrapMap's `SkillShareerStore` exposes `snapshot()/transact()/nextId()` — three methods that give routes direct access to the entire `StoreData` mega-structure (15+ arrays). Routes currently call `store.snapshot()` then operate on raw arrays like `data.knowledgeEntries.find(...)`. Phase 83 partially addressed this by creating repository interfaces for 8 domains (knowledge, artifact, session, accessKey, team, membership, user, candidate), but these repos are wired as flat optional properties on `app.skillShareer` and only populated when PostgreSQL is available.

This phase must: (1) restructure the decoration to use a `repos` object, (2) ensure all 8 existing repos get InMemory implementations for the JSON path, (3) create missing repos for domains still accessed via raw store (feedback, audit, duplicateCases, entityLineage, graphIndexDocuments), and (4) migrate route files to use repos instead of direct store access.

**Primary recommendation:** Follow the established InMemory + DualWrite + Pg tri-layer pattern from KnowledgeRepository. Create repos for missing domains, wire them into a `repos` object on `app.skillShareer`, then incrementally migrate routes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Repository interfaces | API / Backend (lib/) | — | Domain logic lives in lib modules |
| InMemory implementations | API / Backend (lib/) | — | Wraps SkillShareerStore for JSON path |
| PG implementations | API / Backend (lib/) | — | Drizzle ORM + pg pool |
| Route migration | API / Backend (routes/) | — | Routes consume repos, not raw store |
| Fastify decoration | API / Backend (app.ts) | — | Wires repos into app context |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | (already in project) | PostgreSQL ORM | Used by existing PgKnowledgeRepository |
| pg | (already in project) | PostgreSQL client | Pool type for PG repos |
| @trapmap/contracts | (monorepo) | Zod schemas + types | Shared record types |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | (already in project) | Test framework | All repository tests |
| zod | (already in contract) | Validation | Input validation in repos |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| InMemory + Pg dual impl | Single generic repo | Loses type safety per domain |
| repos object on decoration | Individual flat props | Current approach — scattered, optional |

**Installation:** No new packages needed. All dependencies already in project.

## Architecture Patterns

### System Architecture Diagram

```
Route Layer (knowledge.ts, review.ts, candidates.ts, ...)
    |
    | calls repos.knowledge.getById(id), repos.feedback.insert(record), etc.
    v
Repository Interface (KnowledgeRepository, FeedbackRepository, ...)
    |
    +--- InMemoryKnowledgeRepository (wraps SkillShareerStore.snapshot/transact)
    |       Used when: no PostgreSQL pool (JSON mode, tests)
    |
    +--- DualWriteKnowledgeRepository (primary PG + shadow JSONB)
    |       Used when: PostgreSQL pool available
    |
    +--- PgKnowledgeRepository (pure PostgreSQL)
            Used when: PostgreSQL pool available (future: after JSONB sunset)
    v
SkillShareerStore (JsonStore or PostgresStore)
    |
    v
Persistence Layer (JSON file or PostgreSQL database)
```

### Current vs Target Decoration

**Before (current):**
```typescript
app.decorate('skillShareer', {
  store: SkillShareerStore,
  knowledgeRepo: undefined,      // PG only
  artifactRepo: undefined,       // PG only
  sessionRepo: undefined,        // PG only
  // ... 5 more flat optional props
});
```

**After (target):**
```typescript
app.decorate('skillShareer', {
  store: SkillShareerStore,
  repos: {
    knowledge: KnowledgeRepo,     // always populated
    artifact: ArtifactRepo,       // always populated
    session: SessionRepo,         // always populated
    accessKey: AccessKeyRepo,     // always populated
    team: TeamRepo,               // always populated
    membership: MembershipRepo,   // always populated
    user: UserRepo,               // always populated
    candidate: CandidateRepo,     // always populated
    feedback: FeedbackRepo,       // NEW
    audit: AuditRepo,             // NEW
    duplicate: DuplicateRepo,     // NEW
    lineage: LineageRepo,         // NEW
    graphIndex: GraphIndexRepo,   // NEW
  }
});
```

### Recommended Project Structure

```
packages/server/src/lib/
├── knowledge/
│   ├── repository.ts          # KnowledgeRepository interface + InMemory
│   ├── pg-repository.ts       # PgKnowledgeRepository
│   └── index.ts               # barrel export + factory
├── artifacts/
│   ├── repository.ts          # ArtifactRepository interface + InMemory
│   ├── pg-repository.ts       # PgArtifactRepository
│   └── index.ts               # barrel export + factory
├── auth/
│   ├── repository.ts          # SessionRepository, AccessKeyRepository interfaces + InMemory
│   └── index.ts               # barrel export + factory
├── teams/
│   ├── repository.ts          # TeamRepository, MembershipRepository interfaces + InMemory
│   └── index.ts               # barrel export + factory
├── users/
│   ├── repository.ts          # UserRepository interface + InMemory
│   └── index.ts               # barrel export + factory
├── candidates/
│   ├── repository.ts          # CandidateRepository interface + InMemory
│   ├── pg-repository.ts       # PgCandidateRepository
│   └── index.ts               # barrel export + factory
├── feedback/                  # NEW
│   ├── repository.ts          # FeedbackRepository interface + InMemory
│   └── index.ts               # barrel export + factory
├── audit/                     # NEW
│   ├── repository.ts          # AuditRepository interface + InMemory
│   └── index.ts               # barrel export + factory
├── duplicates/                # NEW
│   ├── repository.ts          # DuplicateRepository interface + InMemory
│   └── index.ts               # barrel export + factory
├── lineage/                   # NEW
│   ├── repository.ts          # LineageRepository interface + InMemory
│   └── index.ts               # barrel export + factory
├── graph-index/               # NEW
│   ├── repository.ts          # GraphIndexRepository interface + InMemory
│   └── index.ts               # barrel export + factory
└── repos/
    └── index.ts               # createAllRepos() factory wiring all repos
```

### Pattern 1: Repository Interface + InMemory + Factory

This is the established pattern from Phase 83. Every domain follows the same structure.

**What:** Interface defines domain operations, InMemory wraps SkillShareerStore, factory selects implementation based on pool availability.

**When to use:** Every new domain repository.

**Example (from existing KnowledgeRepository):**
```typescript
// Source: packages/server/src/lib/knowledge/repository.ts

export interface KnowledgeRepository {
  nextId(): Promise<string>;
  insert(entry: KnowledgeRecord): Promise<void>;
  getById(entryId: string): Promise<KnowledgeRecord | null>;
  listByFilter(filter: { lifecycleState?: LifecycleState; teamId?: string }): Promise<KnowledgeRecord[]>;
  // ... domain-specific methods
}

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async getById(entryId: string): Promise<KnowledgeRecord | null> {
    const data = await this.store.snapshot();
    return data.knowledgeEntries.find((e) => e.id === entryId) ?? null;
  }

  async insert(entry: KnowledgeRecord): Promise<void> {
    await this.store.transact((data) => {
      data.knowledgeEntries.push(entry);
    });
  }
  // ...
}

export function createKnowledgeRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): KnowledgeRepository {
  if (config.pool) {
    const pgRepo = new PgKnowledgeRepository(config.pool);
    return new DualWriteKnowledgeRepository(pgRepo, config.store);
  }
  return new InMemoryKnowledgeRepository(config.store);
}
```

### Pattern 2: DualWrite for Transition Period

**What:** Writes to PG first, then shadows to JSONB via store.transact(). Used during transition from JSONB to row-level tables.

**When to use:** When a domain has both PG table and JSONB storage during migration.

**Example (from existing DualWriteKnowledgeRepository):**
```typescript
// Source: packages/server/src/lib/knowledge/repository.ts

export class DualWriteKnowledgeRepository implements KnowledgeRepository {
  constructor(
    private readonly primary: KnowledgeRepository,
    private readonly store: SkillShareerStore,
  ) {}

  async insert(entry: KnowledgeRecord): Promise<void> {
    await this.primary.insert(entry);                    // PG first
    await this.store.transact((data) => {                // shadow to JSONB
      data.knowledgeEntries.push(entry);
    });
  }
}
```

### Anti-Patterns to Avoid

- **Optional repos with `??` fallback:** Current pattern uses `app.skillShareer.sessionRepo ?? app.skillShareer.store`. This is the problem being solved — repos should always be populated.
- **Leaking StoreData into routes:** Routes should never import StoreData or access `.knowledgeEntries` directly. All access through repo methods.
- **Breaking backward compatibility:** Old import paths must continue to work via re-exports. Don't delete existing module exports.
- **Migrating everything at once:** Incremental migration per domain is safer. Start with the domain that has the most route consumers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ID generation | Custom counter logic | store.nextId() or PG SEQUENCE | Already implemented, tested |
| Record creation | Manual object construction | Existing factory functions (createKnowledgeEntryRecord, etc.) | Consistent timestamps, defaults |
| State transitions | Inline if/else chains | transitionLifecycleState() from lifecycle/state-machine.ts | Validated transitions |
| Repository wiring | Manual repo creation in each route | createAllRepos() factory | Single source of truth |

## Common Pitfalls

### Pitfall 1: Circular Import Between Repo and Store
**What goes wrong:** Repository imports from store.ts, store.ts re-exports from store/types/, creating circular dependency.
**Why it happens:** Type imports and runtime imports mixed in same file.
**How to avoid:** Use `import type` for type-only imports. Keep repo implementations in separate files from type definitions.
**Warning signs:** TypeScript compilation errors about circular references.

### Pitfall 2: Missing StoreData Field After Migration
**What goes wrong:** Route migrated to use repo, but another route still accesses the same StoreData field directly. If the repo writes only to PG (not JSONB shadow), the other route sees stale data.
**Why it happens:** Incomplete migration of all consumers of a domain.
**How to avoid:** Use DualWrite pattern until ALL consumers of a domain are migrated. Track migration progress per domain.
**Warning signs:** Tests pass individually but fail when run together. Data inconsistency between endpoints.

### Pitfall 3: Breaking the `resolveAuthContext` Chain
**What goes wrong:** `resolveAuthContext` in session.ts accesses store.snapshot() to find sessions and users. If session/user repos are wired but resolveAuthContext still uses store, auth breaks.
**Why it happens:** resolveAuthContext is called from every route — it's the most critical path.
**How to avoid:** Migrate resolveAuthContext to accept repos as parameter (or access from app.skillShareer.repos). This must be one of the first migrations.
**Warning signs:** All routes return 401 after migration.

### Pitfall 4: Test Fixtures Constructing Full StoreData
**What goes wrong:** Tests that construct full StoreData objects break when fields change.
**Why it happens:** Tests bypass repos and directly manipulate store data.
**How to avoid:** Create test helper factories that use repo.insert() instead of direct StoreData manipulation. Migrate tests alongside routes.
**Warning signs:** Test files with large inline StoreData objects.

## Code Examples

### Creating a New Repository Interface

```typescript
// Source: packages/server/src/lib/feedback/repository.ts (NEW)

import type { SkillShareerStore, FeedbackQueueRecord } from '../store.js';

export interface FeedbackRepository {
  nextId(): Promise<string>;
  insert(feedback: FeedbackQueueRecord): Promise<void>;
  getById(feedbackId: string): Promise<FeedbackQueueRecord | null>;
  listByEntry(entryId: string): Promise<FeedbackQueueRecord[]>;
  listByStatus(status: string): Promise<FeedbackQueueRecord[]>;
  update(feedbackId: string, updates: Partial<FeedbackQueueRecord>): Promise<void>;
}

export class InMemoryFeedbackRepository implements FeedbackRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'feedback');
  }

  async insert(feedback: FeedbackQueueRecord): Promise<void> {
    await this.store.transact((data) => {
      data.feedbackQueue.push(feedback);
    });
  }

  async getById(feedbackId: string): Promise<FeedbackQueueRecord | null> {
    const data = await this.store.snapshot();
    return data.feedbackQueue.find((f) => f.id === feedbackId) ?? null;
  }

  async listByEntry(entryId: string): Promise<FeedbackQueueRecord[]> {
    const data = await this.store.snapshot();
    return data.feedbackQueue.filter((f) => f.entryId === entryId);
  }

  async listByStatus(status: string): Promise<FeedbackQueueRecord[]> {
    const data = await this.store.snapshot();
    return data.feedbackQueue.filter((f) => f.status === status);
  }

  async update(feedbackId: string, updates: Partial<FeedbackQueueRecord>): Promise<void> {
    await this.store.transact((data) => {
      const feedback = data.feedbackQueue.find((f) => f.id === feedbackId);
      if (feedback) {
        Object.assign(feedback, updates);
        feedback.updatedAt = new Date().toISOString();
      }
    });
  }
}

export function createFeedbackRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): FeedbackRepository {
  // PG implementation can be added later
  return new InMemoryFeedbackRepository(config.store);
}
```

### Wiring Repos in app.ts

```typescript
// Source: packages/server/src/app.ts (modified)

import { createAllRepos } from './lib/repos/index.js';

// In buildServer():
app.decorate('skillShareer', {
  config,
  store: createSkillShareerStore(config),
  repos: createAllRepos({ store: createSkillShareerStore(config) }),
  // ... other decorations
});

// In onReady hook (PostgreSQL):
app.addHook('onReady', async () => {
  const store = app.skillShareer.store;
  if (store instanceof PostgresStore) {
    const pool = store.getPool();
    // Recreate repos with PG pool
    app.skillShareer.repos = createAllRepos({ store, pool });
  }
});
```

### Route Migration Example

```typescript
// Before:
const data = await app.skillShareer.store.snapshot();
const entry = data.knowledgeEntries.find((e) => e.id === entryId);

// After:
const entry = await app.skillShareer.repos.knowledge.getById(entryId);
```

```typescript
// Before:
const result = await app.skillShareer.store.transact((data) => {
  const entry = data.knowledgeEntries.find((e) => e.id === entryId);
  if (!entry) throw new AppError(404, 'not_found', 'Entry not found');
  entry.lifecycleState = 'approved';
  entry.updatedAt = new Date().toISOString();
  return entry;
});

// After:
await app.skillShareer.repos.knowledge.updateLifecycle(entryId, 'approved', {
  actorId: auth.actorId,
  note: 'Approved by reviewer',
});
const entry = await app.skillShareer.repos.knowledge.getById(entryId);
```

## Runtime State Inventory

> This phase is a refactor/migration, so runtime state inventory is required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | StoreData JSON file (JSON mode) — all 15+ arrays accessed via snapshot/transact | No data migration needed — InMemory repos wrap same store |
| Live service config | None — all config is in code/env vars | None |
| OS-registered state | None — no OS-level registrations | None |
| Secrets/env vars | None — no secrets reference StoreData structure | None |
| Build artifacts | None — TypeScript compilation produces fresh artifacts | None |

**Key insight:** This is a pure code refactor. The StoreData structure itself doesn't change — only how routes access it. The InMemory repos wrap the same SkillShareerStore, so JSON file format is unchanged. No data migration needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | TypeScript compilation | ✓ | v24.15.0 | — |
| pnpm | Package management | ✓ | 10.33.0 | — |
| TypeScript | Type checking | ✓ | (project) | — |
| Vitest | Testing | ✓ | (project) | — |
| PostgreSQL (pg pool) | PG repo implementations | Optional | — | InMemory fallback |

**Missing dependencies with no fallback:** None — all required tools available.

**Missing dependencies with fallback:** PostgreSQL is optional — InMemory repos work without it.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | packages/server/vitest.config.ts |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (none specified) | Repository interface contracts | unit | `pnpm test -- --run src/lib/*/repository.ts` | Partial — knowledge, candidates have tests |
| (none specified) | InMemory repo operations | unit | `pnpm test -- --run src/lib/knowledge/repository.test.ts` | Some exist |
| (none specified) | Route migration correctness | integration | `pnpm test -- --run src/routes/*.test.ts` | Some exist |
| (none specified) | Type safety (compile) | typecheck | `pnpm typecheck` | ✓ |

### Sampling Rate

- **Per task commit:** `pnpm typecheck && pnpm test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Test files for new repos (feedback, audit, duplicate, lineage, graph-index)
- [ ] Test file for `createAllRepos()` factory
- [ ] Integration test verifying route migration doesn't break auth chain

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 83 established the InMemory + DualWrite + Pg pattern as the standard for all repos | Standard Stack | Could need different pattern for some domains |
| A2 | The `repos` object approach is preferred over flat optional properties | Architecture | User may want to keep flat props |
| A3 | No data migration is needed — InMemory repos wrap the same store | Runtime State | If store format changes, migration needed |
| A4 | Phase 100 can be done incrementally (per domain) without breaking existing functionality | Constraints | Big-bang migration may be required |
| A5 | The 5 new domains (feedback, audit, duplicate, lineage, graphIndex) don't need PG implementations yet | Standard Stack | May need DualWrite from start |

## Open Questions

1. **Should the `repos` object be typed as a discriminated union or a plain interface?**
   - What we know: Current decoration uses `app.decorate('skillShareer', {...})` with typed properties
   - What's unclear: Whether to use a `Repos` interface type or inline the object shape
   - Recommendation: Create a `SkillShareerRepos` interface in a new file, reference it in Fastify type augmentation

2. **How to handle `resolveAuthContext` which accesses both sessions and users?**
   - What we know: It's called from every route, accesses `store.snapshot()` for sessions and users
   - What's unclear: Whether to pass repos as parameter or access from app.skillShareer
   - Recommendation: Modify to accept `repos: { session: SessionRepo, user: UserRepo }` parameter, call from routes as `resolveAuthContext(app.skillShareer.repos, request)`

3. **Should candidate store functions (createCandidateSubmission, updateCandidateStatus) be absorbed into CandidateRepository?**
   - What we know: These are standalone functions in candidates/store.ts that operate on StoreData
   - What's unclear: Whether to move logic into repo methods or keep as separate functions
   - Recommendation: Move into repo methods — the repo should encapsulate all domain operations

4. **What about the `store.transact()` calls in routes that do complex multi-step mutations?**
   - What we know: Some routes do multiple reads/writes inside a single transact callback
   - What's unclear: Whether repos should support transactional multi-step operations
   - Recommendation: For complex operations, create domain service methods on the repo that encapsulate the multi-step logic (e.g., `knowledgeRepo.submitEntry(...)` that handles ID generation + record creation + push)

## Sources

### Primary (HIGH confidence)
- `packages/server/src/lib/store/store-data.ts` — StoreData interface definition (15+ arrays)
- `packages/server/src/lib/store/store-interface.ts` — SkillShareerStore interface (snapshot/transact/nextId)
- `packages/server/src/lib/knowledge/repository.ts` — Reference implementation (InMemory + DualWrite + Pg + factory)
- `packages/server/src/lib/auth/repository.ts` — Session/AccessKey repo interfaces + InMemory
- `packages/server/src/lib/teams/repository.ts` — Team/Membership repo interfaces + InMemory
- `packages/server/src/lib/users/repository.ts` — User repo interface + InMemory
- `packages/server/src/lib/candidates/repository.ts` — Candidate repo interface + InMemory
- `packages/server/src/app.ts` — Current decoration pattern (flat optional props)

### Secondary (MEDIUM confidence)
- Phase 83 decisions in STATE.md — Established InMemory + factory pattern
- Phase 87 decisions in STATE.md — Type decomposition into store/types/

### Tertiary (LOW confidence)
- None — all findings verified from codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, pattern established by Phase 83
- Architecture: HIGH — current code clearly shows the gap and the target
- Pitfalls: HIGH — derived from actual codebase patterns and known migration risks

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (30 days — stable architecture, slow-moving domain)
