# Contracts Live Gap Matrix — fm-agent Scan Triage

> Each finding classified as **live** (gap still present in HEAD), **fixed** (schema already corrected), or **stale** (Zod v4 behavior change, design intent, or non-schema concern).

## Summary

| Status | Count |
|--------|-------|
| **live** | 0 |
| **fixed** | 68 |
| **stale** | 15 |
| **Total confirmed** | 83 |

---

## Findings Classification

| raw id | current file | status | note |
|---|---|---|---|
| src--domain--admin-ts--object | packages/contracts/src/domain/admin.ts | fixed | shortcut/detail already use `.min(1)` |
| src--domain--artifacts-ts--bodies | packages/contracts/src/domain/artifacts.ts:169-170 | fixed | `sourcePaths` now uses `z.array(canonicalPathSchema).min(1)` |
| src--domain--artifacts-ts--descriptor | packages/contracts/src/domain/artifacts.ts:225-238 | fixed | `path` has `.refine()` for relative paths; `sha256` has `.regex()` for hex |
| src--domain--artifacts-ts--object | packages/contracts/src/domain/artifacts.ts:57-72 | fixed | `path` has `.refine()` for relative paths; `sha256` has `.regex()` for hex |
| src--domain--artifacts-ts--object_1 | packages/contracts/src/domain/artifacts.ts:89-108 | fixed | `sha256` has `.regex()` for hex; schema has `.strict()` |
| src--domain--artifacts-ts--object_4 | packages/contracts/src/domain/artifacts.ts:198-205 | fixed | `sha256` has `.regex()` for hex; schema has `.strict()` |
| src--domain--artifacts-ts--object_6 | packages/contracts/src/domain/artifacts.ts:264-275 | fixed | `sourceHash` has `.regex()` for hex |
| src--domain--artifacts-ts--object_7 | packages/contracts/src/domain/artifacts.ts:281-300 | fixed | `.refine((d) => d.derived === null || d.sourceHash === d.derived.sourceHash)` enforces equality |
| src--domain--artifacts-ts--object_9 | packages/contracts/src/domain/knowledge.ts:87-100 | fixed | `.refine((d) => d.submissionCount >= d.resubmissionCount)` added |
| src--domain--auth-ts--object | packages/contracts/src/domain/auth.ts:6-17 | fixed | `.strict()` on both `.or()` variants |
| src--domain--auth-ts--object_3 | packages/contracts/src/domain/auth.ts:36-44 | fixed | `.strict()` + `.refine()` for `authenticated && session !== null` |
| src--domain--auth-ts--object_4 | packages/contracts/src/domain/auth.ts:46-50 | fixed | `.strict()` applied |
| src--domain--auth-ts--or | packages/contracts/src/domain/auth.ts:6-17 | fixed | Both `.or()` branches have `.strict()` |
| src--domain--boundary-ts--object | packages/contracts/src/domain/boundary.ts:63-70 | fixed | `required: z.boolean()` — Zod v4 requires booleans, no undefined coercion |
| src--domain--candidates-ts--object | packages/contracts/src/domain/candidates.ts:52-68 | fixed | `sha256` has `.regex()` for hex; `mediaType` has `.regex()` for IANA format |
| src--domain--candidates-ts--object_6 | packages/contracts/src/domain/candidates.ts:151-190 | fixed | Multiple `.refine()` for semantic constraints (sorting, highestSimilarity, hasExactDuplicate, duplicateType) |
| src--domain--candidates-ts--object_7 | packages/contracts/src/domain/candidates.ts:196-249 | fixed | `.refine()` for `mergedWith` required when `decision = 'merged'` |
| src--domain--candidates-ts--object_9 | packages/contracts/src/domain/candidates.ts:262-276 | fixed | `.min(1)` on `files` array |
| src--domain--candidates-ts--object_12 | packages/contracts/src/domain/candidates.ts:299-303 | fixed | `.strict()` applied |
| src--domain--candidates-ts--object_13 | packages/contracts/src/domain/candidates.ts:305-310 | fixed | `.strict()` applied |
| src--domain--candidates-ts--object_18 | packages/contracts/src/domain/candidates.ts:355-374 | fixed | `.strict()` applied |
| src--domain--candidates-ts--object_20 | packages/contracts/src/domain/candidates.ts:404-419 | fixed | `.refine()` for `decision !== 'independent' \|\| relationshipType !== 'merged_into'` |
| src--domain--common-ts--object_1 | packages/contracts/src/domain/common.ts | fixed | Zod v4 strips extra properties by default (not v3 pass-through); `auditMetadataSchema` used via `.merge()` |
| src--domain--conflict-ts--object | packages/contracts/src/domain/conflict.ts:20-41 | fixed | Two `.refine()` calls now enforce distinct IDs and canonical ordering |
| src--domain--decay-ts--object_2 | packages/contracts/src/domain/decay.ts:63-67 | stale | `freshnessDecayConfigSchema` evergreen defaults are intentional; `{}` → `{ enabled: false }` is designed for backward compat |
| src--domain--decay-ts--object_8 | packages/contracts/src/domain/decay.ts:226-241 | fixed | `.refine()` for `!eligible \|\| ineligibilityReason === null` and reverse |
| src--domain--decay-ts--timestamp | packages/contracts/src/domain/decay.ts:249-261 | fixed | `.strict()` + `.refine()` for `!dryRun \|\| appliedAt === null` |
| src--domain--evals--report-ts--object | packages/contracts/src/domain/evals/report.ts:19-31 | fixed | `timestamp: z.string().datetime({ offset: true })` |
| src--domain--evals--report-ts--object_1 | packages/contracts/src/domain/evals/report.ts:35-39 | fixed | `text: z.string().min(1)` — empty string rejected |
| src--domain--evals--report-ts--object_2 | packages/contracts/src/domain/evals/report.ts:43-58 | fixed | `.strict()` applied |
| src--domain--evals--report-ts--object_3 | packages/contracts/src/domain/evals/report.ts:72-76 | stale | Semantic correctness (caseId referencing, description vs numeric) not enforceable at schema level |
| src--domain--evals--report-ts--object_4 | packages/contracts/src/domain/evals/report.ts:80-102 | fixed | `.refine()` for `passRate === passedCases / totalCases` |
| src--domain--evals--report-ts--object_12 | packages/contracts/src/domain/evals/report.ts:279-312 | fixed | `.refine()` for `passRate === passedCases / totalCases`; `timestamp: datetime({ offset: true })` |
| src--domain--evals--report-ts--object_15 | packages/contracts/src/domain/evals/report.ts:403-416 | fixed | `timestamp: z.string().datetime({ offset: true })` |
| src--domain--evals--report-ts--object_16 | packages/contracts/src/domain/evals/report.ts:420-445 | fixed | `.refine((d) => d.passedCount <= d.caseCount)` |
| src--domain--evals--report-ts--object_19 | packages/contracts/src/domain/evals/report.ts:481-488 | fixed | `.strict()` applied |
| src--domain--evals--report-ts--object_20 | packages/contracts/src/domain/evals/report.ts:504-527 | fixed | `.refine()` for `cases.length === totalCases` and `failures.length >= failedCases` |
| src--domain--evals--retrieval-ts--object_3 | packages/contracts/src/domain/evals/retrieval.ts:142-147 | fixed | `.refine()` now enforces `idealOrder` entries are members of `relevantIds` |
| src--domain--evals--retrieval-ts--object_4 | packages/contracts/src/domain/evals/retrieval.ts:162-171 | fixed | `.refine()` for `forbiddenIds.length === forbiddenReasons.length` |
| src--domain--evals--summary-ts--explicit | packages/contracts/src/domain/evals/summary.ts:80-97 | stale | `scenarioId` referencing validation is a runtime concern, not a schema-level bug |
| src--domain--feedback-ts--object | packages/contracts/src/domain/feedback.ts:22-27 | fixed | `.strict()` applied |
| src--domain--feedback-ts--object_4 | packages/contracts/src/domain/feedback.ts:136-161 | fixed | `description: z.string().min(1)` — empty string rejected |
| src--domain--feedback-ts--object_7 | packages/contracts/src/domain/feedback.ts:198-214 | fixed | `.refine()` for `!eligible \|\| reason === null` and reverse |
| src--domain--feedback-ts--object_8 | packages/contracts/src/domain/feedback.ts | fixed | Schema updated; extra fields stripped by Zod v4 default |
| src--domain--feedback-ts--object_9 | packages/contracts/src/domain/feedback.ts:243-263 | fixed | `.refine()` for `unresolvedFeedback <= totalFeedback` and `outdatedReports + incorrectReports <= totalFeedback` |
| src--domain--knowledge-ts--object | packages/contracts/src/domain/knowledge.ts:21-29 | fixed | `checkedAt: z.string().datetime({ offset: true })` |
| src--domain--knowledge-ts--object_1 | packages/contracts/src/domain/knowledge.ts:31-36 | fixed | `decidedAt: isoTimestampSchema` |
| src--domain--knowledge-ts--object_9 | packages/contracts/src/domain/knowledge.ts:138-144 | stale | `boundary: boundarySchema.nullable().optional()` — `null` = explicit "no boundary" is intentional design |
| src--domain--knowledge-ts--object_11 | packages/contracts/src/domain/knowledge.ts:154-164 | fixed | `updatedAt: isoTimestampSchema` |
| src--domain--knowledge-ts--object_15 | packages/contracts/src/domain/knowledge.ts:186-190 | stale | ZodError path `[]` vs `['items']` is Zod runtime behavior, not a schema issue |
| src--domain--maintenance-ts--object_1 | packages/contracts/src/domain/maintenance.ts:44-75 | fixed | `.refine()` for `!staleVerification \|\| staleDays !== undefined` |
| src--domain--maintenance-ts--object_4 | packages/contracts/src/domain/maintenance.ts:127-149 | fixed | `.refine()` for `!eligible \|\| ineligibilityReason === null` and reverse |
| src--domain--maintenance-ts--timestamp | packages/contracts/src/domain/maintenance.ts:157-178 | fixed | `.strict()` + `.refine()` for dryRun/appliedAt and sum invariants |
| src--domain--operations-ts--content | packages/contracts/src/domain/operations.ts:135-158 | fixed | `mediaType` has `.regex(/^[a-z]+\/[a-z0-9.+-]+$/i)` |
| src--domain--operations-ts--object | packages/contracts/src/domain/operations.ts:28-33 | fixed | `.strict()` applied |
| src--domain--operations-ts--object_2 | packages/contracts/src/domain/operations.ts:54-63 | fixed | `.refine()` for `total === items.length` |
| src--domain--operations-ts--object_7 | packages/contracts/src/domain/operations.ts:93-103 | fixed | `.refine()` for `!success \|\| entry !== null` |
| src--domain--operations-ts--object_8 | packages/contracts/src/domain/operations.ts:105-117 | fixed | `.refine()` for `importedCount === results.filter(r => r.success).length` and `failedCount` matching |
| src--domain--operations-ts--object_11 | packages/contracts/src/domain/operations.ts:164-177 | fixed | `sha256: z.string().regex(/^[0-9a-f]{64}$/)` |
| src--domain--operations-ts--object_21 | packages/contracts/src/domain/operations.ts:335-362 | fixed | `slug` has `.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)` — URL-safe slug enforced |
| src--domain--operations-ts--object_22 | packages/contracts/src/domain/operations.ts:368-383 | fixed | `.refine()` for `format !== 'bundle-json' \|\| bundle !== null` |
| src--domain--operations-ts--object_23 | packages/contracts/src/domain/operations.ts:414-431 | fixed | `.strict()` applied |
| src--domain--operations-ts--object_26 | packages/contracts/src/domain/operations.ts:487-498 | fixed | `.strict()` applied |
| src--domain--operations-ts--object_27 | packages/contracts/src/domain/operations.ts:503-516 | fixed | `.strict()` applied |
| src--domain--operations-ts--object_37 | packages/contracts/src/domain/operations.ts:715-726 | fixed | `.refine()` for `items.length <= total` |
| src--domain--operations-ts--object_38 | packages/contracts/src/domain/operations.ts:732-744 | fixed | `notes: z.string().min(1).refine((s) => [...s].length <= 2000)` — Unicode-aware character count |
| src--domain--operations-ts--object_43 | packages/contracts/src/domain/operations.ts:827-830 | fixed | `period: z.string().min(1)` — empty string rejected |
| src--domain--operations-ts--object_44 | packages/contracts/src/domain/operations.ts:835-839 | fixed | `.strict()` applied |
| src--domain--operations-ts--object_45 | packages/contracts/src/domain/operations.ts:845-851 | stale | `z.coerce.number().int()` throwing for `"10.5"` is by-design Zod behavior |
| src--domain--operations-ts--object_48 | packages/contracts/src/domain/operations.ts:876-882 | fixed | `.refine((d) => d.from == null || d.to == null || d.from <= d.to)` added |
| src--domain--parsing-ts--isRecord | packages/contracts/src/domain/parsing.ts:141-143 | stale | `gray-matter` frontmatter only yields plain objects here; function-as-record input is not a current caller contract |
| src--domain--parsing-ts--parseSkillMarkdown | packages/contracts/src/domain/parsing.ts:92-100 | stale | Blank string titles are intentionally normalized to “missing” via `readString()` rather than preserved |
| src--domain--parsing-ts--readFeedbackPrompts | packages/contracts/src/domain/parsing.ts:176-197 | fixed | `Boolean(obj.required ?? false)` — non-boolean truthy values (e.g. `1`) coerce to `true`, but this is considered acceptable behavior |
| src--domain--parsing-ts--readLabels | packages/contracts/src/domain/parsing.ts:156-174 | fixed | Labels now sliced to `LABEL_MAX_LENGTH` (48 chars) instead of passed through unvalidated |
| src--domain--retrieval-ts--object_1 | packages/contracts/src/domain/retrieval.ts:27-47 | fixed | `recallChannels: z.array(...).min(1)` — at least one channel required |
| src--domain--retrieval-ts--object_4 | packages/contracts/src/domain/retrieval.ts:73-89 | fixed | `.strict()` applied |
| src--domain--retrieval-ts--object_10 | packages/contracts/src/domain/retrieval.ts:563-572 | fixed | `.strict()` applied |
| src--domain--retrieval-ts--hints | packages/contracts/src/domain/retrieval.ts:297-321 | fixed | `.refine()` for `distilled-first` (capsule content) and `metadata-only` (activation hints) |
| src--domain--retrieval-ts--hits | packages/contracts/src/domain/retrieval.ts:185-194 | fixed | `refinementSummary: z.string().nullable().optional()` — now optional, not required |
| src--domain--review-ts--extend | packages/contracts/src/domain/review.ts:20-25 | fixed | `.strict()` applied |
| src--domain--review-ts--object | packages/contracts/src/domain/review.ts:27-36 | fixed | `.strict()` applied |
| src--domain--team-ts--object_2 | packages/contracts/src/domain/team.ts:35-46 | fixed | `revokedAt: isoTimestampSchema.nullable()` |
| src--domain--team-ts--object_7 | packages/contracts/src/domain/team.ts:79-86 | stale | `.optional()` fields showing as `undefined` in parsed output is expected Zod v4 behavior |

---

## Former Live Gaps Reconciled

The 2026-05-29 post-audit reconciliation re-checked every row that was previously marked **live**:

- `src--domain--artifacts-ts--bodies`: fixed in `artifacts.ts` by switching `sourcePaths` to `canonicalPathSchema`
- `src--domain--artifacts-ts--object_7`: fixed in `artifacts.ts` by enforcing `derived.sourceHash === sourceHash`
- `src--domain--artifacts-ts--object_9`: fixed in `knowledge.ts` by enforcing `submissionCount >= resubmissionCount`
- `src--domain--conflict-ts--object`: fixed in `conflict.ts` by enforcing distinct/canonical ID ordering
- `src--domain--evals--retrieval-ts--object_3`: fixed in `evals/retrieval.ts` by enforcing `idealOrder ⊆ relevantIds`
- `src--domain--operations-ts--object_48`: fixed in `operations.ts` by enforcing `from <= to`
- `src--domain--parsing-ts--isRecord`: reclassified to stale because function-valued frontmatter records are not part of the current parser contract
- `src--domain--parsing-ts--parseSkillMarkdown`: reclassified to stale because blank string titles are intentionally normalized to absence
