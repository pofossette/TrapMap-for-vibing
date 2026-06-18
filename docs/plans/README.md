# 活跃计划

本目录保存仍在使用或仍被当前文档引用的长期设计计划。

规则：

1. 根 `plan.md` 是当前后端执行轨道的总规约与索引。
2. `docs/plans/` 用于仍被当前文档引用的长期设计计划，以及由根索引链接出去的细则计划目录。
3. 过时的执行计划必须移动到 `docs/archived/archived-plans/`。
4. 过时的报告必须移动到 `docs/archived/reports/`。
5. 新计划应优先使用 `_templates/` 里的模板，以保持结构一致。

## 模板

| 模板 | 使用场景 |
|----------|------------|
| [`_templates/implementation-phase.md`](./_templates/implementation-phase.md) | 分阶段交付的增量特性实现 |
| [`_templates/backend-stabilization.md`](./_templates/backend-stabilization.md) | 在增强前先稳定现有后端能力 |

## 当前文件

| 文件 | 状态 | 保留原因 |
|---|---|---|
| `deployment-flexibility/` | active-reference | 灵活构建部署、gateway-only CLI 接入与重后端微服务化总细则，由根 `plan.md` 链接 |
| `runtime-recomposition/` | active-reference | 共享客户端核心包、后端核心内核、轻宿主与重宿主拆分计划，由根 `plan.md` 链接 |
| `backend-engineering-roadmap/` | active-reference | Stage 1、Stage 2、耦合度降低计划及其执行包目录，由根 `plan.md` 链接 |
| `fm-agent-scan/` | active-reference | FM-agent 原始报告整改计划、source pack 和 live-gap matrix |
| `capsule-contextual-enrichment-plan.md` | active-reference | 检索/capsule 设计上下文 |
| `round4-cross-table-consistency-plan.md` | active-reference | package 文档引用的 artifact 结构化事实源 |
| `v2-multi-recall-plan.md` | active-reference | 检索设计上下文 |

## 后端工程化阶段总结

当前后端工程化三段主线已经完成并回写到根 `plan.md`：Stage 1「基础与边界」、Stage 2「异步运行时与读写分离」、以及横切「耦合度降低」。这些成果仍然有效，现阶段的活跃路线是在它们之上继续推进“灵活构建部署 + gateway-only CLI 接入 + 重后端微服务化”的统一叙事。

当前这条路线的交付入口以三种 deployment profile 为主：

- `local-agent`
- `team-monolith`
- `distributed`

对应的脚本、compose profile、环境变量与测试矩阵已分别收敛到根 `package.json`、`docker-compose.yml`、环境模板和部署/测试文档中；新增长期计划时，不应再回到只用 `monolith` / `split-pg` / `split-rabbitmq` 讲产品形态。

当前仓库仍然优先复用模块化单体时期沉淀下来的 `repos`、application service、shared job / outbox worker、runtime seams 与显式 projection seam；这不再意味着“排除分布式目标形态”，而是意味着 `distributed` 的第一阶段仍需建立在共享 contracts、共享 PostgreSQL 与现有 runtime ownership 之上，而不是平行重写第二套后端。

当前活跃的 Stage 3 细化执行包主要覆盖五条工程化主线：

- freshness / projection lag contract
- idempotency / retry / resume / failure semantics
- operator surface
- config governance / capacity modeling
- cache invalidation / bulk path operations

仍保留并已记录的迁移债务主要有两类：一是 Stage 1C 中 `store.transact()` 到 repo-backed transaction 的剩余迁移，当前以 `supersede` 等命名化兼容路径为主；二是灵活部署路线里的明确非目标，当前继续排除 MCP、CLI 直连多个服务、按服务拆库，以及把 Kafka/NATS/Redis Streams 作为默认基础设施。此前点名的 `review-queue` 与 `decay entries/search` 读侧投影已收口到 `lib/operations/read-model.ts`，不再属于 route-local query assembly 债务。
