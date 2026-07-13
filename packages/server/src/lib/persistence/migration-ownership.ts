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

function assertMigrationManifestEntry(entry: MigrationOwnershipManifestEntry): void {
  if (entry.tableFamilies.length === 0) {
    throw new MigrationOwnershipError(
      `Migration '${entry.migration}' must declare at least one table family`,
    );
  }
  if (entry.allowedRunners.length === 0) {
    throw new MigrationOwnershipError(
      `Migration '${entry.migration}' must declare at least one allowed runner`,
    );
  }
  if (
    entry.logicalOwner !== 'historical-cross-domain' &&
    !entry.allowedRunners.includes(entry.logicalOwner)
  ) {
    throw new MigrationOwnershipError(
      `Migration '${entry.migration}' must authorize its logical owner '${entry.logicalOwner}'`,
    );
  }
  if (
    entry.logicalOwner === 'historical-cross-domain' &&
    entry.allowedRunners.some((runner) => runner !== 'server-compatibility-seam')
  ) {
    throw new MigrationOwnershipError(
      `Historical cross-domain migration '${entry.migration}' is restricted to server-compatibility-seam`,
    );
  }
}

export function assertMigrationManifestComplete(
  migrations: readonly string[],
  manifest: readonly MigrationOwnershipManifestEntry[] = migrationOwnershipManifest,
): void {
  const manifestMigrations = new Set(manifest.map((entry) => entry.migration));
  if (manifestMigrations.size !== manifest.length) {
    throw new MigrationOwnershipError('Migration manifest contains duplicate migration entries');
  }
  manifest.forEach(assertMigrationManifestEntry);

  const missing = migrations.filter((migration) => !manifestMigrations.has(migration));
  if (missing.length > 0) {
    throw new MigrationOwnershipError(
      `Migration owner metadata missing for: ${missing.join(', ')}`,
    );
  }

  const discoveredMigrations = new Set(migrations);
  const stale = manifest
    .map((entry) => entry.migration)
    .filter((migration) => !discoveredMigrations.has(migration));
  if (stale.length > 0) {
    throw new MigrationOwnershipError(
      `Migration manifest references migrations missing from the directory: ${stale.join(', ')}`,
    );
  }
}

export function assertDrizzleJournalComplete(
  migrations: readonly string[],
  journalTags: readonly string[],
): void {
  const migrationTags = new Set(migrations.map((migration) => migration.replace(/\.sql$/, '')));
  const journalTagSet = new Set(journalTags);

  const missing = [...migrationTags].filter((tag) => !journalTagSet.has(tag));
  if (missing.length > 0) {
    throw new MigrationOwnershipError(
      `Drizzle journal tags missing for SQL migrations: ${missing.join(', ')}`,
    );
  }

  const stale = [...journalTagSet].filter((tag) => !migrationTags.has(tag));
  if (stale.length > 0) {
    throw new MigrationOwnershipError(
      `Drizzle journal tags reference SQL migrations missing from the directory: ${stale.join(', ')}`,
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

export function assertMigrationRequestAuthorized(
  runner: MigrationRunner,
  requestedMigrationNames: readonly string[],
  manifest: readonly MigrationOwnershipManifestEntry[] = migrationOwnershipManifest,
): void {
  const requested = requestedMigrationNames.map((migration) => {
    const entry = manifest.find((candidate) => candidate.migration === migration);
    if (!entry) {
      throw new MigrationOwnershipError(`Migration '${migration}' is not declared in the manifest`);
    }
    return entry;
  });

  assertMigrationRunnerAuthorized(runner, requested);
  const foreignOwner = requested.find(
    (entry) =>
      runner !== 'server-compatibility-seam' &&
      (entry.logicalOwner === 'historical-cross-domain' || entry.logicalOwner !== runner),
  );
  if (foreignOwner) {
    throw new MigrationOwnershipError(
      `Migration runner '${runner}' cannot request migration '${foreignOwner.migration}' owned by '${foreignOwner.logicalOwner}'`,
    );
  }
}
