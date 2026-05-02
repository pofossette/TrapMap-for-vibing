# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 Multi-path Retrieval** — Phases 6-11 (shipped 2026-04-16)
- ✅ **v1.2 Skill-Native Retrieval** — Phases 12-16 (shipped 2026-04-17)
- ✅ **v1.3 工程化调整** — Phases 17-24 (shipped 2026-04-20)
- ✅ **v1.4 评测系统构建** — Phases 25-47 (shipped 2026-04-29)
- 🔄 **v1.5 功能增强** — Phases 48-59 (in progress)

## Phases

<details>
<summary>✅ v1.4 评测系统构建 (Phases 25-47) — SHIPPED 2026-04-29</summary>

- [x] Phase 25: Evaluation contracts & golden datasets (3/3 plans)
- [x] Phase 26: Retrieval evaluation runner & metrics (3/3 plans)
- [x] Phase 27: Summary evaluation with judge checks (3/3 plans)
- [x] Phase 28: Unified eval scripts & CI workflow (3/3 plans)
- [x] Phase 29: Unified multi-mode routing (3/3 plans)
- [x] Phase 30: Real fixture materialization (3/3 plans)
- [x] Phase 31: Cohort reports & CI regression (3/3 plans)
- [x] Phase 32: Skill/trap governance split (4/4 plans)
- [x] Phase 33: Async candidate ingestion (6/6 plans)
- [x] Phase 34: Duplicate-job CLI commands (5/5 plans)
- [x] Phase 35: Manual result reconciliation (7/7 plans)
- [x] Phase 36: GraphRAG-lite indexing (4/4 plans)
- [x] Phase 37: Trap-first plan compiler (3/3 plans)
- [x] Phase 38: Graph-plan routing & fallback (3/3 plans)
- [x] Phase 39: Unified graph schema (2/2 plans)
- [x] Phase 40: Library-backed parsing (2/2 plans)
- [x] Phase 41: Graphology dependency baseline (1/1 plans)
- [x] Phase 42: Graphology runtime migration (2/2 plans)
- [x] Phase 43: Database-backed persistence (3/3 plans)
- [x] Phase 44: Verification backfill eval phases (3/3 plans)
- [x] Phase 45: Verification backfill infra phases (3/3 plans)
- [x] Phase 46: Verification backfill platform + CI fix (1/1 plans)
- [x] Phase 47: Final EOPS verification & closure (1/1 plans)

</details>

<details>
<summary>🔄 v1.5 功能增强 (Phases 48-59) — IN PROGRESS</summary>

### Decay & Retirement

- [x] Phase 48: Lifecycle State Machine (DECAY-01, DECAY-04) (completed 2026-05-02)
- [x] Phase 49: Time-based Decay in Retrieval (DECAY-02) (completed 2026-05-02)
- [x] Phase 50: Batch Management Interface (DECAY-03) (completed 2026-05-02)

### Applicability Boundary Model

- [ ] Phase 51: Boundary Schema Definition (BOUND-01)
- [ ] Phase 52: Boundary Capture in Submission Flow (BOUND-02)
- [ ] Phase 53: Boundary Indexing & Graph Integration (BOUND-03)
- [ ] Phase 54: Boundary-aware Retrieval (BOUND-04, BOUND-05)

### Conflict Detection

- [ ] Phase 55: Conflict Detection & Display (CONFLICT-01, CONFLICT-02)

### Feedback Loop

- [x] Phase 56: CLI Feedback Entry Points (FEEDBACK-01) (completed 2026-05-02)
- [ ] Phase 57: Admin Feedback Management (FEEDBACK-02, FEEDBACK-03)

### Evidence & Maintenance

- [ ] Phase 58: Evidence Metadata & Verification Surface (EVIDENCE-01, EVIDENCE-02)
- [ ] Phase 59: Ownership & Verification SLA Management (MAINT-01, MAINT-02)

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 25-47 | v1.4 | 59/59 | Complete | 2026-04-29 |
| 48-59 | v1.5 | 0/12 | In Progress | — |

---

## Phase Details

### Phase 48: Lifecycle State Machine

**Requirements:** DECAY-01, DECAY-04

**Goal:** Implement knowledge lifecycle states with automatic transitions and decay application logic.

**Plans:** 3/3 plans complete

Plans:
- [x] 48-01-PLAN.md — Decay domain model: contracts, state machine, config, store records
- [x] 48-02-PLAN.md — Supersede feature: service, routes, CLI command
- [x] 48-03-PLAN.md — Governance integration: hard/soft decay in retrieval pipeline

**Success Criteria:**
1. Maintainer can configure lifecycle state thresholds (review-due days, stale days, expire days) via config file
2. Knowledge entries automatically transition through states (active → review-due → stale → expired) based on age and last-verified timestamp
3. Retrieval results exclude expired/superseded entries from default responses (hard decay)
4. Admin can manually supersede an entry, creating explicit supersession relationship

---

### Phase 49: Time-based Decay in Retrieval

**Requirements:** DECAY-02

**Goal:** Apply freshness multiplier in retrieval ranking with configurable decay curves.

**Success Criteria:**
1. Each knowledge entry has a freshness type: evergreen (no decay), versioned (decay on version mismatch), volatile (time-based decay)
2. Retrieval ranking applies configurable decay multiplier based on entry age and freshness type
3. Maintainer can configure decay curve parameters (half-life, floor) per freshness type
4. Decay multiplier visible in retrieval explanation metadata

---

### Phase 50: Batch Management Interface

**Requirements:** DECAY-03

**Goal:** Enable maintainers to discover and manage outdated/erroneous knowledge in batches.

**Success Criteria:**
1. CLI command to list entries in stale/expired state with filtering by age, category, and state
2. Batch actions: extend lifecycle, mark for review, deactivate, supersede with replacement
3. Retrieval-based discovery: search for entries matching patterns with lifecycle state facet
4. Dry-run mode shows what would change before applying batch operations

---

### Phase 51: Boundary Schema Definition

**Requirements:** BOUND-01

**Goal:** Define unified boundary schema across trap and skill artifacts.

**Success Criteria:**
1. Schema defines 6 boundary layers: context, versions, prerequisites, signals, exclusions, evidence
2. Each layer contains structured fields with defined types (string arrays, version ranges, condition objects)
3. Schema shared across trap and skill artifact types with no divergence
4. TypeScript types generated from schema with runtime validation

---

### Phase 52: Boundary Capture in Submission Flow

**Requirements:** BOUND-02

**Goal:** Enable boundary input during submission with agent extraction and reviewer confirmation.

**Success Criteria:**
1. Submit CLI accepts `--boundary` flag with JSON input for all 6 layers
2. Agent pre-review extracts candidate boundaries from content (LLM-based inference)
3. Review UI shows extracted boundaries alongside content for reviewer confirmation
4. Reviewer can modify, add, or remove boundary fields before approval

---

### Phase 53: Boundary Indexing & Graph Integration

**Requirements:** BOUND-03

**Goal:** Index boundary fields as facets and graph nodes with back-references.

**Success Criteria:**
1. Boundary fields indexed as facets in search index for filtering
2. Standardized boundary values (versions, platforms) stored as graph nodes
3. Graph edges connect knowledge entries to boundary nodes with relationship types
4. Back-references queryable: find all entries matching a boundary constraint

---

### Phase 54: Boundary-aware Retrieval

**Requirements:** BOUND-04, BOUND-05

**Goal:** Apply boundary logic in retrieval ranking and explain applicability in responses.

**Success Criteria:**
1. Retrieval accepts boundary context (platform, versions, environment) as input
2. Required constraint mismatch: entry excluded from results
3. Excluded constraint match: entry penalized in ranking
4. Preferred constraint match: entry boosted in ranking
5. API response includes `boundary_explanation` field showing why entry is applicable or potentially inapplicable

---

### Phase 55: Conflict Detection & Display

**Requirements:** CONFLICT-01, CONFLICT-02

**Goal:** Detect conflicting knowledge entries and display relationships in retrieval.

**Success Criteria:**
1. Conflict detection runs on approval: identifies entries addressing same problem with different solutions
2. Conflicts stored as relationships with conflict type (alternative, contradictory, superseded)
3. Retrieval results include `conflicts` field showing related entries with conflict type
4. Users can see conflicting options and context to choose appropriate solution

---

### Phase 56: CLI Feedback Entry Points

**Requirements:** FEEDBACK-01

**Goal:** Provide CLI post-execution feedback mechanism and skill-mounted feedback capabilities.

**Success Criteria:**
1. CLI command `feedback <entry-id>` opens interactive prompt for problem report
2. Feedback captures: problem type (incorrect, outdated, context-mismatch, other), description, optional context
3. Skill artifacts can define feedback prompts in SKILL.md frontmatter
4. Feedback submission creates entry in feedback queue for admin review

---

### Phase 57: Admin Feedback Management

**Requirements:** FEEDBACK-02, FEEDBACK-03

**Goal:** Enable admins to review feedback in batch and connect feedback to lifecycle transitions.

**Success Criteria:**
1. Admin CLI lists feedback queue with filtering by type, age, and entry
2. Batch actions: mark resolved, mark invalid, trigger lifecycle transition, request more info
3. Feedback signals contribute to knowledge quality score (visible in admin views)
4. Recurring feedback patterns trigger automatic lifecycle transitions (e.g., multiple "outdated" reports → stale state)

---

### Phase 58: Evidence Metadata & Verification Surface

**Requirements:** EVIDENCE-01, EVIDENCE-02

**Goal:** Add a minimal provenance and verification model so published knowledge can show where it came from, when it was verified, and how strong the evidence is.

**Success Criteria:**
1. Trap and skill records can store minimal evidence metadata: `sourceType`, `sourceRef`, `evidenceLevel`, `verifiedAt`, `verifiedBy`
2. Review flow can capture or edit evidence metadata before approval
3. Retrieval responses expose evidence metadata in an additive, compact form
4. Evidence metadata is queryable in admin views and audit-friendly

---

### Phase 59: Ownership & Verification SLA Management

**Requirements:** MAINT-01, MAINT-02

**Goal:** Add lightweight ownership and review-due tracking so maintainers can keep the corpus healthy without a heavy governance system.

**Success Criteria:**
1. Trap and skill records store `owner`, `reviewBy`, and `lastVerifiedAt`
2. CLI/admin views can list entries with missing owner, overdue review, or stale verification
3. Batch actions can assign owner, extend review date, or mark an item re-verified
4. Lifecycle and batch-management phases can reuse this data without introducing a separate maintenance subsystem

---

## Requirement Coverage Matrix

| Requirement | Phase | Description |
|-------------|-------|-------------|
| DECAY-01 | Phase 48 | Lifecycle state machine with automatic transitions |
| DECAY-02 | Phase 49 | Freshness multiplier in retrieval ranking |
| DECAY-03 | Phase 50 | Batch management of outdated knowledge |
| DECAY-04 | Phase 48 | Soft/hard decay application |
| BOUND-01 | Phase 51 | Unified boundary schema (6 layers) |
| BOUND-02 | Phase 52 | Boundary capture in submission flow |
| BOUND-03 | Phase 53 | Boundary indexing and graph integration |
| BOUND-04 | Phase 54 | Boundary-aware retrieval filtering/boosting |
| BOUND-05 | Phase 54 | API boundary explanations |
| CONFLICT-01 | Phase 55 | Conflict detection |
| CONFLICT-02 | Phase 55 | Conflict display in retrieval |
| FEEDBACK-01 | Phase 56 | CLI feedback entry points |
| FEEDBACK-02 | Phase 57 | Admin feedback batch review |
| FEEDBACK-03 | Phase 57 | Feedback signals for lifecycle/quality |
| EVIDENCE-01 | Phase 58 | Minimal evidence and provenance metadata |
| EVIDENCE-02 | Phase 58 | Retrieval/admin evidence visibility |
| MAINT-01 | Phase 59 | Ownership and review-due metadata |
| MAINT-02 | Phase 59 | Maintenance list and batch actions |

**Coverage:**
- Total v1.5 requirements: 18
- Mapped to phases: 18
- Unmapped: 0 ✓

---

## Dependency Graph

```
Phase 48 (State Machine)
    ↓
Phase 49 (Decay in Retrieval)
    ↓
Phase 50 (Batch Management)

Phase 51 (Boundary Schema)
    ↓
Phase 52 (Boundary Capture)
    ↓
Phase 53 (Boundary Indexing)
    ↓
Phase 54 (Boundary-aware Retrieval)

Phase 55 (Conflict Detection) ── independent

Phase 56 (CLI Feedback)
    ↓
Phase 57 (Admin Feedback Management)

Phase 58 (Evidence Metadata) ── independent, but should align with Phase 51 boundary evidence fields
    ↓
Phase 59 (Ownership & SLA Management)
```

**Parallelization Opportunities:**
- Phases 48-50 (Decay) can run in parallel with Phases 51-54 (Boundary)
- Phase 55 (Conflict) is independent, can run anytime
- Phase 56 can start in parallel with decay/boundary work
- Phase 58 can start in parallel with decay, boundary, or feedback work
- Phase 59 should follow Phase 48 if it reuses lifecycle state and Phase 58 if it reuses verification metadata

---

*Roadmap updated: 2026-05-02 for v1.5 milestone*
