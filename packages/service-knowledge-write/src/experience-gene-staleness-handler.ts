// fallow-ignore-file code-duplication -- row coercion mirrors the established Gene snapshot/planning loaders because these columns are owner-table specific.
import {
  type ExperienceGeneStalenessReason,
  type ExperienceGeneStalenessSignal,
  evaluateExperienceGeneStaleness,
} from '@trapmap/backend-core';
import {
  type ExperienceGene,
  type ExperienceGeneRemediationSignal,
  type ExperienceGeneSourceLifecycleEvent,
  experienceGeneRemediationSignalSchema,
  experienceGeneSourceLifecycleEventSchema,
} from '@trapmap/contracts';
import { sha256CanonicalJson } from '@trapmap/lib';

type Queryable = {
  query<T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type Row = Record<string, unknown>;

export interface ExperienceGeneStaleRepository {
  listActiveBySource(
    source: Pick<ExperienceGene['source'], 'kind' | 'sourceId'>,
  ): Promise<ExperienceGene[]>;
  markStaleForSource(
    source: Pick<ExperienceGene['source'], 'kind' | 'sourceId'>,
    reasonClass: ExperienceGeneStalenessReason,
  ): Promise<number>;
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function labels(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function nullableId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function suppressed(value: unknown): boolean {
  return value === true;
}

function governanceSignal(
  row: Row,
): Pick<ExperienceGeneStalenessSignal, 'labels' | 'scope' | 'teamId' | 'requiredLevel'> {
  const scope: ExperienceGeneStalenessSignal['scope'] =
    row.scope === 'global' ? 'global' : 'project';
  return {
    labels: labels(row.labels),
    scope,
    teamId: nullableId(row.team_id),
    requiredLevel: number(row.required_level),
  };
}

type GeneLifecycleSignal = NonNullable<ExperienceGeneStalenessSignal['lifecycleState']>;

function stalenessLifecycle(value: unknown): GeneLifecycleSignal {
  return value === 'approved' ? 'approved' : 'deprecated';
}

function eventLifecycle(value: unknown): GeneLifecycleSignal {
  return value === 'approved' ? 'approved' : 'deprecated';
}

async function trapSignal(pool: Queryable, entryId: string) {
  const result = await pool.query<Row>(
    `SELECT ke.shortcut, ke.detail, ke.labels, ke.scope, ke.team_id, ke.required_level,
            ke.lifecycle_state, ke.remediation,
            COALESCE(revision.revision_no, 0)::int AS revision_no
     FROM knowledge_entries ke
     LEFT JOIN LATERAL (
       SELECT revision_no FROM knowledge_revisions
       WHERE entry_id = ke.id ORDER BY revision_no DESC LIMIT 1
     ) revision ON true
     WHERE ke.id = $1`,
    [entryId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const remediation = row.remediation;
  return {
    revision: number(row.revision_no),
    sourceHash: sha256CanonicalJson({
      title: string(row.shortcut),
      text: string(row.detail),
      labels: labels(row.labels),
    }),
    lifecycleState: stalenessLifecycle(row.lifecycle_state),
    remediationSuppressed:
      suppressed((remediation as Row | null)?.suppressedFromRetrieval) ||
      suppressed((remediation as Row | null)?.suppressedFromIndex),
    ...governanceSignal(row),
  };
}

const ARTIFACT_SQL = `
  SELECT sa.id AS artifact_id, sa.title, sa.labels, sa.scope, sa.team_id, sa.required_level,
         sa.lifecycle_state, sa.remediation, ar.revision_no, ar.source_hash
  FROM skill_artifacts sa
  LEFT JOIN LATERAL (
    SELECT revision_no, source_hash FROM artifact_revisions
    WHERE artifact_id = sa.id ORDER BY revision_no DESC LIMIT 1
  ) ar ON true
  WHERE sa.id = $1`;

async function artifactTargets(pool: Queryable, artifactId: string) {
  const artifact = (await pool.query<Row>(ARTIFACT_SQL, [artifactId])).rows[0];
  if (!artifact) return [];
  const capsules = await pool.query<Row>(
    `SELECT cap.capsule_id, cap.content, cap.situation, cap.problem, cap.goal,
            cap.error_text, cap.contextual_prefix, cap.source_paths, cap.revision_no,
            sa.title AS artifact_title, sa.labels, sa.scope, sa.team_id, sa.required_level,
            sa.lifecycle_state, sa.remediation
     FROM skill_artifact_capsules cap
     JOIN skill_artifacts sa ON sa.id = cap.artifact_id
     WHERE cap.artifact_id = $1 ORDER BY cap.capsule_id`,
    [artifactId],
  );
  const shared = governanceSignal(artifact);
  const lifecycleState = stalenessLifecycle(artifact.lifecycle_state);
  const remediationSuppressed =
    suppressed((artifact.remediation as Row | null)?.suppressedFromRetrieval) ||
    suppressed((artifact.remediation as Row | null)?.suppressedFromIndex);
  const targets: Array<{
    kind: ExperienceGene['source']['kind'];
    sourceId: string;
    signal: ExperienceGeneStalenessSignal;
  }> = [
    {
      kind: 'skill-artifact',
      sourceId: `${artifactId}:skill-md:v1`,
      signal: {
        revision: number(artifact.revision_no),
        sourceHash: string(artifact.source_hash),
        lifecycleState,
        remediationSuppressed,
        ...shared,
      },
    },
  ];
  for (const capsule of capsules.rows) {
    const revision = number(capsule.revision_no);
    const provenanceHash = sha256CanonicalJson({
      revisionSourceHash: string(artifact.source_hash),
      capsuleId: string(capsule.capsule_id),
      content: string(capsule.content),
      situation: string(capsule.situation),
      problem: string(capsule.problem),
      goal: string(capsule.goal),
      errorText: nullableId(capsule.error_text),
      contextualPrefix: nullableId(capsule.contextual_prefix),
    });
    targets.push({
      kind: 'skill-capsule',
      sourceId: string(capsule.capsule_id),
      signal: {
        revision,
        sourceHash: provenanceHash,
        lifecycleState,
        remediationSuppressed,
        ...governanceSignal({ ...capsule, labels: capsule.labels }),
      },
    });
  }
  return targets;
}

export function createExperienceGeneStaleHandler(params: {
  pool: Queryable;
  repository: ExperienceGeneStaleRepository;
}) {
  const lifecycleTargets = async (event: ExperienceGeneSourceLifecycleEvent) => {
    const targets: Array<{
      kind: ExperienceGene['source']['kind'];
      sourceId: string;
      signal: ExperienceGeneStalenessSignal;
    }> = [];
    if (event.name.startsWith('knowledge.')) {
      if (!event.entryId) throw new Error('knowledge lifecycle event missing entryId');
      const signal = await trapSignal(params.pool, event.entryId);
      if (signal) {
        targets.push({
          kind: 'trap',
          sourceId: event.entryId,
          signal: { ...signal, lifecycleState: eventLifecycle(event.nextState) },
        });
      }
      return targets;
    }
    if (event.artifactId) {
      const artifactTargetsForEvent = await artifactTargets(params.pool, event.artifactId);
      targets.push(
        ...artifactTargetsForEvent.map((target) => ({
          ...target,
          signal: { ...target.signal, lifecycleState: eventLifecycle(event.nextState) },
        })),
      );
    }
    return targets;
  };

  const remediationTarget = async (event: ExperienceGeneRemediationSignal) => {
    const signal = await trapSignal(params.pool, event.entryId);
    if (!signal) return [];
    return [
      {
        kind: 'trap' as const,
        sourceId: event.entryId,
        signal: { ...signal, remediationSuppressed: event.suppressedFromRetrieval },
      },
    ];
  };

  const targetsFor = async (rawEvent: unknown) => {
    const lifecycle = experienceGeneSourceLifecycleEventSchema.safeParse(rawEvent);
    const remediation = experienceGeneRemediationSignalSchema.safeParse(rawEvent);
    if (!lifecycle.success && !remediation.success) {
      throw new Error('unknown experience gene staleness payload');
    }
    if (lifecycle.success) return lifecycleTargets(lifecycle.data);
    if (!remediation.success) throw new Error('unknown experience gene staleness payload');
    return remediationTarget(remediation.data);
  };

  return {
    async handle(rawEvent: unknown): Promise<number> {
      const targets = await targetsFor(rawEvent);
      let marked = 0;
      for (const target of targets) {
        const genes = await params.repository.listActiveBySource({
          kind: target.kind,
          sourceId: target.sourceId,
        });
        const reasons = new Set(
          genes
            .map((gene) => evaluateExperienceGeneStaleness({ gene, signal: target.signal }))
            .filter((result) => result.stale)
            .map((result) => result.reason),
        );
        for (const reason of reasons) {
          marked += await params.repository.markStaleForSource(
            { kind: target.kind, sourceId: target.sourceId },
            reason,
          );
        }
      }
      return marked;
    },
  };
}
