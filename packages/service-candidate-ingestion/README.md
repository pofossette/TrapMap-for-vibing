# `@trapmap/service-candidate-ingestion`

你用这个服务模块接收候选提交、执行去重分析并推进候选生命周期直至解决。

## 入口

主入口为 `packages/service-candidate-ingestion/src/index.ts`，路由定义见 `packages/service-candidate-ingestion/src/routes.ts`（`createCandidateIngestionRouteDefs` / `registerCandidateIngestionRoutes`），去重策略见 `packages/service-candidate-ingestion/src/dedup-strategy/rule-dedup-strategy.ts`，异步处理队列见 `packages/service-candidate-ingestion/src/processing-task-queue.ts`。

候选状态机为 `received` → `queued` → `analyzing` → `duplicate_detected` / `ready_for_review` → `resolved`（失败进 `error` 并可重试）。

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/backend-core` | 端口契约与模块底座 |
| `@trapmap/contracts` | 候选 schema |
| `@trapmap/db` | 表定义（`candidates`、`candidate_analyses`、`candidate_duplicate_*`、`candidate_manual_results`、`candidate_resolution_outcomes`、`entity_lineage`） |
| `@trapmap/ai-providers` | LLM 辅助分析 |
| `@trapmap/infra` | 共享基础设施 |
| `@trapmap/lib` | 纯函数工具 |
| `drizzle-orm` / `pg` / `fastify` / `zod` | 数据访问、服务框架、校验 |
| `build` / `typecheck` / `test` | 编译 / 校验 / 单元测试 |

候选发布经 `KnowledgeWritePort.publishCandidateResult` 委托给写侧，后续工作经 job-runtime 调度，本服务不直写任务队列表。

## 常见用法

### 跑本包测试

```bash
pnpm --filter @trapmap/service-candidate-ingestion test
pnpm --filter @trapmap/service-candidate-ingestion typecheck
```

### 查路由定义定位端点

路由集中在 `packages/service-candidate-ingestion/src/routes.ts`（`createCandidateIngestionRouteDefs`），你要加端点先读该文件，再对着 `packages/contracts/src/domain/candidates.ts` 的 schema 写 handler。
