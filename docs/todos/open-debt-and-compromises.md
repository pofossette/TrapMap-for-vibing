# 长期工程债务与平台成熟度登记

> 角色：受根 [`plan.md`](../../plan.md) 管理的长期问题登记册。
> 状态：长期登记（2026-09-08）；不构成第二条 active mainline。
> Owner：根 `plan.md`；任一项满足进入条件时，新建 active 细则并由根索引显式链接。

## 使用规则

- 每项记录必须包含来源、影响、当前边界、进入条件和后续落点，缺要素的条目视为无效登记。
- 2026-08-22 平台化主线 closeout 已关闭的条目已物理移除（历史见 `docs/archived/archived-plans/debt-mcp-platformization-mainline-archived.md（已归档，路径冻结）` 与 git history）；本册为仍开放集。

## 长期问题池

### ai-providers Responses-API 传输缺失（2026-09-08 新立，ai-sdk 主线 closeout 残留）

- 来源：第十七轮语义质量门探针实证：现网凭证为 Responses-API-only 代理（`/v1/responses` 200，`/v1/chat/completions` 500、`/v1/embeddings` 404），本仓 adapter 只走 Chat Completions（`packages/ai-providers/src/adapters/aisdk.ts`），`eval:smoke` 语义项顶天花板持平基线。
- 影响：该凭证下语义评测无法推进；不影响确定性 44/44 与 fallback 行为。
- 当前边界：`generateText`/`embed`/`embedMany` 单通路保持不变；新增 `openai.responses()` 通路前不得改现有调用语义。
- 进入条件：需要用该 Responses-only 凭证跑通语义质量门，或产品明确要求 Responses 通路时。
- 后续落点：另起 tranche 做 `openai.responses()` 设计+测试（含 chat/embed 等价性与回退策略），完成后重跑 `eval:smoke` 回填本条。

### apps/light 镜像未构建验证（2026-09-08 新立，ai-sdk 主线 closeout 残留）

- 来源：第十七轮修了 `apps/light/Dockerfile` 的 deps/production 拷贝与 app `node_modules`，但本轮只构建验证了 distributed/migration，未构建 light 镜像。
- 影响：light 镜像 Dockerfile 改动无构建证据；不影响 `pnpm build:light` 与 `test:light-target`（已 EXIT 0）。
- 当前边界：`apps/light/Dockerfile` 改动已合入；未验证前不得宣称 light 镜像 closeout。
- 进入条件：具备 Docker 构建环境时。
- 后续落点：跑 light 镜像构建并回填本条后关闭。

### go-accelerator 退役语义冲突：DEPRECATED.md vs 410 Gone（2026-09-08 新立）

- 来源：`services/go-accelerator/DEPRECATED.md` 称退役端点仍服务（带 `X-Deprecated: use knowledge-read-go` 头并记 `WARN deprecated`），归档文档（`docs/archived/archived-plans/go-service-gradual-migration-archived.md（已归档，路径冻结）`、`architecture-remediation-phase3-go-convergence-archived.md`）称检索/排序端点已 410 Gone。`docs/architecture/GO-ACCELERATOR.md` 已标未知/待确认（2026-09-08），暂以 DEPRECATED.md 为准。
- 影响：读者无法确定 `POST /v1/retrieval/*` 到底返回 410 还是带退役头的 200；`POST /v1/retrieval/score` 的命运在架构页里也是两说。
- 当前边界：以 DEPRECATED.md 为准；宣称 410 前必须先读 handler 与 `services/knowledge-read-go/internal/api/router.go` 确认。
- 进入条件：有人通读退役 handler 实现并给出逐端点行为表时。
- 后续落点：按实测更新 `docs/architecture/GO-ACCELERATOR.md` 端点节并关闭本条；归档文档为只读历史，不追改。

### 跨 lane 待确认项（暂无 owner，2026-09-08 收录）

- 来源：各 lane 在本轮重写中标出的未知/待确认（2026-09-08），当时都没有 owner 认领：`docs/architecture/DEPLOYMENT.md:37`（`TRAPMAP_DATA_FILE` 引用的 `.data/skill-shareer.json` 在仓库内未见）、`docs/reference/ENVIRONMENT.md:63-64,70,88-92`（Gene 双 mode 变量、`TRAPMAP_READ_IMPL`、内部重试/熔断/限流 6 个变量缺默认值与行为描述）、`docs/operations/SECURITY.md:190-308`（`NODE_ENV`、`LOG_*`、`SENTRY_DSN`、Langfuse 相关变量在真相表里没有来源行）、`docs/architecture/components/RETRIEVAL.md:14`（`POST /v1/retrieval/genes/search` 未在 gateway route-defs 中出现）、`docs/architecture/components/ASYNC_SHARED_JOB_CONTRACTS.md:13,25,32`（`knowledge.index-follow-up` 与 `skill.index-follow-up` 的 payload schema 未见文件）、`docs/architecture/SKILL-REGISTRY.md:47`（`POST /v1/skills/import` 未在 gateway route-defs 中出现）、`docs/architecture/GO-ACCELERATOR.md:47`（`packages/infra/src/go-accelerator/client.ts` 路径未在本轮实测）。
- 影响：这些页面的读者用之前必须自己核对代码；放任不管会重新长成失真。
- 当前边界：各页面已标未知/待确认（2026-09-08），不撒谎；本条只做收拢，不替各 lane 下结论。
- 进入条件：任一 lane 的 owner 认领其中一项并通读源码确认时。
- 后续落点：确认一项、在权威页回写一项、从本条划掉一项；全部划完后关闭本条。

### web-panel 治理审计断言缺口（刷新于 2026-09-08）

- 来源：Web Panel Phase2 路由覆盖已闭环（`GET /api/admin/runtime-overview`、`reviews/:id/json-edits`、`reviews|/:id|/activity`、`graph/traps|skills`、`artifacts` 经 owner service RouteDef + `contracts` Zod 双宿主落地），但治理相关读/写的系统性 audit 断言未落地（仅 `helpers.ts:governance-audit` 注释与 `json-edit.routes.ts:32` no-op 注释）。
- 影响：管理动作缺审计证据；不阻塞细则其余项 closeout。面板本身仍是战略性 human-in-the-loop 产品，必须保留；本条只管审计缺口。
- 当前边界：2026-09-02 前已关闭 bearer provider 为 null、路由未保护、导航未按角色区分、server-side authorization tests、gateway session/cookie 条件偏好；剩余仅审计断言。
- 进入条件：需要真实管理控制台的审计合规时，或 Web Panel 细则恢复执行时。
- 后续落点：在 [`web-panel-feature-and-ui-optimization.md`](web-panel-feature-and-ui-optimization.md) 恢复执行后补审计断言，回填本条。

### eval:smoke / Experience Gene 活证据 CI 完整补跑（环境门控，刷新于 2026-08-30）

- 来源：本机无 docker daemon；A4 端到端、A15 镜像重建与 compose replicas 演示均需 docker/kind。`pnpm --filter @trapmap/evals eval:smoke` 与 `pnpm --filter @trapmap/evals eval:experience-gene --tier core --mode serve` 的 live baseline/shadow/serve comparison 亦需 PostgreSQL/Docker runtime。
- 影响：`eval:smoke` 全量与 live Gene promotion comparison 只能在 CI 跑；本机 `eval:smoke` 因缺 docker sock 失败（已知门控，非回归）。确定性离线部分已满足（`eval:experience-gene --tier core --mode serve` precision 1.0 / promotion eligible true）。
- 当前边界：deterministic offline 已满足，`fallow --base HEAD` 已绿，`typecheck`/`check:docs`/`check:structure` 已绿；剩余仅全量 smoke 与 live comparison 需 CI 门控。
- 进入条件：CI 或具备 docker 的本地环境（且 `DATABASE_URL`/`TRAPMAP_DATABASE_URL` 指向可响应 pgvector 实例）。
- 后续落点：CI 跑 `pnpm --filter @trapmap/evals eval:smoke` 全量 + `docker compose build candidate-worker outbox-worker` + replicas 演示 + `eval:experience-gene --tier core --mode serve` 的 live comparison，结果回填本条并关闭。

### 安全候选 CI advisory 补跑（2026-08-22 新拆，2026-08-30 已在线基线）

- 来源：A13 人工矩阵 historical 3 候选 reachable=0 已关闭（见 `docs/archived/reports/SECURITY_CANDIDATES_2026-08-22.md（已归档，路径冻结）`）；2026-08-30 本地在线补跑 `pnpm audit --prod --registry=https://registry.npmjs.org`（`.npmrc` 默认镜像源不支持 audit，需覆盖）。
- 影响：基线 `22 advisories` / `23 instances` / `650 prod deps`（8 moderate / 15 high / 0 critical），新增 direct reachable 4（fastify find-my-way 1 + ip-address 3）；无 critical，但 direct high 未归零前不能关。
- 当前边界：矩阵已回填报告（含可达性四档与处置列）；本机 JSON 已落 `/tmp/pnpm-audit-prod.json`。CI 仍需必跑 audit 作回归门控（本轮按分区约束只文档化，不改 CI）。
- 进入条件：已满足（本地在线）；CI 持久化校验为常态。
- 后续落点：按报告处置分批升级，每次重跑 audit 回填矩阵并核销；direct high 归零且 CI 持久化后关闭或转常态跟踪。

### 平台化 L3 运营验证批（C6-C8 残余，2026-08-22 新立）

- 来源：平台化主线 closeout 时 k8s/kind 验证环境缺失，C6-C8 三项只交付了静态产物。
- 影响：k8s manifests 未经集群验证，amqp 开关与 job-runtime 双库回退未经 live 验证；生产只能按 Level 2 口径宣称。
- 当前边界：已交付 k8s/base manifests（未经集群验证）、`TRAPMAP_TASK_TRANSPORT=amqp` 特性开关（pg 默认不变）、job-runtime `TRAPMAP_JOB_RUNTIME_DATABASE_URL` 回退试点；`DEPLOYMENT.md`/`SERVICE-DISCOVERY.md` 成熟度表述停在 Level 2。
- 进入条件：具备 k8s(kind)/docker/双库环境。
- 后续落点：逐项验证（kind 冒烟断言 pod Ready + readyz 200；amqp live smoke；job-runtime 双库双跑等价验证与回滚演练）后更新成熟度表述至 Level 3 达成口径。

### route-surface adoption-time inventory drift（2026-08-22 新立）

- 来源：`scripts/check-route-surface.ts` 首次接入时发现 api-surface 保留已退役 server 包路由、部分真实 gateway RouteDef 未列入 canonical API 表，以及 ARTIFACTS 图表中的历史 operations/artifacts 路径。完整路径清单冻结在 `SURFACE_INVENTORY_DRIFT`。
- 影响：守卫可阻断新增漂移，但已知旧差异在清账前不会失败；文档读者仍可能看到未实现的旧外部端点。
- 当前边界：例外只允许既有清单；新增 documented-not-real 或 real-not-documented 会立即被 `check:docs` 阻断。`/v2/retrieval/search` 继续单独豁免。
- 进入条件：清理 api-surface / ARTIFACTS 与两宿主 RouteDef 的历史面，或启动宿主网关 parity tranche。
- 后续落点：按服务族拆分 route surface inventory reconciliation，先修正文档，再决定缺失端点是实现还是移出公开契约。

### gateway surface parity gaps：v2 capsule、knowledge review queue 与 host-local v3（2026-08-22 新立）

- 来源：Skill Lookup closeout 勘察确认 `/v2/retrieval/search` 在两宿主均缺 RouteDef，CLI `--v2` 会 404；`/v3/retrieval/search` 只在 host-distributed 注册，host-local 的 CLI `load` 会 404。2026-08-23 补充：`GET /v1/knowledge/review-queue` 只有 host-local RouteDef，host-distributed 缺同路径 parity。
- 影响：CLI 的对应调用路径在指定后端形态下不可用；api-surface 对 v2 的承诺仍超出真实网关面。
- 当前边界：不阻塞 v1 检索和新的 artifact-first skill lookup；D 守卫将 `/v2/retrieval/search` 显式豁免，其余新增漂移会被阻断。
- 进入条件：CLI `--v2` 或 capsule retrieval 产品需求启动时处理 v2；host-local/v3 parity 纳入下一个 gateway surface reconciliation tranche。
- 后续落点：优先决定实现 endpoint 还是收缩 CLI/docs surface，然后按 RouteDef 工厂补齐并更新 api-surface。

### test:observability-closeout 引了不存在的测试路径（2026-09-08 新立）

- 来源：`package.json:51` 的 `test:observability-closeout` 引用 packages/ai-providers/src/observability.test.ts（该路径不存在，历史误写），真实文件在 `packages/ai-providers/test/observability.test.ts`。
- 影响：直接跑该 closeout 命令会因缺文件失败；常规 `test:coverage` 不走这条命令，不受影响。
- 当前边界：仅该一条命令受影响，不改源码行为。
- 进入条件：另起 tranche，把脚本路径改到 `test/` 目录并跑通该命令。
- 后续落点：`docs/operations/TESTING.md` 的 closeout 命令表（路径修正后复核）。

## 审核检查表

- [x] 2026-08-22 closeout：关闭条目物理移除，净收缩核对完成。
- [x] 2026-09-08 收口：每条补齐来源/影响/边界/进入条件/后续落点；无效单行登记已移除；DEPRECATED-vs-410 冲突与跨 lane 待确认项已收录。

## 检索延迟可观测化残留（2026-09-19）

- **T6.2 RAG log 接 Loki 未做**：`scripts/retrieval-latency-report.ts` 只能读本地 JSONL，`RagLogEntry` 尚未结构化推送到 Loki（host-local 已有 adapter 与 `LOKI_HOST` 边界，接线不改采集开关语义）。
- **live eval 冻结基线仍未采集**：`evals/retrieval-live` 的 `latencyVerdict` 已实现，但 `eval:retrieval:live` 需要活服务 + token，当前只跑过 `run-eval.ts retrieval`（PG 直连）。阈值暂取相对 50%（`evals/retrieval-live/compare.ts` 的 `LATENCY_REGRESSION_RATIO`）。另外 retrieval eval smoke 在本环境稳定 5/26 通过（**已与 HEAD 基线逐项对比，切片表完全一致，属既有失败**），恢复它不在本主线范围。
- **live bench 不含 gateway 层**：`scripts/retrieval-latency-live.ts` 直接把路由挂在 Fastify 上，跳过 Nest 会话守卫与鉴权中间件；embedding 用默认哈希实现。要测真实外网 embedding 延迟需配置 provider key。
- **离线 bench 只覆盖 CPU 开销**：DB 召回分支在无连接池时不激活，embedding 走默认 infra 的哈希实现，不含 PG / pgvector / HTTP / 鉴权成本。

- **gene 检索默认关闭（2026-09-19 核实）**：`/v1/retrieval/genes/search` 管线完整（PG 双通道召回 + 专属延迟指标），但受 `TRAPMAP_EXPERIENCE_GENES_MODE` 门控且默认 `off`——不配置即返回治理空响应，生产若要启用必须显式设 `serve`。另外 gene 的端到端验证此前缺失，本轮已补（serve 模式 + 播种 gene 命中验证）；gene 的确定性离线 eval 之外仍无对抗性评测（gene-retrieval-eval spec 待 dispatch）。
- **retrieval eval v2/v3 期望调优（2026-09-19 更新）**：v3 图计划管线已实现（`backend-core/src/knowledge-read/domain/graph-plan.ts` 的 Kahn 编译 + `search/search-v3-plan.ts` 编排 + 置信度门控），eval 组装服务器已注册 `/v2` `/v3`，用例真实可达且返回契约合法形状，retrieval eval 通过数 5→7。剩余 19 个失败是 fixture 期望按已退役原管线的排序/摘要行为编写（如 `v2-include-summary` 要求摘要支持、`v2-keyword-dominant` 要求特定排序），属评测期望调优而非接线缺陷。注意早期登记的"v3 图计划编译不存在"与"v3 别名"两条已失效，以本条为准。
- **`skill_artifact_capsules` schema 漂移（2026-09-19 发现）**：`packages/db/src/schema/artifacts.ts` 声明了 `keyword_tokens` / `field_keyword_tokens` / `team_id`，但 `packages/db/migrations/schema.sql` 里没有，写入侧也从不写。胶囊管道已绕开（走全文检索表达式 + 从 `art.team_id` 继承治理），但两边应当对齐：要么删掉 TS schema 的死声明，要么补迁移。注意 `schema.sql` 用的是 `CREATE TABLE IF NOT EXISTS`，已存在的库不会自动获得新列。
- **v2 胶囊评分是重实现而非复原**：原胶囊管道随已删除的 `packages/server`（Wave-10）消失，`MIN_CAPSULE_SCORE` 与评分器无留存实现。现行权重取自 `RETRIEVAL.md` 记载，但 RRF 的 k=60 与 `0.7 内容 / 0.3 融合` 的混合比例是判断值，已在代码注释标注。若日后找到原实现，应对齐或显式改文档。

## SQL 列引用漂移（2026-09-20，由 check:sql-columns 守卫扫描确认；2026-09-20 晚已修 4/5）

守卫扫描 210 条裸 SQL 语句（9 个包），确认 **5 处（8 个 table.column 对、14 处代码位置）引用了 applied schema 中不存在的列**，全部在运行时必失败（多数被 try/catch 静默吞掉）。

**根因修正**：其中 4 处不是代码写错列名，而是 `packages/db/migrations/schema.sql`（`runMigrations` 唯一执行的应用 DDL）比 `packages/db/src/schema` 建模落后一整个 Phase-2 表压缩——压缩提交改了建模与服务端 SQL，却没写迁移。已在 `schema.sql` 补齐迁移并在 docker 真 PG 上验证（`information_schema` 比对 0 差异），随之新增 `check:schema-parity` 守卫防复发。1、4、5 三处已解除，只剩第 2/3 处真 bug：

| # | 位置 | 坏引用 | 修复方向（T2） |
|---|---|---|---|
| 1 | `service-knowledge-read/src/retrieval-infra-default.ts:128`（`pgRecall.keywordRecall`） | `knowledge_search_documents.tokens` / `field_tokens_shortcut` / `field_tokens_detail` / `field_tokens_labels` | ✅ 已修（补齐迁移加列）。该表仍无写入方，见下条"DB 召回分支" |
| 2 | `service-knowledge-write/src/experience-gene-snapshots.ts:84` | `skill_artifacts.latest_revision`、`.remediation` | ✅ 已修：原意核实为**照抄 knowledge 侧门控**——artifacts 从来没有这两列，remediation 只存在于 `knowledge_entries`（无 artifact 写入方），latest revision 应来自 `artifact_revisions`。改为 LATERAL max(revision_no)（与 knowledge 侧同一写法）并移除 artifact 的 remediation 门控 |
| 3 | `service-knowledge-write/src/experience-gene-staleness-handler.ts:111,125`（另含 `experience-gene-planning.ts:115,155`） | `sa.remediation` | ✅ 已修：同 #2，artifact 派生的 gene 不再按 remediation 判定抑制（`remediationSuppressed` 恒 false，lifecycle_state 是 artifact 唯一门控） |
| 4 | `service-candidate-ingestion/src/pg-ports.ts:245,429` | `UPDATE candidates SET analysis`（实际列 `analysis_snapshot`）；`INSERT INTO candidate_duplicate_cases (... matches ...)`（表无此列） | ✅ 已修（补齐迁移：`candidates.analysis`、`candidate_duplicate_cases.matches`；顺带修正 `candidate_outcomes` 主键应为 `(candidate_id, kind)` 复合键，否则 resolution 会覆盖 manual） |
| 5 | `service-knowledge-write/src/experience-gene-repository.ts:236,365` | `UPDATE experience_gene_embeddings SET document, labels` | ✅ 已修（合并表已含 document/labels；`document` 按 `tsvector` 建并加 GIN，写侧改 `to_tsvector('english', $2)`，读侧改 JOIN 合并表） |

守卫 `pnpm check:sql-columns` 已落地并 blocking：**豁免清单已清空（5 处全修）**。局限已在脚本头注释：含 `${}` 的动态片段只校验静态列部分，drizzle ORM 查询不在扫描面（其列引用受 TS 类型保护）。同类根因（建模改了但没写迁移）由新增的 `pnpm check:schema-parity` 拦截。

**新增派生债务**：`experience_gene_embeddings.document` 运行时类型是 `tsvector`（读侧用 `@@`/`ts_rank`），而 drizzle 0.45 没有 tsvector 列类型，建模里仍声明 `text`——`check:schema-parity` 只比列名，这条类型差异靠字段注释与本节记录，drizzle 补上该类型后应同步。

**已消项**：`conflict_relations` 的「双源例外」——该表此前只在 `service-governance-review` 的迁移/裸 SQL 里存在，`packages/db` 未建模，`DATABASE_SCHEMA.md` 明文标注为现状保留的例外，`check:schema-parity` 也为它挂了一条豁免。2026-09-20 补建模（`packages/db/src/schema/governance.ts`）后，建模、DDL、文档三处回到单一真源，豁免清空，冲突链路（检测 → 落库 → 检索回读）在真库端到端验证通过。

## 静默降级（2026-09-20，由 `check:silent-fallbacks` 守卫固化）

守卫扫 `packages/*/src`：593 文件 / 169 个 catch，其中 **36 个"只打日志（或空实现）就继续"的站点已逐个标注** `// silent-fallback-ok: <理由>`，其余靠重抛、指标或把失败转成显式返回值通过。标注时确认了两处**真实缺口**（不是"设计如此"），已挂账：

- **cron 调度 tick 失败无计数**（`service-cron/src/scheduler.ts:89`）：tick 抛错只 `console.error` 后等下一个 poll 周期重试，`service-cron` 目前**完全没有指标端口**（无 deps.metrics）。要做"调度在持续失败"的可观测，需要按 `RetrievalMetricsPort` 的三段式加 port + 双宿主实现 + 组合根注入，属独立任务。
- **候选去重 PG 通道降级无计数**（`service-candidate-ingestion/src/dedup-strategy/rule-dedup-strategy.ts:145`）：PG 去重通道失败后静默回落到内存规则检测器，与检索 DB 分支同类（同样形状的 catch 在检索链路已有 `trapmap_retrieval_degraded_total`）。修法与检索侧一致：给候选链路补 degraded 计数器。

守卫的判定口径（写在脚本头注释）：catch 体去掉 `console.*`/`logger.*` 调用与注释后若为空，即视为"只打日志"；把失败转成显式返回值（`return false`、`return { status: 503 }`、`state = { reachable: false }`）不算静默，因为调用方拿得到失败信号。标注里没有理由（`// silent-fallback-ok:` 后为空）同样违规。
