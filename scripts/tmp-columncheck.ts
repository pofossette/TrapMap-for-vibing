import pg from 'pg';
async function main() {
  const pool = new pg.Pool({ connectionString: process.env.TRAPMAP_DATABASE_URL });
  const pairs: Array<[string, string]> = [
    ['skill_artifacts', 'latest_revision'],
    ['skill_artifacts', 'remediation'],
    ['skill_artifacts', 'revision_no'],
    ['skill_artifacts', 'derived'],
    ['skill_artifacts', 'files'],
    ['skill_artifacts', 'source_hash'],
    ['artifact_revisions', 'version'],
    ['artifact_revisions', 'files'],
    ['artifact_revisions', 'derived'],
    ['skill_artifact_capsules', 'lifecycle_state'],
    ['skill_artifact_capsules', 'remediation'],
    ['skill_artifact_capsules', 'team_id'],
    ['skill_artifact_capsules', 'slug'],
    ['skill_artifact_capsules', 'title'],
    ['sessions', 'handle'],
    ['candidates', 'analysis'],
    ['candidate_duplicate_cases', 'matches'],
    ['knowledge_search_documents', 'tokens'],
  ];
  for (const [t, c] of pairs) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
      [t, c],
    );
    console.log((r.rows[0]!.n > 0 ? 'OK  ' : 'MISS') + '  ' + t + '.' + c);
  }
  await pool.end();
}
main();
