import type {
  KnowledgeEntry,
  KnowledgeEntryResponse,
  KnowledgeHistoryResponse,
} from '@trapmap/contracts';
import { knowledgeEntryResponseSchema, knowledgeHistoryResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { collectValues, resolveTextInput } from '../lib/input.js';
import { printResult } from '../lib/output.js';

interface KnowledgeCommandOptions {
  allowInspect: boolean;
  allowSubmit: boolean;
}

function formatEntry(entry: KnowledgeEntry): string {
  const lines = [
    `${entry.id} [${entry.lifecycleState}]`,
    `Scope: ${entry.scope}`,
    `Required level: ${entry.requiredLevel}`,
    `Owner: ${entry.owner.handle}`,
    `Labels: ${entry.labels.join(', ')}`,
    `Shortcut: ${entry.shortcut}`,
    `History: ${entry.history.length} revision(s)`,
  ];

  if (entry.agentReview) {
    lines.push(`Agent review: ${entry.agentReview.status}`);

    if (entry.agentReview.notes.length > 0) {
      lines.push(`Agent notes: ${entry.agentReview.notes.join(' | ')}`);
    }
  }

  if (entry.reviewHistory.length > 0) {
    const lastDecision = entry.reviewHistory.at(-1);

    if (lastDecision) {
      lines.push(
        `Last decision: ${lastDecision.decision} by ${lastDecision.decidedBy.handle} (${lastDecision.notes})`,
      );
    }
  }

  return lines.join('\n');
}

function formatHistory(items: KnowledgeEntry[]): string {
  if (items.length === 0) {
    return 'No submissions found';
  }

  return items.map((entry) => formatEntry(entry)).join('\n\n');
}

export function registerKnowledgeCommands(
  program: Command,
  options: KnowledgeCommandOptions,
): void {
  if (options.allowSubmit) {
    program
      .command('submit')
      .description('Submit a new knowledge entry for review')
      .requiredOption('--scope <scope>', 'Knowledge scope: global or project')
      .requiredOption('--label <label>', 'Knowledge label', collectValues, [])
      .requiredOption('--shortcut <text>', 'One-line pitfall shortcut')
      .option('--detail <text>', 'Detailed pitfall and fix description')
      .option('--file <path>', 'Read detail text from a file')
      .option('--stdin', 'Read detail text from stdin')
      .option('--required-level <n>', 'Override required security level')
      .option('--boundary <json>', 'Boundary constraints as JSON')
      .option('--json', 'Output JSON')
      .action(
        async (flags: {
          boundary?: string;
          detail?: string;
          file?: string;
          json?: boolean;
          label: string[];
          requiredLevel?: string;
          scope: 'global' | 'project';
          shortcut: string;
          stdin?: boolean;
        }) => {
          const state = await loadCliState();
          requireSessionToken(state);
          const detail = await resolveTextInput(
            {
              ...(flags.detail !== undefined ? { text: flags.detail } : {}),
              ...(flags.file !== undefined ? { file: flags.file } : {}),
              ...(flags.stdin !== undefined ? { stdin: flags.stdin } : {}),
            },
            'detail',
          );
          let boundary: unknown;
          if (flags.boundary !== undefined) {
            try {
              boundary = JSON.parse(flags.boundary);
            } catch (error) {
              throw new Error(
                `Invalid boundary JSON: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
          const response = await apiRequest<KnowledgeEntryResponse>(state, {
            method: 'POST',
            path: '/v1/knowledge',
            body: {
              scope: flags.scope,
              labels: flags.label,
              shortcut: flags.shortcut,
              detail,
              requiredLevel:
                flags.requiredLevel !== undefined ? Number(flags.requiredLevel) : undefined,
              boundary,
            },
          });
          const parsed = knowledgeEntryResponseSchema.parse(response.data);

          printResult(parsed, flags, ({ entry }) =>
            [
              `Submitted ${entry.id}`,
              `Lifecycle: ${entry.lifecycleState}`,
              `Shortcut: ${entry.shortcut}`,
            ].join('\n'),
          );
        },
      );

    program
      .command('resubmit')
      .description('Resubmit a rejected knowledge entry')
      .argument('<entryId>', 'Knowledge entry identifier')
      .requiredOption('--label <label>', 'Knowledge label', collectValues, [])
      .requiredOption('--shortcut <text>', 'Updated pitfall shortcut')
      .option('--detail <text>', 'Updated detailed explanation')
      .option('--file <path>', 'Read updated detail text from a file')
      .option('--stdin', 'Read updated detail text from stdin')
      .option('--boundary <json>', 'Boundary constraints as JSON')
      .option('--json', 'Output JSON')
      .action(
        async (
          entryId: string,
          flags: {
            boundary?: string;
            detail?: string;
            file?: string;
            json?: boolean;
            label: string[];
            shortcut: string;
            stdin?: boolean;
          },
        ) => {
          const state = await loadCliState();
          requireSessionToken(state);
          const detail = await resolveTextInput(
            {
              ...(flags.detail !== undefined ? { text: flags.detail } : {}),
              ...(flags.file !== undefined ? { file: flags.file } : {}),
              ...(flags.stdin !== undefined ? { stdin: flags.stdin } : {}),
            },
            'detail',
          );
          let boundary: unknown;
          if (flags.boundary !== undefined) {
            try {
              boundary = JSON.parse(flags.boundary);
            } catch (error) {
              throw new Error(
                `Invalid boundary JSON: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
          const response = await apiRequest<KnowledgeEntryResponse>(state, {
            method: 'POST',
            path: `/v1/knowledge/${entryId}/resubmit`,
            body: {
              labels: flags.label,
              shortcut: flags.shortcut,
              detail,
              boundary,
            },
          });
          const parsed = knowledgeEntryResponseSchema.parse(response.data);

          printResult(parsed, flags, ({ entry }) =>
            [
              `Resubmitted ${entry.id}`,
              `Lifecycle: ${entry.lifecycleState}`,
              `Revision: ${entry.latestRevision.revision}`,
            ].join('\n'),
          );
        },
      );

    program
      .command('supersede')
      .description('Supersede a knowledge entry with a replacement')
      .argument('<entryId>', 'Knowledge entry to supersede')
      .requiredOption('--replacement <id>', 'ID of the replacement entry')
      .option('--json', 'Output JSON')
      .action(async (entryId: string, flags: { replacement: string; json?: boolean }) => {
        const state = await loadCliState();
        requireSessionToken(state);
        const response = await apiRequest<KnowledgeEntryResponse>(state, {
          method: 'POST',
          path: `/v1/knowledge/${entryId}/supersede`,
          body: { replacementId: flags.replacement },
        });
        const parsed = knowledgeEntryResponseSchema.parse(response.data);

        printResult(parsed, flags, ({ entry }) =>
          [
            `Superseded ${entry.id}`,
            `Lifecycle: ${entry.lifecycleState}`,
          ].join('\n'),
        );
      });
  }

  if (options.allowInspect) {
    program
      .command('review-status')
      .description('Inspect your submission history or a specific knowledge entry')
      .argument('[entryId]', 'Knowledge entry identifier')
      .option('--json', 'Output JSON')
      .action(async (entryId: string | undefined, flags: { json?: boolean }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        if (entryId) {
          const response = await apiRequest<KnowledgeEntryResponse>(state, {
            path: `/v1/knowledge/${entryId}`,
          });
          const parsed = knowledgeEntryResponseSchema.parse(response.data);

          printResult(parsed, flags, ({ entry }) => formatEntry(entry));
          return;
        }

        const response = await apiRequest<KnowledgeHistoryResponse>(state, {
          path: '/v1/knowledge/mine',
        });
        const parsed = knowledgeHistoryResponseSchema.parse(response.data);

        printResult(parsed, flags, ({ items }) => formatHistory(items));
      });
  }
}
