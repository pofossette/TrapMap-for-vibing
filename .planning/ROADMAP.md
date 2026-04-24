

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
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 31 to break down)

### Phase 32: 拆分 skill 与 trap 为独立 CLI 命令和服务端边界，抽离共享治理逻辑

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 31
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 32 to break down)

### Phase 33: 异步候选入库与重复判定队列，保留原始上传快照

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 32
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 33 to break down)

### Phase 34: builtin duplicate-job fetch command and manual result intake

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 33
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 34 to break down)

### Phase 35: manual result revalidation and publish merge reconciliation

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 34
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 35 to break down)
