功能流程：
[x] 文档入库流程

[x] 文档查询流程
对文档查询流程使用流程图做一个介绍，包括多路查询过程的流程以及召回 权限控制发挥作用的位置等等

[x] 文档删除流程
对文档删除流程使用流程图做一个介绍，包括：
- 不同生命周期状态（DRAFT/SUBMITTED/APPROVED/DEACTIVATED）下的删除策略
- 删除操作的权限要求（knowledge:update 权限、所有者检查）
- 删除时的副作用处理（索引移除、审计事件记录）
- 软删除 vs 硬删除的实现方式
- 删除后的数据恢复机制（如果有）
参考文档：docs/architecture/components/DELETION.md

[x] 文档审批流程
对文档审批流程使用流程图做一个介绍，包括：
- 智能体审核（Agent Review）的两个维度：正确性风险评估和重复检测
- 风险阈值判断逻辑（correctnessRisk 和 duplicateRisk 的组合）
- 人工审核流程（reviewer 角色的 approve/reject 操作）
- 审核历史记录（ReviewRecord）的追加规则
- 审核通过后的提交后索引（Post-Commit Indexing）流程
- 被拒绝后的重新提交（resubmit）循环
参考文档：docs/architecture/components/REVIEW.md

[x] 文档入库验重流程
对文档入库验重流程使用流程图做一个介绍，包括：
- 两阶段重复检测策略：精确指纹匹配（SHA-256）和语义相似度匹配（余弦相似度 ≥ 0.95）
- 指纹生成算法（内容规范化 → 哈希 → 截断）
- 语义相似度检测（embedding 向量比较）
- 重复候选的处理流程（标记为 duplicate_detected → 人工解决）
- 人工解决的三个选项：merge（合并）、discard（丢弃）、keep_both（保留两者）
- 候选提交（Candidate Submission）的后台处理队列机制
参考文档：docs/architecture/components/DEDUPLICATION.md

[x] 淘汰机制
对文档淘汰机制使用流程图做一个介绍，包括：
- 衰减状态机（Decay State Machine）的状态转换（fresh → aging → stale → expired）
- 衰减配置（DecayConfig）中的时间阈值设置
- 验证时间（lastVerifiedAt）和年龄计算逻辑
- 批量衰减操作（Batch Decay Operations）：extend（延长）、mark-review（标记审核）、deactivate（停用）、supersede（替代）
- 维护管理（Maintenance Management）：所有者分配、审核过期跟踪、验证过期检测
- 索引同步（Reconcile Indexes）在淘汰过程中的作用
参考文档：docs/architecture/components/DECAY.md

[x] 文档更新流程
对文档更新流程使用流程图做一个介绍，包括：
- 更新操作的权限验证（knowledge:update 权限、团队访问检查、安全等级检查）
- 乐观锁机制（version 字段）防止并发冲突
- 更新后的状态转换和索引刷新触发
- 替代（Supersede）机制：用新条目替代旧条目
- 更新操作的审计事件记录和用户操作日志
- 更新流程与重新提交（resubmit）流程的区别
参考文档：docs/architecture/components/UPDATE.md

[x] 客户端运行逻辑（api请求、数据处理、登录、权限管理等）流程
对客户端运行逻辑使用流程图做一个介绍，包括：
- CLI 认证流程：用户名/密码登录和访问密钥（Access Key）登录
- 会话管理：JWT Cookie 的创建、验证、过期和刷新
- API 请求的权限检查中间件（RBAC + 安全等级检查）
- 不同命令（knowledge/retrieval/review/decay/maintenance）的请求处理流程
- 响应数据的处理和展示逻辑
- 错误处理和重试机制
参考文档：docs/architecture/components/CLIENT.md

[x] 工件系统流程（Artifact System）
对工件系统流程使用流程图做一个介绍，包括：
- SkillArtifact 的创建和源文件上传
- 派生过程（Derivation）：SkillProfile 生成、SkillCapsule 提取、ClientManifest 生成
- AI 在派生过程中的作用（摘要生成、胶囊提取、元数据分析）
- 治理继承机制（子实体继承父实体的作用域和安全等级）
- 工件审核和发布流程
- 胶囊检索（Capsule Retrieval）在 v2/v3 检索中的使用
参考文档：docs/architecture/components/ARTIFACTS.md

[x] 评估框架流程（Evaluation Framework）
对评估框架流程使用流程图做一个介绍，包括：
- 三种评估类型：检索评估（Retrieval）、摘要评估（Summary）、治理评估（Governance）
- 评估指标：Hit@K、MRR、nDCG 的计算方法
- 测试用例的加载和执行流程
- 烟雾测试（smoke）和核心测试（core）两个层级的区别
- 评估报告的生成和 CI 集成
参考文档：docs/architecture/components/EVALUATION.md

[x] 持久化存储层流程（Persistence Layer）
对持久化存储层流程使用流程图做一个介绍，包括：
- 两种存储实现：JsonStore（开发）和 PostgresStore（生产）
- 事务支持（transact）和乐观锁机制
- 数据迁移流程（JSON → PostgreSQL）
- 向量索引（knowledge_vectors）、关键词索引（keyword_index）、图索引（graph_nodes/edges）的存储结构
- 备份和恢复策略
参考文档：docs/architecture/components/PERSISTENCE.md

