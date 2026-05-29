# CLI FM-Agent Source Pack

Maps raw fm-agent bug IDs to current source/test/doc files.

**Generated:** 2026-05-29
**Total confirmed:** 54 | **FIXED in HEAD:** 24 | **STILL LIVE:** 20 | **UNCERTAIN/INDEX-LEVEL:** 10

## Confirmed Findings — Mapped to Current Source

| raw id | detail md path | likely current file | doc to open first | status |
|---|---|---|---|---|
| `commands--auth-ts--registerAuthCommands` | .../commands--auth-ts--registerAuthCommands.md | packages/cli/src/commands/auth.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--decay-ts--formatBatchResult` | .../commands--decay-ts--formatBatchResult.md | packages/cli/src/commands/decay.ts:37-54 | docs/architecture/CLI.md | **PARTIAL** (appliedAt FIXED, ineligibilityReason LIVE) |
| `commands--decay-ts--formatDecayList` | .../commands--decay-ts--formatDecayList.md | packages/cli/src/commands/decay.ts:16-32 | docs/architecture/CLI.md | **LIVE** |
| `commands--evidence-ts--registerEvidenceCommands` | .../commands--evidence-ts--registerEvidenceCommands.md | packages/cli/src/commands/evidence.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--feedback-admin-ts--formatBatchResult` | .../commands--feedback-admin-ts--formatBatchResult.md | packages/cli/src/commands/feedback-admin.ts:38-56 | docs/architecture/CLI.md | **PARTIAL** (appliedAt FIXED, reason LIVE) |
| `commands--feedback-admin-ts--formatFeedbackList` | .../commands--feedback-admin-ts--formatFeedbackList.md | packages/cli/src/commands/feedback-admin.ts:16-33 | docs/architecture/CLI.md | **FIXED** |
| `commands--feedback-admin-ts--registerFeedbackAdminCommands` | .../commands--feedback-admin-ts--registerFeedbackAdminCommands.md | packages/cli/src/commands/feedback-admin.ts:58-211 | docs/architecture/CLI.md | not_confirmed |
| `commands--feedback-ts--formatFeedbackResult` | .../commands--feedback-ts--formatFeedbackResult.md | packages/cli/src/commands/feedback.ts:53-61 | docs/architecture/CLI.md | **FIXED** (stripAnsi added) |
| `commands--feedback-ts--registerFeedbackCommands` | .../commands--feedback-ts--registerFeedbackCommands.md | packages/cli/src/commands/feedback.ts:63-194 | docs/architecture/CLI.md | **FIXED** (entryType validation added) |
| `commands--knowledge-ts--registerKnowledgeCommands` | .../commands--knowledge-ts--registerKnowledgeCommands.md | packages/cli/src/commands/knowledge.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--load-ts--registerLoadCommand` | .../commands--load-ts--registerLoadCommand.md | packages/cli/src/commands/load.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--maintenance-ts--formatMaintenanceBatch` | .../commands--maintenance-ts--formatMaintenanceBatch.md | packages/cli/src/commands/maintenance.ts:42-59 | docs/architecture/CLI.md | **PARTIAL** (appliedAt FIXED, ineligibilityReason LIVE) |
| `commands--maintenance-ts--formatMaintenanceList` | .../commands--maintenance-ts--formatMaintenanceList.md | packages/cli/src/commands/maintenance.ts:22-37 | docs/architecture/CLI.md | **FIXED** (no double newline) |
| `commands--maintenance-ts--registerMaintenanceCommands` | .../commands--maintenance-ts--registerMaintenanceCommands.md | packages/cli/src/commands/maintenance.ts:61-255 | docs/architecture/CLI.md | not_confirmed |
| `commands--member-ts--registerMemberCommands` | .../commands--member-ts--registerMemberCommands.md | packages/cli/src/commands/member.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--operations--activate-ts--registerActivateCommand` | .../commands--operations--activate-ts--registerActivateCommand.md | packages/cli/src/commands/operations/activate.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--operations--deactivate-ts--registerDeactivateCommand` | .../commands--operations--deactivate-ts--registerDeactivateCommand.md | packages/cli/src/commands/operations/deactivate.ts:11-49 | docs/architecture/CLI.md | **FIXED** (reason length validation added) |
| `commands--operations--edit-ts--registerEditCommand` | .../commands--operations--edit-ts--registerEditCommand.md | packages/cli/src/commands/operations/edit.ts:10-74 | docs/architecture/CLI.md | **FIXED** (Number.isInteger validation added) |
| `commands--operations--export-ts--registerExportCommand` | .../commands--operations--export-ts--registerExportCommand.md | packages/cli/src/commands/operations/export.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--operations--import-ts--registerImportCommand` | .../commands--operations--import-ts--registerImportCommand.md | packages/cli/src/commands/operations/import.ts | docs/architecture/CLI.md | **STALE** (requireSessionToken uses typeof+length check) |
| `commands--operations--migrate-ts--registerMigrateCommand` | .../commands--operations--migrate-ts--registerMigrateCommand.md | packages/cli/src/commands/operations/migrate.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--operations--status-ts--registerStatusCommand` | .../commands--operations--status-ts--registerStatusCommand.md | packages/cli/src/commands/operations/status.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--operations-ts--registerOperationsCommands` | .../commands--operations-ts--registerOperationsCommands.md | packages/cli/src/commands/operations.ts:1-38 | docs/architecture/CLI.md | **FIXED** (all 8 commands always registered) |
| `commands--output-profile-ts--registerOutputProfileCommands` | .../commands--output-profile-ts--registerOutputProfileCommands.md | packages/cli/src/commands/output-profile.ts | docs/architecture/CLI.md | **LIVE** (extra properties preserved in normalizeOutputProfile) |
| `commands--policy-ts--registerPolicyCommands` | .../commands--policy-ts--registerPolicyCommands.md | packages/cli/src/commands/policy.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--retrieval-ts--formatProfileHint` | .../commands--retrieval-ts--formatProfileHint.md | packages/cli/src/commands/retrieval.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--retrieval-ts--join` | .../commands--retrieval-ts--join.md | packages/cli/src/commands/retrieval.ts | docs/architecture/CLI.md | **STALE** (extracted fragment, not a standalone function) |
| `commands--retrieval-ts--toFixed` | .../commands--retrieval-ts--toFixed.md | packages/cli/src/commands/retrieval.ts | docs/architecture/CLI.md | **STALE** (extracted fragment, inline expression) |
| `commands--review-ts--registerReviewCommands` | .../commands--review-ts--registerReviewCommands.md | packages/cli/src/commands/review.ts | docs/architecture/CLI.md | not_confirmed |
| `commands--skill-ts--formatApplyResolutionResponse` | .../commands--skill-ts--formatApplyResolutionResponse.md | packages/cli/src/commands/skill.ts:202-225 | docs/architecture/CLI.md | **FIXED** (candidate ID is first line) |
| `commands--skill-ts--formatDuplicateJobBundle` | .../commands--skill-ts--formatDuplicateJobBundle.md | packages/cli/src/commands/skill.ts:121-181 | docs/architecture/CLI.md | **FIXED** (`!= null` check on detail) |
| `commands--skill-ts--formatManualResultResponse` | .../commands--skill-ts--formatManualResultResponse.md | packages/cli/src/commands/skill.ts:186-197 | docs/architecture/CLI.md | **FIXED** (stripNewlines added) |
| `commands--skill-ts--formatSkillHistoryResponse` | .../commands--skill-ts--formatSkillHistoryResponse.md | packages/cli/src/commands/skill.ts:100-116 | docs/architecture/CLI.md | **FIXED** (no leading spaces) |
| `commands--skill-ts--formatSkillMatch` | .../commands--skill-ts--formatSkillMatch.md | packages/cli/src/commands/skill.ts:40-63 | docs/architecture/CLI.md | **FIXED** (stripNewlines added) |
| `commands--skill-ts--join` | .../commands--skill-ts--join.md | packages/cli/src/commands/skill.ts | docs/architecture/CLI.md | **STALE** (extracted fragment) |
| `commands--skill-ts--registerSkillCommands` | .../commands--skill-ts--registerSkillCommands.md | packages/cli/src/commands/skill.ts:227-236 | docs/architecture/CLI.md | **FIXED** (checks all 4 options before returning) |
| `commands--skill-ts--toFixed` | .../commands--skill-ts--toFixed.md | packages/cli/src/commands/skill.ts | docs/architecture/CLI.md | **STALE** (extracted fragment) |
| `commands--trap-ts--registerTrapCommands` | .../commands--trap-ts--registerTrapCommands.md | packages/cli/src/commands/trap.ts | docs/architecture/CLI.md | not_confirmed |
| `index-ts--command` | .../index-ts--command.md | packages/cli/src/index.ts:67-75 | docs/architecture/CLI.md | **STALE** (about command produces 4 lines, spec says 3) |
| `index-ts--registerKnowledgeCommands` | .../index-ts--registerKnowledgeCommands.md | packages/cli/src/index.ts | docs/architecture/CLI.md | not_confirmed |
| `index-ts--registerOperationsCommands` | .../index-ts--registerOperationsCommands.md | packages/cli/src/commands/operations.ts:1-38 | docs/PACKAGES.md | **STALE** (delegated to sub-modules) |
| `index-ts--registerReviewCommands` | .../index-ts--registerReviewCommands.md | packages/cli/src/index.ts | docs/architecture/CLI.md | **LIVE** (review commands not removed on re-registration) |
| `index-ts--registerTeamCommands` | .../index-ts--registerTeamCommands.md | packages/cli/src/index.ts | docs/architecture/CLI.md | **LIVE** (team create not removed on re-registration) |
| `index-ts--registerTrapCommands` | .../index-ts--registerTrapCommands.md | packages/cli/src/index.ts | docs/architecture/CLI.md | not_confirmed |
| `lib--activation-policy-ts--getPolicyStrictness` | .../lib--activation-policy-ts--getPolicyStrictness.md | packages/cli/src/lib/activation-policy.ts | docs/architecture/CLI.md | not_confirmed |
| `lib--artifact-bundle-ts--buildArtifactBundle` | .../lib--artifact-bundle-ts--buildArtifactBundle.md | packages/cli/src/lib/artifact-bundle.ts | docs/architecture/CLI.md | not_confirmed |
| `lib--artifact-bundle-ts--buildSingleSkillMdBundle` | .../lib--artifact-bundle-ts--buildSingleSkillMdBundle.md | packages/cli/src/lib/artifact-bundle.ts | docs/architecture/CLI.md | **LIVE** (scope defaults to 'project' not 'global') |
| `lib--artifact-bundle-ts--parseClaudeSkill` | .../lib--artifact-bundle-ts--parseClaudeSkill.md | packages/cli/src/lib/artifact-bundle.ts | docs/architecture/CLI.md | not_confirmed |
| `lib--artifact-bundle-ts--parseSkillMetadata` | .../lib--artifact-bundle-ts--parseSkillMetadata.md | packages/cli/src/lib/artifact-bundle.ts | docs/architecture/CLI.md | not_confirmed |
| `lib--artifact-bundle-ts--readFileContent` | .../lib--artifact-bundle-ts--readFileContent.md | packages/cli/src/lib/artifact-bundle.ts | docs/architecture/CLI.md | **STALE** (spec vs docs issue, not code bug) |
| `lib--artifact-bundle-ts--scanSkillDirectory` | .../lib--artifact-bundle-ts--scanSkillDirectory.md | packages/cli/src/lib/artifact-bundle.ts | docs/architecture/CLI.md | **LIVE** (returns absolute path) |
| `lib--artifact-bundle-ts--trim` | .../lib--artifact-bundle-ts--trim.md | packages/cli/src/lib/artifact-bundle.ts | docs/architecture/CLI.md | not_confirmed |
| `lib--config-ts--getConfigPath` | .../lib--config-ts--getConfigPath.md | packages/cli/src/lib/config.ts:44-52 | docs/PACKAGES.md | **FIXED** (fallback to tmpdir) |
| `lib--config-ts--loadCliState` | .../lib--config-ts--loadCliState.md | packages/cli/src/lib/config.ts:86-101 | docs/PACKAGES.md | **LIVE** |
| `lib--config-ts--saveCliState` | .../lib--config-ts--saveCliState.md | packages/cli/src/lib/config.ts:103-106 | docs/PACKAGES.md | not_confirmed |
| `lib--http-ts--requireSessionToken` | .../lib--http-ts--requireSessionToken.md | packages/cli/src/lib/http.ts:65-71 | docs/architecture/CLI.md | **FIXED** (typeof string check) |
| `lib--input-ts--resolveTextInput` | .../lib--input-ts--resolveTextInput.md | packages/cli/src/lib/input.ts:22-57 | docs/architecture/CLI.md | **LIVE** (TTY stdin detection) |
| `lib--markdown-formatter-ts--formatCapsuleFallback` | .../lib--markdown-formatter-ts--formatCapsuleFallback.md | packages/cli/src/lib/markdown-formatter.ts:115-157 | docs/architecture/CLI.md | not_confirmed |
| `lib--markdown-formatter-ts--formatLoadContext` | .../lib--markdown-formatter-ts--formatLoadContext.md | packages/cli/src/lib/markdown-formatter.ts:163-229 | docs/architecture/CLI.md | **LIVE** (fallback shows when plan has empty arrays) |
| `lib--markdown-formatter-ts--formatRoutingTrace` | .../lib--markdown-formatter-ts--formatRoutingTrace.md | packages/cli/src/lib/markdown-formatter.ts:98-110 | docs/architecture/CLI.md | **FIXED** (`length > 0` check) |
| `lib--markdown-formatter-ts--formatTrapNode` | .../lib--markdown-formatter-ts--formatTrapNode.md | packages/cli/src/lib/markdown-formatter.ts:50-59 | docs/architecture/CLI.md | **LIVE** (only severity+label in header now, FIXED? check) |
| `lib--markdown-formatter-ts--push_1` | .../lib--markdown-formatter-ts--push_1.md | packages/cli/src/lib/markdown-formatter.ts:170-196 | docs/architecture/CLI.md | **LIVE** (numbered list items on skill nodes) |
| `lib--markdown-formatter-ts--push_2` | .../lib--markdown-formatter-ts--push_2.md | packages/cli/src/lib/markdown-formatter.ts:191-195 | docs/architecture/CLI.md | **LIVE** (non-integer count when maxSkills is non-integer) |
| `lib--markdown-formatter-ts--push_3` | .../lib--markdown-formatter-ts--push_3.md | packages/cli/src/lib/markdown-formatter.ts | docs/architecture/CLI.md | not_confirmed |
| `lib--markdown-formatter-ts--truncateText` | .../lib--markdown-formatter-ts--truncateText.md | packages/cli/src/lib/markdown-formatter.ts:41-45 | docs/operations/TESTING.md | **FIXED** (maxLength<=3 protection added) |
| `lib--output-profile-ts--buildCodexObject` | .../lib--output-profile-ts--buildCodexObject.md | packages/cli/src/lib/output-profile.ts:361-454 | docs/architecture/CLI.md | **LIVE** (previous_state/transition truthiness) |
| `lib--output-profile-ts--buildCommandResultView` | .../lib--output-profile-ts--buildCommandResultView.md | packages/cli/src/lib/output-profile.ts:334-359 | docs/architecture/CLI.md | **LIVE** (transition truthiness validation) |
| `lib--output-profile-ts--createRenderEnvelope` | .../lib--output-profile-ts--createRenderEnvelope.md | packages/cli/src/lib/output-profile.ts | docs/architecture/CLI.md | not_confirmed |
| `lib--output-profile-ts--getDefaultOutputProfile` | .../lib--output-profile-ts--getDefaultOutputProfile.md | packages/cli/src/lib/config.ts:62-71 | docs/architecture/CLI.md | not_confirmed |
| `lib--output-profile-ts--renderCodex` | .../lib--output-profile-ts--renderCodex.md | packages/cli/src/lib/output-profile.ts:361-454 | docs/architecture/CLI.md | **LIVE** (snake_case key optimization) |
| `lib--output-profile-ts--renderOpenCode` | .../lib--output-profile-ts--renderOpenCode.md | packages/cli/src/lib/output-profile.ts | docs/architecture/CLI.md | not_confirmed |
| `lib--output-profile-ts--resolveRenderer` | .../lib--output-profile-ts--resolveRenderer.md | packages/cli/src/lib/output-profile.ts | docs/architecture/CLI.md | **LIVE** (throws on unknown tool) |
| `lib--output-profile-ts--summarizeGraphPlan` | .../lib--output-profile-ts--summarizeGraphPlan.md | packages/cli/src/lib/output-profile.ts:141-162 | docs/architecture/CLI.md | **FIXED** (`s != null` check in .some()) |
| `lib--output-profile-ts--summarizeRetrievalV1` | .../lib--output-profile-ts--summarizeRetrievalV1.md | packages/cli/src/lib/output-profile.ts:110-123 | docs/architecture/CLI.md | **FIXED** (`c != null` check in .find()) |
| `lib--output-ts--printResult` | .../lib--output-ts--printResult.md | packages/cli/src/lib/output.ts:14-21 | docs/architecture/CLI.md | **LIVE** (non-compact JSON output) |
| `lib--prompts-ts--isInteractiveEnvironment` | .../lib--prompts-ts--isInteractiveEnvironment.md | packages/cli/src/lib/prompts.ts:60-67 | docs/architecture/CLI.md | **LIVE** (throws on undefined stdin) |
| `lib--prompts-ts--promptInput` | .../lib--prompts-ts--promptInput.md | packages/cli/src/lib/prompts.ts:31-43 | docs/architecture/CLI.md | **LIVE** (empty string default) |
| `lib--prompts-ts--promptSelect` | .../lib--prompts-ts--promptSelect.md | packages/cli/src/lib/prompts.ts:16-25 | docs/architecture/CLI.md | **FIXED** (`!= null` check for description) |
| `lib--skill-artifact-export-ts--decodeFileContent` | .../lib--skill-artifact-export-ts--decodeFileContent.md | packages/cli/src/lib/skill-artifact-export.ts:81-96 | docs/architecture/CLI.md | **FIXED** (base64 detection regex) |
| `lib--skill-artifact-export-ts--formatExportJson` | .../lib--skill-artifact-export-ts--formatExportJson.md | packages/cli/src/lib/skill-artifact-export.ts | docs/architecture/CLI.md | **LIVE** (Infinity→null) |
| `lib--skill-artifact-export-ts--validateBundleFilePath` | .../lib--skill-artifact-export-ts--validateBundleFilePath.md | packages/cli/src/lib/skill-artifact-export.ts:53-75 | docs/architecture/CLI.md | **FIXED** (segment-based traversal check) |
| `lib--skill-artifact-export-ts--validateOutputPath` | .../lib--skill-artifact-export-ts--validateOutputPath.md | packages/cli/src/lib/skill-artifact-export.ts:26-47 | docs/architecture/CLI.md | **FIXED** (resolve+starts_with check) |
