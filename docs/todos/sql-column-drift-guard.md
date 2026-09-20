# SQL 列引用静态守卫（sql-column-drift-guard）

> 状态：Active（2026-09-20 起，承接 [`retrieval-latency-optimize`](retrieval-latency-optimize.md) 优化过程中发现的同类问题；实现分支建议自 main 新开，与本分支解耦）。

## 0. 目标与非目标

**目标**：把"代码裸 SQL 引用 schema 中不存在的列"这一类问题从**运行时静默失败**变为**CI 静态拦截**，并顺带覆盖两类伴生模式（无写入方表、默认关闭的功能路径）。

**非目标**：不覆盖 drizzle ORM 查询（列引用经 TS 类型校验，本次全部漂移都集中在裸 SQL 字符串里——这正是收敛策略的依据）；不处理运行时动态行为（连接、约束、数据形状，由集成测试兜底）；不重构既有裸 SQL 为 drizzle。

## 1. 事实基线（2026-09-20 扫描与验证）

### 扫描方法（原型已验证可行）

python 原型扫描器：解析 `packages/db/migrations/schema.sql` 的 56 张表实际列集 → 交叉比对 9 个包的裸 SQL（SELECT/INSERT）列引用 → 89 条语句核对 → 24 个候选 → `information_schema` 在真实迁移库逐一验证（权威判据）。全程约 5 分钟。

### 确认实锤（information_schema 验证 MISS）

| # | 位置 | 坏引用 | 影响 |
|---|---|---|---|
| 1 | `service-knowledge-read/src/retrieval-infra-default.ts`（`pgRecall.keywordRecall`） | `knowledge_search_documents.tokens` / `field_tokens_shortcut` / `field_tokens_detail` / `field_tokens_labels`（4 列均不存在） | v1/v3 DB 召回分支静默降级（已在 latency-optimize 主线登记） |
| 2 | `service-knowledge-write/src/experience-gene-snapshots.ts` | `skill_artifacts.latest_revision` + `skill_artifacts.remediation`（均不存在） | gene 快照查询运行时必抛错 |
| 3 | `service-knowledge-write/src/experience-gene-staleness-handler.ts:128` | `sa.remediation`（不存在） | gene 陈旧化信号查询必抛错 |
| 4 | `service-candidate-ingestion/src/pg-ports.ts` | `UPDATE candidates SET analysis`（实际列 `analysis_snapshot`）+ `INSERT INTO candidate_duplicate_cases (... matches ...)`（表无此列） | 候选分析/去重的 PG 落库必失败 |

### 误报模式（原型已知局限）

24 个候选中 20 个是**表别名归因错误**（`art.title` 被算到 `cap` 头上、LATERAL 子查询的列被归到外层表）。正则原型无法解析别名作用域——这是 L2（AST 升级）的存在理由。

### 既有守卫的空白

- `check-table-schema.ts`：只核对**表名级**清单（db/src/schema vs DATABASE_SCHEMA.md），不查列、不查裸 SQL；
- `check-pgtable-single-source.ts`：只防双表定义源。
- **列级 + 裸 SQL 引用 = 守卫空白**，即本计划填补的部分。

## 2. 问题分类学（三类模式，均可静态拦截）

1. **列漂移**：代码 SQL 引用 schema 中不存在的列（本次 4 处实锤 + 已知的 capsules `keyword_tokens/team_id` 漂移同属此类——后者是 Drizzle 声明了但 schema.sql 没有的反向漂移）。
2. **无写入方表**：表存在但全库无 `INSERT INTO`（`knowledge_search_documents` 即因此空表 + 坏 SQL 双重报废）。
3. **静默降级 + 特性开关**：`catch → console.error → fallback` 使上述问题潜伏；叠加默认关闭的开关（`USE_DB_SEARCH`、`TRAPMAP_EXPERIENCE_GENES_MODE`、graph query `mode:'disabled'`）后完全不可见。

## 3. 方案分层

| 层 | 内容 | 成本 | 拦截能力 |
|---|---|---|---|
| L1 | introspection 交叉守卫 `check:sql-columns`：临时库迁移后 introspect 全表列集 + 正则提取 TS 裸 SQL 列引用（原型产品化）→ diff → 违规清单；接入 check-steps 框架 | 半天（原型已验证） | 本次 4 处实锤 + 已知漂移全部命中 |
| L2 | AST 升级：`pgsql-ast-parser` 替换正则，解析别名→真实表名、LATERAL/子查询作用域、跳过表达式列 | 1-2 天 | 误报率趋零，豁免清单可清空 |
| L3 | 降级可观测：①降级路径打 degraded 计数器（新指标族）；②ESLint 规则扫描"catch 内 console.error 且 return"模式，要求显式 `fallow-ignore` 式标注 | 各半天 | 防 L1/L2 抓不到的运行时动态失败 |

**补充扫描维度**（同守卫顺带输出）：

- **无写入方表清单**：每张表 grep `INSERT INTO`，零命中即"只读表"警告；
- **特性开关默认值清单**：`process.env.* ?? 'off'` / `=== 'true'` 模式全库列举，逐一标记"是否有意默认关闭"（当前已知 3 个）。

## 4. 执行阶段

| 阶段 | 内容 | 验收 |
|---|---|---|
| T1 | 4 处实锤登记进 `open-debt-and-compromises.md`；L1 守卫脚本落地（`scripts/check-sql-columns.ts`，照 `check-table-schema.ts` 惯例）并接入 check-steps；**存量违规进豁免清单**（守卫先红后豁免，防止一步修不完阻塞 CI） | `pnpm check:sql-columns` 可运行；豁免清单 = 5 条（含已知 tokens 族） |
| T2 | 修复 4 处实锤：gene 写侧 2 处需**先核实调用方原意**（`latest_revision`/`remediation` 的预期数据来源——可能应走 `artifact_revisions` LATERAL 或 metadata），candidate-ingestion 2 处为明确改列名（`analysis_snapshot`）与对齐 `candidate_duplicate_cases` 列集；逐处修复逐处摘豁免 | 豁免清单清空；`check:sql-columns` blocking 绿 |
| T3 | L2 AST 升级（pgsql-ast-parser），豁免机制降级为仅限动态 SQL | 误报为零；守卫对新增 SQL 自动生效 |
| T4 | L3 降级指标 + ESLint 规则 | DB 分支降级在 dashboard 可见 |
| T5 | 文档回写：`DATABASE_SCHEMA.md`（如补列）、`docs/operations/`（check 命令）、债务册更新 | 守卫全绿 |

**T3 已执行（2026-09-20，AST 收紧）**：原文的 T3 目标是"AST 升级 + 豁免仅限动态 SQL"。执行时把口径收紧为一条原则——**能静态判定的必须判定，判定不了的必须显式登记**：

- **解析器**：`scripts/lib/sql-ast-analysis.ts` 用 `pgsql-ast-parser`（根 devDependency）按真实 PG 语法分析，替换原先的正则。现在覆盖：表存在性、别名解析与别名笔误、语句作用域内的裸列、`INSERT` 列清单、`UPDATE ... SET` 目标、`ON CONFLICT (...)` 目标、CTE/子查询/`LATERAL` 的相关引用（子查询有自己的 FROM 作用域，外层作用域用于相关引用）、`ORDER BY` 引用选择列表别名、`EXCLUDED` 伪表；`pgsql-ast-parser` 不支持的 `ON CONFLICT ... WHERE`（部分索引推断）会先摘出谓词再单独按目标表校验，而不是放弃整条语句。`<=>`/`<->`/`<#>`（pgvector 距离算子）在分析前归一化，不影响列引用判定。
- **提取器**：`scripts/lib/sql-extraction.ts` 逐字符扫描字符串/模板字面量（跳过注释、正确跨过嵌套模板与转义引号、行号取自字面量起始行），并把 `${…}` 原位替换：`$${n}` → `$1`（参数序号惯用法），其余 → 标识符占位。散文、"Update skills"、`'DELETE'`（HTTP 方法）、`'pending'` 这类字面量不再被误判成 SQL。
- **常量解析**：`scripts/lib/sql-constants.ts` 解析文件内 / 同包 / 被 import 的 workspace 包的常量（字符串、无插值模板、**未被改动的**字符串数组 `.join()`、`getTableName(drizzleTable)`），并支持常量模板里再套常量的有限递归。它让 `SELECT ${CRON_JOB_COLUMNS} FROM ${cronJobsTable} WHERE id = $1` 这类语句变成**可校验**：把 `bogus_id` 注入该 SQL 会被守卫拦下，注入到被解析的列清单里同样会被拦下。对**会 `.push()` 的数组**拒绝折叠（那会把语句截断、凭空造出一条不存在的 SQL）。
- **未解析语句的登记制**：仍然无法静态判定的语句进 `DYNAMIC_SQL`——**按文件 + 精确条数 + 理由**登记（当前 11 文件 22 条）。条数两侧都收紧：多一条（新增不可校验 SQL）红，少一条（历史声明过期）也红，迫使每次变动都显式更新。违规本身**没有豁免机制**。

### 执行记录

| 阶段 | 状态 | 结果 |
|---|---|---|
| T1 | 完成 | `scripts/check-sql-columns.ts` 落地 + `pnpm check:sql-columns` 接入。首跑：解析 schema.sql 56 表、扫描 9 个包 **210 条裸 SQL**（其中 63 条含 `${}` 动态片段——改为替换插值占位符后仍校验静态列部分，覆盖从 147 提升到 210），命中 **5 处实锤 / 8 个 table.column 对 / 14 处代码位置**（含手工扫描漏掉的 `experience_gene_embeddings.document/labels`），已进内置豁免清单并登记债务。有效性自检：注入 `bogus_column` 守卫报违规退出非 0，删除后恢复绿灯。 |
| T2（前半，DDL 漂移） | 完成 | 根因不是"代码写错列名"而是**迁移缺失**：`schema.sql` 比 TS 建模落后一整个 Phase-2（56 表 vs 42 表，缺 2 张表与 8 组列，16 张应退役旧表仍在）。已把补齐迁移写进 `schema.sql`（新表 `candidate_outcomes` / `skill_artifact_manifest_items`、8 组缺列、`experience_gene_embeddings.document` 按 `tsvector` 建、DROP 15 张已合并旧表），并同步改完随之失效的代码（gene 读侧改 JOIN 合并表、写侧 `to_tsvector` 落库、bench 播种脚本、evals snapshot-orchestrator、candidate README）。真 PG（docker pgvector）验证：迁移后 `information_schema` 与建模比对 **0 差异**（43 表 = 42 建模 + `conflict_relations` 例外）。`check:sql-columns` 豁免由 8 条降到 4 条（只剩 `skill_artifacts.latest_revision/remediation` 这一处真 bug）。 |
| T2（后半，真代码 bug） | 完成 | `skill_artifacts.latest_revision` / `.remediation` 在两个世界里都不存在，属"照抄 knowledge 侧门控"：artifacts 无 remediation（只有 `knowledge_entries` 有，且无 artifact 写入方），latest revision 应来自 `artifact_revisions`。已改 `experience-gene-snapshots.ts`（LATERAL max revision_no + 去掉 remediation 门控）、`experience-gene-planning.ts`、`experience-gene-staleness-handler.ts`（artifact 派生 gene 的 `remediationSuppressed` 恒 false）。真库验证：12 条曾必败的语句（含 gene 读侧 tsvector、candidate outcomes 的 manual+resolution 双写）全部执行通过。`check:sql-columns` **豁免清单清空**。 |
| T4（降级计数部分） | 完成 | 三条静默降级路径全部进指标：`RetrievalMetricsPort` 新增 `recordDegraded({endpoint, reason})`，契约枚举 `RETRIEVAL_DEGRADED_REASONS = ['db-search-failed','db-vector-search-failed','rerank-fallback']`，双宿主实现同名序列 `trapmap_retrieval_degraded_total{endpoint,reason}`（host-local Prometheus / host-distributed OTel），打点收口在 `service-knowledge-read/src/retrieval-latency.ts:emitDegraded`，覆盖 `recall/hybrid-channel.ts`、`recall/semantic-channel.ts`、`recall/rerankRecallResults` 的 Go 回退；`console.error` 保留供本地调试。测试：host-local 新增 1 例（分别计数）、host-distributed 新增 `retrieval-metrics.test.ts`（2 例）、读侧新增 `retrieval-degraded.test.ts`（3 例，含"端口缺席时静默"）。文档：`OBSERVABILITY.md` 归属节 + `OBSERVABILITY-OPERATIONS.md` 指标表/查询/`RetrievalDegraded` 告警（顺带修正该页"v2 无宿主注册"的过期描述）。 |
| T4（静默降级静态守卫） | 完成 | 载体按本仓工具链换为 `scripts/check-silent-fallbacks.ts`（Biome 无自定义规则），并入 CI `doc-guardrails`。口径：catch 体去掉 `console.*`/`logger.*` 调用与注释后为空即为"只打日志"；重抛、进指标、把失败转成显式返回值、或带理由的 `// silent-fallback-ok: <理由>` 标注均可通过（无理由的标注同样违规）。首跑：593 文件 / 169 catch → 33 个只打日志站点；修掉检查器自身一个假阴性（遗留 `;` 未剥离，漏掉 3 个站点）后为 36 个，逐个标注完成，守卫零违规。单测 7 例（含"标注无理由""探针注入"）。标注确认的两处真实缺口已挂账（cron tick 无指标端口、候选去重 PG 通道降级无计数）。 |
| 收尾（`conflict_relations` 落点） | 完成 | 该表此前是唯一一条 parity 豁免（表在应用 DDL、TS 未建模，`DATABASE_SCHEMA.md` 记为「双源例外」）。已补建模 `packages/db/src/schema/governance.ts`（列/规范序 CHECK/唯一索引/两个查询索引与 DDL 逐项对齐），`index.ts` 聚合导出，`DATABASE_SCHEMA.md` 升到 **43 表**并新增「治理评议」节、去掉例外说明，`EXEMPTIONS` 清空（机制保留）。**链路打通验证**（docker 真 PG，13 项全绿）：approved entries → knowledge-write owner → conflict-read → 规则分类 → `conflictProjection.upsert` 落 `conflict_relations` → `getById` / `listByEntryIds` / `retrievalProjection.listConflicts` 回读；重跑检测幂等（detectedCount 0、行数仍 1）；反向 pair 被 `ck_conflict_relations_canonical_order` 拒绝、重复 pair 被 `idx_conflict_relations_entry_pair` 拒绝。 |
| T3 | 完成 | AST 分析器（`scripts/lib/sql-ast-analysis.ts`）+ 严格提取器（`sql-extraction.ts`）+ 常量解析（`sql-constants.ts`）落地；不可静态判定的语句改为 `DYNAMIC_SQL` 按文件+条数+理由登记（11 文件 22 条），违规无豁免。自检：注入真实列漂移（`cron_jobs.bogus_id`、`experience_genes.bogus_status`、被解析清单里的假列）均被拦截并退出非 0；解析器自带的数组折叠缺陷（折叠被 `.push` 的数组会截断语句）在自检中发现并改为拒绝折叠。单测 22 例（分析器拒绝/接受矩阵、提取器、端到端守卫、条数声明）。 |
| T5 | 完成 | 文档随各阶段同步回写：`DATABASE_SCHEMA.md`（43 表 + 治理评议节）、`TESTING.md` / `CI_CD.md` / `DOCUMENTATION_GOVERNANCE.md`（守卫登记与口径）、本细则与 `plan.md` 状态、`open-debt-and-compromises.md`（SQL 漂移与静默降级两节）。 |

## 5. 验收门禁

- `pnpm check:sql-columns` blocking 绿（豁免清空后）；
- 既有守卫（check:docs / check:structure / check:asserts）不回归；
- T2 修复处：修复前该查询路径的运行时行为用临时库实测留证（复用 `run-postgres-coordinated.ts`）——禁止"改了 SQL 没跑过"。

## 6. 风险与已知债务

- **正则覆盖局限**：`${}` 动态拼接列名/表名跳过不报——L2 的 AST 也只能部分覆盖，残余依赖集成测试；
- **豁免清单腐化风险**：豁免条目必须带登记日期与对应债务链接，长期豁免需在债务册挂牌（沿用 `check-route-surface.ts` SURFACE_EXEMPTIONS 的教训：清空优于豁免）；
- **T2 修复方向需原意核实**：gene 写侧引用的列在 Drizzle schema 中同样不存在（非漂移、是代码写错或原表结构演化未同步）——修复前先确认调用方语义，避免"修 SQL 但行为错了"；
- **TTL 缓存陈旧度**：P0-2/P1-2 引入的 60s TTL 与本守卫无冲突，但同一"静默"审查应覆盖所有新增缓存的有效性边界。
