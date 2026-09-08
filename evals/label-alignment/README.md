# Label Alignment Eval

你用这个套件衡量规范标签对齐（同义消除、漏合并、误合并、对齐准确率）。

## 跑法

```bash
pnpm --filter @trapmap/evals eval:label-alignment:smoke
pnpm --filter @trapmap/evals eval:label-alignment:dry-run
pnpm --filter @trapmap/evals eval:label-alignment
pnpm --filter @trapmap/evals eval:label-alignment:core
```

smoke 为 CI 门禁 tier，core fixture 已归档到 `evals/label-alignment/archived/fixtures/`，`--tier core` 只供手动运行。入口为 `evals/label-alignment/run.ts`，核心实现见 `evals/label-alignment/core.ts`，用例见 `evals/label-alignment/fixtures/`。

## 结果读法

你读同义消除、漏合并、误合并、对齐准确率与召回原因五组指标。改 fixture / case 后若判定变化，你同步重跑 parity 快照（`pnpm --filter @trapmap/evals eval:snapshots`）并提交。
