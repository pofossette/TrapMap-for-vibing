# 文档更新流程 (Update Flow)

## 概述

TrapMap 的文档更新流程允许授权用户修改现有知识条目的内容。更新操作受到严格的权限控制，并维护完整的修订历史。更新后的条目可能需要重新审核，具体取决于当前生命周期状态。

## 更新流程概览

```mermaid
flowchart TB
    A[PATCH /v1/knowledge/:entryId] --> B{验证会话}
    B -->|失败| C[401 未授权]
    B -->|成功| D{检查 knowledge:update 权限}
    D -->|无权限| E[403 禁止访问]
    D -->|有权限| F[查找条目]
    
    F -->|不存在| G[404 未找到]
    F -->|存在| H{检查团队访问}
    
    H -->|失败| E
    H -->|成功| I{检查安全等级}
    
    I -->|等级不足| E
    I -->|等级足够| J[创建新版本]
    
    J --> K[更新条目内容]
    K --> L[更新修订历史]
    L --> M[创建生命周期事件]
    M --> N{条目状态}
    
    N -->|approved| O[触发索引刷新]
    N -->|其他| P[跳过索引]
    
    O --> Q[返回更新结果]
    P --> Q
```

## 权限验证

### 权限检查

```typescript
// 基本权限检查
requirePermission(auth, 'knowledge:update');

// 团队访问检查
if (entry.teamId) {
  requireTeamAccess(auth, entry.teamId);
}

// 安全等级检查
requireHigherLevel(auth, entry.requiredLevel, payload.requiredLevel ?? entry.requiredLevel);
```

### 权限矩阵

| 操作 | 所需权限 | 安全等级要求 | 其他要求 |
|------|---------|-------------|---------|
| 更新内容 | knowledge:update | >= entry.requiredLevel | 团队访问 |
| 更新安全等级 | knowledge:update | > 新 requiredLevel | 不能降低等级 |
| 更新团队作用域 | knowledge:update | 团队访问 | 活动团队 |

## 更新内容

### API 端点

```typescript
// PATCH /v1/knowledge/:entryId
interface KnowledgeUpdateRequest {
  entryId: EntityId;
  labels?: string[];
  shortcut?: string;
  detail?: string;
  requiredLevel?: number;
}
```

### 更新字段

| 字段 | 类型 | 描述 | 限制 |
|------|------|------|------|
| labels | string[] | 标签列表 | 可选 |
| shortcut | string | 标题/摘要 | 可选 |
| detail | string | 详细内容 | 可选 |
| requiredLevel | number | 安全等级 | 不能高于用户等级 |

## 修订历史

### 修订记录结构

```typescript
interface KnowledgeRevisionRecord {
  revision: number;
  submittedAt: string;
  submittedByUserId: string;
  shortcut: string;
  detail: string;
  labels: string[];
  reviewNotes: KnowledgeReviewNoteRecord[];
}
```

### 修订历史追加规则

1. 每次更新创建新的修订记录
2. 修订号递增（history.length + 1）
3. 记录修改者和时间
4. 保留完整内容快照

### 修订历史流程图

```mermaid
flowchart TB
    A[更新请求] --> B[获取当前条目]
    B --> C[创建新修订]
    C --> D[revision = history.length + 1]
    D --> E[复制当前内容]
    E --> F[应用更新字段]
    F --> G[添加到 history]
    G --> H[更新 latestRevision]
    H --> I[更新 metadata]
    I --> J[完成]
```

## 乐观锁机制

### 版本控制

```typescript
interface KnowledgeRecord {
  // ... other fields
  version: number;  // 每次更新递增
}
```

### 并发冲突处理

```typescript
// 更新时检查版本
await store.updateKnowledgeEntry(id, updates, {
  expectedVersion: currentVersion
});

// 版本不匹配时抛出异常
if (result.rowCount === 0) {
  throw new OptimisticLockError(id);
}
```

### 乐观锁流程图

```mermaid
flowchart TB
    A[更新请求] --> B[读取当前版本]
    B --> C[应用更新]
    C --> D{检查版本号}
    
    D -->|匹配| E[更新成功]
    D -->|不匹配| F[版本冲突]
    
    E --> G[version++]
    G --> H[返回结果]
    
    F --> I[409 Conflict]
    I --> J[重新读取最新数据]
    J --> K[重试更新]
```

## 索引刷新

### 触发条件

只有 APPROVED 状态的条目更新后才触发索引刷新：

```typescript
// 索引刷新检查
if (previousState === 'approved' && nextState === 'approved') {
  // 触发索引刷新
  await app.skillShareer.eventBus.emitDomainEventAsync({
    name: 'knowledge.updated',
    entryId,
    previousState,
    nextState,
    actorId: auth.actorId,
    reason: 'updated',
    timestamp: nowIso(),
  });
}
```

### 索引刷新流程

```mermaid
flowchart TB
    A[APPROVED 条目更新] --> B[触发领域事件]
    B --> C[Vector Indexing]
    B --> D[Keyword Indexing]
    B --> E[Graph Indexing]
    
    C --> F[重新生成 Embedding]
    F --> G[更新向量索引]
    
    D --> H[重新提取关键词]
    H --> I[更新 BM25 索引]
    
    E --> J[更新关系边]
    J --> K[更新图索引]
    
    G --> L[更新索引状态]
    I --> L
    K --> L
    
    L --> M[索引刷新完成]
```

## 替代机制 (Supersede)

### 替代流程

替代机制用于用新条目替换旧条目：

```mermaid
flowchart TB
    A[POST /v1/knowledge/:entryId/supersede] --> B{验证会话}
    B -->|失败| C[401 Unauthorized]
    B -->|成功| D{检查 knowledge:update 权限}
    D -->|无权限| E[403 Forbidden]
    D -->|有权限| F[查找原条目]
    
    F -->|不存在| G[404 Not Found]
    F -->|存在| H[查找替代条目]
    
    H -->|不存在| G
    H -->|存在| I{替代条目已批准}
    I -->|否| J[400 替代条目需已批准]
    I -->|是| K[执行替代]
    
    K --> L[设置 supersededById]
    L --> M[更新 decayState = superseded]
    M --> N[创建生命周期事件]
    N --> O[记录审计事件]
    O --> P[返回结果]
```

### 替代实现

```typescript
function supersedeEntry(args: {
  store: SkillShareerStore;
  data: StoreData;
  entryId: EntityId;
  replacementId: EntityId;
  actorId: EntityId;
}): KnowledgeRecord {
  const entry = data.knowledgeEntries.find(e => e.id === entryId);
  const replacement = data.knowledgeEntries.find(e => e.id === replacementId);
  
  if (!entry || !replacement) {
    throw new AppError(404, 'entry_not_found', 'Entry not found');
  }
  
  if (replacement.lifecycleState !== 'approved') {
    throw new AppError(400, 'invalid_state', 'Replacement must be approved');
  }
  
  // 更新衰减元数据
  entry.decayMeta = {
    lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
    decayState: 'superseded',
    supersededById: replacementId,
    decayStateComputedAt: nowIso(),
    freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
  };
  
  // 创建生命周期事件
  const event: KnowledgeLifecycleEventRecord = {
    id: store.nextId(data, 'evt'),
    type: 'superseded',
    createdAt: nowIso(),
    actorUserId: args.actorId,
    submissionId: null,
    revision: null,
    state: entry.lifecycleState,
    note: `Superseded by ${replacementId}`,
  };
  entry.lifecycleHistory.push(event);
  
  return entry;
}
```

## 更新与重新提交的区别

| 特性 | 更新 (Update) | 重新提交 (Resubmit) |
|------|--------------|-------------------|
| **适用状态** | 任何状态 | 仅 REJECTED / AGENT-REJECTED |
| **权限要求** | knowledge:update | knowledge:submit |
| **审核流程** | 不需要重新审核 | 需要重新审核 |
| **修订历史** | 创建新修订 | 创建新提交记录 |
| **索引影响** | APPROVED 状态触发刷新 | 不触发索引 |
| **状态转换** | 不改变生命周期状态 | 改变生命周期状态 |

## 审计事件

更新流程产生的审计事件：

```typescript
type UpdateAuditEvent =
  | { type: 'knowledge.updated'; actorId: EntityId; entryId: EntityId }
  | { type: 'knowledge.superseded'; actorId: EntityId; entryId: EntityId; replacementId: EntityId }
  | { type: 'knowledge.revision-created'; actorId: EntityId; entryId: EntityId; revision: number };
```

## 用户操作日志

```typescript
// 更新操作日志
void logUserOperation(app.skillShareer.config.userOpsLog, {
  timestamp: nowIso(),
  actorId: auth.actorId,
  actorHandle: auth.handle,
  action: 'edit',
  targetId: entryId,
  teamId: auth.activeTeamId,
  metadata: { endpoint: 'update', scope: updatedEntry.scope, labels: payload.labels },
});
```

## 参考文档

- [知识生命周期](KNOWLEDGE_LIFECYCLE.md)
- [淘汰机制](DECAY.md)
- [治理模型](GOVERNANCE.md)

## 相关源码

- [packages/server/src/routes/knowledge.ts](../../packages/server/src/routes/knowledge.ts)
- [packages/server/src/lib/knowledge.ts](../../packages/server/src/lib/knowledge.ts)
- [packages/server/src/lib/decay/supersede.ts](../../packages/server/src/lib/decay/supersede.ts)
- [packages/server/src/lib/lifecycle/state-machine.ts](../../packages/server/src/lib/lifecycle/state-machine.ts)
