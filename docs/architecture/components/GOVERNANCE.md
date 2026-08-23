# 治理模型 (Governance Model)

## 概述

TrapMap 的治理模型基于 RBAC (基于角色的访问控制) 和多层级安全模型，确保知识条目在正确的权限级别下被访问和操作。

## Owner Boundary

`service-governance-review` 是 feedback、conflict、remediation 与 operator projection 的唯一业务 owner。它通过 owner-local PostgreSQL ports 和 internal routes 提供 feedback admin、统计、批处理、remediation 与冲突工作流；最终知识生命周期变更仍经 `KnowledgeWritePort` 委托给 `knowledge-write`。

`service-job-runtime` 只负责 typed governance commands 的排队与执行底座，包括 queue、retry/backoff、lease/reclaim、workflow 和 dead-letter；治理业务规则不回流到 queue owner。distributed gateway 保留既有 public URLs、认证 actor、trace/correlation headers 和 canonical error semantics，并将请求转发到 governance owner。相关实现入口为 [`service-governance-review/src/routes.ts`](../../../packages/service-governance-review/src/routes.ts)、[`service-governance-review/src/admin.ts`](../../../packages/service-governance-review/src/admin.ts)、[`service-governance-review/src/conflict-workflow.ts`](../../../packages/service-governance-review/src/conflict-workflow.ts) 与 [`host-distributed/src/gateway/routes.ts`](../../../packages/host-distributed/src/gateway/routes.ts)。

> **Round 3 更新**：知识域治理约束已从纯应用层校验升级为数据库级约束。`knowledge_entries` 表补齐 `CHECK` 约束（`scope`、`lifecycle_state`、`required_level`），`lifecycle_events` 表补齐 `type` CHECK 约束。标签、边界、维护分配已从 JSONB 拆为结构化子表（见 [数据库级治理约束](#数据库级治理约束round-3)），支持按治理维度直接查询、过滤和索引。

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
    subgraph 继承规则["继承规则"]
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
// @trapmap/contracts/src/domain/common.ts
type Permission =
  // 会话
  | 'session:read'         // 读取会话

  // 知识操作
  | 'knowledge:submit'     // 提交新知识
  | 'knowledge:search'     // 搜索和检索
  | 'knowledge:review'     // 审核（批准/拒绝/退回修正）
  | 'knowledge:update'     // 更新现有条目
  | 'knowledge:import'     // 批量导入
  | 'knowledge:export'     // 批量导出

  // 审计
  | 'audit:read'           // 查看审计日志

  // 统计
  | 'stats:read'           // 读取统计信息

  // 团队管理
  | 'team:create'          // 创建团队
  | 'team:list'            // 列出团队
  | 'team:select'          // 切换活动团队

  // 成员管理
  | 'member:create'        // 添加成员
  | 'member:update'        // 修改成员
  | 'member:key:create'    // 生成访问密钥
```

### 角色定义

角色通过 `RoleTemplate`（来自 `@trapmap/contracts`）定义，按成员关系（`MembershipRecord`）分配。同一用户在不同团队可拥有不同角色和安全等级。

```typescript
// @trapmap/contracts/src/domain/common.ts
type RoleTemplate = 'user' | 'admin' | 'system-admin';

// 每个 MembershipRecord 携带独立的 permissions 和 securityLevel
interface MembershipRecord {
  userId: string;
  teamId: string;
  roleTemplate: RoleTemplate;
  securityLevel: number;  // 0-10
  permissions: Permission[];
}
```

权限检查基于 `ResolvedAuthContext.effectivePermissions` 数组，而非全局角色常量映射。

### 权限检查流程

```mermaid
flowchart TB
    subgraph 请求["请求"]
        A["POST /v1/knowledge/review"]
    end

    subgraph 会话验证["会话验证"]
        B["验证会话 cookie/token\n从会话加载用户"]
    end

    subgraph 角色等级检查["角色和等级检查"]
        C["获取用户角色\n获取角色的安全等级\n与所需最低等级比较"]
    end

    subgraph 权限检查["权限检查"]
        D["获取用户角色权限\n检查所需权限是否在角色权限中"]
    end

    subgraph 条目等级检查["条目等级检查"]
        E["获取 entry.requiredLevel\n检查 user.level >= entry.requiredLevel"]
    end

    subgraph 结果["结果"]
        F["允许或拒绝"]
    end

    请求 --> 会话验证 --> 角色等级检查 --> 权限检查 --> 条目等级检查 --> 结果
```

### CLI 权限标志映射

CLI 入口 (`apps/cli/src/index.ts`) 将 RBAC 权限和安全等级组合为 `visibility` 对象，再映射到各命令组的细粒度标志：

| CLI 权限标志 | 来源 | 控制命令 |
|-------------|------|----------|
| `allowKnowledgeSubmit` | `knowledge:submit` | `submit`, `resubmit`, `trap submit`, `skill edit` |
| `allowKnowledgeSearch` | `knowledge:search` | `search`, `load`, `feedback`, `skill search-by-content` |
| `allowKnowledgeReview` | `securityLevel >= 1` + `knowledge:review` | `review:queue/approve/reject/return-for-correction`, `skill review:*`, `skill duplicate-job *` |
| `allowKnowledgeExport` | `knowledge:export` | `list`, `export`, `activate`, `status`, `skill history` |
| `allowKnowledgeImport` | `securityLevel >= 1` + `knowledge:import` | `import`, `migrate` |
| `allowKnowledgeUpdate` | `securityLevel >= 1` + `knowledge:update` | `edit`, `deactivate` |
| `allowAuditRead` | `audit:read` | `audit` |

Operations 命令组使用独立标志：`allowList`、`allowActivate`、`allowStatus`（均映射自 `allowKnowledgeExport`），`allowMigrate`（映射自 `allowKnowledgeImport`）。

### 实现

权限检查通过 `governance/permissions.ts` 中的辅助函数实现，基于 `ResolvedAuthContext`：

```typescript
// governance/permissions.ts
function hasPermission(auth: ResolvedAuthContext, permission: Permission): boolean {
  return auth.effectivePermissions.includes(permission);
}

function requirePermission(auth: ResolvedAuthContext, permission: Permission): void {
  if (!hasPermission(auth, permission)) {
    throw new AppError(403, 'forbidden', `Missing required permission: ${permission}`);
  }
}

function requireTeamAccess(auth: ResolvedAuthContext, teamId: string): void {
  if (auth.subjectType === 'system-admin') return;
  if (auth.activeTeamId !== teamId) {
    throw new AppError(403, 'team_mismatch', 'Active session is not scoped to the requested team');
  }
}

function extractGovernanceContext(auth: ResolvedAuthContext): GovernanceContext {
  return {
    teamId: auth.activeTeamId,
    securityLevel: auth.securityLevel,
    isSystemAdmin: auth.subjectType === 'system-admin',
  };
}
```

检索时使用 `governance/eligibility.ts` 中的统一资格检查：

```typescript
// governance/eligibility.ts
function isGovernanceEligible(
  entity: GovernedEntity,
  context: GovernanceContext,
  options?: EligibilityOptions,
): boolean {
  // Must be approved
  if (entity.lifecycleState !== 'approved') return false;
  // System admin can access everything (before decay check)
  if (context.isSystemAdmin) return true;
  // Hard decay: exclude expired and superseded from default retrieval
  const excludeDecayed = options?.excludeDecayed !== false;
  if (excludeDecayed && entity.decayState !== undefined) {
    if (entity.decayState === 'expired' || entity.decayState === 'superseded') {
      return false;
    }
  }
  // Security level check: caller must have >= required level
  if (context.securityLevel < entity.requiredLevel) return false;
  // Team access check: global entities accessible to all, project entities require matching teamId
  if (entity.teamId !== null && entity.teamId !== context.teamId) return false;
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

## 审计日志 Audit Logging

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

审计事件存储在 `audit_events` 结构化表中（Round 10 Phase 3 迁移）：

```typescript
// store/types/system-records.ts
interface AuditEventRecord {
  id: string;
  teamId: string | null;
  actorId: string;
  action: string;          // 如 'auth.login', 'knowledge.approved'
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
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
// store/types/system-records.ts
interface AccessKeyRecord {
  id: string;
  memberId: string;          // 关联的成员 ID
  tokenHash: string;         // SHA-256 哈希
  tokenPreview: string;      // 令牌前缀
  issuedByUserId: string;    // 签发者
  teamId: string;            // 所属团队
  level: number;             // 安全等级
  notes: string | null;
  revokedAt: string | null;  // null = 未吊销
  createdAt: string;
  updatedAt: string;
}
```

### 密钥流程

```mermaid
flowchart TB
    subgraph 创建密钥["创建访问密钥"]
        A1["POST /v1/access-keys { memberId, teamId, notes? }"]
        A2["1. 生成随机密钥（base64url）\n2. 使用 SHA-256 哈希密钥\n3. 存储哈希 + 元数据（不存储实际密钥！）\n4. 仅向用户返回密钥一次（仅显示一次）"]
    end

    subgraph 使用密钥["使用访问密钥"]
        B1["CLI: trapmap login --access-key <key>"]
        B2["1. 哈希提供的密钥\n2. 在数据库中查找哈希\n3. 如果找到且未过期 → 创建会话\n4. 更新 lastUsedAt"]
    end

    subgraph 吊销密钥["吊销访问密钥"]
        C1["AccessKeyRepository.revoke(keyId)"]
        C2["1. 设置 revokedAt 时间戳\n2. 记录吊销事件"]
    end

    创建密钥 --> 使用密钥 --> 吊销密钥
```

### 实现

密钥创建通过 `POST /v1/access-keys` 路由处理（`routes/access-keys.ts`），使用 `AccessKeyRepository` 持久化：

```typescript
// routes/access-keys.ts（简化）
async function issueAccessKey(auth, payload) {
  requirePermission(auth, 'member:key:create');
  requireTeamAccess(auth, payload.teamId);

  const membership = await membershipRepo.getById(payload.memberId);
  requireHigherLevel(auth, membership.securityLevel);

  const accessKey = createOpaqueToken('ssr_key');
  const record = {
    id: await accessKeyRepo.nextId(),
    memberId: membership.id,
    tokenHash: hashSecret(accessKey),
    tokenPreview: accessKey.slice(-8),
    issuedByUserId: auth.user.id,
    teamId: payload.teamId,
    level: membership.securityLevel,
    notes: payload.notes ?? null,
    revokedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await accessKeyRepo.insert(record);
  return { accessKey, record };  // 明文密钥仅返回一次
}
```

密钥验证通过 `findAccessKeyByToken()` 在登录流程中完成（`lib/session.ts`），比较哈希后查找记录。

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

```mermaid
flowchart TB
    subgraph 作用域继承["作用域继承"]
        A["SkillArtifact.scope"]
        B["SkillCapsule.governanceInherited = true"]
        C["KnowledgeEntry.governanceInherited = true"]
        
        A --> B
        A --> C
    end
```

当 governanceInherited 为 true 时，子实体继承父实体的作用域。

---

## 数据库级治理约束（Round 3）

Round 3 将知识域的核心治理规则从纯应用层校验升级为数据库级约束，同时将嵌入 JSONB 的治理元数据拆分为结构化可查询子表。

### knowledge_entries CHECK 约束

```sql
-- 作用域约束：仅允许 'global' 或 'project'
ALTER TABLE knowledge_entries ADD CONSTRAINT ck_knowledge_entries_scope
  CHECK (scope IN ('global', 'project'));

-- 生命周期约束：仅允许合法状态枚举值
ALTER TABLE knowledge_entries ADD CONSTRAINT ck_knowledge_entries_lifecycle_state
  CHECK (lifecycle_state IN ('draft', 'submitted', 'agent-pass',
    'agent-rejected', 'approved', 'rejected', 'deactivated'));

-- 安全等级约束：仅允许 0-10
ALTER TABLE knowledge_entries ADD CONSTRAINT ck_knowledge_entries_required_level
  CHECK (required_level >= 0 AND required_level <= 10);
```

### lifecycle_events CHECK 约束

```sql
ALTER TABLE lifecycle_events ADD CONSTRAINT ck_lifecycle_events_type
  CHECK (type IN ('submitted', 'resubmitted', 'agent-reviewed',
    'reviewer-approved', 'reviewer-rejected', 'updated', 'deactivated'));
```

### 治理相关索引

| 索引 | 用途 |
|------|------|
| `idx_knowledge_entries_scope_level` ON `(scope, required_level)` | 按作用域 + 安全等级筛选可访问条目 |
| `idx_knowledge_entries_owner` ON `(owner_user_id)` | 按所有者筛选 |
| `idx_knowledge_entries_lifecycle_state` ON `(lifecycle_state)` | 按生命周期状态过滤（审核队列等） |
| `idx_knowledge_labels_label` ON `(label)` | 按标签过滤（AND 语义） |
| `idx_knowledge_maintenance_assignments_maintainer` ON `(maintainer_user_id)` | 按维护者筛选 |
| `idx_knowledge_maintenance_assignments_review_by` ON `(review_by)` | 按复核截止时间筛选 |

### 治理结构化子表

| 表 | 说明 | 关键治理用途 |
|----|------|------------|
| `knowledge_labels` | `(entry_id, label)` 对，含唯一约束 | 标签过滤、分类统计、检索召回 |
| `knowledge_boundary_contexts` | 上下文标签（如 `frontend`） | 边界感知过滤、跨上下文访问控制 |
| `knowledge_boundary_versions` | 包/工具版本约束 | 版本匹配、兼容性检查 |
| `knowledge_boundary_prerequisites` | 前置条件（环境/权限/工具等） | 适用性检查 |
| `knowledge_boundary_signals` | 信号模式匹配器 | 自动触发匹配 |
| `knowledge_boundary_exclusions` | 排除规则 | 不适用场景判定 |
| `knowledge_boundary_evidence` | 证据引用（issue/CVE/commit 等） | 治理审计追踪 |
| `knowledge_maintenance_assignments` | 维护者和复核时间（1:1 PK） | 责任制追踪、SLA 监控 |

所有子表通过 `PgKnowledgeRepository` 与 `knowledge_entries` JSONB 缓存列同步写入，读路径从子表读取结构化数据，保证查询性同时保持 API 契约兼容。
