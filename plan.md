# TrapMap 执行计划索引

根 `plan.md` 只做索引；阶段任务、执行 checklist、验证矩阵与完成定义统一写在当前活跃细则。

## 状态

- 状态：`进行中`
- 当前主线：微服务平台能力增强
- 目标：在保持 `gateway only` 与现有 bounded-context/port contract 不变的前提下，继续推进服务发现、RPC 评估与落地、更强的可观测性与资源治理

## 当前活跃细则

| 细则 | 状态 | 主题 |
|---|---|---|
| [`docs/todos/microservice-platform-evolution-plan.md`](docs/todos/microservice-platform-evolution-plan.md) | 进行中 (0%) | 服务发现、内部 RPC、OpenTelemetry/metrics/logging、部署与验证收口 |

## 总体要求

- 当前唯一执行面是 [`docs/todos/microservice-platform-evolution-plan.md`](docs/todos/microservice-platform-evolution-plan.md)；进度更新统一回写该细则中的复选框
- 保持 `light` / `heavy` 只是 build target 术语，不能改写 `local-agent`、`team-monolith`、`distributed` 三个 deployment profile 的既有真相
- 保持 `gateway only` 接入模型；不得让 CLI、`client-core` 或其他外部调用方直连内部 service
- 共享契约、枚举和可观测性字段继续以 `packages/contracts/src/index.ts`、`packages/contracts/src/domain/` 为准
- 服务发现、RPC、可观测性能力的增强必须优先复用既有 port-first、transport-agnostic 设计，不得引入第二套业务真相
- 文档回写顺序遵循 [`docs/guides/DOCUMENTATION_GOVERNANCE.md`](docs/guides/DOCUMENTATION_GOVERNANCE.md)：先更新 truth source/源码，再更新说明文档和入口索引

## 文档与测试要求

- 每个阶段完成后，至少同步检查并回写受影响的 `docs/reference/*`、`docs/architecture/*`、`docs/operations/*` 与 `docs/README.md`
- 涉及环境变量、部署默认值、服务发现行为、RPC transport 约定、metrics/tracing/logging contract 变化时，必须更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- 涉及 shared contract、内部 API shape、观测字段或状态枚举变化时，必须补跑受影响包测试与 `rtk pnpm typecheck`
- 涉及 distributed 路径、检索/治理/异步运行时、可观测性链路时，至少补跑对应最小测试与 `rtk pnpm eval:smoke`

## 背景参考

| 文档 | 角色 |
|---|---|
| [`docs/todos/microservice-architecture-and-observability.md`](docs/todos/microservice-architecture-and-observability.md) | 当前主线的架构盘点与问题输入，不承担执行 checklist |
| [`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md) | 活跃 debt register：当前仍未收口的占位实现、阶段性妥协与开发退路 |
| [`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md) | 轻重后端构建目标与兼容壳收口背景参考，不再由根计划直接跟踪 |
| [`docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`](docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md) | 数据、运行时、退役与平台化 deferred 参考 |

## 已归档

上一轮根计划已归档至 [`docs/archived/archived-plans/plan-2026-06-30-backend-build-targets-root-index-archived.md`](docs/archived/archived-plans/plan-2026-06-30-backend-build-targets-root-index-archived.md)。

## Closeout 前的守卫

- [ ] `rtk pnpm check:docs-drift`
- [ ] `rtk pnpm check:structure`
- [ ] 当前活跃细则中的阶段 checklist、文档更新要求与完成定义全部满足
