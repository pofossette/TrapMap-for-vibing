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

## Live-vs-Fallback Reporting

The runner now reports the extraction **mode** for each case and in aggregate:

| Mode | Meaning |
|------|---------|
| live | LLM extraction succeeded |
| fallback | Rule-engine extraction was used instead |

A case is marked **degraded** when live mode was requested but the LLM was unavailable (provider not configured or extraction failed). Degraded cases are flagged with ! in the per-case table and summarized in the report footer.

**Required environment for live mode:**
- OPENAI_API_KEY (or equivalent chat provider config) must be set
- Without it, all cases degrade to fallback mode

**Interpreting results:**
- A dry-run report shows all cases as fallback — this is expected
- A live report with degraded cases means the chat provider was unavailable
- Only a fully-live report (zero degraded) reflects true LLM extraction quality
- Edge metrics are only meaningful in live mode since the rule-engine fallback produces zero edges

## Integration with eval:smoke

The graph extraction eval is included in the unified `pnpm eval:smoke` runner
in dry-run mode. To run with live LLM calls:

```bash
pnpm eval:graph-extraction --smoke
```

## Fixtures

Fixtures are split across two files:
- `fixtures.ts` — 17 hand-crafted entries covering core extraction patterns
- `fixtures-real.ts` — 5 real-skill derived entries from actual SKILL.md content

Combined coverage includes:
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
