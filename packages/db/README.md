# `@trapmap/db`

你用这个包读写全部 Drizzle PostgreSQL 表定义与迁移，它是持久化的唯一真相源。

## 入口

主入口为 `packages/db/src/index.ts`，表定义见 `packages/db/src/schema/`（经 `packages/db/src/schema/index.ts` 转出），连接帮助见 `packages/db/src/client.ts`（`createDb` / `createTestDb`），迁移执行见 `packages/db/src/migrate.ts`（`runMigrations` / `runDbMigrations`），SQL 真相为 `packages/db/migrations/schema.sql`（`IF NOT EXISTS` 幂等、无版本化历史）。

```ts
import { knowledgeEntries, createDb, runMigrations } from '@trapmap/db';
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `drizzle-orm` | 表定义与查询 |
| `pg` | 连接池 |
| `@trapmap/contracts` | 共享类型 |
| `build` / `typecheck` | `tsc -p tsconfig.json` 编译 / 校验 |
| `test` | `vitest run --project db` |

各 service 包经本包导入表，不再经已删除的 persistence-schema 包。数据库全景另见真相源文档，表级结论归 `docs/`，不在此展开。

## 常见用法

### 跑本包测试与表清单守卫

```bash
pnpm --filter @trapmap/db test
pnpm check:table-schema
```

第二条把 `packages/db/src/schema/` 的 `pgTable` 与 `docs/reference/DATABASE_SCHEMA.md` 做 diff。

### 建连接并跑迁移（空库）

```ts
import { Pool } from 'pg';
import { createDb, runMigrations } from '@trapmap/db';

const pool = new Pool({ connectionString: process.env.TRAPMAP_DATABASE_URL });
await runMigrations(pool);
const db = createDb(pool);
```

迁移只支持空库，已有开发数据库你先重建。连接串变量名以 `docs/reference/ENVIRONMENT.md` 为准。
