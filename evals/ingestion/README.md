# Ingestion Evaluation

你用这个套件验证 skill 目录（含 frontmatter、references、assets、scripts）的导入能力。

## 跑法

```bash
pnpm --filter @trapmap/evals eval:ingestion:smoke
pnpm --filter @trapmap/evals eval:ingestion:dry-run
pnpm --filter @trapmap/evals eval:ingestion
```

smoke 为 CI 门禁 tier，core fixture（`with-assets-and-scripts`）已归档到 `evals/ingestion/archived/fixtures/`，`--tier core` 只供手动运行。入口为 `evals/ingestion/run.ts`，适配器见 `evals/ingestion/adapter.ts`，断言见 `evals/ingestion/assertions.ts`，计分见 `evals/ingestion/metrics.ts`，用例见 `evals/ingestion/fixtures/`。

## 结果读法

你读 pass / fail 断言与聚合分数。`evals/ingestion/fixtures/minimal-skill` 同时被 agent-planning smoke 消费，你不得移除或改名。改 fixture / 断言后若判定变化，你同步重跑 parity 快照（`pnpm --filter @trapmap/evals eval:snapshots`）并提交。
