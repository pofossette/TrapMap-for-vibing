import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  retrievalEvalScenarioSnapshotSchema,
  liveSnapshotMetaSchema,
  type LiveEvalServiceProfile,
} from '@trapmap/contracts/evals';
import { loadConfig } from '@trapmap/server/config.js';
import { buildServer } from '@trapmap/server/app.js';
import type { GraphIndexDocumentRecord } from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';

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
  const { values } = parseArgs({
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
  });

  if (!values.output && !values.version) {
    throw new Error(
      'Usage: pnpm exec tsx scripts/export-retrieval-db-snapshot.ts --output <path> [--teamId <team>] [--actorTeamId <team>] [--securityLevel <0-10>] [--subjectType user|system-admin] [--permissions p1,p2] [--version <name>] [--derived-mode frozen|rebuild]',
    );
  }

  const subjectType = values.subjectType === 'system-admin' ? 'system-admin' : 'user';
  const securityLevel = Number.parseInt(values.securityLevel, 10);
  if (Number.isNaN(securityLevel) || securityLevel < 0 || securityLevel > 10) {
    throw new Error(`Invalid --securityLevel: ${values.securityLevel}`);
  }

  const derivedMode = values['derived-mode'] === 'rebuild' ? 'rebuild' : 'frozen';

  return {
    output: values.output ?? '',
    teamId: values.teamId ?? null,
    actorTeamId: values.actorTeamId ?? values.teamId ?? null,
    securityLevel,
    subjectType,
    permissions: values.permissions
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    version: values.version ?? null,
    derivedMode,
  };
}

function toSnapshotKnowledgeEntry(entry: KnowledgeRecord) {
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

function toSnapshotSkillArtifact(artifact: SkillArtifactRecord) {
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

function detectServiceProfile(): LiveEvalServiceProfile {
  return {
    embeddingModel: process.env.OPENAI_API_KEY
      ? 'text-embedding-3-small'
      : (process.env.AI_EMBEDDING_MODEL ?? 'fallback-hash'),
    useDbSearch: process.env.USE_DB_SEARCH === 'true',
    capsulePgKeyword: process.env.RETRIEVAL_CAPSULE_PG_KEYWORD === 'true',
    capsulePgSemantic: process.env.RETRIEVAL_CAPSULE_PG_SEMANTIC === 'true',
    graphDbEnabled: process.env.TRAPMAP_GRAPH_DB_ENABLED === 'true',
    graphDbProvider:
      process.env.TRAPMAP_GRAPH_DB_ENABLED === 'true'
        ? (process.env.TRAPMAP_GRAPH_DB_PROVIDER ?? 'neo4j')
        : null,
    decayEnabled: process.env.TRAPMAP_DECAY_ENABLED === 'true',
  };
}

export async function main(): Promise<void> {
  const options = parseCliArgs();
  const config = loadConfig();
  if (!config.databaseUrl) {
    throw new Error('TRAPMAP_DATABASE_URL is required');
  }

  const app = buildServer({ config: { databaseUrl: config.databaseUrl } });

  try {
    await app.ready();
    const repos = app.skillShareer.repos;

    const [knowledgeEntries, skillArtifacts, graphIndexDocuments] = await Promise.all([
      repos.knowledge.listByFilter(options.teamId ? { teamId: options.teamId } : {}),
      repos.artifact.listForRetrieval(options.teamId ? { teamId: options.teamId } : {}),
      repos.graphIndex.listAll(),
    ]);

    const snapshotPayload = retrievalEvalScenarioSnapshotSchema.parse({
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

    // Versioned export mode (--version): outputs to evals/retrieval-live/snapshots/<version>/
    if (options.version) {
      const snapshotDir = path.resolve('evals/retrieval-live/snapshots', options.version);
      await mkdir(snapshotDir, { recursive: true });

      // Compute fingerprint of corpus data
      const corpusJson = JSON.stringify(snapshotPayload.fixtures);
      const fingerprint = createHash('sha256').update(corpusJson).digest('hex');

      // Write corpus.json
      const corpusPath = path.join(snapshotDir, 'corpus.json');
      await writeFile(corpusPath, JSON.stringify(snapshotPayload.fixtures, null, 2), 'utf8');

      // Detect service profile
      const serviceProfile = detectServiceProfile();

      // Count capsule embeddings/keywords for summary
      const capsuleEmbeddingCount = skillArtifacts.reduce(
        (sum, a) => sum + (a.latestRevision.derived?.capsules?.length ?? 0),
        0,
      );

      // Build and write meta.json
      const meta = liveSnapshotMetaSchema.parse({
        schemaVersion: 1,
        version: options.version,
        description: `Retrieval snapshot exported from ${options.teamId ?? 'all teams'}`,
        source: {
          environment: 'local',
          exportedAt: new Date().toISOString(),
          exportedBy: `export-retrieval-db-snapshot`,
          teamId: options.teamId,
        },
        serviceProfile,
        derivationContext: {
          mode: options.derivedMode,
          pipelineVersion: null,
          embeddingModelUsed: serviceProfile.embeddingModel,
        },
        corpusSummary: {
          knowledgeEntryCount: knowledgeEntries.length,
          skillArtifactCount: skillArtifacts.length,
          graphIndexDocumentCount: graphIndexDocuments.length,
          capsuleEmbeddingCount: options.derivedMode === 'frozen' ? capsuleEmbeddingCount : 0,
          capsuleKeywordCount: options.derivedMode === 'frozen' ? capsuleEmbeddingCount : 0,
        },
        fingerprint,
        compatibleEndpoints: ['/v2/retrieval/search', '/v3/retrieval/search'],
        knownLimitations: [],
      });

      const metaPath = path.join(snapshotDir, 'meta.json');
      await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

      console.log(
        `Wrote versioned snapshot "${options.version}" to ${snapshotDir}/` +
          ` (fingerprint: ${fingerprint.slice(0, 12)}..., ` +
          `${meta.corpusSummary.knowledgeEntryCount} knowledge, ` +
          `${meta.corpusSummary.skillArtifactCount} artifacts, ` +
          `${meta.corpusSummary.graphIndexDocumentCount} graph docs)`,
      );
      return;
    }

    // Legacy single-file output mode (--output)
    const outputPath = path.resolve(options.output);
    await writeFile(outputPath, JSON.stringify(snapshotPayload, null, 2), 'utf8');

    console.log(
      `Wrote retrieval snapshot to ${outputPath} (${snapshotPayload.fixtures.knowledgeEntries.length} knowledge, ${snapshotPayload.fixtures.skillArtifacts.length} artifacts, ${snapshotPayload.fixtures.graphIndexDocuments.length} graph docs)`,
    );
  } finally {
    await app.close();
  }
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
