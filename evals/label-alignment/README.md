# Label Alignment Eval

Standalone scaffold for label-alignment evaluation.

Current scope:

- validated smoke fixture loading
- deterministic dry-run execution
- live-mode scaffold that calls real label-alignment interfaces when adapters are supplied
- structured metrics for synonym elimination, missed merges, false merges, alignment accuracy, and recall reasons

Local usage:

```bash
rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/label-alignment/run.ts --tier smoke --mode dry-run
```

JSON output:

```bash
rtk pnpm exec tsx --tsconfig tsconfig.base.json evals/label-alignment/run.ts --tier smoke --mode dry-run --json
```

## Owner 与变更门禁

- **Owner**：label-alignment eval owner
- **Tier 状态**：smoke 是 CI 门禁 tier；core fixture 已归档到 `archived/fixtures/`（`--tier core` 仍可手动运行，不进 CI）
- **变更必跑**：`rtk pnpm test:file -- evals/promptfoo/parity-label-alignment.test.ts`（快照 parity）+ `rtk pnpm test:file -- evals/label-alignment/core.test.ts`（fixture 加载与 dry-run）
- 修改 fixture/case 后若判定发生变化，需同步重新生成并提交 parity 快照（`pnpm eval:snapshots`）
