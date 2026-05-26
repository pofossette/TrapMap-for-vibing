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
| 治理评估 (Governance) | 验证 RBAC 和安全等级过滤 | 内嵌于检索评估 |

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
└── summary/
    ├── run.ts               # 摘要运行器入口
    ├── smoke.ts / core.ts   # 分层数据集导出
    ├── datasets/            # 测试用例定义
    ├── scenarios/           # Fixture 状态定义
    └── lib/                 # 评判器和评分基础设施
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
TIER=core pnpm eval:ci

# 查看 JSON 报告
cat reports/eval-report.json
```

### 文档漂移与复杂度守卫

每次结构重构后应运行以下守卫，确保文档与代码一致且热点文件未超出行数预算：

```bash
# 检查关键文档是否包含/排除预期短语（规则见 scripts/complexity-budgets.json docRules）
pnpm check:docs-drift

# 检查热点文件是否在行数预算内（规则见 scripts/complexity-budgets.json lineBudgets）
pnpm check:complexity
```

CI 中由 `architecture-guardrails` job 自动执行。本地开发时可在改动热点文件或架构文档后手动运行。

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

### 治理检查

治理检查与相关性指标分开追踪，确保高相关性不能掩盖权限泄漏：

| 失败类型 | 含义 | 排查方向 |
|----------|------|----------|
| `forbidden-hit` | 返回了应被过滤的条目 | 检查 RBAC、安全等级、生命周期状态 |
| `unexpected-empty` | 应有结果但为空 | 可能过度过滤 |
| `unexpected-non-empty` | 应为空但有结果 | 可能过滤不足 |
| `shape-mismatch` | 响应结构不符合契约 | 检查端点版本 |

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
| Duplicates | `src/lib/duplicates/pg-repository.test.ts` | 重复检测 |
| Keyword Recall | `src/lib/retrieval/recall/pg-keyword.test.ts` | 关键词检索：text[] 重叠匹配、字段权重评分、GIN 索引验证 |
| Knowledge PG | `src/lib/knowledge/pg-repository.test.ts` | 知识条目 CRUD、标签过滤、约束验证 |
| Task Queue | `src/lib/queue/task-queue.test.ts` | 持久化任务队列：入队、出队、重试、死信队列 |
| Subscribers | `src/lib/lifecycle/subscribers/subscribers-integration.test.ts` | Outbox 事件驱动：索引同步、审计日志、冲突检测 |

---

## 相关文档

- [模块详解](../architecture/MODULES.md) — 系统模块架构和设计
- [API 参考 — 检索端点](../architecture/API.md#检索端点) — 检索算法和模式
- [安全指南](SECURITY.md) — RBAC 和安全等级
- [环境变量参考](ENVIRONMENT.md) — 测试相关环境变量
