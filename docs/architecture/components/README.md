# TrapMap 架构组件

> 本目录收拢各组件的实现叙述，一组件一页。状态：Active。

| 页 | 一句话 |
|---|---|
| [AI 提供商抽象层](AI_PROVIDER.md) | AI SDK 统一适配：chat 与 embedding 单路径 + fallback |
| [检索系统](RETRIEVAL.md) | 检索管道 v1 / v2 / v3 与意图、组装、追踪 |
| [治理模型](GOVERNANCE.md) | RBAC、多级安全与审核、冲突、decay 编排 |
| [工件系统](ARTIFACTS.md) | Skill 工件聚合根、派生管线与修订 |
| [持久化层](PERSISTENCE.md) | PostgreSQL 42 表分布、索引与事务 |
| [异步模型](ASYNC_MODEL.md) | queue / outbox / workflow 异步模型 |
| [Shared Async Job Contracts](ASYNC_SHARED_JOB_CONTRACTS.md) | 跨域派生任务契约表 |
| [评估框架](EVALUATION.md) | smoke / core 评估分层与性能阈值 |
| [客户端运行逻辑](CLIENT.md) | CLI、web-panel、mcp 三客户端 |
