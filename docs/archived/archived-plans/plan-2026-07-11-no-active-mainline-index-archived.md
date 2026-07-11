# TrapMap 执行计划索引

根 `plan.md` 只保留一个当前执行入口，作目录性质的索引，不承载 tranche checklist 或实施细节。

## 当前主线

当前无 active mainline。新的执行工作开始时，创建一份新的主细则并由本索引显式链接；不得恢复归档 checklist 继续承担执行责任。

## 总体要求

- `light` 仅归并 `local-agent` 与 `team-monolith`，`heavy` 仅归并 `distributed`；不得新增第四种 deployment profile。
- 所有外部客户端继续采用 gateway-only：`backendTarget` 不得创建第二个 URL、认证模型或内部服务发现路径。
- 共享枚举、schema 与 API shape 由 `packages/contracts` 定义并通过既有 `enum-types/` 聚合导出；host、CLI 与脚本只能消费该事实源。
- 后续主细则必须勾选进度项、执行最小测试、类型检查和文档守卫，并回写实际结果。
- 主细则关闭后，将其归档到 `docs/archived/archived-plans/`，同步更新 `docs/archived/README.md` 与 `docs/todos/README.md`。

## 历史入口

- [已归档的 engineering debt 根索引](docs/archived/archived-plans/plan-2026-07-11-engineering-debt-closeout-index-archived.md)
- [已归档的 engineering debt 主细则](docs/archived/archived-plans/open-debt-and-compromises-2026-07-11-archived.md)
- [已归档的 light / heavy 后端构建目标与客户端选择细则](docs/archived/archived-plans/backend-build-targets-and-client-selection-archived.md)
