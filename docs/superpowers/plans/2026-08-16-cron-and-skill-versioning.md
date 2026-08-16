# Cron 调度包 + Skill 版本控制实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `packages/service-cron` 定时任务调度服务（投递现有 task_queue 执行），并为 Skill 工件落地源侧 semver 版本元数据、CI 守卫、CLI 版本感知与检索衰减联动。

**Architecture:** 两个独立工作流，文件所有权完全不相交，可并行实施（Track A = Task 1-4，Track B = Task 5-8）。Track A 以 `service-governance-review` 为模板新建 service-cron 包（RouteDef 工厂 + pg-owner bundle + server 装配 + 双宿主接入），Track B 扩展 contracts/技能源/检索评分/CLI。

**Tech Stack:** TypeScript (project references + vitest multi-project)、Zod、drizzle-orm (pgTable 单源)、croner（依赖声明于 @trapmap/lib）、fastify (backend-core adapter)、Nest (host-local)、biome + fallow + check:* 守卫。

## Global Constraints

- **仓库治理：** 跨包导入路径变更必须 `pnpm exec fallow audit --base main`；新增枚举/共享类型放到就近 `enum-types/` 目录并经 `index.ts` 聚合导出；禁止新增 `@ts-ignore`/`@ts-expect-error`/裸断言（`pnpm check:asserts` 拦截）；通用工具与第三方依赖一律经 `@trapmap/lib` 消费。
- **domain 纯净：** 业务规则/调度状态机必须落在 `packages/backend-core/src/cron/domain/`（纯函数、零框架、零 DB、零 SQL）；SQL 只允许出现在 `pg-ports` 层；infrastructure 层禁止新增业务判断。
- **RouteDef 单一事实：** 新 HTTP 路由必须走 `createCronRouteDefs(deps)` 工厂，host-local Nest 与 host-distributed gateway 均经 adapter 消费同一份 RouteDef，禁止手写重复路由。
- **表单源：** cron_jobs 表定义只允许一份（`packages/persistence-schema/src/cron.ts`），并同步 `docs/reference/DATABASE_SCHEMA.md`，`check:table-schema`、`check:pgtable-single-source` 必须全绿。
- **执行模型：** scheduler 只负责投递 task_queue（`transport.task.enqueue(taskType, payload, { dedupeKey })`），不做业务执行；重试/死信/租约复用 job-runtime 语义。
- **行为不变：** 除 cron 新增面与 skill 版本字段外，任何既有运行时语义不得改变；`decay.ts` 的 versioned 配置为只读消费，不修改。
- **版本模型：** 源侧 skill 版本为 semver（SKILL.md frontmatter `version` 字段），解析复用 `@trapmap/lib` 的 `parseFrontmatter`（gray-matter），不新增解析依赖；DB revision 的 `version` 字段为 semver 可选。
- **测试门禁：** 每任务至少运行相关包 focused tests + `pnpm typecheck`；涉及检索/摘要改动必须补 `pnpm eval:retrieval:smoke`；新守卫脚本接入后跑 `pnpm check:docs`、`pnpm check:structure`。
- **文档同步：** DATABASE_SCHEMA.md、DATA_MODEL.md、REPO_STRUCTURE.md、CLI.md、cli-index.md、TESTING.md 按 DOCUMENTATION_GOVERNANCE 同步；文档/目录变更跑 `pnpm check:docs`、`pnpm check:structure`。
- **分支约定：** Track A 工作分支 `feature/cron-track`，Track B 工作分支 `feature/skills-track`，均从 `feat/cron-and-skill-versioning` 派生；合并由 controller 完成。两个 track 的文件所有权不得交叉。

---

## Track A — cron 调度服务

### Task 1: cron 基础设施（lib 依赖 + contracts schema + backend-core domain + 表定义）

**Files:**
- Modify: `packages/lib/package.json`（新增 `croner` 依赖）
- Modify: `packages/lib/src/index.ts`（导出 cron 薄封装）
- Create: `packages/lib/src/cron.ts`（croner 薄封装：`cronNextRun(expression, from, timezone)`、`cronValidate(expression)`，带单元测试 `packages/lib/src/cron.test.ts`）
- Create: `packages/contracts/src/enum-types/cron.ts`（`CronJobStatus = 'enabled' | 'disabled'`、`CronRunOutcome = 'succeeded' | 'failed' | 'skipped'`）
- Create: `packages/contracts/src/domain/cron.ts`（`cronJobSchema`/`cronJobCreateInputSchema`/`cronJobUpdateInputSchema`/`cronJobStatusSnapshotSchema`，含 timezone 默认 UTC、schedule 字符串、payload 为 `z.record(z.string(), z.unknown())`）
- Modify: `packages/contracts/src/index.ts`（聚合导出新 schema 与枚举）
- Create: `packages/backend-core/src/cron/domain/schedule.ts`（纯函数：`computeNextRun`/`isDue`/`applyRunSuccess`/`applyRunFailure`/`pauseJob`/`resumeJob`/`createInitialNextRun`，通过 `@trapmap/lib` 的 cron 封装解析表达式）
- Create: `packages/backend-core/src/cron/domain/schedule.test.ts`
- Create: `packages/backend-core/src/cron/domain/index.ts`（域导出）与 Modify `packages/backend-core/src/index.ts`（聚合导出）
- Create: `packages/persistence-schema/src/cron.ts`（`cronJobs` pgTable，含 `nextRunAt` 部分索引 `WHERE enabled`，列含 id/name/schedule/timezone/taskType/payload/enabled/nextRunAt/lastRunAt/lastStatus/lastError/runCount + auditTimestamps）
- Modify: `packages/persistence-schema/src/index.ts`（导出 cron.ts）

**Interfaces:**
- Consumes: `parseFrontmatter` 模式（@trapmap/lib）、`taskQueueColumns`/`auditTimestamps`（column-factories）、zod 约定（domain/*.ts）
- Produces: `cronJobSchema`、`computeNextRun(schedule, from, timezone): Date`、`isDue(job, now): boolean`、`cronJobs` pgTable

**注意：** domain 内禁止 SQL/DB 引用；croner 只允许被 `packages/lib/src/cron.ts` 直接引用，其余包经 `@trapmap/lib` 导入。`cronJobUpdateInputSchema` 使用 `partial()` 语义且校验 schedule 变更时 timezone 联动。

- [ ] **Step 1:** `packages/lib/package.json` 增加 `croner` 依赖并 `pnpm install`；实现 `cronNextRun`/`cronValidate` 薄封装 + 单测（固定时区、跨周跨月、非法表达式抛错）
- [ ] **Step 2:** contracts 枚举与 schema（含单测：合法/非法 cron、默认 timezone、payload 校验）
- [ ] **Step 3:** backend-core domain 纯函数 + 单测（固定 now：首次调度、成功后推进、失败保留、pause/resume 语义）
- [ ] **Step 4:** persistence-schema `cronJobs` 表 + 同步 `docs/reference/DATABASE_SCHEMA.md`
- [ ] **Step 5:** `pnpm test:file -- packages/lib/src/cron.test.ts packages/contracts/src/domain/cron.test.ts packages/backend-core/src/cron/domain/schedule.test.ts` + `pnpm typecheck` + `pnpm check:table-schema` + `pnpm check:pgtable-single-source` 全绿

### Task 2: packages/service-cron 包（pg-ports + scheduler + routes + server + migrations）

**Files:**
- Create: `packages/service-cron/package.json`（name `@trapmap/service-cron`，依赖 contracts/backend-core/lib/persistence-schema/drizzle-orm/pg/zod，参考 `service-governance-review/package.json`）
- Create: `packages/service-cron/tsconfig.json`（project reference，参考同包）
- Create: `packages/service-cron/src/pg-ports.ts`（`createCronOwnerBundle(pool)`：create/list/get/update/pause/resume/delete/trigger/statusSnapshot，全部 SQL 落位此层；`id = prefixedId('cron_', 16)`）
- Create: `packages/service-cron/src/pg-ports.test.ts`
- Create: `packages/service-cron/src/scheduler.ts`（`createCronScheduler({ bundle, transport, pollIntervalMs, ownsWork })`：轮询认领到期 job（`FOR UPDATE SKIP LOCKED`）→ `transport.task.enqueue(taskType, payload, { dedupeKey })` → 调 `applyRunSuccess`/`applyRunFailure` 推进；`run()`/`stop()` 与 job-runtime consumer 同构；带 `Clock` 注入便于测试）
- Create: `packages/service-cron/src/scheduler.test.ts`（fake clock + fake transport + 内存 bundle，验证：到期投递、dedupeKey 格式、失败保留 nextRunAt、pause 不投递、并发认领单次）
- Create: `packages/service-cron/src/routes.ts`（`createCronRouteDefs(deps)`：GET/POST `/cron/jobs`、GET/PATCH/DELETE `/cron/jobs/:id`、POST `/cron/jobs/:id/trigger`、GET `/cron/status`；复用 `routeResponse`/`InvocationError` 模式）
- Create: `packages/service-cron/src/routes.test.ts`（参考 `service-governance-review/src/routes.test.ts` 的测试手法）
- Create: `packages/service-cron/src/deps.ts`（`createCronServiceModule(deps)` 装配，参考 governance-review deps.ts）
- Create: `packages/service-cron/src/server.ts`（`createCronServer(config, deps)` 经 `createFastifyServiceServer`，参考 governance-review server.ts）
- Create: `packages/service-cron/src/migrations.ts`（`runCronMigrations(pool)` + `assertCronMigrationSet`，参考 governance-review migrations.ts；drizzle 迁移文件放 `packages/service-cron/drizzle/`，表与 persistence-schema 单源一致）
- Create: `packages/service-cron/src/index.ts`（聚合导出）
- Modify: 根 `tsconfig.json`（加入 service-cron project reference）与根 `vitest.config.ts`（加入 `project('service-cron', './packages/service-cron')`）

**Interfaces:**
- Consumes: `cronJobSchema`/`computeNextRun`（Task 1）、`JobRuntimeAsyncTransport['task']`（@trapmap/service-job-runtime 类型）、`createFastifyServiceServer`、`prefixedId`
- Produces: `CronOwnerBundle`、`CronScheduler`、`CronRouteDefs`、`CronServer`、`createCronServiceModule`

**注意：** scheduler 使用 `transport.task.enqueue`，不要直接操作 task_queue 表；`trigger` 立即 enqueue 且**不**推进 nextRunAt（语义为手动额外执行）；`dedupeKey` 格式 `cron:{jobId}:{scheduledAt}`。

- [ ] **Step 1:** 包骨架（package.json/tsconfig）与 pg-ports（含测试：CRUD、pause/resume、trigger、statusSnapshot 计数）
- [ ] **Step 2:** scheduler（含测试：fake clock 到期投递、dedupeKey、失败保留、pause 跳过、stop 优雅）
- [ ] **Step 3:** routes（含测试：CRUD/trigger/status 各 route 成功与错误路径、鉴权透传）
- [ ] **Step 4:** deps/server/migrations + drizzle 迁移生成 + 根 tsconfig/vitest 注册
- [ ] **Step 5:** `pnpm --filter @trapmap/service-cron test --run src/*.test.ts` + `pnpm typecheck` + `pnpm exec fallow audit --base main`

### Task 3: 双宿主接线（host-local Nest + host-distributed + gateway + compose）

**Files:**
- Create: `packages/host-local/src/nest/cron/cron.module.ts`（Nest 模块消费 `createCronRouteDefs`，经 `createNestAdapter` 挂载；参考 `packages/host-local/src/nest/governance-review/governance-review.module.ts`）
- Create: `packages/host-local/src/nest/cron/cron.module.test.ts`
- Create: `packages/host-local/src/nest/cron/cron-scheduler.provider.ts`（runtime 启动时拉起 scheduler，SIGTERM/onModuleDestroy 停止；注入 `asyncTransport.task` 投递）
- Modify: `packages/host-local/src/nest/gateway/gateway.module.ts`（聚合 cron RouteDef）
- Modify: `packages/host-local/src/nest/runtime/host-services.ts`（`cronOwnerBundle` + `cronScheduler` 挂进 `HostLocalServices`）
- Modify: `packages/host-distributed/src/config/service-config.ts`（`ServiceName` 增加 `'cron-scheduler'`；`ALL_SERVICES`；`DEFAULT_PORTS['cron-scheduler'] = 4007`；`DEFAULT_INTERNAL_HOSTS`/`DISTRIBUTED_INTERNAL_HOSTS`；`InternalServiceUrls` 增加 `cronScheduler` 字段与 `buildInternalUrls` 分支）
- Create: `packages/host-distributed/src/cron-scheduler/server.ts` + `packages/host-distributed/src/cron-scheduler/start.ts`（`startCronService()` 经 `loadServiceConfig('cron-scheduler')` + `createServiceDatabase`，参考 `packages/host-distributed/src/governance-review/`）
- Modify: `packages/host-distributed/src/gateway/route-defs.ts`（聚合 cron RouteDef 转发）
- Modify: `packages/host-distributed/src/index.ts` 与 `apps/distributed/src/index.ts`（`startService` 分发 `'cron-scheduler'`）
- Modify: `apps/distributed/package.json`（如有 start:cron-scheduler 脚本则补充，参考 governance-review 的 start:governance-review）

**Interfaces:**
- Consumes: `createCronRouteDefs`、`createCronScheduler`、`HostLocalServices`、`ServiceName`
- Produces: host-local cron module + scheduler provider；distributed `cron-scheduler` 服务

**注意：** 检查 docker-compose 文件（`scripts/run-compose-runtime-closeout.sh` 引用的 compose 与 `.env`/ports 表）若有服务枚举需同步；scheduler 在 host-local 由 runtime boot 启动一次（`ownsWork: true`），distributed 由 cron-scheduler 进程启动。

- [ ] **Step 1:** host-local cron.module + scheduler provider + 测试
- [ ] **Step 2:** host-distributed config 注册 + cron-scheduler server/start
- [ ] **Step 3:** gateway route-defs 聚合 + startService 分发 + compose 检查
- [ ] **Step 4:** `pnpm test:deployment-smoke` + `pnpm --filter @trapmap/host-local test --run src/nest/cron` + `pnpm --filter @trapmap/host-distributed test --run src/gateway` + `pnpm typecheck`
- [ ] **Step 5:** `pnpm exec fallow audit --base main`

### Task 4: CLI cron 命令 + 文档同步

**Files:**
- Create: `apps/cli/src/commands/cron.ts`（`registerCronCommands(program)`：`cron list`、`cron add`、`cron edit`、`cron pause`、`cron resume`、`cron trigger`、`cron status`；复用现有 CLI http client 与输出模式，JSON 输出支持）
- Create: `apps/cli/src/commands/cron.test.ts`（mock http client，参考 `apps/cli/src/commands/review.test.ts`）
- Modify: `apps/cli/src/index.ts`（注册 `registerCronCommands`）
- Modify: `docs/architecture/CLI.md`（cron 命令族）
- Modify: `docs/reference/REPO_STRUCTURE.md`（service-cron 包条目）
- Modify: `docs/reference/DATA_MODEL.md`（cron_jobs 表条目，若该文件含表清单）
- Modify: `docs/operations/TESTING.md`（如需提及新包测试入口）

**Interfaces:**
- Consumes: `cronJobSchema` 相关 contract、CLI http client 模式
- Produces: `trapmap cron *` 命令族

**注意：** 命令参数名与 schema 对齐（`--schedule`/`--timezone`/`--task-type`/`--payload-json`/`--name`/`--enabled`），输出含 nextRunAt/lastRunAt 人类可读格式；`cron add` 后打印 nextRunAt 预览。

- [ ] **Step 1:** cron.ts 命令族实现 + 测试（add/list/edit/pause/resume/trigger/status）
- [ ] **Step 2:** 注册进 `apps/cli/src/index.ts` + CLI 文档同步
- [ ] **Step 3:** `pnpm --filter @trapmap/cli test --run src/commands/cron.test.ts` + `pnpm typecheck` + `pnpm check:docs` + `pnpm check:structure`

---

## Track B — Skill 版本控制

### Task 5: 源侧版本元数据 + check:skills 守卫

**Files:**
- Modify: `packages/skills/workflow-with-trapmap/SKILL.md`（frontmatter 增加 `version: 1.0.0` 与可选 `author`/`license`/`compatibility`/`tags`）
- Modify: `packages/skills/trapmap-cli-usage-guide/SKILL.md`（同上）
- Modify: `packages/skills/README.md`（说明版本元数据约定）
- Create: `scripts/check-skills.ts`（复用 `scripts/check-docs.ts` 的 tsx 脚本风格：遍历 `packages/skills/*/SKILL.md`，校验 frontmatter 存在合法 semver `version`；可选字段格式校验；与 git 历史最近一次合并版本比较做单调性检查——用 `git log -1 --format=%H -- <skill dir>` + `git show` 解析上次 version，版本回退即报错）
- Modify: `package.json`（根脚本 `"check:skills": "pnpm exec tsx scripts/check-skills.ts"`）
- Modify: `.github/workflows/ci.yml`（新增 `pnpm check:skills` 步骤）

**Interfaces:**
- Consumes: `parseFrontmatter`（@trapmap/lib，gray-matter）、现有 `scripts/check-docs.ts` 模式
- Produces: 带版本元数据的 skill 工件 + CI 守卫

**注意：** 单调性检查要容错（无历史版本时跳过）；frontmatter 解析用 `parseFrontmatter` 的现有导出能力，若其只返回 title/labels 则直接读 frontmatter 原文或扩展封装（lib 内），不得在脚本内重复解析。

- [ ] **Step 1:** 两个 SKILL.md + README 增加版本元数据
- [ ] **Step 2:** `scripts/check-skills.ts` 实现（格式 + 单调性）
- [ ] **Step 3:** 根脚本 + ci.yml 接入
- [ ] **Step 4:** `pnpm check:skills` 通过 + `pnpm check:docs` + `pnpm typecheck`

### Task 6: artifact revision version 字段 + import 映射

**Files:**
- Modify: `packages/contracts/src/domain/artifacts.ts`（`skillArtifactRevisionSchema` 增加 `version` 字段：semver 字符串可选；同步 `packages/contracts/src/domain/artifacts.test.ts` 对应用例——先查该 schema 现有测试位置）
- Modify: `packages/service-knowledge-write/src/artifact-derive-from-payloads.ts`（导入时从 SKILL.md frontmatter 读取 `version`，写入 revision 的 `version` 字段；无 version 时省略）
- Modify: `packages/service-knowledge-write/src/artifact-derive/parse-content.ts`（若需要扩展 `parseFrontmatter` 返回 version；注意保持 `lib` 封装不破坏现有导出）
- Modify: 对应测试文件（`packages/service-knowledge-write/src/*.test.ts` 中覆盖导入/派生的用例）

**Interfaces:**
- Consumes: `skillArtifactRevisionSchema`、`parseFrontmatter`、artifact import 链路（`artifact-bundle-import`）
- Produces: revision 携带 semver version；frontmatter version → revision 映射

**注意：** 行为兼容——无 version 的旧 SKILL.md 导入不失败；`sourceHash` 机制不变；version 与 sourceHash 任一变化均产生新 revision（若现有逻辑以 sourceHash 去重，保持之）。

- [ ] **Step 1:** contracts revision schema 增加 version 字段 + 测试
- [ ] **Step 2:** import/derive 链路映射 frontmatter version → revision
- [ ] **Step 3:** 相关测试更新 + `pnpm test:file -- packages/contracts/src/domain/artifacts.test.ts`（或实际测试路径）+ `pnpm --filter @trapmap/service-knowledge-write test --run src/*.test.ts` + `pnpm typecheck`

### Task 7: 检索暴露版本 + decay 降权联动

**Files:**
- Modify: `packages/backend-core/src/knowledge-read/domain/ranking.ts`（新增纯函数 `versionMatchMultiplier(artifactVersion, queryVersions, decayConfig)`：queryVersions 为 `boundaryContext.versions`（{package, version}），匹配/不匹配返回 `matchMultiplier`/`mismatchMultiplier`，非 versioned 类型或无穷制返回 1；对应单测）
- Modify: `packages/backend-core/src/knowledge-read/domain/ranking.test.ts`
- Modify: `packages/service-knowledge-read/src/retrieval-types.ts`（结果类型增加 `version`/`revision` 可选字段）
- Modify: `packages/service-knowledge-read/src/search-knowledge.ts` 与 `retrieval-semantic.ts`/`retrieval-recall-coordinator.ts`（评分时应用 multiplier；响应携带 version/revision）
- Modify: 对应测试（`retrieval-infra-default.test.ts`/`retrieval-orchestration.test.ts`/`search-knowledge.ts` 相关测试）

**Interfaces:**
- Consumes: `decay.ts` 的 `versioned` 配置（只读）、`boundaryContext.versions`、artifact `version`/`revision`
- Produces: 检索响应 version/revision 字段；versioned 类型按版本匹配降权

**注意：** 不修改 `decay.ts`；`queryVersions` 匹配语义：artifact version 等于任一查询 version 视为匹配；查询无 version 约束时 multiplier = 1；`multiplier` 的接入点以现有 ranking 管道结构为准（先查 ranking.ts 现有打分结构再接线）。

- [ ] **Step 1:** backend-core 纯函数 `versionMatchMultiplier` + 单测
- [ ] **Step 2:** service-knowledge-read 结果类型/响应暴露 version+revision
- [ ] **Step 3:** 评分管道接入 multiplier + 相关测试
- [ ] **Step 4:** `pnpm --filter @trapmap/backend-core test --run src/knowledge-read/domain/ranking.test.ts` + `pnpm --filter @trapmap/service-knowledge-read test --run src/retrieval*.test.ts`（或实际覆盖文件）+ `pnpm typecheck`
- [ ] **Step 5:** `pnpm eval:retrieval:smoke`（必要时 `pnpm eval:retrieval:core`）确认阈值不回退

### Task 8: CLI 版本感知 + 文档同步

**Files:**
- Modify: `apps/cli/src/commands/skill/index.ts`（注册 `versions` 子命令；`SkillCommandOptions` 扩展 `allowVersions` 或按现有 options 惯例）
- Create: `apps/cli/src/commands/skill/versions.ts`（`trapmap skills versions <name>`：显示 artifact 当前 version + revision 历史——revision 号/version/submittedAt/submittedBy/sourceHash；复用现有 history.ts 的取数模式）
- Create: `apps/cli/src/commands/skill/versions.test.ts`
- Modify: `apps/cli/src/commands/skill/history.ts` 或 `find.ts`/`formatters.ts`（`skills list`/`find` 输出增加 version 列，保持 JSON 输出兼容）
- Modify: `packages/skills/trapmap-cli-usage-guide/references/cli-index.md`（版本命令条目）
- Modify: `docs/guides/CLIENT_INTEGRATION.md`（如涉及激活/检索响应字段变化则同步）
- Modify: `docs/reference/DATA_MODEL.md`（artifact revision version 字段条目）

**Interfaces:**
- Consumes: artifact 检索/详情响应（Task 7 的 version/revision 字段）
- Produces: `trapmap skills versions <name>` + list 输出 version 列

**注意：** CLI 输出 JSON 模式不变（新字段追加不破坏既有解析）；`SkillCommandOptions` 变更时同步 `apps/cli/src/index.ts` 调用处与 skill/index.ts 的注册逻辑。

- [ ] **Step 1:** versions.ts 命令 + 测试
- [ ] **Step 2:** list/find 输出 version 列
- [ ] **Step 3:** cli-index.md + DATA_MODEL.md + CLIENT_INTEGRATION.md 同步
- [ ] **Step 4:** `pnpm --filter @trapmap/cli test --run src/commands/skill` + `pnpm typecheck` + `pnpm check:docs` + `pnpm check:structure`

---

## 收尾（controller 执行）

- 合并 `feature/cron-track` 与 `feature/skills-track` 到 `feat/cron-and-skill-versioning`，解决 index.ts 聚合导出等小型冲突。
- 根级验证：`pnpm typecheck` + `pnpm check:asserts` + `pnpm check:table-schema` + `pnpm check:pgtable-single-source` + `pnpm check:docs` + `pnpm check:structure` + `pnpm exec fallow audit --base main`。
- 全量 `pnpm test`（按 AGENTS.md 只在与改动相关的范围内跑必要集合；Track B 检索改动补 `pnpm eval:smoke`）。
- 更新 `plan.md` 主索引与 `docs/todos/`（新主细则，标题如 "cron 调度服务 + skill 版本控制"），归档说明写入文档治理规则。
