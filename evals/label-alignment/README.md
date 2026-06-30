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
