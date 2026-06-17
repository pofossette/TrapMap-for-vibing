# TrapMap Server

Fastify API 服务，承载检索、索引、治理、认证、候选处理等核心业务。

## 入口

- `src/index.ts` — 启动入口
- `src/app.ts` — Fastify 应用组装

## 阅读顺序

### app.ts 核心路径
1. `src/app.ts` — Fastify 实例化、decorate、路由注册、onReady/onClose 钩子、错误处理
2. `src/config.ts` — 环境变量加载、Zod 校验、CORS/HOST/port 解析

### 启动序列 (bootstrap)
3. `src/bootstrap/run-startup-sequence.ts` — 启动序列编排器（5 阶段）
4. `src/bootstrap/bootstrap-repositories.ts` — 数据库迁移、仓库创建、向量索引
5. `src/bootstrap/bootstrap-candidate-recovery.ts` — 中断候选恢复与重入队
6. `src/bootstrap/bootstrap-workers.ts` — TaskWorker 启动（PG 模式）
7. `src/bootstrap/bootstrap-graph-reconciliation.ts` — 图索引一致性修复
8. `src/bootstrap/bootstrap-lifecycle.ts` — 事件订阅者注册、OutboxWorker 启动

运行时拆分由两个维度共同决定：

- `runtimeMode`：当前进程是 `api`、`task-worker`、`outbox-worker` 还是 `combined`
- `TRAPMAP_SERVICE_UNIT`：当前进程拥有 `full-platform`、`candidate-ingestion`、`knowledge-governance` 中哪类 async work

默认消息底座仍是 PostgreSQL `task_queue` + `domain_event_outbox`，但运行时代码和业务入口统一通过 `app.skillShareer.asyncTransport` 访问，不在路由或应用服务里直接拼装底层 transport。

## 目录结构

- `src/bootstrap/` — 启动序列、候选恢复、图协调、生命周期、仓库初始化、Worker
- `src/routes/` — Fastify 路由模块
- `src/lib/` — 核心业务逻辑（按领域组织）
- `src/__tests__/` — 跨领域冒烟测试
- `src/types/` — 类型定义
- `drizzle/` — Drizzle SQL 迁移文件
- `scripts/` — 服务器辅助脚本

## 内部导航

- 路由入口：[`src/routes/`](src/routes/)
- 业务逻辑：[`src/lib/`](src/lib/)
- 启动序列：[`src/bootstrap/`](src/bootstrap/)

## 分层 Ownership

`packages/server` 现阶段按五层理解，目录放置优先服从这个模型：

| Layer | 当前落点 | Responsibility |
|---|---|---|
| `domain` | `src/lib/<context>/` 内的实体、规则、仓库接口、policy/helper | 表达业务概念、不变量、生命周期规则、读写边界语义，不拥有 Fastify、worker、进程启动细节 |
| `application` | `src/lib/<context>/application-*.ts`、命名 service/processor | 编排命令式用例：actor、目标聚合、权限前提、repository 调用、lifecycle side effect、受控 compatibility debt |
| `infrastructure` | `src/lib/persistence/`、`src/lib/repos/`、`src/lib/queue/`、`src/lib/ai/`、`src/lib/runtime/`、`src/bootstrap/` | PostgreSQL/JSON store、队列、AI provider、runtime metadata、startup/bootstrap、进程级装配 |
| `interfaces/http` | `src/routes/` | 请求解析、schema 校验、auth/permission gate、delegate、响应映射 |
| `interfaces/worker` | `src/worker.ts`、`src/bootstrap/bootstrap-workers.ts`、worker entry modules | 消费异步任务、把任务负载翻译成 application/infrastructure 调用，不承载领域规则定义 |

两个明确约束：

- runtime/bootstrap responsibility 留在 `infrastructure`，不要放进 `domain` 或 `application` 模块。
- read-model assembly 留在读侧模块；写侧 application service 默认不负责拼装 retrieval/review/runtime projection，除非该耦合被刻意记录。

## 重上下文落点

下面四个上下文优先按同一模型收口：

| Context | Domain/Application Ownership | Infrastructure / Interface Ownership |
|---|---|---|
| `知识治理` | `lib/knowledge/` 负责知识/trap/review/decay 的业务语义；写流程通过共享 application service 编排 | 路由只做 transport；索引、持久化、runtime hook 留在 `repos` / `persistence` / `lifecycle` |
| `候选摄取` | `lib/candidates/` 负责 submission、duplicate、resolution、processing policy | recovery、queue worker、startup re-enqueue 属于 `bootstrap` + `queue`，不是 candidate domain 规则 |
| `反馈与修复` | `lib/feedback/`、`lib/maintenance/`、相关 remediation hook 负责命令语义和状态变化 | badcase 存储、reactivation wiring、subscriber/worker 执行留在 infra；HTTP 端点只触发用例 |
| `运维与运行时` | 只保留被明确命名的 operator use case；不把进程状态判断伪装成 domain service | `/health`、`/ready`、startup、migration/admin flow、runtime snapshot 属于 `runtime` / `bootstrap` / `operations` infra 边界 |

## Former Hotspot Modules and Regression Tests

fm-agent 原始报告（391 已确认发现）经过当前 HEAD 审计回写后，以下模块保留为回归入口或环境边界说明，不再有已复现的 current-live gap：

| 模块 | 测试文件 | 当前状态 |
|---|---|---|
| `src/app.ts` | `src/app.test.ts` | 已修复：`onClose` await worker stop，startup 结束后冻结 `skillShareer` |
| `src/bootstrap/bootstrap-candidate-recovery.ts` | `src/bootstrap/startup.test.ts` | 已文档化边界：JSON store 会 reset candidate，但不会尝试使用不存在的 PG queue 重入队 |
| `src/bootstrap/bootstrap-lifecycle.ts` | `src/bootstrap/startup.test.ts` | 已修复：`resubmitted` / `re-review` 审计订阅已注册 |
| `src/config.ts` | `src/config.test.ts` | 已修复：`CORS_ORIGINS=\"\"` 解析为空数组 |
| `src/lib/ai/dynamic/context-resolver.ts` | `src/lib/ai/dynamic/context-resolver.test.ts` | 已文档化边界：当前返回显式 `unavailable` MCP 状态，而不是伪装为已接通 |
| `src/lib/ai/provider-config.ts` | `src/lib/ai/provider-config.test.ts` | 已修复：provider-specific API key 优先于通用 `AI_API_KEY` |
| `src/lib/artifacts/pg-repository/index.ts` | `src/lib/artifacts/pg-repository/*.test.ts` | 已修复：`updateLifecycle()` 返回值会追加最新 lifecycle event |
| `src/lib/lifecycle/subscribers/audit.ts` | `src/lib/lifecycle/subscribers/subscribers.test.ts` | 已修复：审计日志记录整个 event 对象 |

> 完整回写见 `docs/plans/fm-agent-scan/server-live-gap-matrix.md`。2026-05-29 审计后，该矩阵不再记录 current-live finding。

## AI 配置参考

AI 提供商和提示词系统通过环境变量配置：

- 提供商配置：`AI_PROVIDER`, `AI_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `AI_BASE_URL`, `AI_CHAT_MODEL`, `AI_EMBEDDING_MODEL`
- 提示词配置：`AI_PROMPT_PROVIDER`, `AI_PROMPT_TEMPLATE_FILE`
- 独立 Embedding 提供商：`EMBEDDING_PROVIDER`, `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`

**API Key 优先级**: Provider-specific keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`) 优先于通用 `AI_API_KEY`。空字符串环境变量视为未设置。
详细文档：[`docs/architecture/components/AI_PROVIDER.md`](../../docs/architecture/components/AI_PROVIDER.md) 和 [`docs/operations/PROMPT_PROVIDERS.md`](../../docs/operations/PROMPT_PROVIDERS.md)。
