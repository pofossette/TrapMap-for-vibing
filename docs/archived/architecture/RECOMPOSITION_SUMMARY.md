# 运行时重组摘要

## 状态

- 状态：`active-reference`
- 创建时间：`2026-06-18`
- 最后更新：`2026-06-18`
- 目的：总结运行时重组已落地的内容、仍为半成品的部分，以及如何理解当前迁移状态

## 概述

运行时重组已越过结构性门槛。TrapMap 在实际代码层面不再仅仅是 `cli + server` 的代码库：

- `packages/client-core` 已存在并被 CLI 消费
- `packages/backend-core` 已存在并承载宿主无关的运行时模型
- `packages/host-local` 已存在并支撑根级 `local-agent` / `team-monolith` 开发入口
- `packages/host-distributed` 已存在并支撑根级 `distributed` 开发入口

但"迁移已全部完成"这一说法尚不成立：

- `packages/server（Wave-10 已删除）` 仍作为兼容性外壳和大型实现表面存在
- host-local 尚未与成熟的遗留路由/运行时表面完全对齐
- 若干分布式组件仍为接缝/桩实现，而非经过生产环境验证的替代品

## 已落地内容

### 共享客户端核心

- `packages/client-core/` 提供可复用的网关传输层
- CLI 现在通过适配器消费该层，而非直接拥有 HTTP 传输边界
- 会话管理通过提供者契约表达，而非硬编码在传输实现中

### 后端核心内核

- `packages/backend-core/` 承载共享的运行时能力模型
- 端口、调用接缝和限界上下文模块从宿主特定代码中拆分出来
- 这使得轻量宿主和重量宿主共享一个公共内核，而非重复业务逻辑

### 轻量宿主（host-local）

- `packages/host-local/` 为 `local-agent` 和 `team-monolith` 组装后端核心
- 根级 `pnpm dev:local-agent` 和 `pnpm dev:team-monolith` 现在指向此宿主
- 默认本地网关行为仍与 `http://127.0.0.1:4000` 对齐

### 重量宿主（host-distributed）

- `packages/host-distributed/` 组装分布式服务拓扑
- 根级 `pnpm dev:distributed:gateway`
- 根级 `pnpm dev:distributed:candidate-worker`
- 根级 `pnpm dev:distributed:governance-worker`
- 根级 `pnpm dev:distributed:outbox-worker`
- 这些现在指向分布式宿主入口，而非遗留的 server 脚本

### 迁移文档与验证

- 迁移指南已存在：[docs/guides/MIGRATION_GUIDE.md](../guides/MIGRATION_GUIDE.md)
- 验证矩阵已存在：[docs/operations/VALIDATION_MATRIX.md](../operations/VALIDATION_MATRIX.md)
- 仓库/包结构文档现已包含新包和宿主角色

## 实际变化

### 首选开发入口

优先使用以下命令：

```bash
pnpm dev:local-agent
pnpm dev:team-monolith
pnpm dev:distributed:gateway
pnpm dev:distributed:candidate-worker
pnpm dev:distributed:governance-worker
pnpm dev:distributed:outbox-worker
```

兼容性脚本仍然存在，但不再是主要的迁移目标：

```bash
pnpm dev:server
pnpm dev:server:api
pnpm dev:server:task-worker
pnpm dev:server:outbox-worker
```

### 数据库环境变量兼容性

新宿主现在同时接受：

- `TRAPMAP_DATABASE_URL`
- `DATABASE_URL`

分布式按服务覆盖仍然支持：

- `TRAPMAP_SERVICE_DATABASE_URL`

这是为了在迁移仍为半成品时保持现有 `.env`、文档和测试工作流正常运行。

## 保留内容

- 现有的外部 API 假设仍以仅网关模型为中心
- CLI 仍然只需要一个网关 URL
- PostgreSQL 仍是当前迁移阶段的共享底层
- 现有测试在当前代码库上继续通过

## 当前差距

以下是真正有意义的未解决问题，而非表面遗留：

1. `packages/server（Wave-10 已删除）` 仍拥有大量真实实现，仍是事实表面的一部分。
2. `host-local` 在结构上已存在，但相对于完整的成熟遗留运行时，功能尚未完备。
3. 新宿主中的部分 worker/outbox 行为仍为接缝导向或桩状，而非完全加固。
4. 分布式宿主的服务壳已存在，但完整的运维成熟度和对齐度仍在遗留实现表面之后。

## 当前验证状态

已满足：

- 根级开发脚本优先使用新宿主
- 文档高频入口已更新以反映这一点
- 类型检查通过
- 文档漂移检查通过
- 当前测试套件通过

真正完成迁移仍需要：

- 跨 `local-agent`、`team-monolith` 和 `distributed` 的完整手动冒烟测试
- 对路由表面和运行时行为的更强对齐验证
- `packages/server（Wave-10 已删除）` 的缩减或退役计划

## 如何理解当前仓库

使用以下心智模型：

- `client-core` 是客户端侧的共享传输/内核
- `backend-core` 是服务端侧的共享内核
- `host-local` 和 `host-distributed` 是预期的运行时组装
- `server` 仍是许多内部实现、测试和迁移期事实的主要兼容性和实现表面

这意味着"新架构已存在"和"遗留表面仍然重要"同时为真。

## 结论

运行时重组在结构上成功，但在运维上尚未完成。

已达成的重要里程碑：

- 共享客户端层已存在
- 共享后端内核已存在
- 轻量和重量宿主组装已存在
- 根级开发者工作流现已优先使用新宿主

剩余工作是收敛：

- 路由/运行时对齐
- 加固分布式行为
- 减少对遗留 server 外壳的依赖
- 最终将 `packages/server（Wave-10 已删除）` 作为主要实现表面退役
