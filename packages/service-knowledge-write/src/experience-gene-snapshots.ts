import type { Pool } from 'pg';

import {
  type ExperienceGeneSourceSnapshot,
  experienceGeneSourceSnapshotSchema,
} from '@trapmap/contracts';
import { sha256CanonicalJson } from '@trapmap/lib';

type Queryable = Pick<Pool, 'query'>;
type Row = Record<string, unknown>;

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function labels(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function eligible(row: Row | undefined): row is Row {
  return row !== undefined && row.remediation !== true && row.remediation !== 'true';
}

async function loadTrap(
  pool: Queryable,
  request: {
    sourceId: string;
  },
): Promise<ExperienceGeneSourceSnapshot | null> {
  const result = await pool.query<Row>(
    `SELECT ke.*, COALESCE(revision.revision_no, 0)::int AS revision_no
     FROM knowledge_entries ke
     LEFT JOIN LATERAL (
       SELECT revision_no FROM knowledge_revisions
       WHERE entry_id = ke.id ORDER BY revision_no DESC LIMIT 1
     ) revision ON true
     WHERE ke.id = $1 AND ke.lifecycle_state = 'approved'
       AND (ke.remediation->>'suppressedFromRetrieval')::boolean IS NOT TRUE
       AND (ke.remediation->>'suppressedFromIndex')::boolean IS NOT TRUE`,
    [request.sourceId],
  );
  const row = result.rows[0];
  if (!eligible(row)) return null;

  const title = string(row.shortcut);
  const text = string(row.detail);
  const snapshotLabels = labels(row.labels);
  return experienceGeneSourceSnapshotSchema.parse({
    kind: 'trap',
    sourceId: String(row.id),
    revision: number(row.revision_no),
    sourceHash: sha256CanonicalJson({ title, text, labels: snapshotLabels }),
    derivationUnitId: `trap:${String(row.id)}:v${number(row.revision_no)}`,
    title,
    labels: snapshotLabels,
    scope: string(row.scope),
    teamId: typeof row.team_id === 'string' ? row.team_id : null,
    requiredLevel: number(row.required_level),
    text,
    truncated: false,
  });
}

async function loadSkillArtifact(
  pool: Queryable,
  request: { artifactId: string; revision: number; derivationUnitId: string },
): Promise<ExperienceGeneSourceSnapshot | null> {
  const artifactResult = await pool.query<Row>(
    `SELECT id, title, labels, scope, team_id, required_level, lifecycle_state,
            latest_revision, remediation
     FROM skill_artifacts
     WHERE id = $1 AND lifecycle_state = 'approved' AND latest_revision = $2
       AND (remediation->>'suppressedFromRetrieval')::boolean IS NOT TRUE
       AND (remediation->>'suppressedFromIndex')::boolean IS NOT TRUE`,
    [request.artifactId, request.revision],
  );
  if (!eligible(artifactResult.rows[0])) return null;

  const revisionResult = await pool.query<Row>(
    `SELECT revision_no, source_hash, files FROM artifact_revisions
     WHERE artifact_id = $1 AND revision_no = $2`,
    [request.artifactId, request.revision],
  );
  const revision = revisionResult.rows[0];
  if (!revision) return null;

  const files = Array.isArray(revision.files) ? revision.files : [];
  const markdownFile = files.find(
    (file): file is { path: string; content: string } =>
      typeof file === 'object' && file !== null && string(file.path) === 'SKILL.md',
  );
  if (!markdownFile) return null;

  return experienceGeneSourceSnapshotSchema.parse({
    kind: 'skill-artifact',
    sourceId: `${request.artifactId}:${request.derivationUnitId}`,
    revision: request.revision,
    sourceHash: string(revision.source_hash),
    artifactId: request.artifactId,
    artifactRevision: request.revision,
    derivationUnitId: request.derivationUnitId,
    title: string(artifactResult.rows[0].title),
    labels: labels(artifactResult.rows[0].labels),
    scope: string(artifactResult.rows[0].scope),
    teamId:
      typeof artifactResult.rows[0].team_id === 'string' ? artifactResult.rows[0].team_id : null,
    requiredLevel: number(artifactResult.rows[0].required_level),
    text: string(markdownFile.content),
    truncated: false,
  });
}

async function loadSkillCapsule(
  pool: Queryable,
  request: { capsuleId: string },
): Promise<ExperienceGeneSourceSnapshot | null> {
  const result = await pool.query<Row>(
    `SELECT cap.*, sa.title AS artifact_title, sa.lifecycle_state, sa.remediation
     FROM skill_artifact_capsules cap
     JOIN skill_artifacts sa ON sa.id = cap.artifact_id
     WHERE cap.capsule_id = $1 AND sa.lifecycle_state = 'approved'
       AND (sa.remediation->>'suppressedFromRetrieval')::boolean IS NOT TRUE
       AND (sa.remediation->>'suppressedFromIndex')::boolean IS NOT TRUE`,
    [request.capsuleId],
  );
  const row = result.rows[0];
  if (!eligible(row)) return null;

  const provenance = {
    revisionSourceHash: string(row.source_hash),
    capsuleId: String(row.capsule_id),
    content: string(row.content),
    situation: string(row.situation),
    problem: string(row.problem),
    goal: string(row.goal),
    errorText: typeof row.error_text === 'string' ? row.error_text : null,
    contextualPrefix: typeof row.contextual_prefix === 'string' ? row.contextual_prefix : null,
  };
  return experienceGeneSourceSnapshotSchema.parse({
    kind: 'skill-capsule',
    sourceId: provenance.capsuleId,
    revision: number(row.revision_no),
    sourceHash: sha256CanonicalJson(provenance),
    artifactId: String(row.artifact_id),
    artifactRevision: number(row.revision_no),
    capsuleId: provenance.capsuleId,
    derivationUnitId: provenance.capsuleId,
    title: string(row.artifact_title),
    labels: labels(row.labels),
    scope: string(row.scope),
    teamId: typeof row.team_id === 'string' ? row.team_id : null,
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
}

export function createPgExperienceGeneSourceLoaders(pool: Queryable) {
  return {
    trap(request: { sourceId: string }) {
      return loadTrap(pool, request);
    },
    skillArtifact(request: {
      artifactId: string;
      revision: number;
      derivationUnitId: string;
    }) {
      return loadSkillArtifact(pool, request);
    },
    skillCapsule(request: { capsuleId: string }) {
      return loadSkillCapsule(pool, request);
    },
  };
}
