# 仓库结构

本文档是 TrapMap 仓库布局的权威来源。

## 根目录

根目录用于稳定的入口点和工作区配置。

允许的根目录 Markdown 文件：

- `AGENTS.md`
- `CLAUDE.md`
- `CHANGELOG.md`
- `README.md`
- `architecture.md`
- `plan.md`

历史计划、临时笔记、审计报告和人工撰写的报告必须放在 `docs/archived/` 下。

## 产品包

- `packages/cli/`：Commander CLI 及 CLI 测试。
- `packages/server（Wave-10 已删除）/`：Fastify 兼容壳和共享运行时/状态接缝。不再充当默认的 `light` 主机入口或本地回退主机。
- `packages/contracts/`：共享 Zod schema 和 TypeScript 类型；`src/domain/retrieval-projection.ts` 放置无副作用的 retrieval projection/read-model helper，`src/domain/retrieval-fixtures.ts` 放置确定性的跨包 retrieval fixture builder。
- `packages/persistence-schema/`：中立的 Drizzle PostgreSQL 表、关系与可复用无状态列工厂；不承载路由、repository 或服务行为。
- `packages/skills/`：项目级 Skill 工件。
- `packages/client-core/`：浏览器兼容的共享网关传输层（HTTP SDK、会话契约、错误模型）。供 CLI 和未来 Web 面板使用。
- `packages/web-panel/`：基于浏览器的管理员运维面板，仅作为网关客户端表面。
- `packages/backend-core/`：主机无关的后端核心内核（运行时能力模型、端口接口、用例模式、有界上下文模块、调用模型）。Phase 2 保持无框架，将每个有界上下文重组为内部 `domain/application/module` 接缝，位于 `src/identity-access/`、`src/knowledge-read/`、`src/knowledge-write/`、`src/candidate-ingestion/`、`src/governance-review/`、`src/job-runtime/`；旧的 `src/modules/*.ts` 兼容外观已移除，消费者使用包入口或上下文入口。所有主机共用。
- `packages/service-identity-access/`：拥有身份访问服务组装、内部路由注册和有界上下文 auth/session/team/member/access-key 接线。
- `packages/service-knowledge-read/`：知识读取服务组装。拥有检索、读模型和投影视图状态路由接线；read model 经 `packages/contracts` 的 projection helper 读取共享契约，不反向导入 server implementation。
- `packages/service-knowledge-write/`：拥有知识写入服务组装、内部路由注册和有界上下文写入接线（knowledge/trap/skill/lifecycle/maintenance/decay）。
- `packages/service-governance-review/`：拥有治理审核服务组装、内部路由注册和有界上下文 review/feedback/conflict/remediation/operator projection 接线，同时将最终生命周期变更委托给 knowledge-write。
- `packages/service-candidate-ingestion/`：拥有候选摄取服务组装、内部路由注册和有界上下文 candidate 接线，同时将结果发布委托给 knowledge-write。
- `packages/service-job-runtime/`：拥有作业运行时服务组装、内部路由注册、队列/重试/租约/dead-letter 依赖接线、typed owner handlers 和运行时服务器引导表面。
- `packages/host-local/`：轻量主机组装，服务于 `local-agent` 和 `team-monolith`。冻结的默认轻量主线为 `src/nest/**`，通过包默认入口（`src/index.ts`）和默认 `dev` / `start` 脚本暴露。
  `packages/host-local/src/nest/adapters/` 是轻量主机中主机拥有的端口适配器选择（`in-process` vs `remote`）的权威放置位置。这些文件是内部端口的适配器接缝，不是仓库适配器，也不是主机组装的万能目录。
  迁移期共享基础设施组合留在 host-local 的 runtime composition 内；它可暂时调用 server compatibility helpers，但不形成独立 workspace package 或 service-to-service concrete import。
- `packages/host-distributed/`：重量级主机组装，服务于 `distributed` 配置文件。它是真正的重量级主机实现，与 `light` 共用相同的 backend-core/service-package 主实现，成熟度基线仍为 `Level 2 / transitional-microservice`。
  `packages/host-distributed/src/gateway/` 是网关传输助手和转发接缝的权威放置位置，包括 `internal-client.ts`（薄内部 HTTP / 规范错误归一化助手）。
  `packages/host-distributed/src/config/service-config.ts` 是服务发现默认值和 URL 解析器接缝的权威放置位置。它拥有显式 `TRAPMAP_*_URL` 覆盖、`distributed` 中的 Docker DNS 默认值和 local/dev 上下文中的 `localhost` 默认值之间的配置感知映射。
  `packages/host-distributed/src/shared/` 是分布式主机中内部端口共享包装器（如 `internal-knowledge-write-client.ts`）的权威放置位置；这些包装器将传输语义映射回 backend-core 端口语义，不是仓库适配器。

Wave-2 closeout（commit `b3374307`）：contracts projection/fixture helpers remain pure shared code; candidate fixture helpers stay under `packages/server（Wave-10 已删除）/src/lib/candidates/`, labels runner helpers stay under `packages/server（Wave-10 已删除）/src/lib/labels/`, and SQL/PG/worker runtime code remains in its owning zone.

Wave-4 closeout（2026-07-21）：`service-governance-review` 是 feedback、conflict、remediation 与 operator projection 的唯一 owner；distributed gateway 只保留 public transport/认证/trace forwarding，`packages/server（Wave-10 已删除）` 不再拥有这些领域的 route、repository、subscriber 或 aggregate member。

Wave-10 intermediate（2026-07-25）：`packages/runtime-infra/` 已退休删除。host-local 直接组合过渡性 store、AI 与 graph infrastructure；`packages/server（Wave-10 已删除）`、snapshot compatibility state 和其余 legacy runtime consumers 仍保留，不能据此宣告完整 package retirement closeout。

## 文档

- `docs/guides/`：入门和贡献者工作流。
- `docs/operations/`：运行时、CI、安全、测试、部署相关的运维内容。
- `docs/architecture/`：架构概览和组件文档。
- `docs/reference/`：真相源、Schema、术语表、API 表面和仓库结构。
- `docs/plans/`：历史设计参考，仅在当前根 `plan.md` 显式重新链接时才重新激活。默认不是并行的 active execution surface。
- `docs/todos/`：当前执行文档目录。只有被根 `plan.md` 显式链接、且明确承担当前 owner 执行责任的文档才属于 active surface；“仍有参考价值”不足以继续留在这里。
- `docs/archived/`：过时的计划、历史报告和退役的决策。
- `docs/superpowers/`：由 Superpowers 工作流生成的计划和规范。

## 评估

- `evals/retrieval/`：检索数据集、场景、运行器、指标和报告。
- `evals/summary/`：摘要数据集、场景、评判逻辑、运行器和报告。
- `evals/agent-planning/`：Agent 规划对比数据集、场景和运行器。
- `evals/label-alignment/`：标签对齐 fixtures、recall/decision 评估和运行器。
- `evals/graph-extraction/`：图提取、冲突和去重评估。
- `evals/ingestion/`：Skill 摄取 fixtures 和运行器。
- `evals/fixtures/`：共享 trap fixtures。

## 生成或仅本地目录

以下目录为本地工件，不得成为被追踪内容：

- `.data/`
- `.tmp/`
- `coverage/`
- `logs/`
- `node_modules/`
- `reports/`
- `packages/*/dist/`
- `packages/*/node_modules/`

## 归档策略

`docs/archived/` 是人工撰写的历史材料的唯一归档根。不要创建 `docs/archive/`。

- 过时的实施计划：`docs/archived/archived-plans/`
- 历史审计和报告：`docs/archived/reports/`
- 退役的独立文档：`docs/archived/`

根目录 `reports/` 保留给生成的评估 JSON 和类似本地输出。不要在那里放置叙述性文档或归档的 Markdown 报告。
