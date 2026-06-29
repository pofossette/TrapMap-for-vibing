import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

interface ServiceProcess {
  name: string;
  port: number;
  url: string;
  process: ChildProcess;
}

const services: ServiceProcess[] = [];

async function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    server.on('error', reject);
  });
}

async function waitFor(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the child process is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startService(
  name: ServiceProcess['name'],
  role: string,
  port: number,
  env: Record<string, string>,
) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const helperPath = path.join(
    repoRoot,
    'packages/host-distributed/src/testing/distributed-runtime-smoke-service.ts',
  );
  const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');

  const child = spawn(process.execPath, [tsxCli, helperPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
      TRAPMAP_TEST_SERVICE_ROLE: role,
      TRAPMAP_SERVICE_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const url = `http://127.0.0.1:${port}`;
  await waitFor(`${url}${role === 'gateway' ? '/health' : '/internal/health'}`);
  services.push({ name, port, url, process: child });
}

async function diagnostics(url: string) {
  const response = await fetch(`${url}/__diagnostics`);
  expect(response.status).toBe(200);
  return (await response.json()) as {
    hits: string[];
    headers: Array<Record<string, string | undefined>>;
    queueSnapshots: Array<Record<string, number>>;
    outboxSnapshots: Array<Record<string, number>>;
    reclaimCount: number;
  };
}

afterEach(async () => {
  await Promise.all(
    services.splice(0).map(
      (service) =>
        new Promise<void>((resolve) => {
          service.process.once('exit', () => resolve());
          service.process.kill('SIGTERM');
          setTimeout(() => resolve(), 2_000);
        }),
    ),
  );
});

describe('distributed runtime closeout', () => {
  it('proves multi-process gateway to internal services to knowledge-write closeout with recovery evidence', async () => {
    const ports = {
      gateway: await allocatePort(),
      identity: await allocatePort(),
      knowledgeWrite: await allocatePort(),
      knowledgeRead: await allocatePort(),
      candidate: await allocatePort(),
      governance: await allocatePort(),
      jobRuntime: await allocatePort(),
    };

    const env = {
      TRAPMAP_GATEWAY_URL: `http://127.0.0.1:${ports.gateway}`,
      TRAPMAP_IDENTITY_ACCESS_URL: `http://127.0.0.1:${ports.identity}`,
      TRAPMAP_KNOWLEDGE_READ_URL: `http://127.0.0.1:${ports.knowledgeRead}`,
      TRAPMAP_KNOWLEDGE_WRITE_URL: `http://127.0.0.1:${ports.knowledgeWrite}`,
      TRAPMAP_CANDIDATE_INGESTION_URL: `http://127.0.0.1:${ports.candidate}`,
      TRAPMAP_GOVERNANCE_REVIEW_URL: `http://127.0.0.1:${ports.governance}`,
      TRAPMAP_JOB_RUNTIME_URL: `http://127.0.0.1:${ports.jobRuntime}`,
    };

    await startService('identity-access', 'identity-access', ports.identity, env);
    await startService('knowledge-write', 'knowledge-write', ports.knowledgeWrite, env);
    await startService('candidate-ingestion', 'candidate-ingestion', ports.candidate, env);
    await startService('governance-review', 'governance-review', ports.governance, env);
    await startService('job-runtime', 'job-runtime', ports.jobRuntime, env);
    await startService('gateway', 'gateway', ports.gateway, env);

    const authHeaders = {
      authorization: 'Bearer session',
      'x-request-id': 'req-closeout',
      'x-trace-id': 'trace-closeout',
      'content-type': 'application/json',
    };

    const resolution = await fetch(
      `${env.TRAPMAP_GATEWAY_URL}/v1/candidates/candidate-1/resolution`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ resolution: { decision: 'merge' }, actorId: 'user-1' }),
      },
    );
    const review = await fetch(`${env.TRAPMAP_GATEWAY_URL}/v1/knowledge/review`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ entryId: 'entry-1', actorId: 'user-1', decision: 'approve' }),
    });
    const schedule = await fetch(`${env.TRAPMAP_GATEWAY_URL}/v1/jobs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        type: 'knowledge.index-follow-up',
        payload: { entryId: 'entry-1' },
      }),
    });
    const scheduledBody = (await schedule.json()) as { jobId: string };
    const status = await fetch(`${env.TRAPMAP_GATEWAY_URL}/v1/jobs/${scheduledBody.jobId}`, {
      headers: { authorization: 'Bearer session' },
    });
    const queue = await fetch(`${env.TRAPMAP_GATEWAY_URL}/v1/jobs/queue`, {
      headers: { authorization: 'Bearer session' },
    });

    expect(resolution.status).toBe(200);
    expect(review.status).toBe(200);
    expect(schedule.status).toBe(201);
    expect(status.status).toBe(200);
    expect(queue.status).toBe(200);

    const errorCases = [
      ['missing-entry', 404, 'not-found'],
      ['conflict-entry', 409, 'conflict'],
      ['forbidden-entry', 403, 'forbidden'],
      ['unavailable-entry', 503, 'unavailable'],
      ['timeout-entry', 504, 'timeout'],
    ] as const;

    for (const [entryId, statusCode, kind] of errorCases) {
      const response = await fetch(`${env.TRAPMAP_GATEWAY_URL}/v1/knowledge/review`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ entryId, actorId: 'user-1', decision: 'approve' }),
      });
      expect(response.status).toBe(statusCode);
      await expect(response.json()).resolves.toMatchObject({ kind });
    }

    const stale = await fetch(`${env.TRAPMAP_GATEWAY_URL}/v1/jobs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        type: 'stale-reclaim-demo',
        payload: { entryId: 'entry-stale' },
      }),
    });
    expect(stale.status).toBe(201);
    const beforeReclaim = await fetch(`${env.TRAPMAP_GATEWAY_URL}/v1/jobs/queue`, {
      headers: { authorization: 'Bearer session' },
    });
    await fetch(`${env.TRAPMAP_JOB_RUNTIME_URL}/__diagnostics/reclaim-stale`, { method: 'POST' });
    const afterReclaim = await fetch(`${env.TRAPMAP_GATEWAY_URL}/v1/jobs/queue`, {
      headers: { authorization: 'Bearer session' },
    });
    const retryableOutbox = await fetch(
      `${env.TRAPMAP_JOB_RUNTIME_URL}/__diagnostics/outbox/run-retryable-failure`,
      { method: 'POST' },
    );
    const deadLetterOutbox = await fetch(
      `${env.TRAPMAP_JOB_RUNTIME_URL}/__diagnostics/outbox/run-dead-letter`,
      { method: 'POST' },
    );
    const reclaimedOutbox = await fetch(
      `${env.TRAPMAP_JOB_RUNTIME_URL}/__diagnostics/outbox/reclaim-stale-processing`,
      { method: 'POST' },
    );

    expect(await beforeReclaim.json()).toEqual({ pending: 0, running: 2, dead: 0 });
    expect(await afterReclaim.json()).toEqual({ pending: 1, running: 1, dead: 0 });
    expect(retryableOutbox.status).toBe(200);
    expect(deadLetterOutbox.status).toBe(200);
    expect(reclaimedOutbox.status).toBe(200);

    const identity = await diagnostics(env.TRAPMAP_IDENTITY_ACCESS_URL);
    const candidate = await diagnostics(env.TRAPMAP_CANDIDATE_INGESTION_URL);
    const governance = await diagnostics(env.TRAPMAP_GOVERNANCE_REVIEW_URL);
    const knowledgeWrite = await diagnostics(env.TRAPMAP_KNOWLEDGE_WRITE_URL);
    const jobRuntime = await diagnostics(env.TRAPMAP_JOB_RUNTIME_URL);

    expect(identity.headers[0]).not.toHaveProperty('authorization');
    expect(identity.headers[0]).not.toHaveProperty('x-request-id');
    expect(identity.headers[0]).not.toHaveProperty('x-trace-id');
    expect(candidate.hits).toContain('candidate:resolution:candidate-1');
    expect(governance.hits).toContain('review:approve:entry-1');
    expect(knowledgeWrite.hits).toEqual(
      expect.arrayContaining([
        'knowledge-write:candidate:candidate-1',
        'knowledge-write:approve:entry-1',
      ]),
    );
    expect(knowledgeWrite.headers).toContainEqual({
      'x-request-id': 'req-closeout',
      'x-trace-id': 'trace-closeout',
    });
    expect(jobRuntime.reclaimCount).toBe(2);
    expect(jobRuntime.queueSnapshots).toEqual(
      expect.arrayContaining([
        { pending: 0, running: 1, dead: 0 },
        { pending: 0, running: 2, dead: 0 },
        { pending: 1, running: 1, dead: 0 },
      ]),
    );
    expect(jobRuntime.outboxSnapshots).toEqual(
      expect.arrayContaining([
        { pending: 1, processing: 0, failed: 0, staleProcessing: 0 },
        { pending: 0, processing: 1, failed: 0, staleProcessing: 0 },
        { pending: 1, processing: 0, failed: 0, staleProcessing: 0 },
        { pending: 2, processing: 0, failed: 0, staleProcessing: 0 },
        { pending: 1, processing: 1, failed: 0, staleProcessing: 0 },
        { pending: 1, processing: 0, failed: 1, staleProcessing: 0 },
        { pending: 1, processing: 1, failed: 1, staleProcessing: 1 },
        { pending: 2, processing: 0, failed: 1, staleProcessing: 0 },
      ]),
    );
    expect(jobRuntime.hits).toEqual(
      expect.arrayContaining([
        'outbox:status:1:0:0:0',
        'outbox:status:0:1:0:0',
        'outbox:status:1:1:1:1',
        'outbox:status:1:0:1:0',
        'outbox:status:2:0:1:0',
      ]),
    );
  }, 20_000);
});
