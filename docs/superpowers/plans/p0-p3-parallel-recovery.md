# P0-P3 Parallel Recovery — Experience Gene Closeout + Debt Liquidation

> **执行模型：** Subagent-Driven Development 高并行版。根 `plan.md` 当前 active 为 `experience-gene-program-mainline`，本计划作为其 closeout + 债务并行清算的 umbrella tranche，所有任务在同一分支内按文件分区并行推进，最终统一过 `check:*` 与 final review 后再归档 Gene 主线并切 Web Panel。
> **并行原则：** 按 `fallow zone / service owner` 分区独占文件，宿主间通过 RouteDef 工厂收敛，避免 git 冲突；每任务独立 subagent + 独立 review，控制器串行合账。

## Global Constraints（所有子代理必守）
- 共享类型/Schema以 `packages/contracts/src/index.ts` 和 `packages/contracts/src/domain/` 为准；新增枚举入 `enum-types/` 并经 `index.ts` 聚合。
- 新 HTTP 路由必经 `create<X>RouteDefs(deps)` 工厂，由 `createNestAdapter`/`createFastifyAdapter` 消费，禁止宿主手写重复实现。宿主入口：`packages/host-local/src/nest/app.module.ts` + `packages/host-distributed/src/gateway/*` / `packages/host-distributed/src/config/service-config.ts`。
- 通用工具复用 `@trapmap/lib`；禁止重复实现已有 helper。
- PG表唯一事实源在 `packages/persistence-schema/src/` + `packages/service-*/src/schema.ts`，经 `pnpm check:table-schema` + `pnpm check:pgtable-single-source` 守卫。
- 命令统一 `pnpm`：`pnpm typecheck`、`pnpm check:docs`、`pnpm check:structure`、`pnpm exec fallow audit --base HEAD --no-cache`（增量）与 `--base main --ci`（全量基线）。
- 每个任务结束必须跑其 `Test plan` 声明的 focused tests + typecheck，提交信息 `feat|fix|chore(<scope>): <subject>`。

## 任务分区与并行批次

### Batch 1 — 完全并行（5 轨道，无文件交集）
| Task | 标题 | Owner文件分区 | 依赖 |
|------|------|---------------|------|
| T1 | P0-Gene活证据与Fallow基线裁决 | `docs/todos/experience-gene-*`、`docs/todos/open-debt-and-compromises.md`、`scripts/complexity-budgets.json`、`.github/workflows/ci.yml` | 无 |
| T2 | P1-WebPanel Admin Contracts（共享Zod） | `packages/contracts/src/domain/admin.ts` + `packages/contracts/src/enum-types/admin.ts` + `packages/contracts/src/index.ts` | 无 |
| T3 | P2-Route表漂移对账（文档侧） | `docs/reference/api-surface.md`、`docs/architecture/components/ARTIFACTS.md`、`scripts/check-route-surface.ts`、`.jscpd.json` 等 | 无（只改文档与守卫例外） |
| T4 | P2-DeadCode Closeout归档 | `docs/todos/dead-code-and-architecture-order-cleanup.md` → `docs/archived/archived-plans/`、`docs/archived/README.md`、`docs/todos/README.md`、`docs/todos/open-debt-and-compromises.md` | 无 |
| T5 | P3-Security候选可达性与audit基线 | `docs/archived/reports/SECURITY_CANDIDATES_2026-08-22.md`、`package.json`、`pnpm-lock.yaml`（只读审计） | 无 |

### Batch 2 — 依赖 Batch1 完成（3 轨道，并行）
| Task | 标题 | Owner文件分区 | 依赖 |
|------|------|---------------|------|
| T6 | P1-WebPanel Real Admin RouteDefs（service侧） | `packages/service-governance-review/src/routes.ts`、`packages/service-knowledge-write/src/routes.ts`、`packages/service-knowledge-read/src/routes.ts` 等 owner routes | T2 |
| T7 | P2-Gateway Parity补齐（宿主侧） | `packages/host-local/src/nest/**`、`packages/host-distributed/src/gateway/**`、`packages/host-distributed/src/config/service-config.ts` | T2,T6 |
| T8 | P0-Eval Smoke补跑与CI联动 | `scripts/run-eval.ts`、`evals/**`、`docker-compose.yml`、`docker-compose.closeout.yml`、`.github/workflows/eval.yml` | T1 |

### Batch 3 — 依赖 Batch2（2 轨道，并行）
| Task | 标题 | Owner文件分区 | 依赖 |
|------|------|---------------|------|
| T9 | P1-WebPanel面板接线与RBAC回填 | `apps/web-panel/src/**`（services/api/*, stores/*, pages/*, app/router/*） | T2,T6,T7 |
| T10 | P3-平台L3运营验证（kind/amqp/双库） | `k8s/base/*`、`packages/service-job-runtime/src/**`、`docs/architecture/DEPLOYMENT.md`、`docs/architecture/SERVICE-DISCOVERY.md`、`docs/operations/ENVIRONMENT.md` | T7 |

## 详细任务定义

### T1 — P0 Gene活证据与Fallow基线裁决
- **输入：** `docs/todos/experience-gene-program-mainline.md:68` 两个未关gate；`docs/todos/experience-gene-infrastructure-foundation.md:240` 的 `--base main` 145文件35 clone vs `--base HEAD` pass 的分歧。
- **动作：**
  1. 在 `experience-gene-program-mainline.md` Problem pool 冻结审计基线决策：采用 `git merge-base main HEAD` 作为 activation-commit 基线，并说明等价于 PR merge-base；在 `experience-gene-infrastructure-foundation.md#Problem pool` 更新进入条件已满足。
  2. 补 `pnpm exec fallow audit --base HEAD --no-cache` 通过证据到 Execution record；`pnpm eval:smoke` 与 `pnpm eval:experience-gene --tier core --mode serve` 的本地 Docker 门控写入 `open-debt-and-compromises.md` 的已验证/仍门控分段，明确 CI 必跑。
  3. 跑 `pnpm typecheck && pnpm check:docs && pnpm check:structure && pnpm exec fallow audit --base HEAD --no-cache && pnpm eval:experience-gene --tier smoke --mode shadow` 留证据。
- **输出：** 主细则 gate 可勾选，文档一致。
- **Test plan：** `pnpm typecheck`、`pnpm check:docs`、`pnpm check:structure`、`pnpm exec fallow audit --base HEAD --no-cache`、`pnpm eval:experience-gene --tier smoke --mode shadow`（3 cases precision 1.0）。

### T2 — P1 WebPanel Admin Contracts
- **动作：** 在 `packages/contracts/src/domain/admin.ts` 新增 `adminReviewQueueQuerySchema`、`adminActivityQuerySchema`、`adminArtifactQuerySchema`、`adminGraphQuerySchema` 等共享 Zod，与现有 `experience-gene`/`health` 同级；在 `enum-types/admin.ts` 新增 `adminRoleSchema` 等；经 `packages/contracts/src/index.ts` 聚合；在 `packages/contracts/src/domain/admin.test.ts` 覆盖边界。
- **Test plan：** `pnpm --filter @trapmap/contracts test --run src/domain/admin.test.ts`、`pnpm typecheck`。

### T3 — P2 Route表漂移对账（文档侧）
- **动作：** 跑 `pnpm check:route-surface` 导出真实 RouteDefs，与 `docs/reference/api-surface.md`、`ARTIFACTS.md` 的 operations/artifacts 旧路径比对；收缩或标注 `SURFACE_INVENTORY_DRIFT`；明确 `/v2/retrieval/search` 继续豁免；更新守卫例外不新增漂移。
- **Test plan：** `pnpm check:route-surface`、`pnpm check:docs`、`pnpm check:structure`。

### T4 — DeadCode Closeout归档
- **动作：** 确认 `docs/todos/dead-code-and-architecture-order-cleanup.md` Task 11-13 已于 2026-08-16 提交无需补充实现；执行 `git mv` 到 `docs/archived/archived-plans/dead-code-and-architecture-order-cleanup-archived.md`，同步 `docs/archived/README.md` 归档表、`docs/todos/README.md` 索引、`docs/todos/open-debt-and-compromises.md` 对应条目核对。
- **Test plan：** `pnpm check:docs`、`pnpm check:structure`、`pnpm typecheck`。

### T5 — Security候选与audit基线
- **动作：** 联网环境跑 `pnpm audit --prod`，回填 `docs/archived/reports/SECURITY_CANDIDATES_2026-08-22.md` 的 reachability 矩阵 reachable 列与 remediation；离线时留 `pnpm audit` CI 必跑标记与人工矩阵更新说明。
- **Test plan：** `pnpm audit`（CI 环境）、`pnpm check:docs`。

### T6 — WebPanel Real Admin RouteDefs（service侧）
- **动作：** 在 `service-governance-review` 补 `createGovernanceAdminRouteDefs`（review queue/detail/activity）、`service-knowledge-write` 补 `createKnowledgeAdminRouteDefs`（artifacts）、`service-knowledge-read` 补 graph 相关，全部 `create<X>RouteDefs(deps)` 工厂，复用 T2 的 Zod；补 `packages/service-*/src/routes.test.ts`。
- **约束：** 不在 service 内复制 Drizzle 表定义；走 owner PG port。
- **Test plan：** `pnpm --filter @trapmap/service-governance-review test --run src/routes.test.ts` 等三包、`pnpm typecheck`、`pnpm exec fallow audit --base HEAD --no-cache`。

### T7 — Gateway Parity补齐（宿主侧）
- **动作：**
  - `host-local` 在 `packages/host-local/src/nest/app.module.ts` 注册上述 RouteDefs，`host-distributed` 在 `gateway/routes.ts` 与 `config/service-config.ts` 注册并经 `internal-client` 转发；
  - 补 `GET /v1/knowledge/review-queue` 的 `host-distributed` parity、`GET /v3/retrieval/search` 的 `host-local` parity（或决定收缩 `api-surface`/`CLI --v2`）；
  - 更新 `packages/host-distributed/src/config/service-config.test.ts`、`packages/host-local/src/nest/config/config.test.ts`。
- **Test plan：** `pnpm --filter @trapmap/host-local test --run src/nest/knowledge-read/experience-gene-route-defs.test.ts` 扩展、`pnpm --filter @trapmap/host-distributed test --run src/gateway/experience-gene-route-defs.test.ts`、`pnpm test:deployment-smoke`。

### T8 — Eval Smoke补跑与CI联动
- **动作：** 在 `scripts/run-eval.ts` 与 `.github/workflows/eval.yml` 确保 `pnpm eval:smoke`、`pnpm eval:experience-gene --tier core` 在 CI 强制；补 `docker compose build` 与 `replicas=2` 冒烟脚本；本地无 Docker 时标记 CI 必跑证据。
- **Test plan：** `pnpm eval:smoke -- --help` 自检、`pnpm typecheck`、`pnpm check:docs`。

### T9 — WebPanel面板接线与RBAC回填
- **动作：** `apps/web-panel/src/services/api/admin-panel-api.ts` 与 `mock-admin-panel-api.ts` 接真实 Zod；`stores/*`、`pages/*`、`app/router/router.tsx:RequireAuth` 补 server-side 授权 tests；`browserSessionProvider` 已 token-bearing，补 gateway cookie 偏好分支。
- **Test plan：** `pnpm --filter @trapmap/web-panel test --run`（目标 23 files 64 tests 基数以上）、`pnpm --filter @trapmap/web-panel typecheck`、`pnpm --filter @trapmap/web-panel build`。

### T10 — 平台L3运营验证
- **动作：** `kind` 冒烟断言 `pod Ready+ /readyz 200`、`TRAPMAP_TASK_TRANSPORT=amqp` live smoke、`TRAPMAP_JOB_RUNTIME_DATABASE_URL` 双库双跑等价与回滚演练；验证后更新 `docs/architecture/DEPLOYMENT.md`、`SERVICE-DISCOVERY.md` 成熟度至 Level 3。
- **Test plan：** `pnpm test:distributed-closeout`、`pnpm test:deployment-smoke`（含 kind/docker 环境）。

## 验收
- 每任务 `Test plan` 绿 + `pnpm typecheck` + `pnpm check:docs`/`check:structure` + `fallow audit --base HEAD --no-cache` 通过。
- 最终 `pnpm check:docs && pnpm check:structure && pnpm typecheck && pnpm exec fallow audit --base main --ci`（或冻结的 activation-commit 基线）与 `pnpm eval:smoke` 在 CI 绿后，Gene 主线可归档，`plan.md` 切 Web Panel。
