# Requirements: Skill Shareer

**Defined:** 2026-05-02
**Core Value:** Teams can retrieve concise, trustworthy, team-relevant engineering knowledge from the terminal before they repeat a solved mistake.

## v1.5 Requirements

Requirements for v1.5 milestone: 功能增强

### Decay & Retirement (DECAY)

- [x] **DECAY-01**: Maintainer can configure knowledge lifecycle states (review-due / stale / expired / superseded) with automatic state transitions based on time and usage patterns
- [x] **DECAY-02**: Retrieval ranking applies freshness multiplier with configurable decay curves for three knowledge types (evergreen / versioned / volatile)
- [x] **DECAY-03**: Maintainer can perform batch management of outdated/erroneous knowledge through retrieval-based discovery interface
- [x] **DECAY-04**: System applies soft decay (ranking penalty) for stale knowledge and hard decay (exclusion from default retrieval) for expired/superseded knowledge

### Applicability Boundary Model (BOUND)

- [x] **BOUND-01**: Unified boundary schema shared across trap and skill artifacts with 6-layer structure (context / versions / prerequisites / signals / exclusions / evidence)
- [ ] **BOUND-02**: Authors can input boundary constraints during submission; agent can extract candidate boundaries; reviewers can confirm boundaries
- [ ] **BOUND-03**: Boundary fields are indexed as facets and graph nodes with back-references to standardized boundary structures
- [ ] **BOUND-04**: Retrieval ranking filters on required constraint mismatch, penalizes on excluded constraint match, and boosts on preferred constraint match
- [ ] **BOUND-05**: API responses include boundary explanations showing why results are applicable or potentially inapplicable

### Conflict Detection (CONFLICT)

- [ ] **CONFLICT-01**: System detects when multiple knowledge entries address the same problem with different solutions
- [ ] **CONFLICT-02**: Retrieval results display conflict relationships with context allowing users to choose appropriate solutions

### Feedback Loop (FEEDBACK)

- [x] **FEEDBACK-01**: CLI provides post-execution problem report entry point; skill artifacts can mount feedback capabilities
- [ ] **FEEDBACK-02**: Admins can review and process user feedback in batch through management interface
- [ ] **FEEDBACK-03**: Feedback signals contribute to knowledge lifecycle transitions and quality scoring

### Evidence & Provenance (EVIDENCE)

- [x] **EVIDENCE-01**: Trap and skill records can store minimal evidence metadata (sourceType, sourceRef, evidenceLevel, verifiedAt, verifiedBy) with review flow capture and retrieval exposure
- [x] **EVIDENCE-02**: Evidence metadata is queryable in admin views with audit-friendly filtering by evidence level, source type, and verification date

### Maintenance & Ownership (MAINT)

- [ ] **MAINT-01**: Trap and skill records store owner, reviewBy, and lastVerifiedAt with admin views for missing owner, overdue review, and stale verification
- [ ] **MAINT-02**: Batch actions can assign owner, extend review date, or mark item re-verified; lifecycle and batch-management phases can reuse this data

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
| DECAY-02 | Phase 49 | Complete |
| DECAY-03 | Phase 50 | Complete |
| DECAY-04 | Phase 48 | Complete |
| BOUND-01 | Phase 51 | Complete |
| BOUND-02 | Phase 52 | Pending |
| BOUND-03 | Phase 53 | Pending |
| BOUND-04 | Phase 54 | Pending |
| BOUND-05 | Phase 54 | Pending |
| CONFLICT-01 | Phase 55 | Pending |
| CONFLICT-02 | Phase 55 | Pending |
| FEEDBACK-01 | Phase 56 | Complete |
| FEEDBACK-02 | Phase 57 | Pending |
| FEEDBACK-03 | Phase 57 | Pending |
| EVIDENCE-01 | Phase 58 | Complete |
| EVIDENCE-02 | Phase 58 | Complete |
| MAINT-01 | Phase 59 | Pending |
| MAINT-02 | Phase 59 | Pending |

**Coverage:**
- v1.5 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-02*
*Last updated: 2026-05-02 after Phase 50 verification*
