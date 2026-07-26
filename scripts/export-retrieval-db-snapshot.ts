import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  type ArtifactReadProjection,
  type GraphIndexDocumentRecord,
  type GraphIndexRepositoryPort,
  type KnowledgeOwnerPort,
  liveSnapshotMetaSchema,
  retrievalEvalScenarioSnapshotSchema,
} from '@trapmap/contracts/evals';
import { createKnowledgeReadGraphIndexRepository } from '@trapmap/service-knowledge-read';
import { createKnowledgeWriteOwnerBundle } from '@trapmap/service-knowledge-write';
import { Pool } from 'pg';
import { detectServiceProfile } from '../evals/retrieval-live/lib/snapshot-support.js';
import { reportEntrypointFailure } from './testing/entrypoint.js';

interface CliOptions {
  output: string;
  teamId: string | null;
  actorTeamId: string | null;
  securityLevel: number;
  subjectType: 'user' | 'system-admin';
  permissions: string[];
  /** Named snapshot version (outputs to evals/retrieval-live/snapshots/<version>/) */
  version: string | null;
  /** Derivation mode for the snapshot */
  derivedMode: 'frozen' | 'rebuild';
}

function parseCliArgs(): CliOptions {
  const values = parseCliValues();
  requireSnapshotDestination(values.output, values.version);
  return composeCliOptions(values);
}

function composeCliOptions(values: ReturnType<typeof parseCliValues>): CliOptions {
  return {
    ...destinationOptions(values),
    ...actorOptions(values),
  };
}

function destinationOptions(values: ReturnType<typeof parseCliValues>) {
  return {
    output: values.output ?? '',
    version: values.version ?? null,
    derivedMode: parseDerivedMode(values['derived-mode']),
  };
}

function actorOptions(values: ReturnType<typeof parseCliValues>) {
  return {
    teamId: values.teamId ?? null,
    actorTeamId: values.actorTeamId ?? values.teamId ?? null,
    securityLevel: parseSecurityLevel(values.securityLevel),
    subjectType: parseSubjectType(values.subjectType),
    permissions: parsePermissions(values.permissions),
  };
}

function parseSubjectType(value: string): 'user' | 'system-admin' {
  return value === 'system-admin' ? 'system-admin' : 'user';
}

function parsePermissions(value: string): string[] {
  return value
    .split(',')
    .map((permission) => permission.trim())
    .filter(Boolean);
}

function parseDerivedMode(value: string): 'frozen' | 'rebuild' {
  return value === 'rebuild' ? 'rebuild' : 'frozen';
}

function parseCliValues() {
  return parseArgs({
    options: {
      output: { type: 'string', short: 'o' },
      teamId: { type: 'string' },
      actorTeamId: { type: 'string' },
      securityLevel: { type: 'string', default: '0' },
      subjectType: { type: 'string', default: 'user' },
      permissions: { type: 'string', default: 'knowledge:search,artifact:read' },
      version: { type: 'string', short: 'V' },
      'derived-mode': { type: 'string', default: 'frozen' },
    },
    strict: true,
  }).values;
}

function requireSnapshotDestination(output: string | undefined, version: string | undefined): void {
  if (!output && !version) {
    throw new Error(
      'Usage: pnpm exec tsx scripts/export-retrieval-db-snapshot.ts --output <path> [--teamId <team>] [--actorTeamId <team>] [--securityLevel <0-10>] [--subjectType user|system-admin] [--permissions p1,p2] [--version <name>] [--derived-mode frozen|rebuild]',
    );
  }
}

function parseSecurityLevel(value: string): number {
  const securityLevel = Number.parseInt(value, 10);
  if (Number.isNaN(securityLevel) || securityLevel < 0 || securityLevel > 10) {
    throw new Error(`Invalid --securityLevel: ${value}`);
  }
  return securityLevel;
}

function toSnapshotKnowledgeEntry(
  entry: Awaited<ReturnType<KnowledgeOwnerPort['listByFilter']>>[number],
) {
  return {
    id: entry.id,
    teamId: entry.teamId,
    scope: entry.scope,
    labels: entry.labels,
    shortcut: entry.shortcut,
    detail: entry.detail,
    requiredLevel: entry.requiredLevel,
    lifecycleState: entry.lifecycleState,
  };
}

function toSnapshotSkillArtifact(
  artifact: Awaited<ReturnType<ArtifactReadProjection['listForRetrieval']>>[number],
) {
  return {
    id: artifact.id,
    teamId: artifact.teamId,
    scope: artifact.scope,
    labels: artifact.labels,
    title: artifact.title,
    slug: artifact.slug,
    requiredLevel: artifact.requiredLevel,
    lifecycleState: artifact.lifecycleState,
    capsules: (artifact.latestRevision.derived?.capsules ?? []).map((capsule) => ({
      capsuleId: capsule.capsuleId,
      content: capsule.content,
      situation: capsule.situation,
      problem: capsule.problem,
      goal: capsule.goal,
      labels: capsule.labels,
      scope: capsule.scope,
      requiredLevel: capsule.requiredLevel,
    })),
  };
}

function filterGraphDocs(
  documents: GraphIndexDocumentRecord[],
  teamId: string | null,
): GraphIndexDocumentRecord[] {
  if (!teamId) {
    return documents;
  }

  return documents.filter((doc) => doc.teamId === teamId || doc.teamId === null);
}

export async function main(): Promise<void> {
  const options = parseCliArgs();
  const databaseUrl = process.env.TRAPMAP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'retrieval snapshot export requires TRAPMAP_DATABASE_URL and PostgreSQL host composition',
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const knowledgeWrite = createKnowledgeWriteOwnerBundle(pool);
  const graphIndex = createKnowledgeReadGraphIndexRepository(pool);

  try {
    const exported = await createSnapshotExport(
      {
        knowledgeOwner: knowledgeWrite.knowledgeOwner,
        artifactReadProjection: knowledgeWrite.artifactReadProjection,
        graphIndex,
      },
      options,
    );
    await writeSnapshotExport(options, exported);
  } finally {
    await pool.end();
  }
}

interface RetrievalSnapshotOwners {
  knowledgeOwner: Pick<KnowledgeOwnerPort, 'listByFilter'>;
  artifactReadProjection: Pick<ArtifactReadProjection, 'listForRetrieval'>;
  graphIndex: Pick<GraphIndexRepositoryPort, 'listAll'>;
}

async function createSnapshotExport(owners: RetrievalSnapshotOwners, options: CliOptions) {
  const filter = options.teamId ? { teamId: options.teamId } : {};
  const [knowledgeEntries, skillArtifacts, graphIndexDocuments] = await Promise.all([
    owners.knowledgeOwner.listByFilter(filter),
    owners.artifactReadProjection.listForRetrieval(filter),
    owners.graphIndex.listAll(),
  ]);
  const payload = retrievalEvalScenarioSnapshotSchema.parse({
    actor: {
      subjectType: options.subjectType,
      activeTeamId: options.actorTeamId,
      securityLevel: options.securityLevel,
      permissions: options.permissions,
    },
    fixtures: {
      knowledgeEntries: knowledgeEntries.map(toSnapshotKnowledgeEntry),
      skillArtifacts: skillArtifacts.map(toSnapshotSkillArtifact),
      graphIndexDocuments: filterGraphDocs(graphIndexDocuments, options.teamId),
    },
  });
  return { payload, knowledgeEntries, skillArtifacts, graphIndexDocuments };
}

async function writeSnapshotExport(
  options: CliOptions,
  exported: Awaited<ReturnType<typeof createSnapshotExport>>,
): Promise<void> {
  if (options.version) {
    await writeVersionedSnapshot(options, exported);
    return;
  }
  await writeLegacySnapshot(options.output, exported.payload);
}

async function writeLegacySnapshot(
  output: string,
  payload: Awaited<ReturnType<typeof createSnapshotExport>>['payload'],
): Promise<void> {
  const outputPath = path.resolve(output);
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(
    `Wrote retrieval snapshot to ${outputPath} (${payload.fixtures.knowledgeEntries.length} knowledge, ${payload.fixtures.skillArtifacts.length} artifacts, ${payload.fixtures.graphIndexDocuments.length} graph docs)`,
  );
}

async function writeVersionedSnapshot(
  options: CliOptions,
  exported: Awaited<ReturnType<typeof createSnapshotExport>>,
): Promise<void> {
  const snapshotDir = path.resolve('evals/retrieval-live/snapshots', options.version!);
  await mkdir(snapshotDir, { recursive: true });
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(exported.payload.fixtures))
    .digest('hex');
  await writeFile(
    path.join(snapshotDir, 'corpus.json'),
    JSON.stringify(exported.payload.fixtures, null, 2),
    'utf8',
  );
  const serviceProfile = detectServiceProfile();
  const capsuleCount = exported.skillArtifacts.reduce(
    (sum, artifact) => sum + (artifact.latestRevision.derived?.capsules?.length ?? 0),
    0,
  );
  const meta = liveSnapshotMetaSchema.parse({
    schemaVersion: 1,
    version: options.version!,
    description: `Retrieval snapshot exported from ${options.teamId ?? 'all teams'}`,
    source: {
      environment: 'local',
      exportedAt: new Date().toISOString(),
      exportedBy: 'export-retrieval-db-snapshot',
      teamId: options.teamId,
    },
    serviceProfile,
    derivationContext: {
      mode: options.derivedMode,
      pipelineVersion: null,
      embeddingModelUsed: serviceProfile.embeddingModel,
    },
    corpusSummary: snapshotSummary(options, exported, capsuleCount),
    fingerprint,
    compatibleEndpoints: ['/v2/retrieval/search', '/v3/retrieval/search'],
    knownLimitations: [],
  });
  await writeFile(path.join(snapshotDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  console.log(
    `Wrote versioned snapshot "${options.version}" to ${snapshotDir}/ (fingerprint: ${fingerprint.slice(0, 12)}..., ${meta.corpusSummary.knowledgeEntryCount} knowledge, ${meta.corpusSummary.skillArtifactCount} artifacts, ${meta.corpusSummary.graphIndexDocumentCount} graph docs)`,
  );
}

function snapshotSummary(
  options: CliOptions,
  exported: Awaited<ReturnType<typeof createSnapshotExport>>,
  capsuleCount: number,
) {
  const derivedCount = options.derivedMode === 'frozen' ? capsuleCount : 0;
  return {
    knowledgeEntryCount: exported.knowledgeEntries.length,
    skillArtifactCount: exported.skillArtifacts.length,
    graphIndexDocumentCount: exported.graphIndexDocuments.length,
    capsuleEmbeddingCount: derivedCount,
    capsuleKeywordCount: derivedCount,
  };
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch(reportEntrypointFailure);
}
