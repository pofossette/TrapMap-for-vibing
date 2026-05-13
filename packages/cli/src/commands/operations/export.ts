import type { ArtifactExportResponse, ExportBundle } from '@trapmap/contracts';
import { artifactExportResponseSchema, exportBundleSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../../lib/config.js';
import { apiRequest, requireSessionToken } from '../../lib/http.js';
import {
  formatExportHuman,
  formatExportJson,
  materializeSkillDirectory,
  validateOutputPath,
} from '../../lib/skill-artifact-export.js';
import type { OperationsCommandOptions } from './types.js';

export function registerExportCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowExport) return;

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

  // Artifact export command (Phase 13: IMEX-02, COMP-01, COMP-02)
  program
    .command('artifact-export')
    .description('Export a skill artifact by ID')
    .requiredOption('--artifact <artifactId>', 'Artifact ID to export')
    .option(
      '--format <format>',
      'Export format: bundle-json, distilled-json, or skill-dir',
      'bundle-json',
    )
    .option('--output <path>', 'Output directory (required for skill-dir format)')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        artifact: string;
        format: 'bundle-json' | 'distilled-json' | 'skill-dir';
        json?: boolean;
        output?: string;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const { artifact: artifactId, format, output } = flags;

        // For skill-dir format, output directory is required
        if (format === 'skill-dir' && !output) {
          throw new Error('--output <path> is required for skill-dir format');
        }

        // Request export from server
        // Note: skill-dir is normalized to bundle-json on server, CLI materializes locally
        const serverFormat = format === 'skill-dir' ? 'bundle-json' : format;

        const response = await apiRequest<ArtifactExportResponse>(state, {
          method: 'POST',
          path: '/v1/operations/artifacts/export',
          body: {
            artifactId,
            format: serverFormat,
          },
        });
        const parsed = artifactExportResponseSchema.parse(response.data);

        if (format === 'skill-dir' && parsed.bundle && output) {
          // Validate output path for safety (T-13-11)
          const validatedOutput = validateOutputPath(output, process.cwd());

          // Materialize skill directory locally
          const { filesWritten, bytesWritten } = await materializeSkillDirectory({
            bundle: parsed.bundle,
            outputDir: validatedOutput,
          });

          console.log(`Wrote ${filesWritten} files (${bytesWritten} bytes) to ${validatedOutput}`);
        } else if (output) {
          // Write JSON output to file
          const { writeFile } = await import('node:fs/promises');
          const jsonContent = formatExportJson(parsed);
          await writeFile(output, jsonContent, 'utf8');
          console.log(`Wrote export to ${output}`);
        } else {
          // Output to stdout
          if (flags.json) {
            console.log(formatExportJson(parsed));
          } else {
            console.log(formatExportHuman(parsed));
          }
        }
      },
    );
}
