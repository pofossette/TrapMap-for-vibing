import type {
  DuplicateJobBundleResponse,
  ManualResultResponse,
  SkillEditResponse,
  SkillHistoryResponse,
  SkillLookupResponse,
  SkillReviewDecisionResponse,
  SkillReviewQueueResponse,
} from '@trapmap/contracts';
import {
  DuplicateJobBundleResponseSchema,
  manualResultResponseSchema,
  skillEditResponseSchema,
  skillHistoryResponseSchema,
  skillLookupResponseSchema,
  skillReviewDecisionResponseSchema,
  skillReviewQueueResponseSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';
import { readFileSync } from 'node:fs';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

interface SkillCommandOptions {
  allowSearch: boolean;
  allowSubmit: boolean;
  allowExport: boolean;
  allowReview: boolean;
}

/**
 * Format a skill lookup match for text output (Phase 18 SKED-01).
 * Renders artifact-first results without capsule content.
 */
function formatSkillMatch(match: {
  artifactId: string;
  title: string;
  slug: string;
  labels: string[];
  scope: string;
  requiredLevel: number;
  sourceKind: string;
  score: number;
  reason: string;
}): string {
  const lines = [
    `${match.artifactId}`,
    `Title: ${match.title}`,
    `Slug: ${match.slug}`,
    `Labels: ${match.labels.join(', ')}`,
    `Scope: ${match.scope} (level ${match.requiredLevel})`,
    `Source: ${match.sourceKind}`,
    `Score: ${match.score.toFixed(2)}`,
    `Reason: ${match.reason}`,
  ];

  return lines.join('\n');
}

/**
 * Format skill lookup response for text output.
 */
function formatSkillLookupResponse(response: SkillLookupResponse): string {
  if (response.matches.length === 0) {
    return 'No skills found';
  }

  return response.matches.map(formatSkillMatch).join('\n\n');
}

/**
 * Format skill edit response for text output (Phase 19 SKED-02).
 */
function formatSkillEditResponse(response: SkillEditResponse): string {
  const lines = [
    `Artifact ID: ${response.artifact.id}`,
    `Title: ${response.artifact.title}`,
    `Previous Revision: ${response.previousRevision}`,
    `New Revision: ${response.artifact.latestRevision}`,
    `Lifecycle State: ${response.artifact.lifecycleState}`,
  ];

  if (response.lifecycleTransition) {
    lines.push(`Transition: ${response.lifecycleTransition.from} → ${response.lifecycleTransition.to}`);
  }

  return lines.join('\n');
}

/**
 * Format skill history response for text output (Phase 19 SKED-04).
 */
function formatSkillHistoryResponse(response: SkillHistoryResponse): string {
  const header = [
    `Artifact ID: ${response.artifactId}`,
    `Title: ${response.title}`,
    `Current Revision: ${response.currentRevision}`,
    `Lifecycle State: ${response.lifecycleState}`,
    '',
    'Revision History:',
  ];

  const revisions = response.revisions.map((r) => {
    const submitter = r.submittedBy.handle ?? r.submittedBy.id;
    return `  ${r.revision}. ${r.submittedAt} by ${submitter} [${r.lifecycleState}]${r.summary ? ` - ${r.summary}` : ''}`;
  });

  return [...header, ...revisions].join('\n');
}

/**
 * Format duplicate job bundle for text output (Phase 34).
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

/**
 * Format manual result response for text output (Phase 34).
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

export function registerSkillCommands(program: Command, options: SkillCommandOptions): void {
  // Always register the skill command if any subcommand is allowed
  if (!options.allowSearch && !options.allowSubmit && !options.allowExport) {
    return;
  }

  const skill = program.command('skill').description('Search and manage skill artifacts');

  // Phase 18: skill search-by-content
  if (options.allowSearch) {
    skill
      .command('search-by-content')
      .description('Search for skills by content text')
      .argument('<text>', 'Search text')
      .option('--max-results <n>', 'Maximum number of matches to return', '10')
      .option('--json', 'Output JSON')
      .action(
        async (
          text: string,
          flags: {
            maxResults: string;
            json?: boolean;
          },
        ) => {
          const state = await loadCliState();
          requireSessionToken(state);

          const body = {
            text,
            maxResults: Number.parseInt(flags.maxResults, 10),
          };

          const response = await apiRequest<SkillLookupResponse>(state, {
            method: 'POST',
            path: '/v1/retrieval/skills/search-by-content',
            body,
          });

          const parsed = skillLookupResponseSchema.parse(response.data);

          printResult(parsed, flags, formatSkillLookupResponse);
        },
      );
  }

  // Phase 19: skill edit (SKED-02)
  if (options.allowSubmit) {
    skill
      .command('edit')
      .description('Edit a skill artifact by ID')
      .argument('<artifactId>', 'Artifact ID to edit')
      .option('--title <title>', 'New title for the artifact')
      .option('--labels <labels>', 'Comma-separated new labels')
      .option('--file <path>', 'Path to a file to include (SKILL.md)', (value, previous: string[]) => {
        return previous ? [...previous, value] : [value];
      })
      .option('--json', 'Output JSON')
      .action(
        async (
          artifactId: string,
          flags: {
            title?: string;
            labels?: string;
            file?: string[];
            json?: boolean;
          },
        ) => {
          const state = await loadCliState();
          requireSessionToken(state);

          // Validate at least one update option is provided
          if (!flags.title && !flags.labels && !flags.file) {
            throw new Error('At least one of --title, --labels, or --file is required');
          }

          // Build edit payload
          const body: Record<string, unknown> = { artifactId };

          if (flags.title) {
            body.title = flags.title;
          }

          if (flags.labels) {
            body.labels = flags.labels.split(',').map((l) => l.trim());
          }

          if (flags.file && flags.file.length > 0) {
            // Read file contents
            const files = flags.file.map((filePath) => {
              const content = readFileSync(filePath, 'utf-8');
              const path = filePath.endsWith('SKILL.md') ? 'SKILL.md' : filePath;
              return {
                path,
                kind: filePath.endsWith('SKILL.md') ? 'skill-markdown' : 'reference',
                content,
                sha256: '',  // Server will compute
                sizeBytes: Buffer.byteLength(content, 'utf-8'),
                mediaType: 'text/markdown',
                source: filePath.endsWith('SKILL.md') ? 'SKILL.md' : 'references/',
                includeInDerivation: true,
                activationOnly: false,
              };
            });
            body.files = files;
          }

          const response = await apiRequest<SkillEditResponse>(state, {
            method: 'POST',
            path: `/v1/operations/artifacts/${artifactId}/edit`,
            body,
          });

          const parsed = skillEditResponseSchema.parse(response.data);

          printResult(parsed, flags, formatSkillEditResponse);
        },
      );
  }

  // Phase 19: skill history (SKED-04)
  if (options.allowExport) {
    skill
      .command('history')
      .description('View revision history for a skill artifact')
      .argument('<artifactId>', 'Artifact ID to view history for')
      .option('--json', 'Output JSON')
      .action(
        async (
          artifactId: string,
          flags: {
            json?: boolean;
          },
        ) => {
          const state = await loadCliState();
          requireSessionToken(state);

          const response = await apiRequest<SkillHistoryResponse>(state, {
            method: 'GET',
            path: `/v1/operations/artifacts/${artifactId}/history`,
          });

          const parsed = skillHistoryResponseSchema.parse(response.data);

          printResult(parsed, flags, formatSkillHistoryResponse);
        },
      );
  }

  // Phase 20: skill review commands (SKED-03)
  if (options.allowReview) {
    /**
     * Format skill review queue for text output.
     */
    function formatSkillReviewQueue(response: SkillReviewQueueResponse): string {
      if (response.items.length === 0) {
        return 'Review queue is empty';
      }

      return response.items
        .map(({ artifact, agentReview, lastDecision }) => {
          const lines = [
            `${artifact.id} [${artifact.lifecycleState}]`,
            `Title: ${artifact.title}`,
            `Required level: ${artifact.requiredLevel}`,
            `Owner: ${artifact.owner.handle}`,
            `Agent review: ${agentReview?.status ?? 'none'}`,
            `Last decision: ${lastDecision ? `${lastDecision.decision} (${lastDecision.notes})` : 'none'}`,
          ];
          return lines.join('\n');
        })
        .join('\n\n');
    }

    /**
     * Format skill review decision response for text output.
     */
    function formatSkillReviewDecisionResponse(response: SkillReviewDecisionResponse): string {
      const lines = [
        `Artifact ID: ${response.artifact.id}`,
        `Title: ${response.artifact.title}`,
        `Previous State: ${response.previousState}`,
        `New State: ${response.newState}`,
      ];
      return lines.join('\n');
    }

    skill
      .command('review:queue')
      .description('View pending skill edits for review')
      .option('--json', 'Output JSON')
      .action(async (flags: { json?: boolean }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const response = await apiRequest<SkillReviewQueueResponse>(state, {
          method: 'GET',
          path: '/v1/operations/artifacts/review-queue',
        });

        const parsed = skillReviewQueueResponseSchema.parse(response.data);

        printResult(parsed, flags, formatSkillReviewQueue);
      });

    skill
      .command('review:approve')
      .description('Approve a pending skill edit')
      .argument('<artifactId>', 'Artifact ID to approve')
      .requiredOption('--notes <text>', 'Review notes (required)')
      .option('--json', 'Output JSON')
      .action(
        async (
          artifactId: string,
          flags: {
            notes: string;
            json?: boolean;
          },
        ) => {
          const state = await loadCliState();
          requireSessionToken(state);

          const response = await apiRequest<SkillReviewDecisionResponse>(state, {
            method: 'POST',
            path: `/v1/operations/artifacts/${artifactId}/review`,
            body: {
              artifactId,
              decision: 'approve',
              notes: flags.notes,
            },
          });

          const parsed = skillReviewDecisionResponseSchema.parse(response.data);

          printResult(parsed, flags, formatSkillReviewDecisionResponse);
        },
      );

    skill
      .command('review:reject')
      .description('Reject a pending skill edit')
      .argument('<artifactId>', 'Artifact ID to reject')
      .requiredOption('--notes <text>', 'Review notes (required)')
      .option('--json', 'Output JSON')
      .action(
        async (
          artifactId: string,
          flags: {
            notes: string;
            json?: boolean;
          },
        ) => {
          const state = await loadCliState();
          requireSessionToken(state);

          const response = await apiRequest<SkillReviewDecisionResponse>(state, {
            method: 'POST',
            path: `/v1/operations/artifacts/${artifactId}/review`,
            body: {
              artifactId,
              decision: 'reject',
              notes: flags.notes,
            },
          });

          const parsed = skillReviewDecisionResponseSchema.parse(response.data);

          printResult(parsed, flags, formatSkillReviewDecisionResponse);
        },
      );

    // Phase 34: duplicate-job commands
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

        const parsed = DuplicateJobBundleResponseSchema.parse(response.data);

        printResult(parsed, flags, formatDuplicateJobBundle);
      });

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
  }
}
