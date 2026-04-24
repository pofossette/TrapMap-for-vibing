
### Phase 29: 统一多模式检索策略层与路由

**Goal:** Unify v1/v2 retrieval behind a shared deterministic routing layer with governance-first mode selection, stable routing traces, and baseline/failure-policy support for future regressions
**Requirements**: EOPS-03
**Depends on:** Phase 28
**Plans:** 3/3 plans complete

Plans:
- [x] 29-01 - Shared routing contracts and deterministic strategy selection
- [x] 29-02 - Governance-safe server integration for routed retrieval execution
- [x] 29-03 - Mode-aware baseline and failure-policy integration for evaluation reporting

### Phase 30: 真实评测 fixture 与上下文 trace 接入

**Goal:** Turn the evaluation stack from partially wired infrastructure into a real executable regression surface by connecting scenarios, fixture seeding, live endpoint execution, and retrieval-context trace output
**Requirements**: EOPS-01, EOPS-02, SEVAL-01, SEVAL-02
**Depends on:** Phase 29
**Plans:** 3/3 plans complete

Plans:
- [x] 30-01 - Scenario fixture seeding for real retrieval evaluation data
- [x] 30-02 - v2 summary integration in retrieval pipeline
- [x] 30-03 - Real summary execution and context trace fields

### Phase 31: 模式维度基准集与 CI 回归报告增强

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 30
**Plans:** 3/3 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 31 to break down) (completed 2026-04-24)

### Phase 32: 拆分 skill 与 trap 为独立 CLI 命令和服务端边界，抽离共享治理逻辑

**Goal:** Split skill and trap into independent CLI commands and server-side boundaries, extracting shared governance logic into a reusable module
**Requirements**: N/A (architectural refactoring)
**Depends on:** Phase 31
**Plans:** 4/4 plans complete

Plans:
- [x] 32-01 - Create shared governance module (eligibility types and functions)
- [x] 32-02 - Refactor existing code to use shared governance module
- [x] 32-03 - Create trap CLI command group
- [x] 32-04 - Create trap server route boundary

### Phase 33: 异步候选入库与重复判定队列，保留原始上传快照

**Goal:** Introduce asynchronous ingestion boundary for new skill and trap submissions so duplicate analysis happens after upload, not inline in the request path
**Requirements**: N/A (infrastructure)
**Depends on:** Phase 32
**Plans:** 6/7 plans complete

Plans:
- [x] 33-01 - Candidate submission types and store integration
- [x] 33-02 - Fingerprint computation and unified duplicate detector
- [x] 33-03 - Candidate store CRUD operations
- [x] 33-04 - Async candidate processor
- [x] 33-05 - Candidate API routes
- [x] 33-06 - Startup recovery for in-flight candidates

### Phase 34: builtin duplicate-job fetch command and manual result intake

**Goal:** Add client-facing CLI commands for fetching duplicate-job bundles and submitting manual resolution decisions, enabling reviewers to review duplicates offline without raw curl
**Requirements**: N/A (operator ergonomics)
**Depends on:** Phase 33
**Plans:** 5/5 plans complete

Plans:
- [x] 34-01 - Add duplicate job bundle and manual result types to contracts
- [x] 34-02 - Add manual result store functions
- [x] 34-03 - Add duplicate job bundle and manual result endpoints
- [x] 34-04 - Add CLI commands for duplicate job fetch and resolve
- [x] 34-05 - Verification and integration testing

### Phase 35: manual result revalidation and publish merge reconciliation

**Goal:** Turn a manually edited duplicate job into a validated publish action while preserving the original upload, the old published item, and the full audit trail
**Requirements**: N/A (operator ergonomics)
**Depends on:** Phase 34
**Plans:** 7/6 plans complete

Plans:
- [x] 35-01 - Contracts and types for resolution workflow
- [x] 35-02 - Revalidation logic for manual results
- [x] 35-03 - Publish independent path
- [x] 35-04 - Merge path and lineage recording
- [x] 35-05 - Main orchestrator and API endpoint
- [x] 35-06 - CLI integration and end-to-end testing

### Phase 36: GraphRAG-lite indexing pipeline for skill-trap graph extraction

**Goal:** Add a durable, governance-safe GraphRAG-lite indexing layer that extracts trap and skill graph documents from approved content and keeps them synchronized across approval, update, deactivation, and startup repair flows
**Requirements**: P36-01, P36-02, P36-03, P36-04
**Depends on:** Phase 35
**Plans:** 4/4 plans complete

Plans:
- [x] 36-01-PLAN.md - Durable graph document contracts and graphology utilities
- [x] 36-02-PLAN.md - Trap extraction and durable graph adapter integration
- [x] 36-03-PLAN.md - Skill-derived graph indexing and lifecycle hooks
- [x] 36-04-PLAN.md - Cross-domain reconciliation and startup graph repair

### Phase 37: GraphRAG-lite retrieval compiler for trap-first skill plans

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 36
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 37 to break down)

### Phase 38: GraphRAG-lite routing fallback and evaluation coverage

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 37
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 38 to break down)

### Phase 39: GraphRAG-lite unified graph schema for skill and trap outputs

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 38
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 39 to break down)

### Phase 40: Replace manual frontmatter and MIME parsing with library-backed utilities

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 39
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 40 to break down)

### Phase 41: Introduce graphology and parsing libraries to replace hand-rolled implementations

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 40
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 41 to break down)

### Phase 42: Replace hand-rolled graph operations with graphology-based GraphRAG runtime

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 41
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 42 to break down)

### Phase 43: Migrate store and indexing persistence to database-backed libraries

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 42
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 43 to break down)
