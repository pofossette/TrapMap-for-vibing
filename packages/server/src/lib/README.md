# Server `lib/` 目录布局

`packages/server/src/lib/` 按限界上下文与共享基础设施组织。`lib/` 不是单一的“service layer”，而是承载 server 在 `domain`、`application` 与 `infrastructure` 三层中的实际归属。

## `lib/` 内部的层级归属

| 层 | 常见位置 | 职责 |
|---|---|---|
| `domain` | `lib/<context>/` 下的实体、仓库契约、规则辅助、生命周期策略 | 业务概念、不变量、状态转换，以及 server 其他部分必须遵守的术语 |
| `application` | `lib/<context>/application-*.ts`、具名服务或处理器 | 面向命令用例的编排：actor 解析、聚合读取、repo 写入、生命周期/事件触发，以及已文档化的兼容性 seam |
| `infrastructure` | `lib/persistence/`、`lib/repos/`、`lib/queue/`、`lib/lifecycle/`、`lib/ai/`、`lib/runtime/`、兼容存储适配器 | 具体持久化、队列/运行时集成、AI 适配器、面向启动流程的支撑代码 |

边界规则：

- `domain` 和 `application` 不拥有 bootstrap 或进程生命周期关注点。
- 运行时 readiness、worker 启动、迁移执行和恢复逻辑留在基础设施模块。
- 读模型组装应保留在读侧模块，例如 `retrieval/` 或其他 projection 模块；写侧应用服务应返回写入结果，而不是悄悄组装 retrieval/runtime projection，除非该耦合已经被显式文档化。

## 限界上下文模块

| 目录 | 主要归属 |
|---|---|
| `knowledge/` | knowledge / trap / review / decay 的写侧领域与应用服务 |
| `artifacts/` | artifact 生命周期领域、仓库实现与派生 artifact 支撑 |
| `candidates/` | candidate 摄取领域、应用服务、重复检测、解决流程与处理策略 |
| `retrieval/` | 读侧检索编排、召回、评分、capsule、graph plan 与响应组装 |
| `indexing/` | 派生索引流水线、适配器、graph-lite、向量、关键词与归一化 |
| `governance/` | 供接口层和应用流复用的权限与资格策略 |
| `auth/`、`users/`、`teams/` | 身份与访问控制领域，以及基于 repo 的应用辅助模块 |
| `feedback/`、`decay/`、`maintenance/` | 反馈 / 补救，以及贴近生命周期的 operator 用例 |

## 共享基础设施

| 目录 | 职责 |
|---|---|
| `persistence/` | store 创建、迁移、Drizzle schema 与 PostgreSQL store |
| `repos/` | 通过 `app.skillShareer.repos` 暴露的聚合仓库边界 |
| `queue/` | 任务队列原语与面向 worker 的基础设施 |
| `lifecycle/` | 事件总线、生命周期状态机与订阅器 |
| `ai/` | provider 配置、prompt、动态上下文与缓存 |
| `runtime/` | request context、韧性策略、运行时元数据与指标快照 |
| `store/` 与 `store.ts` | JSON 兼容 store 与 store record 类型 |

## 重上下文的放置规则

| 上下文 | 保留在 domain/application 的内容 | 保留在 infrastructure/read side 的内容 |
|---|---|---|
| `knowledge` | submit / resubmit / supersede / review / decay 命令、生命周期变更、具名兼容债务 | repo 实现、索引适配器、生命周期订阅器、启动接线 |
| `candidate ingestion` | 提交、重复/审查决策、补救命令、处理策略 | 队列传输、候选恢复、worker 启动、PG/JSON 存储细节 |
| `feedback/remediation` | 反馈命令处理、badcase / remediation 状态变更、reactivation 决策 | 持久化适配器、异步订阅器/钩子、worker 执行、operator 传输 |
| `operations/runtime` | 仅限明确命名的管理类用例 | `/health` 与 `/ready`、启动时序、运行时快照、迁移执行、worker 监管 |

## 测试放置规则

新的单元测试应与被测模块同目录放置，命名为 `*.test.ts`。跨领域 smoke 测试与迁移守卫测试可以继续保留在 `packages/server/src/__tests__/`。

## 原始报告热点到 `lib/` 模块的映射

fm-agent 原始报告（391 个已确认发现）中的领域热点，与当前 `lib/` 模块的映射关系如下：

| 原始热点桶 | 报告数 | `lib/` 模块 | 当前状态 |
|---|---|---|---|
| `lib/retrieval/capsules` | 31 | `retrieval/capsules/` | 大部分已过时（Phase 7 胶囊原生检索已落地） |
| `lib/persistence/schema` | 24 | `persistence/schema/` | 大部分已过时（多轮 Drizzle 迁移已演进） |
| `lib/retrieval/recall` | 19 | `retrieval/recall/` | 大部分已过时（PG 关键词 + 语义召回已落地） |
| `lib/artifacts/pg-repository` | 16 | `artifacts/pg-repository/` | 已收敛（原 `updateLifecycle` gap 已修复） |
| `lib/indexing/graph-lite` | 15 | `indexing/graph-lite/` | 大部分已过时（graph-lite 索引已就绪） |
| `lib/indexing/adapters` | 13 | `indexing/adapters/` | 大部分已过时（适配器注册表已构建） |
| `lib/ai/providers` | 12 | `ai/` | 大部分已过时（所有 provider 均已实现） |
| `lib/retrieval/orchestration` | 9 | `retrieval/orchestration/` | 全部已过时（orchestrator v1/v2 已落地） |

> `docs/plans/fm-agent-scan/server-live-gap-matrix.md` 仍保留原始热点到当前模块的映射，但自 2026-05-29 审计后已经没有 current-live finding。
