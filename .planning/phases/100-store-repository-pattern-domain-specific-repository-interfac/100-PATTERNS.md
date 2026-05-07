# Phase 100: Store Repository Pattern - Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 13 new + 3 modified
**Analogs found:** 13 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/server/src/lib/feedback/repository.ts` | repository | CRUD | `packages/server/src/lib/auth/repository.ts` | exact |
| `packages/server/src/lib/feedback/index.ts` | barrel+factory | - | `packages/server/src/lib/users/index.ts` | exact |
| `packages/server/src/lib/audit/repository.ts` | repository | CRUD | `packages/server/src/lib/auth/repository.ts` | exact |
| `packages/server/src/lib/audit/index.ts` | barrel+factory | - | `packages/server/src/lib/users/index.ts` | exact |
| `packages/server/src/lib/duplicates/repository.ts` | repository | CRUD | `packages/server/src/lib/users/repository.ts` | exact |
| `packages/server/src/lib/duplicates/index.ts` | barrel+factory | - | `packages/server/src/lib/users/index.ts` | exact |
| `packages/server/src/lib/lineage/repository.ts` | repository | CRUD | `packages/server/src/lib/users/repository.ts` | exact |
| `packages/server/src/lib/lineage/index.ts` | barrel+factory | - | `packages/server/src/lib/users/index.ts` | exact |
| `packages/server/src/lib/graph-index/repository.ts` | repository | CRUD | `packages/server/src/lib/users/repository.ts` | exact |
| `packages/server/src/lib/graph-index/index.ts` | barrel+factory | - | `packages/server/src/lib/users/index.ts` | exact |
| `packages/server/src/lib/repos/index.ts` | factory | - | (no analog) | - |
| `packages/server/src/lib/context.ts` | config/types | - | (modify existing) | - |
| `packages/server/src/app.ts` | config/wiring | - | (modify existing) | - |
| Route files (incremental) | controller | request-response | `packages/server/src/routes/feedback.ts` | role-match |

## Pattern Assignments

### `packages/server/src/lib/feedback/repository.ts` (repository, CRUD)

**Analog:** `packages/server/src/lib/auth/repository.ts` (lines 1-207)

**Imports pattern** (lines 1-15):
```typescript
import type { Pool } from 'pg';
import type { FeedbackQueueRecord, SkillShareerStore } from '../store.js';
```

**Interface pattern** (lines 21-49, SessionRepository):
```typescript
export interface FeedbackRepository {
  nextId(): Promise<string>;
  insert(feedback: FeedbackQueueRecord): Promise<void>;
  getById(feedbackId: string): Promise<FeedbackQueueRecord | null>;
  listByEntry(entryId: string): Promise<FeedbackQueueRecord[]>;
  listByStatus(status: string): Promise<FeedbackQueueRecord[]>;
  listByFilter(filter: {
    status?: string[];
    problemType?: string[];
    entryId?: string;
    entryType?: string;
  }): Promise<FeedbackQueueRecord[]>;
  update(feedbackId: string, updates: Partial<FeedbackQueueRecord>): Promise<void>;
}
```

**InMemory pattern** (lines 88-136, InMemorySessionRepository):
```typescript
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

  async listByFilter(filter: {
    status?: string[];
    problemType?: string[];
    entryId?: string;
    entryType?: string;
  }): Promise<FeedbackQueueRecord[]> {
    const data = await this.store.snapshot();
    let results = data.feedbackQueue;
    if (filter.status && filter.status.length > 0) {
      results = results.filter((f) => filter.status!.includes(f.status));
    }
    if (filter.problemType && filter.problemType.length > 0) {
      results = results.filter((f) => filter.problemType!.includes(f.problemType));
    }
    if (filter.entryId) {
      results = results.filter((f) => f.entryId === filter.entryId);
    }
    if (filter.entryType) {
      results = results.filter((f) => f.entryType === filter.entryType);
    }
    return results;
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
```

**Factory pattern** (lines 181-191, createSessionRepository):
```typescript
export function createFeedbackRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): FeedbackRepository {
  return new InMemoryFeedbackRepository(config.store);
}
```

---

### `packages/server/src/lib/audit/repository.ts` (repository, CRUD)

**Analog:** `packages/server/src/lib/auth/repository.ts` (lines 1-207)

**Imports pattern** (lines 1-15):
```typescript
import type { Pool } from 'pg';
import type { AuditEventRecord, SkillShareerStore } from '../store.js';
```

**Interface pattern**:
```typescript
export interface AuditRepository {
  nextId(): Promise<string>;
  insert(event: AuditEventRecord): Promise<void>;
  getById(eventId: string): Promise<AuditEventRecord | null>;
  listByFilter(filter: {
    action?: string[];
    actorId?: string;
    entityId?: string;
    teamId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ items: AuditEventRecord[]; total: number }>;
}
```

**InMemory pattern** (follows auth/repository.ts InMemorySessionRepository lines 88-136):
```typescript
export class InMemoryAuditRepository implements AuditRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'audit');
  }

  async insert(event: AuditEventRecord): Promise<void> {
    await this.store.transact((data) => {
      data.auditEvents.push(event);
    });
  }

  async getById(eventId: string): Promise<AuditEventRecord | null> {
    const data = await this.store.snapshot();
    return data.auditEvents.find((e) => e.id === eventId) ?? null;
  }

  async listByFilter(filter: {
    action?: string[];
    actorId?: string;
    entityId?: string;
    teamId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ items: AuditEventRecord[]; total: number }> {
    const data = await this.store.snapshot();
    let events = data.auditEvents;

    if (filter.action && filter.action.length > 0) {
      const actionSet = new Set(filter.action);
      events = events.filter((e) => actionSet.has(e.action));
    }
    if (filter.actorId) {
      events = events.filter((e) => e.actorId === filter.actorId);
    }
    if (filter.entityId) {
      events = events.filter((e) => e.entityId === filter.entityId);
    }
    if (filter.teamId !== undefined) {
      events = events.filter((e) => e.teamId === filter.teamId);
    }
    if (filter.from) {
      events = events.filter((e) => e.createdAt >= filter.from!);
    }
    if (filter.to) {
      events = events.filter((e) => e.createdAt <= filter.to!);
    }

    events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = filter.limit ?? 25;
    const total = events.length;
    events = events.slice(0, limit);

    return { items: events, total };
  }
}
```

**Factory pattern** (follows auth/repository.ts createSessionRepository lines 181-191):
```typescript
export function createAuditRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): AuditRepository {
  return new InMemoryAuditRepository(config.store);
}
```

---

### `packages/server/src/lib/duplicates/repository.ts` (repository, CRUD)

**Analog:** `packages/server/src/lib/users/repository.ts` (lines 1-102)

**Imports pattern** (lines 1-14):
```typescript
import type { Pool } from 'pg';
import type { DuplicateCaseRecord, SkillShareerStore } from '../store.js';
```

**Interface pattern**:
```typescript
export interface DuplicateRepository {
  insert(duplicateCase: DuplicateCaseRecord): Promise<void>;
  getById(caseId: string): Promise<DuplicateCaseRecord | null>;
  listByCandidate(candidateId: string): Promise<DuplicateCaseRecord[]>;
  listAll(): Promise<DuplicateCaseRecord[]>;
  update(caseId: string, updates: Partial<DuplicateCaseRecord>): Promise<void>;
}
```

**InMemory pattern** (follows users/repository.ts InMemoryUserRepository lines 53-86):
```typescript
export class InMemoryDuplicateRepository implements DuplicateRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async insert(duplicateCase: DuplicateCaseRecord): Promise<void> {
    await this.store.transact((data) => {
      data.duplicateCases.push(duplicateCase);
    });
  }

  async getById(caseId: string): Promise<DuplicateCaseRecord | null> {
    const data = await this.store.snapshot();
    return data.duplicateCases.find((d) => d.id === caseId) ?? null;
  }

  async listByCandidate(candidateId: string): Promise<DuplicateCaseRecord[]> {
    const data = await this.store.snapshot();
    return data.duplicateCases.filter((d) => d.candidateId === candidateId);
  }

  async listAll(): Promise<DuplicateCaseRecord[]> {
    const data = await this.store.snapshot();
    return data.duplicateCases;
  }

  async update(caseId: string, updates: Partial<DuplicateCaseRecord>): Promise<void> {
    await this.store.transact((data) => {
      const dc = data.duplicateCases.find((d) => d.id === caseId);
      if (dc) {
        Object.assign(dc, updates);
      }
    });
  }
}
```

**Factory pattern** (follows users/repository.ts createUserRepository lines 92-102):
```typescript
export function createDuplicateRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): DuplicateRepository {
  return new InMemoryDuplicateRepository(config.store);
}
```

---

### `packages/server/src/lib/lineage/repository.ts` (repository, CRUD)

**Analog:** `packages/server/src/lib/users/repository.ts` (lines 1-102)

**Imports pattern** (lines 1-14):
```typescript
import type { Pool } from 'pg';
import type { EntityLineageRecord, SkillShareerStore } from '../store.js';
```

**Interface pattern**:
```typescript
export interface LineageRepository {
  insert(lineage: EntityLineageRecord): Promise<void>;
  getById(lineageId: string): Promise<EntityLineageRecord | null>;
  listBySource(sourceType: string, sourceId: string): Promise<EntityLineageRecord[]>;
  listByTarget(targetType: string, targetId: string): Promise<EntityLineageRecord[]>;
  listByCandidate(candidateId: string): Promise<EntityLineageRecord[]>;
}
```

**InMemory pattern** (follows users/repository.ts InMemoryUserRepository lines 53-86):
```typescript
export class InMemoryLineageRepository implements LineageRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async insert(lineage: EntityLineageRecord): Promise<void> {
    await this.store.transact((data) => {
      data.entityLineage.push(lineage);
    });
  }

  async getById(lineageId: string): Promise<EntityLineageRecord | null> {
    const data = await this.store.snapshot();
    return data.entityLineage.find((l) => l.id === lineageId) ?? null;
  }

  async listBySource(sourceType: string, sourceId: string): Promise<EntityLineageRecord[]> {
    const data = await this.store.snapshot();
    return data.entityLineage.filter(
      (l) => l.sourceType === sourceType && l.sourceId === sourceId,
    );
  }

  async listByTarget(targetType: string, targetId: string): Promise<EntityLineageRecord[]> {
    const data = await this.store.snapshot();
    return data.entityLineage.filter(
      (l) => l.targetType === targetType && l.targetId === targetId,
    );
  }

  async listByCandidate(candidateId: string): Promise<EntityLineageRecord[]> {
    const data = await this.store.snapshot();
    return data.entityLineage.filter((l) => l.candidateId === candidateId);
  }
}
```

**Factory pattern** (follows users/repository.ts createUserRepository lines 92-102):
```typescript
export function createLineageRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): LineageRepository {
  return new InMemoryLineageRepository(config.store);
}
```

---

### `packages/server/src/lib/graph-index/repository.ts` (repository, CRUD)

**Analog:** `packages/server/src/lib/users/repository.ts` (lines 1-102)

**Imports pattern** (lines 1-14):
```typescript
import type { Pool } from 'pg';
import type { GraphIndexDocumentRecord } from '../indexing/graph-lite/documents.js';
import type { SkillShareerStore } from '../store.js';
```

**Interface pattern**:
```typescript
export interface GraphIndexRepository {
  insert(doc: GraphIndexDocumentRecord): Promise<void>;
  getById(docId: string): Promise<GraphIndexDocumentRecord | null>;
  listBySource(sourceType: string, sourceId: string): Promise<GraphIndexDocumentRecord[]>;
  listAll(): Promise<GraphIndexDocumentRecord[]>;
  upsert(doc: GraphIndexDocumentRecord): Promise<void>;
  remove(docId: string): Promise<void>;
}
```

**InMemory pattern** (follows users/repository.ts InMemoryUserRepository lines 53-86):
```typescript
export class InMemoryGraphIndexRepository implements GraphIndexRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async insert(doc: GraphIndexDocumentRecord): Promise<void> {
    await this.store.transact((data) => {
      data.graphIndexDocuments.push(doc);
    });
  }

  async getById(docId: string): Promise<GraphIndexDocumentRecord | null> {
    const data = await this.store.snapshot();
    return data.graphIndexDocuments.find((d) => d.id === docId) ?? null;
  }

  async listBySource(sourceType: string, sourceId: string): Promise<GraphIndexDocumentRecord[]> {
    const data = await this.store.snapshot();
    return data.graphIndexDocuments.filter(
      (d) => d.sourceType === sourceType && d.sourceId === sourceId,
    );
  }

  async listAll(): Promise<GraphIndexDocumentRecord[]> {
    const data = await this.store.snapshot();
    return data.graphIndexDocuments;
  }

  async upsert(doc: GraphIndexDocumentRecord): Promise<void> {
    await this.store.transact((data) => {
      const idx = data.graphIndexDocuments.findIndex((d) => d.id === doc.id);
      if (idx >= 0) {
        data.graphIndexDocuments[idx] = doc;
      } else {
        data.graphIndexDocuments.push(doc);
      }
    });
  }

  async remove(docId: string): Promise<void> {
    await this.store.transact((data) => {
      data.graphIndexDocuments = data.graphIndexDocuments.filter((d) => d.id !== docId);
    });
  }
}
```

**Factory pattern** (follows users/repository.ts createUserRepository lines 92-102):
```typescript
export function createGraphIndexRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): GraphIndexRepository {
  return new InMemoryGraphIndexRepository(config.store);
}
```

---

### `packages/server/src/lib/*/index.ts` (barrel + factory)

**Analog:** `packages/server/src/lib/users/index.ts` (lines 1-6)

**Pattern** (all 5 new modules follow the same barrel structure):
```typescript
export * from './repository.js';
```

Simple re-export. Factory function is already exported from `repository.ts`.

---

### `packages/server/src/lib/repos/index.ts` (factory wiring)

**Analog:** No direct analog. This is a new orchestration file.

**Imports pattern**:
```typescript
import type { Pool } from 'pg';
import type { SkillShareerStore } from '../store.js';
import { createKnowledgeRepository } from '../knowledge/index.js';
import { createArtifactRepository } from '../artifacts/index.js';
import { createSessionRepository, createAccessKeyRepository } from '../auth/index.js';
import { createTeamRepository, createMembershipRepository } from '../teams/index.js';
import { createUserRepository } from '../users/index.js';
import { createCandidateRepository } from '../candidates/index.js';
import { createFeedbackRepository } from '../feedback/index.js';
import { createAuditRepository } from '../audit/index.js';
import { createDuplicateRepository } from '../duplicates/index.js';
import { createLineageRepository } from '../lineage/index.js';
import { createGraphIndexRepository } from '../graph-index/index.js';
```

**Core pattern**:
```typescript
export interface SkillShareerRepos {
  knowledge: KnowledgeRepository;
  artifact: ArtifactRepository;
  session: SessionRepository;
  accessKey: AccessKeyRepository;
  team: TeamRepository;
  membership: MembershipRepository;
  user: UserRepository;
  candidate: CandidateRepository;
  feedback: FeedbackRepository;
  audit: AuditRepository;
  duplicate: DuplicateRepository;
  lineage: LineageRepository;
  graphIndex: GraphIndexRepository;
}

export function createAllRepos(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): SkillShareerRepos {
  return {
    knowledge: createKnowledgeRepository(config),
    artifact: createArtifactRepository(config),
    session: createSessionRepository(config),
    accessKey: createAccessKeyRepository(config),
    team: createTeamRepository(config),
    membership: createMembershipRepository(config),
    user: createUserRepository(config),
    candidate: createCandidateRepository(config),
    feedback: createFeedbackRepository(config),
    audit: createAuditRepository(config),
    duplicate: createDuplicateRepository(config),
    lineage: createLineageRepository(config),
    graphIndex: createGraphIndexRepository(config),
  };
}
```

---

### `packages/server/src/lib/context.ts` (modify existing)

**Current state** (lines 19-47): `SkillShareerServices` has flat optional repo props (`knowledgeRepo: KnowledgeRepository | undefined`, etc.)

**Modification**: Add `repos` property of type `SkillShareerRepos`. Keep old flat props temporarily for backward compatibility during incremental migration.

**Add after line 17** (imports):
```typescript
import type { SkillShareerRepos } from './repos/index.js';
```

**Add to SkillShareerServices** (after line 44):
```typescript
  /** Unified repository object (always populated, replaces individual repo props) */
  repos: SkillShareerRepos;
```

---

### `packages/server/src/app.ts` (modify existing)

**Current state** (lines 170-224): Flat optional repo props, populated only in onReady hook when PG is available.

**Modification**: Add `repos` to decoration, populate in both JSON and PG paths.

**Add import** (after line 40):
```typescript
import { createAllRepos } from './lib/repos/index.js';
```

**Modify decoration** (lines 170-224): Add `repos: createAllRepos({ store: createSkillShareerStore(config) })` to the initial decoration.

**Modify onReady hook** (lines 286-368): When PG pool is available, recreate repos with pool: `app.skillShareer.repos = createAllRepos({ store, pool })`.

---

### Route files (incremental migration)

**Analog:** `packages/server/src/routes/feedback.ts` (lines 1-119)

**Before pattern** (direct store access):
```typescript
const data = await app.skillShareer.store.snapshot();
const entry = data.knowledgeEntries.find((e) => e.id === entryId);
```

**After pattern** (repo access):
```typescript
const entry = await app.skillShareer.repos.knowledge.getById(entryId);
```

**Before pattern** (transact mutation):
```typescript
await app.skillShareer.store.transact((data) => {
  const entry = data.knowledgeEntries.find((e) => e.id === entryId);
  entry.lifecycleState = 'approved';
  entry.updatedAt = new Date().toISOString();
});
```

**After pattern** (repo mutation):
```typescript
await app.skillShareer.repos.knowledge.updateLifecycle(entryId, 'approved', {
  actorId: auth.actorId,
  note: 'Approved by reviewer',
});
```

Route migration order (by consumer count):
1. `knowledge.ts` - largest consumer, accesses knowledgeEntries
2. `review.ts` - lifecycle transitions on knowledge
3. `candidates.ts` - candidate CRUD
4. `feedback.ts` + `feedback-admin.ts` - feedback queue operations
5. `operations/audit.ts` - audit event queries
6. `decay.ts` - decay management
7. `retrieval.ts` - retrieval entry (read-only, lower risk)
8. `operations/knowledge-legacy.ts` - legacy operations
9. Other operations routes

---

## Shared Patterns

### Repository Interface Structure
**Source:** `packages/server/src/lib/auth/repository.ts` lines 21-49
**Apply to:** All 5 new repository interfaces
```typescript
export interface XxxRepository {
  nextId(): Promise<string>;
  insert(record: XxxRecord): Promise<void>;
  getById(id: string): Promise<XxxRecord | null>;
  // domain-specific query methods
  // domain-specific mutation methods
}
```

### InMemory Implementation Pattern
**Source:** `packages/server/src/lib/auth/repository.ts` lines 88-136
**Apply to:** All 5 new InMemory implementations
```typescript
export class InMemoryXxxRepository implements XxxRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'xxx');
  }

  async insert(record: XxxRecord): Promise<void> {
    await this.store.transact((data) => {
      data.xxxArray.push(record);
    });
  }

  async getById(id: string): Promise<XxxRecord | null> {
    const data = await this.store.snapshot();
    return data.xxxArray.find((r) => r.id === id) ?? null;
  }
  // ...
}
```

### Factory Function Pattern
**Source:** `packages/server/src/lib/auth/repository.ts` lines 181-191
**Apply to:** All 5 new factory functions
```typescript
export function createXxxRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): XxxRepository {
  return new InMemoryXxxRepository(config.store);
}
```

### Barrel Export Pattern
**Source:** `packages/server/src/lib/users/index.ts` lines 1-6
**Apply to:** All 5 new index.ts files
```typescript
export * from './repository.js';
```

### Fastify Decoration Pattern
**Source:** `packages/server/src/app.ts` lines 170-224
**Apply to:** Modification of app.ts to add `repos` object

### Type Augmentation Pattern
**Source:** `packages/server/src/lib/context.ts` lines 61-69
**Apply to:** Modification of context.ts to add `repos` to `SkillShareerServices`

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/server/src/lib/repos/index.ts` | factory | orchestration | No existing cross-domain repo wiring factory |

## Metadata

**Analog search scope:** `packages/server/src/lib/`, `packages/server/src/routes/`, `packages/server/src/app.ts`
**Files scanned:** 25
**Pattern extraction date:** 2026-05-07
