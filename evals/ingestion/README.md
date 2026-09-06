# Ingestion Evaluation

Skill ingestion evals verify that TrapMap can import representative Skill directories with frontmatter, references, assets, and scripts.

## Layout

- `run.ts`: CLI runner.
- `adapter.ts`: ingestion adapter used by the runner.
- `assertions.ts`: pass/fail assertions.
- `metrics.ts`: score aggregation.
- `fixtures/`: smoke-tier Skill fixture directories (`with-frontmatter`, `minimal-skill`; `minimal-skill` 同时被 agent-planning smoke 消费，不得移除)。
- `archived/fixtures/`: Wave 8 归档的 core-tier fixture（`with-assets-and-scripts`），仍由 `fixtures/index.ts` 按手动 `--tier core` 加载。

## Commands

```bash
pnpm --filter @trapmap/evals eval:ingestion:smoke
pnpm --filter @trapmap/evals eval:ingestion:dry-run
```

## Owner 与变更门禁

- **Owner**：ingestion eval owner
- **Tier 状态**：smoke 是 CI 门禁 tier；core fixture 已归档（`--tier core` 仍可手动运行，不进 CI）
- **变更必跑**：`pnpm test:file -- evals/promptfoo/parity-ingestion.test.ts`（快照 parity）+ `pnpm --filter @trapmap/evals eval:ingestion:smoke`
- 修改 fixture/断言后若判定发生变化，需同步重新生成并提交 parity 快照（`pnpm --filter @trapmap/evals eval:snapshots`）
