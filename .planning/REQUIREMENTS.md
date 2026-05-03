# Requirements: Skill Shareer

**Defined:** 2026-05-02
**Core Value:** Teams can retrieve concise, trustworthy, team-relevant engineering knowledge from the terminal before they repeat a solved mistake.

## v1.5 Requirements

Requirements for v1.5 milestone: 功能增强

### Decay & Retirement (DECAY)

- [x] **DECAY-01**: Maintainer can configure knowledge lifecycle states (review-due / stale / expired / superseded) with automatic state transitions based on time and usage patterns
- [x] **DECAY-02**: Retrieval ranking applies freshness multiplier with configurable decay curves for three knowledge types (evergreen / versioned / volatile)
- [ ] **DECAY-03**: Maintainer can perform batch management of outdated/erroneous knowledge through retrieval-based discovery interface
- [x] **DECAY-04**: System applies soft decay (ranking penalty) for stale knowledge and hard decay (exclusion from default retrieval) for expired/superseded knowledge

### Applicability Boundary Model (BOUND)

- [x] **BOUND-01**: Unified boundary schema shared across trap and skill artifacts with 6-layer structure (context / versions / prerequisites / signals / exclusions / evidence)
- [x] **BOUND-02**: Authors can input boundary constraints during submission; agent can extract candidate boundaries; reviewers can confirm boundaries
- [x] **BOUND-03**: Boundary fields are indexed as facets and graph nodes with back-references to standardized boundary structures
- [ ] **BOUND-04**: Retrieval ranking filters on required constraint mismatch, penalizes on excluded constraint match, and boosts on preferred constraint match
- [ ] **BOUND-05**: API responses include boundary explanations showing why results are applicable or potentially inapplicable

### Conflict Detection (CONFLICT)

- [x] **CONFLICT-01**: System detects when multiple knowledge entries address the same problem with different solutions
- [x] **CONFLICT-02**: Retrieval results display conflict relationships with context allowing users to choose appropriate solutions

### Feedback Loop (FEEDBACK)

- [x] **FEEDBACK-01**: CLI provides post-execution problem report entry point; skill artifacts can mount feedback capabilities
- [x] **FEEDBACK-02**: Admins can review and process user feedback in batch through management interface
- [ ] **FEEDBACK-03**: Feedback signals contribute to knowledge lifecycle transitions and quality scoring

### Ownership & Maintenance (MAINT)

- [x] **MAINT-01**: Knowledge entries and skill artifacts store ownership (maintainer) and review-due metadata for SLA-aware lifecycle management
- [x] **MAINT-02**: CLI and admin views support listing, filtering, and batch operations (assign-owner, extend-review, mark-verified) on maintenance metadata

### Evidence Metadata (EVIDENCE)

- [x] **EVIDENCE-01**: Trap and skill records store minimal evidence metadata (sourceType, sourceRef, evidenceLevel, verifiedAt, verifiedBy) with review flow capture
- [x] **EVIDENCE-02**: Retrieval responses expose evidence metadata; evidence queryable in admin views and audit-friendly

### Type Consolidation (TECH-DEBT)

- [x] **TECH-DEBT-01**: AdapterSyncState and KnowledgeIndexStateRecord defined in exactly one canonical location; all consumers import from that location
- [x] **TECH-DEBT-02**: Lifecycle state transitions centralized in single state-machine module with validated transition function

### Write Path Optimization (WRITE)

- [x] **WRITE-01**: Candidate submissions extracted from JSONB into dedicated candidates table with row-level locking
- [x] **WRITE-02**: Knowledge entries extracted from JSONB into knowledge_entries, knowledge_revisions, lifecycle_events tables with concurrent write support
- [x] **WRITE-03**: Skill artifacts migrated to row-level table; JSONB shadow writes removed; store_snapshot downgraded to cold backup

## v2 Requirements

Deferred to future release.

### Advanced Boundary

- **BOUND-06**: Automatic boundary inference from content using LLM analysis
- **BOUND-07**: Cross-team boundary sharing and standardization

### Advanced Analytics

- **ANAL-01**: Knowledge aging visualization dashboard
- **ANAL-02**: Conflict resolution analytics

## Out of Scope

| Feature | Reason |
|---------|--------|
| Implicit feedback collection (clicks/views) | Privacy considerations, prefer explicit signals first |
| Learning-to-rank optimization | Requires significant feedback volume; defer until feedback loop is mature |
| Automatic knowledge generation | Out of scope for lifecycle management focus |
| Multi-language knowledge support | Not a priority for current user base |
| Real-time collaborative editing | Adds complexity without clear value for current use case |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DECAY-01 | Phase 48 | Complete |
| DECAY-02 | Phase 64 | Complete |
| DECAY-03 | Phase 65 | Pending |
| DECAY-04 | Phase 48 | Complete |
| BOUND-01 | Phase 51 | Complete |
| BOUND-02 | Phase 52 | Complete |
| BOUND-03 | Phase 53 | Complete |
| BOUND-04 | Phase 66 | Pending |
| BOUND-05 | Phase 66 | Pending |
| CONFLICT-01 | Phase 55 | Complete |
| CONFLICT-02 | Phase 64 | Complete |
| FEEDBACK-01 | Phase 56 | Complete |
| FEEDBACK-02 | Phase 57 | Complete |
| FEEDBACK-03 | Phase 65 | Pending |
| MAINT-01 | Phase 59 | Complete |
| MAINT-02 | Phase 59 | Complete |
| EVIDENCE-01 | Phase 58 | Complete |
| EVIDENCE-02 | Phase 58 | Complete |
| TECH-DEBT-01 | Phase 60 | Complete |
| TECH-DEBT-02 | Phase 60 | Complete |
| WRITE-01 | Phase 61 | Complete |
| WRITE-02 | Phase 62 | Complete |
| WRITE-03 | Phase 63 | Complete |

**Coverage:**
- v1.5 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-02*
*Last updated: 2026-05-03 after gap closure phase planning (64-67)*
