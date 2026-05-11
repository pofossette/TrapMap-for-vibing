# 治理模型 (Governance Model)

## 概述

TrapMap 的治理模型基于 RBAC (基于角色的访问控制) 和多层级安全模型，确保知识条目在正确的权限级别下被访问和操作。

## 安全等级 (Security Levels)

### 定义

安全等级是 0-10 的整数，表示知识的敏感程度：

| 等级 | 名称 | 描述 | 示例 |
|------|------|------|------|
| 0 | 公开 | 可被任何人访问 | 公开文档、公共知识 |
| 1-3 | 内部 | 仅内部团队可访问 | 内部流程、团队知识 |
| 4-6 | 机密 | 需要特定级别授权 | 敏感业务信息 |
| 7-9 | 高度机密 | 仅少数人可访问 | 核心架构、密钥 |
| 10 | 最高机密 | 仅管理员可访问 | 系统密钥、管理员凭据 |

### 等级继承

```mermaid
flowchart TB
    subgraph Inheritance["继承规则"]
        A["artifact.requiredLevel\n由创建者设置"]
        B["capsule.requiredLevel\n继承自 artifact"]
        C["entry.requiredLevel\n继承自 capsule"]
    end

    A --> B --> C
```

### 等级检查

```typescript
function canAccessLevel(userLevel: SecurityLevel, requiredLevel: SecurityLevel): boolean {
  return userLevel >= requiredLevel;
}

// 示例
const entry = { requiredLevel: 5 };
const user = { level: 7 };

canAccessLevel(user.level, entry.requiredLevel); // true, 7 >= 5
```

---

## RBAC 权限系统

### 权限定义

```typescript
type Permission =
  // 知识操作
  | 'knowledge:submit'      // 提交新知识
  | 'knowledge:search'      // 搜索和检索
  | 'knowledge:review'      // 审核（批准/拒绝）
  | 'knowledge:update'      // 更新现有条目
  | 'knowledge:import'      // 批量导入
  | 'knowledge:export'      // 批量导出
  
  // 审计
  | 'audit:read'           // 查看审计日志
  
  // 团队管理
  | 'team:create'          // 创建团队
  | 'team:list'            // 列出团队
  | 'team:select'          // 切换活动团队
  
  // 成员管理
  | 'member:create'        // 添加成员
  | 'member:update'        // 修改成员
  | 'member:key:create'    // 生成访问密钥
  
  // 工件操作
  | 'artifacts:read'       // 读取工件
  | 'artifacts:write'      // 写入工件
  | 'artifacts:review'     // 审核工件
  | 'artifacts:derive'     // 派生工件
```

### 角色定义

```typescript
interface Role {
  name: string;
  permissions: Permission[];
  level: SecurityLevel;  // 角色对应的安全等级
}

// 预定义角色
const ROLES: Record<string, Role> = {
  viewer: {
    name: 'viewer',
    permissions: ['knowledge:search', 'team:list'],
    level: 0
  },
  
  contributor: {
    name: 'contributor',
    permissions: ['knowledge:submit', 'knowledge:search', 'team:list'],
    level: 1
  },
  
  reviewer: {
    name: 'reviewer',
    permissions: [
      'knowledge:submit', 'knowledge:search', 'knowledge:review',
      'team:list', 'team:select'
    ],
    level: 5
  },
  
  admin: {
    name: 'admin',
    permissions: [
      'knowledge:submit', 'knowledge:search', 'knowledge:review',
      'knowledge:update', 'knowledge:import', 'knowledge:export',
      'audit:read',
      'team:create', 'team:list', 'team:select',
      'member:create', 'member:update', 'member:key:create',
      'artifacts:read', 'artifacts:write', 'artifacts:review', 'artifacts:derive'
    ],
    level: 10
  }
};
```

### 权限检查流程

```mermaid
flowchart TB
    subgraph Request["Request"]
        A["POST /v1/knowledge/review"]
    end

    subgraph Session["Session Validation"]
        B["Validate session cookie/token\nLoad user from session"]
    end

    subgraph RoleCheck["Role & Level Check"]
        C["Get user's role\nGet role's security level\nCompare with required minimum level"]
    end

    subgraph PermissionCheck["Permission Check"]
        D["Get user's role permissions\nCheck if required permission is in role permissions"]
    end

    subgraph EntryCheck["Entry Level Check"]
        E["Get entry.requiredLevel\nCheck if user.level >= entry.requiredLevel"]
    end

    subgraph Result["Result"]
        F["Allowed or Denied"]
    end

    Request --> Session --> RoleCheck --> PermissionCheck --> EntryCheck --> Result
```

### 实现

```typescript
interface PermissionCheck {
  userId: EntityId;
  permission: Permission;
  resourceId?: EntityId;
  resourceLevel?: SecurityLevel;
}

async function checkPermission(check: PermissionCheck): Promise<boolean> {
  const { userId, permission, resourceId, resourceLevel } = check;
  
  // 1. Load user
  const user = await store.getUser(userId);
  if (!user) return false;
  
  // 2. Get user's role
  const role = ROLES[user.roleName];
  if (!role) return false;
  
  // 3. Check permission
  if (!role.permissions.includes(permission)) {
    return false;
  }
  
  // 4. Check security level (if resource has level)
  if (resourceLevel !== undefined) {
    if (role.level < resourceLevel) {
      return false;
    }
  }
  
  // 5. For team-scoped operations, check team membership
  if (check.teamId) {
    const isMember = await store.isTeamMember(check.teamId, userId);
    if (!isMember) return false;
  }
  
  return true;
}
```

---

## 团队隔离 (Team Isolation)

### 概念

- **Global entries**: 可被所有团队访问
- **Team entries**: 仅团队成员可访问

### 访问控制矩阵

| 条目作用域 | 团队成员 | 其他团队成员 | 无团队用户 |
|------------|---------|-------------|-----------|
| Global | ✓ (按等级) | ✓ (按等级) | ✓ (按等级) |
| Team A | ✓ (按等级) | ✗ | N/A |
| No Team | ✓ (按等级) | ✓ (按等级) | ✓ (按等级) |

### 团队范围查询

```typescript
async function getAccessibleEntries(userId: EntityId): Promise<EntityId[]> {
  const user = await store.getUser(userId);
  
  // Get user's teams
  const userTeams = await store.getUserTeams(userId);
  const teamIds = userTeams.map(t => t.id);
  
  // Get accessible entry IDs
  const accessibleEntries: EntityId[] = [];
  
  // 1. Global entries (level <= user level)
  const globalEntries = await store.listEntries({
    filter: { 
      scope: 'global',
      requiredLevel: { lte: user.level }
    }
  });
  accessibleEntries.push(...globalEntries.map(e => e.id));
  
  // 2. Team entries (user is team member)
  const teamEntries = await store.listEntries({
    filter: {
      scope: 'team',
      teamId: { in: teamIds },
      requiredLevel: { lte: user.level }
    }
  });
  accessibleEntries.push(...teamEntries.map(e => e.id));
  
  return accessibleEntries;
}
```

---

## 审计日志 (Audit Logging)

### 审计事件类型

```typescript
type AuditEvent =
  // 认证事件
  | { type: 'auth.login'; actorId: EntityId; success: boolean }
  | { type: 'auth.logout'; actorId: EntityId }
  | { type: 'auth.failed'; actorId?: EntityId; reason: string }
  
  // 知识事件
  | { type: 'knowledge.created'; actorId: EntityId; entryId: EntityId }
  | { type: 'knowledge.submitted'; actorId: EntityId; entryId: EntityId }
  | { type: 'knowledge.agent-passed'; entryId: EntityId }
  | { type: 'knowledge.agent-rejected'; entryId: EntityId; reason: string }
  | { type: 'knowledge.approved'; actorId: EntityId; entryId: EntityId }
  | { type: 'knowledge.rejected'; actorId: EntityId; entryId: EntityId; notes: string }
  | { type: 'knowledge.deactivated'; actorId: EntityId; entryId: EntityId }
  
  // 团队事件
  | { type: 'team.created'; actorId: EntityId; teamId: EntityId }
  | { type: 'team.member_added'; actorId: EntityId; teamId: EntityId; memberId: EntityId }
  
  // 索引事件
  | { type: 'index.triggered'; entryId: EntityId; adapters: string[] }
  | { type: 'index.failed'; entryId: EntityId; adapter: string; error: string }
```

### 审计日志表

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  actor_id UUID,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_type ON audit_log(event_type);
```

### 审计检查

```typescript
async function audit(
  event: AuditEvent,
  context: { ip?: string; userAgent?: string }
): Promise<void> {
  await store.createAuditLog({
    timestamp: new Date().toISOString(),
    eventType: event.type,
    actorId: event.actorId,
    metadata: event,
    ipAddress: context.ip,
    userAgent: context.userAgent
  });
}
```

---

## 访问密钥 (Access Keys)

### 概念

访问密钥是长期凭据，用于 CLI 或自动化脚本的身份验证。

### 密钥属性

```typescript
interface AccessKey {
  id: EntityId;
  name: string;
  keyHash: string;  // SHA-256 hash of actual key
  createdBy: ActorRef;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  permissions: Permission[];
  level: SecurityLevel;
}
```

### 密钥流程

```mermaid
flowchart TB
    subgraph Create["Create Access Key"]
        A1["POST /v1/access-keys { name, permissions, expiresIn }"]
        A2["1. Generate random key (32 bytes, base64url)\n2. Hash key with SHA-256\n3. Store hash + metadata (NOT the actual key!)\n4. Return key ONCE to user (shown only once)"]
    end

    subgraph Use["Use Access Key"]
        B1["CLI: trapmap login --access-key <key>"]
        B2["1. Hash provided key\n2. Lookup hash in database\n3. If found and not expired → create session\n4. Update lastUsedAt"]
    end

    subgraph Revoke["Revoke Access Key"]
        C1["DELETE /v1/access-keys/:keyId"]
        C2["1. Delete key record\n2. Log revocation event"]
    end

    Create --> Use --> Revoke
```

### 实现

```typescript
async function createAccessKey(
  userId: EntityId,
  name: string,
  permissions: Permission[],
  expiresInDays?: number
): Promise<{ key: string; id: EntityId }> {
  // Generate random key
  const key = generateSecureKey(32);  // 32 bytes, base64url encoded
  
  // Hash for storage
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  
  // Calculate expiration
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : undefined;
  
  // Get user's level
  const user = await store.getUser(userId);
  
  // Create access key record
  const accessKey = await store.createAccessKey({
    id: generateEntityId(),
    name,
    keyHash,
    createdBy: { actorId: userId, actorName: user.username },
    createdAt: new Date().toISOString(),
    expiresAt,
    permissions,
    level: user.level
  });
  
  // Return key ONCE (it's not stored!)
  return { key, id: accessKey.id };
}

async function validateAccessKey(key: string): Promise<User | null> {
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  
  const accessKey = await store.getAccessKeyByHash(keyHash);
  if (!accessKey) return null;
  
  // Check expiration
  if (accessKey.expiresAt && new Date(accessKey.expiresAt) < new Date()) {
    return null;
  }
  
  // Update last used
  await store.updateAccessKey(accessKey.id, {
    lastUsedAt: new Date().toISOString()
  });
  
  // Load user
  return store.getUser(accessKey.createdBy.actorId);
}
```

---

## 作用域 (Scope)

### 作用域类型

```typescript
type Scope = 'global' | 'project' | 'team';
```

| 作用域 | 描述 | 访问控制 |
|--------|------|----------|
| global | 全局可访问 | 仅安全等级检查 |
| project | 项目范围内 | 项目成员 + 等级检查 |
| team | 团队范围内 | 团队成员 + 等级检查 |

### 作用域继承

```
SkillArtifact.scope
       │
       ├─→ SkillCapsule.governanceInherited = true
       │
       └─→ KnowledgeEntry.governanceInherited = true
```

当 governanceInherited 为 true 时，子实体继承父实体的作用域。
