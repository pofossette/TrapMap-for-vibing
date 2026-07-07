# 文档漂移与翻译修复清单

> 更新于 2026-07-07。本文件已从“首轮大盘点草稿”收缩为“当前仍成立且已复核的问题清单”。2026-07-07 本轮批次已收口后，当前不再保留未修复项；后续若出现新的文档漂移，应新开一份活跃清单。

## 当前定位

- 只保留已被源码、truth source 或 workflow 复核确认的当前问题
- 已闭环项直接从活跃列表移出；需要历史审计背景时回看归档报告或 superpowers plan
- 若后续继续做一轮全面文档盘点，应新开一份分批执行清单，而不是把旧审计结果长期挂在 active todo

## 当前状态

本轮计划中的 4 个剩余问题已全部闭环：

| ID | 文件 | 原问题 | 当前结果 |
|---|---|---|---|
| H-01 | `docs/architecture/DEPLOYMENT.md` | 监控段仍写 `TRAPMAP_LOKI_ENABLED` / `TRAPMAP_LOKI_URL`，与当前 `LOKI_HOST` 口径冲突 | 已改成 `LOKI_HOST` 口径，并移除旧变量名 |
| H-02 | `docs/architecture/components/PERSISTENCE.md` | 仍写“共 57 张表”，而当前 `docs/reference/DATABASE_SCHEMA.md` 已是 `63 张表` | 已改成不写死数量、直接指向当前 truth source |
| M-01 | `docs/operations/CI_CD.md` | 仍写“默认有七个 job”；该表述容易随 workflow 漂移，而且当前文档没有把“以 `ci.yml` 为准”写得足够强 | 已改成“以 `ci.yml` 中定义为准”，并加上本次复核日期 |
| M-02 | `docs/operations/CI_CD.md` | 漂移规则示例中仍提到 `PERSISTENCE.md` 的“56 张表”旧描述，和当前仓库事实不一致 | 已改成稳态表述，不再复述过期表数 |

## 已从活跃清单移出的已闭环项

下列项目已在目标文档中复核到修复结果，不再继续保留为 active todo：

- `docs/reference/DOCS_TRUTH_MATRIX.md` 对 `trapmap-architecture-remediation-plan.md` 的引用已改到真实归档路径
- `docs/guides/MIGRATION_GUIDE.md` 已移除 `pnpm dev:server:compat*` 过时入口，并纳入 `service-knowledge-read`
- `docs/operations/OBSERVABILITY-OPERATIONS.md` 已统一到 `OTEL_DISABLED`、`OTEL_SAMPLE_RATE`、`OTEL_EXPORTER_OTLP_ENDPOINT`、`LOKI_HOST`
- `docs/architecture/OBSERVABILITY.md` 已统一到 `OTEL_DISABLED` 语义
- `docs/operations/ENVIRONMENT.md` 已把 `TRAPMAP_EVAL_PLATFORM` 明确标成“仅作记录/占位”
- `packages/server/src/routes/README.md` 已补入 `routes/feedback-admin/`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md` 已补入 `labels.ts`
- `docs/README.md` 已更新为 `63 张表`
- `docs/operations/CI_CD.md` 已同步 `fallow-push-audit` 当前命令、`ci.yml` Node 24 与 `eval.yml` Node 20 的差异，以及 coverage artifact 未显式设置保留期
- `docs/architecture/DEPLOYMENT.md` 已统一到 `LOKI_HOST` 口径
- `docs/architecture/components/PERSISTENCE.md` 已移除过期表数写死
- `docs/operations/CI_CD.md` 已移除“默认七个 job”写死表述，并刷新过期 doc-drift 示例

## 本轮验证

本轮完成后应复核：

```bash
rtk pnpm check:docs-drift
rtk pnpm check:structure
rtk pnpm check:links
```

## 备注

- 本清单不再追踪“翻译优化但不构成漂移”的项目；这类工作应单独立项
- 如果下一轮要做全面中文化或 README 审计，应新建活跃细则，避免再次把“已审过但已失效”的旧盘点长期挂在 `docs/todos/`
