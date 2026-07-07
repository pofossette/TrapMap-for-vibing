# Task 1 文档修复报告

## 任务范围

- 写入范围：`packages/host-distributed/README.md`
- 写入范围：`docs/architecture/ARCHITECTURE.md`
- 写入范围：`docs/architecture/DEPLOYMENT.md`
- 写入范围：`docs/reference/DOCS_TRUTH_MATRIX.md`
- 需求来源：`.superpowers/sdd/task-1-brief.md`

## 已完成修复

### H-01 `packages/host-distributed/README.md`

- 将入口职责修正为“分布式宿主装配层”。
- 明确当前覆盖 `gateway + 六个服务入口`，不再把 `host-distributed` 描述成仅承载 `knowledge-read` 的薄宿主。

### H-02 `docs/architecture/ARCHITECTURE.md`

- 将默认主线修正为 `packages/host-local/src/nest/**`。
- 明确 `packages/server` 当前只保留 Fastify compatibility shell 与 shared runtime/status seam，不再描述为默认宿主主线。

### H-03 `docs/architecture/DEPLOYMENT.md`

- 将本地开发前置条件修正为 Node.js `24` 与 pnpm `10.33.0`。
- 口径对齐 `package.json` 与 `.github/workflows/ci.yml`。

### H-04 `docs/reference/DOCS_TRUTH_MATRIX.md`

- 将失效路径 `docs/todos/trapmap-architecture-remediation-plan.md` 修正为真实存在的 `docs/archived/archived-plans/trapmap-architecture-remediation-plan.md`。

## 核对依据

- `packages/host-distributed/src/index.ts`
- `packages/host-local/src/nest/**`
- `package.json`
- `.github/workflows/ci.yml`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/reference/REPO_STRUCTURE.md`
- `docs/todos/doc-drift-fix-list.md`

## 最小验证

### 通过

- `rtk pnpm check:structure`

### 未通过

- `rtk pnpm check:docs-drift`

失败原因：

- 当前仓库存在 33 条文档漂移守卫失败，涉及 `docs/reference/SYSTEM_TRUTH_SOURCES.md`、`docs/guides/MIGRATION_GUIDE.md`、`docs/reference/REPO_STRUCTURE.md`、`docs/operations/OBSERVABILITY-VERIFICATION.md`、`docs/reference/DATABASE_SCHEMA.md`、`docs/architecture/TARGET_ARCHITECTURE.md`、`docs/architecture/SERVICE_BOUNDARIES.md` 等超出本任务写入范围的文件。
- 本次未修改上述文件，因此未在当前任务内处理这些失败项。

## 风险与关注点

- 本批 4 个目标文档的已登记漂移已修正，但仓库级 `check:docs-drift` 仍因其他批次未收口文档而失败。
- 由于用户明确限制写入范围，本次没有扩展修复 `ARCHITECTURE.md` 中其他已登记但未纳入 Task 1 的漂移项。
