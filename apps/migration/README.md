# `@trapmap/app-migration`

你用这个包运行数据库迁移作业进程，迁移实现归库包所有，本包只负责进程生命周期与退出码。

## 入口

唯一入口为 `apps/migration/src/index.ts`，它调用 `@trapmap/host-distributed/migrate.js` 导出的 `runDistributedMigrations()`，成功时 `process.exit(0)`，失败打印错误并 `process.exit(1)`。

```bash
pnpm --filter @trapmap/app-migration start
pnpm --filter @trapmap/app-migration build
pnpm --filter @trapmap/app-migration typecheck
pnpm --filter @trapmap/app-migration test
```

## 行为

| 依赖 / 脚本 | 用途 |
| --- | --- |
| `@trapmap/host-distributed` | `migrate.js` 导出的迁移编排 |
| `start` | `node dist/index.js`，compose `migration` 服务用此路径运行 |

你禁止复制或内联迁移逻辑，禁止 import 库包文件深路径，禁止在入口内引入业务判断。

## 常见用法

### 对空库跑迁移

```bash
pnpm --filter @trapmap/app-migration build
pnpm --filter @trapmap/app-migration start
```

前置条件：`TRAPMAP_DATABASE_URL` 指向空库（迁移不支持已有数据的库，变量默认值见 `docs/reference/ENVIRONMENT.md`）。成功退出码 `0`，失败 `1` 并打印错误。

### 改迁移编排后验证

```bash
pnpm --filter @trapmap/app-migration typecheck
pnpm --filter @trapmap/app-migration test
```

迁移实现归 `@trapmap/host-distributed/migrate.js`，你只改进程生命周期，不碰编排逻辑。
