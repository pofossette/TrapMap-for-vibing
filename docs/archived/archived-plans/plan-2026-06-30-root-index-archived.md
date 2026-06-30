# TrapMap 执行计划索引

根 `plan.md` 只做索引；当前主线完成后，只保留归档状态、deferred 落点与历史入口。

## 状态

- 状态：`完成`
- 当前主线：微服务平台能力增强
- 目标：在保持 `gateway only` 与现有 bounded-context/port contract 不变的前提下，完成服务发现、RPC 试点、可观测性与运维 closeout，并将超出本轮范围的平台化议题冻结为 deferred

## 当前主线 closeout 结果

| 细则 | 状态 | 主题 |
|---|---|---|
| [`docs/archived/archived-plans/microservice-platform-evolution-plan.md`](docs/archived/archived-plans/microservice-platform-evolution-plan.md) | 已归档（2026-06-30 closeout / archive / phase4） | 服务发现、内部 RPC、OpenTelemetry/metrics/logging、部署与验证收口 |

## Closeout 结论

- active todo 已满足归档条件；完成项与 deferred 边界见 [`docs/archived/archived-plans/microservice-platform-evolution-plan.md`](docs/archived/archived-plans/microservice-platform-evolution-plan.md)
- 保持 `gateway only` 接入模型；未扩成 Kubernetes / Service Mesh / 独立 service identity 平台
- 共享契约、枚举和可观测性字段真相仍以 `packages/contracts/src/index.ts`、`packages/contracts/src/domain/` 为准
- 本轮未完成的平台化议题统一保留在 [`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md)

## 剩余 deferred

- Kubernetes / Ingress / Service Mesh 平台化
- service-to-service auth hardening
- per-service database
- MQ 全面替换
- 外部缓存平台
- dashboard-as-code / alert rule pack
- container CPU/memory checked-in defaults
- Node heap presets
- PgBouncer / pool introspection contract

## 背景参考

| 文档 | 角色 |
|---|---|
| [`docs/todos/microservice-architecture-and-observability.md`](docs/todos/microservice-architecture-and-observability.md) | 本轮 closeout 的架构盘点与问题输入，不承担执行 checklist |
| [`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md) | 活跃 debt register：当前仍未收口的占位实现、阶段性妥协与开发退路 |
| [`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md) | 轻重后端构建目标与兼容壳收口背景参考，不再由根计划直接跟踪 |
| [`docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`](docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md) | 数据、运行时、退役与平台化 deferred 参考 |

## 已归档

- [`docs/archived/archived-plans/plan-2026-06-30-backend-build-targets-root-index-archived.md`](docs/archived/archived-plans/plan-2026-06-30-backend-build-targets-root-index-archived.md)
- [`docs/archived/archived-plans/microservice-platform-evolution-plan.md`](docs/archived/archived-plans/microservice-platform-evolution-plan.md)
