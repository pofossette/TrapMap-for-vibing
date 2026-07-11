# TrapMap 执行计划索引

根 `plan.md` 只保留一个当前执行入口，作目录性质的索引，不承载 tranche checklist 或实施细节。

## 当前主线

- 当前主线：light / heavy 后端构建目标与客户端选择
- 状态：`planned`
- 目标：以一个可验证的 target registry 管理两种后端构建目标；保持三档 deployment profile 的既有语义，并让客户端以单一、兼容的配置项表达目标偏好。
- 主细则：[`docs/todos/backend-build-targets-and-client-selection.md`](docs/todos/backend-build-targets-and-client-selection.md)

## 总体要求

- `light` 仅归并 `local-agent` 与 `team-monolith`，`heavy` 仅归并 `distributed`；不得新增第四种 deployment profile。
- 所有外部客户端继续采用 gateway-only：`backendTarget` 不得创建第二个 URL、认证模型或内部服务发现路径。
- 共享枚举、schema 与 API shape 由 `packages/contracts` 定义并通过既有 `enum-types/` 聚合导出；host、CLI 与脚本只能消费该事实源。
- 每个阶段完成前，勾选主细则中的进度项，执行其中的最小测试、类型检查和文档守卫，并回写实际结果。
- 主细则关闭后，将其归档到 `docs/archived/archived-plans/`，同步更新 `docs/archived/README.md` 与 `docs/todos/README.md`。

## 历史入口

- [已归档的 engineering debt 根索引](docs/archived/archived-plans/plan-2026-07-11-engineering-debt-closeout-index-archived.md)
- [已归档的 engineering debt 主细则](docs/archived/archived-plans/open-debt-and-compromises-2026-07-11-archived.md)
