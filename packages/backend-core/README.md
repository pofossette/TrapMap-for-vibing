# `@trapmap/backend-core`

你用这个包在轻重宿主之间共享与宿主无关的应用逻辑、端口契约与六个限界上下文入口。

## 入口

| 子路径 | 内容 |
| --- | --- |
| `@trapmap/backend-core` | 主桶导出 |
| `@trapmap/backend-core/runtime`（`*.js` 通配） | 能力模型、拓扑、路由表面、状态、服务发现 |
| `@trapmap/backend-core/ports`（`*.js` 通配） | 仓库、队列、检索、认证、审计、遥测、生命周期端口 |
| `@trapmap/backend-core/identity-access` | 身份访问上下文 |
| `@trapmap/backend-core/knowledge-read` | 读侧检索上下文 |
| `@trapmap/backend-core/knowledge-write` | 写侧知识上下文 |
| `@trapmap/backend-core/candidate-ingestion` | 候选摄取上下文 |
| `@trapmap/backend-core/governance-review` | 治理审查上下文 |
| `@trapmap/backend-core/job-runtime` | 作业运行上下文 |
| `@trapmap/backend-core/invocation` / `testing` | 调用模型与端口桩 |

源码落点见 `packages/backend-core/src/` 下同名目录（`ports/`、`runtime/` 另有 `http/`、`invocation/`、`discovery` 相关实现，目录细节以源码为准，未知/待确认（2026-09-08））。

## 行为

本包无运行时依赖，它不依赖 Fastify / Nest，不做进程启动，不连 PostgreSQL，不读环境变量。宿主在组合层注入端口实现，单元测试用 `testing` 桩替换。
