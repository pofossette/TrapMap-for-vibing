# Ingestion Evaluation

Skill ingestion evals verify that TrapMap can import representative Skill directories with frontmatter, references, assets, and scripts.

## Layout

- `run.ts`: CLI runner.
- `adapter.ts`: ingestion adapter used by the runner.
- `assertions.ts`: pass/fail assertions.
- `metrics.ts`: score aggregation.
- `fixtures/`: representative Skill fixture directories.

## Commands

```bash
pnpm eval:ingestion:smoke
pnpm eval:ingestion:dry-run
```
