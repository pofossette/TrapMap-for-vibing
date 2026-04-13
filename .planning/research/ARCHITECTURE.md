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

### Core Data Models

#### Authentication Overview

Two types of keys exist in the system:

| Key Type | Storage | Scope | Use Case |
|----------|---------|-------|----------|
| **System Admin Key** | Environment variable (`.env`) | Full system access | Server bootstrap, emergency access |
| **User Access Key** | Database (`access_keys` table) | Team-scoped with explicit permissions | Team members, CI/CD, services |

#### System Admin Key (Environment)

```bash
# .env configuration
ADMIN_API_KEY=sk_admin_xxxxxxxxxxxxxxxxxxxx
```

- Configured at server startup
- Creates a virtual user with `securityLevel = 10` (maximum)
- Bypasses all permission checks (full system access)
- Used for initial setup and emergency operations
- Should be kept secure and rotated periodically

#### Member (Team Member)
```typescript
interface Member {
  id: string;
  userId: string;           // Reference to users table
  teamId: string;
  securityLevel: number;    // 0-10, default 0. Determines access and capabilities
  explicitPermissions: Permission[];  // Fine-grained operation permissions
  notes?: string;           // Optional notes for identification
  createdAt: datetime;
  updatedAt: datetime;
}
```

**Permission Model:**
- **No role templates**: Authorization is based on `securityLevel` comparison
- **Higher level = more privileges**: Level 5 can do anything level 4 can do, plus more
- **Creation rules**: A member can only create another member with level ≤ their own level
- **Modification rules**: A member can only modify another member's level if their own level is higher

**Security Level Reference:**
| Level | Name | Description | Capabilities |
|-------|------|-------------|--------------|
| 0 | Public | Default for new members | Submit knowledge, search public entries |
| 1 | Internal | Regular team member | Submit, search internal, view own submissions |
| 2 | Senior | Experienced member | Review level 0-1 submissions, modify lower-level entries |
| 3+ | Lead/Admin | Core team members | Review most submissions, manage members, import/export |
| 10 | System | .env admin key only | Full system access, bypasses all checks |

#### Access Key (User/Service Authentication)
```typescript
interface AccessKey {
  id: string;
  teamId: string;
  memberId?: string;        // Optional: link to member if created for a human user
  keyPrefix: string;        // First 8 chars for identification (e.g., "sk_live_abc12345...")
  keyHashed: string;        // SHA-256 hashed secret (never returned in API responses)
  name: string;             // Human-readable name (e.g., "CI/CD Pipeline", "John's API Key")
  permissions: Permission[]; // Explicit permissions for this key
  lastUsedAt?: datetime;    // Track usage for audit
  createdAt: datetime;
  createdBy: string;        // Admin member ID who created it
  isActive: boolean;        // Soft delete: set to false instead of deleting
}
```

**Use cases:**
- Human users who prefer API key over password login
- CI/CD pipelines and automation scripts
- External services integrating with the system
- Programmatic access without interactive authentication

#### Permission (Authorization Granularity)
```typescript
type Permission =
  | 'knowledge:submit'
  | 'knowledge:read'
  | 'review:approve'
  | 'review:reject'
  | 'team:manage_members'
  | 'team:manage_keys'
  | 'knowledge:manage'
  | 'audit:read';
```

#### Knowledge Entry (Approved Knowledge)
```typescript
interface KnowledgeEntry {
  id: string;
  teamId: string;
  scope: 'global' | 'project';     // Global constraints vs project-specific
  labels: string[];                 // Custom tags for categorization
  shortcut: string;                 // Concise summary or reusable constraint
  detail: string;                   // Full explanation, fix, or guidance
  requiredLevel: number;            // 0-10, minimum security level to access
  embedding?: number[];             // Vector embedding for semantic search
  createdById: string;              // Original submitter member ID
  createdByLevel: number;           // Submitter's level at creation time
  approvedById: string;             // Member who approved (must have level > requiredLevel)
  approvedByLevel: number;          // Approver's level
  approvedAt: datetime;
  isActive: boolean;                // Soft delete
  createdAt: datetime;
  updatedAt: datetime;
}
```

**Access & Modification Rules:**
- **Read**: Member's `securityLevel >= entry.requiredLevel`
- **Create**: Entry's `requiredLevel` defaults to creator's `securityLevel`
- **Modify**: Modifier's `securityLevel > entry.requiredLevel`
- **Approve**: Approver's `securityLevel > entry.requiredLevel`
- **Change Level**: Can raise `requiredLevel` only up to modifier's own `securityLevel`

#### Knowledge Submission (Pending Review)
```typescript
interface KnowledgeSubmission {
  id: string;
  teamId: string;
  scope: 'global' | 'project';
  labels: string[];
  shortcut: string;
  detail: string;
  requiredLevel: number;            // Defaults to submitter's level
  submittedById: string;
  submitterLevel: number;           // Submitter's security level
  status: 'submitted' | 'agent-pass' | 'agent-rejected' | 'approved' | 'rejected';
  agentReviewNote?: string;         // Agent pre-review feedback
  reviewNote?: string;              // Reviewer feedback (from higher-level member)
  reviewedById?: string;            // Member who reviewed (must have level > requiredLevel)
  reviewerLevel?: number;           // Reviewer's security level
  parentSubmissionId?: string;      // For resubmissions, links to previous attempt
  createdAt: datetime;
  updatedAt: datetime;
}
```

**Review Rules:**
- **Can review**: Member's `securityLevel > submission.requiredLevel`
- **Approve**: Sets status to `approved`, creates `KnowledgeEntry`
- **Reject**: Sets status to `rejected` with note, submitter can resubmit
- **Adjust level**: On approval, reviewer can adjust `requiredLevel` up to their own level

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

### Pattern 3: Level-Based Authorization

**What:** All authorization decisions are based on security level comparison (0-10) without role templates.
**When to use:** For every protected action across the system.
**Rules:**
- `memberA.level > memberB.level`: A can modify B's level
- `member.level >= entry.requiredLevel`: Can read entry
- `member.level > entry.requiredLevel`: Can modify/approve entry
- Import level: `importedLevel <= importer.level`
- System admin key: Fixed at level 10, bypasses all checks

**Trade-offs:** Simpler than role-based systems, but requires careful level assignment discipline.

### Pattern 4: Retrieval Pipeline with Metadata Gates

**What:** Apply tenancy/scope/level filters before ranking, then optionally compress the winning context with an LLM.
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

1. **User authentication flow:** CLI logs in with username/password, stores session token locally, fetches teams and security level, marks one team active.
2. **System admin key flow:** Requests with `X-Admin-Key` header bypass all checks, user gets `securityLevel = 10` (used for bootstrap and emergency operations).
3. **User access key flow:** Human users or services authenticate using access key via `/api/v1/auth/access-key`, receive session token with the key's associated security level and permissions.
4. **CLI command filtering:** After login, CLI fetches user's security level and permissions, then shows/hides command groups based on level (higher level = more commands).
5. **Knowledge submission flow:** User submits knowledge, `requiredLevel` defaults to user's `securityLevel`, enters review queue.
6. **Knowledge approval flow:** Higher-level member (level > entry.requiredLevel) approves submission, entry becomes searchable.
7. **Knowledge modification flow:** Only members with level > entry.requiredLevel can modify; cannot raise requiredLevel above their own level.
8. **Retrieval flow:** CLI sends a text seed, server applies team/scope/security level filters, ranks relevant entries, then returns concise results.
9. **Resubmission flow:** CLI pulls rejected content and feedback, user edits and resubmits, server links the new attempt to the prior rejection chain.

## Initial API Surface

| Endpoint | Purpose | Notes |
|----------|---------|-------|
| `POST /api/v1/auth/login` | Authenticate with username/password | Returns token with user's security level |
| `POST /api/v1/auth/admin-key` | Authenticate with system admin key (from .env) | Returns token with securityLevel = 10 |
| `POST /api/v1/auth/access-key` | Authenticate using user access key | Scoped to key's security level and permissions |
| `GET /api/v1/auth/me` | Fetch current user and security level | Useful for CLI status |
| `GET /api/v1/teams` | List teams available to current user | Used after login and for switching |
| `POST /api/v1/teams` | Create team | Requires level >= 5 |
| `POST /api/v1/teams/{team_id}/members` | Add member (starts at level 0) | Requires level >= 3 |
| `PATCH /api/v1/teams/{team_id}/members/{member_id}` | Update member level or notes | Requires own level > target's new level |
| `GET /api/v1/teams/{team_id}/members` | List team members with levels and notes | All team members |
| `POST /api/v1/teams/{team_id}/access-keys` | Generate access key (max level = creator's level) | Requires level >= 2 |
| `GET /api/v1/teams/{team_id}/access-keys` | List access keys with status | All team members |
| `DELETE /api/v1/teams/{team_id}/access-keys/{key_id}` | Revoke an access key | Requires level >= key's level |
| `POST /api/v1/knowledge/submissions` | Submit knowledge for review | Any authenticated user |
| `GET /api/v1/knowledge/submissions` | List current user's submissions | Any authenticated user |
| `GET /api/v1/knowledge/submissions/{submission_id}` | Inspect submission detail and feedback | Submitter or higher-level members |
| `POST /api/v1/knowledge/submissions/{submission_id}/resubmit` | Resubmit a rejected item | Original submitter only |
| `GET /api/v1/review/queue` | List review queue | Members with level > submission.requiredLevel |
| `POST /api/v1/review/{submission_id}/approve` | Approve a submission | Requires level > submission.requiredLevel |
| `POST /api/v1/review/{submission_id}/reject` | Reject a submission with note | Requires level > submission.requiredLevel |
| `POST /api/v1/retrieval/query` | Retrieve knowledge from a text seed | Returns entries user's level can access |
| `GET /api/v1/knowledge` | Browse knowledge entries | Returns entries user's level can access |
| `PATCH /api/v1/knowledge/{knowledge_id}` | Edit entry metadata/content | Requires level > entry.requiredLevel |
| `POST /api/v1/knowledge/{knowledge_id}/deactivate` | Deactivate entry | Requires level > entry.requiredLevel |
| `POST /api/v1/imports/knowledge` | Bulk import from JSON or skill files | Imported level <= importer's level |
| `POST /api/v1/exports/knowledge` | Bulk export entries to JSON format | Exports entries user's level can access |
| `GET /api/v1/audit/events` | Inspect operational audit trail | Requires level >= 5 |
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
| `POST /api/v1/imports/knowledge` | Bulk import from JSON or skill files | Admin-only, validation required |
| `POST /api/v1/exports/knowledge` | Bulk export entries to JSON format | Admin-only |
| `GET /api/v1/audit/events` | Inspect operational audit trail | Admin-only |

## Import/Export Data Formats

### Export Format (JSON)

```json
{
  "version": "1.0",
  "format": "skill-shareer-knowledge",
  "exportedAt": "2026-04-13T10:00:00.000Z",
  "teamId": "team_abc123",
  "teamName": "Engineering Team",
  "metadata": {
    "totalEntries": 2,
    "includesReviewHistory": true
  },
  "knowledge": [
    {
      "id": "know_001",
      "scope": "global",
      "labels": ["database", "mysql"],
      "shortcut": "连接超时配置",
      "detail": "MySQL 连接超时应该设置为 30 秒，避免长时间占用连接...",
      "requiredLevel": 0,
      "createdAt": "2026-04-01T10:00:00.000Z",
      "createdBy": "user_123",
      "approvedAt": "2026-04-01T11:00:00.000Z",
      "approvedBy": "admin_001",
      "reviewHistory": [
        {
          "action": "submitted",
          "at": "2026-04-01T09:00:00.000Z",
          "actor": "user_123"
        },
        {
          "action": "agent_review",
          "result": "pass",
          "note": "No duplicates found. Content is complete.",
          "at": "2026-04-01T09:05:00.000Z"
        },
        {
          "action": "admin_approved",
          "note": "Good entry, approved.",
          "at": "2026-04-01T11:00:00.000Z",
          "actor": "admin_001"
        }
      ]
    },
    {
      "id": "know_002",
      "scope": "project",
      "labels": ["api", "security"],
      "shortcut": "API 密钥轮换策略",
      "detail": "生产环境 API 密钥每 90 天轮换一次...",
      "requiredLevel": 2,
      "createdAt": "2026-04-05T14:00:00.000Z",
      "createdBy": "user_456",
      "approvedAt": "2026-04-05T15:30:00.000Z",
      "approvedBy": "admin_001"
    }
  ]
}
```

### Import Sources

#### 1. Native JSON Format

Uses the same schema as export above. Admin can specify:
- `securityLevel`: Override `requiredLevel` for all imported entries
- `duplicateStrategy`: `"skip" | "update" | "create"`

#### 2. Claude-Compatible Skill Files

Parses standard skill directory structure:

```
skills/
├── database-troubleshooting/
│   ├── SKILL.md
│   └── examples/
│       ├── mysql-timeout.md
│       └── postgres-connection.md
└── api-security/
    ├── SKILL.md
    └── content.md
```

**SKILL.md format:**
```markdown
---
name: database-troubleshooting
description: Common database issues and solutions
author: Engineering Team
tags: [database, troubleshooting]
---

# Database Troubleshooting

Collection of common database pitfalls and solutions.
```

**Import mapping:**
- Skill directory → `labels` (one label per skill)
- Individual `.md` files → separate knowledge entries
- File content → `detail` field
- First heading (H1) → `shortcut` field
- `tags` from SKILL.md → additional `labels`

**Admin specifies during import:**
| Parameter | Description | Default |
|-----------|-------------|---------|
| `securityLevel` | Apply this `requiredLevel` to all imported entries | 0 |
| `scope` | Import as `"global"` or `"project"` | `"project"` |
| `duplicateStrategy` | How to handle existing entries | `"skip"` |

### Import Request Format

```json
{
  "source": {
    "type": "json" | "skill",
    "content": "...base64 encoded content..." | "url": "https://..."
  },
  "options": {
    "securityLevel": 1,
    "scope": "project",
    "duplicateStrategy": "skip",
    "autoApprove": false
  }
}
```

**Import Response (Preview):**
```json
{
  "preview": {
    "toCreate": 5,
    "toUpdate": 2,
    "toSkip": 1,
    "errors": []
  },
  "entries": [
    {
      "action": "create",
      "shortcut": "MySQL 连接超时",
      "scope": "project",
      "requiredLevel": 1,
      "labels": ["database", "mysql"]
    }
  ]
}
```

Admin confirms preview before actual import.

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
