import type {
  ActivationResponse,
  ArtifactBundle,
  ArtifactExportResponse,
  ArtifactImportResponse,
  CompatibilityStatusResponse,
  ExportBundle,
  ImportResponse,
  KnowledgeDeactivateResponse,
  KnowledgeEntryResponse,
  KnowledgeListResponse,
  LegacyMigrationResponse,
} from '@trapmap/contracts';
import {
  activationResponseSchema,
  artifactExportResponseSchema,
  artifactImportResponseSchema,
  compatibilityStatusResponseSchema,
  exportBundleSchema,
  importResponseSchema,
  knowledgeDeactivateResponseSchema,
  knowledgeEntryResponseSchema,
  knowledgeListResponseSchema,
  legacyMigrationResponseSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';

import {
  buildArtifactBundle,
  buildSingleSkillMdBundle,
  formatListResponse,
  isSkillMdFile,
  parseClaudeSkill,
} from '../lib/artifact-bundle.js';
import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { resolveTextInput } from '../lib/input.js';
import { printResult } from '../lib/output.js';
import {
  formatExportHuman,
  formatExportJson,
  materializeSkillDirectory,
  validateOutputPath,
} from '../lib/skill-artifact-export.js';

interface OperationsCommandOptions {
  allowExport: boolean;
  allowEdit: boolean;
  allowDeactivate: boolean;
  allowImport: boolean;
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

            console.log(
              `Wrote ${filesWritten} files (${bytesWritten} bytes) to ${validatedOutput}`,
            );
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

  if (options.allowImport) {
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

  if (options.allowExport) {
    // Activation command (Phase 15-03: ACTV-01, T-15-08, T-15-09)
    program
      .command('activate')
      .description('Selectively fetch and materialize artifact files (references, assets, scripts)')
      .requiredOption('--artifact <artifactId>', 'Artifact ID to activate')
      .requiredOption('--paths <paths>', 'Comma-separated list of file paths to fetch')
      .option('--revision <n>', 'Specific revision number (defaults to latest)', (val) =>
        Number(val),
      )
      .option('--output <path>', 'Output directory for materialized files')
      .option('--json', 'Output JSON')
      .action(
        async (flags: {
          artifact: string;
          paths: string;
          revision?: number;
          json?: boolean;
          output?: string;
        }) => {
          const state = await loadCliState();
          requireSessionToken(state);

          // Parse selected paths
          const selectedPaths = flags.paths.split(',').map((p) => p.trim());

          // Call activation endpoint
          const response = await apiRequest<ActivationResponse>(state, {
            method: 'POST',
            path: '/v1/operations/artifacts/activate',
            body: {
              artifactId: flags.artifact,
              revision: flags.revision,
              selectedPaths,
            },
          });
          const parsed = activationResponseSchema.parse(response.data);

          // Handle script policy warnings (T-15-09 mitigation)
          if (parsed.scriptDescriptors.length > 0 && flags.output) {
            for (const descriptor of parsed.scriptDescriptors) {
              // Check effective policy - warn if blocked
              const policy = descriptor.defaultPolicy;
              if (policy === 'blocked') {
                console.warn(`⚠️  Script "${descriptor.path}" is blocked and cannot be executed`);
                console.warn(`   Capability: ${descriptor.capability}`);
              } else if (policy === 'manual') {
                console.warn(
                  `⚠️  Script "${descriptor.path}" requires manual approval before execution`,
                );
                console.warn(`   Capability: ${descriptor.capability}`);
              }
              // 'auto' policy scripts can execute without additional approval
            }
          }

          // Materialize files locally if output directory is specified
          if (flags.output && parsed.files.length > 0) {
            // Validate output path for safety (T-15-08 mitigation)
            // Ensure the path doesn't escape through traversal
            const validatedOutput = validateOutputPath(flags.output, process.cwd());

            // Build a minimal bundle for materialization
            const bundle: ArtifactBundle = {
              scope: 'project', // Not used for materialization
              labels: [],
              title: parsed.title,
              slug: 'activation',
              requiredLevel: parsed.requiredLevel,
              sourceKind: 'skill-directory',
              files: parsed.files.map((f) => ({
                path: f.path,
                kind: f.kind,
                sha256: f.sha256,
                sizeBytes: f.sizeBytes,
                mediaType: f.mediaType,
                source: f.source,
                includeInDerivation: false, // Not used for activation
                activationOnly: true,
                content: f.content,
              })),
              scriptDescriptors: parsed.scriptDescriptors.map((sd) => ({
                path: sd.path,
                sha256: sd.sha256,
                capability: sd.capability,
                argsSchemaSummary: sd.argsSchemaSummary,
                sideEffectSummary: sd.sideEffectSummary,
                defaultPolicy: sd.defaultPolicy,
              })),
            };

            // Materialize using safe path validation (T-15-08 mitigation)
            const { filesWritten, bytesWritten } = await materializeSkillDirectory({
              bundle,
              outputDir: validatedOutput,
            });

            console.log(
              `Activated ${parsed.artifactId}: ${filesWritten} files (${bytesWritten} bytes) to ${validatedOutput}`,
            );

            // If --json flag is set, also output the full response
            if (flags.json) {
              console.log(JSON.stringify(parsed, null, 2));
            }
          } else if (flags.json) {
            // Output JSON to stdout
            console.log(JSON.stringify(parsed, null, 2));
          } else {
            // Human-readable output
            console.log(`Activated artifact: ${parsed.title}`);
            console.log(`Artifact ID: ${parsed.artifactId}`);
            console.log(`Revision: ${parsed.revision}`);
            console.log(`Files fetched: ${parsed.files.length}`);
            if (parsed.scriptDescriptors.length > 0) {
              console.log(`Scripts: ${parsed.scriptDescriptors.length}`);
              for (const descriptor of parsed.scriptDescriptors) {
                console.log(`  - ${descriptor.path}: ${descriptor.capability}`);
                console.log(`    Policy: ${descriptor.defaultPolicy}`);
              }
            }
            console.log(`Activated at: ${parsed.activatedAt}`);
          }
        },
      );
  }

  // Migration command (Phase 16-01: ARTF-04, COMP-03)
  if (options.allowImport) {
    program
      .command('migrate')
      .description('Migrate legacy knowledge entries to minimal skill artifacts')
      .option('--entries <ids>', 'Comma-separated entry IDs to migrate (explicit mode)')
      .option('--all-approved', 'Migrate all approved entries (bounded by --limit)')
      .option('--all-team <teamId>', 'Migrate all entries for a specific team')
      .option('--limit <n>', 'Maximum entries to migrate (default 50)', (val) => Number(val))
      .option('--json', 'Output JSON')
      .action(
        async (flags: {
          entries?: string;
          allApproved?: boolean;
          allTeam?: string;
          limit?: number;
          json?: boolean;
        }) => {
          const state = await loadCliState();
          requireSessionToken(state);

          // Determine migration mode
          let mode: 'explicit' | 'all-approved' | 'all-team';
          let entryIds: string[] | undefined;
          let teamId: string | undefined;

          if (flags.entries) {
            mode = 'explicit';
            entryIds = flags.entries.split(',').map((id) => id.trim());
          } else if (flags.allApproved) {
            mode = 'all-approved';
          } else if (flags.allTeam) {
            mode = 'all-team';
            teamId = flags.allTeam;
          } else {
            throw new Error('Must specify --entries, --all-approved, or --all-team');
          }

          const body: {
            mode: typeof mode;
            entryIds?: string[];
            teamId?: string;
            limit?: number;
          } = { mode };

          if (entryIds) {
            body.entryIds = entryIds;
          }
          if (teamId) {
            body.teamId = teamId;
          }
          if (flags.limit) {
            body.limit = flags.limit;
          }

          const response = await apiRequest<LegacyMigrationResponse>(state, {
            method: 'POST',
            path: '/v1/operations/migrate',
            body,
          });
          const parsed = legacyMigrationResponseSchema.parse(response.data);

          printResult(parsed, flags, (value) =>
            [
              `Migrated ${value.migratedCount} entries, skipped ${value.skippedCount}, failed ${value.failedCount}`,
              `Remaining legacy entries: ${value.remainingLegacyCount}`,
              ...value.results.map(
                (r) =>
                  `  ${r.success ? '✓' : '✗'} ${r.entryId}: ${r.success ? r.artifactId : (r.skipReason ?? r.error ?? 'Unknown error')}`,
              ),
            ].join('\n'),
          );
        },
      );
  }

  // Compatibility status command (Phase 16-01: COMP-03)
  if (options.allowExport) {
    program
      .command('status')
      .description('Show migration and compatibility status')
      .option('--team <teamId>', 'Filter status by team ID')
      .option('--json', 'Output JSON')
      .action(async (flags: { team?: string; json?: boolean }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const queryParams = new URLSearchParams();
        if (flags.team) {
          queryParams.set('teamId', flags.team);
        }

        const path =
          queryParams.size > 0 ? `/v1/operations/status?${queryParams}` : '/v1/operations/status';

        const response = await apiRequest<CompatibilityStatusResponse>(state, { path });
        const parsed = compatibilityStatusResponseSchema.parse(response.data);

        printResult(parsed, flags, (value) =>
          [
            `Legacy entries: ${value.totalLegacyEntries}`,
            `Migrated: ${value.migratedEntriesCount}`,
            `Unmigrated: ${value.unmigratedEntriesCount}`,
            `Total artifacts: ${value.totalArtifacts}`,
            `  - skill-directory: ${value.artifactsBySourceKind['skill-directory']}`,
            `  - single-skill-md: ${value.artifactsBySourceKind['single-skill-md']}`,
            `  - legacy-knowledge: ${value.artifactsBySourceKind['legacy-knowledge']}`,
            `Coexistence active: ${value.coexistenceActive}`,
            `Sunset ready: ${value.sunsetReady}`,
            ...(value.sunsetBlockers.length > 0
              ? ['Blockers:', ...value.sunsetBlockers.map((b) => `  - ${b}`)]
              : []),
          ].join('\n'),
        );
      });
  }
}
