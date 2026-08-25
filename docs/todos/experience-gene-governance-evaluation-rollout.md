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

## Documentation closeout

- [ ] Update `docs/architecture/components/ARTIFACTS.md` for Gene as derived asset。
- [ ] Update `docs/reference/DATA_MODEL.md` and `DATABASE_SCHEMA.md`。
- [ ] Update `docs/reference/api-surface.md`。
- [ ] Update CLI/MCP/client integration guides。
- [ ] Update operations testing, observability, and environment pages with the rollout mode。
- [ ] Confirm root `plan.md`, owner mainline and subdocument indexes agree。

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
