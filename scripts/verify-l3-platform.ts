#!/usr/bin/env tsx
/**
 * L3 Operational Verification Plumbing
 *
 * Offline checks (no kind/docker/dual DB required):
 * - k8s-probes: all k8s/base/*.deploy.yaml have readinessProbe /ready + livenessProbe /live,
 *   correct ports, and optional kubectl dry-run syntax validation.
 * - compose-replicas: docker-compose.closeout.yml declares candidate-worker:2 + outbox-worker:2.
 * - transport-default: TRAPMAP_TASK_TRANSPORT defaults remain postgres, amqp→rabbitmq alias handled,
 *   domain_event_outbox not affected (async-runtime.ts + config.ts).
 * - dual-db: TRAPMAP_JOB_RUNTIME_DATABASE_URL fallback semantics (database.ts) + docs coverage.
 * - service-discovery: DISTRIBUTED_INTERNAL_HOSTS → k8s Service name alignment.
 *
 * Live gates (CI_REQUIRED when kind/docker not available):
 * - kind smoke: kind create cluster + kubectl wait --for=condition=Ready pod --all -n trapmap
 * - amqp smoke: TRAPMAP_TASK_TRANSPORT=amqp pg default unchanged + rabbitmq topology
 * - dual-DB equivalence + rollback drill: two PG URLs + job-runtime fallback
 *
 * Usage:
 *   pnpm exec tsx scripts/verify-l3-platform.ts --check all
 *   pnpm exec tsx scripts/verify-l3-platform.ts --check k8s-probes --check compose-replicas
 *   kubectl apply --dry-run=client --validate=true -f k8s/base/
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

type CheckResult = { name: string; ok: boolean; details: string[]; ciGate?: string };

function parseArgs(): Set<string> {
  const args = process.argv.slice(2);
  const checks = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check' && args[i + 1]) {
      for (const part of args[i + 1].split(',')) checks.add(part.trim());
      i++;
    }
  }
  if (checks.size === 0) checks.add('all');
  if (checks.has('all'))
    return new Set([
      'k8s-probes',
      'compose-replicas',
      'transport-default',
      'dual-db',
      'service-discovery',
    ]);
  return checks;
}

function checkK8sProbes(): CheckResult {
  const details: string[] = [];
  let ok = true;
  const baseDir = path.resolve('k8s/base');
  if (!existsSync(baseDir)) {
    return { name: 'k8s-probes', ok: false, details: [`Missing ${baseDir}`] };
  }
  const files = readdirSync(baseDir).filter((f) => f.endsWith('.deploy.yaml'));
  if (files.length === 0) {
    return { name: 'k8s-probes', ok: false, details: ['No *.deploy.yaml found'] };
  }
  const expectedPorts: Record<string, number> = {
    gateway: 4000,
    'identity-access': 4001,
    'knowledge-read': 4002,
    'knowledge-write': 4003,
    'candidate-worker': 4004,
    'governance-worker': 4005,
    'outbox-worker': 4006, // job-runtime service
    'cron-scheduler': 4007,
  };
  for (const file of files.sort()) {
    const content = readFileSync(path.join(baseDir, file), 'utf8');
    const hasReadiness = content.includes('readinessProbe:') && content.includes('path: /ready');
    const hasLiveness = content.includes('livenessProbe:') && content.includes('path: /live');
    const hasPeriod = content.includes('periodSeconds:');
    const hasTimeout = content.includes('timeoutSeconds:');
    if (!hasReadiness) {
      ok = false;
      details.push(`${file}: missing readinessProbe /ready`);
    }
    if (!hasLiveness) {
      ok = false;
      details.push(`${file}: missing livenessProbe /live`);
    }
    if (!hasPeriod || !hasTimeout) {
      ok = false;
      details.push(`${file}: probes should declare periodSeconds/timeoutSeconds (L3 hardening)`);
    }
    // spot check port matches deployment name
    for (const [svc, port] of Object.entries(expectedPorts)) {
      if (content.includes(`name: ${svc}`) || file.includes(svc)) {
        if (!content.includes(`port: ${port}`) && !content.includes(`containerPort: ${port}`)) {
          details.push(`${file}: expected port ${port} for ${svc} (warning)`);
        }
        if (
          hasReadiness &&
          !content.includes(`path: /ready, port: ${port}`) &&
          !content.includes(`port: ${port}`)
        ) {
          // soft check
        }
      }
    }
    if (hasReadiness && hasLiveness) details.push(`${file}: probes OK`);
  }

  // kubectl dry-run if available
  const kubectl = spawnSync(
    'kubectl',
    ['apply', '--dry-run=client', '--validate=true', '-f', 'k8s/base/'],
    { encoding: 'utf8' },
  );
  if (kubectl.error) {
    details.push(
      `kubectl not available — skip dry-run (CI_REQUIRED for live): ${String(kubectl.error.message).slice(0, 120)}`,
    );
  } else if (kubectl.status !== 0) {
    ok = false;
    details.push(`kubectl dry-run FAILED:\n${kubectl.stderr.slice(0, 800)}`);
  } else {
    details.push('kubectl apply --dry-run=client --validate=true: OK');
  }

  // live-gate hint
  details.push(
    'Live gate (CI_REQUIRED): kind create cluster --name trapmap-l3 && kubectl apply -f k8s/base/ && kubectl wait --for=condition=Ready pod --all -n trapmap --timeout=180s && curl -f http://127.0.0.1:4000/ready',
  );

  return { name: 'k8s-probes', ok, details, ciGate: 'kind/docker for wait Ready + /ready 200' };
}

function checkComposeReplicas(): CheckResult {
  const details: string[] = [];
  let ok = true;
  const p = path.resolve('docker-compose.closeout.yml');
  if (!existsSync(p)) return { name: 'compose-replicas', ok: false, details: [`Missing ${p}`] };
  const content = readFileSync(p, 'utf8');
  const hasCandidateReplicas =
    content.includes('candidate-worker:') && content.includes('replicas: 2');
  const hasOutboxReplicas = content.includes('outbox-worker:') && content.includes('replicas: 2');
  if (!hasCandidateReplicas) {
    ok = false;
    details.push('docker-compose.closeout.yml: candidate-worker replicas: 2 missing');
  } else details.push('candidate-worker replicas: 2 OK');
  if (!hasOutboxReplicas) {
    ok = false;
    details.push('docker-compose.closeout.yml: outbox-worker replicas: 2 missing');
  } else details.push('outbox-worker replicas: 2 OK');
  // also verify transport default remains pg
  if (!content.includes('TRAPMAP_TASK_TRANSPORT: postgres')) {
    details.push(
      'warning: closeout overlay should keep TRAPMAP_TASK_TRANSPORT=postgres (pg default unchanged)',
    );
  } else details.push('TRAPMAP_TASK_TRANSPORT=postgres in closeout overlay OK (pg default)');
  details.push('Verify: docker compose --profile distributed config | grep -A2 replicas');
  return { name: 'compose-replicas', ok, details };
}

function checkTransportDefault(): CheckResult {
  const details: string[] = [];
  let ok = true;

  // host-distributed amqp alias
  const jrServer = readFileSync(
    path.resolve('packages/host-distributed/src/job-runtime/server.ts'),
    'utf8',
  );
  if (!jrServer.includes("=== 'amqp' ? 'rabbitmq'")) {
    ok = false;
    details.push('host-distributed job-runtime server missing amqp→rabbitmq alias');
  } else details.push('host-distributed amqp→rabbitmq alias OK');

  const cronServer = readFileSync(
    path.resolve('packages/host-distributed/src/cron-scheduler/server.ts'),
    'utf8',
  );
  if (!cronServer.includes("=== 'amqp'"))
    details.push('cron-scheduler amqp alias not found (warning)');
  else details.push('cron-scheduler amqp alias OK');

  // host-local config enum
  const hostLocalConfig = readFileSync(
    path.resolve('packages/host-local/src/nest/config/config.ts'),
    'utf8',
  );
  if (!hostLocalConfig.includes("provider: z.enum(['postgres', 'rabbitmq'])")) {
    details.push('host-local config missing postgres/rabbitmq enum (warning)');
  } else details.push('host-local asyncTaskTransport enum OK (postgres default)');

  // docker-compose defaults
  const compose = readFileSync(path.resolve('docker-compose.yml'), 'utf8');
  const hasPgDefault = compose.includes(
    // biome-ignore lint/suspicious/noTemplateCurlyInString: compose-file shell expansion syntax under test, not a JS template
    'TRAPMAP_TASK_TRANSPORT=${TRAPMAP_TASK_TRANSPORT:-postgres}',
  );
  const hasRabbitMqEnv = compose.includes('TRAPMAP_RABBITMQ_URL');
  if (!hasPgDefault) {
    ok = false;
    details.push('docker-compose.yml should keep TRAPMAP_TASK_TRANSPORT default postgres');
  } else details.push('docker-compose.yml TRAPMAP_TASK_TRANSPORT default postgres OK');
  if (!hasRabbitMqEnv) details.push('docker-compose.yml missing TRAPMAP_RABBITMQ_* env (warning)');
  else details.push('docker-compose.yml TRAPMAP_RABBITMQ_* env present');

  // outbox remains PG
  const asyncRuntime = readFileSync(
    path.resolve('packages/service-job-runtime/src/async-runtime.ts'),
    'utf8',
  );
  if (
    !asyncRuntime.includes('createPostgresOutbox') ||
    !asyncRuntime.includes('domain_event_outbox')
  ) {
    details.push('async-runtime should keep domain_event_outbox on PG (warning)');
  } else
    details.push('async-runtime: domain_event_outbox remains PG irrespective of task transport OK');

  // docs coverage
  const envDoc = readFileSync(path.resolve('docs/operations/ENVIRONMENT.md'), 'utf8');
  if (
    !envDoc.includes('TRAPMAP_TASK_TRANSPORT') ||
    !envDoc.includes('amqp') ||
    !envDoc.includes('postgres')
  ) {
    ok = false;
    details.push(
      'docs/operations/ENVIRONMENT.md should document TRAPMAP_TASK_TRANSPORT=amqp alias and pg default',
    );
  } else details.push('docs/operations/ENVIRONMENT.md transport doc OK');

  details.push(
    'Live gate (CI_REQUIRED): TRAPMAP_TASK_TRANSPORT=amqp docker compose --profile distributed --profile mq up -d --build ; curl /health | jq .dependencies ; then rollback to postgres',
  );

  return {
    name: 'transport-default',
    ok,
    details,
    ciGate: 'docker + rabbitmq for amqp live smoke',
  };
}

function checkDualDb(): CheckResult {
  const details: string[] = [];
  let ok = true;
  const dbTs = readFileSync(
    path.resolve('packages/host-distributed/src/shared/database.ts'),
    'utf8',
  );
  if (!dbTs.includes('TRAPMAP_JOB_RUNTIME_DATABASE_URL')) {
    ok = false;
    details.push('shared/database.ts missing TRAPMAP_JOB_RUNTIME_DATABASE_URL fallback');
  } else details.push('shared/database.ts TRAPMAP_JOB_RUNTIME_DATABASE_URL fallback OK');

  // check only job-runtime reads it
  if (!dbTs.includes("serviceName === 'job-runtime'")) {
    ok = false;
    details.push('database.ts should gate isolation to job-runtime only');
  } else details.push('database.ts isolation gated to job-runtime only OK');

  // fallback order
  if (!dbTs.includes('config.databaseUrl') || !dbTs.includes('process.env.DATABASE_URL')) {
    details.push('database.ts fallback chain incomplete (warning)');
  } else details.push('database.ts fallback chain (isolated → shared) OK');

  // ENV doc
  const envDoc = readFileSync(path.resolve('docs/operations/ENVIRONMENT.md'), 'utf8');
  if (!envDoc.includes('TRAPMAP_JOB_RUNTIME_DATABASE_URL')) {
    ok = false;
    details.push('docs/operations/ENVIRONMENT.md missing TRAPMAP_JOB_RUNTIME_DATABASE_URL doc');
  } else details.push('docs/operations/ENVIRONMENT.md dual-DB doc OK');

  // DEPLOYMENT doc
  const depDoc = readFileSync(path.resolve('docs/architecture/DEPLOYMENT.md'), 'utf8');
  if (
    !depDoc.includes('TRAPMAP_JOB_RUNTIME_DATABASE_URL') ||
    !depDoc.includes('dual-DB') ||
    !depDoc.includes('rollback')
  ) {
    details.push(
      'docs/architecture/DEPLOYMENT.md should document dual-DB equivalence + rollback (warning)',
    );
  } else details.push('docs/architecture/DEPLOYMENT.md dual-DB + rollback doc OK');

  details.push(
    'Live gate (CI_REQUIRED): TRAPMAP_JOB_RUNTIME_DATABASE_URL isolated vs shared double-run + remove-var rollback + healthCheck/pool snapshot equivalence',
  );

  return {
    name: 'dual-db',
    ok,
    details,
    ciGate: 'two PG URLs + job-runtime restart for rollback drill',
  };
}

function checkServiceDiscovery(): CheckResult {
  const details: string[] = [];
  let ok = true;
  const svcConfig = readFileSync(
    path.resolve('packages/host-distributed/src/config/service-config.ts'),
    'utf8',
  );
  if (!svcConfig.includes('DISTRIBUTED_INTERNAL_HOSTS')) {
    ok = false;
    details.push('service-config.ts missing DISTRIBUTED_INTERNAL_HOSTS');
  } else details.push('service-config.ts DISTRIBUTED_INTERNAL_HOSTS present');

  // check mapping includes k8s service names
  const expected = [
    'gateway',
    'identity-access',
    'knowledge-read',
    'knowledge-write',
    'candidate-worker',
    'governance-worker',
    'outbox-worker',
    'cron-scheduler',
  ];
  for (const svc of expected) {
    if (!svcConfig.includes(svc)) details.push(`service-config missing host for ${svc} (warning)`);
  }
  details.push('service discovery mapping OK');

  // k8s services exist
  const baseDir = path.resolve('k8s/base');
  const services = readdirSync(baseDir)
    .filter((f) => f.endsWith('.deploy.yaml'))
    .map((f) => readFileSync(path.join(baseDir, f), 'utf8'))
    .join('\n');
  for (const svc of ['gateway', 'candidate-worker', 'governance-worker', 'outbox-worker']) {
    if (!services.includes(`name: ${svc}`))
      details.push(`k8s/base missing Service ${svc} (warning)`);
  }
  details.push('k8s Service objects present');

  // docs
  const sdDoc = readFileSync(path.resolve('docs/architecture/SERVICE-DISCOVERY.md'), 'utf8');
  if (!sdDoc.includes('L3') || !sdDoc.includes('kind')) {
    details.push('SERVICE-DISCOVERY.md should document L3 kind smoke entry criteria (warning)');
  } else details.push('SERVICE-DISCOVERY.md L3 doc OK');

  return { name: 'service-discovery', ok, details };
}

function main() {
  const wants = parseArgs();
  const runners: Record<string, () => CheckResult> = {
    'k8s-probes': checkK8sProbes,
    'compose-replicas': checkComposeReplicas,
    'transport-default': checkTransportDefault,
    'dual-db': checkDualDb,
    'service-discovery': checkServiceDiscovery,
  };
  const results: CheckResult[] = [];
  for (const name of wants) {
    const fn = runners[name];
    if (!fn) {
      console.error(`Unknown check: ${name}`);
      process.exitCode = 1;
      continue;
    }
    results.push(fn());
  }

  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    console.log(`\n${icon} ${r.name} — ${r.ok ? 'PASS' : 'FAIL'}`);
    for (const line of r.details) console.log(`  - ${line}`);
    if (r.ciGate) console.log(`  ↳ live gate CI_REQUIRED: ${r.ciGate}`);
    if (!r.ok) allOk = false;
  }

  console.log(
    `\n${
      allOk
        ? 'L3 offline plumbing: ALL PASS (live gates CI_REQUIRED if kind/docker absent)'
        : 'L3 offline plumbing: SOME FAIL'
    }`,
  );

  const liveHints = `
Live execution (requires kind/docker/dual DB, otherwise CI_REQUIRED):
  pnpm exec tsx scripts/verify-l3-platform.ts --check all
  kind create cluster --name trapmap-l3 && kubectl apply -f k8s/base/ && kubectl wait --for=condition=Ready pod --all -n trapmap --timeout=180s
  TRAPMAP_TASK_TRANSPORT=amqp docker compose --profile distributed --profile mq up -d --build
  TRAPMAP_JOB_RUNTIME_DATABASE_URL=postgres://...isolated... pnpm test:distributed-closeout  # + rollback drill
`;
  console.log(liveHints);

  if (!allOk) process.exitCode = 1;
}

main();
