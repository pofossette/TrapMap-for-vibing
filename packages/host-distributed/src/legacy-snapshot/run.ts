import type { Pool } from 'pg';

import type { LegacySnapshotBackfillResult } from './coordinator.js';
import { runLegacySnapshotBackfill } from './coordinator.js';
import { createLegacySnapshotBackfillOwners } from './owners.js';

export function resolveDatabaseUrl(env: Record<string, string | undefined>): string {
  const url = env.TRAPMAP_DATABASE_URL ?? env.DATABASE_URL;
  if (!url) {
    throw new Error('legacy snapshot backfill requires TRAPMAP_DATABASE_URL or DATABASE_URL');
  }
  return url;
}

export function buildBackfillReport(result: LegacySnapshotBackfillResult): string {
  const lines: string[] = [];
  lines.push(`legacy snapshot backfill — succeeded: ${result.succeeded}`);
  lines.push('');
  lines.push('source counts:');
  const ia = result.sourceCounts.identityAudit;
  lines.push(
    `  identity/audit: users=${ia.users} teams=${ia.teams} memberships=${ia.memberships} accessKeys=${ia.accessKeys} sessions=${ia.sessions} auditEvents=${ia.auditEvents}`,
  );
  lines.push(`  knowledgeEntries: ${result.sourceCounts.knowledgeEntries}`);
  lines.push(`  skillArtifacts: ${result.sourceCounts.skillArtifacts}`);
  lines.push(`  artifactFilePayloads: ${result.sourceCounts.artifactFilePayloads}`);
  const ci = result.sourceCounts.candidateIngestion;
  lines.push(
    `  candidateIngestion: submissions=${ci.candidateSubmissions} duplicateCases=${ci.duplicateCases} entityLineage=${ci.entityLineage}`,
  );
  const gov = result.sourceCounts.governance;
  lines.push(`  governance: feedbackQueue=${gov.feedbackQueue} conflicts=${gov.conflicts}`);
  lines.push('');
  lines.push('bucket evidence:');
  for (const item of result.evidence) {
    lines.push(
      `  ${item.owner} / ${item.bucket}: source=${item.sourceCount} inserted=${item.inserted} skipped=${item.skipped} destination=${item.destinationCount} verified=${item.verified}`,
    );
  }
  return lines.join('\n');
}

export async function runBackfillFromDatabase(pool: Pool): Promise<LegacySnapshotBackfillResult> {
  return runLegacySnapshotBackfill({
    source: pool,
    owners: createLegacySnapshotBackfillOwners(pool),
  });
}
