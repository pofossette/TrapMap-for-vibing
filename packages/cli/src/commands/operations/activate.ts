import type { ActivationResponse, ArtifactBundle } from '@trapmap/contracts';
import { activationResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../../lib/config.js';
import { apiRequest, requireSessionToken } from '../../lib/http.js';
import { printResult } from '../../lib/output.js';
import { materializeSkillDirectory, validateOutputPath } from '../../lib/skill-artifact-export.js';
import type { OperationsCommandOptions } from './types.js';

export function registerActivateCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowExport) return;

  // Activation command (Phase 15-03: ACTV-01, T-15-08, T-15-09)
  program
    .command('activate')
    .description('Selectively fetch and materialize artifact files (references, assets, scripts)')
    .requiredOption('--artifact <artifactId>', 'Artifact ID to activate')
    .requiredOption('--paths <paths>', 'Comma-separated list of file paths to fetch')
    .option('--revision <n>', 'Specific revision number (defaults to latest)', (val) => Number(val))
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
