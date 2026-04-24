import type {
  KnowledgeEntry,
  KnowledgeEntryResponse,
  KnowledgeHistoryResponse,
} from '@trapmap/contracts';
import {
  knowledgeEntryResponseSchema,
  knowledgeHistoryResponseSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { collectValues, resolveTextInput } from '../lib/input.js';
import { printResult } from '../lib/output.js';

interface TrapCommandOptions {
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
    return 'No traps found';
  }
  return items.map((entry) => formatEntry(entry)).join('\n\n');
}

export function registerTrapCommands(
  program: Command,
  options: TrapCommandOptions,
): void {
  const trap = program.command('trap').description('Manage trap entries (pitfall/warning knowledge)');

  if (options.allowSubmit) {
    trap
      .command('submit')
      .description('Submit a new trap entry for review')
      .requiredOption('--scope <scope>', 'Trap scope: global or project')
      .requiredOption('--label <label>', 'Trap label', collectValues, [])
      .requiredOption('--shortcut <text>', 'One-line pitfall shortcut')
      .option('--detail <text>', 'Detailed pitfall and fix description')
      .option('--file <path>', 'Read detail text from a file')
      .option('--stdin', 'Read detail text from stdin')
      .option('--required-level <n>', 'Override required security level')
      .option('--json', 'Output JSON')
      .action(
        async (flags: {
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

    trap
      .command('resubmit')
      .description('Resubmit a rejected trap entry')
      .argument('<entryId>', 'Trap entry identifier')
      .requiredOption('--label <label>', 'Trap label', collectValues, [])
      .requiredOption('--shortcut <text>', 'Updated pitfall shortcut')
      .option('--detail <text>', 'Updated detailed explanation')
      .option('--file <path>', 'Read updated detail text from a file')
      .option('--stdin', 'Read updated detail text from stdin')
      .option('--json', 'Output JSON')
      .action(
        async (
          entryId: string,
          flags: {
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
          const response = await apiRequest<KnowledgeEntryResponse>(state, {
            method: 'POST',
            path: `/v1/knowledge/${entryId}/resubmit`,
            body: {
              labels: flags.label,
              shortcut: flags.shortcut,
              detail,
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
  }

  if (options.allowInspect) {
    trap
      .command('list')
      .description('List your trap submissions')
      .option('--json', 'Output JSON')
      .action(async (flags: { json?: boolean }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const response = await apiRequest<KnowledgeHistoryResponse>(state, {
          path: '/v1/knowledge/mine',
        });
        const parsed = knowledgeHistoryResponseSchema.parse(response.data);

        printResult(parsed, flags, ({ items }) => formatHistory(items));
      });

    trap
      .command('show')
      .description('Show details of a trap entry')
      .argument('<entryId>', 'Trap entry identifier')
      .option('--json', 'Output JSON')
      .action(async (entryId: string, flags: { json?: boolean }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const response = await apiRequest<KnowledgeEntryResponse>(state, {
          path: `/v1/knowledge/${entryId}`,
        });
        const parsed = knowledgeEntryResponseSchema.parse(response.data);

        printResult(parsed, flags, ({ entry }) => formatEntry(entry));
      });
  }
}
