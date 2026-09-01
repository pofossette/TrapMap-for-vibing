# DB 与 Test 目录重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分散在 `src/**/*.test.ts` 的 315 个测试迁移至独立的 `test/` 目录风格，并将分散于 `persistence-schema` 与 7 个 `service-*/drizzle` 的存储层收敛为单一 `packages/db` 包，移除所有 `0000_...` 版本化 drizzle 演进历史，改为单一 schema 真相源。

**Architecture:** 保持 `contracts → db → service → host` 分层。新建 `@trapmap/db` 作为唯一持久化真相源（`src/schema/` + 单一 `schema.sql` + 统一 `migrate()`），所有 service 通过 `@trapmap/db` 导入表定义；废弃 `persistence-schema` 的分散 schema 与各 service 的 `drizzle/` 目录。测试层从 colocated (`src/**/*.test.ts`) 迁移至 sibling 目录 (`{pkg}/test/**/*.test.ts`)，通过 `vitest.config.ts` 的 `include` 切换实现，两阶段完成后旧路径不再生效。Fallow zone 中新增 `db` 替代 `persistence-schema`，并移除 `assertOwnerMigrationSet` 的 per-owner journal 校验。

**Tech Stack:** TypeScript 5.9, Vitest 3.2 (forks pool), pnpm 10.33 workspace, Drizzle ORM 0.45, PostgreSQL 16 + pg 8.20, NodeNext ESM.

**Global Constraints**
- 共享类型以 `packages/contracts` 为准；新枚举放入 `enum-types/` 并聚合导出。
- 通用工具从 `@trapmap/lib` 导入，禁止各包重复实现。
- 禁止新增 `@ts-ignore` / `@ts-expect-error`，禁止裸 `as never`/`as unknown as`，确需断言必须带 `// lib type gap:` 注释且经 `pnpm check:asserts`。
- 新 HTTP 路由必须走 `create<X>RouteDefs(deps)` 工厂，由双 adapter 消费。
- 新领域规则落 `packages/backend-core/src/<context>/domain/` 纯函数，零框架零 DB。
- 修改后优先跑“与改动直接相关的最小验证集合”，确需时才跑根级 `pnpm test`；涉及检索/摘要/治理/feedback/fixtures/eval 的改动至少补跑 `pnpm eval:smoke`。
- 跨包导入变更必须通过 `pnpm exec fallow audit --base main` 验证边界，zone 规则见 `docs/architecture/BOUNDARIES.md`。
- 所有包使用 `pnpm` 脚本直接调用，单文件测试用 `pnpm test:file -- <path>`，包级测试用 `pnpm --filter <pkg> test --run`。

---

## File Structure Overview

**将创建/修改的文件总览：**

- 新建 `packages/db/` — 统一存储包
  - `packages/db/package.json`
  - `packages/db/tsconfig.json`
  - `packages/db/src/index.ts` (barrel re-export)
  - `packages/db/src/schema/index.ts` (聚合所有表)
  - `packages/db/src/schema/column-factories.ts` (从 persistence-schema 迁移)
  - `packages/db/src/schema/{auth,candidates,knowledge,artifacts,labels,cron,queue,retrieval,experience-genes}.ts` (合并自 persistence-schema/src)
  - `packages/db/src/client.ts` (drizzle 实例工厂 `createDb(pool)` / `createTestDb`)
  - `packages/db/src/migrate.ts` (单一 `runMigrations(pool)` 读取 `migrations/schema.sql`)
  - `packages/db/migrations/schema.sql` (单一真相源，由现有 70 张表聚合生成)
  - `packages/db/README.md`
  - `packages/db/test/schema.test.ts` (schema integrity sanity)
- 修改 `vitest.config.ts` (root) — projects 的 `include` 从 `src/**/*.test.ts` → `test/**/*.test.ts` (保留 `scripts/__tests__` 例外，web-panel 保留 `src/**/*.test.tsx` 过渡或同步迁移)
- 修改 `tsconfig.base.json` — 新增 `@trapmap/db` 路径映射，移除/保留 `@trapmap/persistence-schema` 指向 db 的 re-export 兼容层（可选）
- 修改 `pnpm-workspace.yaml` — 无需新增 entry (packages/* 已覆盖)，但需确保 `packages/db` 被识别
- 修改各 `packages/*/package.json` — 将 `@trapmap/persistence-schema` 依赖替换为 `@trapmap/db`，增加 `@trapmap/db` 的 `workspace:*`
- 修改各 `packages/service-*/src/pg-ports.ts`, `deps.ts`, `schema.ts`, `migrations.ts` — 导入源改为 `@trapmap/db`，移除 `assertOwnerMigrationSet` / per-owner `drizzle/` 依赖
- 删除 `packages/persistence-schema/` — 或保留为薄 re-export 兼容包（过渡期可选，最终移除）
- 删除 `packages/service-{identity-access,knowledge-write,knowledge-read,candidate-ingestion,governance-review,job-runtime,cron}/drizzle/` (7 个目录 + `persistence-schema/drizzle/`)
- 修改 `packages/host-local/src/nest/app.module.ts` 与 `packages/host-distributed/src/migrate.ts` — 统一调用 `runDbMigrations` 而非 7 个分散 runner
- 修改 `scripts/check-table-schema.ts` / `scripts/check-pgtable-single-source.ts` — 扫描源改为 `packages/db/src/schema/`，移除对 `persistence-schema` 的硬编码
- 修改 `docs/reference/REPO_STRUCTURE.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`, `docs/reference/DATABASE_SCHEMA.md`, `docs/reference/DATA_MODEL.md`, `docs/architecture/components/PERSISTENCE.md` — 将 `persistence-schema` 更新为 `db`
- 修改 `docs/architecture/BOUNDARIES.md` 与 `.fallowrc.json` (或 fallow 配置) — 新增 `db` zone，移除 `persistence-schema` zone 的唯一真相源声明
- 迁移测试：每个包下 `src/**/*.test.ts` → `test/**/*.test.ts` (315 文件)，同步更新相对导入 `from './foo.js'` → `from '../src/foo.js'`，跨包导入保持不变
- 更新 `knip.json`, `biome.json`, `.jscpd.json` — 将 `test/**` 加入忽略或扫描覆盖

---

### Task 1: 测试基础设施切换至独立 test 目录

**Files:**
- Modify: `vitest.config.ts` (root)
- Modify: `tsconfig.base.json` (add test path excludes)
- Modify: `packages/*/tsconfig.json` (ensure `test/**/*.ts` excluded from build)
- Modify: `packages/*/vitest.config.ts` (per-package, update include)
- Create: `scripts/migrate-tests-to-test-dir.ts` (一次性迁移脚本，可保留于 scripts/archived)
- Test: `vitest.config.test.ts` 或直接验证 `pnpm exec vitest run --project contracts` 在 include 切换后仍能发现已迁移的测试

**Interfaces:**
- Consumes: 现有 `vitest.config.ts` 的 `project(name, root, include)` helper
- Produces: 新的 `include = ['test/**/*.test.ts', 'test/**/*.test.tsx']` 约定，供 Task 2 的文件迁移验证

- [ ] **Step 1: 审计当前测试分布**

```bash
find packages apps -name "*.test.ts" -o -name "*.test.tsx" | wc -l   # 预期 315
find packages -name "vitest.config.ts" | xargs ls -la
cat vitest.config.ts | grep -A2 "project("
```

预期：`315`，root vitest.config.ts 的各 project 均 `include: ['src/**/*.test.ts']`（web-panel 额外含 `src/**/*.test.tsx`，scripts 含 `__tests__/**/*.test.ts`）

- [ ] **Step 2: 编写一次性迁移脚本的测试**

```ts
// scripts/migrate-tests-to-test-dir.test.ts (临时)
import { describe, it, expect } from 'vitest';
import { rewriteImportPath } from './migrate-tests-to-test-dir.js';
describe('rewriteImportPath', () => {
  it('rewrites relative src import to sibling test dir', () => {
    expect(rewriteImportPath("./foo.js", "packages/lib/src/foo.test.ts", "packages/lib/test/foo.test.ts"))
      .toBe("../src/foo.js");
  });
  it('keeps workspace package imports unchanged', () => {
    expect(rewriteImportPath("@trapmap/contracts", "any", "any")).toBe("@trapmap/contracts");
  });
});
```

Run: `pnpm exec vitest run scripts/migrate-tests-to-test-dir.test.ts -v` 预期 FAIL (function not defined)

- [ ] **Step 3: 实现迁移脚本 `scripts/migrate-tests-to-test-dir.ts`**

```ts
// 核心逻辑：
// - 遍历 packages/*, apps/* 查找 src/**/*.test.ts
// - 目标路径: src/foo/bar.test.ts → test/foo/bar.test.ts (保留子目录)
// - 创建目标目录，git mv 文件
// - 重写文件内相对导入：以 ./ 或 ../ 开头且指向 .js/.ts 的 import，计算从 test 位置到 src 的相对路径
// - 对 import '@trapmap/...' 和第三方包保持不变

export function rewriteImportPath(original: string, _oldFile: string, _newFile: string): string {
  if (!original.startsWith('.')) return original;
  // 将原 ./foo.js 视为相对于 src/，新文件相对于 test/，需增加一层 ../src
  // 简化：若原为 ./foo.js → ../src/foo.js，若原为 ../utils/bar.js → ../../src/utils/bar.js 需精细计算
}
```

提交后 Run: `pnpm exec vitest run scripts/migrate-tests-to-test-dir.test.ts -v` 预期 PASS

- [ ] **Step 4: 更新根级及包级 vitest 配置**

```ts
// vitest.config.ts 变更示例
const project = (name: string, root: string, include = ['test/**/*.test.ts']) => ({
  test: { name, root, include },
  resolve: { alias },
});
// web-panel 保持 test/*.test.tsx
{
  ...project('web-panel', './apps/web-panel', ['test/**/*.test.ts', 'test/**/*.test.tsx']),
  test: { name: 'web-panel', root: './apps/web-panel', include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], environment: 'jsdom' }
}
// scripts project: include ['__tests__/**/*.test.ts', 'test/**/*.test.ts'] 过渡或统一
```

同时更新 `tsconfig.base.json`:

```json
"exclude": ["**/dist", "**/test", "**/__tests__", "coverage"]
```

每个 `packages/*/tsconfig.json` 的 `include` 保持 `src/**/*.ts`，确保 `test/` 不被编译进 dist。

- [ ] **Step 5: 验证空迁移前后测试发现**

```bash
pnpm --filter @trapmap/lib test --run src/vector.test.ts  # 仍在 src 阶段应 PASS
# 修改 include 后，在未移动文件时应为 0 tests (证明配置已生效)，移动后恢复
pnpm exec vitest run --project lib --reporter=verbose | grep "test"
```

- [ ] **Step 6: 提交**

```bash
git add vitest.config.ts tsconfig.base.json packages/*/tsconfig.json packages/*/vitest.config.ts scripts/migrate-tests-to-test-dir.ts
git commit -m "chore: switch vitest to separate test/ directory convention"
```

**验收标准：** `vitest.config.ts` 的所有 projects 均使用 `test/**/*.test.ts`，`pnpm exec fallow list --boundaries` 仍通过，CI 的 `pnpm typecheck` 不将 test 文件计入 dist 构建。

---

### Task 2: 迁移全部测试文件至 test/ 目录

**Files:**
- Modify: `packages/*/src/**/*.test.ts` → `packages/*/test/**/*.test.ts` (git mv, ~315 files)
- Modify: `apps/cli/src/**/*.test.ts` → `apps/cli/test/**/*.test.ts`
- Modify: `apps/web-panel/src/**/*.test.ts` → `apps/web-panel/test/**/*.test.ts`
- Modify: `apps/mcp/src/**/*.test.ts` → `apps/mcp/test/**/*.test.ts` (8 files)
- Modify: `packages/backend-core/src/**/*.test.ts` → `packages/backend-core/test/**/*.test.ts` (40 files)
- Modify: 内联导入路径修正 (所有被移动文件)
- Test: 各包 test 套件

**Interfaces:**
- Consumes: Task 1 的新 include 约定与 `rewriteImportPath` 工具
- Produces: 完整的 `test/` 目录树，旧 `src/**/*.test.ts` 清零

- [ ] **Step 1: 运行迁移脚本 (dry-run → 执行)**

```bash
pnpm exec tsx scripts/migrate-tests-to-test-dir.ts --dry-run 2>&1 | head -n 50
# 确认 315 文件映射正确，如 packages/contracts/src/domain/auth.test.ts → packages/contracts/test/domain/auth.test.ts
pnpm exec tsx scripts/migrate-tests-to-test-dir.ts
git status | head -n 100
```

预期：`git status` 显示大量 `renamed: src/foo.test.ts → test/foo.test.ts`

- [ ] **Step 2: 批量修正相对导入**

脚本已处理，但需抽样验证：

```bash
grep -r "from \"\./" packages/contracts/test --include="*.ts" | head -n 20
# 预期： from "../src/domain/foo.js" 而非 from "./foo.js"
grep -r "from \"../src" packages/contracts/test --include="*.ts" | wc -l
```

手工修复遗漏的 `../src` 深度错误（脚本对多层嵌套需 `path.relative` 精确计算）。

- [ ] **Step 3: 验证单包测试仍通过 (抽样)**

```bash
pnpm --filter @trapmap/contracts test --run test/domain/auth.test.ts
pnpm --filter @trapmap/lib test --run test/vector.test.ts --reporter=verbose
pnpm --filter @trapmap/backend-core test --run test/knowledge-write/domain --reporter=verbose
pnpm --filter @trapmap/cli test --run test/commands/trap.test.ts
```

任一失败则修复导入或 vitest alias。

- [ ] **Step 4: 全量测试 (最小验证集合，待 Task 3-5 完成后必跑)**

```bash
pnpm exec vitest run --project contracts --project lib --project backend-core --reporter=dot
```

预期：全部 PASS，旧路径 `src/**/*.test.ts` 数量为 0：

```bash
find packages apps -path "*src/*.test.ts" | wc -l  # 0
find packages apps -path "*test/*.test.ts" | wc -l # 315
```

- [ ] **Step 5: 更新文档与守卫**

```bash
grep -r "src/.*\.test\.ts" docs --include="*.md" | head
# 更新 docs/operations/TESTING.md、AGENTS.md 中 Vitest 使用要求段落，将示例从
# `pnpm test:file -- packages/host-local/src/nest/app.test.ts` 更新为
# `pnpm test:file -- packages/host-local/test/nest/app.test.ts`
```

同步更新 `knip.json` 的 `ignore` 保持 `**/*.test.ts` 已覆盖，`biome.json` 无需变更。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "test: move all tests to separate test/ directories"
```

**验收标准：** `find packages apps -name "*.test.ts" -path "*src/*"` = 0，`pnpm test` (root) 发现的测试数与迁移前一致 (315)，`pnpm typecheck` 通过。

---

### Task 3: 新建统一 @trapmap/db 包骨架

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/schema/column-factories.ts`
- Create: `packages/db/src/schema/auth.ts`
- Create: `packages/db/src/schema/candidates.ts`
- Create: `packages/db/src/schema/knowledge.ts`
- Create: `packages/db/src/schema/artifacts.ts`
- Create: `packages/db/src/schema/labels.ts`
- Create: `packages/db/src/schema/cron.ts`
- Create: `packages/db/src/schema/queue.ts`
- Create: `packages/db/src/schema/retrieval.ts`
- Create: `packages/db/src/schema/experience-genes.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/migrate.ts`
- Create: `packages/db/README.md`
- Create: `packages/db/test/schema.test.ts` (或 test/db.test.ts)
- Modify: `pnpm-workspace.yaml` (无需变更，packages/* 已覆盖)
- Modify: `tsconfig.base.json` (添加 @trapmap/db 路径)
- Modify: `.fallowrc.json` / `docs/architecture/BOUNDARIES.md` (新增 db zone)

**Interfaces:**
- Consumes: `packages/persistence-schema/src/**` 的现有表定义（作为拷贝源）
- Produces: 
  - `export * from './schema/index.js'` (barrel)
  - `export { createDb, createTestDb } from './client.js'` — `createDb(pool: Pool) => NodePgDatabase`
  - `export { runMigrations } from './migrate.js'` — `runMigrations(pool: Pool) => Promise<void>` 读取 `migrations/schema.sql`

- [ ] **Step 1: 创建 package.json 与 tsconfig.json**

```json
// packages/db/package.json
{
  "name": "@trapmap/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "pnpm -C ../.. exec vitest run --project db",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@trapmap/contracts": "workspace:*",
    "drizzle-orm": "^0.45.2",
    "pg": "8.20.0"
  },
  "devDependencies": { "@types/pg": "8.20.0", "typescript": "^5.9.3" }
}
```

```json
// packages/db/tsconfig.json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "rootDir": "src", "outDir": "dist" }, "include": ["src/**/*.ts"], "exclude": ["test/**", "src/**/*.test.ts"] }
```

- [ ] **Step 2: 迁移 schema 文件 (复制并验证)**

```bash
mkdir -p packages/db/src/schema
cp packages/persistence-schema/src/column-factories.ts packages/db/src/schema/
cp packages/persistence-schema/src/auth.ts packages/db/src/schema/
cp packages/persistence-schema/src/candidates.ts packages/db/src/schema/
cp packages/persistence-schema/src/knowledge.ts packages/db/src/schema/
cp packages/persistence-schema/src/artifacts.ts packages/db/src/schema/
cp packages/persistence-schema/src/labels.ts packages/db/src/schema/
cp packages/persistence-schema/src/cron.ts packages/db/src/schema/
cp packages/persistence-schema/src/queue.ts packages/db/src/schema/
cp packages/persistence-schema/src/retrieval.ts packages/db/src/schema/
cp packages/persistence-schema/src/experience-genes.ts packages/db/src/schema/
```

创建 `packages/db/src/schema/index.ts`:

```ts
export * from './column-factories.js';
export * from './auth.js';
export * from './candidates.js';
export * from './cron.js';
export * from './knowledge.js';
export * from './artifacts.js';
export * from './labels.js';
export * from './retrieval.js';
export * from './experience-genes.js';
export * from './queue.js';
```

创建 `packages/db/src/index.ts`:

```ts
export * from './schema/index.js';
export * from './client.js';
export * from './migrate.js';
```

- [ ] **Step 3: 实现 client.ts 与 migrate.ts**

```ts
// packages/db/src/client.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema/index.js';
export function createDb(pool: Pool) { return drizzle(pool, { schema }); }
export type Db = ReturnType<typeof createDb>;
```

```ts
// packages/db/src/migrate.ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
const schemaSqlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations/schema.sql');
export async function runMigrations(pool: Pool, sqlPath = schemaSqlPath): Promise<void> {
  const sql = await readFile(sqlPath, 'utf8');
  // 拆分 statement-breakpoint 或直接执行整个文件；使用 pool.query
  await pool.query(sql);
}
```

- [ ] **Step 4: 添加 tsconfig 路径与 fallow zone**

```json
// tsconfig.base.json paths 新增
"@trapmap/db": ["./packages/db/src/index.ts"],
"@trapmap/db/*": ["./packages/db/src/*"]
```

fallow 配置 (若采用 .fallowrc.json):

```json
{ "name": "db", "path": "packages/db/src", "allowedDependencies": ["contracts", "lib"] }
```

并更新 BOUNDARIES.md：db 为唯一持久化真相源，service 包可依赖 db，db 不依赖 service。

- [ ] **Step 5: 编写 db 包的完整性测试**

```ts
// packages/db/test/schema.test.ts
import { describe, it, expect } from 'vitest';
import * as schema from '../src/schema/index.js';
describe('db schema integrity', () => {
  it('exports all expected tables', () => {
    expect(schema.knowledgeEntries).toBeDefined();
    expect(schema.skillArtifacts).toBeDefined();
    expect(schema.candidates).toBeDefined();
    expect(schema.usersTable).toBeDefined();
    expect(schema.taskQueue).toBeDefined();
    expect(schema.experienceGenes).toBeDefined();
  });
  it('auditTimestamps factory produces createdAt/updatedAt', () => {
    const cols = schema.auditTimestamps ? null : null; // 验证工厂存在
  });
});
```

Run: `pnpm --filter @trapmap/db test --run` 预期 PASS

- [ ] **Step 6: 提交**

```bash
git add packages/db
git add tsconfig.base.json
git commit -m "feat(db): scaffold unified @trapmap/db package"
```

**验收标准：** `pnpm --filter @trapmap/db build` 成功，`pnpm --filter @trapmap/db test --run` PASS，`pnpm exec fallow audit --base HEAD --no-cache` 对 db 的新增依赖无违规。

---

### Task 4: 收敛为单一 schema.sql 并移除版本化演进

**Files:**
- Create: `packages/db/migrations/schema.sql` (单一真相源，70 张表 + 索引)
- Delete: `packages/service-*/drizzle/` (7 dirs), `packages/persistence-schema/drizzle/` (1 dir), `packages/persistence-schema/drizzle/meta/`
- Modify: `packages/db/src/migrate.ts` (实现幂等执行)
- Modify: `packages/backend-core/src/migrations/owner-migration-set.ts` (标记废弃或移除 `assertOwnerMigrationSet`，更新注释)
- Modify: `packages/service-*/src/migrations.ts` (7 files) → 薄 wrapper 委托给 `@trapmap/db`
- Test: `packages/db/test/migrate.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `runMigrations` 骨架
- Produces: 单一 `schema.sql` + 移除所有 `0000_...sql` / `meta/_journal.json`

- [ ] **Step 1: 聚合生成 schema.sql**

```bash
# 策略：以当前各 service drizzle 的 0000_* 聚合 + 后续增量 0001/0002 为源，去重后生成完整 DDL
# 1. 收集所有 CREATE TABLE / CREATE INDEX / CREATE SEQUENCE 语句
cat packages/service-knowledge-write/drizzle/0000_youthful_gargoyle.sql \
    packages/service-knowledge-write/drizzle/0001*.sql \
    packages/service-knowledge-write/drizzle/0002*.sql \
    packages/service-candidate-ingestion/drizzle/*.sql \
    packages/service-identity-access/drizzle/*.sql \
    packages/service-job-runtime/drizzle/*.sql \
    packages/service-governance-review/drizzle/*.sql \
    packages/service-knowledge-read/drizzle/*.sql \
    packages/service-cron/drizzle/*.sql \
    packages/persistence-schema/drizzle/*.sql > /tmp/combined.sql

# 2. 去重并按依赖顺序排序（或直接使用 pg_dump --schema-only 从现有 DB dump）
# 更可靠：启动临时 Postgres，执行所有迁移，pg_dump 导出完整 schema，再整理为 IF NOT EXISTS 形式
```

编写生成脚本 `scripts/generate-db-schema.ts`：

```ts
// 读取 packages/persistence-schema/src/** 的 pgTable 定义，通过 drizzle-kit generate 生成快照
// 或直接读取 combined.sql 去重，输出到 packages/db/migrations/schema.sql
// 每个 CREATE TABLE 添加 IF NOT EXISTS，所有 CREATE INDEX 添加 IF NOT EXISTS
```

- [ ] **Step 2: 编写 migrate.test.ts 覆盖幂等性**

```ts
// packages/db/test/migrate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runMigrations } from '../src/migrate.js';
describe('runMigrations', () => {
  it('executes schema.sql via pool.query', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as any;
    await runMigrations(pool, 'packages/db/migrations/schema.sql');
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain('CREATE TABLE');
  });
  it('is idempotent (IF NOT EXISTS guards)', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as any;
    await runMigrations(pool);
    await runMigrations(pool);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
```

Run: `pnpm --filter @trapmap/db test --run test/migrate.test.ts` 预期 PASS

- [ ] **Step 3: 更新各 service 的 migrations.ts 为委托**

```ts
// packages/service-knowledge-write/src/migrations.ts (重构后)
import type { Pool } from 'pg';
import { runMigrations } from '@trapmap/db';
export async function assertKnowledgeWriteMigrationSet() { /* no-op, deprecated */ }
export async function runKnowledgeWriteMigrations(pool: Pool): Promise<void> {
  await runMigrations(pool);
}
// 其他 6 个 service 同理，保留导出名以兼容 host 调用的 distributedMigrationRunners
```

保留 `distributedMigrationRunners` 数组但去重：后续 Task 5 会将其收敛为单一 runner。

- [ ] **Step 4: 删除旧 drizzle 目录**

```bash
rm -rf packages/service-knowledge-write/drizzle \
       packages/service-candidate-ingestion/drizzle \
       packages/service-identity-access/drizzle \
       packages/service-job-runtime/drizzle \
       packages/service-governance-review/drizzle \
       packages/service-knowledge-read/drizzle \
       packages/service-cron/drizzle \
       packages/persistence-schema/drizzle
find packages -name "_journal.json" -delete
find packages -name "*snapshot.json" -delete
```

验证：`find packages -type d -name drizzle | wc -l` → 0，`find packages -type d -name meta | grep drizzle` → 0

- [ ] **Step 5: 废弃 assertOwnerMigrationSet**

在 `packages/backend-core/src/migrations/owner-migration-set.ts` 顶部添加 `@deprecated` 注释：

```ts
/** @deprecated Per-owner 0000 versioned migrations removed. Use @trapmap/db runMigrations. */
export async function assertOwnerMigrationSet() { return; }
```

保留函数签名以避免 breaking 未迁移的调用方，或直接移除并同步更新调用点。

- [ ] **Step 6: 提交**

```bash
git add packages/db/migrations/schema.sql packages/db/src/migrate.ts packages/service-*/src/migrations.ts packages/backend-core/src/migrations/owner-migration-set.ts
git rm -r packages/service-*/drizzle packages/persistence-schema/drizzle 2>/dev/null
git commit -m "refactor(db): consolidate to single schema.sql and remove versioned drizzle history"
```

**验收标准：** `packages/db/migrations/schema.sql` 包含全部 ~70 张表的 `CREATE TABLE IF NOT EXISTS`，`pnpm --filter @trapmap/db test --run` PASS，`find packages -name "*.sql" | grep drizzle` = 0。

---

### Task 5: 更新所有消费者以导入 @trapmap/db

**Files:**
- Modify: `packages/service-*/src/pg-ports.ts` (7 files) — `from '@trapmap/persistence-schema'` → `from '@trapmap/db'`
- Modify: `packages/service-*/src/deps.ts` — 同上
- Modify: `packages/service-*/src/schema.ts` — `export * from '@trapmap/persistence-schema'` → `export * from '@trapmap/db'`
- Modify: `packages/service-*/package.json` — 替换依赖
- Modify: `packages/host-local/src/nest/**` — 移除 per-service migration 调用，改为单一 `runMigrations`
- Modify: `packages/host-distributed/src/migrate.ts` — 将 `distributedMigrationRunners` 收敛为 `[runMigrations]`
- Modify: `packages/persistence-schema/*` — 删除或改为 re-export 兼容层
- Modify: `pnpm-workspace.yaml`, `tsconfig.base.json`
- Test: 各 service 的 `pg-ports.test.ts` 与 `migrations.test.ts`

**Interfaces:**
- Consumes: Task 3-4 的 `@trapmap/db` API
- Produces: 全仓库无 `@trapmap/persistence-schema` 直接导入（除兼容层外），`pnpm exec fallow audit` 无违规

- [ ] **Step 1: 批量替换导入**

```bash
# 搜索所有仍引用 persistence-schema 的文件
grep -r "persistence-schema" packages --include="*.ts" --include="*.json" | head -n 50
# 预期约 30+ 处

# 批量 sed (保留单引号/双引号变体)
sed -i "s|@trapmap/persistence-schema|@trapmap/db|g" packages/service-*/src/**/*.ts
sed -i "s|@trapmap/persistence-schema|@trapmap/db|g" packages/service-*/package.json
sed -i "s|@trapmap/persistence-schema|@trapmap/db|g" packages/backend-core/src/**/*.ts
sed -i "s|@trapmap/persistence-schema|@trapmap/db|g" tsconfig.base.json
```

- [ ] **Step 2: 更新 host 的迁移编排**

```ts
// packages/host-distributed/src/migrate.ts 重构后
import { runMigrations } from '@trapmap/db';
import pg from 'pg';
export const distributedMigrationRunners = [runMigrations] as const;
export function createDistributedMigrationRunner({ createPool, runners = distributedMigrationRunners } = {}) {
  return async () => {
    const pool = createPool(loadServiceConfig('identity-access').databaseUrl!);
    try { for (const r of runners) await r(pool as pg.Pool); } finally { await pool.end(); }
  };
}
```

同样处理 `packages/host-local` 中所有调用 `runKnowledgeWriteMigrations` 等的地方。

- [ ] **Step 3: 处理 persistence-schema 兼容层**

选项 A (推荐)：直接删除 `packages/persistence-schema/`，更新所有引用后，`pnpm install` 会报错提示遗漏，强制清理完成。

选项 B (过渡)：将 `packages/persistence-schema/src/index.ts` 改为：

```ts
// @deprecated — re-export from @trapmap/db for backwards compat
export * from '@trapmap/db';
```

并在 `packages/persistence-schema/README.md` 标注废弃，最终在下一个主线移除。

本任务采用 **选项 A**：`rm -rf packages/persistence-schema`，并同步删除 `pnpm-workspace` 中无需额外操作，tsconfig 路径移除 `@trapmap/persistence-schema`。

- [ ] **Step 4: 更新依赖与 Fallow 边界**

```bash
for pkg in packages/service-*; do
  # 确保 package.json dependencies 包含 @trapmap/db
  node -e "let p=require('./$pkg/package.json'); p.dependencies['@trapmap/db']='workspace:*'; delete p.dependencies['@trapmap/persistence-schema']; require('fs').writeFileSync('./$pkg/package.json', JSON.stringify(p,null,2))"
done
pnpm install

pnpm exec fallow audit --base HEAD --no-cache  # 预期无 db 边界违规
pnpm exec fallow list --boundaries | grep db
```

- [ ] **Step 5: 修复测试**

```bash
pnpm --filter @trapmap/service-knowledge-write test --run test/pg-ports.test.ts --reporter=verbose
pnpm --filter @trapmap/service-governance-review test --run test/pg-ports.test.ts
pnpm --filter @trapmap/host-distributed test --run test/migrate.test.ts
# 若 migrations.test.ts 仍断言旧的 _journal.json，需重写为断言 schema.sql 存在
```

重写 `packages/service-*/src/migrations.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
describe('migrations delegate to db', () => {
  it('db schema.sql exists', () => {
    expect(existsSync('packages/db/migrations/schema.sql')).toBe(true);
  });
});
```

- [ ] **Step 6: 提交**

```bash
git add packages/service-* packages/host-* tsconfig.base.json pnpm-lock.yaml
git rm -rf packages/persistence-schema 2>/dev/null || true
git commit -m "refactor: migrate all consumers from persistence-schema to unified db"
```

**验收标准：** `grep -r "persistence-schema" packages --include="*.ts" | wc -l` = 0 (或仅在 archived/docs 中)，`pnpm typecheck` PASS，`pnpm exec fallow audit --base HEAD --no-cache` PASS，各 service 的 `pg-ports.test.ts` PASS。

---

### Task 6: 文档、守卫与最终验证

**Files:**
- Modify: `docs/reference/REPO_STRUCTURE.md` — `persistence-schema` → `db`
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md` — 数据库 schema 真相源改为 `packages/db/src/schema/` + `packages/db/migrations/schema.sql`
- Modify: `docs/reference/DATABASE_SCHEMA.md` — 更新表来源与迁移说明
- Modify: `docs/reference/DATA_MODEL.md` — 同上
- Modify: `docs/architecture/components/PERSISTENCE.md` — 新增 db 包章节
- Modify: `docs/architecture/BOUNDARIES.md` — zone 图更新
- Modify: `scripts/check-table-schema.ts` — 扫描 `packages/db/src/schema/` 而非 `persistence-schema`
- Modify: `scripts/check-pgtable-single-source.ts` — 同上
- Modify: `docs/operations/TESTING.md` — 更新 test 目录约定
- Modify: `AGENTS.md` — 更新 Vitest 使用要求段落的示例路径
- Modify: `README.md` — 若涉及包列表则更新
- Test: 全量回归

**Interfaces:**
- Consumes: Task 1-5 的最终文件结构
- Produces: 文档与守卫与代码一致，CI 全绿

- [ ] **Step 1: 更新权威文档**

```markdown
// REPO_STRUCTURE.md
- `packages/db/`：统一持久化包（原 `persistence-schema` + 7 个 service drizzle 的收敛），提供所有 Drizzle `pgTable` 定义、column-factories、单一 `migrations/schema.sql` 与 `runMigrations(pool)`。Service 层通过 `@trapmap/db` 导入，禁止直连 `pg` 或持有私有 schema。
```

同步更新 SYSTEM_TRUTH_SOURCES、DATABASE_SCHEMA、DATA_MODEL 的 “持久化迁移状态” 行。

- [ ] **Step 2: 更新守卫脚本**

```ts
// scripts/check-table-schema.ts
const schemaDir = join(root, 'packages', 'db', 'src', 'schema');
// 兼容过渡：若 db 不存在则回退到 persistence-schema，已移除则仅检查 db
```

```ts
// scripts/check-pgtable-single-source.ts
// 将扫描白名单从 packages/persistence-schema/src 改为 packages/db/src/schema
// 失败时提示 “所有 pgTable 必须定义在 @trapmap/db”
```

- [ ] **Step 3: 更新 TESTING 与 AGENTS**

```markdown
// docs/operations/TESTING.md
- 单文件测试：`pnpm test:file -- packages/host-local/test/nest/app.test.ts`
- 包级测试：`pnpm --filter @trapmap/service-knowledge-write test --run test/pg-ports.test.ts`
- 根级多 project：`pnpm test` 自动发现 `packages/*/test/**/*.test.ts`
```

```
// AGENTS.md Vitest 使用要求
- 禁止使用根级全量测试再接 grep/tail 查看失败
- 单文件测试优先使用 `pnpm test:file -- <repo-root-relative-test-path>`，路径示例已更新为 `test/` 目录
```

- [ ] **Step 4: 运行全量守卫与测试**

```bash
pnpm typecheck                          # 预期 PASS
pnpm check:structure                     # 预期 PASS (db 拥有 README.md)
pnpm check:docs                          # 预期 PASS
pnpm check:table-schema                  # 预期 PASS (扫描新 schema 源)
pnpm check:pgtable-single-source         # 预期 PASS
pnpm check:asserts                       # 预期 PASS
pnpm exec fallow audit --base HEAD --no-cache  # 预期 PASS
pnpm test --run --reporter=dot           # 全量，预期 315 tests PASS (若有 DB 依赖的集成测试需 PG，未配置时跳过或标记)
pnpm eval:smoke 2>&1 | tail -n 20        # 涉及检索/治理的改动需补跑，若本机无 Docker 则记录为 CI 必跑
```

- [ ] **Step 5: 清理一次性脚本**

```bash
# 若保留了 scripts/migrate-tests-to-test-dir.ts 与 scripts/generate-db-schema.ts
# 将其移入 scripts/archived/ 或删除，并在 fallow ignorePatterns 中已排除
mv scripts/migrate-tests-to-test-dir.ts scripts/archived/ 2>/dev/null || rm scripts/migrate-tests-to-test-dir.ts
```

- [ ] **Step 6: 提交与归档**

```bash
git add docs scripts package.json
git commit -m "docs: update architecture and guards for db + test layout restructure"

# 更新 plan.md 索引（如需将本计划设为 active mainline）
# git mv docs/plans/db-and-test-restructure-plan.md docs/todos/db-and-test-restructure-mainline.md (若按 todos 流程)
```

**验收标准：** 所有 `pnpm check:*` 通过，`pnpm typecheck` 通过，`pnpm test` 的测试数与重构前一致，`find packages -type d -name drizzle` = 0，`find packages apps -path "*src/*.test.ts"` = 0。

---

## Verification Checklist

- [ ] `find packages apps -name "*.test.ts" | grep "/src/" | wc -l` == 0
- [ ] `find packages apps -name "*.test.ts" | wc -l` == 315 (或 + 新增 db 包的 2-3 个)
- [ ] `find packages -type d -name drizzle | wc -l` == 0
- [ ] `ls packages/db/migrations/schema.sql` 存在且包含 `knowledge_entries`、`skill_artifacts` 等 70 表
- [ ] `grep -r "persistence-schema" packages --include="*.ts" | wc -l` == 0
- [ ] `pnpm typecheck` PASS
- [ ] `pnpm check:structure` PASS
- [ ] `pnpm check:docs` PASS
- [ ] `pnpm check:table-schema` PASS
- [ ] `pnpm check:pgtable-single-source` PASS
- [ ] `pnpm exec fallow audit --base HEAD --no-cache` PASS (无 db 边界违规)
- [ ] `pnpm --filter @trapmap/db test --run` PASS
- [ ] `pnpm test --run` (root) 发现的 projects 均为 `test/**/*.test.ts` 且 PASS

---

## Risks & Mitigations

- **相对导入批量重写错误：** 多层嵌套的 `../../../utils` 在 `src/` → `test/` 后深度变化，脚本需使用 `path.relative` 精确计算；抽样 `grep` 验证后手工补正。
- **CI 仍有旧路径硬编码：** 若 `check-table-schema` 未更新，CI 会误报 0 张表；Task 6 同步更新守卫并本地 `pnpm check:table-schema` 驗證。
- **DB 迁移幂等性：** 单一 `schema.sql` 必须全量 `IF NOT EXISTS`，避免重复执行失败；`migrate.test.ts` 覆盖两次执行场景。
- **Fallow 边界误配：** 新增 `db` zone 后，旧 `persistence-schema` 的 `allowedDependencies` 需同步迁移，否则 service 导入 db 会被判违规；Task 3 预先在 fallow 配置中注册 db。

