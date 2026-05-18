# TrapMap 架构组件

本目录包含系统各组件的详细架构文档。

## 组件列表

| 文档 | 描述 |
|------|------|
| [AI_PROVIDER.md](AI_PROVIDER.md) | AI 提供商抽象层 |
| [ASYNC_INFRASTRUCTURE.md](ASYNC_INFRASTRUCTURE.md) | 异步基础设施（事件总线、任务队列、缓存、管线） |
| [ARTIFACTS.md](ARTIFACTS.md) | 技能工件系统 |
| [AUTH.md](AUTH.md) | 认证与会话管理 |
| [CLIENT.md](CLIENT.md) | 客户端运行逻辑 |
| [DECAY.md](DECAY.md) | 淘汰机制 |
| [DEDUPLICATION.md](DEDUPLICATION.md) | 入库验重流程 |
| [DELETION.md](DELETION.md) | 文档删除流程 |
| [FEEDBACK.md](FEEDBACK.md) | 用户反馈机制 |
| [EVALUATION.md](EVALUATION.md) | 评估系统 |
| [GOVERNANCE.md](GOVERNANCE.md) | 治理模型 (RBAC + 安全等级) |
| [INDEXING.md](INDEXING.md) | 多适配器索引管道 |
| [INGESTION.md](INGESTION.md) | 异步摄取管道 |
| [KNOWLEDGE_LIFECYCLE.md](KNOWLEDGE_LIFECYCLE.md) | 知识生命周期状态机 |
| [PERSISTENCE.md](PERSISTENCE.md) | 持久层实现 |
| [RETRIEVAL.md](RETRIEVAL.md) | 检索管道 (v1/v2/v3) |
| [REVIEW.md](REVIEW.md) | 文档审批流程 |
| [UPDATE.md](UPDATE.md) | 文档更新流程 |

## 相关文档

- [主架构文档](../ARCHITECTURE.md)
- [数据流图](../FLOW.md)
- [API 参考](../API.md)
- [CLI 参考](../CLI.md)
