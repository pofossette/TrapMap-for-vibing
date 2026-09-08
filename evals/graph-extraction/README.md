# Graph Extraction Evaluation

你用这个套件对照标注真相衡量 LLM 图谱抽取流水线。

## 跑法

```bash
pnpm --filter @trapmap/evals eval:graph-extraction:smoke
pnpm --filter @trapmap/evals eval:graph-extraction:dry-run
pnpm --filter @trapmap/evals eval:graph-extraction
pnpm --filter @trapmap/evals eval:dedup
pnpm --filter @trapmap/evals eval:dedup:dry-run
pnpm --filter @trapmap/evals eval:conflict
pnpm --filter @trapmap/evals eval:conflict:dry-run
```

入口为 `evals/graph-extraction/run.ts`（抽取）、`evals/graph-extraction/dedup-eval.ts`（去重）、`evals/graph-extraction/conflict-eval.ts`（冲突），真相拆分在 `evals/graph-extraction/fixtures.ts`、`fixtures-real.ts`、`dedup-fixtures-real.ts`、`conflict-fixtures-real.ts`，实现见 `evals/graph-extraction/lib/`。

## 结果读法

你按 case 读 `live` / `unavailable` / `error` / `empty` 四种模式，只有全 `live` 的运行才算质量证据。dry-run 只校验 runner 接线并报告 `unavailable`，你不拿它判断抽取质量。`DEGRADED` 表示一个以上 case 未产出可用 live 抽取，边指标只对 `live` case 有意义。
