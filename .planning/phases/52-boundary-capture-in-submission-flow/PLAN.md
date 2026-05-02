---
wave: 1
depends_on:
  - phase 51 (BOUND-01: Boundary Schema Definition)
files_modified:
  - packages/contracts/src/domain/knowledge.ts
  - packages/contracts/src/domain/review.ts
  - packages/server/src/lib/boundary-extract.ts
  - packages/server/src/lib/boundary-extract.test.ts
  - packages/server/src/lib/pre-review.ts
  - packages/server/src/lib/knowledge.ts
  - packages/server/src/routes/knowledge.ts
  - packages/server/src/routes/review.ts
  - packages/cli/src/commands/trap.ts
  - packages/cli/src/commands/knowledge.ts
  - packages/cli/src/commands/review.ts
autonomous: true
---

# Phase 52: Boundary Capture in Submission Flow

**Requirement:** BOUND-02 — Authors can input boundary constraints during submission; agent can extract candidate boundaries; reviewers can confirm boundaries

**Goal:** Enable boundary input during submission with agent extraction and reviewer confirmation across four integration points: CLI flag, pre-review extraction, API schema propagation, and review decision modification.

---

## must_haves

Before phase can be marked complete:

1. **CLI accepts boundary input**: `trap submit --boundary '{"context":["frontend"]}'` validates JSON against boundarySchema
2. **Agent extracts candidate boundaries**: Pre-review pipeline calls ChatProvider when configured, extracts boundary from content
3. **API propagates boundary**: Submission response includes boundary field; knowledgeEntrySchema has boundary
4. **Reviewer can modify boundary**: `review:approve --boundary` and `review:reject --boundary` accept optional boundary override
5. **Review queue displays boundary**: `review:queue` shows boundary constraints for entries that have them

---

## Wave 1: Contracts Layer — Schema Extensions

Extend API schemas to carry boundary through the submission-to-review pipeline.

### Task 1.1: Add boundary to knowledge submission schema

<read_first>
- packages/contracts/src/domain/knowledge.ts (file being modified)
- packages/contracts/src/domain/boundary.ts (boundarySchema source of truth)
</read_first>

<action>
Add `boundary: boundarySchema.nullable().optional()` to `knowledgeSubmissionSchema` and `knowledgeResubmissionSchema`. Add `boundary: boundarySchema.nullable()` to `knowledgeEntrySchema`. Import boundarySchema from './boundary.js'.
</action>

<acceptance_criteria>
- `grep -n "boundary: boundarySchema" packages/contracts/src/domain/knowledge.ts` returns 3 matches (submission, resubmission, entry)
- `grep -n "import.*boundarySchema" packages/contracts/src/domain/knowledge.ts` returns 1 match
- `pnpm test -- packages/contracts` passes
- `pnpm typecheck` passes
</acceptance_criteria>

---

### Task 1.2: Add boundary to review decision schema

<read_first>
- packages/contracts/src/domain/review.ts (file being modified)
- packages/contracts/src/domain/boundary.ts (boundarySchema source of truth)
</read_first>

<action>
Add `boundary: boundarySchema.nullable().optional()` to `reviewDecisionRequestSchema`. Import boundarySchema from './boundary.js'. This allows reviewers to override boundary at approval/rejection time.
</action>

<acceptance_criteria>
- `grep -n "boundary: boundarySchema" packages/contracts/src/domain/review.ts` returns 1 match
- `grep -n "import.*boundarySchema" packages/contracts/src/domain/review.ts` returns 1 match
- `pnpm test -- packages/contracts` passes
- `pnpm typecheck` passes
</acceptance_criteria>

---

## Wave 2: Server Layer — Boundary Extraction and Propagation

Create LLM-based extraction logic and thread boundary through server routes.

### Task 2.1: Create boundary extraction module

<read_first>
- packages/server/src/lib/ai/types.ts (ChatProvider interface)
- packages/contracts/src/domain/boundary.ts (boundarySchema for validation)
- packages/server/src/lib/pre-review.ts (pattern for pre-review pipeline)
</read_first>

<action>
Create `packages/server/src/lib/boundary-extract.ts` with `extractCandidateBoundaries(chat: ChatProvider, input: { shortcut: string; detail: string; labels: string[] }): Promise<Boundary | null>`. Function should:
1. Check `chat.isConfigured` — return null if false
2. Build system prompt instructing LLM to extract boundary constraints from knowledge content
3. Build user message with shortcut, detail, and labels
4. Call `chat.invoke(systemPrompt, userMessage)`
5. Parse JSON response and validate with `boundarySchema.parse()`
6. Return parsed boundary or null on any failure (wrap in try/catch)
</action>

<acceptance_criteria>
- File `packages/server/src/lib/boundary-extract.ts` exists
- `grep -n "export async function extractCandidateBoundaries" packages/server/src/lib/boundary-extract.ts` returns 1 match
- `grep -n "chat.isConfigured" packages/server/src/lib/boundary-extract.ts` returns 1 match
- `grep -n "boundarySchema.parse" packages/server/src/lib/boundary-extract.ts` returns 1 match
- `pnpm typecheck` passes
</acceptance_criteria>

---

### Task 2.2: Create boundary extraction tests

<read_first>
- packages/server/src/lib/boundary-extract.ts (file being tested)
- packages/contracts/src/domain/boundary.test.ts (test pattern reference)
- packages/server/src/lib/ai/providers.ts (FallbackChat mock pattern)
</read_first>

<action>
Create `packages/server/src/lib/boundary-extract.test.ts` with tests:
1. "returns null when chat provider not configured" — use FallbackChat
2. "returns null on LLM invocation failure" — mock chat that throws
3. "returns null on invalid JSON response" — mock chat returning non-JSON
4. "returns null on schema validation failure" — mock chat returning `{context: [invalid]}`
5. "returns parsed boundary on valid response" — mock chat returning valid boundary JSON
6. "passes shortcut, detail, labels to LLM" — verify prompt content
</action>

<acceptance_criteria>
- File `packages/server/src/lib/boundary-extract.test.ts` exists
- `grep -c "it(" packages/server/src/lib/boundary-extract.test.ts` returns count >= 6
- `pnpm test -- packages/server/src/lib/boundary-extract.test.ts` passes
</acceptance_criteria>

---

### Task 2.3: Add boundary extraction to pre-review pipeline

<read_first>
- packages/server/src/lib/pre-review.ts (file being modified)
- packages/server/src/lib/boundary-extract.ts (extraction function)
- packages/server/src/lib/ai/types.ts (ChatProvider interface)
</read_first>

<action>
Modify `PreReviewInput` interface to accept optional `chatProvider?: ChatProvider` and `authorBoundary?: Boundary | null`. Modify `runPreReview` to:
1. After existing duplicate/completeness/correctness checks, call `extractCandidateBoundaries` if `chatProvider?.isConfigured` and no author boundary provided
2. Store extracted boundary in a new `boundary` field on `AgentReviewResult`
3. Add note "Agent extracted candidate boundary constraints" if extraction succeeded
4. Add note "Boundary extraction skipped (LLM unavailable)" if chat not configured

Modify `agentReviewResultSchema` in contracts/domain/knowledge.ts to add `boundary: boundarySchema.nullable().optional()`.
</action>

<acceptance_criteria>
- `grep -n "chatProvider" packages/server/src/lib/pre-review.ts` returns at least 2 matches
- `grep -n "extractCandidateBoundaries" packages/server/src/lib/pre-review.ts` returns 1 match
- `grep -n "boundary:" packages/contracts/src/domain/knowledge.ts | grep agentReviewResultSchema` returns 1 match
- `pnpm test -- packages/server` passes
- `pnpm typecheck` passes
</acceptance_criteria>

---

### Task 2.4: Thread boundary through knowledge record creation

<read_first>
- packages/server/src/lib/knowledge.ts (file being modified)
- packages/contracts/src/domain/knowledge.ts (updated schemas)
- packages/server/src/lib/store.ts (KnowledgeRecord boundary field)
</read_first>

<action>
Modify `createKnowledgeEntryRecord` args to accept `boundary?: Boundary | null`. Pass boundary to record creation (use `args.boundary ?? null`). Modify `resubmitKnowledgeEntry` args to accept `boundary?: Boundary | null` — if provided, update `entry.boundary`; if not provided, preserve existing `entry.boundary`. Modify `toKnowledgeEntry` to include `boundary: record.boundary` in the parsed output.
</action>

<acceptance_criteria>
- `grep -n "boundary" packages/server/src/lib/knowledge.ts | grep -E "(args\.boundary|entry\.boundary)"` returns at least 3 matches
- `grep -n "boundary: record.boundary" packages/server/src/lib/knowledge.ts` returns 1 match
- `pnpm test -- packages/server` passes
- `pnpm typecheck` passes
</acceptance_criteria>

---

### Task 2.5: Pass boundary through knowledge routes

<read_first>
- packages/server/src/routes/knowledge.ts (file being modified)
- packages/contracts/src/domain/knowledge.ts (updated submission schema)
- packages/server/src/lib/pre-review.ts (updated runPreReview signature)
- packages/server/src/lib/knowledge.ts (updated createKnowledgeEntryRecord signature)
</read_first>

<action>
Modify POST `/v1/knowledge` to:
1. Pass `payload.boundary` to `runPreReview` as `authorBoundary`
2. Pass `app.skillShareer.ai.chat` to `runPreReview` as `chatProvider`
3. Use `preReview.boundary` (extracted) or `payload.boundary` (author) in record creation, preferring author boundary if both exist
4. Pass boundary to `createKnowledgeEntryRecord`

Modify POST `/v1/knowledge/:entryId/resubmit` similarly — accept boundary from payload, pass to pre-review and record update.
</action>

<acceptance_criteria>
- `grep -n "chatProvider" packages/server/src/routes/knowledge.ts` returns at least 1 match
- `grep -n "authorBoundary" packages/server/src/routes/knowledge.ts` returns at least 1 match
- `grep -n "preReview.boundary" packages/server/src/routes/knowledge.ts` returns at least 1 match
- `pnpm test -- packages/server` passes
- `pnpm typecheck` passes
</acceptance_criteria>

---

### Task 2.6: Accept boundary in review decision

<read_first>
- packages/server/src/routes/review.ts (file being modified)
- packages/contracts/src/domain/review.ts (updated reviewDecisionRequestSchema)
- packages/server/src/lib/knowledge.ts (applyReviewDecision function)
</read_first>

<action>
Modify POST `/v1/knowledge/review` to check `payload.boundary`. If provided, update `entry.boundary = payload.boundary` after calling `applyReviewDecision`. Log the boundary update in user operations log.
</action>

<acceptance_criteria>
- `grep -n "payload.boundary" packages/server/src/routes/review.ts` returns at least 1 match
- `grep -n "entry.boundary" packages/server/src/routes/review.ts` returns at least 1 match
- `pnpm test -- packages/server` passes
- `pnpm typecheck` passes
</acceptance_criteria>

---

## Wave 3: CLI Layer — Boundary Input and Display

Add boundary flags to CLI commands and display in review queue.

### Task 3.1: Add --boundary flag to trap submit/resubmit

<read_first>
- packages/cli/src/commands/trap.ts (file being modified)
- packages/contracts/src/domain/boundary.ts (boundary schema for JSON validation)
</read_first>

<action>
Add `--boundary <json>` option to `trap submit` and `trap resubmit` commands. Parse JSON with `JSON.parse(flags.boundary)` if provided. Include `boundary` in API request body. Handle JSON parse errors gracefully with error message "Invalid boundary JSON: {error.message}".
</action>

<acceptance_criteria>
- `grep -n "\-\-boundary" packages/cli/src/commands/trap.ts` returns at least 2 matches
- `grep -n "JSON.parse.*boundary" packages/cli/src/commands/trap.ts` returns at least 1 match
- `pnpm test -- packages/cli` passes
- `pnpm typecheck` passes
</acceptance_criteria>

---

### Task 3.2: Add --boundary flag to knowledge submit/resubmit

<read_first>
- packages/cli/src/commands/knowledge.ts (file being modified)
- packages/cli/src/commands/trap.ts (pattern reference from Task 3.1)
</read_first>

<action>
Add `--boundary <json>` option to `submit` and `resubmit` commands in knowledge.ts. Same implementation pattern as trap.ts — parse JSON, include in request body, handle errors.
</action>

<acceptance_criteria>
- `grep -n "\-\-boundary" packages/cli/src/commands/knowledge.ts` returns at least 2 matches
- `grep -n "JSON.parse.*boundary" packages/cli/src/commands/knowledge.ts` returns at least 1 match
- `pnpm test -- packages/cli` passes
- `pnpm typecheck` passes
</acceptance_criteria>

---

### Task 3.3: Display boundary in review queue

<read_first>
- packages/cli/src/commands/review.ts (file being modified)
- packages/contracts/src/domain/knowledge.ts (KnowledgeEntry with boundary)
</read_first>

<action>
Modify `formatQueue` function to display boundary when present. If `entry.boundary` exists and has non-empty layers, add "Boundary:" line with summary (e.g., "context: frontend, versions: react>=16.8"). Use format: `Boundary: context=[frontend, production], versions=[react>=16.8]` — show layer name and first 2-3 items, truncate with "..." if more.
</action>

<acceptance_criteria>
- `grep -n "boundary" packages/cli/src/commands/review.ts` returns at least 2 matches
- `grep -n "formatQueue" packages/cli/src/commands/review.ts` returns 1 match (function still exists)
- `pnpm test -- packages/cli` passes
- `pnpm typecheck` passes
</acceptance_criteria>

---

### Task 3.4: Add --boundary flag to review approve/reject

<read_first>
- packages/cli/src/commands/review.ts (file being modified)
- packages/contracts/src/domain/review.ts (updated reviewDecisionRequestSchema)
</read_first>

<action>
Add `--boundary <json>` option to `review:approve` and `review:reject` commands. Parse JSON and include in request body if provided. This allows reviewers to modify boundary at decision time.
</action>

<acceptance_criteria>
- `grep -n "\-\-boundary" packages/cli/src/commands/review.ts` returns at least 2 matches
- `grep -n "JSON.parse.*boundary" packages/cli/src/commands/review.ts` returns at least 1 match
- `pnpm test -- packages/cli` passes
- `pnpm typecheck` passes
</acceptance_criteria>

---

## Wave 4: Integration Tests and Verification

Ensure end-to-end boundary flow works correctly.

### Task 4.1: Add boundary integration tests to knowledge routes

<read_first>
- packages/server/src/routes/knowledge.test.ts (existing test file)
- packages/contracts/src/domain/boundary.ts (valid boundary examples)
</read_first>

<action>
Add test cases to `knowledge.test.ts`:
1. "submit with boundary stores boundary on record" — POST with boundary, verify response has boundary
2. "submit without boundary stores null boundary" — POST without boundary, verify null
3. "resubmit with boundary updates boundary" — resubmit with new boundary, verify updated
4. "resubmit without boundary preserves existing boundary" — create with boundary, resubmit without, verify preserved
</action>

<acceptance_criteria>
- `grep -c "boundary" packages/server/src/routes/knowledge.test.ts` returns count >= 4
- `pnpm test -- packages/server/src/routes/knowledge.test.ts` passes
</acceptance_criteria>

---

### Task 4.2: Add boundary integration tests to review routes

<read_first>
- packages/server/src/routes/review.test.ts (existing test file)
- packages/contracts/src/domain/boundary.ts (valid boundary examples)
</read_first>

<action>
Add test cases to `review.test.ts`:
1. "approve with boundary sets boundary on entry" — approve with boundary, verify entry has boundary
2. "approve without boundary preserves existing boundary" — entry has boundary, approve without, verify preserved
3. "reject with boundary sets boundary on entry" — reject with boundary, verify entry has boundary
</action>

<acceptance_criteria>
- `grep -c "boundary" packages/server/src/routes/review.test.ts` returns count >= 3
- `pnpm test -- packages/server/src/routes/review.test.ts` passes
</acceptance_criteria>

---

### Task 4.3: Run full test suite and verify

<read_first>
- All modified files from previous tasks
</read_first>

<action>
Run `pnpm test && pnpm typecheck` to verify all tests pass and types are correct. Fix any failures.
</action>

<acceptance_criteria>
- `pnpm test` exits with code 0
- `pnpm typecheck` exits with code 0
- No TypeScript errors
- All 1229+ tests pass
</acceptance_criteria>

---

## Verification Criteria

### Security Verification

- [ ] All boundary input validated with `boundarySchema.parse()` — rejects malicious JSON
- [ ] LLM extraction output treated as untrusted — validated before storage
- [ ] Array limits enforced by schema (max 10/20 items per layer)
- [ ] String length limits enforced by schema

### Functional Verification

- [ ] CLI `trap submit --boundary '{"context":["frontend"]}'` creates entry with boundary
- [ ] CLI `knowledge submit --boundary '{"context":["frontend"]}'` creates entry with boundary
- [ ] Review queue shows boundary for entries that have it
- [ ] `review:approve --boundary '{"context":["backend"]}'` updates boundary
- [ ] Entry without boundary shows null/empty in queue
- [ ] Agent extraction works when LLM configured (verified by unit tests)
- [ ] Agent extraction graceful fallback when LLM not configured

### API Contract Verification

- [ ] POST `/v1/knowledge` accepts optional `boundary` in request body
- [ ] POST `/v1/knowledge/:entryId/resubmit` accepts optional `boundary`
- [ ] POST `/v1/knowledge/review` accepts optional `boundary` in request body
- [ ] GET `/v1/knowledge/review-queue` returns entries with `boundary` field
- [ ] GET `/v1/knowledge/:entryId` returns entry with `boundary` field

---

## Threat Mitigation Summary

| Threat ID | Mitigation | Implementation |
|-----------|------------|----------------|
| T-52-01 | LLM output validated with boundarySchema | Task 2.1 — try/catch with schema parse |
| T-52-02 | Malicious JSON rejected by Zod | All tasks use boundarySchema.parse() |
| T-52-03 | Array/string limits in schema | boundary.ts enforces max 10/20 items, string lengths |

---

## Dependencies

- **Phase 51 (BOUND-01)**: `boundarySchema` must exist in `packages/contracts/src/domain/boundary.ts`
- **ChatProvider**: Existing AI provider interface in `packages/server/src/lib/ai/types.ts`
- **KnowledgeRecord**: Has `boundary: Boundary | null` field from Phase 51

---

## Rollback Plan

If issues arise:
1. Revert CLI changes — boundary flag becomes no-op
2. Revert route changes — boundary field ignored in requests
3. Revert schema changes — API still works, boundary field optional
4. System continues to function without boundary support

---

*Plan created: 2026-05-02*
*Phase: 52*
*Requirement: BOUND-02*
