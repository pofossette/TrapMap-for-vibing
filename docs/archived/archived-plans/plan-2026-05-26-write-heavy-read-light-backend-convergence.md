# 写时重读时轻后端收敛 实施计划

> **面向智能体工作者：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐阶段实施本计划。步骤使用 `- [ ]` 复选框追踪进度。

**Goal:** 将 TrapMap 收敛为“入库承担计算和外部 API 延迟，出库只读结构化事实和派生投影”的后端架构。

**Architecture:** 保持 PostgreSQL 作为唯一持久化与异步基础设施。写路径在同一事务内完成主事实写入与任务/事件登记，后台 worker 异步完成候选分析、重复检测、索引、冲突检测和投影构建；读接口只命中结构化主表、历史表和派生表，不再等待同步副作用，也不再把 `store_snapshot` 当成跨域事实源。

**Tech Stack:** TypeScript、Fastify、PostgreSQL 16、pgvector、Drizzle ORM、Vitest、GitHub Actions

---

## 文档信息

- 创建日期：2026-05-26
- 归档旧计划：`docs/archived/archived-plans/plan-2026-05-25-unified-retrieval-cache.md`
- 输出文件：`plan.md`（项目根目录）
- 设计约束：不引入 Redis、Kafka、读写分离、分区表或额外 worker 基础设施；优先复用现有 PG 队列、现有仓储接口和现有测试框架
- 目标范围：`packages/server/src/`、`packages/server/drizzle/`、`.github/workflows/`、`docs/`

## 执行前提

- 每个阶段结束都要求 `git add -A` 并提交全部工作区改动，因此执行时必须使用独立分支或独立 worktree，避免混入无关改动。
- 涉及索引、检索、治理、副作用异步化的阶段，除单元测试外至少运行一次 `pnpm eval:smoke`。

## 设计原则

- 写路径只做三件事：鉴权/校验、事务写事实、登记后台任务。
- 后台路径负责所有高延迟工作：LLM、embedding、去重、索引、冲突检测、聚合。
- 读路径默认只查结构化表和派生投影表，不再临时拼装大对象或等待副作用完成。
- `JSONB` 仅允许保留为兼容缓存、外部原始响应快照或低频扩展元数据。
- 所有迁移都必须支持幂等回填、影子核对和回滚说明。

## 阶段完成约束

**一个阶段完成，必须同时满足以下条件：**

- [ ] 本阶段所有进度复选框已完成
- [ ] 本阶段验收标准全部通过
- [ ] 本阶段要求更新的文档已同步完成
- [ ] 本阶段要求新增或修改的测试代码已提交
- [ ] 本阶段验证命令已执行并记录结果
- [ ] 已使用 `git add -A` 提交全部工作区改动

建议提交命令：

```bash
git status --short
git add -A
git commit -m "feat(server): <phase summary>"
```

## 总体文件分解

### 主要代码文件

- `packages/server/src/routes/candidates.ts`
  - 候选提交写路径；应只负责落库并登记后台任务
- `packages/server/src/lib/candidates/processor.ts`
  - 候选后台处理入口；应只由 worker 驱动
- `packages/server/src/lib/queue/task-queue.ts`
  - PG durable queue；补齐索引、幂等键和消费约束
- `packages/server/src/lib/lifecycle/`
  - 生命周期副作用异步化、outbox/投影任务编排
- `packages/server/src/lib/auth/`、`users/`、`teams/`、`audit/`
  - 将剩余身份和审计域从 `store_snapshot` 迁移到结构化表
- `packages/server/src/lib/persistence/schema.ts`
  - Drizzle 真相定义；必须与 migration 和文档一致
- `packages/server/src/app.ts`
  - worker 启停、恢复逻辑、health/readiness、优雅停机
- `packages/server/src/config.ts`
  - 运行时配置与文档对齐

### 主要数据库迁移

- `packages/server/drizzle/0009_round10_task_queue_write_path.sql`
- `packages/server/drizzle/0010_round10_lifecycle_outbox.sql`
- `packages/server/drizzle/0011_round10_identity_audit_structural.sql`
- `packages/server/drizzle/0012_round10_read_model_cleanup.sql`
- `packages/server/drizzle/0013_round10_runtime_observability.sql`

### 主要测试文件

- `packages/server/src/lib/queue/task-queue.test.ts`
- `packages/server/src/routes/candidates.test.ts`
- `packages/server/src/__tests__/candidate-pipeline.test.ts`
- `packages/server/src/routes/review.test.ts`
- `packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts`
- `packages/server/src/lib/auth/repository.test.ts`
- `packages/server/src/routes/auth.test.ts`
- `packages/server/src/routes/operations/audit.test.ts`
- `packages/server/src/lib/candidates/pg-repository.test.ts`
- `packages/server/src/lib/persistence/__tests__/schema-candidates.test.ts`
- `packages/server/src/config.test.ts`（新增）

### 主要文档文件

- `docs/architecture/components/ASYNC_INFRASTRUCTURE.md`
- `docs/architecture/components/KNOWLEDGE_LIFECYCLE.md`
- `docs/architecture/components/INDEXING.md`
- `docs/architecture/components/DEDUPLICATION.md`
- `docs/architecture/components/AUTH.md`
- `docs/architecture/components/PERSISTENCE.md`
- `docs/reference/DATA_MODEL.md`
- `docs/reference/DATABASE_SCHEMA.md`
- `docs/operations/ENVIRONMENT.md`
- `docs/operations/SECURITY.md`
- `docs/operations/TESTING.md`
- `docs/operations/CI_CD.md`

---

## Phase 1：让候选写路径真正接管 PG durable queue

**目标：** 候选提交、重试恢复和 worker 消费全部统一到 PostgreSQL 队列，HTTP 提交接口只负责写入事实并快速返回。

**涉及文件：**

- 新增：`packages/server/drizzle/0009_round10_task_queue_write_path.sql`
- 修改：`packages/server/src/lib/persistence/schema.ts`
- 修改：`packages/server/src/routes/candidates.ts`
- 修改：`packages/server/src/lib/candidates/processor.ts`
- 修改：`packages/server/src/lib/queue/task-queue.ts`
- 修改：`packages/server/src/app.ts`
- 测试：`packages/server/src/lib/queue/task-queue.test.ts`
- 测试：`packages/server/src/routes/candidates.test.ts`
- 测试：`packages/server/src/__tests__/candidate-pipeline.test.ts`
- 文档：`docs/architecture/components/ASYNC_INFRASTRUCTURE.md`
- 文档：`docs/reference/DATABASE_SCHEMA.md`
- 文档：`docs/reference/DATA_MODEL.md`

### 示例结构或代码

```sql
-- 贴合 dequeue 查询模式的部分索引
CREATE INDEX task_queue_pending_dequeue_idx
ON task_queue (type, process_after, priority DESC, created_at ASC)
WHERE status = 'pending';

-- 可选：避免同一实体的相同任务被重复排队
ALTER TABLE task_queue ADD COLUMN dedupe_key text;
CREATE UNIQUE INDEX task_queue_dedupe_pending_idx
ON task_queue (type, dedupe_key)
WHERE status IN ('pending', 'running');
```

```typescript
const store = app.skillShareer.store;
const pool = store instanceof PostgresStore ? store.getPool() : undefined;

const services: CandidateProcessorServices = {
  store,
  getSnapshot: () => store.snapshot(),
  pool,
  candidateRepo,
};

await candidateRepo.updateStatus(candidate.id, 'queued');
scheduleCandidateProcessing(candidate.id, services);

return {
  candidateId: candidate.id,
  status: 'queued',
  receivedAt: candidate.receivedAt,
};
```

### 进度追踪

- [ ] **Step 1.1：补齐队列表 migration 和 Drizzle schema**
  - 增加 `task_queue_pending_dequeue_idx`
  - 如采用幂等键，增加 `dedupe_key`
  - 在 `schema.ts` 中同步索引与字段定义
- [ ] **Step 1.2：改造候选提交路由**
  - 在 `packages/server/src/routes/candidates.ts` 中为 `CandidateProcessorServices` 传入 `pool`
  - 提交成功后立即把状态更新到 `queued`，不再依赖进程内 fire-and-forget
- [ ] **Step 1.3：改造恢复逻辑**
  - 将 `packages/server/src/app.ts` 中的中断恢复逻辑改为“重新入队”而不是直接 `processPendingCandidates()`
  - 只允许 worker 执行真实分析
- [ ] **Step 1.4：补齐队列行为测试**
  - 覆盖 `process_after`、`priority DESC`、`created_at ASC` 的消费顺序
  - 覆盖重复入队保护和失败重试
- [ ] **Step 1.5：补齐候选写路径测试**
  - `routes/candidates.test.ts` 验证 POST 仅负责落库和排队
  - `candidate-pipeline.test.ts` 验证 worker 可以从队列消费到 `ready_for_review` 或 `duplicate_detected`
- [ ] **Step 1.6：更新文档**
  - 明确“候选处理是写后异步任务，不是请求内同步处理”
  - 更新数据库结构文档中的 `task_queue` 索引与字段
- [ ] **Step 1.7：执行验证命令**

```bash
pnpm test -- --run packages/server/src/lib/queue/task-queue.test.ts packages/server/src/routes/candidates.test.ts packages/server/src/__tests__/candidate-pipeline.test.ts
pnpm typecheck
pnpm eval:smoke
```

- [ ] **Step 1.8：更新图谱并提交全部工作区改动**

```bash
git status --short
git add -A
git commit -m "feat(server): route candidate ingestion through durable pg queue"
```

### Phase 1 验收标准

- [ ] PostgreSQL 模式下，候选提交不再走进程内 `processCandidateWithRetry` 兜底分支
- [ ] 候选提交接口在排队后即可返回，不等待分析、去重或索引
- [ ] 中断恢复逻辑只会重新入队，不会在 `onReady` 中直接跑重处理
- [ ] `task_queue` 的索引与真实 dequeue 谓词一致
- [ ] 相关测试、类型检查和 smoke eval 全部通过

### Phase 1 文档更新要求

- [ ] `docs/architecture/components/ASYNC_INFRASTRUCTURE.md` 说明队列已成为候选处理唯一后台主路径
- [ ] `docs/reference/DATABASE_SCHEMA.md` 更新 `task_queue` 字段、索引和幂等说明
- [ ] `docs/reference/DATA_MODEL.md` 把 Candidate 的处理状态描述改为“写后异步推进”

### Phase 1 测试代码要求

- [ ] `task-queue.test.ts` 覆盖顺序消费、延迟消费、重试和死信
- [ ] `candidates.test.ts` 覆盖 POST 只排队不计算
- [ ] `candidate-pipeline.test.ts` 覆盖服务重启后的恢复路径

---

## Phase 2：把生命周期副作用改成异步投影

**目标：** 审核、批准、重提交流程只提交事实和事件登记；索引、冲突检测等重副作用通过 outbox/投影任务异步处理。

**涉及文件：**

- 新增：`packages/server/drizzle/0010_round10_lifecycle_outbox.sql`
- 新增：`packages/server/src/lib/lifecycle/outbox.ts`
- 新增：`packages/server/src/lib/lifecycle/outbox.test.ts`
- 修改：`packages/server/src/lib/persistence/schema.ts`
- 修改：`packages/server/src/routes/review.ts`
- 修改：`packages/server/src/lib/lifecycle/event-bus.ts`
- 修改：`packages/server/src/lib/lifecycle/subscribers/indexing.ts`
- 修改：`packages/server/src/lib/lifecycle/subscribers/conflict.ts`
- 修改：`packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts`
- 修改：`packages/server/src/app.ts`
- 文档：`docs/architecture/components/KNOWLEDGE_LIFECYCLE.md`
- 文档：`docs/architecture/components/INDEXING.md`
- 文档：`docs/architecture/components/ASYNC_INFRASTRUCTURE.md`
- 文档：`docs/architecture/components/REVIEW.md`

### 示例结构或代码

```sql
CREATE TABLE domain_event_outbox (
  id text PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_name text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX domain_event_outbox_pending_idx
ON domain_event_outbox (event_name, available_at, created_at)
WHERE status = 'pending';
```

```typescript
await knowledgeRepo.applyReviewDecision(input);

await outbox.enqueue({
  aggregateType: 'knowledge',
  aggregateId: entryId,
  eventName,
  payload: {
    entryId,
    previousState,
    nextState,
    actorId: auth.actorId,
    reason: `reviewer-${payload.decision}`,
    timestamp: nowIso(),
  },
});

return { entry: reviewedEntry };
```

### 进度追踪

- [ ] **Step 2.1：新增 outbox 表和访问层**
  - 创建 `domain_event_outbox`
  - 在 `packages/server/src/lib/lifecycle/outbox.ts` 中实现 `enqueue`、`claimBatch`、`complete`、`fail`
- [ ] **Step 2.2：改造 review 写路径**
  - `packages/server/src/routes/review.ts` 中不再 `await emitDomainEventAsync(...)`
  - 改为在事务提交后登记 outbox 事件
- [ ] **Step 2.3：改造 subscriber 执行模型**
  - PG 模式下由 worker 读取 outbox 并调用 indexing/conflict subscriber
  - JSON 模式下可继续保留原地 `eventBus` 逻辑，避免破坏轻量本地运行
- [ ] **Step 2.4：补齐幂等和重试**
  - `indexing` 和 `conflict` handler 必须支持重复执行
  - worker 失败要回写 `attempts` 和 `last_error`
- [ ] **Step 2.5：补齐测试**
  - `review.test.ts` 验证审核接口不再等待副作用
  - `outbox.test.ts` 验证事件 claim/complete/fail
  - `subscribers-integration.test.ts` 验证投影任务最终一致性
- [ ] **Step 2.6：更新文档**
  - 把生命周期状态变更后的索引/冲突处理改写为“异步投影”
- [ ] **Step 2.7：执行验证命令**

```bash
pnpm test -- --run packages/server/src/routes/review.test.ts packages/server/src/lib/lifecycle/outbox.test.ts packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts packages/server/src/lib/indexing/events.test.ts
pnpm typecheck
pnpm eval:smoke
```

- [ ] **Step 2.8：更新图谱并提交全部工作区改动**

```bash
git status --short
git add -A
git commit -m "feat(server): move lifecycle side effects to outbox-driven projections"
```

### Phase 2 验收标准

- [ ] 审核接口只提交状态变更和 outbox 事件，不再等待索引或冲突检测
- [ ] 索引和冲突检测可以由后台任务独立重试
- [ ] PG 模式下重副作用统一走 outbox/worker
- [ ] JSON 模式下本地开发流程仍可工作
- [ ] 相关测试、类型检查和 smoke eval 全部通过

### Phase 2 文档更新要求

- [ ] `docs/architecture/components/KNOWLEDGE_LIFECYCLE.md` 补充状态流转后的异步投影阶段
- [ ] `docs/architecture/components/INDEXING.md` 明确索引刷新来自后台投影任务
- [ ] `docs/architecture/components/ASYNC_INFRASTRUCTURE.md` 补充 outbox 角色
- [ ] `docs/architecture/components/REVIEW.md` 改写审核接口时序图

### Phase 2 测试代码要求

- [ ] 新增 `outbox.test.ts`
- [ ] `review.test.ts` 覆盖“请求返回先于索引完成”
- [ ] `subscribers-integration.test.ts` 覆盖失败重试和幂等重复消费

---

## Phase 3：迁出剩余身份域和审计域，停止把 `store_snapshot` 当主事实源

**目标：** Team、User、Membership、Session、AccessKey、Audit 全部落到结构化表；PG 模式下这些域不再通过 `store.snapshot()` 读取。

**涉及文件：**

- 新增：`packages/server/drizzle/0011_round10_identity_audit_structural.sql`
- 新增：`packages/server/src/lib/auth/pg-repository.ts`
- 新增：`packages/server/src/lib/users/pg-repository.ts`
- 新增：`packages/server/src/lib/teams/pg-repository.ts`
- 新增：`packages/server/src/lib/audit/pg-repository.ts`
- 新增：`packages/server/src/lib/persistence/migrate-identity-audit.ts`
- 新增：`packages/server/src/lib/persistence/migrate-identity-audit.test.ts`
- 修改：`packages/server/src/lib/auth/repository.ts`
- 修改：`packages/server/src/lib/users/repository.ts`
- 修改：`packages/server/src/lib/teams/repository.ts`
- 修改：`packages/server/src/lib/audit/repository.ts`
- 修改：`packages/server/src/routes/auth.ts`
- 修改：`packages/server/src/lib/context.ts`
- 修改：`packages/server/src/lib/repos/index.ts`
- 文档：`docs/reference/DATA_MODEL.md`
- 文档：`docs/reference/DATABASE_SCHEMA.md`
- 文档：`docs/architecture/components/AUTH.md`
- 文档：`docs/architecture/components/PERSISTENCE.md`
- 文档：`docs/operations/SECURITY.md`

### 示例结构或代码

```sql
CREATE TABLE users (
  id text PRIMARY KEY,
  handle text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id text PRIMARY KEY,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX teams_scope_slug_uidx
ON teams (slug);

CREATE TABLE memberships (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role_template text NOT NULL,
  security_level integer NOT NULL,
  permissions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, team_id)
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id text REFERENCES users(id),
  active_team_id text REFERENCES teams(id),
  subject_type text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

```typescript
export function createUserRepository(config: { pool?: Pool; store: SkillShareerStore }): UserRepository {
  if (config.pool) return new PgUserRepository(config.pool);
  return new InMemoryUserRepository(config.store);
}
```

### 进度追踪

- [ ] **Step 3.1：新增身份域和审计域结构化表**
  - `users`
  - `teams`
  - `memberships`
  - `sessions`
  - `access_keys`
  - `audit_events`
- [ ] **Step 3.2：实现 PG 仓储并切换 factory**
  - `createSessionRepository`
  - `createAccessKeyRepository`
  - `createUserRepository`
  - `createTeamRepository`
  - `createMembershipRepository`
  - `createAuditRepository`
- [ ] **Step 3.3：改造认证和团队选择读路径**
  - `packages/server/src/routes/auth.ts` 不再通过 `store.snapshot()` 解析 membership 和 session
  - `packages/server/src/lib/context.ts` 的 auth resolution 优先走 PG 仓储
- [ ] **Step 3.4：提供 backfill 与核对脚本**
  - 从 `store_snapshot` 抽取 identity/audit 数据到结构化表
  - 支持幂等重复执行
- [ ] **Step 3.5：补齐测试**
  - 仓储测试验证 PG 实现与 in-memory 行为一致
  - 路由测试验证 login/session/logout/select-team 走结构化仓储
  - audit 路由测试验证过滤、排序和 limit 行为保持一致
- [ ] **Step 3.6：更新文档**
  - 数据模型、数据库结构、认证和持久化组件文档同步改写
- [ ] **Step 3.7：执行验证命令**

```bash
pnpm test -- --run packages/server/src/lib/auth/repository.test.ts packages/server/src/lib/persistence/migrate-identity-audit.test.ts packages/server/src/routes/auth.test.ts packages/server/src/routes/operations/audit.test.ts packages/server/src/lib/repos/index.test.ts
pnpm typecheck
```

- [ ] **Step 3.8：更新图谱并提交全部工作区改动**

```bash
git status --short
git add -A
git commit -m "feat(server): migrate identity and audit domains off store_snapshot"
```

### Phase 3 验收标准

- [ ] PG 模式下，身份和审计域仓储不再退回 `store.snapshot()` 作为主路径
- [ ] 登录、登出、会话状态、团队切换、访问密钥解析都能在结构化表上完成
- [ ] 审计查询从结构化表读取并保持现有过滤行为
- [ ] backfill 支持幂等执行并能通过核对测试
- [ ] `DATA_MODEL` 中 Team/User/Member/Session/AccessKey/Audit 不再标记为快照主事实源

### Phase 3 文档更新要求

- [ ] `docs/reference/DATA_MODEL.md` 更新事实源边界
- [ ] `docs/reference/DATABASE_SCHEMA.md` 增加身份和审计表
- [ ] `docs/architecture/components/AUTH.md` 改写认证数据流
- [ ] `docs/architecture/components/PERSISTENCE.md` 删除“未来再迁移”的表述
- [ ] `docs/operations/SECURITY.md` 同步会话、访问密钥和持久化方式

### Phase 3 测试代码要求

- [ ] `auth/repository.test.ts` 增加 PG 实现覆盖
- [ ] `migrate-identity-audit.test.ts` 覆盖回填幂等和核对
- [ ] `auth.test.ts` 覆盖 login/logout/session/select-team 的结构化仓储路径
- [ ] `operations/audit.test.ts` 覆盖过滤、排序、分页限制

---

## Phase 4：清理读模型双表示，修正数据库精度和索引漂移

**目标：** 让出库路径真正只依赖结构化表和派生表；清理候选域 JSONB 双表示，修正重复相似度精度和 schema/migration drift。

**涉及文件：**

- 新增：`packages/server/drizzle/0012_round10_read_model_cleanup.sql`
- 修改：`packages/server/src/lib/persistence/schema.ts`
- 修改：`packages/server/src/lib/candidates/pg-repository.ts`
- 修改：`packages/server/src/routes/candidates.ts`
- 修改：`packages/server/src/lib/persistence/__tests__/schema-candidates.test.ts`
- 修改：`packages/server/src/lib/candidates/pg-repository.test.ts`
- 修改：`packages/server/src/routes/candidates.test.ts`
- 文档：`docs/reference/DATA_MODEL.md`
- 文档：`docs/reference/DATABASE_SCHEMA.md`
- 文档：`docs/architecture/components/DEDUPLICATION.md`
- 文档：`docs/architecture/components/PERSISTENCE.md`

### 示例结构或代码

```sql
ALTER TABLE candidate_duplicate_cases
  ALTER COLUMN highest_similarity TYPE numeric(5,3)
  USING highest_similarity / 100.0;

ALTER TABLE candidate_duplicate_matches
  ALTER COLUMN similarity_score TYPE numeric(5,3)
  USING similarity_score / 100.0;

CREATE UNIQUE INDEX IF NOT EXISTS skill_artifacts_scope_slug_uidx
ON skill_artifacts (COALESCE(team_id, '__global__'), scope, slug);
```

```typescript
return {
  id: caseRow.id,
  candidateId: caseRow.candidateId,
  highestSimilarity: Number(caseRow.highestSimilarity),
  matches: matchRows.map((m) => ({
    entityType: m.entityType as 'trap' | 'skill',
    entityId: m.entityId,
    similarityScore: Number(m.similarityScore),
    matchType: m.matchType as 'exact' | 'high-overlap' | 'semantic-similar',
  })),
};
```

### 进度追踪

- [ ] **Step 4.1：修复候选去重相似度精度**
  - 将 `highest_similarity` 和 `similarity_score` 从百分位整数语义改成三位小数
  - 更新序列化/反序列化代码，避免 `*100` / `/100` 精度损失
- [ ] **Step 4.2：让重复和人工处理读路径只依赖结构化表**
  - `GET /v1/duplicates/:candidateId`
  - `GET /v1/duplicates/:candidateId/bundle`
  - `GET /v1/candidates/:candidateId`
  - 保证在 `candidates.duplicate_case`、`analysis_snapshot`、`manual_result` 缓存为空时依然返回正确结果
- [ ] **Step 4.3：处理 schema / migration / docs 漂移**
  - 对齐 `skill_artifacts` 相关唯一索引
  - 对齐 `schema.ts`、SQL migration 和 `DATABASE_SCHEMA.md`
- [ ] **Step 4.4：补齐测试**
  - 构造“结构化表有数据但 JSONB 缓存为空”的场景
  - 验证 API 仍正常工作
- [ ] **Step 4.5：更新文档**
  - 明确哪些 JSONB 仍保留为兼容缓存
  - 明确重复检测分数精度和结构化事实源
- [ ] **Step 4.6：执行验证命令**

```bash
pnpm test -- --run packages/server/src/lib/candidates/pg-repository.test.ts packages/server/src/lib/persistence/__tests__/schema-candidates.test.ts packages/server/src/routes/candidates.test.ts
pnpm typecheck
pnpm eval:smoke
```

- [ ] **Step 4.7：更新图谱并提交全部工作区改动**

```bash
git status --short
git add -A
git commit -m "refactor(server): read candidates and duplicates from structured projections"
```

### Phase 4 验收标准

- [ ] 重复相似度在持久化后仍保留三位小数精度
- [ ] 候选和重复相关读接口在 JSONB 缓存为空时仍能正常返回
- [ ] `schema.ts`、migration 和文档中的索引/字段定义一致
- [ ] JSONB 列只保留为兼容缓存或过渡字段，不再是读路径真相来源
- [ ] 相关测试、类型检查和 smoke eval 全部通过

### Phase 4 文档更新要求

- [ ] `docs/reference/DATA_MODEL.md` 标注 Candidate 读路径已结构化优先
- [ ] `docs/reference/DATABASE_SCHEMA.md` 更新重复检测字段类型和索引
- [ ] `docs/architecture/components/DEDUPLICATION.md` 更新相似度存储和读取流程
- [ ] `docs/architecture/components/PERSISTENCE.md` 明确兼容缓存退场策略

### Phase 4 测试代码要求

- [ ] `pg-repository.test.ts` 覆盖精度 round-trip
- [ ] `schema-candidates.test.ts` 覆盖字段类型和索引对齐
- [ ] `candidates.test.ts` 覆盖 JSONB 缓存为空但结构化表完整的读取路径

---

## Phase 5：补齐运行时配置、可观测性、优雅停机和 CI 基线

**目标：** 把运行时配置、文档、安全说明和 CI 真实校验统一起来，避免“代码与文档不一致”的持续漂移。

**涉及文件：**

- 新增：`packages/server/src/config.test.ts`
- 修改：`packages/server/src/config.ts`
- 修改：`packages/server/src/app.ts`
- 修改：`.github/workflows/ci.yml`
- 文档：`docs/operations/ENVIRONMENT.md`
- 文档：`docs/operations/SECURITY.md`
- 文档：`docs/operations/TESTING.md`
- 文档：`docs/operations/CI_CD.md`
- 文档：`docs/architecture/components/ASYNC_INFRASTRUCTURE.md`

### 示例结构或代码

```typescript
export const ServerConfigSchema = z.object({
  dataFile: z.string().min(1),
  databaseUrl: z.string().url().nullable(),
  host: HostSchema,
  port: PortSchema,
  systemAdminKey: z.string().nullable(),
  corsAllowedOrigins: z.array(z.string()).default(['*']),
  rateLimitMaxPerMinute: z.number().int().min(0).default(0),
  sessionTransport: z.enum(['bearer-header', 'cookie']).default('bearer-header'),
  userOpsLog: UserOpsLogSchema,
  ragLog: RagLogSchema,
  ai: ...
});
```

```typescript
app.get('/ready', async () => ({
  ok: true,
  queueWorkerRunning: app.taskWorker?.isRunning() ?? false,
  database: app.skillShareer.store instanceof PostgresStore ? 'postgres' : 'json-store',
}));

app.addHook('onClose', async () => {
  await app.taskWorker?.stop();
});
```

```yaml
postgres-integration:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: pgvector/pgvector:pg16
      env:
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: trapmap
      ports:
        - 5432:5432
```

### 进度追踪

- [ ] **Step 5.1：统一运行时配置与文档**
  - `config.ts` 新增或删除文档中已提到但代码未支持的变量
  - 明确当前真实会话传输方式是 `Bearer`/`x-session-token` 还是 cookie
- [ ] **Step 5.2：补 readiness 和优雅停机**
  - `/health` 继续保留
  - 增加 `/ready` 或扩展现有 health 结构
  - 在 `onClose` 中停止 task worker，释放资源
- [ ] **Step 5.3：补真实 PG/pgvector CI 校验**
  - 为 server 增加带 PostgreSQL 服务的测试 job
  - 至少运行候选队列、生命周期投影、结构化仓储相关测试
- [ ] **Step 5.4：补配置测试**
  - 覆盖环境变量解析、默认值和非法值 fail-fast
- [ ] **Step 5.5：更新文档**
  - `ENVIRONMENT.md`、`SECURITY.md`、`TESTING.md`、`CI_CD.md`
  - 说明哪些命令在本地和 CI 中必须跑 PG 服务
- [ ] **Step 5.6：执行验证命令**

```bash
pnpm test -- --run packages/server/src/config.test.ts packages/server/src/routes/auth.test.ts packages/server/src/lib/queue/task-queue.test.ts packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts
pnpm typecheck
pnpm check
pnpm eval:smoke
```

- [ ] **Step 5.7：更新图谱并提交全部工作区改动**

```bash
git status --short
git add -A
git commit -m "chore(server): align runtime config docs and pg-backed ci coverage"
```

### Phase 5 验收标准

- [ ] 运行时配置和 `ENVIRONMENT.md`、`SECURITY.md` 描述一致
- [ ] 服务关闭时 worker 可以优雅停止，不遗留活跃任务
- [ ] CI 至少有一条真实 PostgreSQL/pgvector 校验链路
- [ ] 新增配置测试覆盖默认值、非法值和认证传输方式
- [ ] 相关测试、类型检查、check 和 smoke eval 全部通过

### Phase 5 文档更新要求

- [ ] `docs/operations/ENVIRONMENT.md` 只保留真实受支持的配置项
- [ ] `docs/operations/SECURITY.md` 准确描述会话和访问密钥机制
- [ ] `docs/operations/TESTING.md` 增加 PG 集成测试要求
- [ ] `docs/operations/CI_CD.md` 增加 PG/pgvector job 说明
- [ ] `docs/architecture/components/ASYNC_INFRASTRUCTURE.md` 补充 worker 生命周期与 readiness

### Phase 5 测试代码要求

- [ ] 新增 `packages/server/src/config.test.ts`
- [ ] `auth.test.ts` 覆盖实际 token 传输方式
- [ ] CI job 至少跑队列、投影和结构化仓储路径测试

---

## 实施顺序建议

1. 先做 Phase 1 和 Phase 2，把“请求内同步重处理”彻底切掉。
2. 再做 Phase 3，缩小 `store_snapshot` 的跨域事实面。
3. 接着做 Phase 4，把读路径真正固定到结构化表和派生表。
4. 最后做 Phase 5，收口配置、观测和 CI，防止后续再次漂移。

## 自检清单

- [ ] 每个阶段都能回答“这一步如何减少请求内计算或出库压力？”
- [ ] 每个新表或新索引都在 `schema.ts`、migration 和文档中三方对齐
- [ ] 每次迁移都提供幂等 backfill 或数据核对策略
- [ ] 每个阶段都有独立测试命令、独立文档更新和独立提交
- [ ] 没有任何阶段要求引入新的外部基础设施

## 完成后的目标状态

- 候选提交、审核和批准接口只负责写事实和登记后台任务
- 候选分析、去重、索引、冲突检测和投影统一由 PG 后台任务推进
- Team/User/Membership/Session/AccessKey/Audit 脱离 `store_snapshot`
- 读接口默认只查结构化表和派生表
- 运行时配置、文档、测试和 CI 对同一套真实行为达成一致
