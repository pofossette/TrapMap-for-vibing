# Experience Gene Eval

你用这个套件衡量 experience gene 候选的排序与治理口径（`baseline` / `shadow` / `serve` 三档模式）。

## 跑法

```bash
pnpm --filter @trapmap/evals eval:experience-gene
```

入口为 `evals/experience-gene/run.ts`，接受 `--tier smoke|core`（默认 `smoke`）与 `--mode baseline|shadow|serve`（默认 `shadow`），类型见 `evals/experience-gene/types.ts`，执行器见 `evals/experience-gene/lib/runner.ts`，用例见 `evals/experience-gene/datasets/smoke.ts` 与 `core.ts`（`governance.ts` 为治理口径 fixture helper）。

## 结果读法

你读输出 JSON report 的候选视图（语义分、关键词分、信号匹配）与聚合判定。`--tier core --mode serve` 下 `promotionEligible` 为假时进程以非零退出码结束，你把它当作晋升门禁信号读。
