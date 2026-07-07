### Task 4: 修复指南与运维文档批次

**Files:**
- Modify: `docs/guides/GETTING_STARTED.md`
- Modify: `docs/guides/MIGRATION_GUIDE.md`
- Modify: `docs/operations/ENVIRONMENT.md`
- Modify: `docs/operations/CI_CD.md`
- Modify: `docs/operations/OBSERVABILITY-OPERATIONS.md`

**Interfaces:**
- Consumes: `docs/todos/doc-drift-fix-list.md` 中 H-05 至 H-09、M-11 至 M-15、L-03；`package.json`、`.github/workflows/ci.yml`、`packages/host-distributed/package.json`、`packages/host-distributed/src/index.ts`、相关 observability/runtime 源码
- Produces: 已同步的入门版本要求、迁移指南服务树与命令、环境变量事实、CI 命令说明、可观测性运维变量与 retention 口径

- [ ] **Step 1: 逐文件核对待修表述**

Run: `rtk rg -n "Node.js|PostgreSQL|service-knowledge-read|dev:server:compat|TRAPMAP_EVAL_PLATFORM|fail-on-regression|retention|OTEL_ENABLED|OTEL_SAMPLING_RATE|OTEL_TRACES_EXPORTER|OTEL_LOGS_EXPORTER|LOKI_URL" docs/guides/GETTING_STARTED.md docs/guides/MIGRATION_GUIDE.md docs/operations/ENVIRONMENT.md docs/operations/CI_CD.md docs/operations/OBSERVABILITY-OPERATIONS.md .github/workflows/ci.yml`
Expected: 命中当前待修表述

- [ ] **Step 2: 更新事实并保持简体中文**

要求：
- `GETTING_STARTED.md` 改成 Node 24，并弱化“PostgreSQL 默认”成推荐姿态
- `MIGRATION_GUIDE.md` 补 `service-knowledge-read`，删除过时 compat 脚本
- `ENVIRONMENT.md` 把 `TRAPMAP_EVAL_PLATFORM` 标成规划/占位或移出当前生效区
- `CI_CD.md` 改正 fallow 命令、coverage 保留期和 Node 版本口径
- `OBSERVABILITY-OPERATIONS.md` 统一到当前 OTEL / Loki 变量和真实 retention 事实

- [ ] **Step 3: 校验文档守卫**

Run: `rtk pnpm check:docs-drift`
Expected: PASS

- [ ] **Step 4: 校验链接与 Markdown**

Run: `rtk pnpm check:links`
Expected: PASS 或仅剩与本任务无关的既有告警

Run: `rtk pnpm check:md-lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/guides/GETTING_STARTED.md docs/guides/MIGRATION_GUIDE.md docs/operations/ENVIRONMENT.md docs/operations/CI_CD.md docs/operations/OBSERVABILITY-OPERATIONS.md
git commit -m "docs: sync guides and operations facts"
```
