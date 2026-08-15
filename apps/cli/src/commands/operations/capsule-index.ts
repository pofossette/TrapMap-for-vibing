import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printResult } from '@trapmap/cli/lib/output.js';
import type { OperationsCommandOptions } from './types.js';

/** Response shape for POST /v1/operations/capsule-index/rebuild (mode=full) */
interface CapsuleIndexRebuildFullResponse {
  mode: 'full';
  sourceArtifactCount: number;
  stats: {
    totalArtifacts: number;
    succeeded: number;
    failed: number;
  };
  rebuiltAt: string;
}

/** Response shape for POST /v1/operations/capsule-index/rebuild (mode=artifact) */
interface CapsuleIndexRebuildArtifactResponse {
  mode: 'artifact';
  artifactId: string;
  result: {
    keywordSynced: number;
    keywordFailed: number;
    embeddingSynced: number;
    embeddingFailed: number;
    capsulesSynced: number;
  };
  rebuiltAt: string;
}

type CapsuleIndexRebuildResponse =
  | CapsuleIndexRebuildFullResponse
  | CapsuleIndexRebuildArtifactResponse;

/** Response shape for GET /v1/operations/capsule-index/health */
interface CapsuleIndexHealthResponse {
  sourceArtifactCount: number;
  report: {
    missingKeywords: string[];
    missingEmbeddings: string[];
    failedKeywords: string[];
    failedEmbeddings: string[];
    orphanKeywords: string[];
    orphanEmbeddings: string[];
  };
  reportedAt: string;
}

/** Response shape for POST /v1/operations/capsule-index/cleanup-orphans */
interface CapsuleIndexCleanupOrphansResponse {
  sourceArtifactCount: number;
  removed: number;
  cleanedAt: string;
}

export function registerCapsuleIndexCommand(
  program: Command,
  options: OperationsCommandOptions,
): void {
  if (!options.allowCapsuleIndex) return;

  const capsuleIndex = program
    .command('capsule-index')
    .description('Manage capsule index (rebuild, health check, cleanup)');

  // ── rebuild ──────────────────────────────────────────────────
  capsuleIndex
    .command('rebuild')
    .description('Rebuild capsule index (full or per-artifact)')
    .option('--mode <mode>', 'Rebuild mode: full or artifact', 'full')
    .option('--artifact-id <id>', 'Artifact ID (required when mode=artifact)')
    .option('--json', 'Output JSON')
    .action(async (flags: { mode?: string; artifactId?: string; json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const mode = flags.mode ?? 'full';
      const body: Record<string, unknown> = { mode };

      if (mode === 'artifact') {
        if (!flags.artifactId) {
          throw new Error('--artifact-id is required when mode=artifact');
        }
        body.artifactId = flags.artifactId;
      }

      const response = await apiRequest<CapsuleIndexRebuildResponse>(state, {
        method: 'POST',
        path: '/v1/operations/capsule-index/rebuild',
        body,
      });

      printResult(response.data, { json: flags.json }, (value) => {
        if (value.mode === 'full') {
          return [
            'Rebuilt capsule index (full):',
            `  Source artifacts: ${value.sourceArtifactCount}`,
            `  Succeeded: ${value.stats.succeeded}`,
            `  Failed: ${value.stats.failed}`,
            `  Rebuilt at: ${value.rebuiltAt}`,
          ].join('\n');
        }

        const r = value.result;
        return [
          `Rebuilt capsule index for artifact ${value.artifactId}:`,
          `  Keyword synced: ${r.keywordSynced}, failed: ${r.keywordFailed}`,
          `  Embedding synced: ${r.embeddingSynced}, failed: ${r.embeddingFailed}`,
          `  Total capsules synced: ${r.capsulesSynced}`,
          `  Rebuilt at: ${value.rebuiltAt}`,
        ].join('\n');
      });
    });

  // ── health ───────────────────────────────────────────────────
  capsuleIndex
    .command('health')
    .description('Show capsule index health report')
    .option('--json', 'Output JSON')
    .action(async (flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const response = await apiRequest<CapsuleIndexHealthResponse>(state, {
        path: '/v1/operations/capsule-index/health',
      });

      printResult(response.data, { json: flags.json }, (value) => {
        const report = value.report;
        const totalIssues =
          report.missingKeywords.length +
          report.missingEmbeddings.length +
          report.failedKeywords.length +
          report.failedEmbeddings.length +
          report.orphanKeywords.length +
          report.orphanEmbeddings.length;

        const lines = [
          'Capsule index health report:',
          `  Source artifacts: ${value.sourceArtifactCount}`,
          `  Missing keywords: ${report.missingKeywords.length}`,
          `  Missing embeddings: ${report.missingEmbeddings.length}`,
          `  Failed keywords: ${report.failedKeywords.length}`,
          `  Failed embeddings: ${report.failedEmbeddings.length}`,
          `  Orphan keywords: ${report.orphanKeywords.length}`,
          `  Orphan embeddings: ${report.orphanEmbeddings.length}`,
        ];

        if (totalIssues === 0) {
          lines.push('  Status: healthy');
        } else {
          lines.push(`  Status: ${totalIssues} issue(s) detected`);
        }

        lines.push(`  Reported at: ${value.reportedAt}`);
        return lines.join('\n');
      });
    });

  // ── cleanup-orphans ──────────────────────────────────────────
  capsuleIndex
    .command('cleanup-orphans')
    .description('Remove orphaned capsule index entries')
    .option('--json', 'Output JSON')
    .action(async (flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const response = await apiRequest<CapsuleIndexCleanupOrphansResponse>(state, {
        method: 'POST',
        path: '/v1/operations/capsule-index/cleanup-orphans',
      });

      printResult(response.data, { json: flags.json }, (value) => {
        return [
          'Cleaned up orphaned capsule index entries:',
          `  Source artifacts: ${value.sourceArtifactCount}`,
          `  Removed: ${value.removed}`,
          `  Cleaned at: ${value.cleanedAt}`,
        ].join('\n');
      });
    });
}
