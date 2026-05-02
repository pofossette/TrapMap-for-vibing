# Phase 52: Boundary Capture in Submission Flow - Research

**Researched:** 2026-05-02
**Domain:** Submission pipeline, agent extraction, reviewer confirmation
**Confidence:** HIGH

## Summary

Phase 52 integrates the Boundary schema (defined in Phase 51) into the full submission-to-review pipeline. The current submission flow is: CLI submit -> server-side pre-review (token overlap scoring) -> agent-pass/agent-rejected -> reviewer queue -> approve/reject. This phase must add boundary input at the CLI layer, boundary extraction via the existing AI chat provider, boundary propagation through the API schemas, boundary display in the review queue, and boundary editing at the reviewer decision step.

**Primary recommendation:** Extend the existing submission flow at four touch points: (1) CLI `--boundary` flag for JSON input, (2) pre-review pipeline to extract candidate boundaries using the existing `ChatProvider`, (3) API schemas to carry boundary through the pipeline, and (4) review decision endpoint to accept boundary modifications. The boundary extraction should be a best-effort suggestion that the reviewer confirms or overrides, not a gate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Boundary CLI flag parsing | CLI (packages/cli) | -- | User input happens at the terminal |
| Boundary JSON validation | Contracts (packages/contracts) | -- | Zod schema already exists in boundary.ts |
| Boundary extraction via LLM | Server (packages/server) | -- | Uses existing ChatProvider infrastructure |
| Boundary storage on records | Server (packages/server) | -- | KnowledgeRecord/SkillArtifactRecord already have boundary: null |
| Boundary in API responses | Contracts + Server | -- | knowledgeEntrySchema needs boundary field |
| Boundary in review queue | Server (packages/server) | -- | Review queue items carry entry data |
| Boundary modification at review | Server (packages/server) | -- | Review decision endpoint needs boundary payload |
| Reviewer CLI boundary display | CLI (packages/cli) | -- | formatQueue/formatEntry need boundary rendering |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BOUND-02 | Authors can input boundary constraints during submission; agent can extract candidate boundaries; reviewers can confirm boundaries | Four integration points: CLI flag, pre-review extraction, API schema propagation, review decision with boundary |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | (existing) | Boundary schema validation | `boundarySchema` already defined in `packages/contracts/src/domain/boundary.ts` [VERIFIED: codebase] |
| Commander | ^14.0.1 | CLI flag parsing | Already used in all CLI commands [VERIFIED: packages/cli/package.json] |
| Fastify | (existing) | API route handling | All routes use Fastify plugin pattern [VERIFIED: codebase] |
| @langchain/openai | (existing) | Chat provider for boundary extraction | `ChatProvider` interface already exists with `invoke(system, user)` method [VERIFIED: packages/server/src/lib/ai/providers.ts] |

### No new packages needed
All infrastructure exists. This phase is integration work across existing packages.

## Architecture Patterns

### System Architecture Diagram

```
Author (CLI)                  Server                         Reviewer (CLI)
     |                          |                                |
     |  submit --boundary JSON  |                                |
     |------------------------->|                                |
     |                          |                                |
     |                    [Validate boundary                      |
     |                     via boundarySchema]                    |
     |                          |                                |
     |                    [Pre-review pipeline]                  |
     |                     - existing duplicate/correctness      |
     |                     - NEW: boundary extraction via LLM   |
     |                          |                                |
     |                    [Merge: author boundary                |
     |                     + extracted candidates]               |
     |                          |                                |
     |                    [Store boundary on record]             |
     |                          |                                |
     |  response with boundary  |                                |
     |<-------------------------|                                |
     |                          |                                |
     |                          |   review:queue (boundary shown)
     |                          |------------------------------- >|
     |                          |                                |
     |                          |  review:approve/reject          |
     |                          |  + modified boundary            |
     |                          |<-------------------------------|
     |                          |                                |
     |                    [Store final boundary                  |
     |                     on review decision]                   |
```

### Recommended Project Structure
```
packages/contracts/src/domain/
  boundary.ts          -- EXISTING: schema definition
  knowledge.ts         -- MODIFY: add boundary to submission + entry schemas
  review.ts            -- MODIFY: add boundary to review decision schema
packages/server/src/lib/
  pre-review.ts        -- MODIFY: add boundary extraction step
  knowledge.ts         -- MODIFY: propagate boundary through record creation
  boundary-extract.ts  -- NEW: LLM-based boundary extraction logic
packages/server/src/routes/
  knowledge.ts         -- MODIFY: pass boundary through submission
  review.ts            -- MODIFY: accept boundary in review decision
packages/cli/src/commands/
  trap.ts              -- MODIFY: add --boundary flag to submit/resubmit
  knowledge.ts         -- MODIFY: add --boundary flag to submit/resubmit
  review.ts            -- MODIFY: display boundary in queue, accept in approve/reject
```

### Pattern 1: Extending Submission Schema with Boundary
**What:** Add optional boundary to submission payload
**When to use:** All submission endpoints (knowledge, trap, skill)
**Example:**
```typescript
// In packages/contracts/src/domain/knowledge.ts
export const knowledgeSubmissionSchema = z.object({
  teamId: entityIdSchema.nullable().optional(),
  scope: scopeSchema,
  labels: z.array(labelSchema).min(1),
  shortcut: z.string().min(1).max(280),
  detail: z.string().min(1).max(10000),
  requiredLevel: securityLevelSchema.optional(),
  // NEW: optional author-provided boundary
  boundary: boundarySchema.nullable().optional(),
});
```

### Pattern 2: Boundary Extraction via ChatProvider
**What:** Use the existing `ChatProvider.invoke(system, user)` to extract candidate boundaries
**When to use:** During pre-review pipeline after basic validation
**Example:**
```typescript
// In packages/server/src/lib/boundary-extract.ts
import type { ChatProvider } from './ai/types.js';
import { boundarySchema, type Boundary } from '@trapmap/contracts';

interface BoundaryExtractionInput {
  shortcut: string;
  detail: string;
  labels: string[];
  authorBoundary: Boundary | null;
}

export async function extractCandidateBoundaries(
  chat: ChatProvider,
  input: BoundaryExtractionInput,
): Promise<Boundary | null> {
  if (!chat.isConfigured) {
    return input.authorBoundary; // Fall back to author input only
  }

  const systemPrompt = `You are a boundary extraction assistant. Analyze the knowledge entry and extract structured boundary constraints...`;
  const userMessage = `Title: ${input.shortcut}\nDetail: ${input.detail}\nLabels: ${input.labels.join(', ')}`;

  const response = await chat.invoke(systemPrompt, userMessage);
  const parsed = JSON.parse(response);
  return boundarySchema.nullable().parse(parsed);
}
```

### Pattern 3: Reviewer Boundary Confirmation
**What:** Extend review decision with optional boundary override
**When to use:** When reviewer approves/rejects and wants to modify boundaries
**Example:**
```typescript
// In packages/contracts/src/domain/review.ts
export const reviewDecisionRequestSchema = z.object({
  entryId: entityIdSchema,
  decision: z.enum(['approve', 'reject']),
  notes: z.string().min(1).max(2000),
  // NEW: reviewer can override the boundary
  boundary: boundarySchema.nullable().optional(),
});
```

### Anti-Patterns to Avoid
- **Blocking submission on boundary extraction failure:** Extraction is best-effort. If the LLM call fails or times out, proceed with author-provided boundary (or null). The reviewer is the final authority.
- **Requiring boundary for submission:** Boundary is optional. Many knowledge entries may not have meaningful boundaries. Do not make it required.
- **Running LLM extraction synchronously in the request path:** The pre-review pipeline already runs synchronously. Keep extraction fast (single LLM call with strict timeout). If it becomes a bottleneck, move to async in a later phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Boundary validation | Custom JSON parser | `boundarySchema` from `@trapmap/contracts` | Already defined in Phase 51 with 43 tests |
| LLM chat invocation | Raw HTTP calls to OpenAI | `ChatProvider.invoke(system, user)` | Existing abstraction handles provider detection, fallbacks |
| CLI flag for JSON input | Custom parser | Commander `.option()` with JSON.parse | Commander handles flag parsing; JSON.parse handles the value |
| Boundary merge logic | Complex merge algorithm | Simple author + extracted union, reviewer final say | No automated merge needed; reviewer is the authority |

**Key insight:** The boundary schema, AI provider, and submission pipeline already exist. This phase is purely integration work -- threading the boundary field through four layers.

## Common Pitfalls

### Pitfall 1: knowledgeEntrySchema Missing Boundary
**What goes wrong:** The `knowledgeEntrySchema` (the API response schema in contracts) does not include a `boundary` field. `toKnowledgeEntry()` in `knowledge.ts` does not map the boundary from the store record to the API response. If boundary is added to the store but not the schema, the API silently drops the field.
**Why it happens:** The schema and the mapper were built independently. Phase 51 added `boundary: null` to the store record but did not touch the API response schema.
**How to avoid:** Add `boundary: boundarySchema.nullable()` to `knowledgeEntrySchema`, and map `record.boundary` in `toKnowledgeEntry()`.
**Warning signs:** API responses never include boundary even though store records have it.

### Pitfall 2: LLM Extraction Returning Invalid Structure
**What goes wrong:** The LLM returns boundary data that doesn't match the Zod schema (wrong field names, missing required fields, wrong types).
**Why it happens:** LLMs are non-deterministic. Prompt engineering can reduce errors but not eliminate them.
**How to avoid:** Wrap the LLM response parse in try/catch. On parse failure, fall back to author-provided boundary. Never let extraction failure block submission.
**Warning signs:** Submissions fail with Zod parse errors from LLM output.

### Pitfall 3: Boundary Lost During Resubmission
**What goes wrong:** Resubmission flow creates a new revision but the boundary from the previous version is not carried forward.
**Why it happens:** `resubmitKnowledgeEntry()` does not touch the `boundary` field. If the resubmission payload does not include a boundary, the old boundary persists on the record but may not be what the author intended.
**How to avoid:** Ensure resubmission schema accepts optional boundary. If not provided, preserve existing boundary on the record. If provided, use the new value.
**Warning signs:** Resubmitted entries retain stale boundaries from previous submissions.

### Pitfall 4: Review Decision Boundary Overwriting Without Intent
**What goes wrong:** Every review decision accidentally overwrites the boundary because the endpoint always sends a boundary field.
**Why it happens:** The review decision schema includes boundary but the CLI may always serialize the current boundary even if the reviewer didn't change it.
**How to avoid:** Make boundary optional in the review decision request. Only update when explicitly provided.
**Warning signs:** Boundaries change unexpectedly after review decisions that shouldn't have touched them.

### Pitfall 5: Skill Artifact Submission Missing Boundary
**What goes wrong:** Only knowledge/trap submissions get boundary support, but skill artifacts also have a `boundary` field (added in Phase 51).
**Why it happens:** Skill artifact submission follows a different code path (operations routes).
**How to avoid:** Verify BOUND-02 scope -- the phase description says "submission flow" which should cover both knowledge and skill submissions. Check whether skill submission also needs the `--boundary` flag, or if this is deferred. The skill submission path (`packages/server/src/routes/operations.ts`) handles skill edits separately.

## Code Examples

### CLI Boundary Flag (trap submit)
```typescript
// In packages/cli/src/commands/trap.ts -- submit action
trap
  .command('submit')
  .description('Submit a new trap entry for review')
  .requiredOption('--scope <scope>', 'Trap scope: global or project')
  .requiredOption('--label <label>', 'Trap label', collectValues, [])
  .requiredOption('--shortcut <text>', 'One-line pitfall shortcut')
  .option('--detail <text>', 'Detailed pitfall and fix description')
  .option('--file <path>', 'Read detail text from a file')
  .option('--stdin', 'Read detail text from stdin')
  .option('--required-level <n>', 'Override required security level')
  .option('--boundary <json>', 'Boundary constraints as JSON')  // NEW
  .option('--json', 'Output JSON')
  .action(async (flags) => {
    // ... existing code ...
    const boundary = flags.boundary
      ? JSON.parse(flags.boundary)
      : undefined;
    const response = await apiRequest<KnowledgeEntryResponse>(state, {
      method: 'POST',
      path: '/v1/knowledge',
      body: {
        scope: flags.scope,
        labels: flags.label,
        shortcut: flags.shortcut,
        detail,
        requiredLevel: flags.requiredLevel !== undefined ? Number(flags.requiredLevel) : undefined,
        boundary,  // NEW
      },
    });
  });
```

### Boundary Extraction in Pre-Review
```typescript
// In packages/server/src/lib/pre-review.ts or new file boundary-extract.ts
// Add to the pre-review pipeline

interface PreReviewInput {
  existingEntries: KnowledgeRecord[];
  submission: Pick<KnowledgeSubmission, 'detail' | 'labels' | 'scope' | 'shortcut'>;
  authorBoundary?: Boundary | null;  // NEW
  chatProvider?: ChatProvider;        // NEW
}

// After existing duplicate/completeness/correctness checks:
// Extract candidate boundaries if LLM is available
let extractedBoundary: Boundary | null = authorBoundary ?? null;

if (chatProvider?.isConfigured && (authorBoundary === null || authorBoundary === undefined)) {
  try {
    const candidates = await extractCandidateBoundaries(chatProvider, {
      shortcut: input.submission.shortcut,
      detail: input.submission.detail,
      labels: input.submission.labels,
    });
    if (candidates) {
      extractedBoundary = candidates;
      notes.push('Agent extracted candidate boundary constraints.');
    }
  } catch {
    // Best-effort: don't fail submission on extraction failure
    notes.push('Boundary extraction skipped (LLM unavailable).');
  }
}
```

### Review Decision with Boundary
```typescript
// In packages/server/src/routes/review.ts -- POST /v1/knowledge/review
// After applying the review decision:
if (payload.boundary !== undefined) {
  entry.boundary = payload.boundary;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual-only boundary input | Author input + LLM extraction + reviewer confirmation | Phase 52 | Three-party boundary model |
| Pre-review = token overlap only | Pre-review = token overlap + boundary extraction | Phase 52 | Pre-review gains LLM step |
| Boundary not in API responses | Boundary carried through full pipeline | Phase 52 | API contracts change |

**Deprecated/outdated:**
- N/A (greenfield boundary integration)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Boundary extraction should run in the pre-review pipeline synchronously, not as a separate async step | Architecture Patterns | May cause latency if LLM is slow; could require async refactor |
| A2 | BOUND-02 "agent can extract candidate boundaries" means a single LLM call during pre-review, not a separate extraction service | Architecture Patterns | If extraction needs to be a separate service, architecture changes significantly |
| A3 | Skill artifact submission should also get boundary support in this phase (since SkillArtifactRecord has boundary field) | Pitfall 5 | If skill is out of scope, less work but inconsistency between trap and skill |
| A4 | Reviewer modifies boundary at approve/reject time, not via a separate boundary-edit endpoint | Architecture Patterns | If a separate endpoint is needed, more work |
| A5 | BOUND-06 (deferred to v2) means the LLM-based inference for BOUND-02 should be simpler than what BOUND-06 describes -- perhaps just a single prompt rather than multi-pass analysis | Architecture Patterns | If BOUND-02 requires sophisticated extraction, may overlap with BOUND-06 |

## Open Questions

1. **BOUND-02 vs BOUND-06 scope boundary**
   - What we know: BOUND-02 says "agent can extract candidate boundaries" and the success criteria say "LLM-based inference." BOUND-06 (v2) says "Automatic boundary inference from content using LLM analysis."
   - What's unclear: Is BOUND-02 extraction meant to be a simple single-prompt extraction, or something more sophisticated? The success criteria specifically mention "Agent pre-review extracts candidate boundaries from content (LLM-based inference)."
   - Recommendation: Implement a single-prompt extraction in pre-review. This satisfies BOUND-02. BOUND-06 (v2) can later add multi-pass or more sophisticated analysis.

2. **Skill artifact boundary support in this phase?**
   - What we know: SkillArtifactRecord has `boundary: Boundary | null` (Phase 51). Skill submission uses a different route (`/v1/operations/artifacts/`).
   - What's unclear: Does BOUND-02 cover skill artifacts or only knowledge/trap submissions?
   - Recommendation: The requirement says "authors can input boundary constraints during submission" without qualifying trap vs skill. Include skill artifact support if feasible; otherwise flag for a follow-up.

3. **Boundary extraction when no LLM is configured**
   - What we know: The system has a `FallbackChat` that throws when invoked. The `isConfigured` flag exists.
   - What's unclear: Should boundary extraction be skipped entirely when no LLM is available, or should there be a rule-based fallback?
   - Recommendation: Skip extraction when no LLM is configured. The author can still provide boundary manually via `--boundary`. This matches the existing pattern where the system works without AI (fallback embeddings).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | Yes | (check needed) | -- |
| pnpm | Build/test | Yes | (workspace) | -- |
| LLM Provider (OpenAI/Ollama) | Boundary extraction | Conditional | -- | Skip extraction, author-only input |
| Vitest | Testing | Yes | (workspace) | -- |

**Missing dependencies with no fallback:**
- None -- LLM is conditional, not required.

**Missing dependencies with fallback:**
- LLM provider: When not configured, boundary extraction is skipped. Author-provided boundaries still work. Reviewer can manually add boundaries.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` (monorepo root) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm typecheck` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOUND-02 | CLI accepts --boundary JSON flag | unit | `pnpm test -- --reporter=verbose packages/cli` | Partial (CLI test infrastructure exists) |
| BOUND-02 | Submission schema validates boundary | unit | `pnpm test -- contracts` | Partial (boundary.test.ts exists) |
| BOUND-02 | Agent extracts candidate boundaries | unit | `pnpm test -- server` | Need new file |
| BOUND-02 | Review UI shows extracted boundaries | integration | `pnpm test -- server` | Partial (review.test.ts exists) |
| BOUND-02 | Reviewer can modify boundary | integration | `pnpm test -- server` | Need new test cases |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/server/src/lib/boundary-extract.test.ts` -- covers extraction logic
- [ ] Add boundary test cases to `packages/server/src/routes/knowledge.test.ts`
- [ ] Add boundary test cases to `packages/server/src/routes/review.test.ts`
- [ ] Add boundary test cases to `packages/cli/src/commands/operations.test.ts`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Zod schema validation (boundarySchema) |
| V4 Access Control | yes | Existing RBAC (knowledge:submit, knowledge:review) |

### Known Threat Patterns for Submission Pipeline

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious boundary JSON (injection) | Tampering | Zod schema parse rejects non-conforming input |
| Boundary field used for data exfiltration | Information Disclosure | Array limits (max 10/20 items), string length limits |
| LLM prompt injection via boundary content | Tampering | Boundary extraction output validated by boundarySchema before storage |

## Files Inventory

### Files to Modify (verified existing)

| File | Current State | Change Needed |
|------|--------------|---------------|
| `packages/contracts/src/domain/knowledge.ts` | No `boundary` in schemas | Add `boundary` to `knowledgeSubmissionSchema`, `knowledgeResubmissionSchema`, `knowledgeUpdateSchema`, `knowledgeEntrySchema` |
| `packages/contracts/src/domain/review.ts` | No `boundary` in review schemas | Add `boundary` to `reviewDecisionRequestSchema` |
| `packages/server/src/lib/knowledge.ts` | `boundary: null` hardcoded in `createKnowledgeEntryRecord` | Accept boundary from payload, store author+extracted boundary |
| `packages/server/src/lib/pre-review.ts` | Token overlap only | Add boundary extraction step using ChatProvider |
| `packages/server/src/routes/knowledge.ts` | No boundary in POST body | Pass boundary from payload to record creation |
| `packages/server/src/routes/review.ts` | No boundary handling in review | Apply boundary override from review decision |
| `packages/cli/src/commands/trap.ts` | No --boundary flag | Add `--boundary <json>` option to submit and resubmit |
| `packages/cli/src/commands/knowledge.ts` | No --boundary flag | Add `--boundary <json>` option to submit and resubmit |
| `packages/cli/src/commands/review.ts` | No boundary display | Show boundary in queue output, add `--boundary <json>` to approve/reject |

### Files to Create

| File | Purpose |
|------|---------|
| `packages/server/src/lib/boundary-extract.ts` | LLM-based boundary extraction logic |
| `packages/server/src/lib/boundary-extract.test.ts` | Tests for extraction logic |

## Sources

### Primary (HIGH confidence)
- Codebase analysis of all files in `packages/cli/src/commands/`, `packages/server/src/routes/`, `packages/server/src/lib/`, `packages/contracts/src/domain/` [VERIFIED: direct file reads]
- Phase 51 summary and research documents [VERIFIED: .planning/phases/51-boundary-schema-definition/]

### Secondary (MEDIUM confidence)
- Existing pre-review pattern (`packages/server/src/lib/pre-review.ts`) provides the template for adding boundary extraction [VERIFIED: codebase]
- AI provider architecture (`packages/server/src/lib/ai/`) provides ChatProvider for LLM calls [VERIFIED: codebase]

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all infrastructure exists, verified by codebase reads
- Architecture: HIGH - follows existing patterns in codebase
- Pitfalls: HIGH - identified from direct analysis of integration gaps between Phase 51 additions and existing pipeline

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable codebase, no external dependencies)
