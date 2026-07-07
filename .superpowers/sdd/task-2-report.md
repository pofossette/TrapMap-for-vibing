# Task 2 文档修复报告

## 任务范围

- 仅修改以下文档：
  - `packages/contracts/README.md`
  - `packages/server/README.md`
  - `packages/server/src/routes/README.md`
  - `docs/reference/SYSTEM_TRUTH_SOURCES.md`
  - `docs/README.md`

## 已完成项

1. `packages/contracts/README.md`
   - 删除不存在的 `src/types/` 导航
   - 改为指向真实入口 `src/index.ts`、`src/domain/` 与 `enum-types/`
   - 顺手把本次触及段落中文化，未新增英文段落
2. `packages/server/README.md`
   - 删除不存在的 `src/types/` 目录说明
   - 将 `run-startup-sequence.ts` 改为源码一致的 6 个启动步骤描述
   - 按任务要求完成 README 中文化
3. `packages/server/src/routes/README.md`
   - 补充 `routes/feedback-admin/` 路由组与职责
   - 将全文改为简体中文表述
4. `docs/reference/SYSTEM_TRUTH_SOURCES.md`
   - 在 schema 数量事实源中补入 `labels.ts`
5. `docs/README.md`
   - 将两处数据库表数量从 `57 张表` 改为 `63 张表`

## 事实核对依据

- `packages/contracts/src/index.ts`
- `packages/contracts/src/domain/`
- `packages/server/src/routes/`
- `packages/server/src/bootstrap/run-startup-sequence.ts`
- `packages/server/src/lib/persistence/schema/index.ts`

## 最小验证

1. `rtk pnpm check:docs-drift`
   - 结果：失败
   - 说明：失败项为仓库内既有、且超出 Task 2 写入范围的全局文档守卫问题，不是本批次新增问题
   - 典型范围：
     - `docs/reference/SYSTEM_TRUTH_SOURCES.md` 仍缺少多条守卫要求的英文锚点短语
     - `docs/guides/MIGRATION_GUIDE.md`、`docs/reference/REPO_STRUCTURE.md`、`docs/operations/OBSERVABILITY-VERIFICATION.md`、`docs/reference/DATABASE_SCHEMA.md`、`docs/architecture/TARGET_ARCHITECTURE.md`、`docs/architecture/SERVICE_BOUNDARIES.md` 存在范围外失败
   - 本批次相关结论：本次修复的路径、路由组、schema 清单和表数量更新已落地，但仓库当前无法在不越界修改其他文档的前提下让该守卫通过
2. `rtk pnpm check:links`
   - 结果：通过

## 提交说明

- 计划提交信息：`docs: align readmes and truth sources`

## 风险与关注点

- `check:docs-drift` 当前由多份范围外文档阻塞；如果后续要求“本批次必须绿灯”，需要由对应任务补齐这些守卫短语或同步更新守卫规则
- `packages/server/README.md` 与 `packages/server/src/routes/README.md` 仍保留少量代码标识级英文术语，例如 `runtime`、`operator`、`remediation`；本次未引入新的英文段落，且与现有 truth source 命名保持一致
