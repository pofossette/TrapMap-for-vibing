# 服务端复杂度与文档漂移收敛实施计划

> **面向智能体工作者：** 使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务实施本计划。所有步骤使用复选框 `- [x]` 跟踪进度。

**目标：** 降低 TrapMap 服务端的结构复杂度，拆分超大热点文件，并建立带测试约束的文档真相源机制，防止架构文档继续偏离代码现实。

**架构：** 保持现有公开 API 契约稳定，把 `packages/server/src/app.ts` 收敛为薄组合根，将启动与运行时职责抽到显式 bootstrap 模块，并把超大的路由/仓储文件拆成按责任划分的小模块。同时引入真相源文档、文档 smoke 测试和 CI 守卫，让未来的结构变更必须同步更新文档与复杂度预算。

**技术栈：** TypeScript、Fastify、Drizzle ORM、Vitest、pnpm、Biome、GitHub Actions、graphify

---

## 计划元信息

- 已归档旧的根计划到 `docs/archived/archived-plans/plan-2026-05-26-write-heavy-read-light-backend-convergence.md`
- 本次输出文件：`plan.md`（按用户要求保留在仓库根目录）
- 主要关注点：
  - 服务端复杂度收敛
  - 文档漂移治理
- 非目标：
  - 不修改检索排序或相关性策略
  - 不在本轮中全仓重命名遗留的 `SkillShareer*` 标识符
  - 除非重构需要内部适配，否则不修改公开 API 形状

## 当前热点

- `packages/server/src/app.ts`：641 行
- `packages/server/src/routes/candidates.ts`：527 行
- `packages/server/src/lib/persistence/schema.ts`：1888 行
- `packages/server/src/lib/artifacts/pg-repository.ts`：1531 行
- 已确认的文档漂移：
  - `docs/guides/CODE_GUIDE.md` 仍然写的是 `createApp()`
  - `docs/architecture/ARCHITECTURE.md` 与 `docs/PACKAGES.md` 仍把身份域/审计域描述成 `store_snapshot` 主路径
  - `docs/reference/DATA_MODEL.md` 描述的是更新后的 PG-first 现实

## 阶段追踪

- [x] 任务 1：建立文档真相源并清理已知漂移
- [x] 任务 2：拆分启动与 bootstrap 逻辑并修正初始化顺序
- [x] 任务 3：通过路由/服务分层降低 candidate 路由复杂度
- [x] 任务 4：拆分持久化 schema 与 Artifact PG 仓储热点
- [x] 任务 5：把文档漂移与复杂度预算接入 CI 守卫

## 通用完成定义

**任一阶段完成时，必须同时满足以下条件：**

- [x] 本阶段所有复选框均已完成
- [x] 本阶段完成标准已经满足
- [x] 本阶段要求的文档已在同一个变更中同步更新
- [x] 本阶段要求的测试已在同一个变更中新增或更新
- [x] 本阶段要求的 eval 验证已经执行
- [x] 如果改动了代码文件，已经执行 `rtk graphify update .`
- [x] 已在独立分支或独立 worktree 中提交本阶段工作

建议的阶段收尾命令：

```bash
rtk pnpm typecheck
rtk pnpm check
rtk graphify update .
git status --short
git add -A
git commit -m "refactor(server): <阶段摘要>"
```

## 目标文件结构

**预计新增的文件与目录**

- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `packages/server/src/__tests__/docs-truth-smoke.test.ts`
- `packages/server/src/bootstrap/run-startup-sequence.ts`
- `packages/server/src/bootstrap/bootstrap-repositories.ts`
- `packages/server/src/bootstrap/bootstrap-candidate-recovery.ts`
- `packages/server/src/bootstrap/bootstrap-workers.ts`
- `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- `packages/server/src/bootstrap/bootstrap-graph-reconciliation.ts`
- `packages/server/src/routes/candidates/index.ts`
- `packages/server/src/routes/candidates/submit.ts`
- `packages/server/src/routes/candidates/query.ts`
- `packages/server/src/routes/candidates/resolution.ts`
- `packages/server/src/routes/candidates/duplicates.ts`
- `packages/server/src/lib/candidates/services/submission-service.ts`
- `packages/server/src/lib/candidates/services/query-service.ts`
- `packages/server/src/lib/candidates/services/resolution-service.ts`
- `packages/server/src/lib/persistence/schema/index.ts`
- `packages/server/src/lib/persistence/schema/auth.ts`
- `packages/server/src/lib/persistence/schema/knowledge.ts`
- `packages/server/src/lib/persistence/schema/artifacts.ts`
- `packages/server/src/lib/persistence/schema/retrieval.ts`
- `packages/server/src/lib/persistence/schema/queue.ts`
- `packages/server/src/lib/artifacts/pg-repository/index.ts`
- `packages/server/src/lib/artifacts/pg-repository/revision-reader.ts`
- `packages/server/src/lib/artifacts/pg-repository/revision-writer.ts`
- `packages/server/src/lib/artifacts/pg-repository/derived-store.ts`
- `packages/server/src/lib/artifacts/pg-repository/record-reconstruction.ts`
- `scripts/check-doc-drift.ts`
- `scripts/check-complexity-budgets.ts`
- `scripts/complexity-budgets.json`

---

### 任务 1：建立文档真相源并清理已知漂移

**文件：**
- 新建：`docs/reference/SYSTEM_TRUTH_SOURCES.md`
- 新建：`packages/server/src/__tests__/docs-truth-smoke.test.ts`
- 修改：`README.md`
- 修改：`architecture.md`
- 修改：`docs/README.md`
- 修改：`docs/guides/CODE_GUIDE.md`
- 修改：`docs/architecture/ARCHITECTURE.md`
- 修改：`docs/PACKAGES.md`
- 修改：`docs/reference/DATA_MODEL.md`

**阶段完成标准：**
- `docs/guides/CODE_GUIDE.md` 不再出现 `createApp()`
- 面向架构的关键文档统一指向一个真相源文档
- `ARCHITECTURE.md`、`PACKAGES.md`、`DATA_MODEL.md` 对 `store_snapshot` 的现状描述一致
- 一旦旧入口名或缺失真相源链接再次出现，文档 smoke 测试会失败

**阶段文档更新要求：**
- 引入 `docs/reference/SYSTEM_TRUTH_SOURCES.md`，明确每个主题对应的权威来源
- 在 `README.md` 与 `docs/README.md` 中链接新的真相源文档
- 将 `docs/guides/CODE_GUIDE.md` 的启动部分改写为围绕 `buildServer()`
- 对齐 `docs/architecture/ARCHITECTURE.md`、`docs/PACKAGES.md` 与 `docs/reference/DATA_MODEL.md` 中的持久化现状叙述

**阶段测试 / Eval 更新要求：**
- 新增文档 smoke 测试，至少断言：
  - `CODE_GUIDE.md` 包含 `buildServer()`
  - `CODE_GUIDE.md` 不包含 `createApp()`
  - 关键文档引用了 `SYSTEM_TRUTH_SOURCES.md`
- 本阶段不修改 eval 数据集
- 运行一次 `rtk pnpm eval:smoke`，确保文档修订没有掩盖已有服务端启动回归

**必要的结构或代码示例：**

```md
# System Truth Sources

| 主题 | 权威来源 | 备注 |
| --- | --- | --- |
| 服务端入口 | `packages/server/src/app.ts` | 导出 `buildServer()` |
| 服务启动顺序 | `packages/server/src/bootstrap/run-startup-sequence.ts` | 在任务 2 创建 |
| 持久化现状 | `docs/reference/DATA_MODEL.md` | 面向人的当前迁移状态说明 |
| 数据表定义 | `packages/server/src/lib/persistence/schema/index.ts` | 在任务 4 建立 re-export barrel |
| API 表面 | `docs/reference/api-surface.md` | 面向使用者的契约视图 |
```

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('docs truth smoke', () => {
  it('CODE_GUIDE 使用当前的服务端入口名', () => {
    const guide = readFileSync(
      resolve(process.cwd(), 'docs/guides/CODE_GUIDE.md'),
      'utf8',
    );

    expect(guide).toContain('buildServer()');
    expect(guide).not.toContain('createApp()');
  });
});
```

- [x] **步骤 1.1：先写失败中的文档 smoke 测试**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('docs truth smoke', () => {
  it('CODE_GUIDE 使用当前的服务端入口名', () => {
    const guide = readFileSync(
      resolve(process.cwd(), 'docs/guides/CODE_GUIDE.md'),
      'utf8',
    );

    expect(guide).toContain('buildServer()');
    expect(guide).not.toContain('createApp()');
  });
});
```

运行：`rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`  
预期：FAIL，因为 `docs/guides/CODE_GUIDE.md` 仍然提到 `createApp()`

- [x] **步骤 1.2：创建权威真相源文档**

```md
# System Truth Sources

| 主题 | 权威来源 | 次级文档 |
| --- | --- | --- |
| 服务端入口 | `packages/server/src/app.ts` | `docs/guides/CODE_GUIDE.md`、`architecture.md` |
| 启动顺序 | `packages/server/src/bootstrap/run-startup-sequence.ts` | `docs/architecture/ARCHITECTURE.md` |
| 持久化迁移状态 | `docs/reference/DATA_MODEL.md` | `docs/PACKAGES.md`、`docs/architecture/ARCHITECTURE.md` |
| DB schema | `packages/server/src/lib/persistence/schema/index.ts` | `docs/reference/DATABASE_SCHEMA.md` |
```

- [x] **步骤 1.3：重写过时的启动与持久化描述**

```md
### 2.1 应用启动 — `src/app.ts`

从 `buildServer()` 开始读。它负责创建 Fastify 实例、装配共享服务，并调用显式的 startup sequence。

- `packages/server/src/bootstrap/run-startup-sequence.ts` 负责 onReady 初始化顺序
- `packages/server/src/bootstrap/bootstrap-repositories.ts` 负责仓储装配
- `packages/server/src/bootstrap/bootstrap-workers.ts` 负责后台 worker 生命周期
```

```md
- `store_snapshot` 是兼容层，不再描述为身份域/审计域的 PG 主读取路径
- 身份域和审计域当前的 PG 主路径以 `docs/reference/DATA_MODEL.md` 为准
```

- [x] **步骤 1.4：在根 README 和文档索引里链接真相源文档**

```md
- [系统真相源](docs/reference/SYSTEM_TRUTH_SOURCES.md) — 架构事实、入口文件与文档引用规则
```

- [x] **步骤 1.5：重新运行 smoke 测试和静态检查**

运行：`rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`  
预期：PASS

运行：`rtk pnpm check`  
预期：PASS

- [x] **步骤 1.6：运行更大范围验证并提交**

运行：`rtk pnpm typecheck`  
预期：PASS

运行：`rtk pnpm eval:smoke`  
预期：PASS

运行：`git add -A && git commit -m "docs: establish server truth sources"`  
预期：成功生成包含文档和 smoke 测试的提交

---

### 任务 2：拆分启动与 bootstrap 逻辑并修正初始化顺序

**文件：**
- 新建：`packages/server/src/bootstrap/run-startup-sequence.ts`
- 新建：`packages/server/src/bootstrap/bootstrap-repositories.ts`
- 新建：`packages/server/src/bootstrap/bootstrap-candidate-recovery.ts`
- 新建：`packages/server/src/bootstrap/bootstrap-workers.ts`
- 新建：`packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- 新建：`packages/server/src/bootstrap/bootstrap-graph-reconciliation.ts`
- 新建：`packages/server/src/bootstrap/startup.test.ts`
- 修改：`packages/server/src/app.ts`
- 修改：`packages/server/src/lib/context.ts`
- 修改：`packages/server/src/index.ts`
- 修改：`docs/guides/CODE_GUIDE.md`
- 修改：`docs/architecture/ARCHITECTURE.md`
- 修改：`docs/reference/SYSTEM_TRUTH_SOURCES.md`

**阶段完成标准：**
- `packages/server/src/app.ts` 从 641 行收敛到不超过 350 行，并回到薄组合根角色
- 仓储初始化发生在 candidate 恢复和任何依赖 repos 的 worker 之前
- `rtk pnpm eval:smoke` 不再反复打印 `Failed to check for interrupted candidates` 启动噪声
- 启动顺序可以从一个 orchestrator 模块中直接读懂，而不是分散在多个 `onReady` 钩子里

**阶段文档更新要求：**
- 在 `CODE_GUIDE.md` 中把启动阅读入口改为 `bootstrap/run-startup-sequence.ts`
- 在 `ARCHITECTURE.md` 中明确写出启动顺序
- 在 `SYSTEM_TRUTH_SOURCES.md` 中把启动 orchestrator 标为该主题的权威来源

**阶段测试 / Eval 更新要求：**
- 新增启动顺序测试，若 candidate recovery 在 repo 创建前运行则失败
- 扩展现有启动路径测试，验证 worker 启停仍然正常
- 因为启动顺序直接影响运行时行为，本阶段必须重新跑 `eval:smoke`

**必要的结构或代码示例：**

```text
packages/server/src/bootstrap/
├── run-startup-sequence.ts
├── bootstrap-repositories.ts
├── bootstrap-candidate-recovery.ts
├── bootstrap-workers.ts
├── bootstrap-lifecycle.ts
└── bootstrap-graph-reconciliation.ts
```

```ts
import type { FastifyInstance } from 'fastify';

export async function runStartupSequence(app: FastifyInstance): Promise<void> {
  await bootstrapRepositories(app);
  await bootstrapCandidateRecovery(app);
  await bootstrapWorkers(app);
  await bootstrapGraphReconciliation(app);
  await bootstrapLifecycle(app);
}
```

- [x] **步骤 2.1：先写失败中的启动顺序测试**

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildServer } from './app.js';

describe('startup sequence', () => {
  it('在 candidate recovery 前初始化 repos', async () => {
    const server = buildServer();
    const logSpy = vi.spyOn(server.log, 'error');

    await server.ready();

    expect(logSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Failed to check for interrupted candidates',
    );
  });
});
```

运行：`rtk pnpm test -- --run packages/server/src/bootstrap/startup.test.ts`  
预期：FAIL，因为当前 `app.ts` 里 recovery 与 `repos` 装配顺序不稳定

- [x] **步骤 2.2：把仓储初始化抽成独立模块**

```ts
export async function bootstrapRepositories(app: FastifyInstance): Promise<void> {
  const store = app.skillShareer.store;
  if (store instanceof PostgresStore) {
    const pool = store.getPool();
    app.skillShareer.repos = await createAllRepos({ store, pool });
    return;
  }

  app.skillShareer.repos = await createAllRepos({ store });
}
```

- [x] **步骤 2.3：把 candidate recovery 与 runtime worker 抽成有序模块**

```ts
export async function bootstrapCandidateRecovery(app: FastifyInstance): Promise<void> {
  const { candidate: candidateRepo } = app.skillShareer.repos;
  await recoverInterruptedCandidates(app, candidateRepo);
}
```

```ts
export async function bootstrapWorkers(app: FastifyInstance): Promise<void> {
  const store = app.skillShareer.store;
  if (!(store instanceof PostgresStore)) return;

  const worker = createTaskWorker({
    pool: store.getPool(),
    handlers: [createCandidateTaskHandler(app)],
    pollIntervalMs: 1000,
    concurrency: 1,
  });

  void worker.run();
  app.decorate('taskWorker', worker);
}
```

- [x] **步骤 2.4：用一个 startup sequence hook 替换分散的 `onReady` 块**

```ts
app.addHook('onReady', async () => {
  await runStartupSequence(app);
});
```

- [x] **步骤 2.5：更新启动相关文档**

```md
启动顺序以 `packages/server/src/bootstrap/run-startup-sequence.ts` 为准：
1. repositories
2. candidate recovery
3. background workers
4. graph reconciliation
5. lifecycle / outbox subscribers
```

- [x] **步骤 2.6：运行验证**

运行：`rtk pnpm test -- --run packages/server/src/bootstrap/startup.test.ts packages/server/src/__tests__/candidate-pipeline.test.ts packages/server/src/lib/queue/task-queue.test.ts`  
预期：PASS

运行：`rtk pnpm eval:smoke`  
预期：PASS，且不再出现重复的 `Failed to check for interrupted candidates` 启动日志

- [x] **步骤 2.7：更新图谱并提交**

运行：`rtk graphify update .`  
预期：图谱更新成功

运行：`git add -A && git commit -m "refactor(server): extract startup sequence"`  
预期：成功生成提交

---

### 任务 3：通过路由/服务分层降低 candidate 路由复杂度

**文件：**
- 新建：`packages/server/src/routes/candidates/index.ts`
- 新建：`packages/server/src/routes/candidates/submit.ts`
- 新建：`packages/server/src/routes/candidates/query.ts`
- 新建：`packages/server/src/routes/candidates/resolution.ts`
- 新建：`packages/server/src/routes/candidates/duplicates.ts`
- 新建：`packages/server/src/lib/candidates/services/submission-service.ts`
- 新建：`packages/server/src/lib/candidates/services/query-service.ts`
- 新建：`packages/server/src/lib/candidates/services/resolution-service.ts`
- 修改：`packages/server/src/routes/candidates.ts`
- 修改：`packages/server/src/routes/candidates.test.ts`
- 修改：`packages/server/src/routes/review.test.ts`
- 修改：`docs/guides/CODE_GUIDE.md`
- 修改：`docs/architecture/API.md`
- 修改：`docs/architecture/MODULES.md`

**阶段完成标准：**
- `packages/server/src/routes/candidates.ts` 收敛为不超过 150 行的兼容 barrel
- candidate 提交、查询、重复项处理、人工 resolution 等逻辑按责任拆开
- 路由测试在不改变外部端点形状的前提下保持通过
- 路由文件不再同时混合请求解析、业务编排和记录变更

**阶段文档更新要求：**
- 在 `CODE_GUIDE.md` 中加入新的 candidate 路由目录导航
- 在 `API.md` 与 `MODULES.md` 中更新拆分后的入口
- 明确哪个 service 文件负责 submission，哪个负责 resolution

**阶段测试 / Eval 更新要求：**
- 保留 `routes/candidates.test.ts` 作为 API 契约覆盖
- 如果业务逻辑从路由层下沉，补充更聚焦的 service 测试
- 为了覆盖摄取和检索链路，本阶段必须重跑 `eval:smoke`

**必要的结构或代码示例：**

```text
packages/server/src/routes/candidates/
├── index.ts
├── submit.ts
├── query.ts
├── resolution.ts
└── duplicates.ts
```

```ts
export function candidateRoutes(app: FastifyInstance) {
  app.register(candidateSubmissionRoutes);
  app.register(candidateQueryRoutes);
  app.register(candidateResolutionRoutes);
  app.register(candidateDuplicateRoutes);
}
```

```ts
export async function submitCandidate(
  input: SubmitCandidateInput,
  services: CandidateSubmissionServices,
): Promise<SubmitCandidateResult> {
  const candidate = await services.repo.insert(input);
  await services.queue.enqueue(candidate.id);
  return { candidateId: candidate.id, status: 'queued' };
}
```

- [x] **步骤 3.1：先用契约测试冻结当前路由行为**

```ts
it('POST /v1/candidates 在重构后仍返回 queued 状态', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/candidates',
    payload: validCandidatePayload,
  });

  expect(response.statusCode).toBe(202);
  expect(response.json()).toMatchObject({ status: 'queued' });
});
```

运行：`rtk pnpm test -- --run packages/server/src/routes/candidates.test.ts`  
预期：在重构前先 PASS

- [x] **步骤 3.2：为 submission、query、resolution 建立 service 边界**

```ts
export interface CandidateSubmissionServices {
  repo: CandidateRepository;
  queue: { enqueue(candidateId: string): Promise<void> };
  audit: { record(event: string, entityId: string): Promise<void> };
}
```

- [x] **步骤 3.3：把大路由文件拆成聚焦模块**

```ts
// packages/server/src/routes/candidates.ts
export { candidateRoutes } from './candidates/index.js';
```

- [x] **步骤 3.4：把 duplicate 和 manual-resolution 逻辑移到 service 调用后面**

```ts
const result = await resolveCandidate(
  { candidateId, resolution },
  { repo: services.repos.candidate, lineage: services.repos.lineage },
);
```

- [x] **步骤 3.5：更新路由与模块文档**

```md
`packages/server/src/routes/candidates/submit.ts`
- 负责 POST 提交处理器

`packages/server/src/lib/candidates/services/submission-service.ts`
- 负责 candidate 记录创建和入队语义
```

- [x] **步骤 3.6：运行验证**

运行：`rtk pnpm test -- --run packages/server/src/routes/candidates.test.ts packages/server/src/routes/review.test.ts packages/server/src/__tests__/candidate-pipeline.test.ts`  
预期：PASS

运行：`rtk pnpm eval:smoke`  
预期：PASS

- [x] **步骤 3.7：更新图谱并提交**

运行：`rtk graphify update .`  
预期：图谱更新成功

运行：`git add -A && git commit -m "refactor(server): split candidate routes and services"`  
预期：成功生成提交

---

### 任务 4：拆分持久化 schema 与 Artifact PG 仓储热点

**文件：**
- 新建：`packages/server/src/lib/persistence/schema/index.ts`
- 新建：`packages/server/src/lib/persistence/schema/auth.ts`
- 新建：`packages/server/src/lib/persistence/schema/knowledge.ts`
- 新建：`packages/server/src/lib/persistence/schema/artifacts.ts`
- 新建：`packages/server/src/lib/persistence/schema/retrieval.ts`
- 新建：`packages/server/src/lib/persistence/schema/queue.ts`
- 新建：`packages/server/src/lib/artifacts/pg-repository/index.ts`
- 新建：`packages/server/src/lib/artifacts/pg-repository/revision-reader.ts`
- 新建：`packages/server/src/lib/artifacts/pg-repository/revision-writer.ts`
- 新建：`packages/server/src/lib/artifacts/pg-repository/derived-store.ts`
- 新建：`packages/server/src/lib/artifacts/pg-repository/record-reconstruction.ts`
- 修改：`packages/server/src/lib/persistence/schema.ts`
- 修改：`packages/server/src/lib/artifacts/pg-repository.ts`
- 修改：`packages/server/src/lib/artifacts/pg-repository.round4.roundtrip.test.ts`
- 修改：`packages/server/src/lib/artifacts/pg-repository.round4.consistency.test.ts`
- 修改：`packages/server/src/lib/knowledge/pg-repository.test.ts`
- 修改：`docs/PACKAGES.md`
- 修改：`docs/guides/CODE_GUIDE.md`
- 修改：`docs/reference/DATABASE_SCHEMA.md`
- 修改：`docs/reference/GLOSSARY.md`

**阶段完成标准：**
- `packages/server/src/lib/persistence/schema.ts` 收敛为不超过 200 行的 barrel 或兼容包装
- `packages/server/src/lib/artifacts/pg-repository.ts` 收敛为不超过 250 行的 barrel 或兼容包装
- 对外导入路径保持可兼容，外部调用方无需同步重写
- 文档不再引用这些超大文件中的脆弱行号，而改为按模块路径与职责说明

**阶段文档更新要求：**
- 更新所有仍然通过行号引用 `pg-repository.ts` 的文档
- 按新的分域 schema 文件重写 schema 导航说明
- 在代码导读中加入新的 persistence 与 artifact 模块导航

**阶段测试 / Eval 更新要求：**
- 保留现有 Artifact PG roundtrip 与 consistency 覆盖
- 如果公开模块边界有变化，补一个 import 兼容性测试
- 本阶段不修改 eval 数据集
- 因为 artifact export/activate 与 retrieval 会被间接影响，本阶段必须重跑 `eval:smoke`

**必要的结构或代码示例：**

```text
packages/server/src/lib/persistence/schema/
├── index.ts
├── auth.ts
├── knowledge.ts
├── artifacts.ts
├── retrieval.ts
└── queue.ts
```

```ts
// packages/server/src/lib/persistence/schema/index.ts
export * from './auth.js';
export * from './knowledge.js';
export * from './artifacts.js';
export * from './retrieval.js';
export * from './queue.js';
```

```text
packages/server/src/lib/artifacts/pg-repository/
├── index.ts
├── revision-reader.ts
├── revision-writer.ts
├── derived-store.ts
└── record-reconstruction.ts
```

```ts
export async function loadStructuredRevisionData(
  pool: Pool,
  artifactId: string,
  revisionNo: number,
): Promise<StructuredRevisionData> {
  // 从原先的单体仓储文件中迁出
}
```

- [x] **步骤 4.1：先用测试冻结当前模块契约**

```ts
import * as schema from './persistence/schema.js';
import * as artifacts from './artifacts/pg-repository.js';

it('保持 schema 与 artifact repository 的公开导出稳定', () => {
  expect(schema).toHaveProperty('knowledgeEntries');
  expect(artifacts).toHaveProperty('PgArtifactRepository');
});
```

运行：`rtk pnpm test -- --run packages/server/src/lib/artifacts/pg-repository.round4.roundtrip.test.ts packages/server/src/lib/artifacts/pg-repository.round4.consistency.test.ts`  
预期：在拆分前先 PASS

- [x] **步骤 4.2：按领域拆分 Drizzle schema**

```ts
// auth.ts
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull(),
});
```

- [x] **步骤 4.3：按职责拆分 Artifact PG 仓储**

```ts
// record-reconstruction.ts
export function reconstructSkillArtifactRecord(
  base: ArtifactBaseRow,
  structured: StructuredRevisionData,
): SkillArtifactRecord {
  return {
    ...base,
    revisions: mergeStructuredRevisions(base.revisions, structured),
  };
}
```

- [x] **步骤 4.4：保留旧顶层文件作为兼容 barrel**

```ts
// packages/server/src/lib/artifacts/pg-repository.ts
export * from './pg-repository/index.js';
```

- [x] **步骤 4.5：把文档从“行号入口”改成“模块路径入口”**

```md
阅读入口：
- `packages/server/src/lib/artifacts/pg-repository/revision-reader.ts`
- `packages/server/src/lib/artifacts/pg-repository/revision-writer.ts`
- `packages/server/src/lib/artifacts/pg-repository/record-reconstruction.ts`
```

- [x] **步骤 4.6：运行验证**

运行：`rtk pnpm test -- --run packages/server/src/lib/artifacts/pg-repository.round4.roundtrip.test.ts packages/server/src/lib/artifacts/pg-repository.round4.consistency.test.ts packages/server/src/lib/knowledge/pg-repository.test.ts`  
预期：PASS

运行：`rtk pnpm eval:smoke`  
预期：PASS

- [x] **步骤 4.7：更新图谱并提交**

运行：`rtk graphify update .`  
预期：图谱更新成功

运行：`git add -A && git commit -m "refactor(server): split schema and artifact pg repository hotspots"`  
预期：成功生成提交

---

### 任务 5：把文档漂移与复杂度预算接入 CI 守卫

**文件：**
- 新建：`scripts/check-doc-drift.ts`
- 新建：`scripts/check-complexity-budgets.ts`
- 新建：`scripts/complexity-budgets.json`
- 修改：`package.json`
- 修改：`.github/workflows/ci.yml`
- 修改：`docs/operations/CI_CD.md`
- 修改：`docs/operations/TESTING.md`
- 修改：`docs/reference/SYSTEM_TRUTH_SOURCES.md`

**阶段完成标准：**
- 一旦文档重新出现禁用的过时说法，CI 会失败
- 一旦被跟踪的热点文件重新超过约定行数预算，CI 会失败
- 开发者可以在本地用根脚本执行同样的检查
- 守卫规则本身有清晰文档，且易于维护

**阶段文档更新要求：**
- 在 `CI_CD.md` 中补充新检查的本地和 CI 用法
- 在 `TESTING.md` 中加入开发者工作流说明
- 在 `SYSTEM_TRUTH_SOURCES.md` 中说明如何更新真相源断言

**阶段测试 / Eval 更新要求：**
- 如果守卫脚本用了非平凡共享逻辑，为其增加轻量测试
- 在接入 CI 后再跑一次 `eval:smoke`，确保前面阶段的结构改动仍然闭环
- 本阶段不修改 eval 数据集

**必要的结构或代码示例：**

```json
{
  "docRules": [
    {
      "file": "docs/guides/CODE_GUIDE.md",
      "mustContain": ["buildServer()"],
      "mustNotContain": ["createApp()"]
    },
    {
      "file": "docs/architecture/ARCHITECTURE.md",
      "mustContain": ["SYSTEM_TRUTH_SOURCES.md"]
    }
  ],
  "lineBudgets": [
    { "file": "packages/server/src/app.ts", "maxLines": 350 },
    { "file": "packages/server/src/routes/candidates.ts", "maxLines": 150 },
    { "file": "packages/server/src/lib/persistence/schema.ts", "maxLines": 200 },
    { "file": "packages/server/src/lib/artifacts/pg-repository.ts", "maxLines": 250 }
  ]
}
```

```ts
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('scripts/complexity-budgets.json', 'utf8'));

for (const rule of config.docRules) {
  const content = readFileSync(rule.file, 'utf8');
  for (const value of rule.mustContain ?? []) {
    if (!content.includes(value)) throw new Error(`${rule.file} 缺少 ${value}`);
  }
  for (const value of rule.mustNotContain ?? []) {
    if (content.includes(value)) throw new Error(`${rule.file} 仍然包含 ${value}`);
  }
}
```

- [x] **步骤 5.1：新增文档漂移检查脚本**

```ts
console.log('Checking documentation drift rules...');
// 读取 JSON 配置，校验 mustContain 与 mustNotContain 规则
```

- [x] **步骤 5.2：新增文件体量 / 复杂度预算检查脚本**

```ts
import { readFileSync } from 'node:fs';

function countLines(file: string): number {
  return readFileSync(file, 'utf8').split('\n').length;
}
```

- [x] **步骤 5.3：把两个检查暴露为根脚本**

```json
{
  "scripts": {
    "check:docs-drift": "pnpm exec tsx scripts/check-doc-drift.ts",
    "check:complexity": "pnpm exec tsx scripts/check-complexity-budgets.ts"
  }
}
```

- [x] **步骤 5.4：把检查接入 CI**

```yaml
  architecture-guardrails:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v3
        with:
          version: 10.33.0
      - run: pnpm install --frozen-lockfile
      - run: pnpm check:docs-drift
      - run: pnpm check:complexity
```

- [x] **步骤 5.5：记录新的守卫规则**

```md
本仓库要求在结构重构时同步更新：
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `pnpm check:docs-drift`
- `pnpm check:complexity`
```

- [x] **步骤 5.6：运行验证**

运行：`rtk pnpm check:docs-drift`  
预期：PASS

运行：`rtk pnpm check:complexity`  
预期：PASS

运行：`rtk pnpm eval:smoke`  
预期：PASS

- [x] **步骤 5.7：如有代码改动则更新图谱并提交**

运行：`rtk graphify update .`  
预期：若本阶段改了代码，图谱更新成功

运行：`git add -A && git commit -m "chore(ci): add doc drift and complexity guardrails"`  
预期：成功生成提交

---

## 任务完成后审计修复

所有阶段完成后，通过 `plan.md` 审计发现以下残留漂移并已修复：

| 问题 | 涉及文件 | 修复内容 |
|------|----------|----------|
| `SYSTEM_TRUTH_SOURCES.md` 仍将 schema 拆分标记为 "planned, Task 4" | `docs/reference/SYSTEM_TRUTH_SOURCES.md` | 更新为拆分后的 barrel 结构 |
| `GLOSSARY.md` 8 处引用旧 `schema.ts` 行号 | `docs/reference/GLOSSARY.md` | 改为指向拆分后的 `schema/knowledge.ts`、`schema/artifacts.ts`、`schema/candidates.ts`、`schema/retrieval.ts`、`schema/index.ts` |
| `CI_CD.md` 未列出 `architecture-guardrails` job | `docs/operations/CI_CD.md` | 补充该 job 说明 |
| `TESTING.md` 未说明 `pnpm check:docs-drift` 和 `pnpm check:complexity` | `docs/operations/TESTING.md` | 补充本地守卫工作流 |
| `docs-truth-smoke.test.ts` 正则会误匹配短模块名（如 `auth.ts`） | `packages/server/src/__tests__/docs-truth-smoke.test.ts` | 正则要求路径含 `/`，避免误匹配裸文件名 |

验证结果：
- `rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts` — PASS（4/4）
- `rtk node scripts/check-doc-drift.ts` — PASS
- `rtk node scripts/check-complexity-budgets.ts` — PASS（4/4 within budget）

---

## 自检

**需求覆盖检查**

- [x] 使用了复选框追踪进度
- [x] 为每个阶段定义了完成标准
- [x] 为每个阶段定义了文档更新要求
- [x] 为每个阶段定义了测试 / eval 更新要求
- [x] 提供了必要的结构或代码示例
- [x] 明确聚焦服务端复杂度与文档漂移

**占位符检查**

- [x] 没有 `TBD` / `TODO`
- [x] 没有“适当处理”“后续补充”这类空泛占位
- [x] 每个阶段都包含具体文件、命令与预期结果

**一致性检查**

- [x] 全文统一以 `buildServer()` 作为服务端入口
- [x] 先建立真相源文档，再在后续阶段自动化守卫
- [x] 热点预算与当前实际测得的文件体量一致
