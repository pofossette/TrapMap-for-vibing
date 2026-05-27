# 检索评测数据集

本目录包含用于评测 TrapMap 检索端点的黄金数据集和入口点。

## 快速开始

从根目录的 pnpm 脚本运行检索评测：

```bash
# 运行 smoke 层级评测
pnpm eval:retrieval:smoke

# 运行 core 层级评测
pnpm eval:retrieval:core

# 空跑（验证布局，不执行）
pnpm eval:retrieval:dry-run

# 带选项运行
pnpm eval:retrieval --tier smoke --endpoint /v2/retrieval/search
```

## 端点范围

| 端点 | 响应形状 | 说明 |
|------|----------|------|
| `/v1/retrieval/search` | 分桶（`globalConstraints`、`projectKnowledge`） | 旧版端点，兼容性敏感 |
| `/v2/retrieval/search` | 胶囊优先（`capsules`、`profileHints`） | 当前推荐端点 |
| `/v3/retrieval/search` | 图规划包装（`plan` 或 governed `fallback`） | 附加 GraphRAG-lite 路由，含路由追踪 |

### v1 vs v2 vs v3 区别

检索接口具有实质不同的响应契约：

- **v1** 返回分为 `globalConstraints` 和 `projectKnowledge` 桶的知识条目
- **v2** 返回提炼的胶囊，附带用于激活的 `profileHints`
- **v3** 返回陷阱优先执行计划或治理回退载荷，外加路由追踪元数据

评测用例必须明确指定目标端点。不要在数据集层面将这些表面统一为单一响应形状。

### v1 兼容性风险

`/v1/retrieval/search` 端点存在已知的路由路径敏感性。当前集成测试显示，在认证路由执行下，治理场景可能返回 500 错误。这是 Phase 26 执行的规划考虑因素：

- 根据 `docs/api-surface.md`，v1 端点仍然是活跃契约
- 如果路由不稳定性持续存在，Phase 26 可能需要内部适配器
- 数据集作者应以 v1 用例为目标进行覆盖，但运行器应优雅处理执行失败

## 层级组织

### Smoke 层级

快速反馈，最小覆盖。证明评测管道连接正确。

| 用例 ID | 端点 | 场景类型 |
|---------|------|----------|
| `v1-semantic-positive-smoke` | `/v1/retrieval/search` | 正向可见命中 |
| `v1-semantic-empty-smoke` | `/v1/retrieval/search` | 空结果 |
| `v1-semantic-forbidden-smoke` | `/v1/retrieval/search` | 禁止结果 |
| `v2-capsule-positive-smoke` | `/v2/retrieval/search` | 正向可见命中 |
| `v2-capsule-empty-smoke` | `/v2/retrieval/search` | 空结果 |
| `v2-capsule-forbidden-smoke` | `/v2/retrieval/search` | 禁止结果 |
| `v3-graph-plan-selected-smoke` | `/v3/retrieval/search` | 图规划选中 |
| `v3-graph-plan-fallback-v2-smoke` | `/v3/retrieval/search` | 胶囊回退 |
| `v3-graph-plan-fallback-v1-smoke` | `/v3/retrieval/search` | 条目回退 |

### Core 层级

更广泛的覆盖，用于回归检测。包括模式变化和响应形状检查。

| 用例 ID | 端点 | 切片 |
|---------|------|------|
| `v1-semantic-ranked-core` | `/v1/retrieval/search` | 语义模式，多个相关 |
| `v1-hybrid-ranked-core` | `/v1/retrieval/search` | 混合模式 |
| `v1-graph-assisted-ranked-core` | `/v1/retrieval/search` | 图辅助模式 |
| `v1-bucket-shape-core` | `/v1/retrieval/search` | 桶分割验证 |
| `v1-low-maxresults-core` | `/v1/retrieval/search` | 低 maxResults 排名守卫（top-1 排序稳定性） |
| `v2-capsule-ranked-core` | `/v2/retrieval/search` | 胶囊排序 |
| `v2-profile-hints-core` | `/v2/retrieval/search` | 配置文件提示验证 |
| `v2-governance-core` | `/v2/retrieval/search` | 禁止泄漏 |
| `v2-scope-distribution-core` | `/v2/retrieval/search` | Scope 分布验证 |
| `v2-multi-capsule-core` | `/v2/retrieval/search` | 多胶囊排序 |
| `v2-label-filter-core` | `/v2/retrieval/search` | 标签过滤（验证完整胶囊载荷，不仅 top-1 相关性） |
| `v2-empty-with-summary-core` | `/v2/retrieval/search` | 空结果含摘要 |
| `v2-keyword-dominant-core` | `/v2/retrieval/search` | 关键字召回（锁定文件） |
| `v2-keyword-error-text-core` | `/v2/retrieval/search` | 关键字召回（错误文本） |
| `v2-semantic-paraphrase-core` | `/v2/retrieval/search` | 语义改写召回（编排） |
| `v2-semantic-debug-core` | `/v2/retrieval/search` | 语义改写召回（调试） |
| `v2-mixed-channel-core` | `/v2/retrieval/search` | 多通道命中/去重 |
| `v3-graph-plan-selected-core` | `/v3/retrieval/search` | 多技能选中计划 |
| `v3-graph-plan-governance-core` | `/v3/retrieval/search` | 治理敏感图规划 |

## 数据集契约

每个数据集模块导出由 `@trapmap/contracts` 验证的纯对象：

```typescript
import { retrievalEvalCaseSchema } from '@trapmap/contracts';

export const myCase = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'my-case-id',
  tier: 'smoke',
  endpoint: '/v1/retrieval/search',
  request: { seed: 'my query' },
  scenarioId: 'my-scenario',
  expected: {
    outcome: 'non-empty',
    relevance: { relevantIds: ['entry_1'] },
    governance: { forbiddenIds: [] },
  },
});
```

## 治理断言

每个用例在 `expected` 字段中有独立的 `relevance` 和 `governance` 部分：

```typescript
expected: {
  outcome: 'empty',
  relevance: {
    relevantIds: ['entry_1'],  // 内容上可能相关
    idealOrder: [],
  },
  governance: {
    forbiddenIds: ['entry_1'],  // 但策略禁止
    forbiddenReasons: ['cross-team'],  // 禁止原因
  },
}
```

这种分离确保：

1. 治理泄漏独立于排序质量被检测
2. 禁止的结果不能隐藏在相关性指标中
3. 失败报告能清晰识别跨团队、安全等级或生命周期问题

## Phase 25 范围外

- 指标计算器（Hit@K、MRR、nDCG）→ Phase 26 ✓ 完成
- 报告序列化 → Phase 26 ✓ 完成
- CI 接线 → Phase 28
- 摘要/法官评测 → Phase 27

## v2 多路召回基准 (Phase 7)

多路召回管线（heuristic + keyword + semantic + graph 四通道）已全线落地为 v2 检索唯一路径。

### 当前基准指标

**Smoke 层** (11 个 v2 用例):

| 指标 | 值 |
|------|-----|
| Hit@1 | 0.82 |
| Hit@5 | 0.82 |
| Hit@10 | 0.82 |
| MRR | 0.82 |
| nDCG | 0.82 |
| Recall@10 | 0.82 |
| Governance | 0 failures |

**Core 层** (14 个 v2 用例):

| 指标 | 值 |
|------|-----|
| Hit@1 | 0.86 |
| Hit@5 | 0.93 |
| Hit@10 | 0.93 |
| MRR | 0.89 |
| nDCG | 0.91 |
| Recall@10 | 0.93 |
| Governance | 1 (pre-existing) |

### 基准运行命令

CI 和本地统一使用 `reports/baselines/` 目录存储基线文件：

```bash
# 写入新基线（通过 eval-ci）
rtk env WRITE_BASELINE=true TIER=smoke pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts
rtk env WRITE_BASELINE=true TIER=core pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts

# 与基线比较（通过 eval-ci）
rtk env TIER=smoke pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts
rtk env TIER=core pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts

# 直接运行检索评测并写入基线（不经过 CI 运行器）
pnpm exec tsx evals/scripts/eval-all.ts --tier smoke --json --json-path ./reports/eval-report.json
```

## 指标（Phase 26）

运行器为每个用例和切片计算以下排序指标：

| 指标 | 描述 |
|------|------|
| Hit@K | 前 K 个结果中是否出现相关 ID（K=1,5,10） |
| MRR | 平均倒数排名：首个相关结果排名的倒数 |
| nDCG | 归一化折扣累积增益（二元相关性） |
| Recall@K | 前 K 个结果中找到的相关项占比（K=10） |

空目标策略：当没有相关 ID 时，所有指标返回 0。

## 入口点

| 文件 | 用途 |
|------|------|
| `run.ts` | 主运行器入口，含执行、指标和报告 |
| `smoke.ts` | Smoke 层级数据集导出 |
| `core.ts` | Core 层级数据集导出 |
| `lib/types.ts` | 共享运行器结果和切片类型 |
| `lib/adapters.ts` | 端点执行边界 |
| `lib/normalize.ts` | 端点特定响应归一化 |
| `lib/metrics.ts` | 排序指标计算器 |
| `lib/governance.ts` | 治理断言层 |
| `lib/load.ts` | 用例加载和验证 |

## 运行器选项

| 选项 | 描述 |
|------|------|
| `--tier` | 评测层级：`smoke` 或 `core`（默认：`smoke`） |
| `--endpoint` | 按端点过滤：`/v1/retrieval/search`、`/v2/retrieval/search` 或 `/v3/retrieval/search` |
| `--dry-run` | 验证布局，不执行评测 |
| `--allow-empty` | 未找到用例时成功退出 |
| `--json` | 输出 JSON 报告 |
| `--json-path` | 将 JSON 报告写入文件 |
| `--verbose` | 启用详细输出 |
| `--baseline` | 基线报告路径，用于比较（Phase 29-03） |
| `--write-baseline` | 将当前结果写入新基线（Phase 29-03） |

### 空跑模式

Phase 25-01 在 Plan 25-02 创建数据集之前定义入口点约定。使用 `--dry-run --allow-empty` 验证布局和契约接线，而无需已编写的数据集：

```bash
pnpm exec tsx evals/retrieval/run.ts --tier smoke --dry-run --allow-empty
```

### 基线流程（Phase 29-03）

运行器支持基线写入和比较，用于回归检测：

```bash
# 写入新基线
pnpm eval:retrieval --tier smoke --write-baseline --baseline ./reports/baseline.json

# 与基线比较
pnpm eval:retrieval --tier smoke --baseline ./reports/baseline.json
```

基线工件存储在 `--baseline` 指定的路径。比较显示每个切片的回归状态：
- `REGRESSED`：Hit@1 或 MRR 较基线下降超过 5%
- `IMPROVED`：Hit@1 或 MRR 较基线提升超过 5%
- `STABLE`：指标在基线的 5% 范围内
- `NO-BASELINE`：基线中没有匹配的切片

## 失败策略（Phase 29-03）

评测执行器强制执行明确的失败策略：

| 失败类型 | 策略 | 描述 |
|----------|------|------|
| 治理泄漏 | **始终失败** | 禁止 ID 出现在结果中 |
| 空结果不匹配 | **始终失败** | 期望空但得到非空，反之亦然 |
| 排序回归 | **仅报告** | Hit@1 或 MRR 较基线下降 |

**治理泄漏始终失败** - 任何禁止 ID 出现在结果中的用例都会立即失败，无论排序指标如何。

**空结果预期不匹配始终失败** - 如果用例期望空结果但得到结果（或反之），这是硬性失败。

**排序回归与基线比较** - 当提供基线时，排序漂移会被报告，但不会导致退出码 1，除非伴随治理泄漏或空结果不匹配。

## semanticQuery 效果对比

LLM 意图解析扩展了 `semanticQuery` 字段，用于优化语义召回通道的查询文本。评测对比方法：

```bash
# 运行 smoke 获取 baseline（regex 解析，semanticQuery 为 null）
pnpm eval:retrieval:smoke

# 若需对比 LLM 解析效果，在服务配置中启用 AI chat 后再次运行
# 检查 RAG log metadata 中的 parseMethod 字段确认解析方式
pnpm eval:retrieval:core
```

效果对比维度：
- 比较 Hit@K / MRR / nDCG 在 semanticQuery 为空（regex 基线）与启用后（LLM）的变化
- 通过 RAG log metadata 中的 `parseMethod` 和 `intentCategory` 字段识别解析方式
- `parseMethod: 'llm'` 表示 LLM 解析生效，`'regex'` 表示降级到正则 baseline

## 底层索引结构（Round 7）

检索端点依赖以下 PostgreSQL 派生索引表，均通过迁移脚本 `0005_round7_retrieval_index_structural.sql` 管理：

| 索引表 | 类型 | 用途 | 关键列 |
|--------|------|------|--------|
| `knowledge_embeddings` | pgvector HNSW | 语义相似性搜索 | `vector` (384维), `labels` (text[]) |
| `knowledge_keywords` | text[] GIN | 关键词匹配 | `tokens` (text[]), `field_tokens_shortcut/detail/labels` (text[]) |
| `knowledge_search_documents` | tsvector GIN | 全文检索 | `document` (tsvector), `labels` (text[]) |
| `graph_index_documents` | JSONB | GraphRAG-lite 图检索 | `nodes` (jsonb), `edges` (jsonb) |

所有索引表均为派生视图，不承载业务真相。索引同步通过 `PgVectorAdapter`、`PgKeywordAdapter` 和 `PgGraphIndexRepository` 完成，基于 `(entry_id, revision)` 唯一约束保证幂等性。同步状态通过 `status` 和 `last_error` 字段跟踪，支持失败重试和运维监控。
