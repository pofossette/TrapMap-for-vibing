# TrapMap 执行计划索引

根 `plan.md` 只做索引；阶段任务、设计冻结、验证矩阵与完成定义统一写在当前活跃细则。

## 状态

- 状态：`完成`
- 收口 30 个架构问题，避免继续在多份计划里并行定义当前状态、目标状态和 deferred 入口
- 当前主线阶段：`Phase 0-7 全部完成`
- [x] Wave 7H：增强 doc-drift / structure / complexity 守卫，覆盖当前唯一活跃细则、历史 todo 状态、plan/todos 索引一致性和本轮热点文件预算

## 当前活跃细则

| 细则 | 状态 | 主题 |
|---|---|---|
| [`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md) | 进行中 (~35%) | 轻重后端构建目标、兼容壳清理与客户端后端形态配置 |

## 背景参考（不承担当前执行面）

| 文档 | 角色 |
|---|---|
| [`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md) | 活跃 debt register：当前仍未收口的占位实现、阶段性妥协与开发退路 |
| [`docs/todos/nestjs-service-evolution-01-host-and-contract-foundation.md`](docs/todos/nestjs-service-evolution-01-host-and-contract-foundation.md) | Nest 宿主、配置与 contract 基础收口 (~60%) |
| [`docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md`](docs/todos/nestjs-service-evolution-02-modular-monolith-cutover.md) | 模块化单体切换：边界冻结、兼容层规则与机械迁移提示词 (~55%) |
| [`docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`](docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md) | 数据、运维、退役与收尾 (~55%) |

## 已归档

架构整改主线 Phase 0-7 已全部完成（2026-06-28），相关文档已归档至 [`docs/archived/archived-plans/`](docs/archived/archived-plans/)。详见 [`docs/archived/README.md`](docs/archived/README.md)。

归档内容包括：
- `trapmap-architecture-remediation-plan.md` — 架构整改 30 个问题的单一问题池，Phase 0-7 全部完成
- `robustness-scalability-closeout-plan.md` — 健壮性与可扩展性收尾，已完成
- `badcase-feedback-loop.md` — badcase 回流闭环，已完成
- `backend-engineering-optimization-plan.md` — 后端工程化优化，85% 完成，剩余 1 项转入 debt register
- `instrumentation-observability-plan.md` — 数据埋点增强，45% 完成，不再由根计划跟踪
- `component-replacement-plan.md` — 组件替换计划，5% 完成，未启动
- `nestjs-service-evolution-00-target-architecture.md` — 目标架构冻结，已完成
- `nestjs-service-evolution-03-service-extraction-and-async.md` — 服务拆分与异步化，proposed 状态
- `nestjs-service-evolution-distributed-maturity-assessment.md` — 分布式成熟度评估
- `nestjs-service-evolution-knowledge-write-governance-review-*.md` — 成熟服务样板 3 件套，proposed 状态

## 当前活跃细则执行规则

- 每完成一个阶段或子项，同步更新 [`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md) 中的对应复选框
- 新增问题应优先进入当前活跃细则的问题池，或转入该细则显式声明的 deferred 落点
- 不再回写已归档的旧主线；若需继续深入旧主线主题，应新开独立审计或独立计划

## Closeout 前的守卫

- [ ] `rtk pnpm check:docs-drift`
- [ ] `rtk pnpm check:structure`
- [ ] 当前活跃细则的完成定义全部满足
