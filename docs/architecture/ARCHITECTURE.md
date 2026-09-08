# TrapMap 架构

> 权威事实与防漂移规则见 [SYSTEM_TRUTH_SOURCES.md](../reference/SYSTEM_TRUTH_SOURCES.md)。状态：Active。

## 运行态

TrapMap 以 Nest 宿主承载 HTTP 面，以无框架领域内核承载规则。你按部署形态选用三档中的一档：`local-agent`、`team-monolith`、`distributed`。

| 形态 | 宿主 | 代码落点 |
|---|---|---|
| `local-agent` | `host-local` 单用户本地服务 | `packages/host-local/src/nest/`，装配见 `packages/host-local/src/nest/main.ts:22-38` |
| `team-monolith` | `host-local` 单实例多用户 | 同上，`TRAPMAP_DEPLOYMENT_PROFILE=team-monolith` 切换（`docker-compose.yml:20`） |
| `distributed` | `host-distributed` gateway + 多服务 | `packages/host-distributed/src/`，gateway 见 `packages/host-distributed/src/gateway/routes.ts` |

`host-local` 的 `AppModule.forRuntime` 只做组合（`packages/host-local/src/nest/app.module.ts:10-13`），中间件固定为 `RequestContextMiddleware, HttpMetricsMiddleware, LoggingMiddleware`（同文件第 14-18 行）。`host-local` 装配侧 `readDeploymentProfile` 只识别 `local-agent | team-monolith`，其余回落 `local-agent`（`packages/host-local/src/nest/main.ts:30-38`）；`distributed` 由 `host-distributed` 与 compose 接线承载（`docker-compose.yml:88` 起各服务均置 `TRAPMAP_DEPLOYMENT_PROFILE=distributed`）。

组装中心（thin assembly，不新增业务逻辑）：`apps/light/src/`、`apps/distributed/src/`、`apps/migration/src/`。

## 有界上下文

| Context | Owner 包 | 职责 |
|---|---|---|
| `identity-access` | `packages/service-identity-access/src/` | auth / team / member / access-key / session |
| `knowledge-write` | `packages/service-knowledge-write/src/` | 知识 / Trap 写、生命周期、索引副作用 |
| `knowledge-read` | `packages/service-knowledge-read/src/`（+ Go 读服务） | 检索读模型、召回、图查询、经验基因检索 |
| `governance-review` | `packages/service-governance-review/src/` | 审核队列、冲突、decay / maintenance 编排 |
| `candidate-ingestion` | `packages/service-candidate-ingestion/src/` | 候选提交、去重、异步摄取 |
| `job-runtime` | `packages/service-job-runtime/src/` | task queue / outbox / worker / workflow_runs |

判断节点契约注册表在 `packages/assembly/src/contracts/judgment-contracts.ts:93-100`，6 个 descriptor：`intent-recognition`、`dedup-strategy`、`conflict-trigger`、`artifact-derivation`、`label-alignment`、`channel-merge`。

## HTTP 路由

你新增路由时在对应 service 以 `create<X>RouteDefs(deps)` 声明 `RouteDef`，再由双适配器消费。`RouteDef` 与 canonical error envelope 的定义在 `packages/backend-core/src/http/route-contract.ts:50-58,95-108`；框架导入只允许落在 `packages/backend-core/src/http/adapters/fastify.ts` 与 `nest.ts`。Controller 只注入 Port 或 service-assembly factory，不重写业务逻辑。错误信封为 `{ code, message, kind, requestId, traceId?, details? }`；`401` 停留在 guard 层（`packages/host-local/src/nest/runtime/auth.guard.ts`）。

对外与内部路径的逐条对照见 [TrapMap API 契约表面](../reference/api-surface.md)。实现落点：对外在 `packages/host-distributed/src/gateway/route-defs/`，内部在各包 `routes.ts`（形如 `/internal/*`）。

## 持久化

权威存储是 PostgreSQL 16 + pgvector。唯一真源是 `packages/db/src/schema/`；表分布、索引与事务见 [持久化层](components/PERSISTENCE.md)，镜像清单见 [数据库表清单](../reference/DATABASE_SCHEMA.md)，你用 `pnpm check:table-schema` 验证。PG-first：你不引入新的 JSON 文件存储主路径；内存实现只用于测试。

## 启动顺序

宿主经 assembly 装配启动（`packages/host-local/src/nest/main.ts:48-85`）：先在 cordis 之外创建共享运行时（store / pool），再按 profile 构建装配并 boot，以 30 秒上限等待 transport 节点产出 httpSurface，失败则逆序析构；直接运行时注册 SIGINT / SIGTERM 优雅退出（同文件第 87-106 行）。

## 设计灵感

TrapMap 的两大演进方向直接以以下两篇论文为出发点，架构决策与数据模型均对齐其核心结论（详见各组件文档与执行计划）：

| 方向 | 论文 | 链接 | 对 TrapMap 的落点 |
|---|---|---|---|
| **Experience Gene（经验基因）** | *From Procedural Skills to Strategy Genes: Towards Experience-Driven Test-Time Evolution* | HTML: https://arxiv.org/html/2604.15097v2 · ABS: https://arxiv.org/abs/2604.15097 | 文档型 Skill 控制信号稀疏（~2500t, -1.1pp），而 compact、control-oriented 的 Gene（~230t, +3.0pp, 45 scenarios / 4590 trials）更能改善 test-time control。Gene 定义 `g=(m,u,π,α,c,v)` 1:1 映射为本仓 `signalsMatch / summary / strategy / avoid / constraints / validation`，配合 `contentHash=sha256(canonicalJson)`、稳定边界、失败警告、验证接口与 lineage，实现 `trap/skill-artifact/skill-capsule → ExperienceGene` 的派生、固化与 `gene-native` 检索；渲染为 `<strategy-gene>Domain keywords/Summary/Strategy/AVOID</strategy-gene>` 直接注入模型。主线见 `docs/archived/archived-plans/experience-gene-program-mainline-archived.md`，契约见 `packages/contracts/src/domain/experience-gene.ts`，存储见 `packages/db/src/schema/experience-genes.ts` |
| **v3 图编排 / ExecutionPlan** | *GraSP: Agent Skill Graph 编排（腾讯）* + *SkillGraph (2605.12039)* | PDF: https://arxiv.org/pdf/2604.17870 · Plan: `docs/superpowers/plans/2026-05-25-topological-execution-plan.md` | 借鉴 GraSP 的 DAG 编译（`state / data / order` 边）与 SkillGraph 的 `R_ret = TopoSort(R_seed ∪ R_BFS ∪ R_beam)` 拓扑排序，在 `TrapFirstPlan` 中新增 `executionPlan: ExecutionStep[]`。`buildExecutionPlan()` 在 `plan-compiler` 侧对 `mitigates / requires / order` 边执行 Kahn 拓扑排序，输出 `{ rank, nodeId, label, kind:trap-mitigation|skill, blockedBy }`，客户端无需自算顺序；`recommendedSkills` 保持 score 序不变。契约已在 `packages/contracts/src/domain/plans.ts` 落地（`executionStepSchema`） |

> 两篇论文为“灵感出发点”而非照搬：TrapMap 保留 PG-first、RouteDef 双宿主、`approved && !suppressedFromRetrieval` 治理门控与 `off|shadow|serve` 受控 rollout，GEP 的自动 mutation loop 与多 Gene 自由组合不在本轮主线内。
