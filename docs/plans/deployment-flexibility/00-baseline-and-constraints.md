# Deployment Flexibility Plan 00: Baseline And Constraints

## 状态

- 状态：`active`
- 审计结论：需要修正文案偏移；术语基线仍有效，但“当前事实”部分已明显落后于代码和文档现状。

## 目标

冻结本次改造的术语、目标形态、非目标和兼容边界，避免后续实现过程中一边写代码一边变更叙事。

## 当前事实

- 现有 server 已具备：
  - `runtimeMode`: `api` / `task-worker` / `outbox-worker` / `combined`
  - `serviceUnit`: `full-platform` / `candidate-ingestion` / `knowledge-governance`
  - `deployment preset`: `monolith` / `api` / `candidate-worker` / `governance-worker` / `outbox-worker`
  - `deployment profile`: `local-agent` / `team-monolith` / `distributed`
- 现有入口文件：
  - `packages/server/src/index.ts`
  - `packages/server/src/worker.ts`
  - `packages/server/src/app.ts`
  - `packages/server/src/lib/runtime/deployment-profile.ts`
  - `packages/server/src/lib/runtime/deployment-preset.ts`
  - `packages/server/src/lib/runtime/runtime-contract.ts`
  - `packages/server/src/lib/runtime/service-unit.ts`
- 现有 CLI 接入模型已经正式收敛为单 gateway：
  - `packages/cli/src/lib/http.ts` 所有请求都基于单一 gateway base URL
  - `packages/cli/src/lib/config.ts` 新写入只持久化 `gatewayUrl`
  - 兼容读取旧 `serverUrl`，但它已退化为 legacy fallback
  - `login --server <url>` 是唯一显式切换 gateway 地址的入口
- 现有部署文档与运行时叙事已经开始对齐：
  - README / `docs/README.md` / `docs/PACKAGES.md` 已写入 `local-agent` / `team-monolith` / `distributed`
  - `deployment preset`、`runtimeMode`、`serviceUnit`、`task transport` 已开始被放回各自正确抽象层

## 本轮审计补充

- 本文件不再把 `deployment profile` 当成纯未来目标；它已经是当前代码与文档事实的一部分。
- 本文件不再使用“CLI 仍基于 `serverUrl`”这类过时描述；正式词汇是 `gatewayUrl`。
- 本文件只负责冻结边界，不重复承载 P1/P2/P3/P4 的实现细节。

## 详细改动内容

- 明确三种目标 deployment profile：
  - `local-agent`
  - `team-monolith`
  - `distributed`
- 统一现有术语之间的关系：
  - `deployment profile`
  - `runtimeMode`
  - `serviceUnit`
  - `deployment preset`
  - `task transport`
- 记录第一阶段明确非目标：
  - 不做 MCP 协议
  - 不让 CLI 直连各个微服务
  - 不在第一阶段拆分数据库
  - 不引入 Kafka/NATS/Redis Streams 作为默认基础设施
- 记录必须保留的实现资产：
  - PostgreSQL 主路径
  - queue/outbox 语义
  - `repos` / application service seams
  - 现有 CLI 命令面与 API 契约的大体兼容性

## 建议分步

### Step 1. 冻结术语表

- 在根 `plan.md`、`architecture.md`、`docs/PACKAGES.md` 中统一以下定义：
  - `deployment profile`: 产品形态
  - `deployment preset`: 兼容输入或启动快捷方式
  - `runtimeMode`: 当前进程运行角色
  - `serviceUnit`: 当前进程拥有的 bounded-context async ownership
  - `task transport`: 任务投递介质

### Step 2. 明确 profile 与现有实现的关系

- `local-agent`
  - 单用户
  - retrieval-first
  - CLI 仍连 HTTP gateway
  - 可以复用 Fastify server，但只暴露最小路由面
- `team-monolith`
  - 单实例、多用户
  - PostgreSQL 主路径
  - API + worker 可组合在同进程
- `distributed`
  - gateway + 多服务/多 worker
  - 首期共享 PostgreSQL
  - CLI 仍只连 gateway

### Step 3. 写入明确非目标

- 第一阶段不做：
  - MCP protocol
  - CLI 直连多个服务
  - 按服务拆库
  - 新建独立消息基础设施作为默认路径
  - 推翻现有 Fastify/CLI/contracts 主结构

### Step 4. 标记需要重写的旧叙事

- 根 `plan.md` 已改为总审计入口，需要保持以下口径：
  - `distributed` 是正式目标形态，不再只是远期想象
  - 但首期微服务化仍以共享 PostgreSQL 和共享 contracts 为边界
- `docs/plans/README.md` 的“当前仓库继续以模块化单体为前提”需要更新成：
  - 模块化单体仍是重要实现方式
  - 但活跃路线现在包含灵活部署与分布式形态规划

## 涉及代码入口

- `packages/server/src/config.ts`
- `packages/server/src/index.ts`
- `packages/server/src/worker.ts`
- `packages/server/src/app.ts`
- `packages/server/src/lib/runtime/deployment-profile.ts`
- `packages/server/src/lib/runtime/deployment-preset.ts`
- `packages/server/src/lib/runtime/runtime-contract.ts`
- `packages/server/src/lib/runtime/service-unit.ts`
- `packages/cli/src/lib/config.ts`
- `packages/cli/src/lib/http.ts`

## 需要同步更新的文档

- `architecture.md`
- `docs/PACKAGES.md`
- `docs/architecture/DEPLOYMENT.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/plans/README.md`
- 如有必要：`docs/todos/backend-engineering-optimization-plan.md`

## 需要补充或更新的测试

- `packages/server/src/config.test.ts`
  - 验证新增/调整后的 deployment profile 和兼容 env 解析。
- `packages/server/src/lib/runtime/*.test.ts`
  - 验证 profile 和现有 runtime/serviceUnit 的映射关系。

建议至少新增以下断言：

- 未设置新 profile 时，旧 preset 仍能映射到原有运行时语义。
- `local-agent` 不会要求完整的多用户/worker 环境。
- `distributed` profile 会显式声明依赖 gateway + async ownership，而不是退化为 `combined` 的别名。
- 旧 CLI 配置文件里的 `serverUrl` 会在内存中迁移为 `gatewayUrl`，新写回不再保留 `serverUrl`。

## 验收标准

- 任一文档读者都能区分：
  - 产品形态 profile
  - 进程角色 runtimeMode
  - 异步 ownership serviceUnit
  - 任务投递 task transport
- README、DEPLOYMENT、plan、PACKAGES 对“当前要做什么”给出一致答案。
- 旧 preset 仍可用于兼容启动，但不再承担“产品形态定义”的职责。
- 旧 `serverUrl` 仅作为兼容读取存在，不再出现在正式配置写入与新叙事中。

## 交付要求

- 文档必须清楚说明哪些是当前已实现，哪些是计划中的目标形态。
- 不能在 README/DEPLOYMENT/plan 之间出现互相冲突的部署叙事。
