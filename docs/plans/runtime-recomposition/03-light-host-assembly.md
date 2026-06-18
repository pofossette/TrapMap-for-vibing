# Runtime Recomposition Plan 03: Light Host Assembly

## 状态

- 状态：`active`
- 依赖：`02-backend-core-kernel-extraction.md`

## 目标

定义轻量本地宿主，把核心内核装配成低运维、单机友好的运行形态，承接 `local-agent` 和 `team-monolith` 的稳定开发与部署入口。

## 轻宿主定位

轻宿主不是“功能阉割版后端”，而是：

- 优先单进程或少进程部署
- 优先低依赖、简单启动
- 优先开发体验、调试便利和本地可运行
- 仍复用完整核心内核和正式 gateway API

## 建议职责

- 提供统一 gateway 入口
- 视 profile 装配最小 route surface
- 视 profile 决定是否进程内组合 worker / outbox ownership
- 提供本地可观测信息和最小健康检查

## 目标包

建议新增：

- `packages/host-local/package.json`
- `packages/host-local/src/index.ts`
- `packages/host-local/src/bootstrap/*`
- `packages/host-local/src/http/*`
- `packages/host-local/src/runtime/*`

## Profile 装配建议

### local-agent

- 单用户
- retrieval-first
- 可选择最小 route surface
- 可以把一部分 async work 以内联或单宿主 worker 方式运行

### team-monolith

- 多用户
- 完整 gateway surface
- 默认共享 PostgreSQL
- API 与 worker 可同宿主组合，但 ownership 语义必须清晰

## 关键设计点

### 1. Host config 不等于 business config

- 轻宿主只负责把 config 映射到 capability / ports 注入。
- 业务规则仍在 `backend-core`。

### 2. 保持 gateway-only client model

- 即使 `local-agent` 极轻量，CLI 和未来 Web 面板仍然只面对 gateway。
- 不能为本地形态引入“另一个客户端访问协议”。

### 3. 允许渐进替换 packages/server

- 迁移期可让 `packages/server` 继续提供一部分入口。
- 但新宿主必须成为未来脚本、文档和 smoke 测试的正式目标。

## 风险

- 如果把轻宿主做成“新 monolith 包”，只是换目录不换边界。
- 如果 local-agent 特判过多，会导致它逐渐偏离 team-monolith 能力模型。

## 验收标准

- `local-agent` 和 `team-monolith` 能通过统一轻宿主入口运行。
- 轻宿主只持有装配、进程入口和 transport glue，不重新持有核心业务逻辑。
- 现有开发脚本能够逐步迁移到新的宿主入口。

