# Server Lib

核心业务逻辑，按领域模块组织。

## 模块索引

| 目录 | 职责 |
|------|------|
| `actors/` | 操作者引用与身份 |
| `ai/` | AI Provider、缓存、动态模板 |
| `analytics/` | 分析统计 |
| `artifacts/` | 工件存储、修订、上下文富化 |
| `audit/` | 审计日志 |
| `auth/` | 认证与授权 |
| `cache/` | 缓存层 |
| `candidates/` | 候选检测、指纹、去重、处理 |
| `conflict/` | 冲突检测与解决 |
| `decay/` | 知识衰减 |
| `duplicates/` | 重复检测 |
| `evidence/` | 证据管理 |
| `feedback/` | 反馈处理 |
| `governance/` | 治理策略 |
| `graph-index/` | 图索引 |
| `indexing/` | 索引适配器、Graph-Lite |
| `knowledge/` | 知识条目管理 |
| `lifecycle/` | 生命周期订阅者 |
| `lineage/` | 血缘追踪 |
| `maintenance/` | 维护任务 |
| `persistence/` | Drizzle schema 与持久化 |
| `queue/` | 任务队列 |
| `repos/` | 统一仓库层 |
| `retrieval/` | 检索编排、胶囊、评分 |
| `state-machines/` | 状态机 |
| `store/` | 存储层 |
| `teams/` | 团队管理 |
| `users/` | 用户管理 |
| `validation/` | 输入校验 |
