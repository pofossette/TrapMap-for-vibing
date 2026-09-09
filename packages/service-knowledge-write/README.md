# `@trapmap/service-knowledge-write`

你用这个服务模块做知识聚合的权威写侧，它拥有知识条目、trap、skill 工件、证据、生命周期规则与规范标签目录。

## 入口

主入口为 `packages/service-knowledge-write/src/index.ts`（`createKnowledgeWriteServer` / `createKnowledgeWriteDeps` / `createKnowledgeWriteServiceModule` / `registerKnowledgeWriteRoutes` / `registerArtifactRoutes` / `runKnowledgeWriteMigrations`），图对齐次入口为 `@trapmap/service-knowledge-write/labels/graph-align.js`（`alignGraphNodes` / `rewriteEdgeIds`）。

```ts
import { createKnowledgeWriteServer, createKnowledgeWriteDeps } from '@trapmap/service-knowledge-write';
import { alignGraphNodes } from '@trapmap/service-knowledge-write/labels/graph-align.js';
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/backend-core` | `KnowledgeWritePort` 契约 |
| `@trapmap/contracts` | 知识与标签 schema |
| `@trapmap/db` | 聚合表与标签目录表定义 |
| `@trapmap/ai-providers` | 产物推导与标签对齐 LLM |
| `@trapmap/infra` | 向量与回退 embedding |
| `@trapmap/lib` | 纯函数工具 |
| `drizzle-orm` / `pg` / `fastify` / `zod` | 数据访问、服务框架、校验 |
| `build` / `typecheck` / `test` | 编译 / 校验 / 单元测试 |

改变知识生命周期状态的唯一权威路径经过本服务，治理侧与摄取侧经端口委托调用。聚合变更后的投影刷新等动作全部走异步队列。

端点（`src/routes/knowledge.routes.ts`/`submission.routes.ts`，工件见 `src/artifact-routes.ts`）：

| 方法+路径 | 用途 |
| --- | --- |
| `POST /internal/knowledge`、`PUT /internal/knowledge/:entryId` | 提条目、改内容/标签 |
| `POST /internal/knowledge/:entryId/resubmit`、`/supersede` | 重新送审、替换条目 |
| `GET /internal/knowledge/:entryId/conflict-candidates` | 列已批准冲突候选 |
| `POST /internal/knowledge/review/approve`、`/reject`、`/maintenance`、`/decay` | 审核/维护/衰减决策 |
| `POST /internal/candidates/publish`、`POST /internal/rpc/knowledge-write` | 发布候选结果、统一 RPC |
| `POST /internal/traps`、`GET /internal/traps`、`/:trapId` | 建 trap、列表、取单体 |
| `POST /internal/artifacts/*`、`GET /internal/artifacts/*` | 工件导入导出/生命周期/审核 |
| `GET /internal/health`、`/live`、`/readiness`、`/ready`、`/ownership` | 健康/就绪/归属探针 |

## 常见用法

### 跑本包测试

```bash
pnpm --filter @trapmap/service-knowledge-write test
pnpm --filter @trapmap/service-knowledge-write typecheck
```

### 组装写侧服务实例

```ts
import { createKnowledgeWriteServer, createKnowledgeWriteDeps } from '@trapmap/service-knowledge-write';
import { alignGraphNodes } from '@trapmap/service-knowledge-write/labels/graph-align.js';
```

装配入口与迁移函数见上文入口一节。你改生命周期状态必须走本服务端口，不直写表。
