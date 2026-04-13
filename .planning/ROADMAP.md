# Roadmap: Skill Shareer

## Overview

Skill Shareer will ship in five phases that move from platform foundations to trustworthy knowledge intake, then to retrieval, and finally to admin-grade operations. The sequence is intentional: retrieval only matters after a curated corpus exists, and a curated corpus only works if team context, permissions, and review states are correct.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Monorepo Skeleton and Contracts** - Establish the workspace, shared schemas, API surface, and skill compatibility baseline (completed 2026-04-13)
- [x] **Phase 2: Identity, Teams, and RBAC** - Add login, team selection, member onboarding, member notes, access keys, and fine-grained permissions (completed 2026-04-13)
- [ ] **Phase 3: Knowledge Intake and Review** - Build structured submission, agent pre-review, admin review, and resubmission lifecycle
- [ ] **Phase 4: Retrieval and CLI Workflow** - Deliver text-seed search and full CLI user workflows
- [ ] **Phase 5: Admin Operations and Hardening** - Add knowledge management, import/export, and audit-grade operational controls

## Phase Details

### Phase 1: Monorepo Skeleton and Contracts
**Goal**: Create a TypeScript-first monorepo that cleanly separates CLI, server, and shared packages while fixing the API and skill packaging contract early.
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. The repo has a working monorepo skeleton for CLI, server, and shared packages
  2. Shared contracts define the core payloads for auth, knowledge, review, retrieval, and operations
  3. A documented API list exists and Claude-compatible skill layout is wired into the project structure
**Plans**: 3/3 plans complete

Plans:
- [x] 01-01: Create `pnpm` workspace layout, package boundaries, and bootstrap scripts
- [x] 01-02: Define shared TypeScript schemas and error contracts used by CLI and server
- [x] 01-03: Add API surface documentation and initial Claude-compatible skill scaffolding

### Phase 2: Identity, Teams, and RBAC
**Goal**: Make every protected workflow team-aware and permission-safe before knowledge flows are added.
**Depends on**: Phase 1
**Requirements**: ACCESS-01, ACCESS-02, ACCESS-03, ACCESS-04, ACCESS-05, ACCESS-06, ACCESS-07, ACCESS-08, ACCESS-09
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. A CLI user can log in, persist a session, and switch active teams
  2. Higher-level members can create teams, onboard members (level 0), and modify member levels (only to lower levels)
  3. Server authorization blocks actions based on security level comparison
  4. CLI shows or hides commands based on authenticated user's security level
  5. System admin key (.env) creates a virtual user with level 10
**Plans**: 3/3 plans complete

Plans:
- [x] 02-01: Implement auth/session flow and active-team context handling
- [x] 02-02: Build team and member management endpoints plus CLI commands
- [x] 02-03: Centralize authorization logic around role templates and explicit permissions

### Phase 3: Knowledge Intake and Review
**Goal**: Turn solved problems into reviewable knowledge objects with preserved lifecycle history.
**Depends on**: Phase 2
**Requirements**: KNOW-01, KNOW-02, KNOW-03, KNOW-04, KNOW-05, REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, REVIEW-05, REVIEW-06
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. A user can submit structured knowledge; the entry's requiredLevel defaults to the user's securityLevel
  2. Agent pre-review produces `agent-pass` or `agent-rejected`
  3. Only members with level > submission.requiredLevel can review and approve
  4. Rejected submissions can be fetched, corrected, and resubmitted with history preserved
  5. Knowledge entries can only be modified by members with level > entry.requiredLevel
**Plans**: 4 plans

Plans:
- [x] 03-01: Model knowledge entities, scopes, labels, and lifecycle states
- [x] 03-02: Implement submission APIs and review-state persistence
- [x] 03-03: Add LangChain-backed pre-review for duplicate/correctness/completeness checks
- [x] 03-04: Build admin review decisions and user resubmission workflow

### Phase 4: Retrieval and CLI Workflow
**Goal**: Deliver the core user promise: text-seed retrieval and shell-friendly operational commands.
**Depends on**: Phase 3
**Requirements**: RAG-01, RAG-02, RAG-03, RAG-04, RAG-05, CLI-01, CLI-02, CLI-03, CLI-04
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. A user can search from a text seed and receive only entries where `user.level >= entry.requiredLevel`
  2. Global constraints are surfaced distinctly when relevant to the query
  3. CLI commands support both human-readable and JSON output
  4. CLI shows available commands based on user's security level
**Plans**: 4 plans

Plans:
- [x] 04-01: Build embedding pipeline, metadata filters, and retrieval query API
- [ ] 04-02: Implement result shaping for global constraints and project knowledge
- [ ] 04-03: Build imperative CLI commands for search, submit, status, and resubmit
- [ ] 04-04: Add JSON output mode, stdin-based submission, and end-to-end retrieval workflow tests

### Phase 5: Admin Operations and Hardening
**Goal**: Make the system manageable for real teams through entry management, bulk operations, and auditable changes.
**Depends on**: Phase 4
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. Members can browse, edit, and deactivate knowledge entries they have permission to modify
  2. Members can export knowledge they have access to in the project-defined JSON format
  3. Members can import knowledge; imported entries' requiredLevel cannot exceed importer's level
  4. Review, import/export, and deactivation operations are present in an audit trail
**Plans**: 3 plans

Plans:
- [ ] 05-01: Add admin entry management endpoints and CLI commands
- [ ] 05-02: Implement bulk import/export workflows with validation and duplicate detection
- [ ] 05-03: Add audit trail, operational safeguards, and final hardening tests

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Monorepo Skeleton and Contracts | 3/3 | Complete    | 2026-04-13 |
| 2. Identity, Teams, and RBAC | 3/3 | Complete    | 2026-04-13 |
| 3. Knowledge Intake and Review | 0/4 | Not started | - |
| 4. Retrieval and CLI Workflow | 0/4 | Not started | - |
| 5. Admin Operations and Hardening | 0/3 | Not started | - |
