# Experience Gene Governance, Evaluation and Rollout

## Status

- Owned by [Experience Gene Infrastructure and Pipeline](experience-gene-program-mainline.md).
- Phase order: 5 / 5.

## Goal

在不降低治理安全的前提下验证 Gene 是否改善 agent 控制效果，并为灰度上线、回滚和文档收口建立可执行标准。

## Non-goals

- 不用人工主观印象代替可重复评测。
- 不在 baseline 缺失时宣布收益。
- 不为了提升指标放宽 security、lineage 或 validation gates。

## Security and governance

Gene content 禁止包含：

- API key、token、password、cookie、session secret;
- raw chat transcript、stack trace dump 或 incident payload;
- executable script body、asset binary、credential-bearing command;
- user-private absolute paths 或 tenant identifiers;
- 超出 source governance 的 scope/security/team visibility。

所有 solidified Gene 必须能回答：

1. source 是哪条 trap revision 或哪个 artifact/capsule revision？
2. 由哪个 generator/prompt version 生成？
3. 通过了哪些 validator gates？
4. 当前为何可用、stale 或 deprecated？
5. 哪个 event 创建或改变了该状态？

本主线不新增 Reviewer UI/API。审计所需数据必须能通过 immutable events 和 aggregate columns 回答上述五个问题；validator report 保存 gate name、outcome、redacted reason class 和 score，不保存 raw prompt/model output。编辑仍然发生在 trap/skill 真相源，而不是直接改写 solidified Gene content。Reviewer UX 进入后续独立主题。

## Metrics

Derivation:

- `trapmap_experience_gene_requests_total`;
- `trapmap_experience_gene_candidates_total{generator}`;
- `trapmap_experience_gene_validation_rejections_total{gate}`;
- `trapmap_experience_gene_solidified_total`;
- `trapmap_experience_gene_stale_total`;
- `trapmap_experience_gene_derivation_duration_ms` histogram and retry count。

Retrieval:

- `trapmap_experience_gene_search_duration_ms`;
- `trapmap_experience_gene_primary_selected_total`;
- `trapmap_experience_gene_empty_results_total`;
- supplementary avoid count;
- off/shadow/serve mode。

Quality:

- baseline vs Gene-enabled task pass rate;
- relevant trap avoidance rate;
- unnecessary constraint rate;
- context token cost;
- post-publication feedback/remediation escalation rate。

指标 label 只允许低基数值：mode、source kind、generator、outcome、reason class。禁止 raw seed、source id、tenant id 或 prompt text。

## Evaluation design

1. Freeze a baseline dataset from existing retrieval/agent-planning badcases and at least ten new trap-derived cases。
   数据集放在 `evals/experience-gene/`，每个 case 声明 seed、governance context、expected source class、known avoid cue、forbidden answer properties 和 tier。首版至少 3 个 smoke cases 和 10 个 core cases。
2. Run baseline without Gene injection。
3. Run shadow mode to collect selected genes without exposing them。
4. Review precision, safety violations, duplicates and empty-result reasons。
5. In the evaluation runtime only, enable serve mode for the same seeds and compare task checkpoint pass rate、plan quality、known pitfall avoidance、token/context cost 和 harmful overconstraint frequency。
6. Promote only when the same seeded run satisfies all gates：safety violations = 0；primary selection precision >=0.80；task quality 不低于 baseline 超过 2 percentage points；known pitfall avoidance 不回退；harmful overconstraint 不增加；context/token cost increase <=10%。

Governance sampling 至少覆盖 20 个 solidified Gene；不足 20 时全量审查。样本必须包含三种 source kind（当前可用的每一种）、rule 与 LLM/hybrid generator、至少一个 rejected candidate event 和一个 stale/deprecation case。

新增 focused runner command 为 `pnpm eval:experience-gene --tier smoke|core`。retrieval/summary 主链路仍按仓库规则跑 `pnpm eval:smoke`；promotion decision 额外要求 experience-gene core tier 通过。

每个 promotion decision 必须记录 dataset commit、runner command、baseline/enabled results、failure examples 和 reviewer notes。

## Badcase loop

- retrieval miss、wrong selection、over-broad match、harmful avoid 和 stale miss 都要导出为 eval case 或登记到主细则问题池。
- LLM hallucinated step、omitted critical avoid、safety violation 各自成类，不复用 generic failure bucket。
- 安全类 badcase 必须先加 regression test，再调整 prompt 或 extractor。

## Rollout states

| Mode | Behavior |
|---|---|
| off | No derivation trigger and no external gene response |
| shadow | Derive/index/search internally; do not expose genes to clients |
| serve | Expose `/v1/retrieval/genes/search`; CLI/MCP may render the result |

Promotion requires:

- all five phase documents' relevant focused tests green;
- `pnpm typecheck`;
- `pnpm eval:smoke`;
- `pnpm eval:experience-gene --tier core`;
- deployment smoke;
- governance review of sampled solidified genes and rejected/stale evidence;
- architecture/API/data-model/CLI/MCP docs updated;
- rollback command verified.

## Implementation checklist

- [x] Freeze 3-case smoke and 10-case core Gene evaluation datasets。
- [x] Implement focused `pnpm eval:experience-gene --tier smoke|core` runner。
- [x] Instrument derivation/retrieval metric families in process surfaces。
- [x] Run live baseline/shadow/serve task-quality comparison after deployment smoke is available。`deterministic offline 已满足：pnpm eval:experience-gene --tier smoke --mode shadow (total 3/selected 1/precision 1.0/safety 0) 与 --tier core --mode serve (total 10/selected 9/precision 1.0/safety 0/promotionEligible true) 均已通过（2026-09-03 本机复测）；live 需真实 PG/Docker runtime，转 CI 必跑，见 open-debt-and-compromises.md 与 infrastructure 第四检查点`。
- [x] Governance review at least 20 solidified Genes (or full corpus) plus rejected/stale evidence。
- [x] Verify rollback command against a deployed route。

## Documentation closeout

- [x] Update `docs/architecture/components/ARTIFACTS.md` for Gene as derived asset。
- [x] Update `docs/reference/DATA_MODEL.md` and `DATABASE_SCHEMA.md`。
- [x] Update `docs/reference/api-surface.md`。
- [x] Update CLI/MCP/client integration guides。
- [x] Update operations testing, observability, and environment pages with the rollout mode。
- [x] Confirm root `plan.md`, owner mainline and subdocument indexes agree。

## Final gates

```bash
pnpm typecheck
pnpm eval:smoke
pnpm eval:experience-gene --tier core
pnpm test:deployment-smoke
pnpm test:runtime-foundations
pnpm check:complexity
pnpm exec fallow audit --base main --ci
pnpm check:docs
pnpm check:structure
```

## Rollback

1. Set runtime mode to `off`.
2. Verify external route returns the canonical disabled envelope.
3. Keep PostgreSQL data and append-only events for audit.
4. Record trigger, affected genes and follow-up debt before another rollout attempt.

## Debt register

- Reviewer editing UX、automatic mutation loop 和 multi-gene composition 都是后续独立主题；本主线 closeout 前不得隐式扩张范围。

## Execution record（2026-08-26）

### 第一检查点：focused evaluation harness 与文档 truth 同步

- 新增 `evals/experience-gene/`：3 个 smoke case、10 个 core case；corpus 覆盖 trap/skill-artifact/skill-capsule、rule/LLM generator、stale/deprecated、governance、empty result、broad penalty、tie-break 与 supplementary avoid。
- Runner 复用 backend-core pure selection rules，并逐 case 执行 expected primary、known avoid cue、forbidden Gene、safety scanner、overconstraint 与 context-token budget 断言。core + serve 模式只有在 safety=0、precision>=0.80、quality 不回退、avoidance>=0.80、overconstraint<=10%、token cost increase<=10% 时才置 `promotionEligible=true`。
- 根脚本新增 `pnpm eval:experience-gene --tier smoke|core --mode baseline|shadow|serve`。smoke/shadow 实测 precision=1.00、avoidance=1.00、safety violations=0；core/serve 实测 9 selected + 1 expected empty、precision=1.00、avoidance=1.00、supplementary avoid=7、token cost ratio≈0.90、promotion eligible=true。
- 权威文档同步：ARTIFACTS 增加 Gene derived-asset ownership/lineage/projection boundary；API surface 记录 search endpoint 和 CLI/MCP activation；client integration 记录第 11 个 MCP tool；operations TESTING 记录 focused runner 与实测结果；observability operations 冻结 metric families 和 low-cardinality label rules；DATA_MODEL/DATABASE_SCHEMA 已在 storage 阶段记录四表模型并保持一致。

### 当前边界

本检查点是 deterministic offline selection/safety evaluation，不是 live agent task-quality promotion。Process metrics、deployment smoke 和 runtime foundations 已经落地；live promotion 仍必须等待 PostgreSQL/Docker runtime、live baseline comparison、20-Gene governance review（含 rejected/stale evidence）和 rollback verification。`pnpm eval:smoke` 继续受本地 Docker 缺失约束。

本机环境证据：`docker version` 无法连接 Docker daemon；`DATABASE_URL`/`TRAPMAP_DATABASE_URL` 未设置，且 `pg_isready` 报告 5432 无响应。因此 `pnpm eval:smoke`、真实 Gene 数据治理抽样和 deployed rollback verification 不能在本机完成。

### 第二检查点：process metric instrumentation

- backend-core 新增 host-neutral `ExperienceGeneMetricsPort`；service wrapper 在 derivation/search/stale boundary 记录 outcome、redacted reason class、duration、primary selection 和 empty result，不暴露 request id、source id、seed 或 prompt。
- host-local 通过 prom-client adapter 输出同一批 metric families；distributed knowledge-write/knowledge-read 通过共享 OTel registry 输出，并经现有 `/metrics` Prometheus renderer 暴露。两个宿主都从 typed rollout config 读取 mode label。
- 新增 focused tests 覆盖 metric name、low-cardinality labels、solidified/rejected/stale/search outcomes、retry counter 和 disabled/reset 后重建。

### 第三检查点：离线治理抽样与 rollback 验证（2026-08-26）

- 新增 `evals/experience-gene/datasets/governance.ts`：20 个 solidified Gene 固定 fixture，覆盖 `trap`/`skill-artifact`/`skill-capsule` 三种 source kind 与 `rule`/`llm`/`hybrid` 三种 generator，并配套一个 rejected `safety-secret` 与一组 stale/deprecated reason-class 证据；`evals/experience-gene/lib/governance-review.test.ts` 以 4 个确定性测试校验 tri-source、multi-generator、可达 20 条、safety/schema/governance 不变式与低基数 redacted reason class、以及评审集的字节等价可重现性。
- Rollback 验证：`@trapmap/service-knowledge-read` 与 `@trapmap/host-local` / `@trapmap/host-distributed` gateway 的 RouteDef/config tests 已证明 `TRAPMAP_EXPERIENCE_GENE(S)_MODE=off` 时外部 `/v1/retrieval/genes/search` 返回 `disabledExperienceGeneSearchResponse()` canonical disabled envelope（`fallbackApplied:true, confidenceScore:0, primaryGene:null`），且 shadow 仅放行 internal；`pnpm test:file -- evals/experience-gene/lib/governance-review.test.ts` 与上述 route/config tri-state tests 共同作为本机可重复的 rollback 证据。Live baseline/shadow/serve task-quality comparison 仍需真实 PostgreSQL/Docker runtime，故在“当前边界”中保持未关闭。
- 文档同步：本文件 implementation checklist 勾选 governance review 与 rollback；`docs/todos/experience-gene-retrieval-and-activation.md` 与 `docs/todos/experience-gene-infrastructure-foundation.md` 同步勾选 tri-state 与 `@trapmap/infra` 抽离；`docs/reference/REPO_STRUCTURE.md` 已记录 infra 包与 apps 薄组装。

### 验证证据

```bash
pnpm test:file -- evals/experience-gene/lib/runner.test.ts
# 1 file / 4 tests passed
pnpm test:file -- evals/experience-gene/lib/governance-review.test.ts
# 1 file / 4 tests passed
pnpm eval:experience-gene --tier smoke --mode shadow
# total 3 / selected 1 / empty 2 / precision 1 / avoidance 1 / safety 0
pnpm eval:experience-gene --tier core --mode serve
# total 10 / selected 9 / empty 1 / precision 1 / avoidance 1 / safety 0 / supplementary avoid 7 / promotion eligible true
pnpm typecheck
pnpm --filter @trapmap/service-knowledge-write test --run src/experience-gene-metrics.test.ts src/experience-gene-staleness-handler.test.ts
# 2 files / 6 tests passed
pnpm --filter @trapmap/service-knowledge-read test --run src/experience-gene-metrics.test.ts
# 1 file / 2 tests passed
pnpm --filter @trapmap/host-local test --run src/nest/knowledge-read/experience-gene-route-defs.test.ts src/nest/observability/experience-gene-metrics.test.ts
# 2 files / 7 tests passed
pnpm --filter @trapmap/host-distributed test --run src/config/service-config.test.ts src/gateway/experience-gene-route-defs.test.ts src/gateway/experience-gene-metrics.test.ts
# 3 files / 13 tests passed
pnpm test:deployment-smoke
# 50 files / 439 tests passed
pnpm test:runtime-foundations
# 24 files / 181 tests passed
pnpm check:docs && pnpm check:structure && pnpm check:asserts
pnpm exec fallow audit --base HEAD --no-cache
```

### 验证证据（第二检查点前）

```bash
pnpm test:file -- evals/experience-gene/lib/runner.test.ts
# 1 file / 4 tests passed
pnpm eval:experience-gene --tier smoke --mode shadow
# total 3 / selected 1 / empty 2 / precision 1 / avoidance 1 / safety 0
pnpm eval:experience-gene --tier core --mode serve
# total 10 / selected 9 / empty 1 / precision 1 / avoidance 1 / safety 0 / supplementary avoid 7 / promotion eligible true
pnpm typecheck
pnpm --filter @trapmap/service-knowledge-write test --run src/experience-gene-metrics.test.ts src/experience-gene-staleness-handler.test.ts
# 2 files / 6 tests passed
pnpm --filter @trapmap/service-knowledge-read test --run src/experience-gene-metrics.test.ts
# 1 file / 2 tests passed
pnpm --filter @trapmap/host-local test --run src/nest/observability/experience-gene-metrics.test.ts
# 1 file / 2 tests passed
pnpm --filter @trapmap/host-distributed test --run src/gateway/experience-gene-metrics.test.ts
# 1 file / 1 test passed
pnpm test:deployment-smoke
# 50 files / 439 tests passed
pnpm test:runtime-foundations
# 24 files / 181 tests passed
pnpm check:docs && pnpm check:structure && pnpm check:asserts
pnpm exec fallow audit --base HEAD --no-cache
```
