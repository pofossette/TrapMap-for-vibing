# Cron 调度包 + Skill 版本控制设计规格

> 日期：2026-08-16。范围：两个独立工作流，合并为一个实施计划执行。

## 背景

- 项目已有成熟异步任务面（`task_queue` + `domain_event_outbox`，Postgres/RabbitMQ 双通道，租约/心跳/回收/死信/重试），但**无定时调度面**。
- Skill 工件在 DB 内已有 revision 机制（`skillArtifactRevisionSchema`：单调 revision + sourceHash + 文件快照），但**源侧（packages/skills）无版本元数据、无校验、无检索联动**。

## 工作流 1：cron 调度包

**决策（已确认）：**
- 落点：独立服务包 `packages/service-cron`，注册进 `ServiceName`（`cron-scheduler`，端口 4007），host-local 与 host-distributed 双宿主接入。
- 表达式：完整 cron 表达式，`croner` 依赖**声明在 @trapmap/lib**（仓库规则：第三方通用依赖统一经 lib 消费）。
- 执行模型：到期时向现有 `task_queue` 投递（`taskType` + 静态 JSON payload），由 job-runtime worker 执行；重试/死信/租约全复用。
- 管理面：RouteDef 管理路由 + CLI 命令全量（web-panel 只读面板记入 deferred）。

**结构：**
```
@trapmap/lib               + croner 依赖 + 薄封装（cronNextRun/cronValidate）
@trapmap/contracts         + enum-types/cron.ts + domain/cron.ts（Zod schema）
@trapmap/backend-core      + cron/domain/schedule.ts（纯函数：computeNextRun/isDue/状态机）
@trapmap/persistence-schema+ cron_jobs 表（pgTable 单源，同步 DATABASE_SCHEMA.md）
packages/service-cron      + pg-ports / routes / server / scheduler / deps / migrations / index
```

**数据模型 `cron_jobs`：** id（cron_ 前缀）、name（unique）、schedule（cron 表达式）、timezone（默认 UTC）、taskType、payload（jsonb）、enabled、nextRunAt、lastRunAt/lastStatus/lastError/runCount、审计列。部分索引：`WHERE enabled AND next_run_at <= now`。

**调度器 `createCronScheduler`：** 轮询认领到期 job（`FOR UPDATE SKIP LOCKED`）→ `transport.task.enqueue(taskType, payload, { dedupeKey: jobId+scheduledAt })` → 成功推进 nextRunAt（`computeNextRun(schedule, now)`）、更新 lastRunAt/runCount；失败记录 lastError 保留 nextRunAt 下轮重试。`ownsWork` 多实例安全；SIGTERM 优雅停止。

**路由（createCronRouteDefs）：** GET/POST /cron/jobs、GET/PATCH/DELETE /cron/jobs/:id、POST /cron/jobs/:id/trigger、GET /cron/status。

**CLI：** `trapmap cron list|add|edit|pause|resume|trigger|status`。

## 工作流 2：Skill 版本控制

**决策（已确认）：**
- 源侧版本元数据 + CI 校验；CLI/交互版本感知；检索与衰减联动。不包含对外分发（tag/marketplace，记入 deferred）。
- 版本号模型：**semver frontmatter**（SKILL.md 增加 `version` 字段，复用 `@trapmap/lib` 的 parseFrontmatter/gray-matter）。
- 联动：检索响应暴露 version/revision；查询 seed 复用 `boundaryContext.versions`；`versioned` freshness 类型按 decay versioned 配置（matchMultiplier/mismatchMultiplier）降权。

**结构：**
- `packages/skills/*/SKILL.md` frontmatter 增加 version（semver，强制）+ 可选 author/license/compatibility/tags。
- `scripts/check-skills.ts` + 根脚本 `check:skills`：格式合法 + git 历史单调性（防回退），接入 ci.yml。
- `skillArtifactRevisionSchema` 扩展 `version` 字段（semver 可选）。
- import 联动：frontmatter version 写入 artifact revision；version 或 sourceHash 变化产生新 revision。
- 检索响应暴露 `version` + `revision`；评分降权纯函数落在 backend-core knowledge-read domain（`ranking.ts` 邻域），service-knowledge-read 消费。
- CLI：`trapmap skills list` 输出 version 列 + 新增 `trapmap skills versions <name>`。

## 风险控制

- 检索评分改动必须跑 `pnpm eval:retrieval:smoke` + retrieval core tier，确认阈值不回退。
- 新表必须过 `check:table-schema`、`check:pgtable-single-source`、`check:asserts`；跨包边界过 `fallow audit --base main`。
- croner 依赖进 @trapmap/lib 需同步 lib 单测与边界审计。
- 文档同步：DATABASE_SCHEMA.md、DATA_MODEL.md、REPO_STRUCTURE.md、CLI.md、cli-index.md、TESTING.md，按 DOCUMENTATION_GOVERNANCE。

## Deferred（登记不实施）

- web-panel 只读 cron 面板。
- skill 对外分发面（git tag + GitHub Release + marketplace）。
- cron 表达式 → next_run_at 的 DST/时区边角问题专项（croner 兜底）。
