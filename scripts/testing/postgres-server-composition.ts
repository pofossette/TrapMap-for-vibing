/**
 * PostgreSQL eval composition using the host-local runtime.
 *
 * Creates a minimal Fastify app with retrieval routes for HTTP testing,
 * backed by the host-local runtime services.
 */

import { createHash } from 'node:crypto';

import type { FastifyInstance, FastifyReply } from 'fastify';
import Fastify from 'fastify';

import type { KnowledgeOwnerPort } from '../../packages/contracts/src/index.js';
import {
  createHostLocalRuntime,
  type HostLocalRuntime,
} from '../../packages/host-local/src/nest/runtime/host-runtime.js';
import type { HostLocalServices } from '../../packages/host-local/src/nest/runtime/host-services.js';
import type { ArtifactWritePort } from '../../packages/service-knowledge-write/src/artifact-ports.js';

export interface PostgresComposedServer {
  /** Fastify app for HTTP injection testing. */
  app: FastifyInstance;
  /** Full host-local runtime with retrieval, identity, queue, etc. */
  runtime: HostLocalRuntime;
  /** Service-owner ports (identity, knowledge, governance, graph, etc.). */
  services: HostLocalServices;
  /** Artifact write port from service-knowledge-write. */
  artifactWriter: ArtifactWritePort;
  /** Knowledge owner port from service-knowledge-write. */
  knowledgeOwner: KnowledgeOwnerPort;
  close(): Promise<void>;
}

async function resolveSession(
  services: HostLocalServices,
  authHeader: string | undefined,
): Promise<NonNullable<
  Awaited<ReturnType<HostLocalServices['identity']['sessionLookup']['getByTokenHash']>>
> | null> {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return null;
  }
  return services.identity.sessionLookup.getByTokenHash(
    createHash('sha256').update(token).digest('hex'),
  );
}

function sendError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return reply.status(500).send({ error: message });
}

function registerRetrievalRoute(
  app: FastifyInstance,
  services: HostLocalServices,
  runtime: HostLocalRuntime,
  path: string,
  buildQuery: (
    body: Record<string, unknown>,
  ) => Parameters<HostLocalRuntime['retrievalQuery']['search']>[0],
): void {
  app.post(path, async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>;
      const session = await resolveSession(services, request.headers.authorization);
      if (!session) {
        return reply.status(401).send({ error: 'Invalid session' });
      }
      const result = await runtime.retrievalQuery.search(buildQuery(body));
      return reply.send(result);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}

/**
 * Build a PostgreSQL-backed eval composition using the host-local runtime.
 * Sets TRAPMAP_DATABASE_URL before creating the runtime so it connects
 * to the eval database.
 */
export async function buildPostgresComposedServer(
  databaseUrl: string,
): Promise<PostgresComposedServer> {
  // Configure env before createHostLocalRuntime reads config
  process.env.TRAPMAP_DATABASE_URL = databaseUrl;
  process.env.OTEL_DISABLED = 'true';

  const runtime = await createHostLocalRuntime();
  const services = runtime.services;

  // Create a minimal Fastify app with retrieval routes for HTTP testing
  const app = Fastify({ logger: false });

  // Register retrieval search route
  registerRetrievalRoute(app, services, runtime, '/v1/retrieval/search', (body) => ({
    query: body.query as string,
    teamId: body.teamId as string | undefined,
    limit: body.limit as number | undefined,
  }));

  // Register skill lookup route
  app.post('/v1/retrieval/skills/search-by-content', async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>;
      const result = await runtime.skillLookup({
        text: body.text as string,
        ...(body.maxResults ? { maxResults: body.maxResults as number } : {}),
      });
      return reply.send(result);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Register auth session route
  app.post('/v1/auth/session', async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>;
      const token = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      await services.identity.sessionRepo.create({
        userId: body.userId as string,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        activeTeamId: (body.activeTeamId as string) ?? null,
        subjectType: (body.subjectType as string) ?? 'user',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      return reply.send({ token });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  return {
    app,
    runtime,
    services,
    artifactWriter: services.artifactWriter,
    knowledgeOwner: services.knowledgeOwner,
    async close() {
      await app.close();
      await services.close();
    },
  };
}
