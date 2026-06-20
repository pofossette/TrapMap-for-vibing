# 后端工程化优化计划

> 当前角色：问题池与优先级记录，不再作为根级执行计划。正式执行入口见 [`plan.md`](../../plan.md) 与 [`docs/plans/backend-engineering-masterplan/README.md`](../plans/backend-engineering-masterplan/README.md)。

## TODO

- [x] 建立 badcase 回流闭环，把线上失败样本沉淀成可复现的评测 case。
- [ ] 为检索、摘要、治理失败补齐 `queryId`、结果快照和失败分类。
- [ ] 将高频异步任务从进程内副作用迁移到持久化任务队列。
- [x] 补齐队列、回流、检索失败分布等关键指标。
- [x] 在真实吞吐出现后再评估 MQ 和微服务拆分。
- [x] 统一 read freshness / projection lag contract，并把 freshness 暴露到 retrieval、operator、governance read model。
- [x] 统一 command / async / bulk job 的 idempotency、retry、resume 语义。
- [x] 补齐跨服务/跨 worker 的错误分类、失败语义和 operator 可见性。
- [x] 做厚 operator 面，补 queue/cache/projection/bulk job 的运维控制与排障信息。
- [x] 建立 config governance：分层配置、deprecated env、冲突配置检测、config fingerprint。
- [x] 为共享 PostgreSQL 的重后端补齐连接池预算、热点分析和容量建模。
- [x] 把 distributed invalidation、cache freshness、remote cache fallback 变成显式运维能力。
- [x] 建立 bulk ingestion / rebuild / backfill 的统一 batch contract 与观测面。

## 与总控阶段的映射

- `Phase 0` 已完成：本文件的角色已冻结为问题池与优先级记录，不再充当执行计划。
- `Phase 1` 已完成：route / application service / repository / compat seam 的边界与 allowlist 已在正式执行包和事实源文档中收敛；本文件不再重复维护这部分规则正文。
- `Phase 4` 已完成：validation / rollout / doc backfill closeout 已回写到正式执行包、truth sources 与测试指南。

Phase 3 已完成并冻结的事实：

- `/v1/operations/status/async` 现在额外暴露 `operatorHome`、`configGovernance`、`capacityModel` 与 `bulkOperations`。
- `packages/server/src/config.ts` 现在提供 config fingerprint、deprecated env 和 conflict warning summary。
- `/v1/operations/stats/summary` 现在额外暴露 namespace 级 cache invalidation / pending invalidation summary。

Phase 3 遗留问题 closeout：

- `capacityModel.databasePool.maxConnections` 已明确关闭为 deferred detail：
  - 当前 contract 只保证保守 shape，不把驱动内部连接池状态提升为新的 runtime truth surface。
- 热点 `team/query/artifact` 已明确关闭为 non-default deep drill-down：
  - 默认 operator surface 继续只承担 backlog / latency / cache pressure / workflow progress 摘要。
- 上述两项都不阻塞 Phase 4 closeout。

Phase 2 已完成并冻结的事实：

- `/v1/operations/status/async` 已统一暴露 runtime contract、freshness / projection lag contract、idempotency contract、retry/resume contract 和 failure taxonomy。
- queue/outbox/workflow/cache 的 operator-visible 语义已经统一到同一套术语。
- Phase 1 遗留的 operator 读侧 projection exception 核查已关闭；`lib/operations/read-model.ts` 当前只保留 artifact revision payload hydration 这一个命名 repo capability gap。

## 目标

把 TrapMap 的后端从“功能可用”推进到“可扩展、可观测、可回归”的工程化状态。

重点覆盖：

- 异步化
- 消息队列
- 服务拆分
- 任务编排
- 观测与告警
- badcase 回流
- read freshness / projection lag
- idempotency / retry / resume
- config governance
- cache / invalidation / bulk ingestion

## 当前判断

TrapMap 现在更适合做“单体内分层 + 持久任务队列”的演进，而不是立刻重度微服务化。

主要原因：

- 已有 Fastify、PostgreSQL、RBAC、评测体系和队列基础
- 很多重任务更适合先拆成 worker
- 当前最缺的是稳定回流和异步治理，不是服务数量

补充判断：

- 即使推进更细粒度重后端，真正决定系统是否“可用可维护”的，仍然是 freshness、idempotency、operator 能力、配置治理和容量模型。
- 因此本文件继续承担“横跨 modular monolith 与 heavy backend 的通用工程化路线”，而不替代 `runtime-recomposition/` 中的宿主/服务拆分计划。

## 优化方向

### 1. 先把异步任务做扎实

优先把这些事情从请求链路里拿出去：

- 索引重建
- 去重检测
- 摘要/派生物生成
- 批量维护任务
- badcase 归档与回放

推荐形态：

- API 负责接收命令
- 业务层负责产生日志、事件和任务
- worker 负责真正执行

### 2. 逐步引入 MQ

不要为了“先进”而上 MQ，要在明确场景下引入。

Optional adoption rule:

- 默认保持 `TRAPMAP_TASK_TRANSPORT=postgres`。
- 只有在 task backlog、隔离域或独立扩缩容目标持续存在时，才启用 `TRAPMAP_TASK_TRANSPORT=rabbitmq`。
- 无论是否启用 RabbitMQ，`domain_event_outbox` 都必须继续保留在 PostgreSQL。

适合 MQ 的场景：

- 外部事件持续进入系统
- 任务量需要削峰
- 需要消费组扩展
- 需要跨进程可靠投递
- 需要更强的重试与死信能力

建议顺序：

1. 先用 PostgreSQL 持久队列兜住核心任务
2. 再抽统一事件协议
3. 最后按吞吐和边界决定是否接 Kafka、RabbitMQ 或 NATS

### 3. 微服务化只做必要拆分

建议先拆这些边界：

- 反馈与评测服务
- 索引与回流服务
- 异步任务执行服务
- 检索读服务

不要一开始就切得太碎。先把写路径和读路径分清，再谈独立部署。

### 4. 把 badcase 回流做成标准流程

标准流程建议是：

`发现 badcase -> 标注原因 -> 关联 query/response -> 导出 deterministic eval draft -> 人工审核 -> 修复 -> 回归验证 -> 关闭`

## 判定门槛

- 保持 PostgreSQL queue：
  单类型 backlog 持续 `<= 100`，dead-letter `<= 5`，平均 handler latency `<= 2000ms`
- 考虑外部 MQ：
  单类型 backlog 持续 `> 500`，dead-letter `> 20`，或平均 handler latency `> 5000ms`
- 保持 modular monolith：
  shared jobs、cache invalidation、badcase export 仍能在单进程/单仓内清晰观测和修复
- 考虑服务拆分：
  某一类任务长期高 backlog、高 dead-letter 或高延迟，并已需要独立扩缩容或独立故障域

落地时至少要记录：

- 问了什么
- 回了什么
- 为什么错
- 正确答案是什么
- 最终修了哪里

### 5. 先补观测再扩系统

新增工程化能力前，先把这些指标补齐：

- 队列堆积
- 任务成功率
- 重试次数
- 死信数量
- badcase 回流量
- 回归通过率
- 检索/摘要失败分布

### 6. 统一 freshness / projection lag 模型

需要统一的不只是“有没有读缓存”，而是“当前读结果到底有多新”。

建议补齐：

- retrieval read model freshness
- governance queue / remediation read freshness
- operator status 中的 projection lag
- cache invalidation lag
- rebuild / refresh 是否完成的显式标记

目标：

- 让 “为什么读到旧结果” 可以被明确解释
- 让 eventual consistency 从隐式行为变成显式 contract

### 7. 统一幂等、重试与恢复语义

需要统一三类路径：

- sync command path
- async worker path
- bulk ingestion / rebuild path

建议收敛：

- idempotency key 规则
- retryable / non-retryable error 分类
- resume/checkpoint 语义
- dead-letter 后 operator 能做什么

### 8. 错误分类与失败语义标准化

建议把错误统一为至少这些大类：

- user error
- auth / policy error
- dependency error
- timeout
- stale projection
- retryable async failure
- permanent failure

并把它贯通到：

- API response
- worker runtime
- operator status
- audit / metrics

### 9. 做厚 operator 面

在重后端落地前后，都应补齐更完整的 operator surface：

- queue backlog drill-down
- per-handler latency / retry / dead-letter 视图
- cache freshness / invalidation lag
- bulk job 进度、失败样本和 resume 控制
- projection rebuild / repair 控制面
- config fingerprint / runtime capability 可见性

### 10. 配置治理

随着 internal port、cache、bulk ingestion、distributed invalidation 配置变多，需要把配置治理本身工程化。

建议增加：

- config schema 分层：core / service / distributed / experimental
- startup config diff / config fingerprint
- incompatible config detection
- deprecated env warning
- profile-aware config recommendation

### 11. 容量与成本建模

重点不是泛泛监控 CPU，而是围绕当前架构的真实瓶颈建模：

- PostgreSQL 连接数预算
- read host cache 内存占用
- queue backlog 与 handler latency
- embedding / rerank 成本
- hot team / hot query / hot artifact 分析

### 12. 缓存与 distributed invalidation 工程化

当前缓存不应再被视为“透明优化”。

建议继续推进：

- cache freshness contract
- distributed invalidation visibility
- remote cache fallback 语义
- warmup 策略
- 按 namespace 的 hit/miss/eviction/lag 指标

### 13. 批量入库与重建作业工程化

除了单次 authoritative write 外，还要把 bulk path 做成正式能力：

- batch contract
- resume / retry / checkpoint
- online path 和 bulk path 分离
- backfill / rebuild / import 的共用 runtime 语义

## 推荐路线

### 第一阶段

- 把 badcase 回流接到反馈和 eval
- 把重任务下沉到持久队列
- 补关键指标
- 统一 freshness / projection lag 可见性
- 统一 idempotency / retry / resume 语义

### 第二阶段

- 抽统一内部事件协议
- 拆出独立 worker
- 为高频派生结果加缓存
- 做厚 operator 面
- 补 config governance 与 distributed invalidation 运维面

### 第三阶段

- 根据真实负载决定是否引入 MQ
- 需要时再做服务拆分
- 根据真实读写负载决定是否启用 remote cache、staging merge 或 `COPY` bulk path
- 根据真实数据库热点与隔离需求决定是否评估拆库

## 与 runtime recomposition 的关系

- `docs/plans/runtime-recomposition/` 负责“怎么拆客户端核心、后端核心、宿主和服务边界”。
- 本文件负责“无论是 modular monolith 还是 heavy backend，都必须补齐哪些工程化能力”。
- 两者关系是：
  - runtime recomposition 提供结构边界
  - backend engineering optimization 提供运行可靠性、观测、配置、缓存、bulk path、operator 能力

因此：

- 微服务化不是本文件的唯一目标
- 本文件里的 freshness、idempotency、config governance、capacity planning 即使在单机 profile 下也同样成立

## 对应细化计划

- [stage-3-freshness-and-projection-lag-contracts.md](../plans/backend-engineering-roadmap/stage-3-freshness-and-projection-lag-contracts.md)
- [stage-3-idempotency-retry-resume-and-failure-semantics.md](../plans/backend-engineering-roadmap/stage-3-idempotency-retry-resume-and-failure-semantics.md)
- [stage-3-operator-surface-and-runtime-operations.md](../plans/backend-engineering-roadmap/stage-3-operator-surface-and-runtime-operations.md)
- [stage-3-config-governance-and-capacity-modeling.md](../plans/backend-engineering-roadmap/stage-3-config-governance-and-capacity-modeling.md)
- [stage-3-cache-invalidation-and-bulk-path-operations.md](../plans/backend-engineering-roadmap/stage-3-cache-invalidation-and-bulk-path-operations.md)

## 当前优先级建议

如果只选下一批最值得做的 5 项，建议顺序是：

1. freshness / projection lag contract
2. idempotency + retry + resume contract
3. operator surface 强化
4. config governance
5. cache / distributed invalidation / bulk ingestion 运维化

## 结论

TrapMap 下一步不是先变成很多服务，而是先变成一个可靠的工程系统。
badcase 回流、任务队列、freshness 可见性、幂等恢复语义和 operator 能力，这几件事优先级最高。
