export type MigrationTableFamily =
  | 'identity'
  | 'knowledge'
  | 'candidate'
  | 'governance'
  | 'job-runtime'
  | 'knowledge-read-projection'
  | 'audit'
  | 'compatibility';

export type MigrationRunner =
  | 'server-compatibility-seam'
  | 'identity-access'
  | 'knowledge-write'
  | 'candidate-ingestion'
  | 'governance-review'
  | 'job-runtime'
  | 'knowledge-read';

export interface MigrationOwnershipManifestEntry {
  migration: string;
  tableFamilies: readonly MigrationTableFamily[];
  logicalOwner: MigrationRunner | 'historical-cross-domain';
  allowedRunners: readonly MigrationRunner[];
}

const compatibilitySeam: readonly MigrationRunner[] = ['server-compatibility-seam'];

export const migrationOwnershipManifest: readonly MigrationOwnershipManifestEntry[] = [
  {
    migration: '0000_bent_nightmare.sql',
    tableFamilies: ['knowledge', 'knowledge-read-projection', 'candidate', 'compatibility'],
    logicalOwner: 'historical-cross-domain',
    allowedRunners: compatibilitySeam,
  },
  {
    migration: '0001_cloudy_magma.sql',
    tableFamilies: ['job-runtime', 'candidate'],
    logicalOwner: 'historical-cross-domain',
    allowedRunners: compatibilitySeam,
  },
  {
    migration: '0002_round3_knowledge_structural.sql',
    tableFamilies: ['knowledge'],
    logicalOwner: 'knowledge-write',
    allowedRunners: ['server-compatibility-seam', 'knowledge-write'],
  },
  {
    migration: '0003_round5_candidate_structural.sql',
    tableFamilies: ['candidate'],
    logicalOwner: 'candidate-ingestion',
    allowedRunners: ['server-compatibility-seam', 'candidate-ingestion'],
  },
  {
    migration: '0004_round6_feedback_usage.sql',
    tableFamilies: ['governance', 'compatibility'],
    logicalOwner: 'historical-cross-domain',
    allowedRunners: compatibilitySeam,
  },
  {
    migration: '0005_round7_retrieval_index_structural.sql',
    tableFamilies: ['knowledge-read-projection'],
    logicalOwner: 'knowledge-read',
    allowedRunners: ['server-compatibility-seam', 'knowledge-read'],
  },
  {
    migration: '0006_round8_naming_constraints.sql',
    tableFamilies: ['knowledge', 'knowledge-read-projection', 'candidate'],
    logicalOwner: 'historical-cross-domain',
    allowedRunners: compatibilitySeam,
  },
  {
    migration: '0007_round4_artifact_structural.sql',
    tableFamilies: ['knowledge'],
    logicalOwner: 'knowledge-write',
    allowedRunners: ['server-compatibility-seam', 'knowledge-write'],
  },
  {
    migration: '0008_round9_cross_table_consistency.sql',
    tableFamilies: ['knowledge'],
    logicalOwner: 'knowledge-write',
    allowedRunners: ['server-compatibility-seam', 'knowledge-write'],
  },
  {
    migration: '0009_round10_task_queue_write_path.sql',
    tableFamilies: ['job-runtime'],
    logicalOwner: 'job-runtime',
    allowedRunners: ['server-compatibility-seam', 'job-runtime'],
  },
  {
    migration: '0010_round10_lifecycle_outbox.sql',
    tableFamilies: ['job-runtime'],
    logicalOwner: 'job-runtime',
    allowedRunners: ['server-compatibility-seam', 'job-runtime'],
  },
  {
    migration: '0011_round10_identity_audit_structural.sql',
    tableFamilies: ['identity', 'audit'],
    logicalOwner: 'historical-cross-domain',
    allowedRunners: compatibilitySeam,
  },
  {
    migration: '0012_round10_read_model_cleanup.sql',
    tableFamilies: ['candidate'],
    logicalOwner: 'candidate-ingestion',
    allowedRunners: ['server-compatibility-seam', 'candidate-ingestion'],
  },
  {
    migration: '0013_round10_candidate_analysis_trace.sql',
    tableFamilies: ['candidate'],
    logicalOwner: 'candidate-ingestion',
    allowedRunners: ['server-compatibility-seam', 'candidate-ingestion'],
  },
  {
    migration: '0014_round11_dive_log_columns.sql',
    tableFamilies: ['knowledge'],
    logicalOwner: 'knowledge-write',
    allowedRunners: ['server-compatibility-seam', 'knowledge-write'],
  },
  {
    migration: '0015_phase0_atomic_delivery_and_leases.sql',
    tableFamilies: ['job-runtime'],
    logicalOwner: 'job-runtime',
    allowedRunners: ['server-compatibility-seam', 'job-runtime'],
  },
  {
    migration: '0016_phase1_async_operator_semantics.sql',
    tableFamilies: ['job-runtime'],
    logicalOwner: 'job-runtime',
    allowedRunners: ['server-compatibility-seam', 'job-runtime'],
  },
  {
    migration: '0017_phase3_workflow_runs.sql',
    tableFamilies: ['job-runtime'],
    logicalOwner: 'job-runtime',
    allowedRunners: ['server-compatibility-seam', 'job-runtime'],
  },
  {
    migration: '0018_phase4_query_traceability_and_badcase_capture.sql',
    tableFamilies: ['governance', 'knowledge-read-projection'],
    logicalOwner: 'historical-cross-domain',
    allowedRunners: compatibilitySeam,
  },
  {
    migration: '0019_phase5_shared_jobs_feedback_remediation.sql',
    tableFamilies: ['governance', 'job-runtime'],
    logicalOwner: 'historical-cross-domain',
    allowedRunners: compatibilitySeam,
  },
  {
    migration: '0020_observability_audit_correlation.sql',
    tableFamilies: ['audit'],
    logicalOwner: 'server-compatibility-seam',
    allowedRunners: ['server-compatibility-seam'],
  },
];

export class MigrationOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationOwnershipError';
  }
}

export function assertMigrationManifestComplete(migrations: readonly string[]): void {
  const manifestMigrations = new Set(migrationOwnershipManifest.map((entry) => entry.migration));
  const missing = migrations.filter((migration) => !manifestMigrations.has(migration));
  if (missing.length > 0) {
    throw new MigrationOwnershipError(
      `Migration owner metadata missing for: ${missing.join(', ')}`,
    );
  }

  const discoveredMigrations = new Set(migrations);
  const stale = migrationOwnershipManifest
    .map((entry) => entry.migration)
    .filter((migration) => !discoveredMigrations.has(migration));
  if (stale.length > 0) {
    throw new MigrationOwnershipError(
      `Migration manifest references migrations missing from the directory: ${stale.join(', ')}`,
    );
  }
}

export function assertMigrationRunnerAuthorized(
  runner: MigrationRunner,
  migrations: readonly MigrationOwnershipManifestEntry[],
): void {
  const denied = migrations.filter((migration) => !migration.allowedRunners.includes(runner));
  if (denied.length > 0) {
    throw new MigrationOwnershipError(
      `Migration runner '${runner}' is not authorized for: ${denied.map((entry) => entry.migration).join(', ')}`,
    );
  }
}
