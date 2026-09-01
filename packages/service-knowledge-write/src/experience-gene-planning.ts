import { EXPERIENCE_GENE_RULE_PROMPT_VERSION } from '@trapmap/backend-core';
import {
  type ExperienceGeneDerivationTaskPayload,
  type ExperienceGeneSourceLifecycleEvent,
  type ExperienceGeneSourceSnapshot,
  experienceGeneDerivationTaskPayloadSchema,
  experienceGeneSourceLifecycleEventSchema,
  experienceGeneSourceSnapshotSchema,
} from '@trapmap/contracts';
import { getGoAcceleratorClient } from '@trapmap/infra/go-accelerator/client.js';
import { canonicalHashWithFallback } from '@trapmap/infra/go-accelerator/fallback.js';

type Queryable = {
  query<T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};
type Row = Record<string, unknown>;

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

async function task(
  eventName: ExperienceGeneSourceLifecycleEvent['name'],
  sourceId: string,
  snapshot: ExperienceGeneSourceSnapshot,
) {
  return experienceGeneDerivationTaskPayloadSchema.parse({
    requestId: `${eventName}:${sourceId}:v${snapshot.revision}`,
    source: {
      kind: snapshot.kind,
      sourceId: snapshot.sourceId,
      sourceRevision: snapshot.revision,
      sourceHash: snapshot.sourceHash,
      artifactId: snapshot.kind === 'trap' ? null : snapshot.artifactId,
      capsuleId: snapshot.kind === 'skill-capsule' ? snapshot.capsuleId : null,
      artifactRevision: snapshot.kind === 'trap' ? null : snapshot.artifactRevision,
    },
    derivationUnitId: snapshot.derivationUnitId,
    generatorKind: 'rule',
    promptVersion: EXPERIENCE_GENE_RULE_PROMPT_VERSION,
    snapshotHash: (await canonicalHashWithFallback(snapshot, getGoAcceleratorClient())).hash,
  });
}

async function approvedTrap(pool: Queryable, id: string) {
  const result = await pool.query<Row>(
    `SELECT ke.id, ke.shortcut, ke.detail, ke.labels, ke.scope, ke.team_id,
            ke.required_level, COALESCE(revision.revision_no, 0)::int AS revision_no
     FROM knowledge_entries ke
     LEFT JOIN LATERAL (
       SELECT revision_no FROM knowledge_revisions
       WHERE entry_id = ke.id ORDER BY revision_no DESC LIMIT 1
     ) revision ON true
     WHERE ke.id = $1 AND ke.lifecycle_state = 'approved'
       AND (ke.remediation->>'suppressedFromRetrieval')::boolean IS NOT TRUE
       AND (ke.remediation->>'suppressedFromIndex')::boolean IS NOT TRUE`,
    [id],
  );
  const row = result.rows[0];
  if (!row || number(row.revision_no) < 1) return null;

  const text = string(row.detail);
  const sourceHash = (
    await canonicalHashWithFallback(
      { title: string(row.shortcut), text, labels: labels(row.labels) },
      getGoAcceleratorClient(),
    )
  ).hash;
  return experienceGeneSourceSnapshotSchema.parse({
    kind: 'trap',
    sourceId: String(row.id),
    revision: number(row.revision_no),
    sourceHash,
    derivationUnitId: `trap:${String(row.id)}:v${number(row.revision_no)}`,
    title: string(row.shortcut),
    labels: labels(row.labels),
    scope: string(row.scope),
    teamId: nullableId(row.team_id),
    requiredLevel: number(row.required_level),
    text,
    truncated: false,
  });
}

async function approvedArtifact(
  pool: Queryable,
  id: string,
): Promise<ExperienceGeneSourceSnapshot | null> {
  const result = await pool.query<Row>(
    `SELECT sa.id AS artifact_id, sa.title, sa.labels, sa.scope, sa.team_id,
            sa.required_level, ar.revision_no, ar.source_hash, ar.files
     FROM skill_artifacts sa
     JOIN LATERAL (
       SELECT revision_no, source_hash, files FROM artifact_revisions
        WHERE artifact_id = sa.id ORDER BY revision_no DESC LIMIT 1
     ) ar ON true
     WHERE sa.id = $1 AND sa.lifecycle_state = 'approved'
       AND (sa.remediation->>'suppressedFromRetrieval')::boolean IS NOT TRUE
       AND (sa.remediation->>'suppressedFromIndex')::boolean IS NOT TRUE`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;

  const files = Array.isArray(row.files) ? row.files : [];
  const markdown = files.find(
    (file): file is { content: string } =>
      typeof file === 'object' && file !== null && string(file.path) === 'SKILL.md',
  );
  if (!markdown) return null;

  const derivationUnitId = 'skill-md:v1';
  const revision = number(row.revision_no);
  return experienceGeneSourceSnapshotSchema.parse({
    kind: 'skill-artifact',
    sourceId: `${String(row.artifact_id)}:${derivationUnitId}`,
    revision,
    sourceHash: string(row.source_hash),
    artifactId: String(row.artifact_id),
    artifactRevision: revision,
    derivationUnitId,
    title: string(row.title),
    labels: labels(row.labels),
    scope: string(row.scope),
    teamId: nullableId(row.team_id),
    requiredLevel: number(row.required_level),
    text: string(markdown.content).slice(0, 16_000),
    truncated: string(markdown.content).length > 16_000,
  });
}

async function approvedCapsules(pool: Queryable, artifactId: string) {
  const result = await pool.query<Row>(
    `SELECT cap.*, sa.title AS artifact_title
     FROM skill_artifact_capsules cap
     JOIN skill_artifacts sa ON sa.id = cap.artifact_id
     WHERE cap.artifact_id = $1 AND sa.lifecycle_state = 'approved'
       AND (sa.remediation->>'suppressedFromRetrieval')::boolean IS NOT TRUE
       AND (sa.remediation->>'suppressedFromIndex')::boolean IS NOT TRUE
     ORDER BY cap.capsule_id`,
    [artifactId],
  );

  return Promise.all(
    result.rows.map(async (row) => {
      const provenance = {
        revisionSourceHash: string(row.source_hash),
        capsuleId: String(row.capsule_id),
        content: string(row.content),
        situation: string(row.situation),
        problem: string(row.problem),
        goal: string(row.goal),
        errorText: nullableId(row.error_text),
        contextualPrefix: nullableId(row.contextual_prefix),
      };
      return experienceGeneSourceSnapshotSchema.parse({
        kind: 'skill-capsule',
        sourceId: provenance.capsuleId,
        revision: number(row.revision_no),
        sourceHash: (await canonicalHashWithFallback(provenance, getGoAcceleratorClient())).hash,
        artifactId: String(row.artifact_id),
        artifactRevision: number(row.revision_no),
        capsuleId: provenance.capsuleId,
        derivationUnitId: provenance.capsuleId,
        title: string(row.artifact_title),
        labels: labels(row.labels),
        scope: string(row.scope),
        teamId: nullableId(row.team_id),
        requiredLevel: number(row.required_level),
        text: [provenance.situation, provenance.problem, provenance.goal, provenance.content]
          .filter(Boolean)
          .join('\n'),
        truncated: false,
        situation: provenance.situation,
        problem: provenance.problem,
        goal: provenance.goal,
        errorText: provenance.errorText,
        contextualPrefix: provenance.contextualPrefix,
        sourcePaths: labels(row.source_paths),
      });
    }),
  );
}

export function createExperienceGeneDerivationPlanner(pool: Queryable) {
  return {
    async planFromLifecycle(rawEvent: unknown): Promise<ExperienceGeneDerivationTaskPayload[]> {
      const event: ExperienceGeneSourceLifecycleEvent =
        experienceGeneSourceLifecycleEventSchema.parse(rawEvent);
      if (event.nextState !== 'approved') return [];

      if (event.name.startsWith('knowledge.')) {
        if (!event.entryId) throw new Error('knowledge lifecycle event missing entryId');
        const snapshot = await approvedTrap(pool, event.entryId);
        return snapshot ? [await task(event.name, event.entryId, snapshot)] : [];
      }

      if (!event.artifactId) throw new Error('artifact lifecycle event missing artifactId');
      const artifactSnapshot = await approvedArtifact(pool, event.artifactId);
      const capsuleSnapshots = await approvedCapsules(pool, event.artifactId);
      const snapshots = [...(artifactSnapshot ? [artifactSnapshot] : []), ...capsuleSnapshots];
      return Promise.all(
        snapshots.map((snapshot) => task(event.name, snapshot.sourceId, snapshot)),
      );
    },
  };
}
