# TrapMap 执行计划索引

根 `plan.md` 只维护当前执行入口、状态和最小回写要求；实现细节统一写在 `docs/todos/` 的活跃细则中。

## 当前主线

- 当前主线：待办收口与后续整合
- 状态：`收口中`
- 主细则：[`docs/todos/active-closeout-and-followups.md`](docs/todos/active-closeout-and-followups.md)
- 活跃 debt register：[`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md)

### 审计结论（2026-07-03）

- 旧 `docs/todos/` 中的大部分文件已不适合作为并行活跃 checklist：一部分已被代码和 closeout 证据兑现，另一部分只是 future proposal
- 当前仍真实未完成的事项已收敛为四类：observability 最终 closeout、`host-local`/`packages/server` 边界收口、静态分析/占位实现清理、resilience/LLM 调用硬化
- 已完成或仅作背景参考的旧细则已归档到 `docs/archived/`，避免继续分散 active 面

## 当前活跃要求

- 新发现的问题、风险和 deferred，优先回写到 [`docs/todos/active-closeout-and-followups.md`](docs/todos/active-closeout-and-followups.md) 或 [`docs/todos/open-debt-and-compromises.md`](docs/todos/open-debt-and-compromises.md)
- 任何 API surface、运行时默认值、部署行为、服务发现或可观测性语义变化，先更新权威事实页，再更新二级说明文档
- 文档或目录规则改动完成后，至少运行 `rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure`
- 涉及 runtime/profile/route surface、部署默认值、健康检查或服务发现链路时，补跑对应最小验证

## 背景归档入口

- 服务发现与可观测性历史细则：[`docs/archived/archived-plans/service-discovery-and-observability-plan.md`](docs/archived/archived-plans/service-discovery-and-observability-plan.md)
- 轻重后端构建目标冻结结论：[`docs/archived/archived-plans/backend-build-targets-plan.md`](docs/archived/archived-plans/backend-build-targets-plan.md)
- 本地 closeout 执行证据：[`docs/archived/local-deployment-observability-checklist.md`](docs/archived/local-deployment-observability-checklist.md)
- 六边形清理与残余任务背景：[`docs/archived/archived-plans/hexagonal-architecture-cleanup.md`](docs/archived/archived-plans/hexagonal-architecture-cleanup.md)、[`docs/archived/archived-plans/nestjs-service-evolution-residual-tasks.md`](docs/archived/archived-plans/nestjs-service-evolution-residual-tasks.md)
