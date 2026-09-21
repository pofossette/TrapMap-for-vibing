/**
 * Live retrieval latency bench (PostgreSQL + real HTTP).
 *
 * Unlike `scripts/retrieval-latency-bench.ts` (in-memory, CPU-only) this
 * harness runs the **real host-local runtime** against a real PostgreSQL with
 * pgvector, over a real HTTP listener. The DB recall branches
 * (`pgRecall.keywordRecall` / `vectorSimilaritySearch` / `graphAssistedRecall`)
 * are active, so the numbers include SQL round trips and HTTP.
 *
 * What is still not production-identical:
 * - No gateway/Nest layer in front (routes are registered directly on Fastify),
 *   so no session-guard middleware cost.
 * - Embeddings come from the default hash embedder unless a real provider key
 *   is configured, so no outbound embedding latency.
 *
 * Usage (the coordinated wrapper creates and migrates a temporary database):
 *
 *   TRAPMAP_POSTGRES_COORDINATOR_URL=postgres://trapmap:trapmap@127.0.0.1:5434/trapmap \
 *     pnpm exec tsx --tsconfig tsconfig.base.json scripts/run-postgres-coordinated.ts -- \
 *     pnpm exec tsx --tsconfig tsconfig.base.json scripts/retrieval-latency-live.ts \
 *       --entries 500 --queries 40 --warmup 5
 */

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import {
  type LatencySummary,
  type RetrievalLatencyEndpoint,
  summarizeLatency,
} from '@trapmap/contracts';
import { nowIso } from '@trapmap/lib';
import { createKnowledgeEmbeddingsVectorSearchPort } from '../packages/service-knowledge-read/src/knowledge-vector-search-port.js';

import { buildPostgresComposedServer } from './testing/postgres-server-composition.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseNumber(args: string[], name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const parsed = Number(args[index + 1]);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} expects a positive number`);
  return Math.floor(parsed);
}

function parseString(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1]?.trim();
  if (!value) throw new Error(`${name} expects a non-empty value`);
  return value;
}

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

const TOPICS = [
  'postgres connection pool exhaustion under burst load',
  'react hydration mismatch after server render',
  'kubernetes readiness probe flapping on slow start',
  'typescript strict null checks migration strategy',
  'redis cache stampede during cold start',
  'docker image layer caching in ci pipelines',
  'graceful shutdown draining in-flight requests',
  'vector index recall drift after bulk upsert',
  'graphql n+1 query fan-out on nested resolvers',
  'flaky end-to-end tests from shared fixtures',
];

const LABELS = ['backend', 'frontend', 'infra', 'testing', 'database', 'ci', 'observability'];

/** Deterministic offline embedding — mirrors the default retrieval infra. */
const EMBEDDING_DIMENSIONS = 384;

function embed(text: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  for (const token of text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)) {
    const hash = createHash('sha256').update(token).digest();
    for (let index = 0; index < hash.length; index += 1) {
      vector[hash[index]! % vector.length]! += hash[index]! % 2 === 0 ? 1 : -1;
    }
  }
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

// ---------------------------------------------------------------------------
// Capsule + graph seeding
// ---------------------------------------------------------------------------

/**
 * Seed capsule projections directly.
 *
 * The artifact-derivation pipeline is the real producer of these rows; the
 * bench writes them itself so the measurement does not depend on artifact
 * import throughput. Column sets mirror `skill_artifacts`,
 * `skill_artifact_capsules` and `skill_artifact_capsule_embeddings` exactly.
 */
async function seedCapsules(
  pool: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const topic = TOPICS[index % TOPICS.length] ?? 'general';
    const label = LABELS[index % LABELS.length] ?? 'general';
    const teamId = index % 3 === 0 ? 'team_bench' : null;
    const scope = index % 3 === 0 ? 'project' : 'global';
    const artifactId = `artifact_live_${index}`;
    const capsuleId = `capsule_live_${index}`;
    const situation = `${label} workload under ${topic}`;
    const problem = topic;
    const goal = `mitigate ${topic} by bounding concurrency and adding backpressure`;
    const contextualPrefix = `${topic} in the ${label} area`;
    const content = `${situation}\n${problem}\n${goal}`;
    await pool.query(
      `INSERT INTO skill_artifacts
         (id, team_id, scope, labels, title, slug, required_level, lifecycle_state,
          owner_user_id, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,0,'approved',$7,$8::jsonb, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [
        artifactId,
        teamId,
        scope,
        JSON.stringify([label]),
        `${topic} — capsule ${index}`,
        `artifact-live-${index}`,
        'user_latency_bench',
        JSON.stringify({
          sourceKind: 'skill-directory',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: null,
          latestSubmittedAt: null,
          latestReviewedAt: null,
          latestDecision: null,
        }),
      ],
    );

    await pool.query(
      `INSERT INTO skill_artifact_capsules
         (capsule_id, artifact_revision_id, artifact_id, revision_no, source_hash,
          source_paths, content, situation, problem, goal, contextual_prefix,
          labels, scope, required_level, created_at)
       VALUES ($1,$2,$3,1,$4,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,$12,0, now())
       ON CONFLICT (capsule_id) DO NOTHING`,
      [
        capsuleId,
        `${artifactId}_r1`,
        artifactId,
        createHash('sha256').update(capsuleId).digest('hex'),
        JSON.stringify(['SKILL.md']),
        content,
        situation,
        problem,
        goal,
        contextualPrefix,
        JSON.stringify([label]),
        scope,
      ],
    );

    await pool.query(
      `INSERT INTO skill_artifact_capsule_embeddings
         (capsule_id, artifact_id, revision_no, team_id, scope, required_level, status,
          embedding, content_hash, created_at, updated_at)
       VALUES ($1,$2,1,$3,$4,0,'synced',$5::vector,$6, now(), now())
       ON CONFLICT (capsule_id) DO NOTHING`,
      [
        capsuleId,
        artifactId,
        teamId,
        scope,
        `[${embed(`${situation} ${problem} ${goal} ${contextualPrefix} ${content}`).join(',')}]`,
        createHash('sha256').update(content).digest('hex'),
      ],
    );
  }
}

/**
 * Seed one graph document per knowledge entry so the v3 graph channel has
 * something to expand. Nodes carry the entry's topic tokens as labels — the
 * in-memory backend matches `expandSourcesOneHop` on labels.
 */
async function seedGraphDocuments(
  pool: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const topic = TOPICS[index % TOPICS.length] ?? 'general';
    const entryId = `entry_live_${index}`;
    const artifactId = `artifact_live_${index}`;
    const trapNodeId = `trap:${entryId}`;
    const skillNodeId = `skill:${artifactId}`;

    // Canonical trap document: node id must be `trap:<sourceId>` to be the
    // canonical owner (`graph-query.ts` isCanonicalOwner).
    await pool.query(
      `INSERT INTO graph_index_documents
         (id, source_type, source_id, revision_no, content_hash, team_id, scope,
          required_level, nodes, edges, evidence, created_at, updated_at)
       VALUES ($1,'trap',$2,1,$3,NULL,'global',0,$4::jsonb,$5::jsonb,$6, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [
        `graphdoc_trap_${index}`,
        entryId,
        createHash('sha256').update(trapNodeId).digest('hex'),
        JSON.stringify([
          { id: trapNodeId, kind: 'trap', label: topic, evidence: topic, severity: 'hard' },
        ]),
        JSON.stringify([
          {
            id: `edge_mitigates_${index}`,
            sourceNodeId: skillNodeId,
            targetNodeId: trapNodeId,
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'bench seeding',
          },
        ]),
        topic,
      ],
    );

    // Canonical skill document: node id `skill:<artifactId>`.
    await pool.query(
      `INSERT INTO graph_index_documents
         (id, source_type, source_id, revision_no, content_hash, team_id, scope,
          required_level, nodes, edges, evidence, created_at, updated_at)
       VALUES ($1,'skill',$2,1,$3,NULL,'global',0,$4::jsonb,'[]'::jsonb,$5, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [
        `graphdoc_skill_${index}`,
        artifactId,
        createHash('sha256').update(skillNodeId).digest('hex'),
        JSON.stringify([
          { id: skillNodeId, kind: 'skill', label: `mitigate ${topic}`, evidence: topic },
        ]),
        `mitigation for ${topic}`,
      ],
    );
  }
}

/**
 * Seed one solidified Experience Gene with both index rows.
 *
 * The gene derivation pipeline is the real producer; the bench writes the rows
 * directly so the measurement does not depend on derivation throughput.
 * Column sets mirror `experience_genes`, `experience_gene_search_documents`
 * and `experience_gene_embeddings`.
 */
async function seedGenes(
  pool: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  count: number,
): Promise<void> {
  for (let index = 0; index < Math.min(count, TOPICS.length); index += 1) {
    const topic = TOPICS[index] ?? 'general';
    const geneId = `gene_live_${index}`;
    const contentHash = createHash('sha256')
      .update(geneId + topic)
      .digest('hex');

    await pool.query(
      `INSERT INTO experience_genes
         (id, schema_version, status, title, signals_match, summary, strategy, avoid,
          constraints, validation, labels, scope, team_id, required_level, source_type,
          source_id, source_revision, source_hash, derivation_unit_id, idempotency_key,
          content_hash, generator_kind, prompt_version, index_status, created_at, updated_at)
       VALUES ($1,'1','solidified',$2,$3::jsonb,$4,$5::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,
               $6::jsonb,'global',NULL,0,'trap',$7,1,$8,'unit_' || $1, 'idem_' || $1,
               $9,'rule','bench-v1','ready', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [
        geneId,
        `Guard against ${topic}`,
        JSON.stringify([topic]),
        `When ${topic} occurs, bound refill concurrency before scaling the store.`,
        JSON.stringify(['Bound refill concurrency with a singleflight loader']),
        JSON.stringify(['database', 'redis']),
        `entry_live_${index}`,
        createHash('sha256').update(`src_${geneId}`).digest('hex'),
        contentHash,
      ],
    );

    const vec = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
    for (const token of topic.toLowerCase().split(/[^a-z0-9]+/)) {
      for (const byte of createHash('sha256').update(token).digest()) {
        vec[byte % EMBEDDING_DIMENSIONS]! += 1;
      }
    }
    const magnitude = Math.sqrt(vec.reduce((total, value) => total + value * value, 0));
    const vector = magnitude === 0 ? vec : vec.map((value) => value / magnitude);

    // The search document lives on the embeddings row (Phase-2 compression
    // merged experience_gene_search_documents into it).
    await pool.query(
      `INSERT INTO experience_gene_embeddings
         (gene_id, content_hash, embedding, embedding_model_version, document, labels, status, updated_at)
       VALUES ($1,$2,$3::vector,'bench-hash-1', to_tsvector('english', $4), '{}'::text[], 'ready', now())
       ON CONFLICT (gene_id) DO NOTHING`,
      [
        geneId,
        contentHash,
        `[${vector.join(',')}]`,
        `${topic} bound refill concurrency singleflight`,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const entries = parseNumber(args, '--entries', 500);
  const queries = parseNumber(args, '--queries', 40);
  const warmup = parseNumber(args, '--warmup', 5);
  const out = parseString(args, '--out', 'benchmarks/retrieval-latency/live-pg.json');

  // Capture the RAG log so the same run also yields the stage/channel
  // breakdown through scripts/retrieval-latency-report.ts. Gene retrieval is
  // mode-gated (off default); serve makes `/v1/retrieval/genes/search` actually
  // recall instead of returning the governed disabled response.
  process.env.LOG_RAG_ENABLED ??= 'true';
  process.env.LOG_RAG_DIR ??= 'benchmarks/retrieval-latency/rag-log-live';
  process.env.TRAPMAP_EXPERIENCE_GENES_MODE ??= 'serve';

  const databaseUrl = process.env.TRAPMAP_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'live bench requires TRAPMAP_DATABASE_URL (run through run-postgres-coordinated.ts)',
    );
  }

  const composed = await buildPostgresComposedServer(databaseUrl);
  const { app, runtime, services } = composed;
  const pool = services.store.getPool();

  const actorId = 'user_latency_bench';
  const existingUser = await services.identity.userRepo.getById(actorId);
  if (!existingUser) {
    await services.identity.userRepo.insert({
      id: actorId,
      handle: 'latency-bench',
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  // Seed knowledge entries through the owner port so revisions, lifecycle and
  // labels land exactly like a real submission.
  const vectorRecords = [];
  for (let index = 0; index < entries; index += 1) {
    const topic = TOPICS[index % TOPICS.length] ?? 'general';
    const label = LABELS[index % LABELS.length] ?? 'general';
    const teamId = index % 3 === 0 ? 'team_bench' : null;
    const scope = index % 3 === 0 ? 'project' : 'global';
    const entryId = `entry_live_${index}`;
    const shortcut = `${topic} — variant ${index}`;
    const detail =
      `${topic}. Observed when ${label} workload spikes; mitigate by bounding concurrency, ` +
      `adding backpressure and verifying with a load test. Knowledge entry ${index}.`;

    await services.knowledgeOwner.submit({
      actorId,
      entryId,
      lifecycleState: 'approved',
      content: detail,
      title: shortcut,
      labels: [label],
      teamId,
      scope,
      requiredLevel: 0,
    });

    vectorRecords.push({
      sourceId: entryId,
      sourceRevision: 1,
      contentHash: createHash('sha256').update(`${shortcut}\n${detail}`).digest('hex'),
      vector: embed(`${shortcut} ${detail}`),
      teamId,
      scope,
      requiredLevel: 0,
    });
  }

  // pgvector index rows: without these the DB vector branch returns nothing and
  // the measured query would not represent a real index scan.
  const vectorPort = createKnowledgeEmbeddingsVectorSearchPort(pool as never);
  for (let index = 0; index < vectorRecords.length; index += 100) {
    await vectorPort.upsert(vectorRecords.slice(index, index + 100) as never);
  }

  // Capsule pool for the v2 surface and graph documents for the v3 graph channel.
  await seedCapsules(pool as never, entries);
  await seedGraphDocuments(pool as never, entries);
  await seedGenes(pool as never, entries);

  // The composed server already owns `/v1/retrieval/*`; these `/bench/*`
  // routes exist only so the endpoint attribution can be passed explicitly
  // (`/v1` and `/v3` share one RetrievalQueryPort, so the label cannot be
  // bound at construction). Handler bodies are identical to the gateway ones.
  app.post('/bench/v1-search', async (request, reply) => {
    const body = request.body as { query?: string; limit?: number };
    return reply.send(
      await runtime.retrievalQuery.search({
        query: body.query ?? '',
        limit: body.limit ?? 10,
        latencyEndpoint: 'v1-search',
      }),
    );
  });
  app.post('/bench/v3-graph-plan', async (request, reply) => {
    const body = request.body as { query?: string; skillBudget?: number };
    if (!runtime.retrievalQuery.searchGraphPlan) {
      return reply.status(501).send({ error: 'graph-plan retrieval not wired' });
    }
    return reply.send(
      await runtime.retrievalQuery.searchGraphPlan({
        seed: body.query ?? '',
        ...(body.skillBudget !== undefined ? { skillBudget: body.skillBudget } : {}),
        latencyEndpoint: 'v3-graph-plan',
      }),
    );
  });
  app.post('/bench/v2-capsule', async (request, reply) => {
    const body = request.body as { seed?: string; maxResults?: number };
    if (!runtime.retrievalQuery.searchCapsules) {
      return reply.status(501).send({ error: 'capsule retrieval not wired' });
    }
    return reply.send(
      await runtime.retrievalQuery.searchCapsules({
        query: body.seed ?? '',
        ...(body.maxResults !== undefined ? { limit: body.maxResults } : {}),
        latencyEndpoint: 'v2-capsule',
      }),
    );
  });
  app.post('/bench/v1-skills', async (request, reply) => {
    const body = request.body as { text?: string; maxResults?: number };
    return reply.send(
      await runtime.skillLookup({
        text: body.text ?? '',
        ...(body.maxResults ? { maxResults: body.maxResults } : {}),
      }),
    );
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  const endpoints: Array<{
    endpoint: RetrievalLatencyEndpoint;
    path: string;
    body: (q: string) => unknown;
  }> = [
    { endpoint: 'v1-search', path: '/bench/v1-search', body: (q) => ({ query: q, limit: 10 }) },
    {
      endpoint: 'v3-graph-plan',
      path: '/bench/v3-graph-plan',
      body: (q) => ({ query: q, skillBudget: 3 }),
    },
    {
      endpoint: 'v2-capsule',
      path: '/bench/v2-capsule',
      body: (q) => ({ seed: q, maxResults: 10 }),
    },
    {
      endpoint: 'v1-skills',
      path: '/bench/v1-skills',
      body: (q) => ({ text: q, maxResults: 10 }),
    },
    {
      // Gene retrieval is measured by its own metric family
      // (trapmap_experience_gene_search_duration_ms); this row is the HTTP
      // latency of the same surface for the five-way comparison.
      endpoint: 'v4-gene' as RetrievalLatencyEndpoint,
      path: '/v1/retrieval/genes/search',
      body: (q) => ({ seed: q, maxResults: 3 }),
    },
  ];

  const post = async (
    path: string,
    body: unknown,
  ): Promise<{ ms: number; status: number; detail: string }> => {
    const started = performance.now();
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return {
      ms: performance.now() - started,
      status: response.status,
      detail: response.ok ? '' : text.slice(0, 200),
    };
  };

  const buildQueries = (count: number): string[] =>
    Array.from(
      { length: count },
      (_, index) => `${TOPICS[index % TOPICS.length]} variant ${index}`,
    );

  const querySet = buildQueries(Math.max(queries, 1));

  for (let index = 0; index < warmup; index += 1) {
    await post('/bench/v1-search', { query: querySet[index % querySet.length], limit: 10 });
    await post('/bench/v3-graph-plan', { query: querySet[index % querySet.length], limit: 10 });
  }

  const samples: Record<string, number[]> = {};
  const statuses: Record<string, Record<string, number>> = {};
  const failureDetails: Record<string, string> = {};
  let failures = 0;
  for (const target of endpoints) {
    const values: number[] = [];
    const byStatus: Record<string, number> = {};
    for (let index = 0; index < queries; index += 1) {
      const result = await post(
        target.path,
        target.body(querySet[index % querySet.length] ?? 'query'),
      );
      if (result.status >= 400) {
        failures += 1;
        failureDetails[target.endpoint] ??= `${result.status} ${result.detail}`;
      } else {
        // Only successful requests count toward latency: a fast 400 is not a
        // fast retrieval.
        values.push(result.ms);
      }
      byStatus[String(result.status)] = (byStatus[String(result.status)] ?? 0) + 1;
    }
    samples[target.endpoint] = values;
    statuses[target.endpoint] = byStatus;
  }

  const rows = endpoints.map((target) => {
    const summary: LatencySummary = summarizeLatency(samples[target.endpoint] ?? []);
    return { endpoint: target.endpoint, path: target.path, summary };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    source: `live-pg(entries=${entries},queries=${queries},warmup=${warmup})`,
    endpointLatency: rows,
    failedRequests: failures,
    statuses,
    failureDetails,
  };

  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(`live retrieval latency — PostgreSQL + HTTP (${report.source})`);
  console.log('');
  console.log('| endpoint | path | n | p50 | p95 | p99 | max | avg |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    const s = row.summary;
    console.log(
      `| ${row.endpoint} | ${row.path} | ${s.count} | ${s.p50Ms} | ${s.p95Ms} | ${s.p99Ms} | ${s.maxMs} | ${s.avgMs} |`,
    );
  }
  console.log('');
  console.log(`failed requests: ${failures}`);
  for (const [endpoint, detail] of Object.entries(failureDetails)) {
    console.log(`  ${endpoint}: ${detail}`);
  }
  console.log(
    `statuses: ${Object.entries(statuses)
      .map(
        ([endpoint, byStatus]) =>
          `${endpoint}{${Object.entries(byStatus)
            .map(([code, n]) => `${code}:${n}`)
            .join(',')}}`,
      )
      .join(' ')}`,
  );
  console.log(`report written to ${out}`);

  await app.close();
  await composed.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'live retrieval latency bench failed');
  process.exitCode = 1;
});
