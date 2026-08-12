
# @trapmap/service-identity-access

宿主组装体的共享身份与访问服务模块。本包权威拥有用户、团队、成员关系、会话、访问密钥和审计事件的 PostgreSQL 表，并提供认证、团队管理、权限检查和审计日志的 HTTP 端点。

## 边界归属

`service-identity-access` 拥有所有身份与访问相关的数据实体和查询逻辑。其他服务通过本模块暴露的端口接口进行身份操作，不得直接写入身份表。

- **数据归属**: `users`, `teams`, `memberships`, `sessions`, `access_keys`, `audit_events`
- **投影归属**: 无（读侧由消费方按需查询）
- **不归属**: 知识聚合、治理审查、候选摄取等业务域

### 同步边界

所有认证、团队管理和成员操作通过 `IdentityAccessPort` 接口同步执行。权限解析基于角色模板（role template）内置于本模块。

### 异步边界

本包无异步后续处理。审计事件以同步方式写入 `audit_events` 表。下游消费者通过查询接缝读取审计数据。

## 数据库表

| 表 | 说明 | 唯一约束 |
|---|---|---|
| `users` | 用户实体 | `handle` 唯一 |
| `teams` | 团队实体 | `slug` 唯一 |
| `memberships` | 用户-团队成员关系 | `(user_id, team_id)` 唯一 |
| `sessions` | 会话令牌 | `token_hash` 唯一 |
| `access_keys` | API 访问密钥 | `token_hash` 唯一 |
| `audit_events` | 审计日志 | 无 |
| `store_snapshot` | 遗留快照存储（过渡期） | `key` 唯一 |

外键关系：`access_keys.member_id` -> `memberships`, `access_keys.team_id` -> `teams`, `memberships.user_id` -> `users`, `memberships.team_id` -> `teams`, `sessions.user_id` -> `users`, `sessions.active_team_id` -> `teams`。

## 角色与权限

权限通过 `memberships.role_template` 字段解析：

| 角色 | 权限 |
|---|---|
| `user` (默认) | `session:read`, `team:list`, `knowledge:search` |
| `editor` | 上述 + `team:select`, `knowledge:submit`, `knowledge:update`, `knowledge:export` |
| `admin` | 上述 + `team:create`, `member:create`, `member:update`, `member:key:create`, `knowledge:review`, `knowledge:import`, `audit:read`, `stats:read` |
| `system-admin` | 同 `admin`，通过独立的系统管理员密钥登录，security level 固定为 10 |

## HTTP 端点

所有端点以 `/internal` 为前缀，仅供服务间内部调用。

### 认证

| 方法 | 路径 | 说明 | 请求体 |
|---|---|---|---|
| `POST` | `/internal/auth/login` | 用户登录 | `{ handle, password }` |
| `POST` | `/internal/auth/system-admin-login` | 系统管理员登录 | `{ systemAdminKey }` |
| `POST` | `/internal/auth/logout` | 登出 | `{ sessionToken }` |
| `POST` | `/internal/auth/validate` | 验证会话 | `{ sessionToken }` |
| `POST` | `/internal/auth/select-team` | 切换活跃团队 | `{ sessionToken, teamId }` |

### 团队

| 方法 | 路径 | 说明 | 参数 |
|---|---|---|---|
| `POST` | `/internal/teams` | 创建团队 | `{ name, slug, actorId }` |
| `GET` | `/internal/teams` | 列出用户团队 | `?userId=` |

### 成员

| 方法 | 路径 | 说明 | 参数 |
|---|---|---|---|
| `POST` | `/internal/members` | 添加成员 | `{ teamId, userId, role, actorId }` |
| `PUT` | `/internal/members/:memberId` | 更新成员 | `{ updates, actorId }` |

### 访问密钥

| 方法 | 路径 | 说明 | 参数 |
|---|---|---|---|
| `POST` | `/internal/access-keys` | 签发访问密钥 | `{ memberId, actorId }` |

### 健康检查

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/internal/health` | 基本存活性检查 |

### 错误响应

所有端点统一使用 `InvocationError` 分类体系：

| `kind` | HTTP 状态码 |
|---|---|
| `validation` | 400 |
| `unauthorized` | 401 |
| `forbidden` | 403 |
| `not-found` | 404 |
| `conflict` | 409 |
| `unavailable` | 503 |
| `timeout` | 504 |
| `internal` | 500 |

## 公共 API

### 依赖组装

```typescript
import {
  createIdentityAccessDeps,
  createIdentityAccessServiceModule,
} from '@trapmap/service-identity-access';

// 从端口依赖组装完整的 IdentityAccessDeps
const deps = createIdentityAccessDeps(portDeps);

// 创建业务模块（委托给 backend-core）
const module = createIdentityAccessServiceModule(deps);
```

### PostgreSQL 端口工厂

```typescript
import {
  createIdentityAccessPgDeps,
  createIdentityAccessOwnerBundle,
  createIdentityAccessActorLookupSource,
} from '@trapmap/service-identity-access';

// 从 pg Pool 创建完整的端口依赖实现
const deps = createIdentityAccessPgDeps(pool, { systemAdminKey: 'secret' });

// 结构化组合边界：将依赖打包为不可变束
const bundle = createIdentityAccessOwnerBundle(deps);

// 创建 actor lookup 源（用于构建用户查找上下文）
const actorSource = createIdentityAccessActorLookupSource(pool);
```

### 路由注册

```typescript
import { registerIdentityAccessRoutes } from '@trapmap/service-identity-access';

// 将路由注册到已有的 Fastify 实例
registerIdentityAccessRoutes(app, module);
```

### 独立服务器

```typescript
import { createIdentityAccessServer } from '@trapmap/service-identity-access';

const server = await createIdentityAccessServer(
  { host: '0.0.0.0', port: 3001, logLevel: 'info' },
  deps,
);
await server.start();
```

### 审计事件

```typescript
import { createAuditEvent } from '@trapmap/service-identity-access';

const event = createAuditEvent({
  store: { nextId: (data, kind) => `${kind}_1` },
  data: snapshot,
  teamId: 'team_1',
  actor: { actorId: 'user_1' },
  action: 'knowledge:review',
  entityId: 'entry_1',
  payload: { decision: 'approved' },
});
```

### Actor 查找

```typescript
import {
  collectIdentityActorIds,
  buildIdentityUserLookupContext,
  buildUserLookupContextFromRepos,
} from '@trapmap/service-identity-access';

// 从知识记录中收集所有 actor ID
const actorIds = collectIdentityActorIds(record);

// 通过 ActorBatchLookupPort 构建查找上下文
const context = await buildIdentityUserLookupContext(actorSource, entries);

// 或通过独立的 user/membership 仓库构建
const context = await buildUserLookupContextFromRepos(repos, entries);
```

### 数据库迁移

```typescript
import {
  assertIdentityAccessMigrationSet,
  runIdentityAccessMigrations,
} from '@trapmap/service-identity-access';

// 验证迁移集完整性（不含外部迁移文件）
await assertIdentityAccessMigrationSet();

// 执行迁移
await runIdentityAccessMigrations(pool);
```

## 脚本

| 命令 | 说明 |
|---|---|
| `pnpm build` | TypeScript 编译 |
| `pnpm test` | 运行 Vitest 测试（通过 monospace vitest project） |
| `pnpm typecheck` | 仅类型检查，不产出文件 |

## 依赖

### 生产依赖

| 包 | 说明 |
|---|---|
| `@trapmap/backend-core` | 业务逻辑端口定义（`IdentityAccessPort`, `InvocationError` 等） |
| `@trapmap/contracts` | 共享类型定义（`Permission` 等） |
| `@trapmap/persistence-schema` | 持久化 schema 导出（通过 `schema.ts` 重导出） |
| `fastify` | HTTP 框架 |
| `drizzle-orm` | 数据库迁移工具 |
| `pg` | PostgreSQL 客户端 |

### 开发依赖

`@types/node`, `@types/pg`, `typescript`, `vitest`

## 测试

测试文件位于 `src/` 目录，与源码同级：

| 文件 | 覆盖范围 |
|---|---|
| `routes.test.ts` | HTTP 端点：认证、团队、成员、访问密钥流程及错误映射 |
| `pg-ports.test.ts` | PostgreSQL 端口工厂：行映射、actor 查找、审计查询、快照端口 |
| `migrations.test.ts` | 迁移集断言：拒绝外部迁移文件、验证 journal 完整性 |
