import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { collectValues, resolveTextInput } from '@trapmap/cli/lib/input.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';
import { parseBoundaryJson } from '@trapmap/cli/lib/parse-boundary.js';
import type {
  KnowledgeEntry,
  KnowledgeEntryResponse,
  KnowledgeHistoryResponse,
} from '@trapmap/contracts';
import { knowledgeEntryResponseSchema, knowledgeHistoryResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

export interface KnowledgeEntryDescriptor {
  readonly actionPrefix: 'knowledge' | 'trap';
  readonly countSummary: (count: number) => string;
  readonly emptyHistoryMessage: string;
  readonly entryNoun: string;
  readonly labelNoun: string;
  readonly pluralNoun: string;
  readonly scopeNoun: string;
}

export const knowledgeEntryDescriptor: KnowledgeEntryDescriptor = {
  actionPrefix: 'knowledge',
  countSummary: (count) => (count > 0 ? `${count} entry/entries found.` : 'No submissions found.'),
  emptyHistoryMessage: 'No submissions found',
  entryNoun: 'knowledge entry',
  labelNoun: 'Knowledge label',
  pluralNoun: 'submissions',
  scopeNoun: 'Knowledge scope',
};

export const trapEntryDescriptor: KnowledgeEntryDescriptor = {
  actionPrefix: 'trap',
  countSummary: (count) => (count > 0 ? `${count} trap(s) found.` : 'No traps found.'),
  emptyHistoryMessage: 'No traps found',
  entryNoun: 'trap entry',
  labelNoun: 'Trap label',
  pluralNoun: 'traps',
  scopeNoun: 'Trap scope',
};

function formatKnowledgeEntry(entry: KnowledgeEntry): string {
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

function formatKnowledgeHistory(items: KnowledgeEntry[], emptyMessage: string): string {
  if (items.length === 0) {
    return emptyMessage;
  }

  return items.map((entry) => formatKnowledgeEntry(entry)).join('\n\n');
}

interface SubmitFlags {
  boundary?: string;
  detail?: string;
  file?: string;
  json?: boolean;
  label: string[];
  requiredLevel?: string;
  scope: 'global' | 'project';
  shortcut: string;
  stdin?: boolean;
}

interface ResubmitFlags {
  boundary?: string;
  detail?: string;
  file?: string;
  json?: boolean;
  label: string[];
  shortcut: string;
  stdin?: boolean;
}

async function resolveDetail(flags: {
  detail?: string;
  file?: string;
  stdin?: boolean;
}): Promise<string> {
  return resolveTextInput(
    {
      ...(flags.detail !== undefined ? { text: flags.detail } : {}),
      ...(flags.file !== undefined ? { file: flags.file } : {}),
      ...(flags.stdin !== undefined ? { stdin: flags.stdin } : {}),
    },
    'detail',
  );
}

function printEntryShowResult(
  parsed: KnowledgeEntryResponse,
  state: Awaited<ReturnType<typeof loadCliState>>,
  flags: { json?: boolean },
  action: string,
): void {
  printCommandResult(
    {
      action,
      success: true,
      summary: `${parsed.entry.id} (${parsed.entry.lifecycleState}): ${parsed.entry.shortcut}`,
      artifacts: [{ id: parsed.entry.id, newState: parsed.entry.lifecycleState }],
      nextSteps: [],
    },
    parsed,
    state,
    flags,
    ({ entry }) => formatKnowledgeEntry(entry),
  );
}

function printEntryListResult(
  kind: KnowledgeEntryDescriptor,
  parsed: KnowledgeHistoryResponse,
  state: Awaited<ReturnType<typeof loadCliState>>,
  flags: { json?: boolean },
  action: string,
): void {
  printCommandResult(
    {
      action,
      success: true,
      summary: kind.countSummary(parsed.items.length),
      artifacts: parsed.items.map((entry) => ({
        id: entry.id,
        newState: entry.lifecycleState,
      })),
      nextSteps: [],
    },
    parsed,
    state,
    flags,
    ({ items }) => formatKnowledgeHistory(items, kind.emptyHistoryMessage),
  );
}

export function registerKnowledgeEntrySubmit(
  parent: Command,
  kind: KnowledgeEntryDescriptor,
): void {
  parent
    .command('submit')
    .description(`Submit a new ${kind.entryNoun} for review`)
    .requiredOption('--scope <scope>', `${kind.scopeNoun}: global or project`)
    .requiredOption('--label <label>', kind.labelNoun, collectValues, [])
    .requiredOption('--shortcut <text>', 'One-line pitfall shortcut')
    .option('--detail <text>', 'Detailed pitfall and fix description')
    .option('--file <path>', 'Read detail text from a file')
    .option('--stdin', 'Read detail text from stdin')
    .option('--required-level <n>', 'Override required security level')
    .option('--boundary <json>', 'Boundary constraints as JSON')
    .option('--json', 'Output JSON')
    .action(async (flags: SubmitFlags) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const detail = await resolveDetail(flags);
      const boundary = parseBoundaryJson(flags.boundary);
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

      printCommandResult(
        {
          action: `${kind.actionPrefix}-submit`,
          success: true,
          summary: `Submitted ${parsed.entry.id} (${parsed.entry.lifecycleState}).`,
          artifacts: [{ id: parsed.entry.id, newState: parsed.entry.lifecycleState }],
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        ({ entry }) =>
          [
            `Submitted ${entry.id}`,
            `Lifecycle: ${entry.lifecycleState}`,
            `Shortcut: ${entry.shortcut}`,
          ].join('\n'),
      );
    });
}

export function registerKnowledgeEntryResubmit(
  parent: Command,
  kind: KnowledgeEntryDescriptor,
): void {
  parent
    .command('resubmit')
    .description(`Resubmit a rejected ${kind.entryNoun}`)
    .argument('<entryId>', `${kind.entryNoun} identifier`)
    .requiredOption('--label <label>', kind.labelNoun, collectValues, [])
    .requiredOption('--shortcut <text>', 'Updated pitfall shortcut')
    .option('--detail <text>', 'Updated detailed explanation')
    .option('--file <path>', 'Read updated detail text from a file')
    .option('--stdin', 'Read updated detail text from stdin')
    .option('--boundary <json>', 'Boundary constraints as JSON')
    .option('--json', 'Output JSON')
    .action(async (entryId: string, flags: ResubmitFlags) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const detail = await resolveDetail(flags);
      const boundary = parseBoundaryJson(flags.boundary);
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

      printCommandResult(
        {
          action: `${kind.actionPrefix}-resubmit`,
          success: true,
          summary: `Resubmitted ${parsed.entry.id} (${parsed.entry.lifecycleState}, revision ${parsed.entry.latestRevision.revision}).`,
          artifacts: [
            {
              id: parsed.entry.id,
              newState: parsed.entry.lifecycleState,
              revision: parsed.entry.latestRevision.revision,
            },
          ],
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        ({ entry }) =>
          [
            `Resubmitted ${entry.id}`,
            `Lifecycle: ${entry.lifecycleState}`,
            `Revision: ${entry.latestRevision.revision}`,
          ].join('\n'),
      );
    });
}

export function registerKnowledgeEntryShow(parent: Command, kind: KnowledgeEntryDescriptor): void {
  parent
    .command('show')
    .description(`Show details of a ${kind.entryNoun}`)
    .argument('<entryId>', `${kind.entryNoun} identifier`)
    .option('--json', 'Output JSON')
    .action(async (entryId: string, flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const response = await apiRequest<KnowledgeEntryResponse>(state, {
        path: `/v1/knowledge/${entryId}`,
      });
      const parsed = knowledgeEntryResponseSchema.parse(response.data);

      printEntryShowResult(parsed, state, flags, `${kind.actionPrefix}-show`);
    });
}

export function registerKnowledgeEntryList(parent: Command, kind: KnowledgeEntryDescriptor): void {
  parent
    .command('list')
    .description(`List your ${kind.pluralNoun}`)
    .option('--json', 'Output JSON')
    .action(async (flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const response = await apiRequest<KnowledgeHistoryResponse>(state, {
        path: '/v1/knowledge/mine',
      });
      const parsed = knowledgeHistoryResponseSchema.parse(response.data);

      printEntryListResult(kind, parsed, state, flags, `${kind.actionPrefix}-list`);
    });
}

export function registerKnowledgeEntryReviewStatus(
  parent: Command,
  kind: KnowledgeEntryDescriptor,
): void {
  parent
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

        printEntryShowResult(parsed, state, flags, `${kind.actionPrefix}-review-status`);
        return;
      }

      const response = await apiRequest<KnowledgeHistoryResponse>(state, {
        path: '/v1/knowledge/mine',
      });
      const parsed = knowledgeHistoryResponseSchema.parse(response.data);

      printEntryListResult(kind, parsed, state, flags, `${kind.actionPrefix}-review-history`);
    });
}
