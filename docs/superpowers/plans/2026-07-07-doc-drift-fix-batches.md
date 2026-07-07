# 文档漂移修复批次实施计划

> **供智能体执行：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行本计划。步骤使用复选框语法 `- [ ]` 跟踪。

**Goal:** 分四批修复当前已确认的文档漂移、事实偏差和中文化缺口，并保持 `docs/todos/doc-drift-fix-list.md` 与代码真相一致。

**Architecture:** 本计划按文档写入范围拆成四个独立批次。每个批次只修改一组不重叠的文档，并在批次内完成最小验证。所有事实以源码、`package.json`、`.github/workflows/ci.yml`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/reference/REPO_STRUCTURE.md` 为准。

**Tech Stack:** Markdown、pnpm、Node.js 24、仓库内文档守卫脚本

## Global Constraints

- 所有新增或改写文案必须使用简体中文；若原文是英文且本批次触及该文件，顺手完成中文化，不保留新的英文段落。
- 只修复 `docs/todos/doc-drift-fix-list.md` 已列出的事实漂移、断链、术语偏差和重复标题，不扩展到未确认的“可改进项”。
- 文档事实必须与当前源码、`package.json`、`.github/workflows/ci.yml`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/reference/REPO_STRUCTURE.md` 保持一致。
- 不得引入第二套术语；涉及 runtime/profile/host/service 的命名必须复用现有 truth source。
- 每个任务结束时只运行与该批次直接相关的最小验证命令，不跑根级全量测试。

---

### Task 1: 修复入口与事实源批次

**Files:**
- Modify: `packages/host-distributed/README.md`
- Modify: `docs/architecture/ARCHITECTURE.md`
- Modify: `docs/architecture/DEPLOYMENT.md`
- Modify: `docs/reference/DOCS_TRUTH_MATRIX.md`

**Interfaces:**
- Consumes: `docs/todos/doc-drift-fix-list.md` 中 H-01 至 H-04 的问题定义；`packages/host-distributed/src/index.ts`、`packages/host-distributed/package.json`、`packages/host-local/src/nest/**`、`package.json`、`.github/workflows/ci.yml`
- Produces: 已修正的入口职责描述、默认宿主事实、Node/pnpm 基线和 truth-matrix 链接

- [ ] **Step 1: 逐文件核对权威源**

Run: `rtk rg -n "knowledge-read|Fastify 宿主|Node.js 20\\+|docs/todos/trapmap-architecture-remediation-plan.md" packages/host-distributed/README.md docs/architecture/ARCHITECTURE.md docs/architecture/DEPLOYMENT.md docs/reference/DOCS_TRUTH_MATRIX.md`
Expected: 命中当前待修表述，便于逐项替换

- [ ] **Step 2: 更新文档事实**

要求：
- `packages/host-distributed/README.md` 明确写成分布式宿主装配层，覆盖 `gateway + 六个服务入口`
- `docs/architecture/ARCHITECTURE.md` 把默认主线改为 `packages/host-local/src/nest/**`，Fastify 收口为 compatibility shell
- `docs/architecture/DEPLOYMENT.md` 统一写成 Node `24` + pnpm `10.33.0`
- `docs/reference/DOCS_TRUTH_MATRIX.md` 改成真实存在的路径

- [ ] **Step 3: 校验改动结果**

Run: `rtk pnpm check:structure`
Expected: PASS

- [ ] **Step 4: 校验文档守卫**

Run: `rtk pnpm check:docs-drift`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/host-distributed/README.md docs/architecture/ARCHITECTURE.md docs/architecture/DEPLOYMENT.md docs/reference/DOCS_TRUTH_MATRIX.md
git commit -m "docs: fix doc truth entry batch"
```

### Task 2: 修复源码路径与事实源同步批次

**Files:**
- Modify: `packages/contracts/README.md`
- Modify: `packages/server/README.md`
- Modify: `packages/server/src/routes/README.md`
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: `docs/todos/doc-drift-fix-list.md` 中 M-01 至 M-05 与 L-01 的问题定义；`packages/contracts/src/index.ts`、`packages/contracts/src/domain/`、`packages/server/src/routes/`、`packages/server/src/bootstrap/run-startup-sequence.ts`
- Produces: 已修正的路径说明、路由组说明、schema 清单、表数量文案与启动阶段描述

- [ ] **Step 1: 逐文件核对路径与数量**

Run: `rtk rg -n "src/types/|57 张表|5 阶段|feedback-admin|labels.ts" packages/contracts/README.md packages/server/README.md packages/server/src/routes/README.md docs/reference/SYSTEM_TRUTH_SOURCES.md docs/README.md`
Expected: 命中当前待修表述

- [ ] **Step 2: 更新文档事实并完成中文化**

要求：
- 删除或替换 `src/types/` 为真实入口
- `packages/server/README.md` 同时完成简体中文化
- `packages/server/src/routes/README.md` 补 `feedback-admin`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md` 纳入 `labels.ts` 或改成稳态描述
- `docs/README.md` 的表数量统一为 `63 张表`
- `packages/server/README.md` 的启动阶段数改准确，或改成不写死数量

- [ ] **Step 3: 校验文档守卫**

Run: `rtk pnpm check:docs-drift`
Expected: PASS

- [ ] **Step 4: 校验链接**

Run: `rtk pnpm check:links`
Expected: PASS 或仅剩与本任务无关的既有告警

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/README.md packages/server/README.md packages/server/src/routes/README.md docs/reference/SYSTEM_TRUTH_SOURCES.md docs/README.md
git commit -m "docs: align readmes and truth sources"
```

### Task 3: 修复架构术语与中文化批次

**Files:**
- Modify: `docs/architecture/OBSERVABILITY.md`
- Modify: `docs/architecture/SERVICE-DISCOVERY.md`
- Modify: `docs/architecture/SERVICE_BOUNDARIES.md`
- Modify: `docs/guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md`
- Modify: `packages/server/src/lib/README.md`
- Modify: `packages/backend-core/README.md`
- Modify: `docs/architecture/MODULE_STRUCTURE.md`

**Interfaces:**
- Consumes: `docs/todos/doc-drift-fix-list.md` 中 M-07 至 M-10 与“简体中文翻译处理清单”；`packages/server/src/app.ts`、`packages/host-distributed/src/shared/telemetry.ts`、`packages/host-local/src/nest/service-discovery/`、各 `service-*` 包目录
- Produces: 已修正的 OTEL 开关语义、服务发现归属、service 计数、去重后的 checklist 标题和中文化文档

- [ ] **Step 1: 逐文件核对待修表述**

Run: `rtk rg -n "OTEL_ENABLED|service-discovery/|前五个物理|Blocking gaps:|^#|README" docs/architecture/OBSERVABILITY.md docs/architecture/SERVICE-DISCOVERY.md docs/architecture/SERVICE_BOUNDARIES.md docs/guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md packages/server/src/lib/README.md packages/backend-core/README.md docs/architecture/MODULE_STRUCTURE.md`
Expected: 命中待修位置和英文标题

- [ ] **Step 2: 更新术语并完成中文化**

要求：
- `OBSERVABILITY.md` 全文改成 `OTEL_DISABLED` 语义
- `SERVICE-DISCOVERY.md` 改正服务注册归属
- `SERVICE_BOUNDARIES.md` 改为六个 `service-*`
- `MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md` 删除重复 `Blocking gaps:`
- `packages/server/src/lib/README.md`、`packages/backend-core/README.md`、`docs/architecture/MODULE_STRUCTURE.md` 完成简体中文化，且不引入事实漂移

- [ ] **Step 3: 校验 Markdown 与链接**

Run: `rtk pnpm check:md-lint`
Expected: PASS

- [ ] **Step 4: 校验文档守卫**

Run: `rtk pnpm check:docs-drift`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/OBSERVABILITY.md docs/architecture/SERVICE-DISCOVERY.md docs/architecture/SERVICE_BOUNDARIES.md docs/guides/MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md packages/server/src/lib/README.md packages/backend-core/README.md docs/architecture/MODULE_STRUCTURE.md
git commit -m "docs: fix architecture wording and zh-cn docs"
```

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
