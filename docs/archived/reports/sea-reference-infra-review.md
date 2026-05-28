# Sea-BreakTheWaves 基础设施借鉴与 TrapMap 优化建议

## 目标

记录对参考项目 `project-for-reference/Sea-BreakTheWaves` 的基础设施实现观察，聚焦以下三个方面：

- 缓存
- 分布式协作
- 消息队列

并结合 TrapMap 当前实现，给出适合现阶段的优化建议与落地顺序。

## 参考项目结论

### 1. 消息队列：已形成明确接入模式

Sea-BreakTheWaves 的 Kafka 使用是明确且真实落地的，但定位比较克制。

- 启动时初始化并启动 Kafka Consumer
- 使用 consumer group 消费外部文章事件
- 消费成功后提交 offset，失败仅记录日志
- 将外部事件转换为内部 `doc_ingest` skill 调用

这说明它的 Kafka 不是系统内部通用总线，而是：

`外部事件 -> 薄适配层 -> 内部能力调用`

这个结构是该参考项目最值得借鉴的部分。

### 2. 缓存：基础设施已准备，业务缓存策略不明显

参考项目在 `docker-compose` 中启动了 Redis 与 RedisInsight，但代码层面没有看到成熟的缓存策略沉淀，例如：

- 明确的缓存 key 设计
- TTL 分层
- 缓存失效机制
- 击穿/穿透保护
- 统一缓存封装

因此更准确的判断是：

- Redis 已接入
- 但“缓存架构”尚未真正成型

### 3. 分布式：更像多组件集成，不是强分布式治理

Sea-BreakTheWaves 集成了 Postgres、Milvus、Neo4j、Kafka、Redis、MinIO、etcd、Prometheus 等组件，但目前看到的实现更接近：

- 单服务应用
- 对接多种基础设施
- 具备观测与扩展预留

尚未明显体现出以下更重的分布式治理模式：

- 分布式锁
- outbox / inbox
- 跨服务幂等协议
- leader election
- saga / 补偿事务

因此，不应把它理解为一个成熟的分布式协调范式，而应理解为“单体服务 + 多中间件”的工程集成。

## TrapMap 当前状态

TrapMap 当前并不缺少基础设施抽象，反而已经具备一些比参考项目更贴近现阶段需求的能力。

### 1. 已有进程内事件总线

`packages/server/src/lib/lifecycle/event-bus.ts`

特点：

- 领域事件分发
- handler 之间错误隔离
- 支持同步与异步事件处理

这适合同进程内的轻量副作用通知。

### 2. 已有基于生命周期事件的索引同步

`packages/server/src/lib/indexing/events.ts`

特点：

- 生命周期状态变化驱动索引更新/删除
- 明确区分 `upsert` / `remove` / `noop`
- 与现有知识条目治理流程天然耦合

这说明 TrapMap 已经具备“事件驱动索引维护”的基本形态。

### 3. 已有 PostgreSQL 持久任务队列

`packages/server/src/lib/queue/task-queue.ts`

特点：

- PostgreSQL 持久化任务
- `FOR UPDATE SKIP LOCKED` 并发安全消费
- 优先级
- 重试
- 指数退避
- 死信

对于 TrapMap 当前这种审核、索引、批处理、去重任务较多的系统，这比立即引入 Kafka 更匹配实际需求。

### 4. 已有本地缓存能力

`packages/server/src/lib/ai/cache/`

特点：

- prompt section 级别缓存
- 静态/动态边界拆分
- cache metrics
- API cache control 集成

这说明 TrapMap 在缓存方面已经不是空白状态，下一步应做“边界清晰的增量扩展”，而不是直接上全局 Redis 缓存。

## 对 TrapMap 的优化建议

### 建议 1：借鉴“外部事件薄适配层”，不要先借鉴 Kafka 本身

优先级：高

建议先定义统一的内部事件入口协议，而不是直接接入消息中间件。

适合抽象为事件的场景：

- `knowledge.submitted`
- `knowledge.approved`
- `candidate.duplicate-detection.requested`
- `artifact.review.requested`
- `index.rebuild.requested`

推荐模式：

- 外部触发源负责接收事件
- 适配层负责校验和转换
- 内部统一转为 application/service 级命令或 task

这样未来即使接入 Kafka、Webhook、定时任务或 CLI 批处理，也不需要改核心业务逻辑。

### 建议 2：把重副作用从 lifecycle subscriber 中下沉到持久任务队列

优先级：高

TrapMap 目前已有进程内事件机制，但对“必须完成”的重任务，进程内 fire-and-forget 并不够稳。

推荐演进方式：

- 生命周期变更后发出领域事件
- subscriber 不直接执行重逻辑
- subscriber 只负责 enqueue durable task
- worker 负责执行：
  - 索引同步
  - 冲突检测
  - 回填统计
  - 批量重建

收益：

- 失败可重试
- 服务重启后任务不丢
- 更适合多实例并发消费
- 更容易观察积压和失败率

### 建议 3：优先扩展 PostgreSQL 队列，不要过早引入 Kafka

优先级：高

当前阶段，建议把 `task-queue.ts` 作为主异步任务基础设施，而不是新增 MQ。

适合迁移到任务队列的工作包括：

- approval 后的异步索引同步
- duplicate detection
- artifact 派生物生成
- 大批量 maintenance / decay 操作
- 导入后的二次处理

只有在以下条件同时成立时，再认真评估 Kafka：

- 需要跨多个实例稳定分摊高吞吐异步任务
- 存在明确的外部事件源持续推送数据
- 任务削峰、消费组扩展、事件保留的价值明显大于运维复杂度

### 建议 4：缓存只做“可解释的小缓存”

优先级：中

建议在现有本地缓存基础上，逐步增加几类只读或派生数据缓存：

- graph/retrieval 派生结果短 TTL 缓存
- 热点查询结果缓存
- 重计算的 summary / formatting 结果缓存

必须同时定义：

- cache key 组成
- TTL
- 容量上限
- 失效事件
- 是否允许陈旧读

不建议当前阶段直接引入“Redis 统一缓存层”，否则很容易先得到：

- 一致性问题
- 失效逻辑分散
- 排障复杂度上升

### 建议 5：先补观测，再补中间件

优先级：中

参考项目虽然分布式治理不深，但 observability 起得比较早，这是对的。

TrapMap 在把更多异步任务接入队列前，建议先补以下指标：

- task enqueue 数
- task success / retry / dead 数
- task backlog 长度
- indexing 耗时
- duplicate detection 耗时
- cache hit / miss 分布

如果没有这层观测，后续无论换 Kafka 还是 Redis，问题都只会更难定位。

## 不建议当前阶段做的事

以下事项暂不建议作为近期优化重点：

- 为了“分布式”而引入 Redis 分布式锁
- 为了“解耦”而把所有内部事件都搬到 Kafka
- 在缓存需求尚未分层前接入统一远程缓存
- 引入 outbox / saga 等更重的跨服务模式

原因不是这些模式没价值，而是 TrapMap 当前的复杂度还没有高到必须支付这类架构成本。

## 推荐落地顺序

### 第一阶段

- 梳理当前 lifecycle subscriber 中的重逻辑
- 明确哪些逻辑改为 enqueue task
- 为任务队列补齐基础 metrics

### 第二阶段

- 定义统一的内部事件/任务协议
- 将索引、去重、派生物生成切到持久队列 worker
- 为高频派生查询增加本地短 TTL 缓存

### 第三阶段

- 根据真实吞吐、失败率和实例规模评估是否需要 Redis / Kafka
- 仅在出现明确跨实例与外部事件压力后再引入中间件

## 一句话总结

Sea-BreakTheWaves 最值得 TrapMap 借鉴的，不是“先上 Redis + Kafka”，而是：

- 用薄适配层接住外部事件
- 把内部能力调用边界收敛清楚
- 先把异步任务和观测体系做扎实

对 TrapMap 来说，当前最合理的演进方向是：

`进程内事件 -> PostgreSQL 持久任务 -> 小而清晰的本地缓存 -> 必要时再引入 MQ / Redis`
