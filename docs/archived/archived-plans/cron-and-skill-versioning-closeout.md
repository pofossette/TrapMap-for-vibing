# Cron 调度服务 + Skill 版本控制 Closeout（归档）

> 归档日期：2026-08-16。本主线已合并完成，留存证据供历史参考。

## 交付物

### 工作流 1：cron 调度服务

- 新增 `packages/service-cron`：pg-owner bundle（全部 SQL 落位）+ `createCronScheduler`（轮询认领到期 job → `transport.task.enqueue(taskType, payload, { dedupeKey })`，失败保留 nextRunAt 下轮重试，per-tick try/catch 防瞬态 DB 错误崩溃进程，ownsWork 多实例安全，graceful stop）+ `createCronRouteDefs`（GET/POST `/cron/jobs`、GET/PATCH/DELETE `/cron/jobs/:id`、POST `/cron/jobs/:id/trigger`、GET `/cron/status`）+ server/deps/migrations。
- `@trapmap/lib` 新增 croner 依赖与薄封装（`cronNextRun`/`cronValidate`），全仓唯一直接引用点。
- `packages/contracts` 新增 `enum-types/cron.ts` 与 `domain/cron.ts`（cronJobSchema 等，timezone 默认 UTC，schedule↔timezone 联动 superRefine）。
- `packages/backend-core/src/cron/domain/schedule.ts`：纯函数（computeNextRun/isDue/applyRunSuccess/applyRunFailure/pauseJob/resumeJob/createInitialNextRun），零框架零 DB。
- `packages/persistence-schema/src/cron.ts`：cron_jobs 表（第 65 张），部分索引 `WHERE enabled`，DATABASE_SCHEMA.md 同步。
- 双宿主接线：host-local Nest `cron.module.ts` + scheduler provider（经 monolith 网关 `/v1/cron/*` 会话守卫暴露，杜绝 actor 伪造面）；host-distributed 注册 `'cron-scheduler'`（端口 4007，compose DNS 名一致），gateway 聚合转发，compose/prometheus/migrate/Dockerfile 全量同步。
- CLI：`trapmap cron list|add|edit|pause|resume|trigger|status`。

### 工作流 2：Skill 版本控制

- 源侧 semver：两个 SKILL.md frontmatter 增加 `version: 1.0.0`（+可选 author/license/compatibility/tags），`scripts/check-skills.ts` 守卫（raw frontmatter 读取、严格 semver 无前导零、git 历史单调性、首次引入容错），接入 `check:skills` + ci.yml（fetch-depth: 0）。
- DB：`skillArtifactRevisionSchema` 增加 `version` 可选字段；`artifact_revisions` 表加 version 列（迁移 0001）；导入链路从 frontmatter 读 version 写入 revision；`KnowledgeRevisionRecord`/`SkillArtifactRevisionRecord` 增加 version，版本经类型链可运行时到达检索层。
- 检索联动：`versionMatchMultiplier`（backend-core knowledge-read domain）——versioned+匹配 → matchMultiplier，versioned+不匹配 → mismatchMultiplier，**未知版本 → 中性 ×1（用户裁决）**，evergreen/无约束/禁用 → 1；检索服务层与 HTTP `retrievalMatchSchema` 暴露 `version`/`revision` 可选字段。
- CLI：`trapmap skill versions <name>`（revision 历史含 version）；history 端点形状修复（返回 SkillHistoryResponse object，两个命令统一解析）。

## 执行过程

- 双轨道并行（feature/cron-track + feature/skills-track，git worktree 隔离），SDD 全流程：8 任务 + 逐任务评审 + 3 轮修复循环 + 最终 whole-branch 评审 + 1 轮最终修复。
- 关键评审发现：compose DNS 不一致（Critical，修复）、monolith actor 伪造面（Important，修复为网关会话守卫）、scheduler 无 catch-all（Important，修复）、版本类型链死路（Important，修复）、history 形状分歧（Important，修复）。

## 验证证据

- 测试：service-cron 48/48（后 9/9 scheduler 专项）、host-local 24/24、host-distributed gateway 71/71、deployment-smoke 370/370、cli 557+542、contracts 921/921、knowledge-write 105/105、ranking 18/18、knowledge-read 83/83、check-skills 33/33。
- 守卫：typecheck、check:docs（doc-drift 65 表）、check:structure、check:asserts、check:table-schema、check:pgtable-single-source、fallow audit 全绿；eval:retrieval:smoke 无评分回退（本地无 Docker 时由 CI 覆盖）。

## Deferred（登记不实施，见 debt register）

- 检索召回池无 artifact 版本入口：`searchKnowledge` 只召回 `knowledge_entries`，`skillArtifacts` 无召回消费者——artifact version 在生产召回池仍不可达，直到 host artifact→entry 合并存在。
- web-panel 只读 cron 面板。
- skill 对外分发面（git tag + GitHub Release + marketplace）。
- cron_jobs.name 未建 UNIQUE 索引（spec 字面 vs 实现，无功能依赖）。
- distributed cron-scheduler 硬编码 postgres task transport（compose 当前一致）。
- 触发 dedupeKey 毫秒级碰撞（两个同毫秒 trigger 去重）。
- eval:smoke 需 Docker，CI 覆盖。

## 关键文件

- 设计规格：`docs/superpowers/specs/2026-08-16-cron-and-skill-versioning-design.md`
- 实施计划：`docs/superpowers/plans/2026-08-16-cron-and-skill-versioning.md`
