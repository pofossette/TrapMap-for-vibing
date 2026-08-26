# Experience Gene Infrastructure and Pipeline

## Status

- **Active mainline（2026-08-25 启动）。**
- 本细则是根 `plan.md` 当前唯一链接的 owner execution surface。
- 执行顺序固定为基础设施先行，然后进入契约、派生、检索和治理 rollout。
- Phase 1-4 已提交。Phase 3 完成 snapshot loaders、rule/LLM extractors、validation/safety/duplicate gates、projection retry、solidified outbox emission、truth-source stale/remediation handling 和双宿主 rollout-gated task fanout/consume。Phase 4 完成 Gene retrieval contracts、pure selection、keyword/vector recall adapters、双宿主 RouteDefs、internal client forwarding 和 `<strategy-gene>` activation rendering。Phase 5 已开始：focused deterministic evaluation harness 与 documentation truth 同步已落地；process metrics、live promotion comparison、governance sampling 与 rollback verification 进行中。
- Phase 1 实现已落地并通过 focused tests、typecheck 和新增发现审计；阶段 closeout 仍受 Fallow branch baseline 决策与本机 Docker 环境门控约束，详见 [infrastructure problem pool](experience-gene-infrastructure-foundation.md#problem-pool)。

## Background

论文 [From Procedural Skills to Strategy Genes: Towards Experience-Driven Test-Time Evolution](https://arxiv.org/abs/2604.15097) 的核心结论是：文档型 Skill 的控制信号稀疏；把经验组织为 compact、control-oriented 的 Gene，比继续扩充文档更能改善 test-time control。Gene 需要稳定边界、结构化字段、失败警告、验证接口和 lineage，才能支持检索、复用和迭代演化。

TrapMap 已经具备 trap 治理、skill artifact 版本化、capsule/profile/client manifest 派生、PostgreSQL 结构化子表、pgvector、task queue/outbox、RouteDef 双宿主适配和 CLI/MCP 接入面。当前缺口是：`MATCH/GOAL/STRATEGY/AVOID/VERIFY` 只是文档约定，不是共享契约；trap 和 capsule 还不能派生出一等 Gene 对象；检索结果也不能直接返回模型可注入的 strategy control block。

## Goal

把已批准的 trap 与 skill/capsule 经验派生为 `ExperienceGene`，为其建立独立生命周期、持久化投影、gene-native 检索和受控 agent 注入面，同时复用现有 PostgreSQL、job runtime、AI provider、治理和 gateway 基础设施。

## Non-goals

- 不新建数据库、消息队列、向量存储包或独立服务进程。
- 不让 Gene 反向修改 trap 或 skill 真相源。
- 不做无校验的 LLM 直接写回。
- 不做多 Gene 自由组合作为默认行为。
- 不在本主线内实现完整自动 mutation loop。
- 不在 Gene 主线 closeout 前恢复 Web Panel 功能开发。

## Architecture principles

- Trap 和 skill artifact 是人类可治理的事实源；Gene 是 derived control asset。
- Capsule 是 Skill 文档蒸馏与检索证据；GEP 语境中的 validated execution capsule 不在本轮直接等同实现。
- LLM 只负责候选蒸馏；schema validation、normalization、fidelity check 和 governance gate 必须确定性执行。
- `validated` 只表示 deterministic gates 已通过，不表示人工编辑或二次事实审查；`solidified` 表示可进入 Gene 检索投影。
- Gene 检索使用 gene-native projection，不借道现有 `RetrievalMatch` 或 `SkillCapsule` 检索池。
- 新 HTTP surface 必须通过 `create<X>RouteDefs(deps)` 工厂声明，并由 host-local Nest 与 host-distributed gateway 共同消费。

## Review decisions

以下决定在 2026-08-25 文档审阅后冻结；后续变更必须先回到本节并说明影响：

1. 基础设施只抽离向量、structured generation、derivation request/report 和任务幂等骨架；不预建 Gene 业务 schema。
2. Trap 的可派生状态使用现有 `approved` 枚举，没有新的 `active` 状态；remediation suppression 必须为 false。
3. `skill-artifact` 按 bounded derivation unit 派生，避免一次把整个 SKILL/reference body 送入 LLM；`skill-capsule` 以单个 capsule 为 derivation unit。
4. Gene content hash 使用稳定 canonical JSON 投影计算；status、id、审计时间和索引状态不参与 hash。
5. Rollout 只有 `off | shadow | serve` 三态，默认 `off`。`off` 不派生也不暴露；`shadow` 允许内部派生和检索但不返回外部客户端；`serve` 才开放外部路由。
6. 本主线不新增 Reviewer UI。治理审计依赖 immutable events、validator report 和现有数据库/运维查询能力；Reviewer UX 进入后续独立主题。

## Execution order

1. [Experience Gene Infrastructure Foundation](experience-gene-infrastructure-foundation.md)
2. [Experience Gene Contracts and Storage](experience-gene-contracts-and-storage.md)
3. [Experience Gene Derivation Pipeline](experience-gene-derivation-pipeline.md)
4. [Experience Gene Retrieval and Activation](experience-gene-retrieval-and-activation.md)
5. [Experience Gene Governance, Evaluation and Rollout](experience-gene-governance-evaluation-rollout.md)

阶段必须按上述顺序推进；后一阶段只能在相邻前置阶段的 focused tests、typecheck 和事实回写完成后开始。每个 delegated phase 文档的 Implementation checklist 全部完成且其 Test plan 通过后，才视为该阶段完成。

## Cross-phase acceptance gates

- [ ] 通用向量与 structured generation seam 已抽离，既有检索行为保持不变。
- [x] [`ExperienceGene` contracts、枚举、持久化表和 repository tests 已落地](experience-gene-contracts-and-storage.md#execution-record2026-08-25)。
- [x] [trap/skill/capsule 派生管线具备 idempotency、validation、lineage、index retry 和 stale 处理](experience-gene-derivation-pipeline.md#execution-record2026-08-26)。
- [x] [gene-native retrieval 通过 RouteDef 在两个宿主暴露](experience-gene-retrieval-and-activation.md#execution-record2026-08-26)。
- [x] [CLI/MCP 可渲染 `<strategy-gene>` 控制块](experience-gene-retrieval-and-activation.md#execution-record2026-08-26)。
- [ ] rollout 默认关闭，baseline 与 enabled 模式有评测证据。
- [x] [架构、API、数据模型、CLI/MCP 文档完成同步](experience-gene-governance-evaluation-rollout.md#documentation-closeout)。
- [ ] `pnpm typecheck`、相关 focused tests、`pnpm eval:smoke`、`pnpm exec fallow audit --base main --ci`、`pnpm check:docs` 和 `pnpm check:structure` 通过。

每项 gate 的回写记录必须包含：变更文件、执行的命令、关键测试名或评测指标、以及残余 debt/deferred 落点。只有 owner mainline 可以汇总宣告 cross-phase acceptance 完成。

## Web Panel resume condition

Web Panel 已迁移到 [`docs/plans/web-panel-feature-and-ui-optimization-paused.md`](../plans/web-panel-feature-and-ui-optimization-paused.md)。只有本主线满足以下条件后才能恢复：

1. Cross-phase acceptance gates 全部完成并留证。
2. 本细则完成 closeout 并按仓库规则归档。
3. 根 `plan.md` 显式把 active mainline 切回 Web Panel。
4. paused 细则迁回 `docs/todos/`，或基于其最新状态创建新的 active 细则。

## Problem pool

- 新增问题先进入本节；影响长期架构能力的项同步登记到 [长期债务登记册](open-debt-and-compromises.md)。
- Phase 1 问题池记录了 Fallow audit baseline 与 Experience Gene 工作分支不一致的问题；`pnpm eval:smoke` 另受本机 Docker 缺失约束。两项都未关闭，不得宣告 cross-phase acceptance 完成。

## Closeout rules

- 复选框只有在代码或契约变更、focused test、权威文档回写和守卫验证都有证据后才能勾选。
- 所有阶段完成后，用 `git mv` 将本文件归档至 `docs/archived/archived-plans/`，同步更新归档索引、`docs/todos/README.md` 和根 `plan.md`。
- 归档前必须在根 `plan.md` 显式声明下一个主线是 Web Panel recovery。
