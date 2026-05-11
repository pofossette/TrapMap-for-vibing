# 文档删除流程 (Deletion Flow)

## 概述

TrapMap 中的文档删除操作受到严格的生命周期状态和权限控制。删除行为根据条目当前状态采取不同策略，并确保审计追踪和索引一致性。

## 删除策略按生命周期状态

| 生命周期状态 | 删除策略 | 说明 |
|-------------|---------|------|
| DRAFT | 允许硬删除 | 草稿状态可完全删除，无副作用 |
| SUBMITTED | 不允许删除 | 审核中条目需等待审核结果 |
| AGENT-PASS | 不允许删除 | 需通过审核流程拒绝 |
| AGENT-REJECTED | 允许删除 | 被智能体拒绝的条目可删除 |
| APPROVED | 不允许直接删除 | 需先停用（deactivate）再处理 |
| REJECTED | 允许删除 | 被人工拒绝的条目可删除 |
| DEACTIVATED | 允许硬删除 | 已停用条目可完全删除 |

## 权限要求

删除操作需要以下权限验证：

```typescript
// 权限检查
requirePermission(auth, 'knowledge:update');

// 所有者检查（某些场景）
if (entry.ownerUserId !== auth.user?.id) {
  throw new AppError(403, 'forbidden', 'Only the owner may delete this entry');
}

// 团队访问检查
if (entry.teamId) {
  requireTeamAccess(auth, entry.teamId);
}
```

## 删除流程图

```mermaid
flowchart TD
    A[DELETE /v1/knowledge/:entryId] --> B{验证会话}
    B -->|失败| C[401 Unauthorized]
    B -->|成功| D{检查 knowledge:update 权限}
    D -->|无权限| E[403 Forbidden]
    D -->|有权限| F[查找条目]
    F -->|不存在| G[404 Not Found]
    F -->|存在| H{检查生命周期状态}
    
    H -->|DRAFT| I[允许删除]
    H -->|SUBMITTED| J[拒绝 - 审核中]
    H -->|APPROVED| K[拒绝 - 需先停用]
    H -->|DEACTIVATED| I
    H -->|REJECTED| I
    H -->|AGENT-REJECTED| I
    
    I --> L{检查团队访问}
    L -->|失败| E
    L -->|成功| M[执行删除]
    
    M --> N[从存储中移除条目]
    N --> O[移除所有索引]
    O --> P[记录审计事件]
    P --> Q[返回 200 OK]
    
    J --> R[400 Bad Request]
    K --> R
```

## 删除流程详解

### 1. 权限验证阶段

```mermaid
flowchart TB
    subgraph PermissionVerification["Permission Verification"]
        A["1. Session Validation\n验证 JWT Cookie 或 Access Key\n加载用户实体"]
        B["2. Permission Check\n检查 knowledge:update 权限\n验证用户安全等级 >= 条目 requiredLevel"]
        C["3. Team Access Check\n验证用户是团队成员（team-scoped 条目）\n全局条目跳过此检查"]
    end

    A --> B --> C
```

### 2. 状态检查阶段

```typescript
// 状态检查逻辑
function canDeleteEntry(entry: KnowledgeRecord): boolean {
  const deletableStates = ['draft', 'rejected', 'agent-rejected', 'deactivated'];
  return deletableStates.includes(entry.lifecycleState);
}
```

### 3. 删除执行阶段

删除操作包含以下步骤：

1. **存储层删除**：从 knowledgeEntries 数组/表中移除记录
2. **索引清理**：
   - Vector Index: 移除 embedding 向量
   - Keyword Index: 移除 BM25 关键词
   - Graph Index: 移除图节点和边
3. **关联数据清理**：
   - 删除审核历史记录
   - 删除生命周期事件记录
   - 删除候选提交记录（如果有）

### 4. 审计事件记录

```typescript
// 审计事件类型
type DeletionAuditEvent = {
  type: 'knowledge.deleted';
  actorId: EntityId;
  entryId: EntityId;
  previousState: LifecycleState;
  deletedAt: string;
  reason?: string;
};

// 审计日志记录
await audit({
  type: 'knowledge.deleted',
  actorId: auth.actorId,
  entryId: entry.id,
  previousState: entry.lifecycleState,
  deletedAt: nowIso(),
}, request);
```

## 软删除 vs 硬删除

### 硬删除（当前实现）

- **定义**：从存储中完全移除条目记录
- **适用场景**：DRAFT、REJECTED、AGENT-REJECTED 状态
- **优点**：节省存储空间，数据完全清除
- **缺点**：无法恢复，审计信息丢失

### 软删除（建议实现）

- **定义**：标记条目为 deleted 状态，保留数据
- **适用场景**：APPROVED、DEACTIVATED 状态
- **优点**：可恢复，完整审计追踪
- **缺点**：存储开销，查询需过滤

```typescript
// 软删除实现示例
interface SoftDeleteMeta {
  deletedAt: string;
  deletedBy: ActorRef;
  reason?: string;
  recoverable: boolean;
  recoverableUntil?: string;  // 可恢复截止时间
}

interface KnowledgeRecord {
  // ... existing fields
  softDeleteMeta?: SoftDeleteMeta;
}
```

## 数据恢复机制

### 回收站机制（建议）

```
┌─────────────────────────────────────────────────────────────────┐
│                    Recycle Bin Flow                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Deleted Entry                                                  │
│        │                                                        │
│        ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Recycle Bin (30 days retention)                        │   │
│  │                                                          │   │
│  │  - Store soft-deleted entries                           │   │
│  │  - Track deletion metadata                              │   │
│  │  - Auto-purge after retention period                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│        │                                                        │
│        ├──► Restore: Move back to original state               │
│        │                                                        │
│        └──► Purge: Permanent deletion after 30 days            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 索引移除流程

```mermaid
flowchart TD
    A[条目删除] --> B{检查索引状态}
    B -->|有向量索引| C[移除 Vector Index]
    B -->|有关键词索引| D[移除 Keyword Index]
    B -->|有图索引| E[移除 Graph Index]
    
    C --> F[更新 KnowledgeIndexStateRecord]
    D --> F
    E --> F
    
    F --> G[记录索引移除审计事件]
    G --> H[完成]
```

## 批量删除（建议）

```typescript
// 批量删除 API 设计
interface BatchDeleteRequest {
  entryIds: EntityId[];
  reason?: string;
  dryRun?: boolean;  // 预览模式
}

interface BatchDeleteResponse {
  deleted: EntityId[];
  failed: Array<{
    entryId: EntityId;
    reason: string;
  }>;
  dryRun: boolean;
}
```

## 相关 API 端点

| 端点 | 方法 | 描述 | 权限 |
|------|------|------|------|
| `/v1/knowledge/:entryId` | DELETE | 删除单个条目 | knowledge:update |
| `/v1/operations/knowledge/batch` | POST | 批量操作（含删除） | knowledge:update |

## 注意事项

1. **级联删除**：删除条目时应同时删除关联的胶囊、工件派生产物
2. **外键约束**：PostgreSQL 中需处理外键引用（ON DELETE CASCADE）
3. **索引一致性**：删除后需触发索引同步，确保检索结果不包含已删除条目
4. **审计合规**：删除操作必须记录审计日志，保留操作者、时间、原因

## 参考文档

- [知识生命周期](KNOWLEDGE_LIFECYCLE.md)
- [治理模型](GOVERNANCE.md)
- [持久化存储层](PERSISTENCE.md)
- [审计日志](GOVERNANCE.md#审计日志-audit-logging)

## 相关源码

- [packages/server/src/routes/knowledge.ts](../../packages/server/src/routes/knowledge.ts)
- [packages/server/src/lib/knowledge.ts](../../packages/server/src/lib/knowledge.ts)
- [packages/server/src/lib/lifecycle/state-machine.ts](../../packages/server/src/lib/lifecycle/state-machine.ts)
