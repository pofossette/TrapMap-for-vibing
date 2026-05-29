# FM Agent 扫描报告修复计划索引

> **For agentic workers:** 根计划只负责编排。实施时必须使用 `superpowers:subagent-driven-development`，按子计划逐包推进；任何代码任务都必须在同一子任务内同步落地文档和测试，禁止只改实现不补证据。

**Goal:** 将 `/home/wunai/Downloads/fm-agent-raw-reports/{contracts,cli,server}` 收敛为基于当前 HEAD 的 live backlog，并用最大并行化的 subagent 编排完成 contracts、cli、server 三包的修复闭环。

**Architecture:** 根计划负责依赖顺序、并行波次、跨包验收和回归命令；包级子计划负责 raw report 复核、阶段实现、文档同步和测试代码落地。优先并行做三包的 `Phase 0/1` 复核，再在不共享文件的前提下并发推进 contracts、cli、server 各自 lane，最后统一做仓库级 smoke 和文档收尾。

**Tech Stack:** TypeScript, pnpm monorepo, Vitest, Fastify, Commander, Zod, Drizzle ORM

---

本索引对应 `/home/wunai/Downloads/fm-agent-raw-reports` 中 `cli`、`contracts`、`server` 三个包的原始扫描结果。执行时必须同时查看 raw report、当前代码、项目文档，不能只按计划摘要机械改动。

**当前根计划状态：**
- [x] 旧根计划已归档到 [`docs/archived/archived-plans/plan-2026-05-29-directory-structure-governance.md`](docs/archived/archived-plans/plan-2026-05-29-directory-structure-governance.md)
- [x] 根目录仅保留本索引版 `plan.md`
- [x] 根计划已补充 subagent 编排、总验收、文档/测试联动矩阵
- [x] 子计划已按包补充 lane 拆分、包级最终验收、文档与测试交付清单

## 计划入口

- Contracts 修复计划：[`temp/fm-agent-scan-plans/contracts-fix-plan.md`](temp/fm-agent-scan-plans/contracts-fix-plan.md)
- CLI 修复计划：[`temp/fm-agent-scan-plans/cli-fix-plan.md`](temp/fm-agent-scan-plans/cli-fix-plan.md)
- Server 修复计划：[`temp/fm-agent-scan-plans/server-fix-plan.md`](temp/fm-agent-scan-plans/server-fix-plan.md)

> 注意：`temp/fm-agent-scan-plans/` 当前命中 `.gitignore` 的 `temp/` 规则。若这些子计划需要进入版本控制，后续应迁移到 `docs/plans/` 或在提交时显式处理。

## Subagent-Driven Develop 强制要求

- [ ] `1 个 subagent = 1 个明确 lane 或 1 个 phase 交付`，禁止一个子任务同时横跨多个包。
- [ ] 每个子任务开始前必须先读对应 `summary.json`、至少一个 `detail_md`、当前源码、当前测试、至少一个 truth doc。
- [ ] 每个子任务都要先更新本包 `source-pack` 或 `live-gap-matrix`，再动实现；不能跳过 triage 直接改代码。
- [ ] 每个 live finding 在交付时必须同时具备 `raw_id`、`detail_md`、`current_source`、`truth_doc`、`test_file` 五类证据。
- [ ] 每个被判定为 `fixed` / `stale` 的 finding 必须留下当前 HEAD 证据，避免后续 subagent 重复修复。
- [ ] 同一个子任务必须一起提交实现、相关文档、相关测试代码；如果文档或测试没有同步完成，该子任务不算完成。
- [ ] 子任务完成时必须回报：修改文件、执行命令、失败测试如何变绿、仍未解决风险、是否需要下一个 lane 接力。
- [ ] 只有主控 agent 可以调整根计划顺序、改写矩阵状态定义或处理跨包冲突；普通 subagent 不得擅自重排总体顺序。

## 跨包执行总规则

- [ ] 每个包先做 `Phase 0/1`，先建立 `raw report -> current source -> truth doc -> test` 对照表，再开始写代码。
- [ ] 每个具体修复都要引用 `/home/wunai/Downloads/fm-agent-raw-reports/<pkg>/summary.json` 中对应的 `id` 和 `detail_file`。
- [ ] 每个具体修复都要同时绑定至少一个项目文档入口，例如 `docs/PACKAGES.md`、包 README、架构文档或 `docs/operations/TESTING.md`。
- [ ] 如果 raw finding 已经被当前 HEAD 吸收，必须在 matrix 里标记 `fixed` 或 `stale`，并给出当前代码或测试证据，不能重复修。
- [ ] 只允许在“同一文件没有被其他 lane 占用”的前提下并行；若两个 lane 要改同一文件，优先串行而不是制造冲突。
- [ ] 每完成一个包，立即运行该包计划里的 targeted tests；全部包完成后统一跑仓库级 smoke。

## 最大并行化执行顺序

### Wave 0：三包并行做 triage 和失败测试冻结

- [ ] `contracts` subagent：执行 `contracts-fix-plan.md` 的 `Phase 0/1`
- [ ] `cli` subagent：执行 `cli-fix-plan.md` 的 `Phase 0/1`
- [ ] `server` subagent：执行 `server-fix-plan.md` 的 `Phase 0/1`
- [ ] Gate `G0`：三个 `*-live-gap-matrix.md` 都已落地，且 live / fixed / stale 定义一致

### Wave 1：局部实现层并行

- [ ] `contracts` lane A：`Phase 2`，统一 shared path/hash/media-type helper
- [ ] `cli` lane A：`Phase 2`，修 formatter / renderer / human-readable output
- [ ] `server` lane A：`Phase 2`，修 app/bootstrap/lifecycle/config
- [ ] `server` lane B：`Phase 3` 的只读准备和失败测试编写可提前开始；若要改 `config.ts` 或与 lane A 重叠文件，则等待 lane A 合并
- [ ] Gate `G1`：contracts helper 变更已合并，CLI / Server 若消费相关 contracts 类型，先重新跑本包 targeted tests 再继续

### Wave 2：行为契约层并行

- [ ] `contracts` lane B：`Phase 3`，补 cross-field semantic invariants
- [ ] `cli` lane B：`Phase 3`，修 command registration / validation / permission contract
- [ ] `server` lane B：`Phase 3`，修 AI provider / prompt / dynamic context
- [ ] Gate `G2`：contracts Phase 3 完成后，CLI / Server 重新确认是否存在下游 schema fixture 漂移

### Wave 3：下游收敛层并行

- [ ] `contracts` lane C：`Phase 4`，收敛 retrieval / artifact / eval contract 与 fixture
- [ ] `cli` lane C：`Phase 4`，修本地状态、output profile、JSON output、export helper
- [ ] `server` lane C：只读准备 `Phase 4` 的 retrieval / indexing / graph-lite 热点；若依赖 contracts Phase 4 的路径或 schema 结论，则等待 contracts lane C 合并后再改代码
- [ ] Gate `G3`：contracts Phase 4 合并且 `rtk pnpm eval:smoke` 通过后，server 可进入深层 retrieval/indexing 修复

### Wave 4：Server 深层修复

- [ ] `server` lane C：`Phase 4`，修 retrieval / recall / indexing / graph-lite
- [ ] `server` lane D：`Phase 5` 的 source-pack、测试草稿、文档入口核对可先做；若与 lane C 触达同一 persistence / route 文件，则等 lane C 合并
- [ ] Gate `G4`：server retrieval/indexing 回归集通过，且相关 docs 已同步

### Wave 5：Server 持久化与路由收尾

- [ ] `server` lane D：`Phase 5`，修 artifacts / candidates / persistence / routes
- [ ] 主控 agent：并行审查三个包的文档与测试清单是否闭合
- [ ] Gate `G5`：所有包级最终验收都已满足

### Wave 6：仓库级验证与收口

- [ ] 运行每个包自己的 package tests / typecheck
- [ ] 运行 `rtk pnpm eval:smoke`
- [ ] 若 server 改动涉及 ingestion / artifact lifecycle，再运行 `rtk pnpm eval:ingestion:smoke`
- [ ] 回写 `plan.md` 与各子计划的完成状态、残留风险、跳过项

## 包级文档与测试联动矩阵

| 包 | 必须同步更新的文档 | 必须同步更新的测试代码 | 包级必跑命令 |
|---|---|---|---|
| `contracts` | `packages/contracts/README.md`、`docs/PACKAGES.md`、`docs/operations/TESTING.md`、必要时 `docs/reference/api-surface.md` | `packages/contracts/src/domain/artifacts.test.ts`、`candidates.test.ts`、`operations.test.ts`、`retrieval.test.ts`、`retrieval.adversarial.test.ts`、`evals/evals.test.ts` | `rtk pnpm --filter @trapmap/contracts test`、`rtk pnpm --filter @trapmap/contracts typecheck`、`rtk pnpm eval:smoke` |
| `cli` | `packages/cli/README.md`、`docs/architecture/CLI.md`、`docs/operations/TESTING.md` | `packages/cli/src/commands/*.test.ts`、`packages/cli/src/lib/{config,markdown-formatter,output,output-profile,skill-artifact-export,prompts}.test.ts` | `rtk pnpm --filter @trapmap/cli test`、`rtk pnpm --filter @trapmap/cli typecheck`、`rtk pnpm eval:smoke` |
| `server` | `packages/server/README.md`、`packages/server/src/lib/README.md`、`docs/architecture/API.md`、`docs/architecture/components/{AI_PROVIDER,RETRIEVAL,INDEXING,ARTIFACTS,PERSISTENCE,KNOWLEDGE_LIFECYCLE,ASYNC_INFRASTRUCTURE}.md`、必要时 `docs/reference/api-surface.md`、`docs/operations/TESTING.md` | `packages/server/src/app.test.ts`、`bootstrap/startup.test.ts`、`lib/ai/**/*.test.ts`、`lib/retrieval/**/*.test.ts`、`lib/indexing/**/*.test.ts`、`lib/artifacts/**/*.test.ts`、`lib/candidates/**/*.test.ts`、`routes/**/*.test.ts` | `rtk pnpm test -- --run <phase-targeted-files>`、`rtk pnpm eval:smoke`、必要时 `rtk pnpm eval:ingestion:smoke` |

## 根验收标准

- [ ] 三个包都已完成各自子计划中的 phase-level acceptance criteria
- [ ] 三个 `*-live-gap-matrix.md` 都能解释 raw finding 的 `live` / `fixed` / `stale` 结论
- [ ] 每个已实施修复都同时包含实现、文档和测试代码，不存在“代码已改但文档或测试未落地”的悬空项
- [ ] `contracts`、`cli`、`server` 各自的包级测试和 typecheck 已按子计划完成
- [ ] 仓库级 `rtk pnpm eval:smoke` 通过
- [ ] 若 server 触达 ingestion / artifact lifecycle，则 `rtk pnpm eval:ingestion:smoke` 通过
- [ ] 根计划和三个子计划都已回写实际完成顺序、被跳过项与残留风险

## 进一步拆分子文档的规则

- [ ] 若某个包的 lane 需要继续拆成更细子文档，文件应放在 `temp/fm-agent-scan-plans/` 下，并以 `<pkg>-<lane>-plan.md` 命名。
- [ ] 新子文档只能细化单一包的单一 lane，不得复制根计划的跨包顺序。
- [ ] 新子文档必须继承本根计划的 subagent 规则、文档联动规则和验收要求。
