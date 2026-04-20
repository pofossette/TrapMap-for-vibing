# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 RAG Structure Enhancement** — Phases 6-11 (shipped 2026-04-16)
- ✅ **v1.2 Skill-Native Retrieval** — Phases 12-16 (shipped 2026-04-17)
- 🚧 **v1.3 工程化调整&功能扩展及优化** — Phases 17-22 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-04-14</summary>

**Full archive:** [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md)

- [x] Phase 1: Monorepo Skeleton and Contracts (3/3 plans) — completed 2026-04-13
- [x] Phase 2: Identity, Teams, and RBAC (3/3 plans) — completed 2026-04-13
- [x] Phase 3: Knowledge Intake and Review (4/4 plans) — completed 2026-04-13
- [x] Phase 4: Retrieval and CLI Workflow (4/4 plans) — completed 2026-04-13
- [x] Phase 5: Admin Operations and Hardening (3/3 plans) — completed 2026-04-13

**Delivered:**
- TypeScript monorepo with CLI, server, and shared contracts
- Team-aware RBAC with security levels (0-10) and permission checks
- Knowledge lifecycle with agent pre-review and human approval
- Embeddings-backed retrieval with CLI search commands
- Admin operations: import/export, knowledge management, audit trail

</details>

<details>
<summary>✅ v1.1 RAG Structure Enhancement (Phases 6-11) — SHIPPED 2026-04-16</summary>

**Full archive:** [milestones/v1.1-ROADMAP.md](./milestones/v1.1-ROADMAP.md)

- [x] Phase 6: 检索架构重构 (3/3 plans) — completed 2026-04-14
- [x] Phase 7: 混合检索 (3/3 plans) — completed 2026-04-14
- [x] Phase 8: 索引生命周期 (4/4 plans) — completed 2026-04-14
- [x] Phase 9: 图辅助检索 (4/4 plans) — completed 2026-04-14
- [x] Phase 10: 回答与引用 (4/4 plans) — completed 2026-04-15
- [x] Phase 11: 索引生命周期集成 (2/2 plans) — completed 2026-04-15

**Delivered:**
- Multi-path retrieval with orchestrator, hybrid recall (vector + keyword), and reranking
- Lifecycle-driven indexing pipeline (approve → index, update → refresh, deactivate → remove)
- Enhanced citations with source tracking, snippets, tags, and recall channel attribution
- Graph-assisted recall with lightweight entity extraction
- Optional summary builder for LLM-generated answers

</details>

<details>
<summary>✅ v1.2 Skill-Native Retrieval (Phases 12-16) — SHIPPED 2026-04-17</summary>

**Full archive:** [milestones/v1.2-ROADMAP.md](./milestones/v1.2-ROADMAP.md)

- [x] Phase 12: Skill Artifact Canonical Model (3/3 plans) — completed 2026-04-16
- [x] Phase 13: Skill Import/Export Pipeline (3/3 plans) — completed 2026-04-16
- [x] Phase 14: Seed Intent Retrieval and Capsule Ranking (4/4 plans) — completed 2026-04-16
- [x] Phase 15: Client Activation for References, Assets, and Scripts (3/3 plans) — completed 2026-04-17
- [x] Phase 16: Compatibility Migration and Boundary Hardening (3/3 plans) — completed 2026-04-17

**Delivered:**
- Skill-native artifact contracts with file-kind discrimination and derived outputs
- Directory import/export with canonical bundle-json transport
- Seed-only v2 retrieval with server-internal parsed-intent parsing
- Metadata-only activation hints for references, assets, and scripts
- Four-state script activation policy with client-side stricter-only resolution
- Legacy knowledge migration with preserved governance boundaries

</details>

### 🚧 v1.3 工程化调整&功能扩展及优化 (In Progress)

**Milestone Goal:** 工程化补全 + Skill 编辑闭环 + 可开关双层日志系统

#### Phase 17: Deployment Scripts (Complete)

**Goal:** Provide quick deployment tooling for server setup
**Requirements:** N/A (quick task)
**Depends on:** Phase 16
**Plans:** 1/1 plans complete

Plans:
- [x] 17-01: Docker configuration and deployment scripts (completed 2026-04-17)

#### Phase 18: CLI Skill Lookup Commands

**Goal:** Enable users to search skills by content and retrieve skill IDs with metadata
**Depends on:** Phase 16
**Requirements:** SKED-01
**Success Criteria** (what must be TRUE):
  1. User can invoke `skill search-by-content <text>` and receive matching skill IDs
  2. Search results include skill ID, title, and brief metadata for each match
  3. Command supports JSON output mode for agent-friendly consumption
  4. Results are permission-filtered based on user's team and security level
**Plans:** 2/2 plans complete

Plans:
- [x] 18-01-PLAN.md — Define the shared artifact-first skill lookup contracts and tests
- [x] 18-02-PLAN.md — Implement the governed server endpoint and additive `skill search-by-content` CLI flow

#### Phase 19: Skill Edit Flow with History

**Goal:** Enable users to edit skills by ID with edit history preservation
**Depends on:** Phase 18
**Requirements:** SKED-02, SKED-04
**Success Criteria** (what must be TRUE):
  1. User can invoke `skill edit <id>` to modify skill content
  2. Edit creates a pending revision that enters the review queue
  3. Previous skill versions are preserved with timestamps
  4. User can view edit history for a skill showing all past revisions
**Plans:** 3/3 plans complete

Plans:
- [x] 19-01: Define skill edit contracts and revision schema
- [x] 19-02: Implement server edit endpoint with history tracking
- [x] 19-03: Add CLI edit-by-id command and history view

#### Phase 20: Skill Edit Review Workflow

**Goal:** Enable reviewers to approve or reject skill edits with RBAC enforcement
**Depends on:** Phase 19
**Requirements:** SKED-03
**Success Criteria** (what must be TRUE):
  1. Reviewers with `skill:review` permission can see pending skill edits
  2. Reviewer can approve or reject a skill edit with notes
  3. Approved edits become the active skill version; rejected edits return to submitter for revision
  4. Edit review decisions are recorded in audit trail
**Plans:** 2/2 plans complete

Plans:
- [x] 20-01: Implement skill edit review endpoint reusing existing RBAC patterns
- [x] 20-02: Add CLI commands for listing pending edits and submitting review decisions

#### Phase 21: User Operations Logger

**Goal:** Log user operations with independent .env switch
**Depends on:** Phase 16
**Requirements:** LOG-01, LOG-03 (partial)
**Success Criteria** (what must be TRUE):
  1. Server logs all user operations: search, submit, edit, review, import, export
  2. Each log entry includes actor ID, action type, target ID, and timestamp
  3. LOG_USER_OPS_ENABLED in .env controls user ops logging independently
  4. Logs write to structured files in a dedicated logs directory
**Plans:** 2/2 plans complete

Plans:
- [x] 21-01: Define user ops logger with .env configuration and structured output
- [x] 21-02: Integrate user ops logging into existing API routes

#### Phase 22: RAG Logger with File Rotation

**Goal:** Log RAG retrieval details with independent switch and file rotation
**Depends on:** Phase 21
**Requirements:** LOG-02, LOG-03 (partial), LOG-04
**Success Criteria** (what must be TRUE):
  1. Server logs RAG retrieval details: retrieval strategy, pipeline steps, latency per query
  2. LOG_RAG_ENABLED in .env controls RAG logging independently from user ops
  3. Both log layers support size-based rotation (e.g., 10MB max file size)
  4. Both log layers support time-based rotation (daily or configurable interval)
**Plans:** 2/2 plans complete

Plans:
- [x] 22-01: Define RAG logger with .env switch and structured output
- [x] 22-02: Implement file rotation for both log layers with size and time triggers

#### Phase 23: v1.3 Milestone Verification

**Goal:** Formally verify all v1.3 phases through goal-backward validation and close requirement gaps
**Depends on:** Phase 22
**Requirements:** SKED-01, SKED-02, SKED-03, SKED-04, LOG-01, LOG-02, LOG-03, LOG-04
**Gap Closure:** Closes verification gaps from v1.3 milestone audit
**Success Criteria** (what must be TRUE):
  1. VERIFICATION.md exists for phases 17-22 with goal-backward analysis
  2. VALIDATION.md exists for phases 17-22 with Nyquist compliance
  3. All 8 v1.3 requirements verified as satisfied in codebase
  4. Any issues found during verification are resolved
**Plans:** 3/3 plans complete

Plans:
- [x] 23-01-PLAN.md — Verify SKED requirements (SKED-01 through SKED-04) across Phases 18-20
- [x] 23-02-PLAN.md — Verify LOG requirements (LOG-01 through LOG-04) across Phases 17, 21-22 + fix contracts build
- [x] 23-03-PLAN.md — Create VALIDATION.md files for all phases + update REQUIREMENTS.md

#### Phase 24: Docker Logging Configuration

**Goal:** Wire Docker deployment to support file-based logging with proper volume mounts and env vars
**Depends on:** Phase 23
**Requirements:** LOG-01, LOG-02, LOG-03, LOG-04
**Gap Closure:** Closes integration gap between Phase 17 (Docker) and Phase 21/22 (logging)
**Success Criteria** (what must be TRUE):
  1. docker-compose.yml mounts a persistent volume for log directories
  2. LOG_USER_OPS_ENABLED and LOG_RAG_ENABLED env vars are passed through in docker-compose.yml
  3. deploy.sh passes LOG_* env vars with sensible defaults
  4. Logs survive container restarts in Docker deployment
**Plans:** 1/1 plans complete

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Monorepo Skeleton and Contracts | v1.0 | 3/3 | Complete | 2026-04-13 |
| 2. Identity, Teams, and RBAC | v1.0 | 3/3 | Complete | 2026-04-13 |
| 3. Knowledge Intake and Review | v1.0 | 4/4 | Complete | 2026-04-13 |
| 4. Retrieval and CLI Workflow | v1.0 | 4/4 | Complete | 2026-04-13 |
| 5. Admin Operations and Hardening | v1.0 | 3/3 | Complete | 2026-04-13 |
| 6. 检索架构重构 | v1.1 | 3/3 | Complete | 2026-04-14 |
| 7. 混合检索 | v1.1 | 3/3 | Complete | 2026-04-14 |
| 8. 索引生命周期 | v1.1 | 4/4 | Complete | 2026-04-14 |
| 9. 图辅助检索 | v1.1 | 4/4 | Complete | 2026-04-14 |
| 10. 回答与引用 | v1.1 | 4/4 | Complete | 2026-04-15 |
| 11. 索引生命周期集成 | v1.1 | 2/2 | Complete | 2026-04-15 |
| 12. Skill Artifact Canonical Model | v1.2 | 3/3 | Complete | 2026-04-16 |
| 13. Skill Import/Export Pipeline | v1.2 | 3/3 | Complete | 2026-04-16 |
| 14. Seed Intent Retrieval and Capsule Ranking | v1.2 | 4/4 | Complete | 2026-04-16 |
| 15. Client Activation for References, Assets, and Scripts | v1.2 | 3/3 | Complete | 2026-04-17 |
| 16. Compatibility Migration and Boundary Hardening | v1.2 | 3/3 | Complete | 2026-04-17 |
| 17. Deployment Scripts | v1.3 | 1/1 | Complete    | 2026-04-19 |
| 18. CLI Skill Lookup Commands | v1.3 | 2/2 | Complete   | 2026-04-19 |
| 19. Skill Edit Flow with History | v1.3 | 3/3 | Complete | 2026-04-19 |
| 20. Skill Edit Review Workflow | v1.3 | 2/2 | Complete | 2026-04-19 |
| 21. User Operations Logger | v1.3 | 2/2 | Complete    | 2026-04-19 |
| 22. RAG Logger with File Rotation | v1.3 | 2/2 | Complete    | 2026-04-19 |
| 23. v1.3 Milestone Verification | v1.3 | 3/3 | Complete    | 2026-04-20 |
| 24. Docker Logging Configuration | v1.3 | 1/1 | Complete    | 2026-04-20 |

## Dependencies

**Completed:** All v1.0, v1.1, v1.2 milestone dependencies satisfied

**v1.3:**
```
Phase 16 (v1.2 complete) ✅
    │
    ├─────────────────────┐
    ↓                     ↓
Phase 17 (Deployment) ✅   Phase 18 (Skill Lookup)
    │                     │
    │                     ↓
    │                Phase 19 (Edit Flow)
    │                     │
    │                     ↓
    │                Phase 20 (Edit Review)
    │
Phase 21 (User Ops Logger)
    │
    ↓
Phase 22 (RAG Logger + Rotation)
    │
    ↓
Phase 23 (Milestone Verification)
    │
    ↓
Phase 24 (Docker Logging Config)
```

**Notes:**
- Phase 18 (Skill Lookup) and Phase 21 (User Ops Logger) can run in parallel as they are independent
- Phase 19 depends on Phase 18 (need lookup to edit)
- Phase 20 depends on Phase 19 (need edit flow to review)
- Phase 22 depends on Phase 21 (rotation applies to both log layers)
- Phase 23 depends on Phase 22 (verifies all prior phases)
- Phase 24 depends on Phase 23 (fix integration gap after verification)

---
*Roadmap updated: 2026-04-19 for v1.3 milestone start*
