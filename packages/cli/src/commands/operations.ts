import type {
  ExportBundle,
  ImportResponse,
  KnowledgeDeactivateResponse,
  KnowledgeEntryResponse,
  KnowledgeListResponse,
} from '@skill-shareer/contracts';
import {
  exportBundleSchema,
  importResponseSchema,
  knowledgeDeactivateResponseSchema,
  knowledgeEntryResponseSchema,
  knowledgeListResponseSchema,
} from '@skill-shareer/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { resolveTextInput } from '../lib/input.js';
import { printResult } from '../lib/output.js';

interface OperationsCommandOptions {
  allowExport: boolean;
  allowEdit: boolean;
  allowDeactivate: boolean;
  allowImport: boolean;
}

/**
 * Parses a SKILL.md format content with YAML frontmatter.
 * Extracts name as shortcut and description as detail.
 * Returns null if parsing fails.
 */
function parseClaudeSkill(
  content: string,
): { shortcut: string; detail: string; scope: string; labels: string[] } | null {
  // Match frontmatter between --- markers
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return null;
  }

  const match = frontmatterMatch;
  if (!match[1] || !match[2]) {
    return null;
  }

  const frontmatterRaw = match[1];
  const body = match[2];

  // Simple YAML parsing for the fields we care about
  const lines = frontmatterRaw.split('\n');
  const frontmatter: Record<string, string> = {};

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    const unquoted = value.replace(/^["']|["']$/g, '');
    frontmatter[key] = unquoted;
  }

  const name = frontmatter['name'];
  if (!name) {
    return null;
  }

  const description = frontmatter['description'] ?? '';
  const detailContent = body.trim() || description;

  return {
    scope: 'project',
    labels: ['imported', 'skill'],
    shortcut: name,
    detail: detailContent,
  };
}

function formatListResponse(response: KnowledgeListResponse): string {
  if (response.items.length === 0) {
    return 'No knowledge entries found';
  }

  return response.items
    .map((item) =>
      [
        `${item.id} [${item.lifecycleState}]`,
        `Scope: ${item.scope}`,
        `Required level: ${item.requiredLevel}`,
        `Shortcut: ${item.shortcut}`,
      ].join('\n'),
    )
    .join('\n\n');
}

export function registerOperationsCommands(
  program: Command,
  options: OperationsCommandOptions,
): void {
  if (options.allowExport) {
    program
      .command('list')
      .description('List knowledge entries with optional filters')
      .option('--scope <scope>', 'Filter by scope: global or project')
      .option('--state <state>', 'Filter by lifecycle state (comma-separated)')
      .option('--max-level <n>', 'Filter entries at or below this security level')
      .option('--owner <userId>', 'Filter by owner user ID')
      .option('--json', 'Output JSON')
      .action(
        async (flags: {
          json?: boolean;
          maxLevel?: string;
          owner?: string;
          scope?: string;
          state?: string;
        }) => {
          const state = await loadCliState();
          requireSessionToken(state);

          const queryParams = new URLSearchParams();

          if (flags.scope !== undefined) {
            queryParams.set('scope', flags.scope);
          }

          if (flags.state !== undefined) {
            queryParams.set('lifecycleState', flags.state);
          }

          if (flags.maxLevel !== undefined) {
            queryParams.set('requiredLevelMax', flags.maxLevel);
          }

          if (flags.owner !== undefined) {
            queryParams.set('ownerUserId', flags.owner);
          }

          const path =
            queryParams.size > 0
              ? `/v1/operations/knowledge?${queryParams}`
              : '/v1/operations/knowledge';
          const response = await apiRequest<KnowledgeListResponse>(state, { path });
          const parsed = knowledgeListResponseSchema.parse(response.data);

          printResult(parsed, flags, (value) => formatListResponse(value));
        },
      );
  }

  if (options.allowEdit) {
    program
      .command('edit')
      .description('Edit a knowledge entry')
      .argument('<entryId>', 'Knowledge entry identifier')
      .option('--shortcut <text>', 'Updated pitfall shortcut')
      .option('--detail <text>', 'Updated detailed explanation')
      .option('--labels <labels>', 'Updated labels (comma-separated)')
      .option('--required-level <n>', 'Updated required security level')
      .option('--json', 'Output JSON')
      .action(
        async (
          entryId: string,
          flags: {
            detail?: string;
            json?: boolean;
            labels?: string;
            requiredLevel?: string;
            shortcut?: string;
          },
        ) => {
          const cliState = await loadCliState();
          requireSessionToken(cliState);

          const body: Record<string, unknown> = { entryId };

          if (flags.shortcut !== undefined) {
            body.shortcut = flags.shortcut;
          }

          if (flags.detail !== undefined) {
            body.detail = flags.detail;
          }

          if (flags.labels !== undefined) {
            body.labels = flags.labels.split(',').map((l) => l.trim());
          }

          if (flags.requiredLevel !== undefined) {
            body.requiredLevel = Number(flags.requiredLevel);
          }

          const response = await apiRequest<KnowledgeEntryResponse>(cliState, {
            method: 'PATCH',
            path: `/v1/knowledge/${entryId}`,
            body,
          });
          const parsed = knowledgeEntryResponseSchema.parse(response.data);

          printResult(parsed, flags, ({ entry }) =>
            [
              `Updated ${entry.id}`,
              `Lifecycle: ${entry.lifecycleState}`,
              `Revision: ${entry.latestRevision.revision}`,
            ].join('\n'),
          );
        },
      );
  }

  if (options.allowDeactivate) {
    program
      .command('deactivate')
      .description('Deactivate a knowledge entry')
      .argument('<entryId>', 'Knowledge entry identifier')
      .requiredOption('--reason <text>', 'Reason for deactivation (1-500 characters)')
      .option('--json', 'Output JSON')
      .action(async (entryId: string, flags: { json?: boolean; reason: string }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const response = await apiRequest<KnowledgeDeactivateResponse>(state, {
          method: 'POST',
          path: `/v1/operations/knowledge/${entryId}/deactivate`,
          body: {
            entryId,
            reason: flags.reason,
          },
        });
        const parsed = knowledgeDeactivateResponseSchema.parse(response.data);

        printResult(parsed, flags, ({ entry }) =>
          [`Deactivated ${entry.id}`, `Lifecycle: ${entry.lifecycleState}`].join('\n'),
        );
      });
  }

  if (options.allowExport) {
    program
      .command('export')
      .description('Export knowledge entries to JSON')
      .option('--team <teamId>', 'Filter by team ID (use "null" for global entries)')
      .option('--include-history', 'Include submission and review history', true)
      .option('--output <path>', 'Write output to file instead of stdout')
      .option('--json', 'Output JSON')
      .action(
        async (flags: {
          includeHistory?: boolean;
          json?: boolean;
          output?: string;
          team?: string;
        }) => {
          const state = await loadCliState();
          requireSessionToken(state);

          const body: { includeHistory: boolean; teamId?: string | null } = {
            includeHistory: flags.includeHistory ?? true,
          };

          if (flags.team !== undefined) {
            body.teamId = flags.team === 'null' ? null : flags.team;
          }

          const response = await apiRequest<ExportBundle>(state, {
            method: 'POST',
            path: '/v1/operations/export',
            body,
          });
          const parsed = exportBundleSchema.parse(response.data);

          const outputText = flags.json
            ? JSON.stringify(parsed, null, 2)
            : `Exported ${parsed.items.length} entries at ${parsed.exportedAt}`;

          if (flags.output) {
            const { writeFile } = await import('node:fs/promises');
            await writeFile(flags.output, JSON.stringify(parsed, null, 2), 'utf8');
            console.log(`Wrote ${parsed.items.length} entries to ${flags.output}`);
          } else {
            console.log(outputText);
          }
        },
      );
  }

  if (options.allowImport) {
    program
      .command('import')
      .description('Import knowledge entries from JSON or skill files')
      .requiredOption('--file <path>', 'Path to JSON file containing entries')
      .requiredOption('--level <n>', 'Requested security level for imported entries', (val) =>
        Number(val),
      )
      .option('--json', 'Output JSON')
      .action(async (flags: { file: string; json?: boolean; level: number }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const fileContent = await resolveTextInput({ file: flags.file }, 'import');
        let entries: Array<{
          scope: string;
          labels: string[];
          shortcut: string;
          detail: string;
          source: 'json' | 'claude-skill';
          requestedLevel: number;
        }>;

        // Try to parse as JSON array first
        try {
          const parsed = JSON.parse(fileContent);
          if (Array.isArray(parsed)) {
            entries = parsed.map((entry) => ({
              scope: entry.scope ?? 'project',
              labels: entry.labels ?? ['imported'],
              shortcut: entry.shortcut,
              detail: entry.detail,
              source: 'json' as const,
              requestedLevel: flags.level,
            }));
          } else if (parsed.items && Array.isArray(parsed.items)) {
            // Export bundle format
            entries = parsed.items.map(
              (entry: { scope: string; labels: string[]; shortcut: string; detail: string }) => ({
                scope: entry.scope ?? 'project',
                labels: entry.labels ?? ['imported'],
                shortcut: entry.shortcut,
                detail: entry.detail,
                source: 'json' as const,
                requestedLevel: flags.level,
              }),
            );
          } else {
            throw new Error('JSON must be an array of entries or an export bundle');
          }
        } catch {
          // Try to parse as SKILL.md format
          const submission = parseClaudeSkill(fileContent);

          if (!submission) {
            throw new Error('File must be a JSON array of entries or a valid SKILL.md format');
          }

          entries = [
            {
              ...submission,
              source: 'claude-skill' as const,
              requestedLevel: flags.level,
            },
          ];
        }

        const response = await apiRequest<ImportResponse>(state, {
          method: 'POST',
          path: '/v1/operations/import',
          body: { entries },
        });
        const parsed = importResponseSchema.parse(response.data);

        printResult(parsed, flags, (value) =>
          [`Imported ${value.importedCount} entries, failed ${value.failedCount}`].join('\n'),
        );
      });
  }
}
