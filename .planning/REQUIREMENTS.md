# Requirements: Skill Shareer

**Defined:** 2026-04-13
**Core Value:** Teams can retrieve concise, trustworthy, team-relevant engineering knowledge from the terminal before they repeat a solved mistake

## v1 Requirements

### Platform & Skills

- [ ] **PLAT-01**: The repository uses a monorepo layout with separate workspace members for CLI, server, and shared packages
- [ ] **PLAT-02**: CLI and server share versioned TypeScript contract models and runtime validation schemas for auth, knowledge, review, retrieval, and operations payloads
- [ ] **PLAT-03**: Project skills follow Claude-compatible directory and `SKILL.md` conventions with machine-readable metadata
- [ ] **PLAT-04**: The server exposes a documented HTTP API surface for every CLI workflow in v1

### Access & Teams

- [ ] **ACCESS-01**: User can authenticate to the server from the CLI and keep a valid session across commands
- [ ] **ACCESS-02**: User can list available teams and select one active team after login
- [ ] **ACCESS-03**: Admin can create teams and onboard new team members
- [ ] **ACCESS-04**: Admin can assign a role template and explicit permissions list to a team member
- [ ] **ACCESS-05**: The server authorizes every protected action using both role template and explicit permissions on the user object

### Knowledge Lifecycle

- [ ] **KNOW-01**: User can submit a knowledge entry with scope, labels, shortcut, and detail
- [ ] **KNOW-02**: The system distinguishes concise global constraints from project-internal knowledge and supports custom labels
- [ ] **KNOW-03**: The system preserves lifecycle states and audit history across submissions, reviews, and revisions
- [ ] **KNOW-04**: Knowledge only becomes searchable after admin approval

### Review Workflow

- [ ] **REVIEW-01**: The server runs agent pre-review for duplicate, correctness, and completeness checks on new or resubmitted knowledge
- [ ] **REVIEW-02**: Pre-review marks a submission as `agent-pass` or `agent-rejected`
- [ ] **REVIEW-03**: Admin can view both pre-review queues and filter by status
- [ ] **REVIEW-04**: Admin can approve or reject a submission with review notes
- [ ] **REVIEW-05**: User can inspect rejected content and reviewer feedback from the CLI
- [ ] **REVIEW-06**: User can resubmit rejected content while preserving linkage to previous attempts

### Retrieval

- [ ] **RAG-01**: User can send a text seed from the CLI and receive relevant knowledge matches
- [ ] **RAG-02**: Retrieval accepts text-only query input and indexes text-only knowledge in v1
- [ ] **RAG-03**: Retrieval respects active team, scope, and metadata filters
- [ ] **RAG-04**: Retrieval surfaces concise global constraints separately from project knowledge when relevant
- [ ] **RAG-05**: The server uses embeddings, metadata-aware ranking, and optional LLM refinement before returning context

### CLI Experience

- [ ] **CLI-01**: The CLI exposes imperative commands for server setup, login, team select, search, submit, resubmit, and review status
- [ ] **CLI-02**: The CLI returns human-readable output by default and structured JSON output on demand
- [ ] **CLI-03**: The CLI lets agents register solved problems using shell-friendly flags and stdin
- [ ] **CLI-04**: The CLI can inspect the current user's submission and review history, including rejected details

### Operations

- [ ] **OPS-01**: Admin can list, edit, and deactivate knowledge entries
- [ ] **OPS-02**: Admin can export knowledge entries, metadata, and review status in bulk
- [ ] **OPS-03**: Admin can import knowledge entries in bulk with validation and duplicate detection
- [ ] **OPS-04**: The server records review, import, export, and deactivation actions in an audit trail

## v2 Requirements

### Identity & Distribution

- **V2-01**: Support SSO or external identity providers
- **V2-02**: Support cross-team sharing policies beyond global/project scope

### Experience

- **V2-03**: Provide a web admin console in addition to CLI
- **V2-04**: Support automated ingestion from developer tooling such as git hooks, issue trackers, or CI logs

### Retrieval

- **V2-05**: Support multimodal knowledge assets and multimodal retrieval

## Out of Scope

| Feature | Reason |
|---------|--------|
| End-user GUI workflow for normal usage | CLI-first is a core product constraint for humans and agents |
| Auto-publish without admin review | Trust and curation matter more than raw throughput |
| Multimodal indexing in v1 | User explicitly limited initial search to text |
| Public knowledge marketplace | Initial release is for internal team collaboration |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1 | Pending |
| PLAT-02 | Phase 1 | Pending |
| PLAT-03 | Phase 1 | Pending |
| PLAT-04 | Phase 1 | Pending |
| ACCESS-01 | Phase 2 | Pending |
| ACCESS-02 | Phase 2 | Pending |
| ACCESS-03 | Phase 2 | Pending |
| ACCESS-04 | Phase 2 | Pending |
| ACCESS-05 | Phase 2 | Pending |
| KNOW-01 | Phase 3 | Pending |
| KNOW-02 | Phase 3 | Pending |
| KNOW-03 | Phase 3 | Pending |
| KNOW-04 | Phase 3 | Pending |
| REVIEW-01 | Phase 3 | Pending |
| REVIEW-02 | Phase 3 | Pending |
| REVIEW-03 | Phase 3 | Pending |
| REVIEW-04 | Phase 3 | Pending |
| REVIEW-05 | Phase 3 | Pending |
| REVIEW-06 | Phase 3 | Pending |
| RAG-01 | Phase 4 | Pending |
| RAG-02 | Phase 4 | Pending |
| RAG-03 | Phase 4 | Pending |
| RAG-04 | Phase 4 | Pending |
| RAG-05 | Phase 4 | Pending |
| CLI-01 | Phase 4 | Pending |
| CLI-02 | Phase 4 | Pending |
| CLI-03 | Phase 4 | Pending |
| CLI-04 | Phase 4 | Pending |
| OPS-01 | Phase 5 | Pending |
| OPS-02 | Phase 5 | Pending |
| OPS-03 | Phase 5 | Pending |
| OPS-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-13*
*Last updated: 2026-04-13 after initial definition*
