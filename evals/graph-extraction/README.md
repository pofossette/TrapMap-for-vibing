# Graph Extraction Evaluation

Evaluates the LLM graph extraction pipeline against annotated ground truth fixtures.

## Usage

### Live mode

```bash
pnpm eval:graph-extraction
```

### Dry-run mode

```bash
pnpm eval:graph-extraction --dry-run
```

Dry-run no longer simulates a rule-engine baseline. It validates runner wiring only and reports `unavailable`.

### Smoke mode

```bash
pnpm eval:graph-extraction --smoke
pnpm eval:graph-extraction --smoke --dry-run
```

## Status reporting

The runner reports one mode per case:

| Mode | Meaning |
|------|---------|
| `live` | LLM extraction succeeded |
| `unavailable` | No chat provider was configured, or dry-run intentionally skipped LLM |
| `error` | LLM invocation failed |
| `empty` | LLM returned no usable extraction |

A run should be treated as true quality evidence only when all cases are `live`.

## Interpreting results

- Dry-run output is not a baseline and should not be used to judge extraction quality.
- `DEGRADED` means one or more cases did not produce usable live extraction.
- Edge metrics are meaningful only for `live` cases.

## Fixtures

Fixtures are split across two files:
- `fixtures.ts`
- `fixtures-real.ts`

## Dedup & Conflict Evaluation

```bash
pnpm eval:dedup
pnpm eval:dedup:dry-run
pnpm eval:conflict
pnpm eval:conflict:dry-run
```
