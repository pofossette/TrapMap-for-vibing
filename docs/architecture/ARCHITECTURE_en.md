# TrapMap Architecture

> This is the English parallel of [ARCHITECTURE.md](./ARCHITECTURE.md). The Chinese version contains the most complete and authoritative content. This file provides an English reference for international contributors.

## System Architecture

### Layered Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Presentation Layer                         │
│  ┌─────────────────────┐        ┌─────────────────────────┐  │
│  │   CLI Client        │        │   HTTP Clients          │  │
│  │   (Commander.js)    │        │   (curl, Postman, etc.) │  │
│  └─────────┬───────────┘        └───────────┬─────────────┘  │
└────────────┼────────────────────────────────┼──────────────────┘
             │                                │
             ▼                                ▼
┌────────────────────────────────────────────────────────────────┐
│                      Route Layer (Thin)                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  auth.ts | teams.ts | members.ts | knowledge.ts | review  │ │
│  │  retrieval.ts | operations.ts | candidates.ts | traps.ts │ │
│  └─────────────────────────────┬────────────────────────────┘ │
└────────────────────────────────┼───────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                   Business Logic Layer                          │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  AI Provider Abstraction (OpenAI/Ollama/Compatible)       │ │
│  │  Governance (RBAC + Eligibility)                        │ │
│  │  Retrieval Pipeline (v1/v2/v3 modes)                      │ │
│  │  Indexing Pipeline (Vector/Keyword/Graph adapters)       │ │
│  │  Async Ingestion (Candidates + Duplicate Detection)      │ │
│  │  Artifact Derivation (Capsule/Profile/Manifest)         │ │
│  │  Session Management                                      │ │
│  │  Audit Recording                                         │ │
│  └─────────────────────────────┬────────────────────────────┘ │
└────────────────────────────────┼───────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                      Persistence Layer                          │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Store Interface (Abstract)                               │ │
│  │  ├── JsonStore (file-level, atomic writes)              │ │
│  │  └── PostgresStore (PostgreSQL + Drizzle ORM)           │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## Package Structure

### 1. CLI Package (`packages/cli`)

**Responsibility**: Terminal client for all user interactions.

**Commands**:
```
auth/          login, logout, session
team/          create, list, select
member/        create, update
knowledge/     submit, resubmit, inspect, list
trap/          trap-specific operations
retrieval/     search (v1, v2, v3), plan
review/        queue, approve, reject
operations/    import, export, edit
skill/         skill operations
audit/         audit log viewing
```

**Key Components**:
- `config.ts` — CLI state management (session, team, output format)
- `http.ts` — HTTP client with auth header injection
- `input.ts` — User input handling (prompts, selections)
- `output.ts` — Formatted output (tables, JSON, ANSI colors)

### 2. Server Package (`packages/server`)

**Responsibility**: Fastify API server, business logic orchestration.

**Route Handlers**:
| File | Endpoint Category |
|------|------------------|
| `auth.ts` | Authentication (login/logout/session) |
| `teams.ts` | Team CRUD and selection |
| `members.ts` | Member management |
| `access-keys.ts` | Access key issuance |
| `traps.ts` | Trap-specific operations |
| `knowledge.ts` | Knowledge CRUD and submission |
| `review.ts` | Review queue and decisions |
| `retrieval.ts` | Search endpoints (v1, v2, v3) |
| `operations.ts` | Import/export, artifact editing |
| `candidates.ts` | Async ingestion pipeline |

**Business Logic Libraries**:
| Directory | Purpose |
|-----------|---------|
| `lib/ai/` | AI provider abstraction |
| `lib/artifacts/` | Artifact derivation |
| `lib/candidates/` | Async ingestion pipeline |
| `lib/governance/` | RBAC and eligibility |
| `lib/indexing/` | Multi-adapter indexing |
| `lib/retrieval/` | Retrieval pipeline |
| `lib/persistence/` | Store implementations |

### 3. Contracts Package (`packages/contracts`)

**Responsibility**: Shared Zod schemas and TypeScript types.

**Domain Schemas**:
```
domain/
├── common.ts       # EntityId, SecurityLevel, Permission, LifecycleState
├── auth.ts         # Authentication types
├── team.ts         # Team, Member, AccessKey
├── knowledge.ts    # KnowledgeEntry, KnowledgeSubmission, KnowledgeRevision
├── artifacts.ts    # SkillArtifact, SkillCapsule, SkillProfile, ClientManifest
├── retrieval.ts    # RetrievalQuery, RetrievalResponse, CapsuleMatch
├── review.ts       # ReviewQueue, ReviewDecision
├── candidates.ts   # CandidateSubmission, DuplicateCase
└── plans.ts        # TrapFirstPlan, GraphPlan, PlanTrapNode
```

### 4. Evals Package (`evals/`)

**Responsibility**: Evaluation datasets and automated test runners.

**Structure**:
```
evals/
├── retrieval/      # Retrieval evaluation
│   ├── cases/     # Test cases (smoke + core layers)
│   ├── runner.ts   # Evaluation runner
│   └── README.md  # Evaluation criteria
└── summary/       # Summary evaluation
    ├── cases/     # Test cases with required/forbidden
    └── runner.ts  # Judge-based runner
```

## Technical Details

### AI Provider Abstraction

```typescript
// Supported providers
type AIProvider = 'openai' | 'openai-compatible' | 'ollama'

// Provider configuration via environment variables
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1  // for compatible providers
AI_API_KEY=sk-...
AI_CHAT_MODEL=gpt-4o
AI_EMBEDDING_MODEL=text-embedding-3-small
```

The abstraction layer in `packages/server/src/lib/ai/` standardizes:
- Chat completions (system prompt, messages, parameters)
- Embeddings generation (text → vector)
- Streaming responses

### Multi-Adapter Indexing

```
┌─────────────────────────────────────────────────────┐
│              Indexing Pipeline                       │
├─────────────────────────────────────────────────────┤
│  Entry State Change                                 │
│  (submitted → approved)                             │
│           │                                         │
│           ▼                                         │
│  ┌─────────────────────┐                           │
│  │  Index State Record │                           │
│  │  (per-adapter sync) │                           │
│  └──────────┬──────────┘                           │
│             │                                       │
│    ┌────────┼────────┐                             │
│    ▼        ▼        ▼                             │
│ ┌──────┐ ┌──────┐ ┌──────┐                         │
│ │Vector│ │Keyword│ │Graph │                         │
│ │Adapter│ │Adapter│ │Adapter│                       │
│ └──────┘ └──────┘ └──────┘                         │
│    │        │        │                              │
│    └────────┼────────┘                              │
│             ▼                                       │
│  ┌─────────────────────┐                           │
│  │  Reconciliation     │  ← On startup             │
│  └─────────────────────┘                           │
└─────────────────────────────────────────────────────┘
```

**Adapters**:
- **Vector**: OpenAI embeddings + cosine similarity
- **Keyword**: BM25/token-based lexical matching
- **Graph**: Graphology DAG for relationship expansion

### Retrieval Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    Retrieval Pipeline                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐    ┌──────────┐    ┌─────────────────┐             │
│  │ Request │───▶│ Validate │───▶│ Auth Context    │             │
│  │ (Query) │    │ (Zod)    │    │ (Session+Team) │             │
│  └─────────┘    └──────────┘    └────────┬────────┘             │
│                                          │                       │
│                                          ▼                       │
│                              ┌─────────────────────┐            │
│                              │ Eligibility Filter  │            │
│                              └──────────┬──────────┘            │
│                                         │                       │
│                                         ▼                       │
│                              ┌─────────────────────┐            │
│                              │   Mode Dispatch     │            │
│                              │ (semantic|hybrid|  │            │
│                              │  graph-assisted)   │            │
│                              └──────────┬─────────┘            │
│                                        │                        │
│       ┌───────────────────────────────┼───────────────────┐     │
│       ▼                               ▼                       ▼     │
│  ┌─────────┐                    ┌─────────┐            ┌────────┐│
│  │Semantic │                    │ Keyword │            │ Graph  ││
│  │Recall   │                    │ Recall  │            │Expand  ││
│  └────┬────┘                    └────┬────┘            └───┬────┘│
│       │                                │                    │     │
│       └────────────────────────┬────────┴────────────────────┘     │
│                                ▼                                    │
│                      ┌─────────────────┐                            │
│                      │  Merge + Rerank │                            │
│                      └────────┬────────┘                            │
│                               │                                     │
│                               ▼                                     │
│                      ┌─────────────────┐                            │
│                      │    Assembly    │                            │
│                      │ (buckets+      │                            │
│                      │  citations)    │                            │
│                      └────────┬────────┘                            │
│                               │                                     │
│              ┌────────────────┼────────────────┐                   │
│              ▼                ▼                ▼                   │
│       ┌───────────┐   ┌─────────────┐   ┌─────────────┐          │
│       │  Global   │   │  Project    │   │  Team       │          │
│       │Constraints│   │ Knowledge   │   │  Scope      │          │
│       └───────────┘   └─────────────┘   └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Trap-First Plan Compilation (v3)

```
┌─────────────────────────────────────────────────────────────────┐
│              Trap-First Plan Compilation                         │
├─────────────────────────────────────────────────────────────────┤
│  Query Input ──▶ ┌───────────┐                                   │
│                  │  GraphRAG │                                   │
│                  │  lite     │                                   │
│                  │  Wrapper  │                                   │
│                  └─────┬─────┘                                   │
│                        │                                         │
│                        ▼                                         │
│              ┌───────────────────┐                             │
│              │ Confidence-Aware  │                             │
│              │    Routing        │                             │
│              └─────────┬─────────┘                             │
│                        │                                        │
│           ┌───────────┴───────────┐                           │
│           ▼                       ▼                           │
│    ┌─────────────┐         ┌─────────────┐                    │
│    │   High      │         │    Low      │                    │
│    │ Confid-     │         │ Confid-     │                    │
│    │ ance Path   │         │ ance Fall-  │                    │
│    │             │         │ back        │                    │
│    └──────┬──────┘         └──────┬──────┘                    │
│           │                       │                             │
│           ▼                       ▼                             │
│    ┌─────────────┐         ┌─────────────┐                    │
│    │ Trap-First  │         │   Governed   │                    │
│    │ Plan        │         │   Retrieval │                    │
│    │ (typed edges│         │   Response  │                    │
│    │  + citations│         │   (v1/v2)  │                    │
│    └─────────────┘         └─────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Async Ingestion Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│              Async Ingestion Pipeline                             │
├─────────────────────────────────────────────────────────────────┤
│  Candidate Submitted                                           │
│        │                                                        │
│        ▼                                                        │
│  ┌──────────────┐                                               │
│  │   Status:   │                                               │
│  │   received  │────── (async processing)                       │
│  └──────┬──────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │   Status:   │                                               │
│  │   queued    │                                               │
│  └──────┬──────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │   Status:   │                                               │
│  │  analyzing  │──────  Fingerprint check                      │
│  └──────┬──────┘       Semantic similarity check              │
│         │                    │                                  │
│         │         ┌─────────┴─────────┐                        │
│         │         ▼                   ▼                        │
│         │   ┌───────────┐      ┌───────────┐                   │
│         │   │ Duplicate│      │ Analysis  │                   │
│         │   │ Detected │      │Complete  │                   │
│         │   └─────┬─────┘      └─────┬────┘                   │
│         │         │                  │                          │
│         │         │                  ▼                          │
│         │         │         ┌───────────────┐                    │
│         │         │         │  Status:      │                    │
│         │         │         │ready_for_rev  │                    │
│         │         │         └───────────────┘                   │
│         │         │                                               │
│         ▼         ▼                                               │
│  ┌─────────────────────────────────┐                           │
│  │      Reviewer Action            │                           │
│  │  POST /candidates/:id/manual-   │                           │
│  │  result { resolution: "merge"  │                           │
│  │  | "discard" | "keep_both" }    │                           │
│  └───────────────┬─────────────────┘                           │
│                  │                                              │
│                  ▼                                              │
│          ┌───────────────┐                                     │
│          │ Resolution    │                                     │
│          │ Applied       │                                     │
│          │ (publish/     │                                     │
│          │  merge)       │                                     │
│          └───────────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Session and Authentication

```
┌─────────────────────────────────────────────────────────────────┐
│              Session & Authentication Flow                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐                                                    │
│  │  Login  │──▶ POST /v1/auth/login { username, password }     │
│  └────┬────┘         │                                        │
│       │                ▼                                        │
│       │         ┌─────────────┐                                 │
│       │         │  Validate   │                                 │
│       │         │ Credentials │                                 │
│       │         └──────┬──────┘                                 │
│       │                │                                        │
│       │         ┌──────▼──────┐                                 │
│       │         │  Create     │                                 │
│       │         │  Session    │                                 │
│       │         └──────┬──────┘                                 │
│       │                │                                        │
│       │                ▼                                        │
│       │         ┌─────────────┐                                 │
│       │         │  Set-Cookie │                                 │
│       │         └─────────────┘                                 │
│       ▼                                                              │
│  ┌─────────────┐                                                    │
│  │  RBAC       │──▶ Permission Check                               │
│  │  Middleware │      (knowledge:submit,                           │
│  └─────────────┘       knowledge:review, etc.)                      │
└─────────────────────────────────────────────────────────────────┘
```

## Persistence Architecture

### Store Interface

```typescript
interface Store {
  transact<T>(fn: (tx: Transaction) => T): Promise<T>;
  createKnowledgeEntry(entry: KnowledgeEntry): Promise<void>;
  getKnowledgeEntry(id: EntityId): Promise<KnowledgeEntry | null>;
  updateKnowledgeEntry(id: EntityId, updates: Partial<KnowledgeEntry>): Promise<void>;
  listKnowledgeEntries(query: PaginatedQuery): Promise<KnowledgeEntry[]>;
  createTeam(team: Team): Promise<void>;
  getTeam(id: EntityId): Promise<Team | null>;
  listTeams(): Promise<Team[]>;
}
```

### JsonStore (Development)

```
.json data file
├── Atomic writes (write temp file, then rename)
├── File locking for concurrent access
└── Automatic backup on startup
```

### PostgresStore (Production)

```
PostgreSQL
├── Drizzle ORM schema
├── Connection pool
├── ACID transactions
└── Indexes for common queries
```

## Environment Configuration

### Required Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `TRAPMAP_SYSTEM_ADMIN_KEY` | Admin secret key |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRAPMAP_DATABASE_URL` | (none) | PostgreSQL connection string |
| `TRAPMAP_DATA_FILE` | `.data/skill-shareer.json` | JSON store path |
| `HOST` | `0.0.0.0` | Server bind host |
| `PORT` | `4000` | Server port |
| `AI_PROVIDER` | `openai` | AI provider type |
| `AI_BASE_URL` | (none) | Base URL for compatible providers |
| `AI_API_KEY` | (none) | API key for compatible providers |
| `AI_CHAT_MODEL` | `gpt-4o` | Chat model name |
| `AI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model name |

## Deployment

### Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "4000:4000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - TRAPMAP_SYSTEM_ADMIN_KEY=${TRAPMAP_SYSTEM_ADMIN_KEY}
      - TRAPMAP_DATABASE_URL=postgresql://...
    depends_on:
      - postgres
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: trapmap
      POSTGRES_USER: trapmap
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

## Health Check

```bash
curl http://localhost:4000/health
# Response:
{
  "status": "ok",
  "product": "trapmap",
  "packages": ["cli", "server", "contracts"]
}
```
