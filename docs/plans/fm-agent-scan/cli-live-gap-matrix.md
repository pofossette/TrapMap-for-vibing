# CLI Live Gap Matrix

Classifies each confirmed fm-agent finding against current HEAD source.

**Generated:** 2026-05-29

> Post-audit note: the raw source snapshot reports **54 confirmed raw ids**, but this matrix tracks **57 listed sub-findings** because several raw ids were split into separate presence/formatting sub-issues during triage.

## Legend

| status | meaning |
|---|---|
| **live** | Bug reproducible in current HEAD source code |
| **fixed** | Fix already applied in current HEAD |
| **stale** | Finding no longer applies (code restructured, extracted fragment mismatch) |

---

## Current HEAD Status

No reproducible **current-live** CLI gaps remained after the 2026-05-29 audit reran `pnpm test`, `pnpm typecheck`, and `pnpm eval:smoke`.

## Reclassified to Fixed During Audit

| raw id | evidence |
|---|---|
| `commands--decay-ts--formatBatchResult` | `packages/cli/src/commands/decay.ts` now uses `item.ineligibilityReason != null`; regression in `decay.test.ts` covers explicit empty reason |
| `commands--decay-ts--formatDecayList` | `packages/cli/src/commands/decay.ts` now renders `undefined` explicitly; regression in `decay.test.ts` covers `[undefined]` output |
| `commands--feedback-admin-ts--formatBatchResult` | `packages/cli/src/commands/feedback-admin.ts` now uses `item.reason != null`; regression in `feedback.test.ts` covers explicit empty reason |
| `commands--maintenance-ts--formatMaintenanceBatch` | `packages/cli/src/commands/maintenance.ts` now uses `item.ineligibilityReason != null`; regression in `maintenance.test.ts` covers explicit empty reason |
| `lib--config-ts--loadCliState` | `packages/cli/src/lib/config.ts` now clears invalid `outputProfile` values via `configHadOutputProfile`; regression in `config.test.ts` expects `undefined` |
| `commands--output-profile-ts--registerOutputProfileCommands` | `VALID_OUTPUT_PROFILE_KEYS` filtering in `packages/cli/src/lib/config.ts`; regression in `config.test.ts` verifies `colorScheme` is dropped |
| `lib--output-profile-ts--buildCodexObject` | `packages/cli/src/lib/output-profile.ts` now uses `view.previousState != null` for `previous_state` |
| `lib--output-profile-ts--buildCommandResultView` | `packages/cli/src/lib/output-profile.ts` now validates `transition.from` / `transition.to` shape before including it |
| `lib--output-profile-ts--resolveRenderer` | `output-profile.test.ts` verifies unknown tools fall back to the generic renderer |
| `lib--prompts-ts--isInteractiveEnvironment` | `packages/cli/src/lib/prompts.ts` now null-checks `stdin` / `stdout`; `prompts.test.ts` verifies no throw |
| `lib--prompts-ts--promptInput` | `packages/cli/src/lib/prompts.ts` now filters empty-string defaults by requiring `options.default !== ''` |
| `lib--skill-artifact-export-ts--formatExportJson` | `packages/cli/src/lib/skill-artifact-export.ts` now uses a replacer to preserve `Infinity` / `NaN` as strings |
| `lib--artifact-bundle-ts--buildSingleSkillMdBundle` | `artifact-bundle.test.ts` verifies default bundle `scope` is `global` |

## Reclassified to Stale / Design Boundary

| raw id | reason |
|---|---|
| `lib--markdown-formatter-ts--formatLoadContext` | Current formatter intentionally renders fallback capsules when plan exists but both trap/skill arrays are empty; `markdown-formatter.test.ts` locks this behavior |
| `lib--markdown-formatter-ts--formatTrapNode` | Raw claim was not reproduced; current formatter intentionally uses severity + label in the header and keeps score/scope in surrounding context instead of headline text |
| `lib--markdown-formatter-ts--push_1` | Numbered markdown lists for recommended skills are intentional display behavior, not a regression |
| `lib--markdown-formatter-ts--push_2` | `maxSkills` is an internal typed option expected to be an integer; the non-integer report does not reflect the supported CLI contract |
| `lib--output-profile-ts--renderCodex` | Snake_case keys are intentional for machine-oriented Codex output and are documented in `docs/architecture/CLI.md` |
| `lib--output-ts--printResult` | `JSON.stringify(value)` escapes embedded newlines inside strings, so output remains single-line JSON; the report premise was incorrect |
| `lib--input-ts--resolveTextInput` | The “TTY environment with piped stdin content” scenario was not reproducible under the current CLI input contract |
| `lib--artifact-bundle-ts--scanSkillDirectory` | `artifact-bundle.test.ts` documents and expects absolute `skillMd` paths for local filesystem operations |
| `index-ts--registerReviewCommands` | `packages/cli/src/index.ts` bootstraps a one-shot `Command` instance; unregister semantics are not part of the runtime contract |
| `index-ts--registerTeamCommands` | Same as review registration: one-shot CLI bootstrap, not a reusable command registry lifecycle |

---

## Fixed Gaps

These were confirmed bugs in the old codebase that are already resolved in HEAD.

| raw id | current file | line(s) | evidence |
|---|---|---|---|
| `commands--feedback-ts--registerFeedbackCommands` | packages/cli/src/commands/feedback.ts | 77-79 | `InvalidArgumentError` thrown for invalid `--entry-type` via custom parser |
| `commands--feedback-ts--formatFeedbackResult` | packages/cli/src/commands/feedback.ts | 55-58 | All fields wrapped in `stripAnsi()` |
| `commands--operations--deactivate-ts--registerDeactivateCommand` | packages/cli/src/commands/operations/deactivate.ts | 24-28 | `val.length < 1 \|\| val.length > 500` validation in custom parser |
| `commands--operations--edit-ts--registerEditCommand` | packages/cli/src/commands/operations/edit.ts | 52 | `!Number.isInteger(level) \|\| level < 0` integer validation |
| `commands--operations-ts--registerOperationsCommands` | packages/cli/src/commands/operations.ts | 31-38 | All 8 sub-commands always registered, no conditional omission |
| `commands--skill-ts--formatManualResultResponse` | packages/cli/src/commands/skill.ts | 188,194 | `stripNewlines()` on candidateId prevents multi-line injection |
| `commands--skill-ts--formatSkillMatch` | packages/cli/src/commands/skill.ts | 53,59 | `stripNewlines()` on title and reason |
| `commands--skill-ts--formatSkillHistoryResponse` | packages/cli/src/commands/skill.ts | 112 | No leading spaces on revision entry line |
| `commands--skill-ts--formatDuplicateJobBundle` | packages/cli/src/commands/skill.ts | 163 | `e.detail != null` instead of truthy check |
| `commands--skill-ts--formatApplyResolutionResponse` | packages/cli/src/commands/skill.ts | 204 | Candidate ID is first output line |
| `commands--skill-ts--registerSkillCommands` | packages/cli/src/commands/skill.ts | 229-234 | Early return checks all 4 options including `allowReview` |
| `commands--feedback-admin-ts--formatFeedbackList` | packages/cli/src/commands/feedback-admin.ts | 22,32 | No blank line push between header and items |
| `commands--maintenance-ts--formatMaintenanceList` | packages/cli/src/commands/maintenance.ts | 28 | No blank line push between header and items |
| `lib--config-ts--getConfigPath` | packages/cli/src/lib/config.ts | 44-52 | Falls back to `tmpdir()` when `os.homedir()` throws |
| `lib--http-ts--requireSessionToken` | packages/cli/src/lib/http.ts | 66 | `typeof state.sessionToken !== 'string'` rejects non-strings |
| `lib--markdown-formatter-ts--formatRoutingTrace` | packages/cli/src/lib/markdown-formatter.ts | 100 | `trace.channelsUsed.length > 0` check before join |
| `lib--markdown-formatter-ts--truncateText` | packages/cli/src/lib/markdown-formatter.ts | 43-44 | `maxLength <= 3` protection returns `text.slice(0, maxLength)` |
| `lib--output-profile-ts--summarizeRetrievalV1` | packages/cli/src/lib/output-profile.ts | 118-119 | `.find((c) => c != null)` and `??` for fallback |
| `lib--output-profile-ts--summarizeGraphPlan` | packages/cli/src/lib/output-profile.ts | 143-144 | `.some((s) => s != null)` and `.some((t) => t != null)` |
| `lib--skill-artifact-export-ts--validateBundleFilePath` | packages/cli/src/lib/skill-artifact-export.ts | 60-67 | Segment-based traversal check (`segments.includes('..')`) |
| `lib--skill-artifact-export-ts--validateOutputPath` | packages/cli/src/lib/skill-artifact-export.ts | 41-45 | `resolve` + `startsWith` against resolved base |
| `lib--skill-artifact-export-ts--decodeFileContent` | packages/cli/src/lib/skill-artifact-export.ts | 84 | Base64 regex detection + try/catch fallback |
| `lib--prompts-ts--promptSelect` | packages/cli/src/lib/prompts.ts | 22 | `c.description != null` instead of truthy check |
| `commands--decay-ts--formatBatchResult` (appliedAt) | packages/cli/src/commands/decay.ts | 42 | `data.appliedAt != null` instead of truthy check |
| `commands--feedback-admin-ts--formatBatchResult` (appliedAt) | packages/cli/src/commands/feedback-admin.ts | 43 | `data.appliedAt != null` instead of truthy check |
| `commands--maintenance-ts--formatMaintenanceBatch` (appliedAt) | packages/cli/src/commands/maintenance.ts | 47 | `data.appliedAt != null` instead of truthy check |

---

## Stale / Not Applicable

Findings from extracted fragments or code that has since been restructured.

| raw id | reason |
|---|---|
| `commands--retrieval-ts--join` | Extracted fragment is an inline template, not a standalone function; no function definition to fix |
| `commands--retrieval-ts--toFixed` | Extracted fragment is an inline template expression, not a standalone function |
| `commands--skill-ts--join` | Extracted fragment — inline in `formatProfileHint`, not a standalone `join` function |
| `commands--skill-ts--toFixed` | Extracted fragment — inline usage of `.toFixed(2)`, not a standalone function |
| `index-ts--command` | About command naturally produces 4 lines; spec line-count claim is documentation issue, not code bug |
| `index-ts--registerOperationsCommands` | Original bug claimed wrong visibility flags mapping; current code delegates to sub-modules each checking their own guard |
| `lib--artifact-bundle-ts--readFileContent` | Bug was spec vs behavior description mismatch, not actual code issue |
| `commands--operations--import-ts--registerImportCommand` | `requireSessionToken` now uses `typeof` check; original bug about token validation is systematic design choice, not CLI-specific bug |

---

## Counting

| Category | Count |
|---|---|
| **Live (current HEAD)** | 0 |
| **Fixed (listed rows)** | 39 |
| **Stale / design boundary (listed rows)** | 18 |
| **Raw confirmed ids** | 54 |
| **Listed sub-findings** | 57 |
