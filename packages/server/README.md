# TrapMap Server

Fastify API 服务，承载检索、索引、治理、认证、候选处理等核心业务。

## 入口

- `src/index.ts` — 启动入口
- `src/app.ts` — Fastify 应用组装

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
