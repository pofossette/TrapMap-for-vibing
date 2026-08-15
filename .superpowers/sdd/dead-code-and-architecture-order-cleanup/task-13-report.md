# Task 13 Report: 回归验证与 closeout

**Status:** DONE
**Branch:** sdd/task-13
**Date:** 2026-08-15

## Summary

全量回归 12 个包测试全绿 + 全部守卫通过；knip 新基线 unused files 15→2、unused deps 7→2、unused exports 5→4（devDeps 33、exported types 4 持平）；debt register 回写完成（2 条关闭、12 条新增登记、2 条既有条目更新）；eval:smoke 因本地无 docker 记录"CI 需补跑"并回写登记册。回归过程中发现并修复 2 个**预存 typecheck 失败**（本主线 Task 8/9 引入，raw `tsc -b` 复现，`rtk pnpm typecheck` 因包装器掩码此前误报通过）。

## Step 1: 全量回归

### 回归前置：worktree 环境修复

- per-package `node_modules` 链接缺失（lib/evals 无法解析 gray-matter 等）→ `pnpm install --force` 修复（与 Task 12 报告同一环境坑）。
- `packages/contracts/dist` 缺失（dist 为 git-ignored，测试经 exports 解析 dist）→ 首次 `pnpm build` 失败暴露 2 个预存 TS 错误，修复后 `pnpm build` 成功。

### 预存 typecheck 失败修复（回归发现，closeout 内收口）

raw `pnpm typecheck`（`tsc -b --pretty false`）退出码 2，两处错误均在 main（f09970e8）上原样复现，属本主线 Task 8/9 引入的回归，CI 的 `pnpm typecheck` 会失败：

| 错误 | 位置 | 根因 | 修复 |
|---|---|---|---|
| TS7016 无 mime-types 声明 | `packages/lib/src/parsing.ts:4` | Task 8 把 parsing 从 contracts 迁到 lib 时删除了 `contracts/src/types/mime-types.d.ts` 手工声明，未在 lib 补类型 | lib 补 `@types/mime-types` devDependency（`^2.1.4`），`pnpm install` 更新锁文件 |
| TS6196 导入未使用 | `packages/service-knowledge-read/src/store.ts:17` | Task 9 record 类型下沉后遗留 `ScriptActivationPolicy` 未使用导入 | 从 import 列表移除（该文件未 re-export 该符号） |

修复 commit：`d1bc8dee`（`fix(typecheck): restore mime-types typings and drop unused import`）。

> ⚠️ **rtk 掩码问题（重要）**：`rtk pnpm typecheck` 在 raw `tsc -b` 退出码 2 时仍输出 "TypeScript: No errors found" 且退出码 0。此前多任务的 typecheck 通过声明可能因此失真。本报告全部结果以 raw `pnpm typecheck` / `pnpm exec tsc -b` 为准（本任务均用 raw 命令复核）。

### 命令结果

| # | 命令 | 结果 |
|---|---|---|
| 1 | `pnpm typecheck`（`tsc -b --pretty false`，raw 复核） | **PASS**，exit 0（修复 2 个预存错误后） |
| 2 | contracts 测试（891 用例 / 34 文件） | PASS |
| 3 | lib 测试（55 / 8） | PASS |
| 4 | backend-core 测试（173 / 26） | PASS |
| 5 | cli 测试（537 / 28） | PASS |
| 6 | service-knowledge-read（80）、write（94）、candidate-ingestion（39）、governance-review（51）、identity-access（17）、job-runtime（28） | PASS |
| 7 | host-local（209）、host-distributed（136） | PASS |
| 8 | `pnpm exec knip` | 见下方基线（exit 1 = findings，非 CI 门禁） |
| 9 | `pnpm exec fallow audit --base main` | **PASS**，0 issues in 3 changed files（d1bc8dee..HEAD） |
| 10 | `pnpm check:docs` | PASS（doc-references 为既有非阻断 WARN） |
| 11 | `pnpm check:structure` | PASS（3 子检查全绿） |
| 12 | `pnpm check:asserts` | PASS（0 裸断言） |
| 13 | `pnpm check:complexity` | PASS（4 文件均在预算内） |
| 14 | `pnpm eval:smoke` | **未跑通：docker daemon 不可用**（`dial unix /var/run/docker.sock: connect: no such file or directory`），按约定记录"CI 需补跑"并回写 debt register |
| 15 | 附加：check:table-schema / check:pgtable-single-source / check:eval-imports / check:eval-only | 4 守卫全部 PASS（64=64；schema.ts 纯 re-export；evals 边界合规；eval-only 全标记） |

包测试合计 2310 用例全绿（891+55+173+537+80+94+39+51+17+28+209+136）。

### knip 新基线

| 指标 | 清理前（六路审查基线） | 清理后（Task 13） | 变化 |
|---|---|---|---|
| unused files | 15 | 2 | ↓13 |
| unused dependencies | 7 | 2 | ↓5 |
| unused devDependencies | 33 | 33 | 持平（根 devDeps 与 5 个 service 包的 @nestjs/*+reflect-metadata） |
| unused exports | 5 | 4 | ↓1 |
| unused exported types | 4 | 4 | 持平 |

剩余 unused files：`packages/cli/src/testing/index.ts`、`packages/service-candidate-ingestion/src/schema.ts`（knip 判定无源码消费者；pgTable 单源守卫不要求其存在）；unused deps：candidate-ingestion 的 persistence-schema、identity-access 的 contracts（与 schema.ts 相关，若删除该文件需同步评估）。knip 不在 CI 门禁内（`package.json` 仅有 `knip`/`knip:fix` script，未接 workflow），exit 1 属既有基线行为。unlisted deps 10（evals/scripts/archived 消费 workspace 包）与 duplicate exports 1（backend-core policy.ts 的 DEACTIVATED_STATE|SUPERSEDE_TARGET_STATE）同属既有基线。

### fallow

`pnpm exec fallow audit --base main`：**PASS，0 introduced**（Task 13 变更仅 3 个文件：store.ts、lib package.json、pnpm-lock.yaml）。Task 1-12 的跨包变更已在各自任务分别 audit 通过。

## Step 2: debt register 回写（docs/todos/open-debt-and-compromises.md）

### 关闭（[x]）

1. **candidates 表双份已单源化**（新条目）：Task 3/7 单源化 + Task 12 pgTable 守卫；含证据与验证。
2. **vitest.config.ts fastify 别名漂移已修复**（新条目）：Task 4 修复，closeout 关闭。

### 既有条目更新

1. **eval:smoke 需 CI 补跑**：进入条件补充"Dead Code and Architecture Order Cleanup 主线 closeout（Task 13）后必须在 CI 完整补跑一轮"（本轮涉及 evals runner 合并、eval import/@eval-only 守卫与全量清理，线上证据目前仅到离线部分）。
2. **重复工具函数回潮**：遗留项中 `contracts/graph-query.ts` 私有 `normalizeGraphLabel` 已随 Task 8（图算法下沉）删除，移出开放遗留清单并标注；`isRecord` 双端语义差异等其余遗留项保持有意保留。

### 保持不动

- **gateway actorId 字段放宽族**：人类裁决待定，不修改。

### 新增登记（12 条，均带来源/影响/当前边界/进入条件/后续落点/要求的文档与测试）

1. **web-panel real admin 路径不可运行**：`/api/admin/*` 5 个路径（runtime-overview、reviews/:id、json-edits、activity、artifacts）无后端实现 + 登录 token 不回填 `SessionProvider`，real 模式不可用，仅 mock 可用。
2. **capability-model 拆分**：510 行单文件类型/默认值/校验/推导混合，接近复杂度预算。
3. **OTel 双份接线收敛**：host-local nest 接线 vs host-distributed telemetry/internal-observability/observability 接线。
4. **Consul 双份实现收敛**：host-local NestJS consul.module/service vs host-distributed framework-free consul-discovery-adapter（DiscoveryPort）。
5. **EvalSeedPort 收窄**：eval seed 端口暴露面过宽（六路审查 evals 车道，大重构不实施）。
6. **internal-client review/governanceReview 双组合并**：7 方法逐字重复，同一服务两个 URL key。
7. **host-distributed shared/ports.ts 业务下沉**：宿主手写检索/队列/outbox SQL（109-302 行），违反"宿主只装配"约束。
8. **candidates 3 个 legacy JSONB 列**：迁移 SQL 含 analysis_snapshot/duplicate_case/manual_result，persistence-schema 无。
9. **task_queue_type_dedupe_idx 冗余索引**：与 task_queue_dedupe_pending_idx 部分唯一索引同列组，无终态查询消费。
10. **store_snapshot 幽灵表**：identity-access 迁移 SQL 残留已删除模块的表（66 = 64 + conflict_relations + store_snapshot）。
11. **host-distributed Dockerfile 冗余 COPY client-core**：依赖已移除但镜像构建仍复制。
12. **web-panel 5 个预存测试失败**：stubEnv/MODE 相关，干净 HEAD 复跑一致。

## Step 3: 文档回写

- `docs/README.md:264` LLM 图提取条目已带"仅 eval 链路引用"标注（Task 3 完成）——复核确认，无需改动。
- `docs/README.md` "当前整改主线"小节已由 Task 0 指向本主线——按编排指令保持不动。
- debt register 改动后 `check:docs` / `check:structure` 复跑通过。

## Step 4: 归档（deferred，见疑虑）

## Step 5: Commit

- `d1bc8dee` `fix(typecheck): restore mime-types typings and drop unused import`（回归前置修复）
- 本报告提交：`docs: closeout dead code and architecture order cleanup`（含 debt register 回写 + 本报告）

## Completion Gates 状态

| Gate | 状态 |
|---|---|
| 死代码删除 + knip unused files/exports 显著下降 | ✅（15→2 files，5→4 exports） |
| contracts 无图算法/parsing/worker 运行时逻辑 | ✅（Task 2/8） |
| candidates 表单源 + 六包 schema.ts re-export | ✅（Task 3/7 + 守卫） |
| 无 service-* 实现级 import | ✅（Task 9） |
| backend-core domain 零 SQL | ✅（Task 10） |
| DATABASE_SCHEMA.md 与 persistence-schema 一致（64 表） | ✅（Task 11 + 表清单守卫） |
| 四类防复发守卫接入 CI 且可阻断 | ✅（Task 12 + 本任务复跑全绿） |
| eval-only 模块带标记且不在产品导出面 | ✅（Task 3/12） |
| 全量 typecheck + 受影响包测试全绿；fallow 无 changed-file issue；eval:smoke CI 补跑记录 | ✅（typecheck 修复后全绿；2310 用例全绿；fallow 0 issue；CI 补跑已登记） |
| debt register 已回写 | ✅ |
| 本细则归档，根 plan.md 切换 | ⏳ deferred（见疑虑） |

## 疑虑 / 备注

1. **rtk 包装器掩码**：`rtk pnpm typecheck` 在 raw `tsc -b` 失败时仍报 "No errors found" 且 exit 0。此前任务（含 Task 12）的 typecheck 通过声明可能因此失真；本任务修复了实际错误并以 raw 命令复核全绿。建议后续任务以 raw `pnpm typecheck` 为准，或检查 rtk 版本/配置。
2. **归档 deferred（Step 4）**：按编排指令，`docs/README.md` "当前整改主线"小节保持不动（Task 0 已就绪）。仓库先例是"归档+切换"在下一主线的激活 commit 一并执行（如 7894ddf2），因此本任务不执行 `git mv` 与 plan.md 切换；待下一主线 Task 0 时随切换完成归档（届时勾选主细则全部 checkbox 并按 86 [x] 先例收口）。若编排方希望本任务即完成归档（plan.md 置空），可指示后补执行。
3. **knip 残留**：unused files 2 / unused deps 2（cli/testing/index.ts、candidate-ingestion schema.ts 及关联依赖声明）未在本任务清理（closeout 范围外，非 CI 门禁）；如编排方要求清零可单开清理。
4. **web-panel**：5 个预存测试失败与 real 路径不可运行均登记 debt，未在本主线处理。
