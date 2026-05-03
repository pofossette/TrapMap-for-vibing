---
phase: 58
slug: evidence-metadata-verification-surface
tool: none
preset: not applicable
created: 2026-05-02
---

# Phase 58 — UI Design Contract

> Evidence Metadata & Verification Surface — CLI/Backend Phase

---

## Design System

**Tool:** none (CLI/Backend phase)
**Preset:** not applicable
**Component library:** none

This phase is primarily a backend/CLI phase with no visual UI components. The design contract focuses on CLI output formatting and API response structures.

---

## CLI Output Patterns

### Evidence Display (Detailed)

When displaying full evidence metadata (e.g., `knowledge get <id>`):

```
Evidence:
  Level: verified-in-prod
  Source: incident (INC-1234)
  Verified: 2026-05-02 by @alice
```

**Format rules:**
- Indent: 2 spaces
- Field labels: Title case
- Empty state: "No evidence recorded"

### Evidence Hint (Compact)

In retrieval responses, evidence shown as compact single-line:

```
[EVIDENCE: verified-in-prod | incident | 2026-05-02]
```

**Fields included:** `evidenceLevel`, `sourceType`, `verifiedAt` (NOT `sourceRef` or `verifiedBy`)

### Empty State

When `evidenceMeta` is null/missing:

```
Evidence: (none)
```

---

## CLI Input Flags

### Review Command Extensions

```bash
trapmap review:approve <id> \
  --evidence-type <incident|doc|code|internal-experience|external-reference> \
  --evidence-ref <reference-string> \
  --evidence-level <verified-in-prod|documented|reproduced|anecdotal>
```

**Validation:**
- If `--evidence-level` is `verified-in-prod` or `documented`, `--evidence-ref` is required
- If `--evidence-type` is provided without `--evidence-level`, default to `reproduced`

### Evidence Update Command

```bash
trapmap evidence:update <id> \
  --level <verified-in-prod|documented|reproduced|anecdotal> \
  --type <source-type> \
  --ref <reference> \
  --by <verifier>
```

---

## Evidence Levels

| Level | ANSI Color | Semantic |
|-------|------------|----------|
| `verified-in-prod` | `\x1b[32m` (green) | Verified in production environment |
| `documented` | `\x1b[33m` (yellow) | Documented in authoritative source |
| `reproduced` | `\x1b[35m` (magenta) | Reproduced in development/staging |
| `anecdotal` | `\x1b[90m` (dim) | Internal experience, not externally validated |

**Accessibility:** Respect `NO_COLOR` env var and `isTTY` check.

---

## Source Types

1. `internal-experience` — Team's own experience
2. `incident` — Post-incident analysis (reference to incident ID)
3. `doc` — External documentation (link to docs)
4. `code` — Source code reference (file/path reference)
5. `external-reference` — External knowledge base, blog, paper

---

## Copywriting

### Messages

| Context | Message |
|---------|---------|
| Empty state heading | "No evidence recorded" |
| Empty state body | "This entry has not been verified. Add evidence metadata during review to improve trustworthiness." |
| Error: missing ref | "Evidence reference required for verified-in-prod/documented levels" |
| Error: missing type | "Evidence type required when reference is provided" |
| Success | "Evidence updated: {level} | {sourceType}" |

---

## API Response Extensions

### Retrieval Match Schema

Add optional `evidence` field to match responses:

```typescript
evidence?: {
  level: 'verified-in-prod' | 'documented' | 'reproduced' | 'anecdotal';
  sourceType: string;
  verifiedAt: string; // ISO timestamp
}
```

### Admin Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `evidenceLevel` | string | Filter by evidence level |
| `missingEvidence` | boolean | Only entries without evidence |
| `sourceType` | string | Filter by source type |
| `verifiedBefore` | string | ISO date — entries verified before |
| `verifiedAfter` | string | ISO date — entries verified after |

---

## Acceptance

- [ ] CLI output follows evidence display patterns
- [ ] CLI input accepts evidence flags on review
- [ ] Evidence levels use semantic colors with NO_COLOR support
- [ ] Retrieval responses include compact evidence hints
- [ ] Admin query supports evidence filters

---

*UI-SPEC for Phase 58: Evidence Metadata & Verification Surface*
