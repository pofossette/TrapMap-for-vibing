# 待办文档

本目录存放当前仍在考虑，或已经被根 `plan.md` 纳入执行索引但仍以细则形式维护的待办型方案文档。

适合放在这里的内容：

- 需要后续推进的工程化方向
- 尚未落地的流程改进方案
- 需要继续细化的回流、治理、平台化议题

当前文档：

| 文件 | 主题 |
|---|---|
| `badcase-feedback-loop.md` | badcase 回流闭环 |
| `component-replacement-plan.md` | 组件替换计划：通用工具、缓存能力、队列产品化评估 |
| `backend-engineering-optimization-plan.md` | 后端工程化优化计划 |
| `backend-build-targets-plan.md` | 轻重后端构建目标、兼容壳清理与客户端后端形态配置计划 |
| `instrumentation-observability-plan.md` | 数据埋点增强、运行监控、链路追踪与 debug surface 计划 |
| `robustness-scalability-closeout-plan.md` | 健壮性与可扩展性收尾：问题清理、风险收敛、truth source 修复与测试证据补强 |
| `trapmap-architecture-remediation-plan.md` | 当前唯一活跃主线细则：30 个架构问题的单一问题池、阶段复选框、文档矩阵与测试矩阵 |
| `nestjs-service-evolution-00-target-architecture.md` | NestJS 长期目标架构与迁移边界冻结 |
| `nestjs-service-evolution-01-host-and-contract-foundation.md` | Nest 宿主、配置与 contract 基础收口 |
| `nestjs-service-evolution-02-modular-monolith-cutover.md` | 模块化单体切换：边界冻结、兼容层规则与机械迁移提示词 |
| `nestjs-service-evolution-03-service-extraction-and-async.md` | 服务拆分与异步化 |
| `nestjs-service-evolution-04-data-runtime-and-cutover.md` | 数据、运维、退役与收尾 |
| `nestjs-service-evolution-distributed-maturity-assessment.md` | 当前 distributed 形态成熟度评估与升级判据 |
| `nestjs-service-evolution-knowledge-write-governance-review-pilot.md` | 第一批成熟服务样板：`knowledge-write + governance-review` |
| `nestjs-service-evolution-knowledge-write-governance-review-preflight-checklist.md` | 样板实施前检查表 |
| `nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md` | 样板代码迁移任务列表 |
| `open-debt-and-compromises.md` | 当前仍未收口的占位实现、阶段性妥协与开发退路 |

当前根 `plan.md` 已切换为“TrapMap 架构整改计划索引”；当前唯一活跃细则入口为 [`trapmap-architecture-remediation-plan.md`](trapmap-architecture-remediation-plan.md)，用于收口 30 个架构问题的单一问题池、治理主题、进度复选框、文档回写要求和测试矩阵。Phase 0 已完成入口归并、历史输入角色冻结、deferred 入口冻结与统一适配器显式目标冻结。

[`robustness-scalability-closeout-plan.md`](robustness-scalability-closeout-plan.md) 已完成并退回为历史 closeout 参考；`instrumentation-observability-plan.md` 保留为上一轮 observability 主线背景，不再由根计划直接跟踪。
历史状态说明：当前根 `plan.md` 已完成“健壮性与可扩展性收尾”主线；后续新增问题应转入独立审计或独立计划。对当前架构整改主题，这些新增问题应优先进入当前活跃细则的问题池，或转入该细则显式声明的 deferred 落点。

当前 closeout 还冻结了一条 badcase/eval 边界：operator route 可返回 `debug` 闭环信息，但 `scripts/export-badcase-to-eval.ts` 与 eval fixtures 只承载 deterministic `draft`。

当前已明确的 deferred 落点：

- `backend-engineering-optimization-plan.md`：MQ 产品化、监控平台、长期服务化与平台级工程化问题池
- `nestjs-service-evolution-04-data-runtime-and-cutover.md` 与 `nestjs-service-evolution-distributed-maturity-assessment.md`：compatibility shell 进一步退役、owner matrix 历史冻结和 distributed 成熟度审计
- `robustness-scalability-closeout-plan.md` 与 `instrumentation-observability-plan.md`：保留为已完成 closeout / observability 背景，不再承载当前架构整改执行面
