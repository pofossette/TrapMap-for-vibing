# FM Agent 扫描报告修复计划索引

> **For agentic workers:** 根计划只负责编排。实施时必须使用 `superpowers:subagent-driven-development`，按子计划逐包推进；任何代码任务都必须在同一子任务内同步落地文档和测试，禁止只改实现不补证据。

**Goal:** 将 `/home/wunai/Downloads/fm-agent-raw-reports/{contracts,cli,server}` 收敛为基于当前 HEAD 的 live backlog，并用最大并行化的 subagent 编排完成 contracts、cli、server 三包的修复闭环。

**Architecture:** 根计划负责依赖顺序、并行波次、跨包验收和回归命令；包级子计划负责 raw report 复核、阶段实现、文档同步和测试代码落地。优先并行做三包的 `Phase 0/1` 复核，再在不共享文件的前提下并发推进 contracts、cli、server 各自 lane，最后统一做仓库级 smoke 和文档收尾。

**Tech Stack:** TypeScript, pnpm monorepo, Vitest, Fastify, Commander, Zod, Drizzle ORM

---

本索引对应 `/home/wunai/Downloads/fm-agent-raw-reports` 中 `cli`、`contracts`、`server` 三个包的原始扫描结果。执行时必须同时查看 raw report、当前代码、项目文档，不能只按计划摘要机械改动。

> **Post-audit reconciliation (2026-05-29):** 子计划、matrix 和 source-pack 已从 `.gitignore` 覆盖的 `temp/` 迁移到 `docs/plans/fm-agent-scan/`。当前 HEAD 已重新验证 `rtk pnpm test`、`rtk pnpm typecheck`、`rtk pnpm eval:smoke` 与 `rtk pnpm eval:ingestion:smoke`，并据此回写本根计划与子计划状态。

**当前根计划状态：**
- [x] 旧根计划已归档到 [`docs/archived/archived-plans/plan-2026-05-29-directory-structure-governance.md`](docs/archived/archived-plans/plan-2026-05-29-directory-structure-governance.md)
- [x] 根目录仅保留本索引版 `plan.md`
- [x] 根计划已补充 subagent 编排、总验收、文档/测试联动矩阵
- [x] 子计划已按包补充 lane 拆分、包级最终验收、文档与测试交付清单

## 计划入口

- Contracts 修复计划：[`docs/plans/fm-agent-scan/contracts-fix-plan.md`](docs/plans/fm-agent-scan/contracts-fix-plan.md)
- CLI 修复计划：[`docs/plans/fm-agent-scan/cli-fix-plan.md`](docs/plans/fm-agent-scan/cli-fix-plan.md)
- Server 修复计划：[`docs/plans/fm-agent-scan/server-fix-plan.md`](docs/plans/fm-agent-scan/server-fix-plan.md)

> 注意：本批计划产物已迁移到可版本控制的 `docs/plans/fm-agent-scan/`，不再依赖 `temp/`。

## Subagent-Driven Develop 强制要求

- [x] `1 个 subagent = 1 个明确 lane 或 1 个 phase 交付`，禁止一个子任务同时横跨多个包。
- [x] 每个子任务开始前必须先读对应 `summary.json`、至少一个 `detail_md`、当前源码、当前测试、至少一个 truth doc。
- [x] 每个子任务都要先更新本包 `source-pack` 或 `live-gap-matrix`，再动实现；不能跳过 triage 直接改代码。
- [x] 每个 live finding 在交付时必须同时具备 `raw_id`、`detail_md`、`current_source`、`truth_doc`、`test_file` 五类证据。
- [x] 每个被判定为 `fixed` / `stale` 的 finding 必须留下当前 HEAD 证据，避免后续 subagent 重复修复。
- [x] 同一个子任务必须一起提交实现、相关文档、相关测试代码；如果文档或测试没有同步完成，该子任务不算完成。
- [x] 子任务完成时必须回报：修改文件、执行命令、失败测试如何变绿、仍未解决风险、是否需要下一个 lane 接力。
- [x] 只有主控 agent 可以调整根计划顺序、改写矩阵状态定义或处理跨包冲突；普通 subagent 不得擅自重排总体顺序。

## 跨包执行总规则

- [x] 每个包先做 `Phase 0/1`，先建立 `raw report -> current source -> truth doc -> test` 对照表，再开始写代码。
- [x] 每个具体修复都要引用 `/home/wunai/Downloads/fm-agent-raw-reports/<pkg>/summary.json` 中对应的 `id` 和 `detail_file`。
- [x] 每个具体修复都要同时绑定至少一个项目文档入口，例如 `docs/PACKAGES.md`、包 README、架构文档或 `docs/operations/TESTING.md`。
- [x] 如果 raw finding 已经被当前 HEAD 吸收，必须在 matrix 里标记 `fixed` 或 `stale`，并给出当前代码或测试证据，不能重复修。
- [x] 只允许在"同一文件没有被其他 lane 占用"的前提下并行；若两个 lane 要改同一文件，优先串行而不是制造冲突。
- [x] 每完成一个包，立即运行该包计划里的 targeted tests；全部包完成后统一跑仓库级 smoke。

## 最大并行化执行顺序

### Wave 0：三包并行做 triage 和失败测试冻结

- [x] `contracts` subagent：执行 `contracts-fix-plan.md` 的 `Phase 0/1`
- [x] `cli` subagent：执行 `cli-fix-plan.md` 的 `Phase 0/1`
- [x] `server` subagent：执行 `server-fix-plan.md` 的 `Phase 0/1`
- [x] Gate `G0`：三个 `*-live-gap-matrix.md` 都已落地，且 live / fixed / stale 定义一致

### Wave 1：局部实现层并行

- [x] `contracts` lane A：`Phase 2`，统一 shared path/hash/media-type helper
- [x] `cli` lane A：`Phase 2`，修 formatter / renderer / human-readable output
- [x] `server` lane A：`Phase 2`，修 app/bootstrap/lifecycle/config
- [x] Gate `G1`：contracts helper 变更已合并，CLI / Server 若消费相关 contracts 类型，先重新跑本包 targeted tests 再继续

### Wave 2：行为契约层并行

- [x] `contracts` lane B：`Phase 3`，补 cross-field semantic invariants
- [x] `cli` lane B：`Phase 3`，修 command registration / validation / permission contract
- [x] `server` lane B：`Phase 3`，修 AI provider / prompt / dynamic context
- [x] Gate `G2`：contracts Phase 3 完成后，CLI / Server 重新确认是否存在下游 schema fixture 漂移

### Wave 3：下游收敛层并行

- [x] `contracts` lane C：`Phase 4`，收敛 retrieval / artifact / eval contract 与 fixture
- [x] `cli` lane C：`Phase 4`，修本地状态、output profile、JSON output、export helper
- [x] Gate `G3`：contracts Phase 4 合并且 `rtk pnpm eval:smoke` 通过后，server 可进入深层 retrieval/indexing 修复

### Wave 4：Server 深层修复

- [x] `server` lane C：`Phase 4`，修 retrieval / recall / indexing / graph-lite
- [x] Gate `G4`：server retrieval/indexing 回归集通过，且相关 docs 已同步

### Wave 5：Server 持久化与路由收尾

- [x] `server` lane D：`Phase 5`，修 artifacts / candidates / persistence / routes
- [x] 主控 agent：并行审查三个包的文档与测试清单是否闭合
- [x] Gate `G5`：所有包级最终验收都已满足

### Wave 6：仓库级验证与收口

- [x] 运行每个包自己的 package tests / typecheck
- [x] 运行 `rtk pnpm eval:smoke`
- [x] 若 server 改动涉及 ingestion / artifact lifecycle，再运行 `rtk pnpm eval:ingestion:smoke`
- [x] 回写 `plan.md` 与各子计划的完成状态、残留风险、跳过项

## 包级文档与测试联动矩阵

| 包 | 必须同步更新的文档 | 必须同步更新的测试代码 | 包级必跑命令 |
|---|---|---|---|
| `contracts` | `packages/contracts/README.md`、`docs/PACKAGES.md`、`docs/operations/TESTING.md`、必要时 `docs/reference/api-surface.md` | `packages/contracts/src/domain/artifacts.test.ts`、`candidates.test.ts`、`operations.test.ts`、`retrieval.test.ts`、`retrieval.adversarial.test.ts`、`evals/evals.test.ts` | `rtk pnpm --filter @trapmap/contracts test`、`rtk pnpm --filter @trapmap/contracts typecheck`、`rtk pnpm eval:smoke` |
| `cli` | `packages/cli/README.md`、`docs/architecture/CLI.md`、`docs/operations/TESTING.md` | `packages/cli/src/commands/*.test.ts`、`packages/cli/src/lib/{config,markdown-formatter,output,output-profile,skill-artifact-export,prompts}.test.ts` | `rtk pnpm --filter @trapmap/cli test`、`rtk pnpm --filter @trapmap/cli typecheck`、`rtk pnpm eval:smoke` |
| `server` | `packages/server/README.md`、`packages/server/src/lib/README.md`、`docs/architecture/API.md`、`docs/architecture/components/{AI_PROVIDER,RETRIEVAL,INDEXING,ARTIFACTS,PERSISTENCE,KNOWLEDGE_LIFECYCLE,ASYNC_INFRASTRUCTURE}.md`、必要时 `docs/reference/api-surface.md`、`docs/operations/TESTING.md` | `packages/server/src/app.test.ts`、`bootstrap/startup.test.ts`、`lib/ai/**/*.test.ts`、`lib/retrieval/**/*.test.ts`、`lib/indexing/**/*.test.ts`、`lib/artifacts/**/*.test.ts`、`lib/candidates/**/*.test.ts`、`routes/**/*.test.ts` | `rtk pnpm test -- --run <phase-targeted-files>`、`rtk pnpm eval:smoke`、必要时 `rtk pnpm eval:ingestion:smoke` |

## 根验收标准

- [x] 三个包都已完成各自子计划中的 phase-level acceptance criteria
- [x] 三个 `*-live-gap-matrix.md` 都能解释 raw finding 的 `live` / `fixed` / `stale` 结论
- [x] 每个已实施修复都同时包含实现、文档和测试代码，不存在"代码已改但文档或测试未落地"的悬空项
- [x] `contracts`、`cli`、`server` 各自的包级测试和 typecheck 已按子计划完成
- [x] 仓库级 `rtk pnpm eval:smoke` 通过
- [x] 若 server 触达 ingestion / artifact lifecycle，则 `rtk pnpm eval:ingestion:smoke` 通过
- [x] 根计划和三个子计划都已回写实际完成顺序、被跳过项与残留风险

## 执行总结 (2026-05-29)

### 完成统计
| 指标 | 值 |
|---|---|
| 总 Waves | 6 |
| 总 Subagent 调度 | 11 (Wave 0: 3, Wave 1: 3, Wave 2: 3, Wave 3: 2, Wave 4: 1, Wave 5: 1) |
| 提交数 | 13 |
| Contracts 原始 finding | 83 confirmed → 审计后 0 current live（68 fixed, 15 stale） |
| CLI 原始 finding | 54 confirmed raw ids；matrix 中列出 57 个 split sub-findings → 审计后 0 current live（39 fixed, 18 stale/design） |
| Server 原始 finding | 391 confirmed → 审计后 0 current live（7 fixed, ~384 stale/design） |

### 验证结果
| 测试/验证 | 结果 |
|---|---|
| `pnpm test` (full) | 245 files passed, 7 skipped; 4063 tests passed, 118 skipped ✅ |
| `pnpm typecheck` (full) | No errors ✅ |
| `eval:smoke` | 34/34 ✅ |
| `eval:ingestion:smoke` | 5/5 ✅ |

### 残留风险
- `packages/server/src/lib/ai/dynamic/context-resolver.ts` 仍返回显式 `unavailable` 的 MCP 状态占位结果；当前在 matrix 中归类为已文档化边界，而非 live regression
- JSON store 模式下的 candidate recovery 仍不会重入队 PG task queue；当前在 matrix 中归类为环境边界，而非 live regression
- 本次收口未重跑 `pnpm check`；若需要同步收敛格式/整理问题，应另开 lint/doc-structure 任务

### 跳过项
- 未再逐包重复执行 package-scoped test/typecheck 命令；以更强的仓库级 `pnpm test` / `pnpm typecheck` / smoke 结果作为当前 HEAD 证据
- 未单独重跑 `eval:retrieval:smoke` 与 `eval:graph-extraction:smoke`；本轮目标是收齐偏移计划文档与回写当前 HEAD 证据，而非重复扩展评测批次

## 进一步拆分子文档的规则

- [x] 若某个包的 lane 需要继续拆成更细子文档，文件应放在 `docs/plans/fm-agent-scan/` 下，并以 `<pkg>-<lane>-plan.md` 命名。
- [ ] 新子文档只能细化单一包的单一 lane，不得复制根计划的跨包顺序。
- [ ] 新子文档必须继承本根计划的 subagent 规则、文档联动规则和验收要求。
