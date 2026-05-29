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

## Hotspot Modules and Tests

fm-agent 原始报告（391 已确认发现）经过 HEAD 三重分类后，以下模块是已知活跃问题区域：

| 模块 | 测试文件 | 活跃问题 |
|---|---|---|
| `src/app.ts` | `src/app.test.ts` | onClose 未 await worker stop, skillShareer 未冻结 |
| `src/bootstrap/bootstrap-candidate-recovery.ts` | `src/bootstrap/startup.test.ts` | 非 PG 存储跳过入队 |
| `src/bootstrap/bootstrap-lifecycle.ts` | `src/bootstrap/startup.test.ts` | 缺少 resubmitted/re-review 审计订阅 |
| `src/config.ts` | `src/config.test.ts` | CORS_ORIGINS="" 返回 ["*"] |
| `src/lib/ai/dynamic/context-resolver.ts` | `src/lib/ai/dynamic/context-resolver.test.ts` | MCP 状态占位符存根 |
| `src/lib/ai/provider-config.ts` | `src/lib/ai/provider-config.test.ts` | API 密钥优先级反转 |
| `src/lib/artifacts/pg-repository/index.ts` | `src/lib/artifacts/pg-repository/*.test.ts` | updateLifecycle lifecycleHistory 过时 |
| `src/lib/lifecycle/subscribers/audit.ts` | (集成测试) | 审计字段遗漏 |

> 完整分类矩阵见 `temp/fm-agent-scan-plans/server-live-gap-matrix.md`。
