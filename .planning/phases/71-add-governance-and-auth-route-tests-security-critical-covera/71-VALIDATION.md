# Phase 71 Validation: CLI, Contracts Tests + Coverage Tooling

## Compliance Status: GREEN

**Validated:** 2026-05-04
**Requirements:** TEST-04 (CLI and contracts tests), TEST-05 (Coverage tooling integration)

## Verification Map

| Task ID | Requirement | Automated Command | Status |
|---------|-------------|-------------------|--------|
| TEST-04-01 | CLI HTTP client handles errors and response parsing | `pnpm test packages/cli/src/lib/http.adversarial.test.ts` | green |
| TEST-04-02 | CLI knowledge commands handle CRUD operations | `pnpm test packages/cli/src/commands/knowledge.adversarial.test.ts` | green |
| TEST-04-03 | CLI team commands handle team operations | `pnpm test packages/cli/src/commands/team.adversarial.test.ts` | green |
| TEST-04-04 | Contracts schemas validate correct inputs and reject invalid ones | `pnpm test packages/contracts/src/domain/knowledge.adversarial.test.ts` | green |
| TEST-04-05 | Contracts retrieval schemas validate inputs correctly | `pnpm test packages/contracts/src/domain/retrieval.adversarial.test.ts` | green |
| TEST-05-01 | Coverage tooling configured with v8 provider | `pnpm test:coverage` | green |
| TEST-05-02 | CI workflow includes coverage job with artifact upload | Verified in `.github/workflows/ci.yml` | green |

## Adversarial Tests Created (101 tests)

### Gap 1: CLI HTTP Client Error Handling (13 tests)
- **File:** `packages/cli/src/lib/http.adversarial.test.ts`
- **Behavior verified:**
  - ApiError construction with statusCode, payload, message
  - Network error propagation (TypeError from rejected fetch)
  - Non-JSON response body on error path throws SyntaxError (implementation does not guard JSON.parse)
  - Error message extraction from payload vs fallback to status code
  - Complex JSON response parsing
  - Session token extraction from x-session-token header
  - Token precedence: options.sessionToken overrides state.sessionToken
  - Exact error message for unauthenticated users

### Gap 2: CLI Knowledge Commands CRUD (12 tests)
- **File:** `packages/cli/src/commands/knowledge.adversarial.test.ts`
- **Behavior verified:**
  - Submit sends requiredLevel as number from --required-level flag
  - Submit sends undefined requiredLevel when flag omitted
  - ResolveTextInput called with correct options for --detail, --file, --stdin
  - Resubmit interpolates entryId in API path
  - Supersede sends correct replacementId in body
  - FormatEntry handles multiple labels comma-separated
  - FormatEntry shows correct revision count for multi-revision entries
  - FormatHistory separates entries correctly
  - Command registration: zero commands when both flags false, correct subsets otherwise

### Gap 3: CLI Team Commands Operations (11 tests)
- **File:** `packages/cli/src/commands/team.adversarial.test.ts`
- **Behavior verified:**
  - Active team marked with asterisk, others with space prefix (3-team scenario)
  - List calls /v1/teams endpoint (method defaults to GET internally)
  - Select sends correct teamId in POST body
  - Select calls updateCliState with function updater
  - Select shows activeTeam name in output
  - Create sends name and optional description
  - Create sends undefined description when not provided
  - Create output includes team id and name
  - requireSessionToken called before every API request (list, select, create)

### Gap 4: Contracts Schema Validation (65 tests)
- **Files:**
  - `packages/contracts/src/domain/knowledge.adversarial.test.ts` (23 tests)
  - `packages/contracts/src/domain/retrieval.adversarial.test.ts` (42 tests)
- **Behavior verified:**
  - reviewRiskSchema: exact enum values, case sensitivity, near-miss rejection
  - agentReviewResultSchema: boundary field defaults arrays correctly
  - reviewDecisionSchema: notes at 1/2000/2001 char boundaries, decidedBy requires all fields
  - reviewNoteSchema: message at 2000/2001 char boundaries, author defaults to null
  - knowledgeRevisionSchema: shortcut at 280/281 chars, detail at 10000/10001 chars, revision > 0
  - knowledgeEntrySchema: securityLevel 0/10/11/-1 boundaries, all 7 lifecycle states (draft, submitted, agent-pass, agent-rejected, approved, rejected, deactivated)
  - knowledgeSubmissionSchema: optional fields, empty labels/shortcut rejection
  - retrievalQuerySchema: seed at 1/2000/2001 chars, maxResults at 1/50/51/0/-1
  - retrievalCitationSchema: score boundaries at 0/1/1.01/-0.01, non-empty snippet, min 1 recallChannel
  - capsuleMatchSchema: content at 5000/5001 chars, score boundaries, min 1 label, min 1 sourcePath, revision > 0
  - retrievalV2QuerySchema/V2ResponseSchema: seed boundaries, refinementSummary required (not optional), default values
  - retrievalStrategySchema: near-miss rejection
  - routingTraceSchema: confidenceScore boundaries, routeFamily enum completeness, default values
  - retrievalFiltersSchema: default arrays for labels/scopes, nullable teamId

### Gap 5: Coverage Tooling Integration
- **Verification method:** Configuration audit + `pnpm test:coverage` execution
- **Confirmed:**
  - `test:coverage` script in package.json
  - `@vitest/coverage-v8@^3.2.4` in devDependencies
  - vitest.config.ts: coverage provider=v8, reporters=[text,html,lcov], thresholds={lines:70,functions:70,branches:60,statements:70} for all 4 projects (contracts, server, cli, evals)
  - `.github/workflows/ci.yml`: dedicated `coverage` job running `pnpm test:coverage` with artifact upload

## Test Execution Results

```
Original tests:     154 passed (5 files)
Adversarial tests:  101 passed (5 files)
Total:              255 passed, 0 failed
Coverage tooling:   Runs successfully, generates text/html/lcov reports
```

## Findings

**WARNING:** The HTTP client (`packages/cli/src/lib/http.ts`) does not wrap `JSON.parse(text)` in a try/catch. If the server returns non-JSON text (e.g., an HTML error page), the caller receives a raw SyntaxError instead of an ApiError. This is not a test failure but a robustness gap in the implementation. The adversarial test documents this behavior correctly.
