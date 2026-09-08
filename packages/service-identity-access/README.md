# `@trapmap/service-identity-access`

你用这个服务模块拥有用户、团队、成员、会话、访问密钥与审计事件，并对外提供认证与权限检查。

## 入口

主入口为 `packages/service-identity-access/src/index.ts`，审计写入见 `packages/service-identity-access/src/audit.ts`（`createAuditEvent`），迁移见 `packages/service-identity-access/src/migrations.ts`（`runIdentityAccessMigrations` / `assertIdentityAccessMigrationSet`）。全部端点以 `/internal` 为前缀，只供服务间调用。

| 表 | 约束要点 |
| --- | --- |
| `users` | `handle` 唯一 |
| `teams` | `slug` 唯一 |
| `memberships` | `(user_id, team_id)` 唯一，`role_template` 解析权限 |
| `sessions` / `access_keys` | `token_hash` 唯一 |
| `audit_events` | 同步写入 |

角色模板：`user` 读与检索，`editor` 加提交与导出，`admin` 加成员与审核，`system-admin` 经独立密钥登录。

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/backend-core` | 端口契约与模块底座 |
| `@trapmap/contracts` | 身份与权限 schema |
| `@trapmap/db` | 表定义 |
| `@trapmap/lib` | 纯函数工具 |
| `drizzle-orm` / `pg` / `fastify` / `zod` | 数据访问、服务框架、校验 |
| `build` / `typecheck` / `test` | 编译 / 校验 / 单元测试 |

其他服务经 `IdentityAccessPort` 操作身份，不得直写身份表。本包无异步后续处理。
