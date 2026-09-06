# Gene 检索评测扩展 — 任务规格

> **状态**：Active detail（由 4 路并行校对后合成，待进入 subagent-driven execution）
> **创建时间**：2026-09-06
> **Owner 建议**：evals + knowledge-read 边界 Owner（后续按子任务认领）
> **依赖主线**：Experience Gene 已于 2026-09-03 closeout 并归档（docs/archived/archived-plans/experience-gene-program-mainline-archived.md）；当前唯一链接的 mainline 仍为 docs/todos/web-panel-feature-and-ui-optimization.md。本文档是**并行 active detail**，不抢占根 plan.md 的 mainline 槽位；进入执行时按 docs/todos/README.md 的活跃登记规则增行。
> **校对方式**：本规格由 4 路“子智能体”分头读真实代码后合成（A: 四路检索模板 / B: Gene 检索实现 / C: 评测基座与 promptfoo / D: 健康度与治理）；所有结论均以本仓库最新源码为权威，行号/路径可在附录复核。

---

## 1. 背景与目标

### 1.1 为什么现在做

- **大量架构调整已落地**：2026-08-10 以来完成 docs/archived/archived-plans/architecture-remediation-mainline-archived.md（P0-P8）与 architecture-remediation-mainline-b-true-convergence-archived.md（B 真收敛，58 budgets / 955 tests / fallow audit --base main 0 issues @0d754b73），涉及 host-* 真拆、@trapmap/* 边界、pgvector 治理统一、cache-port 真实现、route-surface 校验等。**在此之后，evals 体系未被系统性复测**，存在“看起来能 pnpm eval:smoke --dry-run，实际隔离/归一/治理语义漂移”的风险。
- **文档口径有轻度失真**：`docs/README.md` 的 active 主线仍为旧 Gene，`EVALUATION.md` 示例为旧接口。本次仅修正入口必要口径，其余随 T6 回写。

- **Gene 检索已上线但评测缺口明显**：POST /v1/retrieval/genes/search（packages/service-knowledge-read/src/experience-gene-routes.ts:toExperienceGeneSearchContext / packages/service-knowledge-read/src/experience-gene-retrieval.ts:createPgExperienceGeneSearchPort）已在两宿主网关注册（packages/host-local/src/nest/gateway/gateway.module.ts:createHostLocalExperienceGeneGatewayDefs、packages/host-distributed/src/gateway/routes.ts:createExperienceGeneGatewayDeps），并由 apps/light/src/composition/experience-gene.ts / apps/distributed/src/composition/experience-gene.ts 薄组装 PgExperienceGeneSearchPort（@trapmap/infra:embedWithFallback）。但仓库内仅有**确定性 domain 评测** evals/experience-gene/（evals/experience-gene/lib/runner.ts:selectExperienceGenes 的 primarySelectionPrecision / knownPitfallAvoidanceRate 离线模型），**没有对真实 PG 链路（含 governance、keyword+vector 混合召回、tri-state mode、supplementaryAvoid、safety 扫描）的端到端检索评测**。与 retrieval 的 v1/v2/v3 四路相比，gene 侧是“有实现、无对抗性评测”。

### 1.2 本任务要交付什么

按用户要求分两步，**本规格只负责第一阶段“落任务文档”**，后续由 subagent-driven development 按本文分块执行：

1. **先证伪/证明“已有评测仍然能跑通且有效”**：对 evals/retrieval、evals/summary、evals/experience-gene、evals/ingestion、evals/graph-extraction、evals/agent-planning、evals/label-alignment 在**当前代码基**上的可运行性与语义有效性做最小集校准（dry-run + 不依赖 Docker 的结构/类型/边界检查 + 有 DB 时的 smoke 抽检），形成可复现的健康基线报告。
2. **再按“四路检索”模板扩展 Gene 检索评测**：新建独立 suite evals/gene-retrieval/（命名若与现有 evals/experience-gene 冲突，可改为 evals/retrieval-genes/，以 T1 落地时 docs/reference/REPO_STRUCTURE.md 的评审为准），**完整复刻 retrieval 四路的六件套**（types / scenarios / datasets / adapters+normalize / metrics+governance+report / runner+promptfoo+platform-events），但针对 gene 的数据模型与治理语义做定制（solidified vs stale/deprecated、requiredLevel/teamId/scope/labels、supplementaryAvoid 去重、scanExperienceGeneSafety 零容忍）。

### 1.3 权威事实源（发生冲突以此为准）

| 主题 | 权威文件 |
|---|---|
| 检索实现 | packages/service-knowledge-read/src/experience-gene-retrieval.ts、packages/service-knowledge-read/src/experience-gene-routes.ts |
| Gene 契约 | packages/contracts/src/domain/experience-gene.ts、packages/contracts/src/domain/experience-gene-retrieval.ts |
| 选股纯函数 | packages/backend-core/src/knowledge-read/domain/gene-selection.ts（rerankExperienceGeneCandidates / selectExperienceGenes） |
| 治理 SQL | packages/infra/src/vector/pgvector.ts:appendExperienceGeneGovernanceFilters |
| 四路评测金模板 | evals/retrieval/ 全量（尤其 lib/adapters.ts / lib/normalize.ts / lib/metrics.ts / lib/governance*.ts / lib/report.ts / bridge.ts / types/retrieval.ts） |
| 评测基座 | evals/promptfoo/bridge.ts + runner.ts + parity-*.test.ts、evals/scripts/eval-all.ts、scripts/run-postgres-coordinated.ts |
| 宿主组装 | apps/light/src/composition/experience-gene.ts、apps/distributed/src/composition/experience-gene.ts |
| 仓库结构与落点 | docs/reference/REPO_STRUCTURE.md、docs/reference/SYSTEM_TRUTH_SOURCES.md |

---

## 2. 非目标

- 不改动 packages/contracts/src/domain/experience-gene-retrieval.ts 的 GeneSearchQuery/Response shape（本任务只消费契约，不扩契约；确需扩时另起契约变更 tranche）。
- 不改动 packages/service-knowledge-read/src/experience-gene-retrieval.ts 的召回/融合算法本身（只为评测新增可注入的测试 seam，如需 seam，T4 评审时决定是加 deps.embed mock 还是引入 @eval-only helper）。
- 不把 evals/experience-gene/ 的确定性 selectExperienceGenes 模型废弃——新 suite 是**PG 端到端**补充，不是替代；两者在 evals/README.md 中需明确分工。
- 不在两宿主之外新增 gene 路由；off/shadow 返回 disabledExperienceGeneSearchResponse() 的语义视为 feature，不视为 bug。
- 不做 broad 的 doc 全量重写；仅按 docs/guides/DOCUMENTATION_GOVERNANCE.md 回写与本任务直接相关的索引与守卫。

---

## 3. 当前基线 — 四路校对后的证据（读真实代码所得）

> 本节是 4 路校对的**合成结论**，每条均可回溯到附录列出的文件与行号区间。后续 T0 要求把本节的“静态证据”升级为“可复现的执行证据”。

### 3.1 四路检索的金模板长什么样

- **四路 = 四个独立 endpoint slices**（evals/types/retrieval.ts: retrievalEvalEndpointSchema）：/v1/retrieval/search（分桶 globalConstraints/projectKnowledge）、/v1/retrieval/skills/search-by-content（artifact-first matches）、/v2/retrieval/search（capsule-first capsules+profileHints）、/v3/retrieval/search（graph-plan 或 governed fallback + routingTrace）。每个 case 必须显式声明 endpoint，禁止跨端点复用同一 response shape（evals/retrieval/README.md 的"不要统一"约束）。
- **Scenario / Case 分离**：RetrievalEvalScenario 拥有 actor + fixtures（knowledgeEntries/skillArtifacts/graphIndexDocuments），RetrievalEvalCase 通过 scenarioId 引用它并携带 request{seed,maxResults,mode,filters} 与 expected{outcome,relevance,governance,shape}（evals/types/retrieval.ts: retrievalEvalCaseSchema）。一个 scenario 可被 v1/v2/v3 多个 cases 复用，fixture 只在 seedScenarioFixtures 中落库一次（evals/retrieval/lib/adapters.ts:seedScenarioFixtures）。
- **隔离执行**：createExecutionContext() → seedScenarioFixtures() → executeThroughRoute() → closeExecutionContext()（evals/retrieval/lib/adapters.ts + evals/retrieval/lib/execute-case.ts）。buildPostgresComposedServer() 产出 per-case 的 app+pool，closeExecutionContext 做 TRUNCATE + pool.end() 防泄漏；并发度 concurrency()=1（evals/retrieval/bridge.ts:concurrency、evals/promptfoo/types.ts），因所有 cases 共享同一 PG 且依赖 TRUNCATE。
- **归一与指标**：normalizeResponse() 将三类端点的异构响应统一为 NormalizedResult{hits, returnedIds, buckets, profileHintArtifactIds, artifactIds, isEmpty, routingTrace, graphPlanStructure}（evals/retrieval/lib/normalize.ts）。calculateMetrics() 基于 relevantIds/idealOrder 算 hitAt1/5/10,mrr,ndcg,recallAt10（evals/retrieval/lib/metrics.ts），passed = governance.passed && outcomeMatch && graphPlanPassed（evals/retrieval/lib/execute-case.ts:executeRetrievalCase）。
- **治理/形状分离**：evaluateGovernance() 单独检查 forbiddenIds、bucket 形状、profileHints、capsuleCount、graphPlanStructure（evals/retrieval/lib/governance.ts + governance-shared.ts），与 ranking metrics 解耦；forbidden 命中是 hard-fail。
- **报告与 promptfoo**：RunnerSummary 聚合 SliceMetrics + CohortSummary + ModeComparison（evals/retrieval/lib/report.ts），retrievalBridge（evals/retrieval/bridge.ts）把同一 executeRetrievalCase 包进 composedProvider，assertion 仅做 hitAt1/mrr/ndcg 的 namedScores 映射，parity-retrieval.test.ts 保证 --runner native 与 --runner promptfoo 按 case 等价。
- **数据集分层**：evals/retrieval/datasets/smoke/（v1/v2/v3 各 3~6 个）覆盖 positive/empty/forbidden 最小闭环，evals/retrieval/datasets/core/ 扩到 ranked/governance/scope-distribution/profile-hints/bucket-shape/graph-assisted（evals/retrieval/README.md 的 smoke/core 表 + datasets/core/*.ts）。

### 3.2 Gene 检索的真实实现拼图

- **契约**（packages/contracts/src/domain/experience-gene-retrieval.ts）：geneSearchQuerySchema{seed,filters{labels,scopes,teamId},maxResults:1..5,includeActivationHints}，geneSearchResponseSchema{primaryGene: GeneMatch|null, supplementaryAvoid: GeneAvoidWarning[0..3], routingTrace}，disabledExperienceGeneSearchResponse() 在 off/shadow 下返回 primaryGene:null + routingTrace.confidenceScore:0。ExperienceGenePublic 仅暴露 title/signalsMatch/summary/strategy/avoid/constraints/validation/labels/scope/teamId/requiredLevel/updatedAt，隐藏 sourceHash/contentHash/indexing 等内部字段。
- **纯选股**（packages/backend-core/src/knowledge-read/domain/gene-selection.ts）：rerankExperienceGeneCandidates 按 0.6*semantic + 0.4*keyword + exactSignal(0.1)+errorText(0.05)+boundary(0.05)+freshValidation(0.04)+sourceAuthority(trap 0.03>artifact 0.02>capsule 0.01) - missingValidation(0.05) - broadMatch(0.1) 融合，selectExperienceGenes 再做 distinct source + avoid 去重 + 与 primary 冲突去重选最多 3 个 supplementary。isActive 仅 status==='solidified'。
- **PG 召回**（packages/service-knowledge-read/src/experience-gene-retrieval.ts）：keywordRecall 走 ts_rank(websearch_to_tsquery) *5，vectorRecall 走 1-(embedding <=> vector)，两者均经 appendExperienceGeneGovernanceFilters 施加 status='solidified' && p.status='ready' && teamId/requiredLevel/scope/labels。mergeRecallRows 按 gene_id 合并 keyword_score/semantic_score，再经 selectExperienceGenes 产出响应。deps.embed 失败时仅走 keyword 通道（vector==null → vectorRecall=[]）。
- **路由与 tri-state**（packages/service-knowledge-read/src/experience-gene-routes.ts）：POST /internal/retrieval/genes/search（内部直达）与 POST /v1/retrieval/genes/search（外部网关）共用 geneSearchHttpSchema，但外部在 mode==='off'||'shadow' 时短路返回 disabled 且不调 searchGenes（packages/host-local/test/nest/knowledge-read/experience-gene-route-defs.test.ts 对两 adapter 的 tri-state 覆盖）。分布式侧 packages/host-distributed/src/gateway/routes.ts:createExperienceGeneGatewayDeps 代理到 clients.knowledgeRead.searchGenes。
- **现有评测**（evals/experience-gene/）：lib/gene-factory.ts:createEvaluationGene 产出 deterministic 的 ExperienceGene，datasets/smoke.ts 3 cases / datasets/core.ts 10 cases（含 stale/deprecated forbidden、broadMatch penalty、missingValidation、team 隔离），lib/runner.ts:evaluateExperienceGeneSuite 统计 primarySelectionPrecision / knownPitfallAvoidanceRate / safetyViolations(经 scanExperienceGeneSafety) / supplementaryAvoidCount / overconstraintCount / contextTokenCostRatio，mode==='baseline' 时不执行选股（break），promotionEligible 仅在 serve+core+safety0+failures0+precision>=0.8+taskPassRate>=0.68+avoidance>=0.8+overconstraint<=10%+tokenRatio<=1.1 时为 true。

### 3.3 评测基座与“大量调整后仍有效”待证点

- **基座**：evals/scripts/eval-all.ts 串联 retrieval+summary 等，scripts/run-postgres-coordinated.ts:28 要求 docker.sock 可用；evals/promptfoo/runner.ts + bridge.ts 已切到 promptfoo 为默认 runner（evals/retrieval/run.ts:parseArgs_ 的 --runner promptfoo 默认）。pnpm check:docs/check:structure/check:asserts/typecheck 为守卫。
- **待证风险**（需 T0 实测证实）：
  1. pnpm eval:smoke --dry-run 在当前工作区曾因 docker sock 缺失而直接失败（2026-09-06 实测 dial unix /var/run/docker.sock: connect: no such file or directory），并非 eval 逻辑失败，但会阻塞 eval:smoke 作为健康探针。
  2. B 真收敛后的 packages/host-* 真拆与 @trapmap/infra 抽离是否导致 evals/retrieval/lib/adapters.ts 的 buildPostgresComposedServer 导入路径/服务装配漂移（需 T0 的 pnpm check:structure + fallow audit --base main 复核）。
  3. gene 相关表的 pgvector 索引与 experience_gene_search_documents 投影是否在新 schema 下仍与 PgExperienceGeneSearchPort 的 SQL 保持一致（keywordRecall 的 p.document @@ websearch_to_tsquery + vectorRecall 的 <=>）；此一致性只能通过真正的 PG smoke 证明。
  4. evals/experience-gene 的 promotionEligible 在新 scanExperienceGeneSafety 规则（packages/backend-core/src/knowledge-write/domain/experience-gene-safety.ts）下是否仍为 deterministic 1.0（需重跑 pnpm eval:experience-gene --tier core --mode serve）。

### 3.4 文档失真清单（最小口径，随评测同交付）

> 本次仅修正入口索引的**必要失真**（`docs/README.md` 的 active 主线过时）；其余二级文档的旧示例/清单缺项记为 T6 待改，不在本阶段扩面。

- `docs/README.md#当前状态`：称 Gene 仍 active、Panel paused → 真相为 `plan.md` 的 Panel active、Gene 已归档 2026-09-03。**已在本阶段修正**（最小改动，仅当前状态一段）。
- `docs/architecture/components/EVALUATION.md` / `docs/reference/REPO_STRUCTURE.md` / `evals/README.md` / `docs/operations/TESTING.md` 等的旧 `RetrievalTestCase` 示例与评估清单缺 `gene-retrieval`，**记为 T6 随 suite 落地一并回写**，本阶段不扩面。

口径以 `docs/guides/DOCUMENTATION_GOVERNANCE.md` 为准：先权威（`evals/types/*.ts` + `plan.md`）再二级说明最后入口。

---

## 4. 任务分解 — Subagent-Driven Development 切块

> **执行契约**：每个 T 由**全新 subagent** 承接，上下文隔离，写入集合不相交。每个 T 结束后必做**task review**（spec 合规 + 代码质量），全部分支结束后再做一次**broad final review**。详见 ~/.codex/skills/subagent-driven-development/SKILL.md。
>
> **调度顺序**：T0 → T1 → (T2 并行 T4) → T3 → T5 → T6。T0 为门控；T1 产出类型契约后，T2（场景）与 T4（适配/归一）可并行；T3 依赖 T2 的 scenarioIds；T5 依赖 T3 的数据集；T6 依赖全部。

### T0 — 已有评测健康度校准（门控）

- **目标**：在**不改动 eval 逻辑**的前提下，证明或证伪"大量调整后已有评测仍能跑通且有效"，产出可复现的《健康基线报告》，为后续 gene 评测提供可对比的参照系。
- **必读**：
  - evals/retrieval/README.md、evals/experience-gene/lib/runner.ts、evals/scripts/eval-all.ts、scripts/run-postgres-coordinated.ts
  - docs/reference/SYSTEM_TRUTH_SOURCES.md 的 DB/检索/治理权威行、docs/operations/TESTING.md
  - 近期归档：docs/archived/archived-plans/architecture-remediation-mainline-b-true-convergence-archived.md 的 Verification 章
- **交付**：
  - `reports/eval-health-baseline-2026-09-06.md` 的“文档基线”小节：罗列 §3.4 的失真清单在审计时刻的 `check:docs` diff（blocking vs non-blocking 分离）与各二级文档的入口一致性（`docs/README.md` vs `plan.md` 的 active mainline、`EVALUATION.md` 的接口示例 vs `evals/types/retrieval.ts` 的真实 schema、`REPO_STRUCTURE.md` 的评估清单 vs 实际 `evals/` 目录）
  - reports/eval-health-baseline-2026-09-06.md（或 docs/archived/reports/EVAL_HEALTH_BASELINE_2026-09-06.md，以 docs/reference/REPO_STRUCTURE.md 的生成目录规则为准——reports/ 为本地生成，docs/archived/reports/ 为归档 narrative；本任务先落 reports/，T6 归档时再 git mv）
  - 内容：pnpm check:docs / check:structure / typecheck / check:asserts 结果；pnpm eval:smoke --dry-run 与各 suite 的 --dry-run 逐项结果（retrieval/summary/experience-gene/ingestion/graph-extraction/agent-planning/label-alignment）；若本机有 DB，则追加 pnpm eval:smoke 的真实 smoke 通过率与失败 case 归因；若无 DB，则明确记录"因 Docker/DB 门控未跑 live"并附 eval:experience-gene --tier core --mode serve（无 DB 可跑）的 deterministic 报告作为有效性旁证；fallow audit --base main 的边界合规结论。
- **验收**：
  - [ ] pnpm check:docs / check:structure / typecheck（至少 contracts 与 service-knowledge-read 子集）PASS 或失败原因已归档为已知债务
  - [ ] evals/retrieval --tier smoke --dry-run、evals/experience-gene --tier smoke --mode shadow 等离线 dry-run 全部 green（load/validate 阶段无抛错）
  - [ ] 报告含“文档基线”一行已对齐
  - [ ] 报告中明确列出"哪些 suite 在当前基座上是有效健康探针，哪些因 infra 缺失被降级为 dry-run 探针"，并给出后续 T1-T6 的基线对比口径（hitAt1/mrr/ndcg vs primarySelectionPrecision）
- **验证命令（最小集）**：
  ```bash
  pnpm check:docs
  pnpm check:structure
  pnpm typecheck
  pnpm check:asserts
  pnpm exec tsx --tsconfig tsconfig.base.json evals/retrieval/run.ts --tier smoke --dry-run
  pnpm exec tsx --tsconfig tsconfig.base.json evals/experience-gene/run.ts --tier smoke --mode shadow
  pnpm exec tsx --tsconfig tsconfig.base.json evals/experience-gene/run.ts --tier core --mode serve
  # 有 DB 时补：
  pnpm eval:smoke --dry-run 2>&1 | head -n 100
  pnpm exec fallow audit --base main --no-cache 2>&1 | tail -n 30
  ```
- **文件归属**：仅新增 reports/ 与/或 docs/archived/reports/，不改 evals/ 源码；因此与后续 T 无写入冲突。

### T1 — Gene 检索评测契约（Types）

- **目标**：在 evals/types/ 新增 gene 检索评测的**唯一真相契约**，做到"抄四路、但不抄错 gene 语义"。
- **必读**：evals/types/retrieval.ts 全量（尤其 retrievalEvalCaseSchema 的 endpoint/relevance/governance/shape 四段式）、packages/contracts/src/domain/experience-gene-retrieval.ts（geneSearchQuerySchema/responseSchema）、packages/contracts/src/domain/experience-gene.ts（experienceGeneSchema）、evals/experience-gene/types.ts（ExperienceGeneEvalCase 的 expectedGeneId/forbiddenGeneIds/knownAvoidCue 三件套）
- **交付**：
  - 新增文件 evals/types/gene-retrieval.ts：
    - geneRetrievalEvalTierSchema = z.enum(['smoke','core'])
    - geneRetrievalEvalEndpointSchema = z.enum(['/v1/retrieval/genes/search','/internal/retrieval/genes/search'])（是否包含 internal 由评审时 docs/reference/api-surface.md 的网关面决定；若只测外部网关，则仅保留 /v1/retrieval/genes/search）
    - geneRetrievalEvalActorSchema 复用 retrievalEvalActorSchema（subjectType/activeTeamId/securityLevel/permissions），为后续 adapters 的 createActorSession 复用做准备
    - geneRetrievalEvalFixturesSchema{ experienceGenes: z.array(z.unknown()) } — 注意 gene 的 fixture 不是 knowledgeEntries/skillArtifacts，而是可被 createExperienceGeneFixture / createEvaluationGene 序列化的 ExperienceGene 裸对象（schemaVersion: '1'）
    - geneRetrievalEvalScenarioSchema{scenarioId, description, actor, fixtures{experienceGenes, searchDocuments?}, snapshot?}（searchDocuments 为可选的预计算 experience_gene_search_documents 行，便于 vectorRecall 的 deterministic 校验）
    - geneRetrievalEvalRequestSchema 透传 GeneSearchQuery（seed,filters{labels,scopes,teamId},maxResults:1..5）
    - geneRetrievalEvalExpectedSchema{ outcome:'empty'|'non-empty', relevance: { relevantGeneIds, idealOrder? }, governance: { forbiddenGeneIds, forbiddenReasons: ('cross-team'|'security-level'|'lifecycle'|'labels'|'scope')[] }, shape: { expectedPrimaryGeneId?: string, expectedSupplementaryAvoidGeneIds?: string[], expectedPrimaryScoreRange?: [number,number], expectSafetyViolations?: 0, expectedAvoidCue?: string, expectedSourceKind?: 'trap'|'skill-artifact'|'skill-capsule' } } — 与 retrieval 的 shape 差异点：gene 只有一个 primary，不必有 bucket/capsuleCount/graphPlan，新增 supplementaryAvoid 与 safety 形状断言
    - geneRetrievalEvalCaseSchema{ schemaVersion:1, caseId, tier, endpoint, request, scenarioId, expected, tags }
  - 修改 evals/types/index.ts 增 export * from './gene-retrieval.js'
  - 可选但推荐新增 evals/types/gene-retrieval.test.ts：对上述 schema 做 parse 正反例 coverage，仿 evals/types/retrieval.test.ts
- **验收**：
  - [ ] pnpm --filter @trapmap/contracts test 与 pnpm typecheck 绿（本任务不改 contracts，仅引用）
  - [ ] pnpm check:structure / check:docs 不因新增 evals/types 而 fail；fallow audit --base main 无新增跨包违规（evals → contracts/backend-core 为 allowlist）
  - [ ] 如有新增测试，forbiddenGeneIds 与 expectedPrimaryGeneId 为空的 empty-case 能正确 parse
- **验证**：
  ```bash
  pnpm --filter @trapmap/contracts test --run packages/contracts/test/domain/experience-gene-retrieval.test.ts 2>&1 | tail -n 20
  pnpm exec vitest run --project contracts --run evals/types/gene-retrieval.test.ts 2>&1 | tail -n 40
  pnpm typecheck 2>&1 | tail -n 30
  pnpm check:asserts 2>&1 | tail -n 20
  ```
- **文件归属**：evals/types/gene-retrieval.ts + evals/types/index.ts（与 T2-T6 的 evals/gene-retrieval/* 无冲突）。

### T2 — Gene 场景与 Fixtures（Corpus）

- **目标**：按 retrieval 的 smoke-* 场景方法论，构造 gene 的最小但完备的语料基座，覆盖 positive/empty/forbidden 三类 + keyword/semantic 区分 + tri-state 语义。
- **必读**：evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts（smoke-positive-visible / smoke-empty-result / smoke-forbidden / smoke-keyword-dominant / smoke-semantic-dominant / smoke-graph-assisted-v2 的 6 宫格）、evals/experience-gene/lib/gene-factory.ts:createEvaluationGene、packages/backend-core/testing/index.ts:createExperienceGeneFixture、packages/infra/src/vector/pgvector.ts:buildGeneSearchDocument
- **交付**：
  - 新增 evals/gene-retrieval/scenarios/smoke/gene-retrieval-smoke-scenarios.ts：
    - smokeGenePositiveVisibleScenario：team_smoke / level 5 / approved solidified 的单 gene（trap，labels:['docker','deployment']，signalsMatch:['queue retries grow without a dead-letter signal']），artifactId/capsuleId=null，供 positive 非空命中
    - smokeGeneEmptyResultScenario：fixtures.experienceGenes: [] 的真空场景
    - smokeGeneForbiddenScenario：3 个 forbidden 基因——other_team(cross-team)、high_level(requires 8, actor 5)、pending(status:'stale'，即使 isActive false 也应被治理面过滤；另可加 deprecated 与 indexing.status:'failed' 变体，但 smoke 保持 3 个以控制用例数)
    - smokeGeneKeywordDominantScenario：2-3 个 gene 的 signalsMatch 含精确错误文本/文件路径（如 trap-auth-token-replay 的 Token replay containment），用于 keyword precision 校验
    - smokeGeneSemanticDominantScenario：2 个 gene 用不同措辞描述同一故障域（如 types going wrong vs type checking），用于 paraphrase recall
  - 新增 evals/gene-retrieval/scenarios/core/gene-retrieval-core-scenarios.ts：在 smoke 基础上扩 scope: global vs project、labels 多标签、team_platform 专属、validation 有无、sourceKind 三态（trap/artifact/capsule）的更细治理矩阵（至少 4-5 个核心场景）
  - 新增 evals/gene-retrieval/scenarios/index.ts 统一导出 scenarioMap: Map<scenarioId, GeneRetrievalScenario>
  - Fixture 构造一律经 createEvaluationGene / createExperienceGeneFixture 产出 ExperienceGene，并附 buildGeneSearchDocument(gene) 的文档字符串以便 debug
- **验收**：
  - [ ] 每个 scenario.fixtures.experienceGenes[].geneId 全局唯一，teamId 与 requiredLevel 与 actor 的治理意图显式对应（至少能在 code review 时读出"这个 gene 为何应被 forbidden"）
  - [ ] smokeForbiddenScenario 的 3 个 forbidden genes 在 teamId/securityLevel/status 三个维度上正交，不互相掩盖
  - [ ] 场景 parse 过 geneRetrievalEvalScenarioSchema，retrievalEvalScenarioSchema 的 PG 兼容写法（如 mapLifecycleState 对 pending→submitted 的映射）在 gene 侧不复用——gene 的 lifecycle 是 status，需在 adapters 中显式处理 stale/deprecated/failed indexing 的过滤
- **验证**：
  ```bash
  pnpm exec tsx --tsconfig tsconfig.base.json evals/gene-retrieval/scenarios/smoke/gene-retrieval-smoke-scenarios.ts --check 2>&1 | head -n 50
  ```
- **文件归属**：evals/gene-retrieval/scenarios/**。

### T3 — Gene 数据集（Datasets：smoke / core）

- **目标**：为每个场景落在可执行的 case，smoke 保持轻量（6-8 个），core 扩到治理/排序/形状全覆盖（10-14 个），与 retrieval 的 tier 口径对齐。
- **必读**：evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts（v2-capsule-positive-smoke / v2-capsule-empty-smoke / v2-capsule-forbidden-smoke / v2-keyword-* / v2-semantic-* / v2-graph-assisted-*  的 case 写法）、evals/experience-gene/datasets/core.ts（gene-core-database-selection 等 10 个 core cases 的 expectedGeneId/forbiddenGeneIds/knownAvoidCue 三件套）
- **交付**：
  - 新增 evals/gene-retrieval/datasets/smoke/gene-retrieval-smoke.ts：
    - gene-smoke-positive（seed 命中 smokeGenePositiveVisibleScenario 的唯一 gene，expected.outcome:'non-empty', relevance.relevantGeneIds:['gene_smoke_approved'], governance.forbiddenGeneIds:[], shape.expectedPrimaryGeneId:'gene_smoke_approved'）
    - gene-smoke-empty（seed:'xyzzy123 nonexistent' + smokeGeneEmptyResultScenario，outcome:'empty'）
    - gene-smoke-forbidden-cross-team/level/lifecycle（可合为单 case gene-smoke-forbidden 或拆 3 个；推荐 smoke 仅 1 个合集以控数，core 再拆细；seed 取 forbidden genes 的 signals 关键词，relevance.relevantGeneIds 列出 3 个，governance.forbiddenGeneIds 同步 3 个，outcome:'empty'）
    - gene-smoke-keyword-dominant / gene-smoke-semantic-dominant 各 1 个（tags 含 keyword-dominant / semantic-dominant 以便 cohort 切片）
    - gene-smoke-tri-state-shadow（mode:shadow 下无论 seed 如何均 primaryGene:null，outcome:'empty'；此 case 在 adapters 中需短路 disabledExperienceGeneSearchResponse，见 T4）
  - 新增 evals/gene-retrieval/datasets/core/gene-retrieval-core.ts：
    - ranked（多 relevant 的 idealOrder 校验；gene 侧 maxResults:3 时 supplementaryAvoid 的补充排序可作为次要排序证据）
    - governance-core（同 seed 下 teamId 与 requiredLevel 叠加过滤）
    - scope-distribution（scope:global 在 project actor 下可见，project 在 global actor 下不可见的反向校验）
    - labels-filter（filters.labels:['queue'] 命中 / 不命中）
    - supplementary-avoid-shape（expectedSupplementaryAvoidGeneIds 非空，且与 primary 非同源 sourceKey）
    - safety-zero-tolerance（avoid 含禁词的 gene 不得被选中，governance.forbiddenGeneIds 包含它；与 scanExperienceGeneSafety 联动，见 T5）
  - 新增 evals/gene-retrieval/datasets/index.ts 导出 smokeCases/coreCases/allCases 与 caseMap
  - 每个 case 的 tags 至少含 tier:endpoint:queryType 可切片标签（如 ['positive','gene','smoke','keyword-dominant']）
- **验收**：
  - [ ] smoke caseCount 与 scenario 的 fixture 数量自洽（teamId/requiredLevel 与 actor 的交叉矩阵在 code review 时可推导出"为何 expected 为 empty"）
  - [ ] governance.forbiddenGeneIds 与 relevance.relevantGeneIds 的语义分离清晰：后者表示"内容相关但被治理过滤"，前者是硬隔离
  - [ ] 至少 1 个 case 覆盖 supplementaryAvoid（distinct source）与 1 个 case 覆盖 safety（forbidden 含禁词 gene）
  - [ ] z.parse 过 geneRetrievalEvalCaseSchema，loadCases('smoke'|'core') 能正确按 tier/endpoint/tag 过滤
- **验证**：
  ```bash
  pnpm exec tsx --tsconfig tsconfig.base.json evals/gene-retrieval/datasets/smoke/gene-retrieval-smoke.ts --check 2>&1 | head -n 50
  pnpm exec vitest run --project evals evals/gene-retrieval/datasets/gene-datasets.test.ts 2>&1 | tail -n 40
  ```
- **文件归属**：evals/gene-retrieval/datasets/**。

### T4 — 执行适配与归一（Adapters + Normalize + Load + Snapshot）

- **目标**：复刻 evals/retrieval/lib/adapters.ts 的 per-case 隔离 + route 执行 + 归一，但适配 gene 的表模型与 tri-state。
- **必读**：evals/retrieval/lib/adapters.ts 全量（createExecutionContext/createActorSession/seedScenarioFixtures/executeThroughRoute/executeCase）、packages/service-knowledge-read/src/experience-gene-retrieval.ts:keywordRecall/vectorRecall/mergeRecallRows、packages/host-local/src/nest/gateway/gateway.module.ts:createHostLocalExperienceGeneGatewayDefs 的 filter 语义、scripts/testing/postgres-server-composition.ts:buildPostgresComposedServer
- **交付**：
  - 新增 evals/gene-retrieval/lib/adapters.ts：
    - ExecutionContext{ app, pool, sessionToken, actorId, services } 复用 retrieval 的 buildPostgresComposedServer()（共享 @trapmap/backend-core/testing 的 PG composition）
    - seedScenarioFixtures(ctx, scenario)：清空（TRUNCATE experience_genes, experience_gene_search_documents CASCADE）后，按 scenario.fixtures.experienceGenes 逐条 INSERT 到 experience_genes 与 experience_gene_search_documents（document = buildGeneSearchDocument(gene)，embedding 用 embedWithFallback 或测试用确定性向量，status 与 indexing.status 按 gene.status/gene.indexing.status 落库；labels JSONB、team_id/required_level/scope 按 pgvector.ts 的治理列写入）
    - createActorSession(ctx, scenario.actor)：复用 retrieval 的 teamRepo/membershipRepo/sessionRepo 逻辑（team_smoke 等 teams 按需创建，sha256(sessionToken)）
    - executeThroughRoute(ctx, case_)：POST 到 case_.endpoint with Bearer sessionToken + payload: GeneSearchQuery，response.json() 进入 normalizeResponse()；对 status>=400/500 按检索模板记 warnings 并回 isEmpty:true；对 mode: shadow/off 的预期空返回不应记为 degraded
  - 新增 evals/gene-retrieval/lib/normalize.ts：normalizeGeneSearchResponse(response: GeneSearchResponse): NormalizedGeneResult{hits, returnedGeneIds, primaryGeneId, supplementaryAvoidGeneIds, isEmpty, rawResponse, endpoint, routingTrace}。其中 hits 将 primaryGene 与 supplementaryAvoid 统一为 NormalizedHit{id: geneId, score, reason: strategy[0]||avoid[0], scope, teamId}，returnedGeneIds = [primaryGene?.gene.geneId, ...supplementaryAvoid.map(g=>g.geneId)].filter(Boolean)。保留 routingTrace: {selectedMode, routingReason, channelsUsed, confidenceScore, confidenceBucket}。
  - 新增 evals/gene-retrieval/lib/load.ts 与 evals/gene-retrieval/lib/snapshot.ts（若需 live-db 快照，回填 retrieval-db-snapshot 的 gene 版；smoke 阶段可先留 stub，按 evals/retrieval/lib/load.ts 结构抄）
  - 新增 evals/gene-retrieval/lib/execute-case.ts：executeGeneRetrievalCase(case) 串起 createExecutionContext→seed→execute→close，并产出 {result, execution, governance, metrics, passed, warnings}（见 T5 的类型定义）
- **关键分歧决策**（需在 PR description 中显式记录）：
  - gene 的 candidate ingestion 是否经 PgExperienceGeneSearchPort 的 embed() 产出向量：smoke 建议用 embedWithFallback 的 deterministic fallback（避免外网模型依赖）；core 的 vector 通道稳定性由 fallow 不覆盖，需在报告中标注 channelsUsed: ['keyword'] vs ['keyword','semantic'] 的差异。
  - off/shadow 的 disabled 是否视为失败：T3 的 gene-smoke-tri-state-shadow 对 shadow 期望 empty+disabled trace，但 passed 应为 true（按 gateway 的 feature 语义），与 retrieval 的 v1 500 降级不同。
- **验收**：
  - [ ] seedScenarioFixtures 写入的 experience_genes 行在 psql 中 SELECT status, indexing.status, team_id, required_level, labels, scope 与 scenario 的治理意图一致
  - [ ] executeThroughRoute 走 ctx.app.inject() 的真实网关（非 mock），adapterType:'route'，fallbackUsed 仅当 routingTrace.fallbackApplied 时为 true
  - [ ] closeExecutionContext 后无连接泄漏（pool.query('SELECT 1') 在 close 后抛错即为正常）
- **验证**：
  ```bash
  pnpm --filter @trapmap/service-knowledge-read test --run test/experience-gene-retrieval.test.ts 2>&1 | tail -n 40
  pnpm exec vitest run --project evals evals/gene-retrieval/lib/adapters.test.ts 2>&1 | tail -n 60
  ```
- **文件归属**：evals/gene-retrieval/lib/adapters.ts、normalize.ts、load.ts、snapshot.ts、execute-case.ts。

### T5 — 指标、治理与报告（Metrics + Governance + Report + Platform Events）

- **目标**：为 gene 定制有效且不夸大的指标与治理判定，并产出与四路一致的切片/报告与可观测事件。
- **必读**：evals/retrieval/lib/metrics.ts（hitAtK/mrr/ndcg/recallAtK）、evals/retrieval/lib/governance-shared.ts（checkForbiddenHits 等）、evals/retrieval/lib/report.ts（buildRunnerSummary 等）、evals/retrieval/lib/platform-events.ts、evals/experience-gene/lib/runner.ts（primarySelectionPrecision 等）
- **交付**：
  - 新增 evals/gene-retrieval/lib/types.ts：
    - NormalizedGeneResult { hits, returnedGeneIds, primaryGeneId, supplementaryAvoidGeneIds, isEmpty, rawResponse, endpoint, routingTrace }
    - GeneCaseMetrics { hitAt1: 0|1, mrr: 0|1, precision: 0|1 } 将 gene 单选映射为 hitAt1 即 precision
    - GeneGovernanceResult { passed, failures: {kind:'forbidden-hit'|'unexpected-empty'|'unexpected-non-empty'|'safety-violation'|'shape-mismatch'}, forbiddenHits, safetyViolations }
    - GeneCaseResult { case, result, execution, governance, metrics, passed, warnings }
  - 新增 evals/gene-retrieval/lib/metrics.ts：calculateGeneMetrics(result, relevantGeneIds, expectedPrimaryGeneId?)，hitAt1 = returnedGeneIds[0]===expectedPrimary ?1:0（expectedPrimary==='__none__' 时 hitAt1 = isEmpty?1:0），precision 同 hitAt1，mrr 同理。
  - 新增 evals/gene-retrieval/lib/governance.ts：evaluateGeneGovernance(case, result) 检查 forbiddenHits、outcomeMismatch、shape（expectedPrimaryGeneId / expectedSupplementaryAvoidGeneIds / expectedAvoidCue）、safety（scanExperienceGeneSafety 非空即 violation）。
  - 新增 evals/gene-retrieval/lib/report.ts：复刻 buildRunnerSummary 产出 GeneRunnerSummary{ tier, endpoint, caseCount, passedCount, passRate, avgHitAt1/avgMrr/governanceFailures, slices, cohorts }。
  - 新增 evals/gene-retrieval/lib/platform-events.ts：buildGenePlatformEvents(results) 输出与 retrieval 同构的平台事件（suite:'gene-retrieval'）。
- **验收**：
  - [ ] hitAt1 在 empty 用例上定义自洽（expectedPrimary==='__none__' 时 hitAt1 = isEmpty?1:0，避免空集得 0 误伤）
  - [ ] forbidden-hit 与 safety-violation 为硬失败，即使 hitAt1===1 也不得 passed
  - [ ] report 的 passRate/avgHitAt1/governanceFailures 可与 evals/retrieval 的同名字段并表对比
- **验证**：
  ```bash
  pnpm exec vitest run --project evals evals/gene-retrieval/lib/metrics.test.ts evals/gene-retrieval/lib/governance.test.ts 2>&1 | tail -n 40
  pnpm exec vitest run --project evals evals/gene-retrieval/lib/report.test.ts 2>&1 | tail -n 40
  ```
- **文件归属**：evals/gene-retrieval/lib/types.ts、metrics.ts、governance.ts、report.ts、platform-events.ts。

### T6 — Runner、Promptfoo 桥与集成收口

- **目标**：让 gene 评测可被一键运行、被 CI 纳入、被文档检索到，并与四路保持 runner 一致性。
- **必读**：evals/retrieval/run.ts（parseArgs_ 等）、evals/retrieval/bridge.ts（retrievalBridge: SuiteBridge 的 composedProvider/dryRunMode:skip/concurrency:1）、evals/promptfoo/bridge.ts + runner.ts、evals/scripts/eval-all.ts（Tier 分发与 platform 发布）、package.json:scripts.eval:*
- **交付**：
  - **文档回写（最小）**：`docs/architecture/components/EVALUATION.md` 增 Gene 小节、`docs/operations/TESTING.md` 增 Gene 行、`docs/reference/REPO_STRUCTURE.md`/`evals/README.md` 增清单（随 suite 落地，T6 一并提交）
  - 新增 evals/gene-retrieval/run.ts：--tier smoke|core --endpoint /v1/retrieval/genes/search --dry-run --json --json-path --verbose，loadCases(tier, endpoint) → executeGeneRetrievalCase 串行（concurrency 1）→ buildGeneRunnerSummary → writeJsonSummary；--dry-run 时仅 load+validate 不触 DB。
  - 新增 evals/gene-retrieval/bridge.ts：geneRetrievalBridge: SuiteBridge，dryRunMode:'skip'，buildProvider 包 executeGeneRetrievalCase，buildAssertions 复用 hitAt1/mrr/precision 的 namedScores，mapResult: assertResultPresent，concurrency:1，并 registerBridge。
  - 可选新增 evals/promptfoo/parity-gene-retrieval.test.ts：保证 --runner native 与 --runner promptfoo 在 gene 上的逐 case 等价。
  - 修改 evals/scripts/eval-all.ts 增 gene-retrieval 分支，package.json 增 eval:gene-retrieval、eval:gene-retrieval:smoke、eval:gene-retrieval:dry-run 三脚本；是否纳入 eval:smoke 由评审时决定。
  - 新增 evals/gene-retrieval/README.md：明确 deterministic evals/experience-gene vs PG evals/gene-retrieval 的分工、tri-state 与治理过滤行为、一键运行入口。
  - 按需在 docs/reference/api-surface.md 的 gene 行补充"已由 evals/gene-retrieval 覆盖"标记。
- **验收**：
  - [ ] pnpm eval:gene-retrieval --tier smoke --dry-run 在无 DB 机器上可通过（仅 load/validate）
  - [ ] promptfoo runner 与 native 的 buildDryRunResult 等价
  - [ ] `pnpm check:docs` blocking 全绿
  - [ ] pnpm check:docs / check:structure 绿；fallow audit --base main 无新增边界违规
  - [ ] evals/README.md 的 suite 表增 gene-retrieval 一行，docs/todos/README.md 增本任务完成后的归档指引
- **验证**：
  ```bash
  pnpm exec tsx --tsconfig tsconfig.base.json evals/gene-retrieval/run.ts --tier smoke --dry-run 2>&1 | tail -n 40
  pnpm check:docs 2>&1 | tail -n 30
  pnpm check:structure 2>&1 | tail -n 30
  # 有 DB 时补：
  pnpm exec tsx --tsconfig tsconfig.base.json scripts/run-postgres-coordinated.ts -- pnpm exec tsx --tsconfig tsconfig.base.json evals/gene-retrieval/run.ts --tier smoke 2>&1 | tail -n 80
  ```
- **文件归属**：evals/gene-retrieval/run.ts、bridge.ts、evals/promptfoo/parity-gene-retrieval.test.ts、package.json、evals/README.md、evals/gene-retrieval/README.md。

---

## 5. 全局执行约束

- **类型/契约**：新增枚举/字面量联合/共享接口默认落 packages/contracts/src/enum-types/ 或 evals/types/（本任务仅后者）；禁止在 evals/ 内重复实现 @trapmap/lib 已有的 nowIso/sha256/uniq 等工具（AGENTS.md 通用执行约束）。
- **断言禁令**：禁止新增 @ts-ignore/@ts-expect-error 与裸 as never/as unknown as（pnpm check:asserts 门禁）。
- **架构边界**：跨包导入变更后必跑 pnpm exec fallow audit --base main（zone 规则见 docs/architecture/BOUNDARIES.md）；evals → packages 只能经 @trapmap/* 包名、packages/contracts/**、host-local allowlist 或 @eval-only 模块。
- **测试基座**：根 pnpm test 为全量 multi-project，禁止 pnpm test 2>&1 | tail 的截断式排查；单文件用 pnpm test:file -- <path>，单包用 pnpm --filter @trapmap/<pkg> test --run <path>（AGENTS.md Vitest 使用要求）。
- **数据库与并发**：所有 PG 评测 concurrency=1 且串行 TRUNCATE；scripts/run-postgres-coordinated.ts 要求 docker.sock，CI 侧由 eval:smoke 的 Postgres 服务提供，本地无 Docker 时以 --dry-run 作为健康探针降级。
- **通用工具**：新增通用函数仅当多包消费时才入 @trapmap/lib，单包专用留包内。

---

## 6. 验证矩阵（Task → 必跑命令）

| Task | 最小验证 | 何时补全量/门控 |
|---|---|---|
| T0 | check:docs / check:structure / typecheck / check:asserts / retrieval --dry-run / experience-gene --mode serve | 有 DB 时补 eval:smoke --dry-run 与 fallow audit |
| T1 | contracts: test:domain/experience-gene-retrieval / typecheck / check:asserts | check:structure |
| T2 | gene-retrieval 场景 parse（如有测试） | check:docs（场景描述被文档引用时） |
| T3 | gene-datasets.test（parse 覆盖） | retrieval-datasets.test 的对照阅读 |
| T4 | service-knowledge-read: experience-gene-retrieval.test + gene-retrieval/lib/adapters.test | 有 DB 时 eval:gene-retrieval --tier smoke 的 PG 冒烟 |
| T5 | gene-retrieval/lib/{metrics,governance,report}.test + scanExperienceGeneSafety 单测 | eval:smoke 的并表校验 |
| T6 | gene-retrieval --dry-run + parity-gene-retrieval.test + check:docs/check:structure | 有 DB 时 eval:gene-retrieval --tier core + eval:smoke 的 CI 全绿 |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| embedWithFallback 的外部 embedding 不可用导致 vector 通道 flaky | channelsUsed 仅 keyword，core 的 semantic 用例误判为回归 | smoke 固定走 keyword 通道；core 的 semantic 用例在 adapters 中注入 deterministic 测试向量，并标注 vectorFallback:true |
| off/shadow 的 disabled envelope 被误判为失败 | smoke 的 governance 误报 | T3 的 shadow 用例 outcome:'empty' 且 governance.forbiddenGeneIds:[]，T5 的 outcomeMismatch 对 shadow 做白名单 |
| experience_genes 与 experience_gene_search_documents 的双表 TRUNCATE 顺序/外键 | adapters 的 seed 在 CI 并发下偶发 FK violation | 按 evals/retrieval/lib/adapters.ts 的 TRUNCATE ... CASCADE 写法照抄 |
| fallow audit 将 evals/gene-retrieval → backend-core/testing 判为违规 | T1/T4 卡门禁 | 仅经 @trapmap/backend-core/testing 包名导入，或在 evals/ 内加 @eval-only 标记的 thin wrapper |
| 本地无 Docker 导致 T0 健康基线无法产出 PG smoke | 任务被误标为 blocked | T0 明确"无 Docker 时以 dry-run + deterministic core 为降级健康探针"，并在报告中显式标注 DB-gated: skipped |

---

## 8. 术语与不变量

- **Solidified 唯一活跃**：gene.status==='solidified' && indexing.status==='ready' 才可被召回；stale/deprecated/failed 的 forbidden 与 lifecycle 治理等价（packages/backend-core/src/knowledge-read/domain/gene-selection.ts:isActive）。
- **Governance 四维**：teamId（IS NULL 为 global）+ requiredLevel <= actor.maxRequiredLevel + scope 属于 filters.scopes + labels 包含 filters.labels（packages/infra/src/vector/pgvector.ts:appendExperienceGeneGovernanceFilters）。四维任一不满足即 forbidden。
- **Supplementary 去重**：与 primary 同 sourceKey 或 avoid 冲突的候选不得入 supplementaryAvoid（gene-selection.ts:sourceKey/conflictsWithPrimary）。
- **Safety 零容忍**：scanExperienceGeneSafety(gene).length>0 直接 safety-violation，不论 ranking。

---

## 附录 A — 校对覆盖的真实文件清单（可复核）

| 路径 | 校对要点 |
|---|---|
| evals/retrieval/lib/types.ts | AdapterType/ExecutionMetadata/NormalizedResult 等 |
| evals/retrieval/lib/adapters.ts | mapLifecycleState、seedScenarioFixtures 的 TRUNCATE+graph rebuild、createActorSession、executeThroughRoute 的 inject+normalize |
| evals/retrieval/lib/normalize.ts | normalizeV1/V1SkillLookup/V2/V3 → NormalizedResult |
| evals/retrieval/lib/metrics.ts | hitAtK/mrr/ndcg/recallAtK/calculateMetrics |
| evals/retrieval/lib/governance.ts + governance-shared.ts | evaluateGovernance 的五检 |
| evals/retrieval/lib/report.ts | buildRunnerSummary/buildSliceSummary/buildCohortSummaries |
| evals/retrieval/lib/execute-case.ts | executeRetrievalCase 的 governance+metrics+graphPlan+outcomeMatch |
| evals/retrieval/bridge.ts | retrievalBridge: SuiteBridge 的 composedProvider/dryRunMode:skip/concurrency:1 |
| evals/retrieval/run.ts | parseArgs_ 的 --endpoint/--runner promptfoo 默认 |
| evals/types/retrieval.ts | retrievalEvalCaseSchema 四段式 |
| evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts | v2 smoke case 写法 |
| evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts | 6 宫格场景 |
| packages/contracts/src/domain/experience-gene-retrieval.ts | geneSearchQuerySchema/responseSchema/disabledExperienceGeneSearchResponse |
| packages/contracts/src/domain/experience-gene.ts | experienceGeneSchema 的 12 字段 |
| packages/backend-core/src/knowledge-read/domain/gene-selection.ts | GENE_*_WEIGHT/BOOST/PENALTY、rerank/select 融合公式 |
| packages/service-knowledge-read/src/experience-gene-retrieval.ts | keywordRecall/vectorRecall/mergeRecallRows |
| packages/service-knowledge-read/src/experience-gene-routes.ts | toExperienceGeneSearchContext 的 teamId 校验 + off/shadow 短路 |
| packages/infra/src/vector/pgvector.ts | appendExperienceGeneGovernanceFilters |
| packages/host-local/src/nest/gateway/gateway.module.ts | createHostLocalExperienceGeneGatewayDefs |
| apps/light/src/composition/experience-gene.ts | createLightExperienceGeneAssembly |
| evals/experience-gene/datasets/core.ts | gene-core-* 10 个 deterministic core cases |
| evals/experience-gene/lib/gene-factory.ts | createEvaluationGene |
| evals/experience-gene/lib/runner.ts | evaluateExperienceGeneSuite 的 promotionEligible 七门控 |
| package.json:scripts | eval:smoke 等的 run-postgres-coordinated 链 |
| docs/todos/README.md | active surface 判定 |
| docs/reference/SYSTEM_TRUTH_SOURCES.md | Experience Gene 权威行 |

---

## 附录 B — 四路 vs Gene 评测的“抄”与“改”对照

| 维度 | 四路（evals/retrieval） | Gene（evals/gene-retrieval，T1-T6 落点） | 改动原因 |
|---|---|---|---|
| endpoint | 4 个（v1/v2/v3/skill-lookup） | 1-2 个（/v1/retrieval/genes/search 必有） | gene 只有一个原生检索面 |
| request | RetrievalQuery 等 | GeneSearchQuery{seed,filters{labels,scopes,teamId},maxResults:1..5} | 契约不同 |
| scenario fixtures | knowledgeEntries/skillArtifacts/graphIndexDocuments | experienceGenes: ExperienceGene[] | 表模型不同 |
| 治理维度 | team/scope/level/labels + lifecycle | 同四维 + status/indexing | gene 的活跃判定更严格 |
| 响应 shape | 分桶/胶囊/图计划三态 | primaryGene + supplementaryAvoid[0..3] + routingTrace + safety | gene 是单选+补充避坑 |
| 指标 | hitAt1/mrr/ndcg/recall@10 | hitAt1/mrr/precision + safetyViolations | gene 的 ranking 退化为精确匹配 |
| tri-state | 无 | off/shadow 期望 empty+disabled trace 为 PASS | gateway 的 rollout feature |

---

## 附录 C — 落库后的待办

- 本规格落 docs/todos/gene-retrieval-eval.md 后，不自动成为 plan.md 的 mainline；进入执行前需在 docs/todos/README.md 增 active detail 行，并在 plan.md 的「当前主线」旁注并行 detail。
- T6 完成且 PG smoke 绿后，再补 docs/archived/reports/EVAL_GENE_RETRIEVAL_CLOSEOUT_*.md 的 closeout，并按归档规则 git mv → docs/archived/archived-plans/。
- 归档前必跑：pnpm check:docs、pnpm check:structure、pnpm exec fallow audit --base main --no-cache。

