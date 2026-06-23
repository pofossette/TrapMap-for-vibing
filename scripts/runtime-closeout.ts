const baseUrl = process.env.TRAPMAP_CLOSEOUT_BASE_URL ?? 'http://127.0.0.1:4000';
const systemAdminKey = process.env.TRAPMAP_SYSTEM_ADMIN_KEY;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function login(): Promise<string> {
  assert(
    systemAdminKey && systemAdminKey.length > 0,
    'TRAPMAP_SYSTEM_ADMIN_KEY is required for runtime closeout.',
  );

  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ systemAdminKey }),
  });
  const sessionToken = response.headers.get('x-session-token');
  const payload = await response.text();

  assert(response.ok, `Login failed with ${response.status}: ${payload}`);
  assert(sessionToken, 'Login succeeded but x-session-token header was missing.');
  return sessionToken;
}

async function fetchAsyncStatus(sessionToken: string) {
  const response = await fetch(`${baseUrl}/v1/operations/status/async`, {
    headers: { authorization: `Bearer ${sessionToken}` },
  });
  const payload = await response.text();
  assert(response.ok, `Async status failed with ${response.status}: ${payload}`);
  return JSON.parse(payload) as Record<string, any>;
}

function validateStatus(status: Record<string, any>) {
  assert(status.asyncRuntimeEnabled === true, 'asyncRuntimeEnabled must be true.');
  assert(status.deploymentProfile === 'distributed', 'deploymentProfile must be distributed.');
  assert(
    status.routeSurface === 'gateway-core',
    `routeSurface must be gateway-core, got ${status.routeSurface}.`,
  );
  assert(
    ['split-owned', 'remote-expected'].includes(status.asyncOwnershipExpectation),
    `Unexpected asyncOwnershipExpectation: ${status.asyncOwnershipExpectation}.`,
  );
  assert(status.queue && typeof status.queue === 'object', 'queue snapshot missing.');
  assert(status.outbox && typeof status.outbox === 'object', 'outbox snapshot missing.');
  assert(
    typeof status.queue.reclaimCount === 'number',
    'queue.reclaimCount must be operator-visible.',
  );
  assert(
    Array.isArray(status.queue.recentDeadLetters),
    'queue.recentDeadLetters must be operator-visible.',
  );
  assert(
    typeof status.outbox.staleProcessing === 'number',
    'outbox.staleProcessing must be operator-visible.',
  );
  assert(
    typeof status.outbox.reclaimCount === 'number',
    'outbox.reclaimCount must be operator-visible.',
  );
  assert(
    Array.isArray(status.outbox.recentFailures),
    'outbox.recentFailures must be operator-visible.',
  );
  assert(
    status.retryResumeContract && typeof status.retryResumeContract === 'object',
    'retryResumeContract missing.',
  );
  assert(
    typeof status.retryResumeContract.deadLetterPolicy === 'string',
    'retryResumeContract.deadLetterPolicy missing.',
  );
}

function summarize(status: Record<string, any>) {
  return {
    deploymentProfile: status.deploymentProfile,
    runtimeMode: status.runtimeMode,
    taskTransportProvider: status.taskTransportProvider,
    eventTransportProvider: status.eventTransportProvider,
    queue: {
      pending: status.queue.pending,
      running: status.queue.running,
      dead: status.queue.dead,
      staleRunning: status.queue.staleRunning,
      reclaimCount: status.queue.reclaimCount,
      deadLetters: status.queue.recentDeadLetters.length,
    },
    outbox: {
      pending: status.outbox.pending,
      processing: status.outbox.processing,
      failed: status.outbox.failed,
      staleProcessing: status.outbox.staleProcessing,
      reclaimCount: status.outbox.reclaimCount,
      recentFailures: status.outbox.recentFailures.length,
    },
    diagnostics: {
      owningSubsystem: status.diagnostics?.owningSubsystem ?? null,
      nextInspection: status.diagnostics?.nextInspection ?? null,
    },
  };
}

async function main() {
  const sessionToken = await login();
  const status = await fetchAsyncStatus(sessionToken);
  validateStatus(status);
  console.log(JSON.stringify(summarize(status), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
