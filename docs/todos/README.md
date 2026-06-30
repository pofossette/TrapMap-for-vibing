# 待办文档

本目录存放当前仍在考虑，或已经被根 `plan.md` 纳入执行索引但仍以细则形式维护的待办型方案文档。

## 背景/deferred 参考

适合放在这里的内容：

- 需要后续推进的工程化方向
- 尚未落地的流程改进方案
- 需要继续细化的回流、治理、平台化议题

## 不再描述为仍由当前根计划并行拥有的 checklist

当前文档：

| 文件 | 主题 | 状态 |
|---|---|---|
| `backend-build-targets-plan.md` | 轻重后端构建目标、兼容壳清理与客户端后端形态配置计划 | 进行中 (~35%) |
| `nestjs-service-evolution-residual-tasks.md` | NestJS 服务演进 Phase 01/02/04 归档后的残余任务去重整合 | 活跃 |
| `open-debt-and-compromises.md` | 当前仍未收口的占位实现、阶段性妥协与开发退路 | 活跃 debt register |
| `static-analysis-audit-2026-06-29.md` | fallow 静态分析审计：占位实现、未接入代码、死代码（382 问题） | 待处理 |
| `microservice-architecture-and-observability.md` | 六个有界上下文双重运行模式、服务间通信、可观测性、服务发现、内存管理、RPC 引入路径 | 参考输入 |

## 已归档

`microservice-platform-evolution-plan.md` 已于 2026-06-30 完成 Phase 4 closeout，并归档至 [`../archived/archived-plans/microservice-platform-evolution-plan.md`](../archived/archived-plans/microservice-platform-evolution-plan.md)。

NestJS 服务演进 Phase 01/02/04 已于 2026-06-30 归档，残余任务整合入 `nestjs-service-evolution-residual-tasks.md`：

- `nestjs-service-evolution-01-host-and-contract-foundation.md` — Phase 1 工程任务全部完成，归档
- `nestjs-service-evolution-02-modular-monolith-cutover.md` — 六 bounded context 完成、默认入口已切 Nest，归档
- `nestjs-service-evolution-04-data-runtime-and-cutover.md` — 大部分 closeout 已满足，未完成项转入 residual tasks

2026-06-29 的批量归档仍保留已完成和 deferred 的旧主线，详见 [`docs/archived/README.md`](../archived/README.md)。

后续新增问题应转入独立审计或独立计划，不再回写已归档的旧主线。

归档文件：
- `microservice-platform-evolution-plan.md` — 微服务平台能力增强主线，Phase 0-4 closeout 完成并归档
- `trapmap-architecture-remediation-plan.md` — 架构整改主线，Phase 0-7 全部完成
- `robustness-scalability-closeout-plan.md` — 健壮性与可扩展性收尾，已完成
- `badcase-feedback-loop.md` — badcase 回流闭环，已完成
- `backend-engineering-optimization-plan.md` — 后端工程化优化，85% 完成，剩余 1 项转入 debt register
- `instrumentation-observability-plan.md` — 数据埋点增强，45% 完成，不再由根计划跟踪
- `component-replacement-plan.md` — 组件替换计划，5% 完成，未启动
- `nestjs-service-evolution-00-target-architecture.md` — 目标架构冻结，已完成
- `nestjs-service-evolution-01-host-and-contract-foundation.md` — Phase 1 完成，归档
- `nestjs-service-evolution-02-modular-monolith-cutover.md` — Phase 2 完成，归档
- `nestjs-service-evolution-03-service-extraction-and-async.md` — 服务拆分与异步化，proposed 状态
- `nestjs-service-evolution-04-data-runtime-and-cutover.md` — Phase 4 大部分完成，归档
- `nestjs-service-evolution-distributed-maturity-assessment.md` — 分布式成熟度评估，评估完成
- `nestjs-service-evolution-knowledge-write-governance-review-pilot.md` — 成熟服务样板，proposed 状态
- `nestjs-service-evolution-knowledge-write-governance-review-preflight-checklist.md` — 样板实施前检查表，proposed 状态
- `nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md` — 样板代码迁移任务列表，proposed 状态
