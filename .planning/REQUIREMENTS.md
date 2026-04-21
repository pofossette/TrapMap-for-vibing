# Requirements: Skill Shareer

**Defined:** 2026-04-21
**Core Value:** Teams can retrieve concise, trustworthy, team-relevant engineering knowledge from the terminal before they repeat a solved mistake.

## v1.4 Requirements

Requirements for v1.4 milestone: 评测系统构建

### Retrieval Evaluation (REVAL)

- [x] **REVAL-01**: Maintainer can run a TypeScript-native retrieval evaluation command against current TrapMap retrieval endpoints from the monorepo
- [x] **REVAL-02**: Retrieval evaluation uses labeled golden datasets that cover smoke and core scenarios for `/v1/retrieval/search` and `/v2/retrieval/search`
- [ ] **REVAL-03**: Retrieval evaluation reports ranking metrics including Hit@K, MRR, nDCG, and Recall@K per retrieval mode
- [ ] **REVAL-04**: Retrieval evaluation detects governance failures including forbidden-result leakage, scope violations, and empty-result expectation mismatches

### Summary Evaluation (SEVAL)

- [ ] **SEVAL-01**: Maintainer can run a summary/refinement evaluation flow that scores groundedness, coverage, and citation adherence for retrieval summaries
- [ ] **SEVAL-02**: Summary evaluation uses milestone-owned evaluation cases with required facts and forbidden claims so hallucinations are visible in reports

### Operations and Regression Control (EOPS)

- [ ] **EOPS-01**: Evaluation outputs machine-readable and human-readable reports that compare results across endpoint and retrieval mode combinations
- [ ] **EOPS-02**: Repo scripts support a fast smoke evaluation path for pull requests and a broader core evaluation path for regression tracking
- [ ] **EOPS-03**: The milestone defines a baseline and failure policy so future retrieval changes can be checked against regressions instead of ad-hoc judgment

## v2 Requirements

### Advanced Evaluation

- **AEVAL-01**: Add dashboard-style evaluation observability for long-term trend analysis
- **AEVAL-02**: Add optional Python-side evaluators such as Ragas or DeepEval for expanded metric coverage
- **AEVAL-03**: Evaluate end-to-end conversational answer correctness once a stable answer-generation endpoint exists

## Out of Scope

| Feature | Reason |
|---------|--------|
| Public benchmark publishing | Current need is internal engineering confidence, not external leaderboard comparison |
| Human-labeling UI | JSON/JSONL datasets in-repo are sufficient for v1.4 and lower-friction for maintainers |
| Full online experiment platform | This milestone needs reproducible local and CI evaluation, not a hosted analytics product |
| Python-first primary evaluator | Would increase operational complexity and diverge from the repo's TypeScript-native workflow |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REVAL-01 | Phase 25, Phase 26 | Complete |
| REVAL-02 | Phase 25 | Complete |
| REVAL-03 | Phase 26 | Pending |
| REVAL-04 | Phase 26, Phase 29 | Pending |
| SEVAL-01 | Phase 27 | Pending |
| SEVAL-02 | Phase 27 | Pending |
| EOPS-01 | Phase 28 | Pending |
| EOPS-02 | Phase 28 | Pending |
| EOPS-03 | Phase 29 | Pending |

**Coverage:**
- v1.4 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0

---
*Requirements defined: 2026-04-21*
*Last updated: 2026-04-21 after initial definition*
