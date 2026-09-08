# 仓库结构

> 状态：Active。核对日期：2026-09-08。本文档是 TrapMap 仓库布局的权威来源。你看到其他文档描述的目录与本页不一致时，以本页为准。

packages/server（Wave-10 已删除）。你在树里不再给它留位置；历史追溯见 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md（已归档，路径冻结）`。

## 根目录

根目录只放稳定入口与工作区配置。你新增根 Markdown 文件前，先查守卫白名单。

允许的根目录 Markdown 文件：

- `AGENTS.md`
- `CLAUDE.md`
- `CHANGELOG.md`
- `README.md`
- `DESIGN.md`：外部视觉参考，不是品牌规范。
- `architecture.md`
- `plan.md`

历史计划、临时笔记与审计报告一律进 `docs/archived/`，不留在根目录。

## Apps（组装中心）

`apps/` 是顶层 pnpm workspace 的可执行组装中心。它们只做依赖装配与启动入口，不承载业务逻辑（业务规则在 `packages/backend-core` 的各上下文 `domain/`，领域接线在各 service 包）。

- `apps/light/`（`@trapmap/app-light`）：light 宿主组装中心，消费 `packages/host-local`，服务 `local-agent` 与 `team-monolith`。见 `apps/light/package.json`。
- `apps/distributed/`（`@trapmap/app-distributed`）：distributed 组装中心，消费 `packages/host-distributed`，组装 gateway 与 worker 进程。见 `apps/distributed/package.json`。
- `apps/cli/`：Commander CLI 及 CLI 测试。
- `apps/web-panel/`：浏览器管理员运维面板，只做网关客户端。
- `apps/mcp/`：MCP server 协议封装层，经网关 HTTP API 访问后端。
- `apps/migration/`：迁移作业组装中心。

`packages/host-local` 与 `packages/host-distributed` 以库包形式存在：前者暴露 `start()` API，后者经子路径暴露各 `start<X>Service()` API；可执行入口统一落在 `apps/`。

## 产品包

- `packages/contracts/`：共享 Zod schema 与 TypeScript 类型。读模型 helper 只放无副作用的 projection 与 fixture builder。
- `packages/db/`：中立的 Drizzle PostgreSQL 表与可复用无状态列工厂；不承载路由、repository 或服务行为。表清单见 `docs/reference/DATABASE_SCHEMA.md`。
- `packages/backend-core/`：主机无关的后端内核（能力模型、端口接口、用例模式、有界上下文模块、调用模型）。`packages/backend-core/src/http/route-contract.ts` 承载框架中立的 `RouteDef` 路由契约；各有界上下文按 `domain/application` 分层。
- `packages/assembly/`：统一组装中心（`@trapmap/assembly`）。
- `packages/service-identity-access/`：身份访问服务组装与内部路由注册（`createIdentityAccessRouteDefs`，见 `packages/service-identity-access/src/index.ts`）。
- `packages/service-knowledge-read/`：知识读取服务组装（`createKnowledgeReadRouteDefs`，见 `packages/service-knowledge-read/src/index.ts`），拥有检索、读模型与投影视图。
- `packages/service-knowledge-write/`：知识写入服务组装（`createKnowledgeWriteRouteDefs`，见 `packages/service-knowledge-write/src/index.ts`），拥有知识、trap、skill、lifecycle、maintenance 与 decay 接线。
- `packages/service-governance-review/`：治理审核服务组装（`createGovernanceReviewRouteDefs`，见 `packages/service-governance-review/src/index.ts`），拥有 review、feedback、conflict、remediation 与 operator projection，最终生命周期变更委托 knowledge-write。
- `packages/service-candidate-ingestion/`：候选摄取服务组装（`createCandidateIngestionRouteDefs`，见 `packages/service-candidate-ingestion/src/index.ts`），结果发布委托 knowledge-write。
- `packages/service-job-runtime/`：作业运行时服务组装（`createJobRuntimeRouteDefs`，见 `packages/service-job-runtime/src/index.ts`），拥有队列、重试、租约与 dead-letter。
- `packages/service-cron/`：定时调度服务组装（`createCronRouteDefs`，见 `packages/service-cron/src/index.ts`），调度器认领到期 job 后经 task transport 入队，不执行业务逻辑。
- `packages/host-local/`：轻量宿主库包。冻结的默认轻量主线为 `packages/host-local/src/nest/`，六个有界上下文 Nest module 经 adapter 消费各 service 包的 `create*RouteDefs`，不在宿主内手写路由实现。
- `packages/host-distributed/`：重量级宿主库包，服务 distributed 配置，与 light 共用 backend-core 与 service 包主实现。
- `packages/ai-providers/`：AI 提供商统一入口与提示词构建（含 `packages/ai-providers/src/prompt-builder.ts`）。
- `packages/skills/`：项目级 Skill 工件。

`packages/host-local/src/nest/runtime/backend-core-adapters.ts` 是轻量主机端口适配器选择的权威位置（`in-process` 对 `remote`）。这些文件是内部端口的适配器接缝，不是仓库适配器。

`packages/host-distributed/src/gateway/` 是网关传输助手与转发接缝的权威位置，包括路由声明与薄传输壳（只做注册、认证与转发）。`packages/host-distributed/src/shared/` 是分布式内部端口共享包装器的权威位置；这些包装器把传输语义映射回 backend-core 端口语义，不是仓库适配器。服务发现默认值与 URL 解析见 `packages/host-distributed/src/config/service-config.ts`。

其余 `packages/*` 条目你用仓库根的 `ls packages/` 核对（2026-09-08 未逐项复核）。

## 脚本

- `scripts/`：根级工具与守卫脚本。文档相关的是 `scripts/check-doc-drift.ts`、`scripts/check-table-schema.ts` 与 `scripts/doc-rules/` 下的分片规则；复杂度预算见 `scripts/complexity-budgets.json`。
- `scripts/archived/`：一次性与运维脚本收纳位置。

## 文档

- `docs/guides/`：入门和贡献者工作流。
- `docs/operations/`：运行时、CI、安全、测试与部署运维内容。
- `docs/architecture/`：架构概览和组件文档。
- `docs/reference/`：真相源、Schema、术语表、API 表面、仓库结构与环境变量。
- `docs/plans/`：历史设计参考，仅在当前根 `plan.md` 显式重新链接时才重新激活。
- `docs/todos/`：当前执行文档目录。只有被根 `plan.md` 显式链接、且明确承担当前 owner 执行责任的文档属于 active surface；owner 主细则可将其执行顺序中的阶段子文档声明为同一主线的 delegated surface。“仍有参考价值”不足以继续留在这里。
- `docs/archived/`：过时计划、历史报告与退役决策。不要创建 `docs/archive/`。
- `docs/superpowers/`：工作流生成物沉淀区（树中有位置、有豁免声明、有首页说明）。

## 评估

- `evals/retrieval/`：检索数据集、场景、运行器、指标和报告。
- `evals/summary/`：摘要数据集、场景、评判逻辑、运行器和报告。
- `evals/agent-planning/`：Agent 规划对比数据集、场景和运行器。
- `evals/label-alignment/`：标签对齐 fixtures 与评估运行器。
- `evals/graph-extraction/`：图提取、冲突和去重评估。
- `evals/ingestion/`：Skill 摄取 fixtures 和运行器。
- `evals/types/`：eval-only 共享 Zod 契约；产品代码禁止反向导入 `evals/`。
- `evals/fixtures/`：共享 trap fixtures。

## 生成或仅本地目录

以下目录为本地工件，你不得追踪它们：

- `.data/`
- `.tmp/`
- `coverage/`
- `logs/`
- `node_modules/`
- `reports/`
- `packages/*/dist/`

## 归档策略

`docs/archived/` 是人工撰写历史材料的唯一归档根。

- 过时的实施计划：`docs/archived/archived-plans/`
- 历史审计和报告：`docs/archived/reports/`
- 退役的独立文档：`docs/archived/` 根

根 `reports/` 只收生成的评估 JSON 之类本地输出，不放叙述性文档。

## 文件行号锚点（2026-09-08 实测）

- `packages/service-identity-access/src/index.ts:27`：`createIdentityAccessRouteDefs` 导出。
- `packages/service-knowledge-read/src/index.ts:88`：`createKnowledgeReadRouteDefs` 导出。
- `packages/service-knowledge-write/src/index.ts:64`：`createKnowledgeWriteRouteDefs` 导出。
- `packages/service-governance-review/src/index.ts:44`：`createGovernanceReviewRouteDefs` 导出。
- `packages/service-candidate-ingestion/src/index.ts:37`：`createCandidateIngestionRouteDefs` 导出。
- `packages/service-job-runtime/src/index.ts:33`：`createJobRuntimeRouteDefs` 导出。
- `packages/backend-core/src/http/route-contract.ts:51`：`RouteDef` 接口定义。
