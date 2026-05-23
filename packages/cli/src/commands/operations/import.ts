import type { ArtifactImportResponse, ImportResponse } from '@trapmap/contracts';
import { artifactImportResponseSchema, importResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import {
  buildArtifactBundle,
  buildSingleSkillMdBundle,
  isSkillMdFile,
  parseClaudeSkill,
} from '@trapmap/cli/lib/artifact-bundle.js';
import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { resolveTextInput } from '@trapmap/cli/lib/input.js';
import { printResult } from '@trapmap/cli/lib/output.js';
import type { OperationsCommandOptions } from './types.js';

export function registerImportCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowImport) return;

  program
    .command('import')
    .description('Import knowledge entries or skill artifacts from files/directories')
    .requiredOption('--file <path>', 'Path to JSON file, SKILL.md file, or skill directory')
    .requiredOption('--level <n>', 'Requested security level for imported entries', (val) =>
      Number(val),
    )
    .option('--json', 'Output JSON')
    .action(async (flags: { file: string; json?: boolean; level: number }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const filePath = flags.file;
      const stat = await import('node:fs/promises').then((fs) =>
        fs.stat(filePath).catch(() => null),
      );

      // Detect if path is a directory
      const isDirectory = stat?.isDirectory() ?? false;

      if (isDirectory) {
        // Directory import: build canonical artifact bundle
        const bundle = await buildArtifactBundle({
          rootPath: filePath,
          requestedLevel: flags.level,
          sourceKind: 'skill-directory',
        });

        const response = await apiRequest<ArtifactImportResponse>(state, {
          method: 'POST',
          path: '/v1/operations/artifacts/import',
          body: { bundles: [bundle] },
        });
        const parsed = artifactImportResponseSchema.parse(response.data);

        printResult(parsed, flags, (value) =>
          [
            `Imported ${value.importedCount} artifacts, failed ${value.failedCount}`,
            ...value.results.map(
              (r) => `  ${r.success ? '✓' : '✗'} ${r.title ?? 'Unknown'}: ${r.error ?? 'OK'}`,
            ),
          ].join('\n'),
        );
      } else {
        // File import: check for single SKILL.md or legacy knowledge entry
        const isSkillMd = isSkillMdFile(filePath);

        if (isSkillMd) {
          // Single SKILL.md: build minimal artifact bundle (IMEX-03)
          const bundle = await buildSingleSkillMdBundle({
            filePath,
            requestedLevel: flags.level,
          });

          const response = await apiRequest<ArtifactImportResponse>(state, {
            method: 'POST',
            path: '/v1/operations/artifacts/import',
            body: { bundles: [bundle] },
          });
          const parsed = artifactImportResponseSchema.parse(response.data);

          printResult(parsed, flags, (value) =>
            [
              `Imported ${value.importedCount} artifacts, failed ${value.failedCount}`,
              ...value.results.map(
                (r) => `  ${r.success ? '✓' : '✗'} ${r.title ?? 'Unknown'}: ${r.error ?? 'OK'}`,
              ),
            ].join('\n'),
          );
        } else {
          // Legacy knowledge entry import (JSON or non-SKILL.md files)
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
                (entry: {
                  scope: string;
                  labels: string[];
                  shortcut: string;
                  detail: string;
                }) => ({
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
        }
      }
    });
}
