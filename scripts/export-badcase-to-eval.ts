import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '@trapmap/server/config.js';
import { type BadcaseTraceExportRow, serializeBadcaseEvalDraft } from './lib/badcase-eval-draft.js';

export async function main() {
  const feedbackId = process.argv[2];
  const outputPath = process.argv[3];

  if (!feedbackId || !outputPath) {
    throw new Error(
      'Usage: pnpm exec tsx scripts/export-badcase-to-eval.ts <feedbackId> <outputPath>',
    );
  }

  const config = loadConfig();
  if (!config.databaseUrl) {
    throw new Error('TRAPMAP_DATABASE_URL is required');
  }

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    const result = await pool.query(
      `SELECT feedback_id, query_id, query_seed, route_family, entry_id, entry_type,
              failure_classification, expected_correction, selected_result_snapshot
       FROM retrieval_badcase_traces
       WHERE feedback_id = $1
       LIMIT 1`,
      [feedbackId],
    );

    const row = result.rows[0] as BadcaseTraceExportRow | undefined;
    if (!row) {
      throw new Error(`Badcase trace not found for ${feedbackId}`);
    }

    writeFileSync(resolve(outputPath), serializeBadcaseEvalDraft(row), 'utf8');
  } finally {
    await pool.end();
  }
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
