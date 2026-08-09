# TrapMap 架构组件

本目录包含系统各组件的详细架构文档。

## 组件列表

| 文档 | 描述 |
|------|------|
| [AI_PROVIDER.md](AI_PROVIDER.md) | AI 提供商抽象层 |
| [ARTIFACTS.md](ARTIFACTS.md) | 技能工件系统 |
| [ASYNC_MODEL.md](ASYNC_MODEL.md) | 异步事件与共享任务幂等/重试模型 |
| [ASYNC_SHARED_JOB_CONTRACTS.md](ASYNC_SHARED_JOB_CONTRACTS.md) | 异步事件与共享任务契约目录 |
| [CLIENT.md](CLIENT.md) | 客户端运行逻辑 |
| [EVALUATION.md](EVALUATION.md) | 评估系统 |
| [GOVERNANCE.md](GOVERNANCE.md) | 治理模型 (RBAC + 安全等级) |
| [PERSISTENCE.md](PERSISTENCE.md) | 持久层实现 |
| [RETRIEVAL.md](RETRIEVAL.md) | 检索管道 (v1/v2/v3) |

历史组件文档（AUTH、DECAY、DEDUPLICATION、DELETION、DEPENDENCY_ANALYSIS、FEEDBACK、INDEXING、INGESTION、KNOWLEDGE_LIFECYCLE、OPTIONAL_SERVICE_SPLIT_AND_MQ、REVIEW、UPDATE、ASYNC_INFRASTRUCTURE）已归档至 [`docs/archived/architecture/components/`](../../archived/architecture/components/)。

## 相关文档

- [主架构文档](../ARCHITECTURE.md)
- [CLI 参考](../CLI.md)
