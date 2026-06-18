# Deployment Flexibility Plan 01: Profile And Capability Model

## 状态

- 状态：`partially landed`
- 审计结论：核心解析层与 capability 驱动装配已落地，但文档仍混有落地前叙事，需要明确“已完成”和“剩余收口”。

## 目标

把现有零散的部署开关收敛为统一的 profile/capability 模型，作为所有运行时、路由暴露和构建脚本的事实源。

## 当前事实

- `packages/server/src/lib/runtime/deployment-profile.ts` 已提供正式的 `ResolvedRuntimeDeployment`
- `packages/server/src/config.ts` 已写入 `deployment.resolved`
- `packages/server/src/app.ts`、`src/index.ts`、`src/worker.ts` 已统一消费 deployment 解析结果
- `packages/server/src/lib/runtime/http-surface.ts` 已按 capability/route surface 驱动不同 HTTP 暴露面
- `packages/server/src/lib/runtime/runtime-metadata.ts` 与相关状态路由已开始暴露：
  - profile
  - route surface
  - async ownership expectation
  - service topology metadata

## 已完成

- 统一解析层已存在，`deployment preset` 已退回兼容输入。
- route registration 已按 `minimal-agent` / `gateway-core` / `worker-status` 收敛。
- runtime metadata、`/health`、`/ready`、`/v1/operations/status/async` 已开始表达 profile/capability 语义。

## 剩余收口

- 明确哪些 capability 仍仅用于 metadata/route surface，哪些已实际控制 boot strategy。
- 继续减少散落的 runtime 条件分支，避免出现“统一解析结果存在，但调用方仍各自推导”的回潮。
- 把本文件中的“建议模型”收敛为与现有代码命名一致的术语，避免文档自造另一套字段名。

## 详细改动内容

- 在 server runtime 层引入统一的 deployment profile 解析结果，至少覆盖：
  - profile 名称
  - transport surface
  - store kind
  - auth/tenancy 模式
  - async execution mode
  - enabled capability set
- 重新定义 `deployment preset` 的职责：
  - 作为兼容输入
  - 解析后映射到 profile + runtime ownership，而不是直接成为事实源
- 规定三类 profile 的能力面：
  - `local-agent`：retrieval-first、本地单用户、最小路由与最轻持久化
  - `team-monolith`：完整单体后端、统一 API、PostgreSQL 主路径
  - `distributed`：gateway + 多服务/多 worker、适配微服务部署
- 规定 capability 如何驱动：
  - 路由注册
  - worker boot ownership
  - runtime health/readiness
  - config 校验

## 目标模型

建议引入三层结果，而不是继续把所有语义塞给 `deployment preset`：

1. `DeploymentProfile`
   - `local-agent`
   - `team-monolith`
   - `distributed`

2. `DeploymentCapabilities`
   - `exposesGateway`
   - `exposesFullHttpApi`
   - `supportsLocalSingleUserMode`
   - `requiresPostgres`
   - `supportsJsonStore`
   - `ownsCandidateTaskWork`
   - `ownsSharedJobTaskWork`
   - `ownsOutboxWork`
   - `supportsReviewGovernance`
   - `supportsTeamAuth`
   - `supportsDistributedRouting`

3. `ResolvedRuntimeDeployment`
   - profile
   - preset
   - runtimeMode
   - serviceUnit
   - capabilities

## 建议分步

### Step 1. 新增统一解析层

- 新增或重构 runtime 模块，使 `config + env + preset` 最终先解析成 `ResolvedRuntimeDeployment`。
- `resolveDeploymentPreset()` 保留，但只作为兼容输入解析器。
- `index.ts`、`worker.ts`、`app.ts` 改为消费统一解析结果，而不是各自重复推导。

### Step 2. 用 capability 驱动装配

- `buildServer()` 不再默认全量注册所有 routes。
- route registration 按 capability 分组：
  - minimal agent routes
  - core API routes
  - governance/admin routes
- worker bootstrap 按 capability 决定：
  - 是否启动本地 worker
  - 是否只注册 owner metadata
  - 是否在 `local-agent` 下降级为更轻量的执行模式

### Step 3. 用 capability 驱动 readiness 语义

- `/health` 与 `/ready` 应根据 capability 判断：
  - 某 worker 未运行是故障，还是“本实例本就不拥有该工作”
  - `local-agent` 下没有完整 team/auth 不应被视为 not-ready
  - `distributed` 下远端 owner 应体现为 expected remote ownership

### Step 4. 保持兼容输入

- 现有 env 和 scripts 短期仍可用：
  - `RUNTIME_MODE`
  - `TRAPMAP_SERVICE_UNIT`
  - `TRAPMAP_DEPLOYMENT_PRESET`
- 但新文档和新脚本优先使用新的 profile 语义。

## 涉及代码入口

- `packages/server/src/config.ts`
- `packages/server/src/index.ts`
- `packages/server/src/worker.ts`
- `packages/server/src/app.ts`
- `packages/server/src/lib/runtime/deployment-preset.ts`
- `packages/server/src/lib/runtime/runtime-contract.ts`
- `packages/server/src/lib/runtime/service-unit.ts`
- `packages/server/src/lib/runtime/runtime-metadata.ts`
- `packages/server/src/lib/runtime/http-surface.ts`
- `packages/server/src/lib/runtime/service-topology.ts`
- `packages/server/src/bootstrap/run-startup-sequence.ts`
- `packages/server/src/bootstrap/run-worker-sequence.ts`
- `packages/server/src/bootstrap/bootstrap-workers.ts`

## 需要同步更新的文档

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DEPLOYMENT.md`
- `docs/PACKAGES.md`

## 需要补充或更新的测试

- `packages/server/src/lib/runtime/runtime-metadata.test.ts`
  - 覆盖不同 profile 下的 ownership / readiness 语义。
- `packages/server/src/app.test.ts`
  - 覆盖不同 profile 下的 server 装配结果。
- `packages/server/src/bootstrap/startup.test.ts`
  - 覆盖 profile 对 startup/worker boot 的影响。

建议补充的具体场景：

- `local-agent` profile:
  - 只开放最小路由
  - 不要求本地拥有完整 candidate/shared/outbox worker
- `team-monolith` profile:
  - 可对应当前 `combined` 行为
  - readiness 与现有单体语义兼容
- `distributed` profile:
  - API/gateway 进程不因未启动本地 worker 而 not-ready
  - 专用 worker 进程只对自己拥有的任务负责
- CLI/文档所见 profile 词汇与 runtime metadata 中暴露的 profile 词汇完全一致。

## 验收标准

- [x] 任何一处 runtime 装配都只消费一份统一的 deployment 解析结果。
- [x] route/worker/health 三个系统的部署语义一致。
- [x] 不再出现“文档里叫 split/distributed，代码里只有 preset/runtimeMode”的双重叙事。
- [ ] startup / worker boot / topology metadata 的最后一层散落条件判断被继续压缩，没有重新分叉出第二套 profile 判定。

## 交付要求

- 实现者不能再通过散落的 `if env === ...` 判断定义产品形态。
- 新增 profile/capability 结构必须可被文档直接引用。

## 本轮落地说明

- `packages/server/src/lib/runtime/deployment-profile.ts` 现在提供正式的 `ResolvedRuntimeDeployment`
- `packages/server/src/config.ts` 会把 `deployment.resolved` 写入配置结果
- `packages/server/src/app.ts`、`src/index.ts`、`src/worker.ts` 统一消费 `deployment.resolved`
- runtime metadata、`/health`、`/ready`、`/v1/operations/status/async` 已开始暴露 profile/capability 语义
- route registration 已按 `minimal-agent` / `gateway-core` / `worker-status` 收敛为 capability 驱动
- `packages/server/src/lib/runtime/service-topology.ts` 已把 distributed phase-1 的共享基础设施与延后隔离边界纳入 metadata 叙事
