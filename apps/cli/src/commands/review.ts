import type { Boundary, KnowledgeEntryResponse, ReviewQueueResponse } from '@trapmap/contracts';
import {
  evidenceLevelSchema,
  evidenceSourceTypeSchema,
  knowledgeEntryResponseSchema,
  reviewQueueResponseSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';
import { parseBoundaryJson } from '@trapmap/cli/lib/parse-boundary.js';

/**
 * Evidence input from CLI flags.
 * The server fills in verifiedAt and verifiedBy based on the reviewer context.
 */
interface EvidenceInput {
  sourceType: 'internal-experience' | 'incident' | 'doc' | 'code' | 'external-reference';
  evidenceLevel: 'anecdotal' | 'reproduced' | 'documented' | 'verified-in-prod';
  sourceRef?: string;
}

interface ReviewCommandOptions {
  allowReview: boolean;
}

function formatBoundary(boundary: Boundary | null): string | null {
  if (!boundary) return null;

  const parts: string[] = [];

  if (boundary.context.length > 0) {
    const items = boundary.context.slice(0, 3);
    const suffix = boundary.context.length > 3 ? '...' : '';
    parts.push(`context=[${items.join(', ')}${suffix}]`);
  }

  if (boundary.versions.length > 0) {
    const items = boundary.versions.slice(0, 2).map((v) => `${v.package}${v.range}`);
    const suffix = boundary.versions.length > 2 ? '...' : '';
    parts.push(`versions=[${items.join(', ')}${suffix}]`);
  }

  if (parts.length === 0) return null;
  return parts.join(', ');
}

function formatQueue(response: ReviewQueueResponse): string {
  if (response.items.length === 0) {
    return 'Review queue is empty';
  }

  return response.items
    .map(({ entry, lastDecision }) => {
      const lines = [
        `${entry.id} [${entry.lifecycleState}]`,
        `Shortcut: ${entry.shortcut}`,
        `Required level: ${entry.requiredLevel}`,
        `Owner: ${entry.owner.handle}`,
        `Agent review: ${entry.agentReview?.status ?? 'none'}`,
        `Last decision: ${
          lastDecision ? `${lastDecision.decision} (${lastDecision.notes})` : 'none'
        }`,
      ];

      const boundarySummary = formatBoundary(entry.boundary);
      if (boundarySummary) {
        lines.push(`Boundary: ${boundarySummary}`);
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

export function registerReviewCommands(program: Command, options: ReviewCommandOptions): void {
  if (!options.allowReview) {
    return;
  }

  program
    .command('review:queue')
    .description('Inspect the review queue for the active team')
    .option('--status <state>', 'Filter by lifecycle state')
    .option('--json', 'Output JSON')
    .action(async (flags: { json?: boolean; status?: string }) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const path = flags.status
        ? `/v1/knowledge/review-queue?status=${encodeURIComponent(flags.status)}`
        : '/v1/knowledge/review-queue';
      const response = await apiRequest<ReviewQueueResponse>(state, {
        path,
      });
      const parsed = reviewQueueResponseSchema.parse(response.data);

      printCommandResult(
        {
          action: 'review-queue',
          success: true,
          summary:
            parsed.items.length > 0
              ? `${parsed.items.length} item(s) in review queue.`
              : 'Review queue is empty.',
          artifacts: parsed.items.map((item) => ({
            id: item.entry.id,
            newState: item.entry.lifecycleState,
          })),
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        (value) => formatQueue(value),
      );
    });

  for (const decision of ['approve', 'reject'] as const) {
    const decisionLabel = `${decision.slice(0, 1).toUpperCase()}${decision.slice(1)}`;

    program
      .command(`review:${decision}`)
      .description(`${decisionLabel} a queued knowledge entry`)
      .argument('<entryId>', 'Knowledge entry identifier')
      .requiredOption('--notes <text>', 'Reviewer notes')
      .option('--boundary <json>', 'Boundary constraints as JSON')
      .option(
        '--source-type <type>',
        'Evidence source type (internal-experience, incident, doc, code, external-reference)',
      )
      .option('--source-ref <ref>', 'Source reference URL or identifier')
      .option(
        '--evidence-level <level>',
        'Evidence level (anecdotal, reproduced, documented, verified-in-prod)',
      )
      .option('--json', 'Output JSON')
      .action(
        async (
          entryId: string,
          flags: {
            boundary?: string;
            evidenceLevel?: string;
            json?: boolean;
            notes: string;
            sourceRef?: string;
            sourceType?: string;
          },
        ) => {
          const state = await loadCliState();
          requireSessionToken(state);

          const boundary = parseBoundaryJson(flags.boundary);

          // Build evidence object if any evidence flags are provided
          let evidence: EvidenceInput | undefined;
          if (flags.sourceType !== undefined || flags.evidenceLevel !== undefined) {
            // Validate source-type if provided
            if (flags.sourceType !== undefined) {
              const parsed = evidenceSourceTypeSchema.safeParse(flags.sourceType);
              if (!parsed.success) {
                const validOptions = evidenceSourceTypeSchema.options.join(', ');
                throw new Error(
                  `Invalid source type: ${flags.sourceType}. Valid options: ${validOptions}`,
                );
              }
            }

            // Validate evidence-level if provided
            if (flags.evidenceLevel !== undefined) {
              const parsed = evidenceLevelSchema.safeParse(flags.evidenceLevel);
              if (!parsed.success) {
                const validOptions = evidenceLevelSchema.options.join(', ');
                throw new Error(
                  `Invalid evidence level: ${flags.evidenceLevel}. Valid options: ${validOptions}`,
                );
              }
            }

            evidence = {
              sourceType:
                (flags.sourceType as EvidenceInput['sourceType']) ?? 'internal-experience',
              evidenceLevel: (flags.evidenceLevel as EvidenceInput['evidenceLevel']) ?? 'anecdotal',
              ...(flags.sourceRef !== undefined && { sourceRef: flags.sourceRef }),
            };
          }

          const requestBody: Record<string, unknown> = {
            entryId,
            decision,
            notes: flags.notes,
          };

          // Add optional fields only if defined
          if (boundary !== undefined) {
            requestBody.boundary = boundary;
          }
          if (evidence !== undefined) {
            requestBody.evidence = evidence;
          }

          const response = await apiRequest<KnowledgeEntryResponse>(state, {
            method: 'POST',
            path: '/v1/knowledge/review',
            body: requestBody,
          });
          const parsed = knowledgeEntryResponseSchema.parse(response.data);

          printCommandResult(
            {
              action: `review-${decision}`,
              success: true,
              summary: `${decision}d ${parsed.entry.id} (${parsed.entry.lifecycleState}).`,
              artifacts: [{ id: parsed.entry.id, newState: parsed.entry.lifecycleState }],
              nextSteps: [],
            },
            parsed,
            state,
            flags,
            ({ entry }) =>
              [`${decision}d ${entry.id}`, `Lifecycle: ${entry.lifecycleState}`].join('\n'),
          );
        },
      );
  }
}
