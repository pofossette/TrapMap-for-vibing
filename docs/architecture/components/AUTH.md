# 会话与认证 (Session & Authentication)

> **Round 10 Phase 3 更新**：身份域和审计域已从 `store_snapshot` JSONB 迁移为 PostgreSQL 结构化表（`users`、`teams`、`memberships`、`sessions`、`access_keys`、`audit_events`）。认证路由已统一通过 `repos.session`、`repos.accessKey`、`repos.membership` 访问，不再回退到 `store.snapshot()`。数据模型详见 [DATA_MODEL.md](../../reference/DATA_MODEL.md)。

## 概述

TrapMap **仅支持 CLI + 访问密钥认证**。不存在用户名/密码登录或浏览器会话。CLI 通过 `POST /v1/auth/login` 提交密钥，服务端返回 `sessionToken`，CLI 将其持久化到 `~/.trapmap/cli.json`。

## 认证流程概览

```mermaid
flowchart TB
    subgraph 登录流程["登录流程"]
        A1["trapmap login --access-key <key>"]
        A2["POST /v1/auth/login"]
        A3["SHA-256 哈希查找密钥"]
        A4["返回 sessionToken"]
    end

    subgraph 后续请求["后续命令"]
        B1["读取 ~/.trapmap/cli.json"]
        B2["Authorization: Bearer <token>"]
        B3["RBAC 权限 + 等级检查"]
    end

    登录流程 --> 后续请求
```

---

## CLI 登录命令

### 访问密钥登录

```bash
# 使用成员访问密钥
trapmap login --access-key <your-access-key>

# 使用系统管理员引导密钥（首次部署）
trapmap login --system-admin-key <your-admin-key>

# 指定远程服务器地址（写入配置后持久生效）
trapmap login --server https://trapmap.example.com --access-key <key>

# 查看当前会话
trapmap session

# 登出
trapmap logout
```

### 密钥类型

| 密钥 | 用途 | 创建方式 |
|------|------|----------|
| `--access-key` | 成员日常使用 | 管理员通过 `member key:create` 生成 |
| `--system-admin-key` | 首次部署引导 | 部署时通过 `TRAPMAP_SYSTEM_ADMIN_KEY` 环境变量设置 |

---

## CLI 服务器地址配置

CLI **同时只连接一个服务器**（`CliState.serverUrl` 为单值）。优先级：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | `trapmap login --server <url>` | 登录时覆盖，写入 `~/.trapmap/cli.json` |
| 2 | `~/.trapmap/cli.json` → `serverUrl` | 登录后持久化 |
| 3 | `TRAPMAP_SERVER_URL` 环境变量 | 首次使用前的默认值 |
| 4 | `http://127.0.0.1:4000` | 硬编码兜底 |

切换服务器：

```bash
trapmap login --server https://new-server.example.com --access-key <key>
```

---

## 用户与角色

### 用户模型

```typescript
interface Member {
  id: EntityId;
  username: string;
  passwordHash: string;   // 存储于服务端，CLI 不使用密码登录
  roleName: string;
  level: SecurityLevel;   // 0-10
  teamId?: EntityId;
  createdAt: string;
}
```

> `passwordHash` 字段存在于数据库模型中，但 **CLI 不提供密码登录路径**。该字段保留供未来可能的 Web UI 使用。

### 角色权限映射

```typescript
const ROLES = {
  viewer:       { permissions: ['knowledge:search', 'team:list'], level: 0 },
  contributor:  { permissions: ['knowledge:submit', 'knowledge:search', 'team:list'], level: 1 },
  reviewer:     { permissions: ['knowledge:submit', 'knowledge:search', 'knowledge:review', 'team:list', 'team:select'], level: 5 },
  admin:        { permissions: '*', level: 10 },
};
```

---

## 会话模型

```typescript
interface Session {
  id: EntityId;           // UUID v4
  userId: EntityId;
  createdAt: string;      // ISO 8601
  expiresAt: string;      // ISO 8601
  lastActivityAt: string;
  accessKeyId?: EntityId; // 关联的访问密钥
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
```

会话由服务端在密钥登录成功后创建，`sessionToken` 返回给 CLI 存储于 `~/.trapmap/cli.json`。

---

## 访问密钥

### 密钥模型

```typescript
interface AccessKey {
  id: EntityId;
  name: string;
  keyHash: string;          // SHA-256 哈希，不明文存储
  createdBy: { actorId: EntityId; actorName: string };
  createdAt: string;
  expiresAt: string | null; // null = 永不过期
  permissions: Permission[];
  level: number;
}
```

### 密钥创建

```bash
# 管理员为用户创建密钥
pnpm --filter @trapmap/cli dev -- member key:create <username> --name "CI Pipeline" --days 90
```

密钥明文仅显示一次，需立即保存。

### 密钥安全实践

- 不将密钥明文提交到代码仓库
- 使用环境变量或密钥管理服务存储
- 定期轮换（建议 90 天）
- 不再需要时及时撤销
- 为自动化任务创建独立密钥，限制权限范围

---

## 审计事件

> **Round 10 Phase 3 更新**：审计事件已从 `store_snapshot` JSONB 迁移为 `audit_events` 结构化表。PG 模式下通过 `repos.audit.listByFilter()` 查询，支持 action/actorId/entityId/teamId/时间范围过滤和分页。

| 事件 | 触发时机 |
|------|----------|
| `auth.login` | CLI 密钥登录 |
| `auth.logout` | CLI 登出 |
| `auth.access_key_created` | 创建访问密钥 |
| `auth.access_key_used` | 使用密钥认证 |

---

## 相关文档

- [安全指南](../operations/SECURITY.md) — 安全等级、RBAC 和配置清单
- [API 参考 — 认证端点](../architecture/API.md#认证端点) — 认证 API 详情
- [环境变量参考](../../reference/ENVIRONMENT.md) — 完整环境变量列表
