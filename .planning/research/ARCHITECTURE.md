# Architecture Research

**Domain:** Team knowledge sharing CLI + reviewable RAG service
**Researched:** 2026-04-13
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                           Interface Layer                           │
├──────────────────────────────────────────────────────────────────────┤
│  CLI client  │  Admin CLI namespace  │  Claude-compatible skills    │
└──────────────┬────────────────────────┬──────────────────────────────┘
               │                        │
┌──────────────▼────────────────────────▼──────────────────────────────┐
│                              API Layer                              │
├──────────────────────────────────────────────────────────────────────┤
│  Auth/teams  │  Knowledge intake  │  Review  │  Retrieval  │  Ops   │
└──────────────┬─────────────────────┬──────────┬─────────────┬────────┘
               │                     │          │             │
┌──────────────▼─────────────────────▼──────────▼─────────────▼────────┐
│                           Application Layer                          │
├──────────────────────────────────────────────────────────────────────┤
│ Permissions │ Submission state machine │ RAG service │ Import/export │
└──────────────┬──────────────────────────┬─────────────┬───────────────┘
               │                          │             │
┌──────────────▼──────────────────────────▼─────────────▼───────────────┐
│                              Data Layer                              │
├──────────────────────────────────────────────────────────────────────┤
│ PostgreSQL tables │ pgvector index │ audit log │ skill assets/schema │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CLI client | User and agent entry point for all workflows | Commander-based TS commands calling stable HTTP endpoints |
| API server | Owns auth, tenancy, knowledge lifecycle, retrieval, and admin workflows | Fastify app with contract-first routes |
| Review pipeline | Runs agent pre-review and records admin decisions | LangChain-powered service plus relational state machine |
| Retrieval service | Embeds, filters, ranks, and optionally compresses relevant knowledge | LangChain retrieval chain backed by PGVector |
| Shared contracts | Canonical schemas used by CLI, server, import/export, and future skills | Shared Zod package in the monorepo |

## Recommended Project Structure

```text
.
├── apps/
│   ├── cli/                 # End-user and admin CLI
│   │   └── src/
│   │       ├── commands/    # Imperative command groups
│   │       └── client/      # HTTP transport and auth/session helpers
│   └── server/              # Fastify application
│       └── src/
│           ├── routes/      # Route handlers and response models
│           ├── services/    # Review, retrieval, auth, import/export
│           ├── domain/      # Knowledge, team, permission models
│           └── db/          # Drizzle schema and queries
├── packages/
│   ├── contracts/           # Shared Zod schemas and enums
│   ├── db/                  # Shared DB config and migration helpers
│   ├── skills/              # Project skill packaging and templates
│   └── prompts/             # Review and retrieval prompt assets
├── pnpm-workspace.yaml      # Workspace definition
├── tsconfig.base.json       # Shared TS compiler configuration
├── .claude/
│   └── skills/              # Claude-discoverable project skills
└── .planning/               # GSD planning artifacts
```

### Structure Rationale

- **`apps/`**: Keeps deployable surfaces separate while still sharing contracts and prompts.
- **`packages/contracts/`**: Prevents the CLI and server from drifting on payload shapes or permission enums.
- **`packages/skills/` + `.claude/skills/`**: Separates reusable skill definitions from runtime code, while keeping Anthropic-compatible discovery paths explicit.

## Architectural Patterns

### Pattern 1: Contract-First Commands

**What:** Define request/response schemas once in Zod and make CLI output map to those contracts.
**When to use:** For every user-facing CLI command and server route.
**Trade-offs:** Slightly more upfront schema work, but far fewer "CLI and API disagree" regressions.

### Pattern 2: Review as a State Machine

**What:** Model submissions as explicit states such as `submitted`, `agent-pass`, `agent-rejected`, `admin-approved`, `admin-rejected`, `resubmitted`.
**When to use:** For all knowledge intake and revision history.
**Trade-offs:** More states to manage, but preserves explainability and auditability.

### Pattern 3: Retrieval Pipeline with Metadata Gates

**What:** Apply tenancy/scope filters before ranking, then optionally compress the winning context with an LLM.
**When to use:** For every query from CLI search or agent lookup.
**Trade-offs:** Slightly higher latency than naive vector search, but much safer and more relevant.

## Data Flow

### Request Flow

```text
CLI command
    ↓
HTTP client → Fastify route → service layer → Postgres / pgvector
    ↓               ↓              ↓                 ↓
stdout/json ← response model ← ranking/review ← stored state
```

### Key Data Flows

1. **Authentication flow:** CLI logs in, stores session token locally, fetches teams, and marks one team active for later commands.
2. **Knowledge intake flow:** CLI submits structured knowledge, server runs agent pre-review, admin reviews, approved entries move into searchable corpus.
3. **Retrieval flow:** CLI sends a text seed, server applies team/scope filters, ranks relevant entries, then returns concise results and optional refined context.
4. **Resubmission flow:** CLI pulls rejected content and feedback, user edits and resubmits, server links the new attempt to the prior rejection chain.

## Initial API Surface

| Endpoint | Purpose | Notes |
|----------|---------|-------|
| `POST /api/v1/auth/login` | Authenticate and create a CLI session | Returns token and default team context |
| `GET /api/v1/auth/me` | Fetch current user and permissions | Useful for CLI status and admin gating |
| `GET /api/v1/teams` | List teams available to current user | Used after login and for switching |
| `POST /api/v1/teams` | Create team | Admin-only |
| `POST /api/v1/teams/{team_id}/members` | Add or invite member | Admin-only |
| `PATCH /api/v1/teams/{team_id}/members/{member_id}` | Update role template or permission list | Admin-only |
| `POST /api/v1/knowledge/submissions` | Submit knowledge for review | Accepts scope, labels, shortcut, detail |
| `GET /api/v1/knowledge/submissions` | List current user's submissions | Supports status filters |
| `GET /api/v1/knowledge/submissions/{submission_id}` | Inspect submission detail and review feedback | Needed for rejected-item workflow |
| `POST /api/v1/knowledge/submissions/{submission_id}/resubmit` | Resubmit a rejected item | Preserves prior attempt linkage |
| `GET /api/v1/review/queue` | List `agent-pass` or `agent-rejected` queue | Admin-only, filterable |
| `POST /api/v1/review/{submission_id}/approve` | Approve a submission | Admin-only |
| `POST /api/v1/review/{submission_id}/reject` | Reject a submission with note | Admin-only |
| `POST /api/v1/retrieval/query` | Retrieve knowledge from a text seed | Team-aware, scope-aware, text-only |
| `GET /api/v1/knowledge` | Browse approved knowledge entries | Admin-only management surface |
| `PATCH /api/v1/knowledge/{knowledge_id}` | Edit approved entry metadata/content | Admin-only |
| `POST /api/v1/knowledge/{knowledge_id}/deactivate` | Deactivate entry without deleting history | Admin-only |
| `POST /api/v1/imports/knowledge` | Bulk import entries | Admin-only, validation required |
| `POST /api/v1/exports/knowledge` | Bulk export entries and review metadata | Admin-only |
| `GET /api/v1/audit/events` | Inspect operational audit trail | Admin-only |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-20 teams | Single API service and single PostgreSQL instance are enough |
| 20-200 teams | Add background workers for imports and heavier review jobs |
| 200+ teams | Split retrieval/indexing workloads from transactional API paths |

### Scaling Priorities

1. **First bottleneck:** Retrieval latency from large corpora — fix with better metadata prefilters and background embedding jobs.
2. **Second bottleneck:** Review backlog size — fix with queue tooling and admin-oriented review filters.

## Anti-Patterns

### Anti-Pattern 1: Treating Review as a Boolean

**What people do:** Store only approved/rejected.
**Why it's wrong:** You lose agent signals, resubmission context, and admin triage data.
**Do this instead:** Keep explicit review states and transition history.

### Anti-Pattern 2: Letting CLI and API Drift

**What people do:** Hand-build CLI payloads separately from server contracts.
**Why it's wrong:** Breaks automation and creates invisible incompatibilities.
**Do this instead:** Share versioned contract models across the monorepo.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Embedding provider | LangChain embedding interface | Keep provider selection config-driven |
| Chat model provider | LangChain chat model interface | Used for pre-review and optional retrieval refinement |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI ↔ server | HTTP + shared contracts | Stable JSON shape is critical for bash/agent use |
| review service ↔ retrieval service | Direct service calls + shared domain models | Avoid duplicate state and scoring logic |
| skills package ↔ CLI/server | Filesystem conventions + contract metadata | Keep skills discoverable without binding them to one runtime |

## Sources

- https://code.claude.com/docs/en/skills — skill layout and discovery paths
- https://docs.anthropic.com/en/docs/claude-code/sub-agents — markdown frontmatter conventions
- https://docs.langchain.com/oss/javascript/langchain/overview — LangChain JS/TS structure
- https://fastify.dev/docs/latest/Reference/TypeScript/ — Fastify TypeScript support
- https://zod.dev/ — TS-first runtime validation
- https://orm.drizzle.team/docs/extensions/pg — Drizzle `pg_vector` support
- https://pnpm.io/ — monorepo package management

---
*Architecture research for: Team knowledge sharing CLI + reviewable RAG service*
*Researched: 2026-04-13*
