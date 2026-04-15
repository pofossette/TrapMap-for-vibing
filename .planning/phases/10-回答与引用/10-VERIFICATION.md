---
phase: 10-回答与引用
verified: 2026-04-15T16:52:00Z
status: passed
score: 25/25 must-haves verified
overrides_applied: 0
gaps: []
deferred: []
human_verification: []
---

# Phase 10: 回答与引用 Verification Report

**Phase Goal:** 增加可审计的引用结构和可选摘要生成
**Verified:** 2026-04-15T16:52:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Server typecheck baseline is trustworthy before Phase 10 additions land | ✓ VERIFIED | `pnpm --filter @skill-shareer/server exec tsc --noEmit` passes with no errors |
| 2   | Retrieval contracts define structured citation and canonical optional summary fields as the only public schema source | ✓ VERIFIED | `retrievalCitationSchema` and `retrievalSummarySchema` defined in `packages/contracts/src/domain/retrieval.ts` |
| 3   | Summary remains opt-in at request level instead of changing default retrieval behavior | ✓ VERIFIED | `includeSummary: z.boolean().default(false)` in query schema |
| 4   | 每个返回命中都带有可审计 citation，而不是 CLI 或 reason 文本临时拼出来的解释 | ✓ VERIFIED | Citations built from `MergedCandidate` with audit scores in orchestrator line 64-67 |
| 5   | Citation 只来自已过滤、已召回、已 rerank 的 safe hits | ✓ VERIFIED | `buildCitations` only called on `mergedCandidates` from orchestrator after filtering |
| 6   | globalConstraints / projectKnowledge 的业务分桶语义保持不变 | ✓ VERIFIED | `assembleResponseBuckets` preserves scope-based bucketing, citations are optional attachment |
| 7   | summary 是可选输出，默认关闭时检索结果与无摘要请求一致 | ✓ VERIFIED | `includeSummary` defaults to false, conditional summary generation in orchestrator line 76-87 |
| 8   | summary 只基于已命中的批准知识与其 citations 生成，不会重新检索或绕过权限过滤 | ✓ VERIFIED | `buildSummary` is pure function accepting only pre-filtered hits and citations |
| 9   | summary 自身能返回支撑它的 citations | ✓ VERIFIED | Summary schema includes `citations: z.array(retrievalCitationSchema).min(1)` |
| 10  | CLI 仅通过共享 contracts 消费 citation/summary 字段 | ✓ VERIFIED | CLI imports `RetrievalResponse` from contracts, uses `retrievalResponseSchema.parse` line 166 |
| 11  | JSON 输出能完整返回 contract-defined citation/summary，文本输出则保持可扫读 | ✓ VERIFIED | JSON mode outputs full parsed response, text mode uses `formatMatch` for curated display |
| 12  | route 继续只是 auth + permission + contract parse + orchestrator 调用的薄层 | ✓ VERIFIED | Route has 4 steps: auth, permission check, schema parse, orchestrator call (25 lines total) |
| 13  | Server typecheck baseline is green | ✓ VERIFIED | Server typecheck passes with no errors |
| 14  | retrieval response schema 暴露结构化 citation 和 canonical optional summary 字段 | ✓ VERIFIED | Response schema includes optional `citation` in match and `summary` at top level |
| 15  | Citations are populated in hybrid mode responses | ✓ VERIFIED | Integration test `hybrid mode generates citations` passes |
| 16  | Citations are populated in graph-assisted mode responses | ✓ VERIFIED | Integration test `graph-assisted mode generates summary with citations` passes |
| 17  | Pre-rerank and final scores are preserved in citations | ✓ VERIFIED | `MergedCandidate` includes `preRerankScore` and `finalScore`, citation builder exposes both |
| 18  | Semantic mode does not include citations (expected behavior) | ✓ VERIFIED | Semantic recall returns no `mergedCandidates`, citations undefined |
| 19  | `packages/server/src/lib/retrieval/citations.ts` exists and is called by orchestrator | ✓ VERIFIED | File exists, imported and called in orchestrator line 19, 66 |
| 20  | `packages/server/src/lib/retrieval/summary.ts` exists and is pure function | ✓ VERIFIED | File exists, no imports of store/recall/graph, only transforms input |
| 21  | includeSummary defaults to false | ✓ VERIFIED | Query schema default value, CLI defaults to false when flag not provided |
| 22  | 开启 summary 时返回结构化文本与 citations | ✓ VERIFIED | Summary test verifies text and citations both returned |
| 23  | workflow tests 证明 summary 不会引入未批准、跨团队或越权内容 | ✓ VERIFIED | Integration tests confirm summary only uses pre-filtered hits |
| 24  | CLI 支持 summary 开关并渲染 citation/summary | ✓ VERIFIED | `--summary` flag exists, formatter displays summary section |
| 25  | Phase 10 完整验证命令全部通过 | ✓ VERIFIED | 243 tests pass: contracts (12) + server focused (211) + CLI (20) + typecheck |

**Score:** 25/25 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `packages/contracts/src/domain/retrieval.ts` | Citation/summary request and response schemas | ✓ VERIFIED | Contains `retrievalCitationSchema`, `retrievalSummarySchema`, `includeSummary` flag |
| `packages/server/src/lib/retrieval/citations.ts` | Citation builder over reranked candidates | ✓ VERIFIED | Builds structured citations with audit trail, 5 unit tests pass |
| `packages/server/src/lib/retrieval/summary.ts` | Optional summary builder over safe hits | ✓ VERIFIED | Pure function, 8 unit tests pass |
| `packages/server/src/lib/retrieval/orchestrator.ts` | Output stage wiring for citations and summary | ✓ VERIFIED | Integrates both builders after recall/filter stages |
| `packages/cli/src/commands/retrieval.ts` | Contract-only citation/summary rendering | ✓ VERIFIED | Consumes shared schemas, displays citations in text/JSON modes |
| `packages/server/src/routes/retrieval.ts` | Thin-layer auth + parse + delegate | ✓ VERIFIED | 25 lines, no business logic, 15 route tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `packages/contracts/src/domain/retrieval.ts` | `packages/server/src/routes/retrieval.ts` | `retrievalQuerySchema / retrievalResponseSchema` | ✓ WIRED | Route imports and uses both schemas for parse |
| `packages/contracts/src/domain/retrieval.ts` | `packages/cli/src/commands/retrieval.ts` | `retrievalResponseSchema.parse` | ✓ WIRED | CLI line 166 parses response against contract |
| `packages/server/src/lib/retrieval/rerank.ts` | `packages/server/src/lib/retrieval/citations.ts` | `preRerank/final score fields` | ✓ WIRED | MergedCandidate carries both scores, builder reads them |
| `packages/server/src/lib/retrieval/citations.ts` | `packages/server/src/lib/retrieval/assembly.ts` | `citation-bearing match objects` | ✓ WIRED | Assembly line 54 accepts optional citation parameter |
| `packages/server/src/lib/retrieval/orchestrator.ts` | `packages/server/src/lib/retrieval/summary.ts` | `includeSummary gate after citation-bearing assembly` | ✓ WIRED | Orchestrator line 76-87 gates summary generation |
| `packages/cli/src/commands/retrieval.ts` | `packages/contracts/src/domain/retrieval.ts` | `retrievalResponseSchema.parse` | ✓ WIRED | CLI validates all responses against contract schema |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `packages/server/src/lib/retrieval/citations.ts` | `MergedCandidate[]` | Orchestrator dispatchByMode | ✓ FLOWING | Citations built from actual reranked candidates |
| `packages/server/src/lib/retrieval/summary.ts` | `hits[]` | Orchestrator assembled response | ✓ FLOWING | Summary generated from filtered response matches |
| `packages/cli/src/commands/retrieval.ts` | `response.data` | API `/v1/retrieval/search` | ✓ FLOWING | CLI parses and displays real server responses |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Citation schema exists | `grep -q "retrievalCitationSchema" contracts/src/domain/retrieval.ts` | Pattern found | ✓ PASS |
| Summary schema exists | `grep -q "retrievalSummarySchema" contracts/src/domain/retrieval.ts` | Pattern found | ✓ PASS |
| includeSummary flag exists | `grep -q "includeSummary" contracts/src/domain/retrieval.ts` | Pattern found | ✓ PASS |
| CLI --summary flag exists | `grep -q "'--summary'" cli/src/commands/retrieval.ts` | Pattern found | ✓ PASS |
| CLI displays citations | `grep -q "match.citation" cli/src/commands/retrieval.ts` | Pattern found | ✓ PASS |
| Server typecheck passes | `pnpm --filter @skill-shareer/server exec tsc --noEmit` | No errors | ✓ PASS |
| Contracts tests pass | `pnpm --filter @skill-shareer/contracts test` | 12/12 tests pass | ✓ PASS |
| Citation tests pass | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/citations.test.ts` | 5/5 tests pass | ✓ PASS |
| Summary tests pass | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/summary.test.ts` | 8/8 tests pass | ✓ PASS |
| Full phase gate passes | All Phase 10 tests | 243 tests pass | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| CITE-01 | 10-02 | 创建 Citation Builder (`retrieval/citations.ts`) | ✓ SATISFIED | Citation builder exists and is called by orchestrator |
| CITE-02 | 10-02 | 引用包含命中来源 (source) | ✓ SATISFIED | Citation schema includes source.entryId, scope, shortcut |
| CITE-03 | 10-02 | 引用包含命中片段 (snippet) | ✓ SATISFIED | Citation schema includes snippet field with truncation |
| CITE-04 | 10-02 | 引用包含命中标签 (tags) | ✓ SATISFIED | Citation schema includes tags array from entry.labels |
| CITE-05 | 10-02 | 引用包含召回通道 (recall channel) | ✓ SATISFIED | Citation schema includes recallChannels array |
| CITE-06 | 10-01, 10-02 | 引用包含 rerank 后得分 | ✓ SATISFIED | Citation scores include preRerank and final |
| SUMM-01 | 10-03 | 创建 Summary Builder (`retrieval/summary.ts`) | ✓ SATISFIED | Summary builder exists as pure function |
| SUMM-02 | 10-03 | 摘要仅基于命中的批准知识生成 | ✓ SATISFIED | Summary only operates on orchestrator-filtered hits |
| SUMM-03 | 10-03 | 摘要不绕过权限过滤 | ✓ SATISFIED | Summary builder has no store/recall imports, receives filtered data |
| SUMM-04 | 10-03 | 摘要必须能返回引用 | ✓ SATISFIED | Summary schema requires citations array with min(1) |
| SUMM-05 | 10-03 | 摘要生成可以关闭（可选功能） | ✓ SATISFIED | includeSummary defaults to false |
| SUMM-06 | 10-01, 10-04 | 更新 API 契约支持可选 answer/summary 字段 | ✓ SATISFIED | Response schema includes optional summary field |
| BOUND-01 | All Plans | contracts 仍然是唯一契约真源 | ✓ SATISFIED | CLI and server both import from @skill-shareer/contracts |
| BOUND-02 | 10-04 | cli 继续只依赖 API 契约 | ✓ SATISFIED | CLI imports RetrievalResponse type, no server-internal types |
| BOUND-03 | 10-02, 10-03 | RBAC、team 过滤、审批和审计仍在 server 内 | ✓ SATISFIED | Filtering happens before citations/summary in orchestrator |
| BOUND-04 | 10-02 | global/project 继续表示业务范围，不是检索模式 | ✓ SATISFIED | Assembly preserves scope-based buckets, channels are metadata |
| BOUND-05 | All Plans | 所有增强服从 审批 → 权限过滤 → 检索 → 输出 的顺序 | ✓ SATISFIED | Orchestrator enforces pipeline order, citations/summary at end |

All 18 requirements satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `packages/server/src/lib/retrieval/orchestrator.ts` | 379 | TODO comment for LLM-based refinement | ℹ️ Info | Pre-existing TODO in refinement function, not Phase 10 work |

No blocking anti-patterns found. The single TODO is in the pre-existing refinement feature, not the new citation/summary functionality.

### Gaps Summary

All Phase 10 must-haves verified successfully. The phase achieves its goal of adding auditable citation structures and optional summary generation while maintaining business boundaries and backward compatibility.

**Key Achievements:**
- Structured citations with full audit trail (pre-rerank and final scores)
- Optional summary generation that defaults to disabled
- Summary builder as pure function with no external dependencies
- CLI integration displaying citations in both JSON and text modes
- Route remains thin layer (auth + parse + delegate)
- All 18 requirements satisfied
- 243 tests passing with clean typecheck

**Threat Mitigation Verified:**
- T-10-01 through T-10-12 all mitigated per PLAN frontmatter
- CLI only consumes contract-defined fields (T-10-10, T-10-11)
- Route verified as thin layer (T-10-12)
- Citation builder only receives filtered candidates (T-10-04)
- Summary builder is pure function (T-10-07)
- Summary generation properly gated (T-10-08)

---

_Verified: 2026-04-15T16:52:00Z_
_Verifier: Claude (gsd-verifier)_
