# 测试指南

本文档说明 TrapMap 的测试架构、运行方法和用例编写规范。

## 测试架构

TrapMap 采用两级评估体系：

```mermaid
flowchart TB
    subgraph 评估层级["评估层级"]
        Smoke["Smoke 层<br/>快速反馈，验证核心路径正确性<br/>命令: pnpm eval:smoke"]
        Core["Core 层<br/>全面覆盖，验证边界条件和治理规则<br/>命令: pnpm eval:core"]
        
        Smoke --> Core
    end
```

### 评估类型

| 类型 | 说明 | 运行器 |
|------|------|--------|
| 检索评估 (Retrieval) | 验证召回结果的相关性和治理正确性 | `evals/retrieval/run.ts` |
| 摘要评估 (Summary) | 验证 AI 生成摘要的忠实度和覆盖率 | `evals/summary/run.ts` |
| 图提取评估 (Graph Extraction) | 验证图提取、去重和冲突评测 | `evals/graph-extraction/run.ts` |
| 摄取评估 (Ingestion) | 验证 Skill 目录摄取的正确性 | `evals/ingestion/run.ts` |
| 治理评估 (Governance) | 验证 RBAC 和安全等级过滤 | 内嵌于检索评估 |

**Graph Extraction Eval Reporting:**
- `pnpm eval:graph-extraction` — live mode, requires chat provider config
- `pnpm eval:graph-extraction --dry-run` — deterministic fallback, all cases marked as fallback mode
- Treat a run as truly live only when the aggregate output shows `Mode Breakdown: Live: N cases, Fallback: 0 cases`
- If the output contains `DEGRADED`, `WARNING: Chat provider not configured`, or any non-zero fallback count, the run is not a clean live proof
- A report with zero live cases and non-zero fallback cases should NOT be used to evaluate LLM extraction quality

**Phase 3 Duplicate Recall Focus Runs:**
- Trap-only: run the duplicate eval and inspect the trap exact case that exercises the trap-side recall / exact-preservation lane.
- Skill-only: run the duplicate eval and inspect the real skill semantic and false-positive control cases that exercise the skill-side embedding + keyword recall path.
- Mixed: inspect trap + skill cases from the same report to confirm the merged PostgreSQL candidate list still preserves exact hits while keeping unrelated skill hits as `none`.

**Phase 4 Queue Dedupe / Trace Checks:**
- Queue dedupe: run the queue + processor + pipeline targets and confirm repeated scheduling keeps exactly one active `task_queue` row per `candidateId` while the task is `pending` or `running`.
- Retry safety: confirm a candidate can be scheduled again after the prior queue row reaches `dead` / `completed` / `failed`, and that conflict recovery does not drop the enqueue during the unique-violation race window.
- Trace persistence: inspect a processed candidate and confirm `analysisSnapshot.duplicateTrace` survives through the API / repository path with a plausible `detector` + `matchedLane` pair.

### 目录结构

```text
evals/
├── scripts/
│   └── eval-all.ts          # 统一运行器
├── retrieval/
│   ├── run.ts               # 检索运行器入口
│   ├── smoke.ts / core.ts   # 分层数据集导出
│   ├── datasets/            # 测试用例定义
│   ├── scenarios/           # Fixture 状态定义
│   └── lib/                 # 运行器基础设施
├── summary/
│   ├── run.ts               # 摘要运行器入口
│   ├── smoke.ts / core.ts   # 分层数据集导出
│   ├── datasets/            # 测试用例定义
│   ├── scenarios/           # Fixture 状态定义
│   └── lib/                 # 评判器和评分基础设施
├── graph-extraction/
│   ├── run.ts               # 图提取运行器入口
│   ├── fixtures.ts          # 标注 ground truth fixtures
│   ├── dedup-eval.ts        # 去重评测
│   └── conflict-eval.ts     # 冲突评测
└── ingestion/
    ├── run.ts               # 摄取运行器入口
    ├── adapter.ts           # 摄取适配器
    ├── assertions.ts        # 摄取断言
    ├── metrics.ts           # 摄取指标
    └── fixtures/            # 摄取用例固定数据
```

---

## 运行测试

### 单元测试

```bash
# 运行所有包的测试
pnpm test

# 按包运行
pnpm --filter @trapmap/server test
pnpm --filter @trapmap/cli test
pnpm --filter @trapmap/contracts test

# 覆盖率报告
pnpm test:coverage

# 类型检查
pnpm typecheck
```

### 评测（Eval）

#### 本地运行

```bash
# Smoke 层（快速，~10s）
pnpm eval:smoke

# Core 层（完整，~60s）
pnpm eval:core

# 仅检索评估
pnpm eval:retrieval:smoke
pnpm eval:retrieval:core

# 仅摘要评估
pnpm eval:summary:smoke
pnpm eval:summary:core

# 仅图提取评估
pnpm eval:graph-extraction:smoke

# 仅摄取评估
pnpm eval:ingestion:smoke

# 详细输出（逐用例结果）
pnpm eval:smoke -- --verbose

# Dry-run（验证用例格式，不执行）
pnpm exec tsx evals/scripts/eval-all.ts --tier smoke --dry-run --allow-empty
```

### 模拟 CI 运行

```bash
# 模拟 CI smoke
pnpm eval:ci

# 模拟 CI core
pnpm eval:ci:core

# 查看 JSON 报告
cat reports/eval-report.json
```

### PostgreSQL 全量评测（Docker 环境）

当需要在 Docker + PostgreSQL 环境下验证检索/摘要/图提取/摄取的端到端行为时，使用以下命令集。
需要 `.env` 中配置 `TRAPMAP_DATABASE_URL` 且 `trapmap-postgres` 容器正在运行。
如果在 Codex 中执行，按仓库约定为这些命令加上 `rtk` 前缀。

```bash
# 确保 .env 已加载（eval runner 不自动读取 .env）
set -a && source .env && set +a

# 检索 core 评测（PG-backed，JSON 报告）
pnpm eval:retrieval --tier core --json --json-path reports/eval/retrieval-core-postgres.json

# 摘要 core 评测（fallback provider，JSON 报告）
pnpm eval:summary --tier core --provider fallback --json --json-path reports/eval/summary-core-postgres.json

# 图提取 smoke（捕获 live/fallback 文本证据）
pnpm eval:graph-extraction --smoke | tee reports/eval/graph-extraction-smoke-live.txt

# Duplicate eval（Phase 3 trap+skill duplicate recall）
pnpm eval:dedup --dry-run | rg 'real-trap-exact-rmrf-quill'
pnpm eval:dedup --dry-run | rg 'real-semantic-handoff-vs-doccoauthoring|real-none-postgres-tuning-vs-backup'
pnpm eval:dedup --dry-run | rg 'real-trap-exact-rmrf-quill|real-semantic-handoff-vs-doccoauthoring|real-none-postgres-tuning-vs-backup'

# Queue dedupe + duplicate trace（Phase 4）
pnpm exec vitest run \
  packages/server/src/lib/queue/task-queue.test.ts \
  packages/server/src/lib/candidates/processor.test.ts \
  packages/server/src/__tests__/candidate-pipeline.test.ts

pnpm exec vitest run \
  packages/contracts/src/domain/candidates.test.ts \
  packages/server/src/lib/candidates/detector.test.ts \
  packages/server/src/lib/candidates/pg-detector.test.ts \
  packages/server/src/lib/candidates/pg-repository.test.ts \
  packages/server/src/lib/persistence/__tests__/schema-candidates.test.ts

# 摄取 smoke（捕获文本证据）
pnpm eval:ingestion:smoke | tee reports/eval/ingestion-smoke-postgres.txt
```

**注意：** eval runner 通过 `loadAiProviderConfig()` 读取环境变量，不会自动加载 `.env` 文件。
如不 source `.env`，retrieval、summary、graph extraction、ingestion 都可能读取不到 PostgreSQL 或 AI provider 配置，导致结果失真或直接回退。
图提取日志中如果出现 `WARNING: Chat provider not configured, falling back to rule engine`，即使顶部仍显示 `Mode: live`，该次运行也只能记为 degraded fallback。
摘要 multi-fact 用例需要真实 embedding provider（如 Google GenAI），fallback embedding 可能无法召回该用例的 capsule。
`eval:dedup` 当前不会按 fixture id 过滤执行，因此上面的 `rg` 命令用于从完整报告中聚焦 Phase 3 的 trap-only、skill-only 与 mixed case 行。
Phase 4 的 queue-dedupe 验证不需要额外环境变量；只要 PostgreSQL schema 已应用到包含 `task_queue_dedupe_pending_idx` 与 `candidate_analyses.duplicate_trace` 的最新 migration 即可。

### 持久化评测证据

评测产出的报告文件存储在 `reports/eval/` 下：

| 文件 | 内容 |
|------|------|
| `retrieval-core-postgres.json` | 检索 core 层全量 JSON 结果 |
| `summary-core-postgres.json` | 摘要 core 层全量 JSON 结果 |
| `graph-extraction-smoke-live.txt` | 图提取 smoke 文本输出；必须检查 `Mode Breakdown` 和 `DEGRADED`/fallback 提示 |
| `ingestion-smoke-postgres.txt` | 摄取 smoke 文本输出 |

### 文档漂移与复杂度守卫

每次结构重构后应运行以下守卫，确保文档与代码一致且热点文件未超出行数预算：

```bash
# 检查关键文档是否包含/排除预期短语（规则见 scripts/complexity-budgets.json docRules）
pnpm check:docs-drift

# 检查所有 Markdown 中的 Mermaid 图语法是否可解析
pnpm check:mermaid

# 检查热点文件是否在行数预算内（规则见 scripts/complexity-budgets.json lineBudgets）
pnpm check:complexity
```

CI 中由 `architecture-guardrails` 和 `doc-rules` jobs 自动执行。本地开发时可在改动 Mermaid 图、热点文件或架构文档后手动运行。

### Runtime Foundations Verification

当改动 request context、health/readiness、shared resilience、queue/outbox worker 可靠性时，至少运行以下验证矩阵：

```bash
# Runtime surface
pnpm test -- --run \
  packages/server/src/app.test.ts \
  packages/server/src/lib/runtime/runtime-metadata.test.ts \
  packages/server/src/config.test.ts

# Shared resilience primitives
pnpm test -- --run \
  packages/server/src/lib/runtime/resilience.test.ts \
  packages/server/src/lib/runtime/metrics.test.ts \
  packages/server/src/lib/candidates/processor.test.ts \
  packages/server/src/bootstrap/startup.test.ts \
  packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts

# Async reliability
pnpm test -- --run \
  packages/server/src/lib/queue/task-queue.test.ts \
  packages/server/src/lib/lifecycle/outbox.test.ts \
  packages/server/src/__tests__/candidate-pipeline.test.ts \
  packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts \
  packages/server/src/routes/candidates.test.ts

# Docs and guardrails
pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts
pnpm check:docs-drift
pnpm check:complexity
```

说明：

- 共享 runtime metrics 当前是内部/test-visible snapshot，不要求稳定对外 endpoint 验证
- `/ready` 在 `readiness === "not-ready"` 时应返回 HTTP `503`
- PostgreSQL 模式下，`queueWorker` 和 `outboxWorker` 都应纳入 readiness 解释
- 如果更改了 runtime doc contract，需要同步更新 `SYSTEM_TRUTH_SOURCES.md` 与 `docs-truth-smoke.test.ts`

### 按变更类型的验证矩阵

| 变更类型 | 必须运行的验证 |
|----------|--------------|
| 文档修改 | `pnpm check:docs-drift` + `pnpm check:mermaid` + `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts` |
| 命令范围变更 | `pnpm check:docs-drift` + smoke 测试（验证包级 DB 命令和 JSON 回退路径） |
| 环境默认值变更 | `pnpm check:docs-drift` + smoke 测试（验证 ENVIRONMENT.md 中的默认值正确） |
| 深层架构文档变更 | `pnpm check:docs-drift` + smoke 测试（验证 ARCHITECTURE.md / PERSISTENCE.md 中的运行时默认值和表计数） |
| Schema 变更 (retrieval/artifact/eval) | `pnpm test` + `pnpm --filter @trapmap/contracts typecheck` + `pnpm eval:smoke` + `pnpm check:docs-drift` + 更新 `DATABASE_SCHEMA.md` 表计数 |
| CI 配置变更 | `pnpm check:docs-drift` + 更新 `CI_CD.md` |
| 架构变更 | `pnpm check:docs-drift` + `pnpm check:mermaid` + `pnpm check:complexity` + `pnpm eval:smoke` |
| 脚本/守卫变更 | `pnpm test -- --run scripts/__tests__/check-doc-drift.test.ts` + `pnpm check:docs-drift` |
| 摘要生成变更 (`summary.ts`) | `rtk pnpm test -- --run packages/server/src/lib/retrieval/response/summary.test.ts evals/summary/__tests__/runner-api.test.ts` + `pnpm eval:summary:smoke` |
| 评测命令变更 | `pnpm check:docs-drift` + smoke 测试（验证 EVALUATION.md / TESTING.md 中的 eval 命令正确） |
| 贡献指南变更 | `pnpm check:docs-drift` + smoke 测试（验证 CONTRIBUTING.md 中的 DB 命令格式） |

### 文档维护工作流

当修改某个权威源（truth source）时：

1. 更新权威源文件本身
2. 查阅 [`DOCS_TRUTH_MATRIX.md`](../reference/DOCS_TRUTH_MATRIX.md) 找到所有二级文档
3. 更新所有二级文档
4. 运行 `pnpm check:docs-drift` 确认无漂移
5. 运行 `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts` 确认真理性断言通过
6. 如添加了新的漂移类别，在 `scripts/complexity-budgets.json` 中添加对应的 `docRules`

### CI 自动触发

| 触发条件 | 层级 | 说明 |
|----------|------|------|
| PR 到 main（修改 evals/、server/、contracts/） | Smoke | 快速回归检测 |
| 每周一 06:00 UTC | Core | 全面质量检查 |
| GitHub Actions 手动触发 | Smoke/Core | 可选层级 |

CI 配置位于 `.github/workflows/eval.yml`。

---

## 检索评估指标

| 指标 | 含义 | 目标值 |
|------|------|--------|
| Hit@1 | 首条结果即为相关条目 | > 0.8 |
| Hit@5 | 前 5 条包含相关条目 | > 0.9 |
| MRR | 相关条目排名倒数均值 | > 0.7 |
| nDCG | 归一化折损累积增益 | > 0.7 |

### Pass/Fail 与排名指标

检索用例的 `passed` 状态基于 outcome 和 governance 断言，不依赖排名指标：

- **Pass 条件**: 用例的 `outcome`（空/非空）和 `governance`（无禁止 ID 泄漏）断言均通过
- **排名指标独立**: `Hit@1`、`MRR`、`nDCG` 可能在用例仍为绿色时发生回归
- **基线比较**: 使用 `eval-ci` 的基线比较功能检测排名漂移，不要仅依赖 pass/fail 状态
- **建议流程**: smoke 绿色后，对 core 层运行基线比较以确认排名稳定性

### 治理检查

治理检查与相关性指标分开追踪，确保高相关性不能掩盖权限泄漏：

| 失败类型 | 含义 | 排查方向 |
|----------|------|----------|
| `forbidden-hit` | 返回了应被过滤的条目 | 检查 RBAC、安全等级、生命周期状态 |
| `unexpected-empty` | 应有结果但为空 | 可能过度过滤 |
| `unexpected-non-empty` | 应为空但有结果 | 可能过滤不足 |
| `shape-mismatch` | 响应结构不符合契约 | 检查端点版本 |

### 标签过滤回归要求

任何检索过滤 bugfix 都必须在 smoke 层添加标签过滤回归用例，确保问题可在 `eval:smoke` 中被捕获，而不仅在 `eval:core` 中：

- **检索层**: 在 `evals/retrieval/datasets/smoke/` 中添加带 `filters.labels` 的 v2 用例
- **摘要层**: 在 `evals/summary/datasets/smoke/` 中添加带 `filters.labels` 和 `forbiddenClaims` 的摘要用例
- **场景层**: 在对应的 scenarios 文件中添加包含多标签 artifact 的 fixture

### Skill Lookup 检索评测边界

`/v1/retrieval/skills/search-by-content` 现在纳入 retrieval eval 合同边界，不再只依赖独立 route/helper 测试：

- **Smoke**: `v1-skill-lookup-positive-smoke` 验证 artifact-first 正向命中
- **Core**: `v1-skill-lookup-governance-core` 验证 artifact-first 返回在 mixed-visibility 场景下仍遵守治理边界
- **断言形状**: 该端点不使用 v1 bucket 或 v2 capsule 断言，而是通过 `expected.shape.expectedArtifactIds` 断言 artifact-first 返回集合
- **执行适配**: 评测 runner 保持统一 `request.seed` 数据集字段，执行时再映射到 live route 的 `text` 请求体

最小验证命令：

```bash
rtk pnpm test -- --run \
  evals/retrieval/lib/normalize.test.ts \
  evals/retrieval/lib/assertions.test.ts \
  evals/retrieval/lib/report.test.ts \
  evals/retrieval/datasets/retrieval-datasets.test.ts \
  evals/retrieval/runner.test.ts
```

---

## 摘要评估指标

| 维度 | 含义 | 检查方法 |
|------|------|----------|
| Groundedness | 摘要内容基于检索上下文 | 事实提取 + 交叉验证 |
| Coverage | 覆盖预期关键信息 | 关键点匹配率 |
| Hallucination | 不含源内容之外的声明 | 禁止声明检测 |

---

## 添加测试用例

### 添加检索用例

1. 在 `evals/retrieval/datasets/` 的合适文件中定义用例：

```typescript
import { retrievalEvalCaseSchema, type RetrievalEvalCase } from '@trapmap/contracts';

export const myCase = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-case-id',
  tier: 'smoke',           // 'smoke' 或 'core'
  endpoint: '/v1/retrieval/search',
  request: {
    seed: '查询文本',
    mode: 'semantic',       // 'semantic' | 'hybrid' | 'graph-assisted'
    maxResults: 10,
  },
  scenarioId: 'my-scenario',
  expected: {
    outcome: 'non-empty',  // 'non-empty' 或 'empty'
    relevance: {
      relevantIds: ['entry_1', 'entry_2'],
      idealOrder: ['entry_1', 'entry_2'],  // 可选
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
  },
}) as RetrievalEvalCase;
```

2. 在对应的层级文件（`smoke.ts` 或 `core.ts`）中导出：

```typescript
export const cases = [...existingCases, myCase];
```

3. 如需 Fixture 数据，在 `evals/retrieval/scenarios/` 中创建场景 JSON。

### 多路召回测试覆盖（v2 Multi-Recall Phase 2）

Phase 0-2 为 v2 多路召回管线补充了以下目标用例切片，用于验证 keyword/semantic/graph/heuristic 通道的召回收益：

**Core 层**:

| 切片 | 用例 ID | 说明 |
|------|---------|------|
| keyword-dominant | `v2-keyword-dominant-core` | 精确标签/术语命中（pnpm lockfile） |
| keyword-dominant | `v2-keyword-error-text-core` | 错误文本/文件路径召回（ENOENT nginx.conf） |
| semantic-dominant | `v2-semantic-paraphrase-core` | 同义改写查询 vs 技术术语（orchestration -> "running services together"） |
| semantic-dominant | `v2-semantic-debug-core` | 口语化查询 vs 专业术语（observability -> "figure out why broken"） |
| mixed-channel | `v2-mixed-channel-core` | 关键字+语义双通道命中/去重（TypeScript CI build） |

**Smoke 层** (Phase 2-3 新增):

| 切片 | 用例 ID | 说明 |
|------|---------|------|
| keyword-dominant | `v2-keyword-dominant-smoke` | 精确错误文本召回（ModuleNotFoundError） |
| keyword-dominant | `v2-keyword-regex-smoke` | 技术术语召回（regex pattern parsing） |
| semantic-dominant | `v2-semantic-dominant-smoke` | 口语化改写查询 vs 技术术语（"types going wrong" → type checking） |
| semantic-dominant | `v2-semantic-paraphrase-smoke` | 语义改写查询 vs 服务编排术语 |

这些用例使用独立的 scenario fixture（`core-keyword-dominant`、`core-semantic-paraphrase`、`core-mixed-channel`、`smoke-keyword-dominant`），不依赖生产数据。

**Phase 2 状态**: heuristic + keyword 双通道已激活。keyword 通道提供独立词法召回，字段权重: labels(3.0) > problem(2.5) > goal(2.0) > situation/contextualPrefix(1.5) > content(1.0)。

**Phase 3 状态**: heuristic + keyword + semantic 三通道已激活。semantic 通道通过 embedding 余弦相似度提供语义补召回，解决同义不同词问题。smoke 层新增 2 个 semantic-dominant 用例（paraphrase/rewording）。

**Phase 4 状态**: merge/rerank 两阶段正式落地。Coordinator 改为"channel recall → merge → rerank"三阶段管线：
1. 各通道独立召回 → `CapsuleRecallCandidate[][]`
2. Merge 层按 capsuleId RRF 去重融合 → `MergedCapsuleCandidate[]`
3. Rerank 层复用 v2 intent-aware 特征精排 → `CapsuleCandidate[]`

Trace 新增字段：`channelsPlanned`、`channelsUsed`、`mergeStats`（totalChannelCandidates / preMergeCount / postMergeCount）。Reason 格式升级为 "Matched via <channels>; ..." 以区分通道来源。

**测试覆盖**:
- 新增 `scoring/merge.test.ts` (9 tests): RRF 去重、preRerankScore 计算、空/单/多通道、自定义 k 值
- 新增 `scoring/rerank.test.ts` (8 tests): CapsuleCandidate 形状、maxResults、排序、多通道 reason、缺失 capsule 数据
- 新增 `scoring/reasons.test.ts` (9 tests): 通道名包含、特征百分比、阈值过滤、boost 显示、fallback
- 原有 retrieval 测试 (120 tests) 全通过，无回归

**Phase 4 merge/rerank 专项检查建议**:
- mixed-channel: 验证同一 capsule 被多通道命中时 RRF 合理融合
- top1 stability: baseline Hit@1 不因 merge/rerank 引入漂移（已确认：core v2 Hit@1=0.83 与 Phase 0 baseline 一致）
- regression safety: 当前 v2 baseline 核心 case 无退化
- channel trace: smoke/core 执行后确认 channelsPlanned/channelsUsed 正确记录

**Phase 5 状态**: `capsule-graph` 通道已接入。graph 通道通过 skill graph 做结构化扩召回，采用 `artifact-level graph hit → capsule 映射` 策略。使用工厂函数 `createCapsuleGraphChannel(graphIndexRepo)` 实现，注册于 heuristic/keyword/semantic 之后作为补召回通道。

Graph 通道工作机制：
1. 从 query 提取工具关键词实体（复用 graph-extract.ts）
2. 按 `sourceType: 'skill'` 过滤 graph 文档，构建图运行时快照
3. 通过 `expandSourcesOneHop()` 做实体匹配 + 邻居展开，获取候选 artifact ID
4. artifact ID → governed capsule 映射（仅返回治理交集内的 capsules）
5. `graphEvidence` 字段承载 query entity 列表用于审计追踪

**测试覆盖**:
- 新增 `capsule-graph-channel.test.ts` (19 tests): CapsuleRecallChannel 接口实现、graph 实体匹配、graph expansion、artifact-capsule 映射、governance 过滤、trap 文档过滤、空结果/边界/排序/形状验证
- 新增 evals:
  - Smoke: `v2-graph-assisted-co-occurs-smoke` (co-occurs 图边命中), `v2-graph-assisted-governance-smoke` (governance 安全)
  - Core: `v2-graph-assisted-co-occurs-core` (docker→kubernetes 扩展), `v2-graph-assisted-reverse-core` (kubernetes→docker 反向扩展)

**Phase 5 graph 通道专项检查建议**:
- graph-only recall: 验证图通道可独立召回 artifact 并映射到 capsule
- artifact-to-capsule mapping: 确认 artifact hit 后 capsule 召回准确，不遗漏
- non-dominance: 图结果进入 merge 层平等竞争，不独占最终排序
- governance safety: 图通道返回结果与治理 artifacts 取交集，不引入泄漏
- trap doc filtering: 仅使用 `sourceType: 'skill'` 的 graph 文档，trap 文档不参与 capsule 召回
- channel trace: 确认 `channelsPlanned` / `channelsUsed` 中 `capsule-graph` 通道正确记录

### Phase 4 Graph DB 验证矩阵

Phase 4 的重点不是让 Neo4j 改变召回哲学，而是验证同一 mixed retrieval 语义在不同 backend 模式下保持一致：

- vector-only baseline: `v2-graph-assisted-vector-only-smoke`
  - fixture: `smoke-graph-assisted-v2-no-graph`
  - 预期: 只返回 direct vitest capsule，用于对比“没有结构化补召回”时的 baseline。
- graph DB disabled baseline: `v2-graph-assisted-disabled-backend-smoke`
  - 环境: 不设置 `TRAPMAP_GRAPH_DB_ENABLED`
  - 预期: 结果与 graph hit case 一致，但 `routingTrace.graphRetrieval.backendMode` 应为 `disabled`。
- graph-enabled local hit: `v2-graph-assisted-co-occurs-smoke`
  - 环境: graph docs 存在；可用 backend 为 `memory` 或 healthy `neo4j`
  - 预期: `vitest` query 通过 local-neighborhood expansion 补召回 `jest` capsule。
- governance regression: `v2-graph-assisted-governance-smoke`
  - 预期: mixed recall 的最终结果仍然只来自治理允许集合。
- fail-open fallback: `v2-graph-assisted-fail-open-smoke`
  - 环境: `TRAPMAP_GRAPH_DB_ENABLED=true` 且 Neo4j 不可达，同时 `TRAPMAP_GRAPH_DB_FAIL_OPEN=true`
  - 预期: 结果与 local graph hit 一致，`routingTrace.graphRetrieval.backendMode` 应为 `enabled-fallback`。

建议最小执行顺序：

```bash
# 1. 默认 memory / disabled baseline
pnpm eval:smoke

# 2. healthy neo4j enabled
TRAPMAP_GRAPH_DB_ENABLED=true \
TRAPMAP_GRAPH_DB_PROVIDER=neo4j \
TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:7687 \
TRAPMAP_GRAPH_DB_USERNAME=neo4j \
TRAPMAP_GRAPH_DB_PASSWORD=neo4j \
pnpm eval:smoke

# 3. fail-open fallback
TRAPMAP_GRAPH_DB_ENABLED=true \
TRAPMAP_GRAPH_DB_PROVIDER=neo4j \
TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:65535 \
TRAPMAP_GRAPH_DB_USERNAME=neo4j \
TRAPMAP_GRAPH_DB_PASSWORD=neo4j \
TRAPMAP_GRAPH_DB_FAIL_OPEN=true \
pnpm eval:smoke
```

检查点：

- `v2-graph-assisted-vector-only-smoke` 与 `v2-graph-assisted-co-occurs-smoke` 的差异，证明 mixed recall 确实带来结构化补召回。
- `v2-graph-assisted-disabled-backend-smoke` 与 `v2-graph-assisted-fail-open-smoke` 的 `routingTrace.graphRetrieval.backendMode`，证明 disabled / fallback 路径都可观测。
- `v2-graph-assisted-governance-smoke` 持续通过，证明 mixed recall 仍先与 governance-eligible 集合求交。

**Phase 6 状态**: 索引同步与运维补齐已完成。

索引同步能力：
- `createCapsuleIndexSync()`: capsule → keyword tokens + embedding vectors 同步，幂等 upsert（capsuleId + contentHash + revisionNo）
- `syncArtifactCapsules()`: 按 artifact 同步所有 capsules 到两张索引表
- `removeCapsuleIndex()` / `getSyncStatus()`: 索引条目清理和状态查询

重建与运维工具：
- `rebuildAllCapsuleIndexes()`: 批量重建（清空 + 遍历所有 artifact + 重新同步），支持 onProgress 回调
- `rebuildCapsuleIndexForArtifact()`: 按 artifact ID 定点重建
- `verifyCapsuleIndexHealth()`: 健康对账（只读，返回 missing/failed/orphan 统计）
- `cleanupOrphanCapsuleIndexes()`: 孤立索引行清理
- 稳定内部运维路由：`POST /v1/operations/capsule-index/rebuild`、`GET /v1/operations/capsule-index/health`、`POST /v1/operations/capsule-index/cleanup-orphans`

通道故障隔离：
- `CapsuleRecallCoordinator.execute()`: 每个通道单独 try/catch，单通道失败记录到 `channelsFailed` / `channelErrors`，不阻断检索
- 失败信息通过 RAG log metadata 追踪

PG → Memory fallback:
- keyword 通道: `capsuleKeywordRecall()` (memory) 始终作为 fallback
- semantic 通道: `capsuleSemanticRecall()` (memory) 始终作为 fallback
- PG recall 函数通过 `featureFlag` 控制，禁用时自动走 memory

**测试覆盖**:
- 新增 `capsule-index-sync.test.ts` (8 tests): 同步成功/空 capsules/多 capsules/feature flag/错误处理/删除/状态查询
- 新增 `capsule-index-rebuild.test.ts` (11 tests): 重建/空 artifacts/progress/定点重建/不存在 ID/健康对账/缺失检测/孤立检测/失败检测/清理
- 新增 `phase6-index-schema.test.ts` (18 tests): keyword 表列存在性(12 columns)、embedding 表列存在性(10 columns)、跨表一致性验证
- Coordinator 新增 3 个 tests: 通道故障隔离/失败记录/工作通道结果保留

**Phase 6 专项检查建议**:
- PG sync: 设置 featureFlag 后验证 capsules 正确写入 keyword 和 embedding 索引表
- idempotency: 同一 capsule 重复 sync 不产生重复行（ON CONFLICT DO UPDATE）
- health reconcile: 运行 `verifyCapsuleIndexHealth()` 后确认 source 与 index 一致
- channel isolation: 模拟某通道异常后验证其他通道继续工作，且 channelsFailed 正确记录
- PG fallback: PG 不可用时 keyword/semantic 通道自动回退到 memory 路径

**Phase 7 状态**: 多路召回全线落地，直接替换旧流程为默认路径。无 feature flag 灰度体系，`searchKnowledgeV2()` 直接以四通道 coordinator 为唯一检索路径。

最终回归结果：

| 命令 | 结果 |
|------|------|
| `rtk pnpm typecheck` | No errors found |
| `rtk pnpm lint` | Checked 629 files, no fixes |
| `rtk pnpm test` | 检索层 185 tests + route 78 tests 全通过 |
| `rtk pnpm eval:retrieval:smoke` | 32/32 (100%), v2 Hit@1=0.82 |
| `rtk pnpm eval:retrieval:core` | v2 Hit@1=0.86, Hit@5=0.93, MRR=0.89, nDCG=0.91 |

**Phase 7 Baseline 对比** (v2 Core):

| 指标 | Phase 0 | Phase 7 | 变化 |
|------|---------|---------|------|
| Hit@1 | 0.86 | 0.86 | 持平 |
| Hit@5 | 0.86 | 0.93 | +8.1% |
| MRR | 0.86 | 0.89 | +3.5% |
| nDCG | 0.86 | 0.91 | +5.8% |
| Recall@10 | 0.86 | 0.93 | +8.1% |

v2 Smoke Hit@1 从 0.60 提升至 0.82 (+36.7%)。

**Phase 7 专项检查建议**:
- baseline regression: 确认 core v2 Hit@1 不退化（已确认：0.86 持平）
- governance safety: 确认无新增治理泄漏（已确认：仅 2 个预存 failure）
- channel trace: 确认 channelsPlanned/channelsUsed 在所有 eval 正确记录
- multi-channel complement: keyword/semantic/graph 通道各自贡献独立召回增益

### 添加摘要用例

1. 在 `evals/summary/datasets/` 中定义：

```typescript
import { summaryEvalCaseSchema, type SummaryEvalCase } from '@trapmap/contracts';

export const mySummaryCase = summaryEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-summary-case',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: '查询文本',
    maxResults: 10,
  },
  scenarioId: 'my-scenario',
  expected: {
    requiredFacts: ['必须出现的事实'],
    forbiddenClaims: ['不得出现的声明'],
    minGroundedness: 0.8,
    minCoverage: 0.7,
    expectSummary: true,
  },
}) as SummaryEvalCase;
```

2. 在对应的层级文件中导出。

---

## Schema 定义位置

所有评估 Schema 集中在 `packages/contracts/src/domain/evals/`：

| 文件 | 内容 |
|------|------|
| `retrieval.ts` | 检索用例和请求 Schema |
| `summary.ts` | 摘要用例和预期结果 Schema |
| `report.ts` | 报告结构 Schema |

---

## 单元测试

项目使用 Vitest 运行单元测试：

```bash
# 运行所有单元测试
pnpm test

# 意图解析器测试（正则 + LLM）
pnpm test -- --run packages/server/src/lib/retrieval/capsules/intent.test.ts

# 意图缓存测试
pnpm test -- --run packages/server/src/lib/retrieval/capsules/intent-cache.test.ts

# 运行特定文件
pnpm vitest run evals/retrieval/runner.test.ts
```

测试文件遵循 `*.test.ts` 命名约定，放置在对应模块目录下。

### Live PG Eval Parity

检索评测 harness 在 PG 模式下必须与 JSON 模式产生相同的 auth/graph 设置语义。Phase 0 修复了以下问题：

- **Session subject type**：`createActorSession()` 在 PG 模式下删除旧 session 并创建新 session，确保 `subjectType` 和 `activeTeamId` 正确（不再隐式使用 system-admin）。
- **Active team**：actor 的 `activeTeamId` 通过新 session 正确传递，governance 过滤基于实际 team membership。
- **Graph repository visibility**：graph 文档通过 `repos.graphIndex.upsert()` 播种，确保 `repos.graphIndex.listAll()` 可见。
- **Capsule data hydration**：PG `listByFilter()` 返回 lightweight records（`derived: null`），导致 capsule recall 通道无法读取 capsule 数据。修复：`listForRetrieval()` 方法批量加载 revision + capsule 数据，`buildRetrievalReadModel()` 使用该方法。

回归测试位于 `evals/retrieval/lib/adapters.test.ts`。

### PostgreSQL 集成测试

部分模块包含需要真实 PostgreSQL 连接的集成测试。这些测试通过 `TRAPMAP_DATABASE_URL` 或 `DATABASE_URL` 环境变量控制，未设置时自动跳过。

```bash
# 运行 PG 集成测试（需要数据库）
TRAPMAP_DATABASE_URL=postgresql://user:pass@localhost:5432/trapmap pnpm --filter @trapmap/server test
```

CI 中通过 `postgres-integration` job 运行真实 PostgreSQL/pgvector 校验链路，包括任务队列、outbox worker 和 lifecycle subscriber 的集成测试。本地开发也可以使用 Docker 快速启动 pgvector：

```bash
docker run -d --name trapmap-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=trapmap -p 5432:5432 pgvector/pgvector:pg16
```

包含 PG 集成测试的模块：

| 模块 | 测试文件 | 说明 |
|------|----------|------|
| Feedback | `src/lib/feedback/pg-repository.test.ts` | 反馈 CRUD、过滤、约束验证 |
| Usage Analytics | `src/lib/analytics/pg-repository.test.ts` | 使用统计写入、查询、归档 |
| Candidates | `src/lib/candidates/pg-repository.test.ts` | 候选提交、分析、判重 |
| Duplicates | `src/lib/duplicates/repository.test.ts` | 重复检测 |
| Keyword Recall | `src/lib/retrieval/recall/pg-keyword.test.ts` | 关键词检索：text[] 重叠匹配、字段权重评分、GIN 索引验证 |
| Knowledge PG | `src/lib/knowledge/pg-repository.test.ts` | 知识条目 CRUD、标签过滤、约束验证 |
| Task Queue | `src/lib/queue/task-queue.test.ts` | 持久化任务队列：入队、出队、重试、死信队列 |
| Subscribers | `src/lib/lifecycle/subscribers/subscribers-integration.test.ts` | Outbox 事件驱动：索引同步、审计日志、冲突检测 |

---

## Feedback Remediation 最小验证

当同一 `trap` 或 `skill` 的未解决 feedback 数达到 `10` 时，系统当前会：

- 在 `/v1/operations/feedback/remediation` 中暴露该条目
- 在检索阶段对该条目做硬过滤
- 在 `skill edit` 后把状态推进到 `in-remediation`
- 在 `trap review approve` / `skill review approve` 后把状态推进到 `ready-to-reindex`
- 在 `POST /v1/operations/feedback/remediation/:entryId/complete` 后批量 resolve 当前未解决 feedback

建议至少运行以下验证：

```bash
rtk pnpm test -- --run \
  packages/server/src/routes/feedback.test.ts \
  packages/server/src/routes/retrieval.test.ts \
  packages/server/src/routes/review.test.ts \
  packages/server/src/routes/operations/skill-edit.test.ts \
  packages/server/src/routes/operations/skill-review.test.ts
```

手动检查建议：

1. 提交或注入同一条目的 10 条 `new/triaged` feedback。
2. 确认 `/v1/operations/feedback/remediation` 中出现该 trap/skill。
3. 确认该 trap/skill 不再出现在相应 retrieval 结果中。
4. 对 skill 执行 edit，确认 remediation 状态推进到 `in-remediation`。
5. 对 trap 或 skill 执行 approve，确认 remediation 状态推进到 `ready-to-reindex`。
6. 调用 remediation complete 端点，确认会先触发现有 trap/skill 索引刷新路径，再批量 resolve 当前未解决 feedback。

---

## Phase 2 跨模式认证/成员回归测试清单

以下测试用例必须在 JSON 和 PG 两种存储模式下均通过：

| 测试文件 | 覆盖场景 |
|----------|----------|
| `routes/access-keys.test.ts` | 创建访问密钥、issue → login 往返、权限校验 |
| `routes/auth.test.ts` | 系统管理员登录、访问密钥登录、会话状态、登出 |
| `routes/members.test.ts` | 创建成员（含 caller-provided `securityLevel`）、更新成员、handle 唯一性 |
| `__tests__/pg-first-compat.test.ts` | 端到端：issue key → login → session 验证、`securityLevel` 持久化 |

运行命令：

```bash
pnpm test -- --run packages/server/src/routes/access-keys.test.ts packages/server/src/routes/auth.test.ts packages/server/src/routes/members.test.ts packages/server/src/__tests__/pg-first-compat.test.ts
```

---

## 结构回归守卫：`store.snapshot()` / `store.transact()` 用法限制

PG-first 收敛完成后，核心业务路由必须通过 `repos.*` 读写数据。`store.snapshot()` / `store.transact()` 仅允许在以下模块中使用：

| 类别 | 文件模式 | 说明 |
|------|----------|------|
| 仓库实现 | `lib/*/repository.ts` | 内部包装 store 作为兼容层 |
| 迁移/回填脚本 | `lib/persistence/migrate-*.ts`、`backfill-*.ts` | 一次性数据迁移 |
| 启动引导 | `bootstrap/*.ts` | 启动接线和恢复 |
| 生命周期订阅者 | `lib/lifecycle/subscribers/*.ts` | 事件驱动副作用 |
| 候选处理管线 | `lib/candidates/processor.ts`、`lib/candidates/services/*.ts` | 管线变更 |
| 运维/管理路由 | `routes/operations/*.ts`、`routes/admin-*.ts` 等 | 诊断和迁移 HTTP 工具 |

守卫测试位于 `packages/server/src/__tests__/snapshot-usage-guard.test.ts`，扫描所有非测试 `.ts` 文件。新增不允许列表中的 `store.snapshot()` / `store.transact()` 调用会导致测试失败。

运行守卫测试：

```bash
pnpm test -- --run packages/server/src/__tests__/snapshot-usage-guard.test.ts
```

### 跨模式一致性验证

以下命令组合验证 JSON 和 PG 两种存储模式下的行为一致性：

```bash
# 类型检查
pnpm typecheck

# 全量测试
pnpm test

# Smoke 评估
pnpm eval:smoke

# 结构守卫
pnpm test -- --run packages/server/src/__tests__/snapshot-usage-guard.test.ts
```

---

## 边界条件检查清单

编写或修改格式化、路径验证和 falsy 检查相关代码时，确认以下边界条件：

- [ ] **Falsy 值保留**：`''`、`0`、`false` 不应被条件检查误删，使用 `!= null` 替代 truthy 检查
- [ ] **空数组 join**：`[].join(', ')` 返回 `''` 而非 `null`，需要显式检查 `length > 0`
- [ ] **路径遍历**：`file..txt` 中的 `..` 不是路径段，不应被拒绝；按 `sep` 分割后检查段
- [ ] **Base64 无填充**：合法 base64 可以没有 `=` 填充，不要强制 `length % 4 === 0`
- [ ] **截断边界**：`maxLength <= 3` 时 `slice(0, maxLength - 3)` 产生负数索引
- [ ] **大小写敏感**：文件系统可能使用 `skill.md`、`SKILL.md`、`Skill.md` 等变体
- [ ] **null vs undefined 语义**：`null` 表示"已知为空"，`undefined` 表示"未设置"，格式化时应区分

---

## 输入清理检查清单

编写或修改 CLI 格式化输出时，确认用户可控字段已经过清理：

- [ ] **换行注入**：用户提供的 `title`、`reason`、`candidateId` 等字段在拼接多行输出时使用 `stripNewlines()` 清理
- [ ] **ANSI 注入**：从服务端返回的字段在直接输出到终端前使用 `stripAnsi()` 清理
- [ ] **组合清理**：需要同时去除换行和 ANSI 码时使用 `sanitizeForDisplay()`
- [ ] **JSON 输出**：`JSON.stringify` 使用紧凑格式（无缩进）以减少 token 消耗
- [ ] **非有限数**：`JSON.stringify` 序列化包含 `Infinity`/`NaN` 的对象时使用 replacer 函数

---

## Server Raw Report Revalidation

fm-agent 针对 `packages/server` 生成了 391 个已确认的原始发现（原始快照）。当前 HEAD 已显著领先原始快照（buildServer、capsule-native 检索等均已落地）。2026-05-29 审计回写后，matrix 中已无 current-live finding；完整分类矩阵见 `docs/plans/fm-agent-scan/server-live-gap-matrix.md`。

### 回归冻结测试

以下测试文件来自原始报告 triage 阶段，现已作为 **回归冻结测试** 保留。它们带有 `fm-agent:` 前缀，用于证明此前的 live gap 已被当前 HEAD 吸收，或明确落为环境边界：

| 测试文件 | 覆盖的活跃问题 |
|---|---|
| `packages/server/src/app.test.ts` | 已修复：onClose await worker stop、startup 后冻结 `skillShareer` |
| `packages/server/src/bootstrap/startup.test.ts` | 已修复 / 已文档化边界：生命周期审计订阅补齐；JSON store recovery 不重入 PG queue |
| `packages/server/src/lib/ai/dynamic/context-resolver.test.ts` | 已文档化边界：MCP 状态当前显式为 `unavailable` |
| `packages/server/src/lib/ai/provider-config.test.ts` | 已修复：provider-specific key 优先级 |
| `packages/server/src/__tests__/docs-truth-smoke.test.ts` | 重新验证文件存在性守卫 |

### 运行激活测试

```bash
# 仅运行 fm-agent 回归冻结测试
rtk pnpm --filter @trapmap/server test -- \
  --run packages/server/src/app.test.ts \
  packages/server/src/bootstrap/startup.test.ts \
  packages/server/src/lib/ai/dynamic/context-resolver.test.ts \
  packages/server/src/lib/ai/provider-config.test.ts \
  packages/server/src/__tests__/docs-truth-smoke.test.ts

# 重新验证源文档和分类矩阵是否存在
rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts
```

### 过时热点桶（HEAD 已解决）

大量原始发现（~381/391）来自 `lib/retrieval/capsules`、`lib/persistence/schema`、`lib/retrieval/recall`、`lib/artifacts/pg-repository`、`lib/indexing/graph-lite`——这些是当时未完成的工作。HEAD 已将胶囊原生检索、PG 关键词+语义召回、graph-lite 索引、适配器注册表全部落地。源文件对照清单见 `docs/plans/fm-agent-scan/server-source-pack.md`。

---

## Label Backfill and Repair Commands

### backfill:labels

从历史数据（`knowledge_labels`、artifact `labels`、`graph_index_documents`）中回填规范标签目录。

```bash
# 运行回填
pnpm backfill:labels

# 预览模式（不写入数据库）
pnpm backfill:labels -- --dry-run
```

要求：`DATABASE_URL` 环境变量已设置。

### label-merge:repair

标签合并后修复图文档中的节点 ID 和边端点。

```bash
# 运行修复
pnpm label-merge:repair

# 预览模式（不写入数据库）
pnpm label-merge:repair -- --dry-run
```

要求：`DATABASE_URL` 环境变量已设置。

### 标签对齐评估

标签对齐的质量通过 `label_alignment_events` 表审计。运维人员可查询该表检查：
- `decision = 'unsure'` 的事件（需要人工审查）
- `confidence < 0.5` 的事件（低置信度决策）
- `source_context = 'backfill'` 的事件（回填期间的决策）

```sql
-- 查看待审查的 unsure 事件
SELECT raw_label, raw_evidence, confidence, reasoning, created_at
FROM label_alignment_events
WHERE decision = 'unsure'
ORDER BY created_at DESC;

-- 查看低置信度决策
SELECT raw_label, decision, confidence, reasoning
FROM label_alignment_events
WHERE confidence < 0.5
ORDER BY confidence ASC;
```

---

## 运维验证序列 (Phase 5)

Phase 5 为运维操作员暴露了 capsule-index CLI 命令，以下验证序列覆盖核心运维路径。

### 前提条件

- PostgreSQL 已启动且 schema 已应用
- 至少有 1 个 approved artifact
- CLI 已登录（`trapmap login`）

### 验证步骤

```bash
# 1. 健康检查 — 确认索引状态
trapmap operations capsule-index health

# 2. 编辑后的 artifact 仍可正确派生
#    (编辑 → approve → 验证 health 无新增 missing)
trapmap operations edit <artifact-id> --labels "test-label"
# approve 通过 review-queue 或 API
trapmap operations capsule-index health
# 预期: 无新增 missingKeywords / missingEmbeddings

# 3. approved artifact 索引正确
trapmap operations capsule-index rebuild --mode artifact --artifact-id <artifact-id>
# 预期: keywordSynced / embeddingSynced > 0, keywordFailed / embeddingFailed = 0

# 4. 全量重建
trapmap operations capsule-index rebuild
# 预期: succeeded = totalArtifacts, failed = 0

# 5. 孤立清理
trapmap operations capsule-index cleanup-orphans
# 预期: removed = 0（正常状态下无孤立行）

# 6. JSON 输出验证
trapmap operations capsule-index health --json | jq .report
trapmap operations capsule-index rebuild --json | jq .stats
trapmap operations capsule-index cleanup-orphans --json | jq .removed
```

### 故障排查流程

当 `health` 报告问题时：

| 症状 | 原因 | 修复 |
|------|------|------|
| `missingKeywords > 0` | 索引未同步 | `rebuild --mode artifact --artifact-id <id>` |
| `failedKeywords > 0` | 同步出错 | 查看 `lastError` 字段，修复后 `rebuild` |
| `orphanKeywords > 0` | artifact 已删除但索引未清理 | `cleanup-orphans` |
| 全量缺失 | 索引表为空 | `rebuild`（全量重建） |

---

## 相关文档

- [模块详解](../architecture/MODULES.md) — 系统模块架构和设计
- [API 参考 — 检索端点](../architecture/API.md#检索端点) — 检索算法和模式
- [安全指南](SECURITY.md) — RBAC 和安全等级
- [环境变量参考](ENVIRONMENT.md) — 测试相关环境变量
