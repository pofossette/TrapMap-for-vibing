# 检索评测数据集（离线）

本目录包含用于评测 TrapMap 检索端点的**离线**黄金数据集和入口点。离线 eval 使用 `buildPostgresComposedServer()` + `app.inject()` 在进程中执行，需要 PostgreSQL 连接（`TRAPMAP_DATABASE_URL`），每个 case 有独立隔离的 context，不依赖外部服务。

> **需要真实后端评测？** 参见 [`evals/retrieval-live/`](../retrieval-live/)，它面向运行中的 TrapMap 服务实例，使用命名 snapshot 版本控制数据变量。

| 维度 | 离线 eval（本目录） | Live eval（`retrieval-live/`） |
|---|---|---|
| 服务实例 | `buildPostgresComposedServer()` 内建 | 外部运行的 TrapMap 服务 |
| 请求方式 | `app.inject()` | 真实 HTTP 请求 |
| 隔离模型 | 每 case 独立 context + TRUNCATE | 共享 snapshot，全量恢复后依次执行 |
| 数据控制 | fixture 直写 | 命名 snapshot 版本恢复 |
| CI 集成 | `pnpm --filter @trapmap/evals eval:smoke` 纳入 | 独立脚本，不默认纳入 CI |

## 快速开始

从根目录的 pnpm 脚本运行检索评测：

```bash
# 运行 smoke 层级评测
pnpm --filter @trapmap/evals eval:retrieval:smoke

# 运行 core 层级评测
pnpm --filter @trapmap/evals eval:retrieval:core

# 空跑（验证布局，不执行）
pnpm --filter @trapmap/evals eval:retrieval:dry-run

# 带选项运行
pnpm --filter @trapmap/evals eval:retrieval --tier smoke --endpoint /v2/retrieval/search
```

## 端点范围

| 端点 | 响应形状 | 说明 |
|------|----------|------|
| `/v1/retrieval/search` | 分桶（`globalConstraints`、`projectKnowledge`） | 旧版端点，兼容性敏感 |
| `/v1/retrieval/skills/search-by-content` | artifact-first（`matches`） | 真实端点；eval composition 复用 host-local runtime 同一条实现路径 |
| `/v2/retrieval/search` | 胶囊优先（`capsules`、`profileHints`） | 当前推荐端点 |
| `/v3/retrieval/search` | 图规划包装（`plan` 或 governed `fallback`） | 附加 GraphRAG-lite 路由，含路由追踪 |

### v1 vs skill-lookup vs v2 vs v3 区别

检索接口具有实质不同的响应契约：

- **v1** 返回分为 `globalConstraints` 和 `projectKnowledge` 桶的知识条目
- **v1 skill lookup** 返回 artifact-first `matches`，每条仅保留 artifact 元数据与分数/原因
- **v2** 返回提炼的胶囊，附带用于激活的 `profileHints`
- **v3** 返回陷阱优先执行计划或治理回退载荷，外加路由追踪元数据

评测用例必须明确指定目标端点。不要在数据集层面将这些表面统一为单一响应形状。

### v1 兼容性风险

`/v1/retrieval/search` 端点存在已知的路由路径敏感性。当前集成测试显示，在认证路由执行下，治理场景可能返回 500 错误。这是 Phase 26 执行的规划考虑因素：

- 根据 `docs/reference/api-surface.md`，v1 端点仍然是活跃契约
- 如果路由不稳定性持续存在，Phase 26 可能需要内部适配器
- 数据集作者应以 v1 用例为目标进行覆盖，但运行器应优雅处理执行失败

## 层级组织

### Smoke 层级

快速反馈，最小覆盖。证明评测管道连接正确。

对 smoke 层的 v2 keyword-dominant 用例有一个额外约束：它们只要求证明“关键词主导查询能命中正确 top-1 artifact/capsule”，而不要求保留多个低分候选。原因是当前 v2 精度门控会在 `MIN_CAPSULE_SCORE` 处丢弃低分 capsule；多候选形状断言应放在 core 层，而不是 smoke 层。

| 用例 ID | 端点 | 场景类型 |
|---------|------|----------|
| `v1-semantic-positive-smoke` | `/v1/retrieval/search` | 正向可见命中 |
| `v1-semantic-empty-smoke` | `/v1/retrieval/search` | 空结果 |
| `v1-semantic-forbidden-smoke` | `/v1/retrieval/search` | 禁止结果 |
| `v1-skill-lookup-positive-smoke` | `/v1/retrieval/skills/search-by-content` | artifact-first 正向命中 |
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
| `v1-skill-lookup-governance-core` | `/v1/retrieval/skills/search-by-content` | artifact-first 治理边界 |
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

`/v1/retrieval/skills/search-by-content` 仍复用统一的 `request.seed` 数据集字段；运行器会在执行时将其映射为真实路由需要的 `text` 请求体，从而保持数据集作者不必为该 endpoint 单独建一套 request schema。

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

## Feedback Remediation 与 Eval 回流

2026-06-09 起，线上 feedback 侧已经有最小 remediation 闭环：

- 同一 `trap` / `skill` 的未解决 feedback 达到阈值（当前 `10`）后，会进入 remediation 队列
- remediation 队列会暴露 trap 本体内容或 skill 派生内容快照，供人工修订
- remediation 生效期间，该条目会在当前 retrieval 链路中被硬过滤，避免继续命中坏内容
- `skill edit`、`trap review approve`、`skill review approve` 会推进 remediation 状态
- remediation complete 会先复用现有索引刷新路径，再批量 resolve 当前 active feedback

现在已经有 badcase -> eval draft 的导出路径。推荐流程是：

1. 先通过 `/v1/operations/feedback/remediation` 确认是 trap 还是 skill 的检索坏例
2. 修正内容并完成 remediation
3. 调用 `/v1/operations/badcases/:feedbackId/export` 或运行 `scripts/archived/export-badcase-to-eval.ts`
4. 审核导出的 draft JSON，并补成 retrieval eval case
5. 至少运行 `pnpm --filter @trapmap/evals eval:retrieval:smoke` 或 `pnpm --filter @trapmap/evals eval:smoke`，确保问题转化为固定回归题

当前仍未自动化的部分：

- feedback 记录还没有统一保存完整命中快照
- 已有 badcase draft 导出脚本；正式纳入 `evals/retrieval` 仍保留人工审核
- remediation 解除仍以“索引刷新 + active feedback 清理”为主，不含额外运维审批层

## 数据库快照回放

针对“连接真实检索服务验证图检索和胶囊检索效果”的场景，retrieval eval 现在支持把真实 PostgreSQL 中的检索语料导出为可回放 JSON 快照，再作为 scenario 输入恢复到隔离测试上下文。

### 导出真实库快照

```bash
TRAPMAP_DATABASE_URL=postgres://user:pass@host:5432/db \
pnpm exec tsx --tsconfig tsconfig.base.json scripts/archived/export-retrieval-db-snapshot.ts --output ./evals/retrieval/snapshots/team-a.json --teamId team_a
```

可选参数：

- `--teamId <teamId>`：只导出该 team 的 knowledge/artifact；graph 文档会保留该 team 与 global 文档
- `--actorTeamId <teamId>`：设置回放时 actor 的 active team，默认跟 `teamId` 一致
- `--securityLevel <0-10>`：设置快照附带 actor 的安全级别，默认 `0`
- `--subjectType user|system-admin`：设置快照附带 actor 身份，默认 `user`
- `--permissions p1,p2`：设置快照附带 actor 权限列表，默认 `knowledge:search,artifact:read`

脚本输出的是 retrieval 专用最小快照，不是全库备份。它只包含：

- knowledge entries
- skill artifacts 的 retrieval 所需字段和 capsules
- graph index documents
- 可选 actor 基线

### 在 scenario 中引用快照

```typescript
export const liveSnapshotScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'live-snapshot-team-a',
  description: 'Replay retrieval against a captured live-like corpus',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_a',
    securityLevel: 3,
    permissions: ['knowledge:search', 'artifact:read'],
  },
  snapshot: {
    kind: 'retrieval-db-snapshot',
    path: 'evals/retrieval/snapshots/team-a.json',
  },
  fixtures: {},
});
```

执行时 runner 会：

1. 读取 `snapshot.path`
2. 用快照里的 fixture 还原 knowledge/artifact/graph 文档
3. 用 scenario 的 `actor` 覆盖快照里的 actor 基线
4. 在隔离上下文里执行 retrieval case

这个机制适合：

- 从真实库抽样一批代表性团队/语料做回归
- 验证图检索、capsule 检索在真实派生数据上的表现
- 把线上 badcase 附近的真实 corpus 固化成长期回放样本

## Phase 25 范围外

- 指标计算器（Hit@K、MRR、nDCG）→ Phase 26 ✓ 完成
- 报告序列化 → Phase 26 ✓ 完成
- CI 接线 → Phase 28
- 摘要/法官评测 → Phase 27

## v2 精度门控 (Precision Gating)

v2 检索指标假设精度门控（precision gating），而非无条件启发式回退。所有通道候选在最终返回前必须通过 `MIN_CAPSULE_SCORE` 阈值过滤：

- **heuristic 通道**：在通道层面预过滤，零信号候选不进入 merge 层
- **rerank 层**：最终门控，`finalScore < MIN_CAPSULE_SCORE` 的候选被丢弃
- **空结果行为**：当所有候选低于阈值时，返回 `capsules: []` 和 `summary: null`，即使存在治理合格的 artifacts

这意味着 `v2-empty-with-summary-core` 等空结果用例期望 `0` capsules 和 `null` summary，而非低分候选的填充响应。

## v2 多路召回基准 (Phase 7)

多路召回管线（heuristic + keyword + semantic + graph 四通道）已全线落地为 v2 检索唯一路径。

### 当前基准指标

**Smoke 层** (12 个 v2 用例):

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
env WRITE_BASELINE=true TIER=smoke pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts
env WRITE_BASELINE=true TIER=core pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts

# 与基线比较（通过 eval-ci）
env TIER=smoke pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts
env TIER=core pnpm exec tsx --tsconfig tsconfig.base.json evals/scripts/eval-ci.ts

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
| `lib/assertions.ts` | 断言辅助函数 |
| `lib/format.ts` | 输出格式化 |
| `lib/report.ts` | 报告生成 |
| `lib/runner-api.ts` | 运行器 API 接口 |

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
pnpm --filter @trapmap/evals eval:retrieval --tier smoke --write-baseline --baseline ./reports/baseline.json

# 与基线比较
pnpm --filter @trapmap/evals eval:retrieval --tier smoke --baseline ./reports/baseline.json
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
pnpm --filter @trapmap/evals eval:retrieval:smoke

# 若需对比 LLM 解析效果，在服务配置中启用 AI chat 后再次运行
# 检查 RAG log metadata 中的 parseMethod 字段确认解析方式
pnpm --filter @trapmap/evals eval:retrieval:core
```

效果对比维度：
- 比较 Hit@K / MRR / nDCG 在 semanticQuery 为空（regex 基线）与启用后（LLM）的变化
- 通过 RAG log metadata 中的 `parseMethod` 和 `intentCategory` 字段识别解析方式
- `parseMethod: 'llm'` 表示 LLM 解析生效，`'regex'` 表示降级到正则 baseline

## PG 模式 Eval Harness 语义（Phase 0）

PG 模式下的评测 harness 必须与 JSON 模式产生完全相同的 auth/graph 设置语义：

- **场景 actor session 必须在 fixture seeding 之后创建**：`createExecutionContext()` 先创建 system-admin session 用于 seeding，`seedScenarioFixtures()` 完成后通过 `createActorSession()` 删除旧 session 并创建新的 actor session，确保 `subjectType`、`activeTeamId` 和 membership 状态正确。
- **Graph 文档必须通过 `services.graphIndex.upsert()` 播种**：PG 模式下 graph index 由 `service-knowledge-read` 的 `GraphIndexRepositoryPort` 持有，直接写入 store 不会同步到 PG 表。
- **回归测试**：`evals/retrieval/lib/adapters.test.ts` 验证 governance 敏感场景不以隐式 system-admin 身份运行，且 `services.graphIndex.listAll()` 可见播种的 graph 文档。

## 底层索引结构（Round 7）

检索端点依赖以下 PostgreSQL 派生索引表，均通过迁移脚本 `0005_round7_retrieval_index_structural.sql` 管理：

| 索引表 | 类型 | 用途 | 关键列 |
|--------|------|------|--------|
| `knowledge_embeddings` | pgvector HNSW | 语义相似性搜索 | `vector` (384维), `labels` (text[]) |
| `knowledge_keywords` | text[] GIN | 关键词匹配 | `tokens` (text[]), `field_tokens_shortcut/detail/labels` (text[]) |
| `knowledge_search_documents` | tsvector GIN | 全文检索 | `document` (tsvector), `labels` (text[]) |
| `graph_index_documents` | JSONB | GraphRAG-lite 图检索 | `nodes` (jsonb), `edges` (jsonb) |

所有索引表均为派生视图，不承载业务真相。索引同步通过 `PgVectorAdapter`、`PgKeywordAdapter` 和 `PgGraphIndexRepository` 完成，基于 `(entry_id, revision)` 唯一约束保证幂等性。同步状态通过 `status` 和 `last_error` 字段跟踪，支持失败重试和运维监控。

## Owner 与变更门禁

- **Owner**：检索召回/路由 owner（service-knowledge-read 检索面）
- **Tier 状态**：smoke 是 CI 门禁 tier；core tier 保留为 active（`evals/retrieval/datasets/core/`、`scenarios/core/`）
- **变更必跑**：`pnpm test:file -- evals/promptfoo/parity-retrieval.test.ts`（快照 parity，需 postgres coordinator）+ `pnpm --filter @trapmap/evals eval:retrieval:smoke`
- 修改 case/scenario/断言后若判定发生变化，需同步重新生成并提交 parity 快照（`pnpm --filter @trapmap/evals eval:snapshots`）
