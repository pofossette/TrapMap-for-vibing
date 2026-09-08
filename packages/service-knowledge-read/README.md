# `@trapmap/service-knowledge-read`

你用这个服务模块提供检索读侧全流水线（多通道召回、重排、组装、投影、图抽取与索引、RAG 日志）。

## 入口

主入口为 `packages/service-knowledge-read/src/index.ts`（`createKnowledgeReadServer` / `registerKnowledgeReadRoutes` / `createKnowledgeReadDeps` / `createKnowledgeReadServiceModule` / `searchKnowledge`），图存储次入口为 `@trapmap/service-knowledge-read/store.js`。检索主入口 `searchKnowledge` 编排快照 → 路由 → 召回 → 组装 → 日志。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/internal/retrieval/search` | 检索搜索 |
| `GET` | `/internal/knowledge/:entryId` | 按 ID 取单条 |
| `GET` | `/internal/knowledge/mine` | 按用户列条目 |
| `GET` | `/internal/health` | 健康检查 |
| `GET` / `POST` | `/internal/knowledge-read/projection-status` / `projection-rebuild` | 投影诊断与重建 |

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/backend-core` | `KnowledgeReadDeps` 契约 |
| `@trapmap/contracts` | 检索 schema |
| `@trapmap/db` | 表与图索引仓储 |
| `@trapmap/ai-providers` | embedding 与图 LLM 抽取 |
| `@trapmap/infra` | 向量与回退 embedding |
| `@trapmap/lib` | 纯函数工具 |
| `graphology` / `graphology-operators` / `graphology-shortest-path` | 内存图查询 |
| `drizzle-orm` / `pg` / `fastify` / `zod` | 数据访问、服务框架、校验 |
| `build` / `typecheck` / `test` | 编译 / 校验 / 单元测试 |

召回模式（`semantic` / `hybrid` / `graph-assisted`）由 `intent-recognition` 与 `channel-merge` 端口选择，宿主在检索接缝注入 rule 实现。
