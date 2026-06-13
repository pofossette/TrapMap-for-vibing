import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadConfig } from '@trapmap/server/config.js';

async function main() {
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

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Badcase trace not found for ${feedbackId}`);
    }

    const draft = {
      kind: 'retrieval',
      caseId: `badcase_${row.feedback_id}`,
      sourceFeedbackId: row.feedback_id,
      queryId: row.query_id,
      routeFamily: row.route_family,
      request: {
        queryId: row.query_id,
        querySeed: row.query_seed,
        routeFamily: row.route_family,
        entryId: row.entry_id,
        entryType: row.entry_type,
      },
      expected: {
        failureClassification: row.failure_classification,
        expectedCorrection: row.expected_correction,
        selectedResultSnapshot: row.selected_result_snapshot,
      },
      notes: [
        'Draft generated from retrieval_badcase_traces.',
        'Review before promoting to eval fixtures.',
      ],
    };

    writeFileSync(resolve(outputPath), `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
