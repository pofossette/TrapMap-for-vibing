# TrapMap 包总表

> 状态：Active（2026-09-08）。全包一行一条，职责一句话；细节链各包 README。

## 包概览

| 包 | 职责 | 细则 |
|---|---|---|
| [`packages/backend-core`](packages/backend-core/README.md) | 后端核心：端口、能力模型、用例与六上下文入口（Nest/Fastify 适配层） | [README](packages/backend-core/README.md) |
| [`packages/contracts`](packages/contracts/README.md) | 共享 Zod Schema 与类型，跨包契约真源 | [README](packages/contracts/README.md) |
| [`packages/db`](packages/db/README.md) | PostgreSQL 表定义与迁移运行器，42 表唯一真源 | [README](packages/db/README.md) |
| [`packages/assembly`](packages/assembly/README.md) | cordis 程序化组装内核 | [README](packages/assembly/README.md) |
| [`packages/lib`](packages/lib/README.md) | 纯函数工具集 | [README](packages/lib/README.md) |
| [`packages/infra`](packages/infra/README.md) | pgvector 构造器、回退 embedding、治理过滤器 | [README](packages/infra/README.md) |
| [`packages/ai-providers`](packages/ai-providers/README.md) | AI 提供商统一入口（AI SDK），prompt 构建与解析 | [README](packages/ai-providers/README.md) |
| [`packages/client-core`](packages/client-core/README.md) | 网关 HTTP 客户端（fetch 传输、会话、错误模型） | [README](packages/client-core/README.md) |
| [`packages/skill-registry`](packages/skill-registry/README.md) | Skill 版本管理、diff/merge、安装 | [README](packages/skill-registry/README.md) |
| [`packages/skills`](packages/skills/README.md) | 随仓 Skill 工件（workflow-with-trapmap、cli-usage-guide） | [README](packages/skills/README.md) |
| [`packages/host-local`](packages/host-local/README.md) | light 宿主库（NestJS 单进程，`local-agent`/`team-monolith`） | [README](packages/host-local/README.md) |
| [`packages/host-distributed`](packages/host-distributed/README.md) | heavy 宿主库（网关 + 6 服务装配） | [README](packages/host-distributed/README.md) |
| [`packages/service-identity-access`](packages/service-identity-access/README.md) | 身份与访问服务 | [README](packages/service-identity-access/README.md) |
| [`packages/service-candidate-ingestion`](packages/service-candidate-ingestion/README.md) | 候选摄取与去重服务 | [README](packages/service-candidate-ingestion/README.md) |
| [`packages/service-knowledge-read`](packages/service-knowledge-read/README.md) | 检索读侧服务 | [README](packages/service-knowledge-read/README.md) |
| [`packages/service-knowledge-write`](packages/service-knowledge-write/README.md) | 权威写侧服务 | [README](packages/service-knowledge-write/README.md) |
| [`packages/service-governance-review`](packages/service-governance-review/README.md) | 审核与治理服务 | [README](packages/service-governance-review/README.md) |
| [`packages/service-job-runtime`](packages/service-job-runtime/README.md) | 异步任务运行时服务 | [README](packages/service-job-runtime/README.md) |
| [`packages/service-cron`](packages/service-cron/README.md) | 定时调度服务 | [README](packages/service-cron/README.md) |
| [`apps/cli`](apps/cli/README.md) | 命令行客户端 | [README](apps/cli/README.md) |
| [`apps/light`](apps/light/README.md) | light 可执行装配 | [README](apps/light/README.md) |
| [`apps/distributed`](apps/distributed/README.md) | distributed 可执行装配 | [README](apps/distributed/README.md) |
| [`apps/mcp`](apps/mcp/README.md) | MCP stdio 服务装配 | [README](apps/mcp/README.md) |
| [`apps/migration`](apps/migration/README.md) | 数据库迁移进程 | [README](apps/migration/README.md) |
| [`apps/web-panel`](apps/web-panel/README.md) | 运维审核 Web 控制台 | [README](apps/web-panel/README.md) |
| `services/knowledge-read-go` | Go 读加速（chi + pgx + lru + singleflight），见 [GO 加速服务](architecture/GO-ACCELERATOR.md) |

跨包结论上收至 `docs/architecture/` 或 `docs/reference/` 对应权威页，不进本表。
