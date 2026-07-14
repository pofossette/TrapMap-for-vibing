import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '@trapmap/server/config.js';
import { type BadcaseTraceExportRow, serializeBadcaseEvalDraft } from './lib/badcase-eval-draft.js';
import { reportEntrypointFailure } from './testing/entrypoint.js';

export async function main() {
  const { feedbackId, outputPath } = parseArguments();
  const databaseUrl = requireDatabaseUrl();

  const row = await readBadcaseTrace(databaseUrl, feedbackId);
  if (!row) {
    throw new Error(`Badcase trace not found for ${feedbackId}`);
  }

  writeFileSync(resolve(outputPath), serializeBadcaseEvalDraft(row), 'utf8');
}

function parseArguments(): { feedbackId: string; outputPath: string } {
  const [feedbackId, outputPath] = process.argv.slice(2);
  if (!feedbackId || !outputPath) {
    throw new Error(
      'Usage: pnpm exec tsx scripts/export-badcase-to-eval.ts <feedbackId> <outputPath>',
    );
  }
  return { feedbackId, outputPath };
}

function requireDatabaseUrl(): string {
  const databaseUrl = loadConfig().databaseUrl;
  if (!databaseUrl) throw new Error('TRAPMAP_DATABASE_URL is required');
  return databaseUrl;
}

async function readBadcaseTrace(
  databaseUrl: string,
  feedbackId: string,
): Promise<BadcaseTraceExportRow | undefined> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query(
      `SELECT feedback_id, query_id, query_seed, route_family, entry_id, entry_type,
              failure_classification, expected_correction, selected_result_snapshot
       FROM retrieval_badcase_traces
       WHERE feedback_id = $1
       LIMIT 1`,
      [feedbackId],
    );
    return result.rows[0] as BadcaseTraceExportRow | undefined;
  } finally {
    await pool.end();
  }
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch(reportEntrypointFailure);
}
