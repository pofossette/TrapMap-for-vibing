
# @trapmap/service-candidate-ingestion

宿主组件共享的候选摄取服务模块。负责接收、分析、去重检测候选提交（trap/skill），并管理候选生命周期直至解决。

## 边界归属

`candidate-ingestion` 拥有候选摄取工作流、去重分析和候选生命周期状态机。它接收候选提交，执行指纹/相似度分析，检测与已批准知识条目的重复，并将候选推进至审查或解决。

- **数据归属**：`candidates`、`candidate_analyses`、`candidate_duplicate_cases`、`candidate_duplicate_matches`、`candidate_manual_results`、`candidate_resolution_outcomes`、`entity_lineage`
- **投影归属**：无（读侧投影由其他服务拥有）
- **不拥有**：知识聚合写入（`knowledge-write`）、治理审查流（`governance-review`）、任务队列运行时（`job-runtime`）

### 同步边界

候选处理的后续操作（如发布候选结果到知识库）通过远程 `job-runtime` schedule surface 提交并返回 owner 提供的 `jobId`。本服务不获取 task queue/outbox runtime capability，也不在 `job-runtime` 返回 `409`、`503` 或 `504` 时 direct-write 或本地 enqueue；这些错误按 `InvocationError` 语义返回。

### 异步边界

候选处理任务通过 PostgreSQL-backed task queue 异步执行。任务的 claim、complete、fail、requeue、retry 和 dead-letter 运行时操作由本服务内部的 `processing-task-queue` 模块管理。

## 候选生命周期

候选从提交到解决经历以下状态：

```
received → queued → analyzing → duplicate_detected / ready_for_review → resolved
                                  ↓ (on error)
                                 error → (retry) → received
```

| 状态 | 说明 |
|---|---|
| `received` | 候选已接收，等待处理 |
| `queued` | 已排入任务队列 |
| `analyzing` | 正在执行去重分析 |
| `duplicate_detected` | 检测到与已批准条目重复 |
| `ready_for_review` | 无重复，等待人工审查 |
| `resolved` | 候选已解决（独立发布或合并） |
| `error` | 处理失败，可重试（最多 3 次） |

## 去重检测

### 指纹与相似度分析

候选通过 `buildNormalizedDuplicateInput` 标准化为指纹、关键词和 token 集合：

- **Trap 候选**：基于 `shortcut` + `detail` + `labels` 生成 SHA-256 指纹
- **Skill 候选**：基于文件 SHA-256 哈希生成指纹

相似度使用 Jaccard 系数计算 token 集合重叠：

| 相似度阈值 | 匹配类型 | 说明 |
|---|---|---|
| 1.0（指纹完全匹配） | `exact` | 实质性相同的内容 |
| >= 0.72 | `high-overlap` | 高度重叠，可能需要合并 |
| >= 0.38 | `semantic-similar` | 语义相似，存在冗余 |
| < 0.38 | 不匹配 | 不视为重复 |

### LLM 增强去重（Phase 2）

`llm-dedup.ts` 提供可选的 LLM 驱动重复判断能力，当 LLM 配置可用时返回结构化判断（`exact`/`semantic`/`none` + 置信度 + 推理说明），否则回退到 Jaccard 检测。

## HTTP 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/internal/candidates` | 提交新候选 |
| `GET` | `/internal/candidates/:candidateId` | 获取候选详情 |
| `GET` | `/internal/candidates` | 按状态列出候选（默认 `received`） |
| `POST` | `/internal/candidates/:candidateId/resolution` | 提交解决决策（需 trusted actor） |
| `POST` | `/internal/candidates/:candidateId/manual-result` | 提交人工审查结果（需 trusted actor） |
| `POST` | `/internal/candidates/:candidateId/publish` | 发布候选结果（需 trusted actor） |
| `GET` | `/internal/health` | 健康检查 |

Trusted actor 端点需要 `x-trapmap-actor-id` 请求头，且 body 中的 `actorId` 必须与之一致。

## 主要导出

### 服务组装

```typescript
import {
  createCandidateIngestionDeps,
  createCandidateIngestionServiceModule,
  createCandidateIngestionServer,
} from '@trapmap/service-candidate-ingestion';

// 创建依赖
const deps = createCandidateIngestionDeps({
  candidateRepo,
  auditLog,
  knowledgeWrite,
  jobRuntime, // 可选
});

// 创建服务模块（返回 CandidateIngestionPort）
const module = createCandidateIngestionServiceModule(deps);

// 或创建完整 Fastify 服务器
const server = await createCandidateIngestionServer(
  { host: '0.0.0.0', port: 3000, logLevel: 'info' },
  deps,
);
await server.start();
```

### PostgreSQL 数据层

```typescript
import {
  createCandidateIngestionPgOwnerBundle,
  runCandidateIngestionMigrations,
} from '@trapmap/service-candidate-ingestion';

// 运行数据库迁移
await runCandidateIngestionMigrations(pool);

// 创建 PostgreSQL-backed 仓库
const bundle = createCandidateIngestionPgOwnerBundle(pool);
// bundle.candidateRepo, bundle.duplicateCases, bundle.resolutionOutcomes, bundle.lineage
```

### 候选处理运行时

```typescript
import {
  createCandidateProcessingRuntime,
  createCandidateProcessingTaskQueue,
  processCandidate,
  recoverInterruptedCandidates,
} from '@trapmap/service-candidate-ingestion';

// 创建任务队列
const queue = createCandidateProcessingTaskQueue(pool);

// 创建处理运行时（自动恢复中断的候选）
const runtime = createCandidateProcessingRuntime({
  candidateRepo,
  corpus,
  now: () => new Date().toISOString(),
  createId: () => crypto.randomUUID(),
  queue,
});
await runtime.start();
// ... 运行时自动消费任务队列
await runtime.close();
```

### 去重检测（独立使用）

```typescript
import {
  buildNormalizedDuplicateInput,
  createCandidateDuplicateDetector,
} from '@trapmap/service-candidate-ingestion';

const normalized = buildNormalizedDuplicateInput(candidate);
const detect = createCandidateDuplicateDetector(corpus, {
  now: () => new Date().toISOString(),
  createId: () => crypto.randomUUID(),
});
const result = await detect(candidate, normalized);
// result.analysisSnapshot, result.duplicateCase
```

## 数据库 Schema

本服务拥有以下 PostgreSQL 表（通过 Drizzle ORM 定义）：

| 表名 | 说明 |
|---|---|
| `candidates` | 候选提交主表 |
| `candidate_analyses` | 指纹与分析快照 |
| `candidate_duplicate_cases` | 重复检测案例 |
| `candidate_duplicate_matches` | 重复匹配详情 |
| `candidate_manual_results` | 人工审查结果 |
| `candidate_resolution_outcomes` | 解决决策记录 |
| `entity_lineage` | 实体血缘关系（`published_as` / `merged_into`） |

迁移文件位于 `drizzle/` 目录。使用 `runCandidateIngestionMigrations(pool)` 执行迁移。

## 依赖

| 包 | 说明 |
|---|---|
| `@trapmap/backend-core` | 共享端口定义、`InvocationError`、迁移工具 |
| `@trapmap/contracts` | 共享类型（`CandidateSubmission`、`DuplicateCase` 等） |
| `fastify` | HTTP 框架 |
| `drizzle-orm` | PostgreSQL ORM/查询构建器 |
| `pg` | PostgreSQL 客户端 |

## 测试文件

| 文件 | 覆盖范围 |
|---|---|
| `src/domain/fingerprint-and-duplicate.test.ts` | 指纹生成、相似度计算、去重检测 |
| `src/processing.test.ts` | 候选处理流程、重启恢复、dead-letter 处理 |
| `src/processing-task-queue.test.ts` | PostgreSQL-backed 任务队列 |
| `src/routes.test.ts` | HTTP 端点路由 |
| `src/migrations.test.ts` | 数据库迁移 |
| `src/pg-ports.test.ts` | PostgreSQL 仓库实现 |

## 验证

```bash
pnpm --filter @trapmap/service-candidate-ingestion test --run
pnpm --filter @trapmap/service-candidate-ingestion test --run src/processing.test.ts  # 单文件
pnpm typecheck
```

## 相关文档

- 真相来源：[`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../../docs/reference/SYSTEM_TRUTH_SOURCES.md)
- 架构边界：[`docs/architecture/BOUNDARIES.md`](../../docs/architecture/BOUNDARIES.md)
