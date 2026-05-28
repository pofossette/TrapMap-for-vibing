# Graph Extraction Evaluation

Evaluates the LLM graph extraction pipeline against annotated ground truth fixtures.

## Metrics

| Metric | Description |
|--------|-------------|
| Node Precision | Fraction of extracted nodes that match expected (by kind:label) |
| Node Recall | Fraction of expected nodes that were extracted |
| Node F1 | Harmonic mean of precision and recall |
| Edge Precision | Fraction of extracted edges that match expected (by source+target+type) |
| Edge Recall | Fraction of expected edges that were extracted |
| Edge F1 | Harmonic mean of precision and recall |
| Strength Accuracy | Fraction of matched edges with correct hard/soft strength |

All metrics are micro-averaged across all fixtures (pooled TP/FP/FN).

## Usage

### Live mode (requires AI_CHAT_MODEL configured)

```bash
pnpm eval:graph-extraction
```

### Dry-run mode (no LLM calls, uses rule-engine mock)

```bash
pnpm eval:graph-extraction --dry-run
```

### Smoke mode (first 5 fixtures only)

```bash
pnpm eval:graph-extraction --smoke
pnpm eval:graph-extraction --smoke --dry-run
```

### Verbose output

```bash
pnpm eval:graph-extraction -v
```

## Integration with eval:smoke

The graph extraction eval is included in the unified `pnpm eval:smoke` runner
in dry-run mode. To run with live LLM calls:

```bash
pnpm eval:graph-extraction --smoke
```

## Fixtures

Fixtures are in `fixtures.ts` (22 entries — 17 hand-crafted + 5 real-skill derived — covering):
- Simple tool/cue/mitigation extraction
- Complex multi-entity entries
- Negation sentences (should NOT extract negated entities)
- Implicit prerequisites
- Order relations between skills
- Risk-blocks relationships
- Co-occurrence (hard vs soft strength)
- Environment-specific traps
- Multiple mitigations for same problem

## Dedup & Conflict Evaluation

Two additional eval scripts test deduplication and conflict detection:

```bash
# Dedup eval
pnpm eval:dedup
pnpm eval:dedup:dry-run

# Conflict eval
pnpm eval:conflict
pnpm eval:conflict:dry-run
```

Fixtures for these evals are in `dedup-fixtures-real.ts` and `conflict-fixtures-real.ts`.

## Adding new fixtures

Add entries to `graphExtractionFixtures` array in `fixtures.ts`:

```typescript
{
  id: 'descriptive-id',
  input: 'Natural language text to extract from',
  expectedNodes: [
    { kind: 'tool', label: 'docker' },
  ],
  expectedEdges: [
    { source: 'docker', target: 'timeout', type: 'co-occurs-with', strength: 'soft' },
  ],
}
```
