---
wave: 4
depends_on:
  - 34-01
  - 34-03
files_modified:
  - packages/cli/src/commands/skill.ts
autonomous: true
---

# Plan 34-04: Add CLI Commands for Duplicate Job Fetch and Resolve

## Objective

Add CLI commands under the `skill` namespace to fetch duplicate job bundles and submit manual resolution decisions.

## Context

Plan 34-03 added server endpoints for bundle fetch and manual result intake. Now we need CLI commands to provide a discoverable, operator-friendly interface.

Commands:
- `skill duplicate-job fetch <candidateId>` - Fetch bundle for offline review
- `skill duplicate-job resolve <candidateId> --decision <independent|merged> --notes <text>` - Submit decision

## Tasks

### Task 1: Add duplicate-job fetch command

<read_first>
- packages/cli/src/commands/skill.ts
- packages/cli/src/lib/http.ts
- packages/cli/src/lib/output.ts
</read_first>

<acceptance_criteria>
- `skill duplicate-job fetch <candidateId>` command exists
- Command calls `GET /v1/duplicates/:candidateId/bundle`
- Command outputs formatted bundle with candidate info, matches, and expected schema
- `--json` flag outputs raw JSON
- Prints fetch command hint after successful output
</acceptance_criteria>

<action>
Add to `packages/cli/src/commands/skill.ts`:

```typescript
import type {
  DuplicateJobBundleResponse,
  ManualResultResponse,
} from '@trapmap/contracts';
import {
  duplicateJobBundleResponseSchema,
  manualResultResponseSchema,
} from '@trapmap/contracts';

// ... existing code ...

/**
 * Format duplicate job bundle for text output.
 */
function formatDuplicateJobBundle(response: DuplicateJobBundleResponse): string {
  const lines = [
    `Candidate ID: ${response.candidate.id}`,
    `Source Type: ${response.candidate.sourceType}`,
    `Status: ${response.candidate.status}`,
    `Received: ${response.candidate.receivedAt}`,
    '',
    '=== ORIGINAL PAYLOAD ===',
  ];

  if (response.originalPayload.trap) {
    const trap = response.originalPayload.trap;
    lines.push(
      `Type: Trap`,
      `Shortcut: ${trap.shortcut}`,
      `Detail: ${trap.detail.slice(0, 200)}${trap.detail.length > 200 ? '...' : ''}`,
      `Labels: ${trap.labels.join(', ')}`,
    );
  } else if (response.originalPayload.skill) {
    const skill = response.originalPayload.skill;
    lines.push(
      `Type: Skill`,
      `Files: ${skill.files.length} file(s)`,
      `Labels: ${skill.metadata.labels.join(', ')}`,
    );
    for (const file of skill.files) {
      lines.push(`  - ${file.path} (${file.sizeBytes} bytes)`);
    }
  }

  lines.push('', '=== MATCHES ===');
  for (const entry of response.matches) {
    const m = entry.match;
    const e = entry.entity;
    lines.push(
      '',
      `Match: ${e.title}`,
      `  ID: ${e.entityId}`,
      `  Type: ${e.entityType}`,
      `  Similarity: ${(m.similarityScore * 100).toFixed(1)}%`,
      `  Match Type: ${m.matchType}`,
    );
    if (e.entityType === 'trap' && e.detail) {
      lines.push(`  Detail: ${e.detail.slice(0, 150)}${e.detail.length > 150 ? '...' : ''}`);
    }
  }

  lines.push('', '=== EXPECTED MANUAL RESULT SCHEMA ===');
  for (const field of response.expectedResultSchema.fields) {
    const req = field.required ? 'required' : 'optional';
    lines.push(`  ${field.name} (${field.type}, ${req}): ${field.description}`);
  }

  lines.push(
    '',
    '=== FETCH COMMAND ===',
    `trapmap skill duplicate-job fetch ${response.candidate.id}`,
  );

  return lines.join('\n');
}

// In registerSkillCommands function, add:

  // Phase 34: duplicate-job commands
  if (options.allowReview) {
    const duplicateJob = skill
      .command('duplicate-job')
      .description('Manage duplicate job review workflow');

    duplicateJob
      .command('fetch')
      .description('Fetch duplicate job bundle for offline review')
      .argument('<candidateId>', 'Candidate ID to fetch')
      .option('--json', 'Output raw JSON')
      .action(async (candidateId: string, flags: { json?: boolean }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const response = await apiRequest<DuplicateJobBundleResponse>(state, {
          method: 'GET',
          path: `/v1/duplicates/${candidateId}/bundle`,
        });

        const parsed = duplicateJobBundleResponseSchema.parse(response.data);

        printResult(parsed, flags, formatDuplicateJobBundle);
      });
  }
```

</action>

### Task 2: Add duplicate-job resolve command

<read_first>
- packages/cli/src/commands/skill.ts
</read_first>

<acceptance_criteria>
- `skill duplicate-job resolve <candidateId>` command exists
- `--decision <independent|merged>` option is required
- `--notes <text>` option is required
- `--merged-with <entityId>` option for merged decisions
- Command calls `POST /v1/candidates/:candidateId/manual-result`
- Outputs decision result with next state
- Prints fetch command for future reference
</acceptance_criteria>

<action>
Add to `packages/cli/src/commands/skill.ts` in the `duplicate-job` command group:

```typescript
/**
 * Format manual result response for text output.
 */
function formatManualResultResponse(response: ManualResultResponse): string {
  const lines = [
    `Candidate ID: ${response.candidateId}`,
    `Decision: ${response.decision}`,
    `Reviewed At: ${response.reviewedAt}`,
    `Next State: ${response.nextState}`,
    '',
    'To fetch this job again:',
    `  trapmap skill duplicate-job fetch ${response.candidateId}`,
  ];
  return lines.join('\n');
}

// Add to duplicateJob command group:

    duplicateJob
      .command('resolve')
      .description('Submit manual resolution for duplicate candidate')
      .argument('<candidateId>', 'Candidate ID to resolve')
      .requiredOption('--decision <decision>', 'Decision: independent or merged')
      .requiredOption('--notes <text>', 'Explanation of the decision')
      .option('--merged-with <entityId>', 'Entity ID to merge with (required if decision is merged)')
      .option('--merged-type <type>', 'Entity type: trap or skill (required if decision is merged)')
      .option('--json', 'Output raw JSON')
      .action(
        async (
          candidateId: string,
          flags: {
            decision: string;
            notes: string;
            mergedWith?: string;
            mergedType?: string;
            json?: boolean;
          },
        ) => {
          const state = await loadCliState();
          requireSessionToken(state);

          // Validate decision value
          if (flags.decision !== 'independent' && flags.decision !== 'merged') {
            throw new Error('--decision must be "independent" or "merged"');
          }

          // Validate merged options
          if (flags.decision === 'merged') {
            if (!flags.mergedWith || !flags.mergedType) {
              throw new Error('--merged-with and --merged-type are required when decision is "merged"');
            }
            if (flags.mergedType !== 'trap' && flags.mergedType !== 'skill') {
              throw new Error('--merged-type must be "trap" or "skill"');
            }
          }

          const body: Record<string, unknown> = {
            decision: flags.decision,
            notes: flags.notes,
          };

          if (flags.decision === 'merged' && flags.mergedWith && flags.mergedType) {
            body.mergedWith = {
              entityId: flags.mergedWith,
              entityType: flags.mergedType,
            };
          }

          const response = await apiRequest<ManualResultResponse>(state, {
            method: 'POST',
            path: `/v1/candidates/${candidateId}/manual-result`,
            body,
          });

          const parsed = manualResultResponseSchema.parse(response.data);

          printResult(parsed, flags, formatManualResultResponse);
        },
      );
```

</action>

### Task 3: Update CLI visibility options

<read_first>
- packages/cli/src/index.ts
</read_first>

<acceptance_criteria>
- CLI index.ts includes `skill duplicate-job` in available commands list for reviewers
- `SkillCommandOptions` interface is extended if needed
</acceptance_criteria>

<action>
The `allowReview` permission already controls access to `skill duplicate-job` commands. Update the `api:list` output in `packages/cli/src/index.ts` to include:

```typescript
// In the allowKnowledgeReview conditional array:
...(visibility.allowKnowledgeReview
  ? [
      'review:queue',
      'review:approve',
      'review:reject',
      'skill review:queue',
      'skill review:approve',
      'skill review:reject',
      'skill duplicate-job fetch',
      'skill duplicate-job resolve',
    ]
  : []),
```

</action>

## Verification

```bash
# Verify commands exist
grep -c "duplicate-job\|fetch\|resolve" packages/cli/src/commands/skill.ts
# Build succeeds
pnpm --filter @trapmap/cli build
# CLI shows commands
pnpm --filter @trapmap/cli exec trapmap skill duplicate-job --help
```

## Files Modified

- `packages/cli/src/commands/skill.ts` - Added duplicate-job fetch and resolve commands
- `packages/cli/src/index.ts` - Updated api:list to show new commands