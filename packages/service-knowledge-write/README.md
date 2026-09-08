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
