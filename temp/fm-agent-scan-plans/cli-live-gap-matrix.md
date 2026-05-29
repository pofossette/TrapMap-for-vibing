# CLI Live Gap Matrix

Classifies each confirmed fm-agent finding against current HEAD source.

**Generated:** 2026-05-29

## Legend

| status | meaning |
|---|---|
| **live** | Bug reproducible in current HEAD source code |
| **fixed** | Fix already applied in current HEAD |
| **stale** | Finding no longer applies (code restructured, extracted fragment mismatch) |

---

## Live Gaps

These bugs are present in current HEAD and need implementation fixes (not done in this phase).

| raw id | current file | line(s) | note |
|---|---|---|---|
| `commands--decay-ts--formatBatchResult` | packages/cli/src/commands/decay.ts | 49 | `item.ineligibilityReason ?` truthy check skips empty string; `appliedAt` already fixed with `!= null` at line 42 |
| `commands--decay-ts--formatDecayList` | packages/cli/src/commands/decay.ts | 25 | `item.decayState === null ? 'unknown' : (item.decayState ?? '')` — when `decayState` is `undefined`, `=== null` is false, `?? ''` returns `''` instead of showing `'undefined'` |
| `commands--feedback-admin-ts--formatBatchResult` | packages/cli/src/commands/feedback-admin.ts | 50 | `item.reason ?` truthy check skips empty string reason; `appliedAt` already fixed with `!= null` at line 43 |
| `commands--maintenance-ts--formatMaintenanceBatch` | packages/cli/src/commands/maintenance.ts | 54 | `item.ineligibilityReason ?` truthy check skips empty string; `appliedAt` already fixed with `!= null` at line 47 |
| `lib--config-ts--loadCliState` | packages/cli/src/lib/config.ts | 93-96 | `...(outputProfile != null ? { outputProfile } : {})` — when normalizeOutputProfile returns undefined (for falsy input like `""`), the empty string from `...parsed` persists; should explicitly set `outputProfile: undefined` |
| `commands--output-profile-ts--registerOutputProfileCommands` | packages/cli/src/commands/output-profile.ts, packages/cli/src/lib/config.ts | config.ts 73-84 | `normalizeOutputProfile` spreads `...profile` without filtering extra keys; `colorScheme` and other unknown properties leak through |
| `lib--markdown-formatter-ts--formatLoadContext` | packages/cli/src/lib/markdown-formatter.ts | 199-214 | Fallback section shown when plan exists with empty blockingTraps/recommendedSkills arrays; condition checks `!response.plan` OR `(plan.blockingTraps.length === 0 && plan.recommendedSkills.length === 0)` |
| `lib--markdown-formatter-ts--formatTrapNode` | packages/cli/src/lib/markdown-formatter.ts | 54 | `**${severityLabel} ${escapeMarkdown(trap.label)}**` — only severity+label in header; report claimed scope+score was present, needs verification |
| `lib--markdown-formatter-ts--push_1` | packages/cli/src/lib/markdown-formatter.ts | 170-196 | Numbered list items prepended to skill nodes (e.g., `1. **label**`) |
| `lib--markdown-formatter-ts--push_2` | packages/cli/src/lib/markdown-formatter.ts | 191-195 | Non-integer count: `maxSkills - opts.maxSkills` when `opts.maxSkills` is non-integer (e.g., `3.5`) produces `1.5 more skills` |
| `lib--output-profile-ts--buildCodexObject` | packages/cli/src/lib/output-profile.ts | 443-444 | `view.previousState ? { previous_state } : {}` — falsy values (`""`, `0`) omitted instead of using presence check |
| `lib--output-profile-ts--buildCommandResultView` | packages/cli/src/lib/output-profile.ts | 346 | `transition ? { transition } : {}` — includes transition with any truthy value (boolean, number, partial object) without validating `{from, to}` shape |
| `lib--output-profile-ts--renderCodex` | packages/cli/src/lib/output-profile.ts | 379-447 | Codex output uses long snake_case keys (e.g., `query_summary`, `project_knowledge`, `activation_hints`) — flagged by report as token-inefficient but may be intentional |
| `lib--output-profile-ts--resolveRenderer` | packages/cli/src/lib/output-profile.ts | (see renderer registry) | Throws TypeError when profile.tool not in registry instead of falling back to generic renderer |
| `lib--output-ts--printResult` | packages/cli/src/lib/output.ts | 16 | `JSON.stringify(value)` without compact format may produce multi-line output for string values containing newlines |
| `lib--prompts-ts--isInteractiveEnvironment` | packages/cli/src/lib/prompts.ts | 60-67 | Throws TypeError when `process.stdin` is undefined instead of returning false |
| `lib--prompts-ts--promptInput` | packages/cli/src/lib/prompts.ts | 41 | `options?.default !== undefined` allows empty string default; `@inquirer/prompts` `input()` returns empty string when user hits enter without input |
| `lib--skill-artifact-export-ts--formatExportJson` | packages/cli/src/lib/skill-artifact-export.ts | (formatExportJson fn) | `JSON.stringify` converts `Infinity`/`NaN` to `null`; no replacer function |
| `lib--input-ts--resolveTextInput` | packages/cli/src/lib/input.ts | 18-19 | `hasStdinContent()` uses `!process.stdin.isTTY` — doesn't detect content piped in TTY environment |
| `lib--artifact-bundle-ts--buildSingleSkillMdBundle` | packages/cli/src/lib/artifact-bundle.ts | (buildSingleSkillMdBundle) | Returns `scope='project'` for SKILL.md without explicit scope; spec expects default `'global'` |
| `lib--artifact-bundle-ts--scanSkillDirectory` | packages/cli/src/lib/artifact-bundle.ts | (scanSkillDirectory) | Returns absolute path for `skillMd` instead of relative path as spec requires |
| `index-ts--registerReviewCommands` | packages/cli/src/index.ts | 80+ | Review commands registered once remain on program even if called again with `allowReview=false`; no unregister mechanism |
| `index-ts--registerTeamCommands` | packages/cli/src/index.ts | 80+ | Similar to review: team create subcommand not removed when called with `allowCreate=false` |

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
| **Live** | 23 |
| **Fixed** | 26 |
| **Stale** | 8 |
| **Not confirmed by probe** | 25 (excluded from above counts) |
| **Total confirmed** | 54 |
