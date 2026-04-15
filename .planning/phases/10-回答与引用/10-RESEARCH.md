# Phase 10: 回答与引用 - Research

**Researched:** 2026-04-15 [VERIFIED: system date]  
**Domain:** 可审计引用结构与可选摘要生成，建立在已实现的检索编排、混合召回、索引生命周期和图辅助召回之上 [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/phases/09-图辅助检索/VERIFICATION.md]  
**Confidence:** MEDIUM [VERIFIED: current codebase and test baseline were reviewed] [ASSUMED: Phase 10 can satisfy summary quality requirements with deterministic extractive summarization before any provider-backed generation]

## User Constraints

- 本阶段必须覆盖 `CITE-01`..`CITE-06`、`SUMM-01`..`SUMM-06`、`BOUND-01`..`BOUND-05`。 [VERIFIED: .planning/REQUIREMENTS.md]
- 本阶段没有 `CONTEXT.md`，研究范围只能依赖 roadmap、requirements、既有 phase artifacts 和当前代码库。 [VERIFIED: user prompt] [VERIFIED: .planning/phases/10-回答与引用 directory contains no `*-CONTEXT.md`]
- contracts 必须继续是唯一契约真源。 [VERIFIED: user prompt] [VERIFIED: .planning/REQUIREMENTS.md]
- CLI 必须继续只依赖 API contracts。 [VERIFIED: user prompt] [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/cli/src/commands/retrieval.ts]
- 必须保持顺序：`approval -> permission/team filtering -> retrieval -> output`。 [VERIFIED: user prompt] [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
- Summary 只能消费已经批准且已经过滤后的命中结果，不能直接读取原始 store 快照重新检索。 [VERIFIED: user prompt] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [ASSUMED: the cleanest enforcement is to make Summary Builder accept only assembled hits/citations]
- Summary 生成必须是可选的，并且摘要结果必须能返回 citations。 [VERIFIED: user prompt] [VERIFIED: .planning/REQUIREMENTS.md]
- Citation 必须以可审计方式暴露 `source`、`snippet`、`tags`、`recall channel` 和 `rerank/final score`。 [VERIFIED: user prompt] [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md]
- Phase 10 依赖 Phase 8 和 Phase 9，必须沿用其已建立的 seam，而不是重开 retrieval 架构。 [VERIFIED: user prompt] [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/phases/09-图辅助检索/VERIFICATION.md]
- `## Validation Architecture` 是本研究文档必需章节。 [VERIFIED: user prompt] [VERIFIED: .planning/config.json]

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CITE-01 | 创建 Citation Builder (`retrieval/citations.ts`) [VERIFIED: .planning/REQUIREMENTS.md] | 把引用构建放在 rerank 之后、assembly 之前，直接消费带 channel evidence 的内部候选，而不是在 CLI 或 route 层二次拼接。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/merge.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts] |
| CITE-02 | 引用包含命中来源 (`source`) [VERIFIED: .planning/REQUIREMENTS.md] | `source` 应直接来自已命中的知识条目字段，如 `entryId`、`scope`、`shortcut`，并保留业务范围分桶。 [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/assembly.ts] |
| CITE-03 | 引用包含命中片段 (`snippet`) [VERIFIED: .planning/REQUIREMENTS.md] | `snippet` 应由已命中的 `shortcut/detail/labels` 提取，不应触发新的召回或读取未命中条目。 [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/types.ts] [ASSUMED: deterministic snippet extraction is sufficient for baseline]
| CITE-04 | 引用包含命中标签 (`tags`) [VERIFIED: .planning/REQUIREMENTS.md] | 直接复用 `labels`，避免 CLI 或 summary 层重复推导。 [VERIFIED: packages/contracts/src/domain/retrieval.ts]
| CITE-05 | 引用包含召回通道 (`recall channel`) [VERIFIED: .planning/REQUIREMENTS.md] | 复用 `MergedCandidate.channels`，并在公开契约中以审计字段暴露。 [VERIFIED: packages/server/src/lib/retrieval/types.ts] [VERIFIED: packages/server/src/lib/retrieval/merge.ts] |
| CITE-06 | 引用包含 rerank 后得分 [VERIFIED: .planning/REQUIREMENTS.md] | 当前 `combinedScore` 在 rerank 中被覆盖，Phase 10 需要保留 pre-rerank 与 post-rerank/final score，避免审计歧义。 [VERIFIED: packages/server/src/lib/retrieval/types.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts] |
| SUMM-01 | 创建 Summary Builder (`retrieval/summary.ts`) [VERIFIED: .planning/REQUIREMENTS.md] | Summary Builder 应作为 server-internal output stage，位于 citations/assembly 之后。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [ASSUMED: summary builder can consume flattened assembled matches]
| SUMM-02 | 摘要仅基于命中的批准知识生成 [VERIFIED: .planning/REQUIREMENTS.md] | 仅接收 orchestrator 已过滤、已召回、已排序的结果集合。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
| SUMM-03 | 摘要不绕过权限过滤 [VERIFIED: .planning/REQUIREMENTS.md] | Summary Builder 不应访问 `services.store.snapshot()` 或任何 recall helper。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [ASSUMED: a pure function builder is the safest design]
| SUMM-04 | 摘要必须能返回引用 [VERIFIED: .planning/REQUIREMENTS.md] | `summary` 应返回结构化对象，至少包含 `text` 和 `citations`。 [VERIFIED: user prompt] [ASSUMED]
| SUMM-05 | 摘要生成可以关闭 [VERIFIED: .planning/REQUIREMENTS.md] | 请求 contract 需要显式 summary 开关；默认值应保持不生成摘要。 [VERIFIED: packages/contracts/src/domain/retrieval.ts] [ASSUMED: default false is the least surprising for a new optional feature]
| SUMM-06 | 更新 API 契约支持可选摘要字段（需求原文写作 `answer/summary`） [VERIFIED: .planning/REQUIREMENTS.md] | 按本研究决议，shared contract 采用单一 canonical `summary` schema，并让 CLI 只消费这些 contract 变化。 [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/cli/src/commands/retrieval.ts] |
| BOUND-01 | contracts 仍然是唯一契约真源 [VERIFIED: .planning/REQUIREMENTS.md] | 所有新字段必须先落在 `packages/contracts/src/domain/retrieval.ts`。 [VERIFIED: packages/contracts/src/domain/retrieval.ts]
| BOUND-02 | cli 继续只依赖 API 契约 [VERIFIED: .planning/REQUIREMENTS.md] | CLI 只能根据新增 contract 字段渲染 citation/summary，不读取 server-internal types。 [VERIFIED: packages/cli/src/commands/retrieval.ts]
| BOUND-03 | RBAC、team 过滤、审批和审计仍在 server 内 [VERIFIED: .planning/REQUIREMENTS.md] | Citation Builder 和 Summary Builder 必须位于 server retrieval pipeline 内部，并只处理 safe hits。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
| BOUND-04 | global/project 继续表示业务范围，不是检索模式 [VERIFIED: .planning/REQUIREMENTS.md] | 引用字段不应改变 `globalConstraints` / `projectKnowledge` 的含义。 [VERIFIED: packages/server/src/lib/retrieval/assembly.ts]
| BOUND-05 | 所有增强服从 `审批 -> 权限过滤 -> 检索 -> 输出` 的顺序 [VERIFIED: .planning/REQUIREMENTS.md] | Phase 10 只能扩展 output stage，不能把 summary/citation 前推到 filtering 或 recall 前。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

## Summary

Phase 10 的干净接缝已经在当前代码里存在，但还没有被用于可审计输出。`searchKnowledge()` 现在明确执行 `filterEligibleEntries(...) -> dispatchByMode(...) -> assembleResponseBuckets(...) -> optional refinement`，而 `global/project` 分桶发生在 `assembleResponseBuckets(...)` 里，CLI 只是薄封装显示结果。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/assembly.ts] [VERIFIED: packages/cli/src/commands/retrieval.ts] 这意味着 Citation Builder 和 Summary Builder 不应进入 recall 层；它们应建立在已 rerank、已分桶、已通过权限过滤的命中结果之上。 [VERIFIED: packages/server/src/lib/retrieval/merge.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts] [ASSUMED]

当前内部元数据已经足够接出 citations 的大部分字段，但还差一个关键修复：`MergedCandidate` 只保留 `semanticScore`、`keywordScore`、可选 `graphScore` 和一个会被 rerank 覆盖的 `combinedScore`。 [VERIFIED: packages/server/src/lib/retrieval/types.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts] 如果直接在现在的 `ScoredEntry` 或 `RetrievalMatch` 上补字段，`recall channel` 和“rerank 后得分”会变得不完全可审计，因为 pre-rerank 与 post-rerank 信息已经混在同一个数里。 [VERIFIED: packages/server/src/lib/retrieval/types.ts] [VERIFIED: packages/server/src/lib/retrieval/merge.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts]

摘要方面，当前公开字段仍是 `refinementSummary: string | null`，而 server 内部的 `generateRefinement()` 只在 provider 可用时尝试执行，并且目前始终返回 `null`。 [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] 这反而给了 Phase 10 一个清晰方向：把“可选摘要”从 provider-dependent refinement 升级为 contract-defined summary stage，基线先做 deterministic extractive summary；如果未来有 provider，再作为可选增强，而不是本阶段的必需前提。 [VERIFIED: user prompt] [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]

**Primary recommendation:** 在 server 内新增 `citations.ts` 和 `summary.ts`，把输出链路调整为 `filtered/reranked candidates -> citations -> bucket assembly -> optional summary -> contract response`，同时在 shared contracts 中引入结构化 citation 和 summary schema，并保留 CLI 作为纯 contract consumer。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/cli/src/commands/retrieval.ts] [ASSUMED]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | `^5.9.3` workspace root [VERIFIED: package.json] | server/cli/contracts 统一实现语言 [VERIFIED: AGENTS.md] | Phase 10 contract 和 pipeline 改动跨三个 package，继续保持单语言最稳妥。 [VERIFIED: packages/server/package.json] [VERIFIED: packages/cli/package.json] [VERIFIED: packages/contracts/package.json] |
| Zod | server `^4.3.6`, contracts `^4.1.12` [VERIFIED: packages/server/package.json] [VERIFIED: packages/contracts/package.json] | retrieval request/response 的唯一 schema 真源 [VERIFIED: packages/contracts/src/domain/retrieval.ts] | 直接满足 `BOUND-01`。 [VERIFIED: .planning/REQUIREMENTS.md] |
| Fastify | `^5.6.1` [VERIFIED: packages/server/package.json] | route 层只做 auth/permission/contract parsing [VERIFIED: packages/server/src/routes/retrieval.ts] | Phase 10 不需要改 route 模式，只需要让 route 继续返回新的 contract shape。 [VERIFIED: packages/server/src/routes/retrieval.ts] |
| Commander | `^14.0.1` [VERIFIED: packages/cli/package.json] | CLI search 输出渲染 [VERIFIED: packages/cli/src/commands/retrieval.ts] | CLI 已经是纯 contract consumer；Phase 10 只需更新 formatter。 [VERIFIED: packages/cli/src/commands/retrieval.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | workspace runner [VERIFIED: packages/server/package.json] [VERIFIED: packages/cli/package.json] | contracts/server/cli 全链路验证 [VERIFIED: current test scripts] | 用于 Citation Builder、Summary Builder、route、CLI formatter 和 contract regression 测试。 [VERIFIED: packages/server/package.json] [VERIFIED: packages/cli/package.json] [VERIFIED: packages/contracts/package.json] |
| Internal retrieval pipeline | in-repo [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] | Phase 10 的真实实现宿主 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] | 已有 Phase 6-9 seams，不需要引入额外框架。 [VERIFIED: .planning/phases/09-图辅助检索/VERIFICATION.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 在 server output stage 构建 citations [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] | 在 CLI 侧根据已返回字段“拼 citation” [ASSUMED] | 这会让 CLI 依赖 server 内部排序/metadata 约定，直接违反 `BOUND-02` 的意图。 [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/cli/src/commands/retrieval.ts] |
| 结构化 `summary` 对象 [ASSUMED] | 继续沿用 `refinementSummary: string | null` [VERIFIED: packages/contracts/src/domain/retrieval.ts] | 旧字段无法携带 citations，也会继续把摘要语义绑死在 provider-backed refinement 上。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| 基线 deterministic summary [ASSUMED] | 强制使用外部 LLM provider [ASSUMED] | 当前代码中的 refinement 本来就是 best-effort 且 provider 缺席时返回 `null`，强依赖外部 provider 会让 baseline 功能失效。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |

**Installation:**
```bash
pnpm install
```
[VERIFIED: workspace uses pnpm scripts in package.json files]

## Architecture Patterns

### Recommended Project Structure
```text
packages/contracts/src/domain/
└── retrieval.ts                 # citation + summary request/response schemas

packages/server/src/lib/retrieval/
├── orchestrator.ts              # filter -> recall -> citations -> assembly -> summary
├── citations.ts                 # build auditable citation payloads from reranked candidates
├── summary.ts                   # optional summary builder over already-safe hits
├── assembly.ts                  # bucket split and response shaping
├── merge.ts                     # preserve pre-rerank evidence
├── rerank.ts                    # output final score without destroying audit fields
└── types.ts                     # internal citation-ready candidate types

packages/cli/src/commands/
└── retrieval.ts                 # render contract-defined citations and summary
```

### Pattern 1: Citation Builder Must Sit Between Rerank And Assembly
**What:** Citation Builder 应消费 rerank 后仍保留完整证据的内部候选集合，再把结构化 citation 填回可公开的 match/result shape。 [VERIFIED: packages/server/src/lib/retrieval/merge.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts] [VERIFIED: packages/server/src/lib/retrieval/assembly.ts]  
**When to use:** 在 `dispatchByMode(...)` 返回 recall candidates 之后、`assembleResponseBuckets(...)` 之前。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]  
**Why:** `channels`、`semanticScore`、`keywordScore`、`graphScore` 目前只存在于 server-internal types；一旦降级成 `ScoredEntry`，citation 所需元数据就丢失了。 [VERIFIED: packages/server/src/lib/retrieval/types.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts]  
**Example:**
```typescript
// Source seam: packages/server/src/lib/retrieval/orchestrator.ts
const reranked = await dispatchByMode(...); // returns citation-ready candidates
const cited = buildCitations(reranked, parsed.seed);
const buckets = assembleResponseBuckets(cited, parsed.filters);
const summary = parsed.includeSummary ? buildSummary(parsed.seed, cited) : null;
```
[ASSUMED]

### Pattern 2: Preserve Audit Scores Explicitly
**What:** Phase 10 应把 `preRerankScore` 和 `finalScore` 拆成两个字段，而不是继续让 `rerankCandidates(...)` 覆盖 `combinedScore`。 [VERIFIED: packages/server/src/lib/retrieval/rerank.ts]  
**When to use:** 在 `MergedCandidate` 或新的 `RerankedCandidate` 类型中。 [VERIFIED: packages/server/src/lib/retrieval/types.ts]  
**Why:** 需求要求引用暴露 rerank/final score；当前实现只有一个会被覆盖的数值，无法区分 merge 阶段和 rerank 阶段。 [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: packages/server/src/lib/retrieval/merge.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts]  
**Example:**
```typescript
interface RerankedCandidate extends MergedCandidate {
  preRerankScore: number;
  finalScore: number;
}
```
[ASSUMED]

### Pattern 3: Summary Builder Must Accept Hits, Not Store Or Query Helpers
**What:** Summary Builder 的输入应是已命中的结果与其 citations，而不是 `services`、`store snapshot` 或 recall adapters。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]  
**When to use:** 仅在 `includeSummary` 为真时执行。 [ASSUMED]  
**Why:** 这样能机械地保证 SUMM-02 / SUMM-03，不给 summary 绕过 filtering 的机会。 [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]  
**Example:**
```typescript
export function buildSummary(
  query: string,
  hits: RetrievalMatchWithCitation[],
): RetrievalSummary | null {
  // deterministic extractive summary only over provided hits
}
```
[ASSUMED]

### Pattern 4: Summary And Citation Must Be Contract Shapes, Not Formatter Conventions
**What:** `citation`、`summary` 和任何 request flag 都必须先定义在 `packages/contracts/src/domain/retrieval.ts`。 [VERIFIED: packages/contracts/src/domain/retrieval.ts]  
**When to use:** 在更新 server route return type 和 CLI JSON/text output 前。 [VERIFIED: packages/server/src/routes/retrieval.ts] [VERIFIED: packages/cli/src/commands/retrieval.ts]  
**Why:** 这直接满足 `BOUND-01` 和 `BOUND-02`。 [VERIFIED: .planning/REQUIREMENTS.md]  

### Anti-Patterns to Avoid
- **在 `reason` 里塞 JSON 或伪结构化 citation 信息：** 当前 `reason` 只是人类可读字符串，不是稳定审计字段。 [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/assembly.ts]
- **在 CLI 里重新计算 snippet、score 或 recall channel：** CLI 当前没有访问内部 candidate metadata 的能力，也不该获得这种能力。 [VERIFIED: packages/cli/src/commands/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/types.ts]
- **让 summary 直接调用 recall modules：** 这会重跑 retrieval，破坏 `BOUND-05`。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
- **把 `global/project` 改造成 citation 分类或摘要模式：** `globalConstraints` / `projectKnowledge` 仍然表示业务范围。 [VERIFIED: packages/server/src/lib/retrieval/assembly.ts] [VERIFIED: .planning/REQUIREMENTS.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 公共输出结构 | CLI 私有 formatter 协议 [ASSUMED] | shared Zod schemas in `packages/contracts/src/domain/retrieval.ts` [VERIFIED: packages/contracts/src/domain/retrieval.ts] | 避免 server/CLI 双方各自发明 citation/summary shape。 [VERIFIED: .planning/REQUIREMENTS.md] |
| 摘要基线 | provider-only LLM summarization [ASSUMED] | deterministic extractive summary over safe hits [ASSUMED] | 当前 refinement 本来没有可用实现；Phase 10 不应被 provider 阻塞。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| 引用元数据 | 从 `detail` 字符串或 `reason` 文本反向解析 channel/score [ASSUMED] | 在 merge/rerank types 中显式保留 channel scores and final score [VERIFIED: packages/server/src/lib/retrieval/types.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts] | 反向解析文本不可审计且脆弱。 [ASSUMED] |

**Key insight:** Phase 10 不是“再加一个输出字符串”，而是把 Phase 7-9 累积的内部证据转成共享 contract 可见的结构化审计数据。 [VERIFIED: packages/server/src/lib/retrieval/types.ts] [VERIFIED: packages/server/src/lib/retrieval/merge.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts] [ASSUMED]

## Common Pitfalls

### Pitfall 1: 在 `ScoredEntry` 之后才尝试构建 citation
**What goes wrong:** recall channel、channel-specific scores 和 graph evidence 已经丢失，最后只能生成不完整或猜测性的 citation。 [VERIFIED: packages/server/src/lib/retrieval/types.ts] [VERIFIED: packages/server/src/lib/retrieval/rerank.ts]  
**Why it happens:** `toScoredEntriesFromReranked(...)` 只保留 `entry` 和最终 `score`。 [VERIFIED: packages/server/src/lib/retrieval/rerank.ts]  
**How to avoid:** 让 citations 基于 richer candidate type 构建，再进入 assembly。 [ASSUMED]  
**Warning signs:** 设计里出现“从 reason 解析 channel”或“在 CLI 重算 citation”。 [ASSUMED]

### Pitfall 2: 继续把摘要语义绑在 `refinementSummary`
**What goes wrong:** 摘要功能仍然被 provider presence 控制，且无法返回 citations。 [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]  
**Why it happens:** 当前 `refinementSummary` 是 `string | null`，没有结构化引用空间。 [VERIFIED: packages/contracts/src/domain/retrieval.ts]  
**How to avoid:** Phase 10 以 `summary` 结构体为主，必要时再决定是否保留 `refinementSummary` 兼容别名。 [ASSUMED]  
**Warning signs:** 合同设计里只有一个新的摘要字符串，没有 citation 数组。 [ASSUMED]

### Pitfall 3: Summary Builder 直接读取 store 或 graph index
**What goes wrong:** 摘要可能纳入未命中、未授权或未批准内容。 [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]  
**Why it happens:** 想“补全上下文”时很容易直接调用现有 retrieval helpers 或 graph index。 [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts]  
**How to avoid:** Summary Builder 只接受 orchestrator 传入的 safe hits/citations。 [ASSUMED]  
**Warning signs:** `summary.ts` import 了 `filterEligibleEntries`、`keywordRecall`、`graphAssistedRecall` 或 `services.store`. [ASSUMED]

### Pitfall 4: 让 human-readable output 泄露过多内部评分细节
**What goes wrong:** CLI 文本模式变得冗长、难扫读，甚至暴露本不该展示的内部调试信息。 [VERIFIED: packages/cli/src/commands/retrieval.ts] [ASSUMED]  
**Why it happens:** Phase 10 需要更多可审计字段，容易把 JSON payload 全量打印到普通终端输出。 [ASSUMED]  
**How to avoid:** JSON 模式打印完整 contract；普通文本模式只显示高价值 citation 摘要。 [VERIFIED: packages/cli/src/commands/retrieval.ts] [ASSUMED]  
**Warning signs:** 普通 `search` 输出里出现 raw channel arrays、内部 relation dump 或长 JSON blobs。 [ASSUMED]

### Pitfall 5: 忽略当前 typecheck 红基线
**What goes wrong:** Phase 10 计划把“通过 typecheck”当成增量验证，但当前 `pnpm --filter @skill-shareer/server exec tsc --noEmit` 已经因为 indexing adapter exports、`indexState.graph` 缺失和 tests typing 报错。 [VERIFIED: `pnpm --filter @skill-shareer/server exec tsc --noEmit` on 2026-04-15]  
**Why it happens:** retrieval tests 能过，但 typecheck 仍然覆盖更多源文件和类型路径。 [VERIFIED: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/routes/retrieval.test.ts src/lib/retrieval-workflow.test.ts` on 2026-04-15] [VERIFIED: `pnpm --filter @skill-shareer/server exec tsc --noEmit` on 2026-04-15]  
**How to avoid:** 把 typecheck baseline 修复作为 Wave 0 或首 plan 的显式前置工作。 [ASSUMED]  
**Warning signs:** Phase 10 计划里直接写“phase gate = typecheck green”，但没有任何 baseline absorption task。 [ASSUMED]

## Code Examples

Verified seams from current code:

### Existing Filter-First Pipeline
```typescript
// Source: packages/server/src/lib/retrieval/orchestrator.ts
const eligibleEntries = filterEligibleEntries(data.knowledgeEntries, auth, parsed.filters);
const topMatches = await dispatchByMode(parsed.mode, parsed.seed, eligibleEntries, parsed);
const { globalConstraints, projectKnowledge } = assembleResponseBuckets(topMatches, parsed.filters);
const refinementSummary = parsed.includeRefinement
  ? await generateRefinement(parsed.seed, globalConstraints, projectKnowledge)
  : null;
```
[VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

### Existing Internal Evidence Shape
```typescript
// Source: packages/server/src/lib/retrieval/types.ts
export interface MergedCandidate {
  entry: KnowledgeRecord;
  semanticScore: number;
  keywordScore: number;
  graphScore?: number;
  combinedScore: number;
  tokenMatches: TokenMatchDetail[];
  channels: RecallChannel[];
}
```
[VERIFIED: packages/server/src/lib/retrieval/types.ts]

### Recommended Citation Schema Direction
```typescript
// Source basis: existing retrieval contract + Phase 10 requirements
const retrievalCitationSchema = z.object({
  source: z.object({
    entryId: entityIdSchema,
    scope: scopeSchema,
    shortcut: z.string(),
  }),
  snippet: z.string().min(1),
  tags: z.array(labelSchema),
  recallChannels: z.array(z.enum(['semantic', 'keyword', 'graph'])).min(1),
  scores: z.object({
    semantic: z.number().min(0).max(1).nullable(),
    keyword: z.number().min(0).max(1).nullable(),
    graph: z.number().min(0).max(1).nullable(),
    preRerank: z.number().min(0).max(1),
    final: z.number().min(0).max(1),
  }),
});
```
[ASSUMED]

### Recommended Summary Schema Direction
```typescript
// Source basis: Phase 10 requirements
const retrievalSummarySchema = z.object({
  text: z.string().min(1),
  citations: z.array(retrievalCitationSchema).min(1),
});
```
[ASSUMED]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `refinementSummary: string | null` is the only optional post-processing output. [VERIFIED: packages/contracts/src/domain/retrieval.ts] | Phase 10 needs a structured canonical `summary` contract that can return citations. [VERIFIED: .planning/REQUIREMENTS.md] | Planned in Phase 10 on roadmap dated 2026-04-14. [VERIFIED: .planning/ROADMAP.md] | Makes summary auditable and no longer provider-shaped. [ASSUMED] |
| recall channel evidence is internal-only. [VERIFIED: packages/server/src/lib/retrieval/types.ts] | Phase 10 should selectively expose auditable channel metadata through citations. [VERIFIED: .planning/REQUIREMENTS.md] | Enabled by Phase 7 and Phase 9 internal seams. [VERIFIED: packages/server/src/lib/retrieval/merge.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] | Public results become explainable without changing filtering semantics. [ASSUMED] |
| rerank overwrites `combinedScore`. [VERIFIED: packages/server/src/lib/retrieval/rerank.ts] | Phase 10 should preserve pre/post-rerank scores separately. [VERIFIED: .planning/REQUIREMENTS.md] | Needed now for citation auditability. [VERIFIED: user prompt] | Prevents score provenance ambiguity. [ASSUMED] |

**Deprecated/outdated:**
- Treating `refinementSummary` as the future summary seam is outdated for this phase because it cannot return citations and its current implementation is a provider-gated stub. [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
- Treating CLI text formatting as the primary place to express retrieval provenance is outdated now that requirements explicitly demand auditable citation payloads. [VERIFIED: packages/cli/src/commands/retrieval.ts] [VERIFIED: .planning/REQUIREMENTS.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Citation Builder should run after rerank and before assembly. | Summary / Architecture Patterns | If wrong, planner may choose a different internal data seam and need more refactoring. |
| A2 | Deterministic extractive summary is sufficient baseline behavior for Phase 10 without provider access. | Summary / Don't Hand-Roll | If wrong, this phase may require external model integration sooner than planned. |
| A3 | `summary` should be a structured object with `text` and `citations`, not just a string. | Phase Requirements / Code Examples | If wrong, planner may over-design the response contract. |
| A4 | Request-side summary flag should default to `false`. | Phase Requirements | If wrong, API behavior might become more expensive/noisy by default. |
| A5 | Typecheck baseline repair belongs in Wave 0 or first plan for this phase. | Common Pitfalls / Validation Architecture | If wrong, planning may absorb work that should be split elsewhere. |

## Open Questions (RESOLVED)

1. **`includeRefinement` / `refinementSummary` 是否保留兼容别名？**
   - Decision: 保留一阶段兼容别名，但 `includeSummary` / `summary` 是 Phase 10 的 canonical contract。 [RESOLVED]
   - Rationale: 当前 request/response 合同、CLI 与测试已经公开使用 `includeRefinement` / `refinementSummary`；直接硬切会放大迁移面。保留兼容别名可以满足渐进迁移，同时保证 shared contracts 里有明确的新真源。 [VERIFIED: packages/contracts/src/domain/retrieval.ts] [VERIFIED: packages/cli/src/commands/retrieval.ts] [VERIFIED: packages/cli/src/commands/retrieval.test.ts] [ASSUMED]
   - Planning consequence: Plan 01 必须把 `summary` 作为主 schema，同时定义旧字段的兼容语义；Plan 03/04 只允许在 output stage 和 CLI formatter 层处理兼容，不得把旧 provider-based refinement 路径重新变成核心逻辑。 [RESOLVED]

2. **是否同时暴露 `answer` 与 `summary` 两个字段？**
   - Decision: 不新增独立 `answer` 字段，Phase 10 只暴露结构化 `summary`。 [RESOLVED]
   - Rationale: 路线图与 phase goal 聚焦“可选摘要生成”，而不是第二套并行回答字段；同时暴露 `answer` 与 `summary` 会造成语义重叠和 contract 膨胀。 [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/ROADMAP.md] [ASSUMED]
   - Planning consequence: 共享 contract、server output stage、route、CLI 与测试全部围绕 `summary` 单一字段设计；如未来确实需要 `answer`，应在后续 phase 单独引入。 [RESOLVED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server/cli/contracts scripts [VERIFIED: package.json files] | ✓ [VERIFIED: local env] | `v20.19.5` [VERIFIED: local env] | — |
| pnpm | workspace tests and builds [VERIFIED: package.json files] | ✓ [VERIFIED: local env] | `10.33.0` [VERIFIED: local env] | — |
| TypeScript compiler | typecheck and build [VERIFIED: package.json files] | ✓ [VERIFIED: local env via `pnpm ... tsc`] | workspace-installed [VERIFIED: local env] | — |
| External LLM provider | provider-backed summary enhancement only [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] | Not required for baseline [VERIFIED: user prompt] | — | Use deterministic extractive summary. [ASSUMED] |

**Missing dependencies with no fallback:**
- None for the recommended baseline implementation. [VERIFIED: current repo scripts and local env]

**Missing dependencies with fallback:**
- Provider-backed refinement is not a reliable baseline dependency because current implementation is best-effort and returns `null` without a provider. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest via package scripts [VERIFIED: packages/server/package.json] [VERIFIED: packages/cli/package.json] [VERIFIED: packages/contracts/package.json] |
| Config file | none detected; packages call `vitest run` directly [VERIFIED: packages/server/package.json] [VERIFIED: packages/cli/package.json] |
| Quick run command | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/routes/retrieval.test.ts src/lib/retrieval-workflow.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` [VERIFIED: local commands on 2026-04-15] |
| Full suite command | `pnpm test` plus `pnpm --filter @skill-shareer/server exec tsc --noEmit` [VERIFIED: package.json files] |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CITE-01 | Citation Builder emits structured citations from reranked candidates only | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/citations.test.ts` | ❌ Wave 0 |
| CITE-02..CITE-06 | Citation contains source, snippet, tags, recall channels, and audit scores | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/citations.test.ts src/lib/retrieval.test.ts` | ❌ Wave 0 |
| SUMM-01..SUMM-05 | Summary Builder is optional and only consumes safe hits/citations | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/summary.test.ts` | ❌ Wave 0 |
| SUMM-06 | Contracts and route return canonical optional `summary` field plus explicit compatibility handling for legacy refinement fields | contract + route | `pnpm --filter @skill-shareer/contracts test && pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts` | route file exists; contract cases need update |
| BOUND-01 / BOUND-02 | CLI only uses new contract fields; no server-internal leakage | contract + cli | `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` | ✅ existing file, new cases needed |
| BOUND-03 / BOUND-05 | Summary/citation logic does not bypass filter-first ordering | integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts` | ✅ existing files, new cases needed |
| BOUND-04 | global/project bucket semantics stay unchanged after adding citations/summary | integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/routes/retrieval.test.ts` | ✅ existing files, new cases needed |

### Sampling Rate
- **Per task commit:** `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/citations.test.ts src/lib/retrieval/summary.test.ts`
- **Per wave merge:** `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts`
- **Phase gate:** `pnpm test` and `pnpm --filter @skill-shareer/server exec tsc --noEmit`, but planner must absorb the current typecheck red baseline first. [VERIFIED: `pnpm --filter @skill-shareer/server exec tsc --noEmit` on 2026-04-15]

### Wave 0 Gaps
- [ ] `packages/server/src/lib/retrieval/citations.test.ts` — covers CITE-01..CITE-06. [ASSUMED]
- [ ] `packages/server/src/lib/retrieval/summary.test.ts` — covers SUMM-01..SUMM-05. [ASSUMED]
- [ ] Extend `packages/server/src/lib/retrieval.test.ts` with end-to-end citation/summary assertions across `semantic`, `hybrid`, and `graph-assisted`. [VERIFIED: current file exists]
- [ ] Extend `packages/server/src/routes/retrieval.test.ts` for new response contract fields and request flag semantics. [VERIFIED: current file exists]
- [ ] Extend `packages/cli/src/commands/retrieval.test.ts` for JSON mode fidelity and human-readable citation/summary formatting. [VERIFIED: current file exists]
- [ ] Repair current server typecheck baseline before using `tsc --noEmit` as a trustworthy regression gate. [VERIFIED: `pnpm --filter @skill-shareer/server exec tsc --noEmit` on 2026-04-15]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: Phase 10 does not change auth flows] | Existing session/login behavior remains unchanged. [VERIFIED: packages/server/src/routes/retrieval.ts] |
| V3 Session Management | no [VERIFIED: Phase 10 does not change session handling] | Existing session resolution remains unchanged. [VERIFIED: packages/server/src/routes/retrieval.ts] |
| V4 Access Control | yes [VERIFIED: citations/summary are derived from protected retrieval output] | Keep `filterEligibleEntries(...)` first; summary/citation builders accept only safe hits. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [ASSUMED] |
| V5 Input Validation | yes [VERIFIED: contracts drive request/response parsing] | Add request flags and output schemas in shared Zod contracts. [VERIFIED: packages/contracts/src/domain/retrieval.ts] |
| V6 Cryptography | no [VERIFIED: Phase 10 does not introduce cryptographic features] | Reuse existing score/content metadata only. [VERIFIED: packages/server/src/lib/retrieval/types.ts] |

### Known Threat Patterns for This Stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Summary reads unauthorized content outside hit set | Information Disclosure | Make Summary Builder a pure function over already-filtered matches/citations only. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [ASSUMED] |
| Citation exposes misleading score provenance | Repudiation | Preserve pre-rerank and final score separately in internal types and public citation payload. [VERIFIED: packages/server/src/lib/retrieval/rerank.ts] [ASSUMED] |
| CLI text output leaks internal graph/debug metadata | Information Disclosure | Keep full provenance in JSON mode and a curated subset in human-readable output. [VERIFIED: packages/cli/src/commands/retrieval.ts] [ASSUMED] |
| Route/CLI contract drift during summary migration | Tampering / Reliability | Define all request/response changes in shared contracts first and validate route output with `retrievalResponseSchema.parse(...)`. [VERIFIED: packages/server/src/routes/retrieval.ts] [VERIFIED: packages/contracts/src/domain/retrieval.ts] |

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` - Phase 10 scope, success criteria, and dependencies. [VERIFIED]
- `.planning/REQUIREMENTS.md` - `CITE-*`, `SUMM-*`, and `BOUND-*` requirements. [VERIFIED]
- `.planning/STATE.md` - current milestone state and dependency context. [VERIFIED]
- `.planning/phases/06-检索架构重构/06-RESEARCH.md` - orchestrator/filter/assembly seam intent. [VERIFIED]
- `.planning/phases/07-混合检索/07-RESEARCH.md` - internal channel evidence and merge/rerank design. [VERIFIED]
- `.planning/phases/08-索引生命周期/08-RESEARCH.md` - index lifecycle constraints that Phase 10 must not bypass. [VERIFIED]
- `.planning/phases/09-图辅助检索/09-RESEARCH.md` - graph-assisted retrieval intent and metadata flow. [VERIFIED]
- `.planning/phases/09-图辅助检索/VERIFICATION.md` - Phase 9 is implemented, so planning must target the real code seam rather than older placeholders. [VERIFIED]
- `packages/contracts/src/domain/retrieval.ts` - current public query/response schema. [VERIFIED]
- `packages/server/src/lib/retrieval/orchestrator.ts` - actual filter/recall/assembly/refinement order and refinement stub. [VERIFIED]
- `packages/server/src/lib/retrieval/assembly.ts` - current result shaping and bucket split. [VERIFIED]
- `packages/server/src/lib/retrieval/merge.ts` - internal merge evidence. [VERIFIED]
- `packages/server/src/lib/retrieval/rerank.ts` - score mutation behavior and final scoring seam. [VERIFIED]
- `packages/server/src/lib/retrieval/types.ts` - internal candidate metadata available for citations. [VERIFIED]
- `packages/server/src/routes/retrieval.ts` - route remains auth/permission/contract-only. [VERIFIED]
- `packages/server/src/lib/retrieval.test.ts` - current retrieval behavior and refinement assertions. [VERIFIED]
- `packages/server/src/lib/retrieval-workflow.test.ts` - approval-before-search workflow coverage. [VERIFIED]
- `packages/server/src/routes/retrieval.test.ts` - route schema/default coverage. [VERIFIED]
- `packages/cli/src/commands/retrieval.ts` - current text/JSON rendering seam. [VERIFIED]
- `packages/cli/src/commands/retrieval.test.ts` - current CLI retrieval coverage. [VERIFIED]
- `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/routes/retrieval.test.ts src/lib/retrieval-workflow.test.ts` run on 2026-04-15 - retrieval-focused server tests passing. [VERIFIED]
- `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` run on 2026-04-15 - CLI retrieval tests passing. [VERIFIED]
- `pnpm --filter @skill-shareer/server exec tsc --noEmit` run on 2026-04-15 - current typecheck baseline is red. [VERIFIED]

### Secondary (MEDIUM confidence)
- `AGENTS.md` - project-level architectural and workflow constraints. [VERIFIED]

### Tertiary (LOW confidence)
- None. All non-trivial implementation claims were derived from repository evidence or explicitly marked `[ASSUMED]`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - derived from current package manifests and code usage. [VERIFIED: package.json files]
- Architecture: HIGH - seams are strongly evidenced by current code, and this research now resolves Phase 10 to a single canonical `summary` contract with compatibility aliases for legacy refinement fields. [VERIFIED: current codebase] [RESOLVED]
- Pitfalls: MEDIUM - based on concrete current pipeline behavior and one known red baseline, with some planner-facing implementation assumptions. [VERIFIED: current codebase] [ASSUMED]

**Research date:** 2026-04-15 [VERIFIED: system date]  
**Valid until:** 2026-05-15 for repo-local architecture; re-check sooner if retrieval contracts change before planning. [ASSUMED]
