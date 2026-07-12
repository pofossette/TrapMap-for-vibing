# 分布式数据治理与可观测性主线设计

## 目标

将当前未完成的可观测性与可追溯性工作，和 shared PostgreSQL 治理、服务级运维能力、`Level 2 -> Level 3` 分布式成熟度验收收敛为唯一 active mainline。

## 入口与范围

- 保留根 `plan.md` 作为唯一目录性质索引；不归档、不在其中放入实施复选框。
- 保留 `docs/todos/observability-traceability-closure.md` 作为唯一 active detail，并将其主题扩展为可观测性、数据治理与分布式成熟度。
- 继续以 gateway-only、共享 PostgreSQL 实例、表级唯一写 owner、同事务 outbox、无跨服务事务为既定约束。
- 当前目标是使 shared PostgreSQL 的边界可执行、可诊断、可验收；不承诺物理拆库、注册中心、Kubernetes、service mesh、MQ 产品化或 PgBouncer 成为默认运行时资产。

## 阶段结构

1. 完成关联上下文、结构化日志、审计关联、低基数指标和运维联查，使 HTTP、异步任务、outbox 与审计记录可共同定位。
2. 将共享 PG 的表 owner、迁移 owner、跨 owner 读取例外、投影 freshness/lag 与按服务连接预算落实到源码、测试和权威文档。
3. 以 `knowledge-write + governance-review` 作为样板，交付独立 health/readiness/ownership、queue/outbox backlog、retry/dead-letter、超时/幂等语义及服务级 acceptance 证据。
4. 记录 distributed 是否获得独立隔离、扩缩容或运维收益；仅满足已冻结的条件时才把成熟度从 Level 2 更新为 Level 3。

## 交付与验证

每个任务都必须有进度复选框，列出源码、测试和文档回写位置。涉及 contracts、跨包导入、运行时、持久化或部署时，细则应要求相应 focused test、`rtk pnpm typecheck`、`rtk pnpm exec fallow audit --base main`（适用时）、`rtk pnpm test:distributed-closeout`、`rtk pnpm test:observability-closeout`、`rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure`。

## 非目标与关闭条件

本主线不以物理 database-per-service 为关闭条件。shared PostgreSQL 可以继续存在，但必须不再代表共享写权限或共享真相边界。只有在 owner、投影、服务级运维、故障语义和 acceptance 证据均完成后，才可声明 Level 3；未满足时保持 Level 2 并记录缺口。
