/**
 * Shared configuration for distributed host services.
 *
 * Loads service-specific configuration from environment variables.
 * Each service process reads its own TRAPMAP_SERVICE_NAME to determine
 * which service it is, and uses service-specific or shared database URLs.
 */

// ---------------------------------------------------------------------------
// Environment variable names
// ---------------------------------------------------------------------------

const ENV_SERVICE_NAME = 'TRAPMAP_SERVICE_NAME';
const ENV_SERVICE_PORT = 'TRAPMAP_SERVICE_PORT';
const ENV_DATABASE_URL = 'DATABASE_URL';
const ENV_LEGACY_DATABASE_URL = 'TRAPMAP_DATABASE_URL';
const ENV_SERVICE_DATABASE_URL = 'TRAPMAP_SERVICE_DATABASE_URL';
const ENV_GATEWAY_URL = 'TRAPMAP_GATEWAY_URL';
const ENV_IDENTITY_ACCESS_URL = 'TRAPMAP_IDENTITY_ACCESS_URL';
const ENV_KNOWLEDGE_READ_URL = 'TRAPMAP_KNOWLEDGE_READ_URL';
const ENV_KNOWLEDGE_WRITE_URL = 'TRAPMAP_KNOWLEDGE_WRITE_URL';
const ENV_CANDIDATE_INGESTION_URL = 'TRAPMAP_CANDIDATE_INGESTION_URL';
const ENV_GOVERNANCE_REVIEW_URL = 'TRAPMAP_GOVERNANCE_REVIEW_URL';
const ENV_JOB_RUNTIME_URL = 'TRAPMAP_JOB_RUNTIME_URL';
const ENV_CRON_SCHEDULER_URL = 'TRAPMAP_CRON_SCHEDULER_URL';
const ENV_KNOWLEDGE_WRITE_TRANSPORT = 'TRAPMAP_KNOWLEDGE_WRITE_TRANSPORT';
const ENV_LOG_LEVEL = 'TRAPMAP_LOG_LEVEL';
const ENV_DEPLOYMENT_PROFILE = 'TRAPMAP_DEPLOYMENT_PROFILE';
const ENV_CONSUL_ENABLED = 'CONSUL_ENABLED';
const ENV_CONSUL_HOST = 'CONSUL_HOST';
const ENV_CONSUL_PORT = 'CONSUL_PORT';
const ENV_SERVICE_ADVERTISE_HOST = 'TRAPMAP_SERVICE_ADVERTISE_HOST';
const ENV_SERVICE_POOL_SIZE = 'TRAPMAP_SERVICE_POOL_SIZE';
const ENV_SERVICE_IDLE_TIMEOUT_MS = 'TRAPMAP_SERVICE_IDLE_TIMEOUT_MS';
const ENV_SERVICE_CONNECTION_TIMEOUT_MS = 'TRAPMAP_SERVICE_CONNECTION_TIMEOUT_MS';
const ENV_SERVICE_STATEMENT_TIMEOUT_MS = 'TRAPMAP_SERVICE_STATEMENT_TIMEOUT_MS';
const ENV_SERVICE_QUERY_TIMEOUT_MS = 'TRAPMAP_SERVICE_QUERY_TIMEOUT_MS';
const ENV_SERVICE_IDLE_IN_TRANSACTION_TIMEOUT_MS = 'TRAPMAP_SERVICE_IDLE_IN_TRANSACTION_TIMEOUT_MS';
const ENV_DATABASE_CONNECTION_BUDGET = 'TRAPMAP_DATABASE_CONNECTION_BUDGET';
const ENV_SYSTEM_ADMIN_KEY = 'TRAPMAP_SYSTEM_ADMIN_KEY';

// ---------------------------------------------------------------------------
// Service names
// ---------------------------------------------------------------------------

export type ServiceName =
  | 'gateway'
  | 'identity-access'
  | 'knowledge-read'
  | 'knowledge-write'
  | 'candidate-ingestion'
  | 'governance-review'
  | 'job-runtime'
  | 'cron-scheduler';

export const ALL_SERVICES: readonly ServiceName[] = [
  'gateway',
  'identity-access',
  'knowledge-read',
  'knowledge-write',
  'candidate-ingestion',
  'governance-review',
  'job-runtime',
  'cron-scheduler',
];

// ---------------------------------------------------------------------------
// Default ports per service
// ---------------------------------------------------------------------------

const DEFAULT_PORTS: Record<ServiceName, number> = {
  gateway: 4000,
  'identity-access': 4001,
  'knowledge-read': 4002,
  'knowledge-write': 4003,
  'candidate-ingestion': 4004,
  'governance-review': 4005,
  'job-runtime': 4006,
  'cron-scheduler': 4007,
};

const DEFAULT_INTERNAL_HOSTS: Record<ServiceName, string> = {
  gateway: 'localhost',
  'identity-access': 'localhost',
  'knowledge-read': 'localhost',
  'knowledge-write': 'localhost',
  'candidate-ingestion': 'localhost',
  'governance-review': 'localhost',
  'job-runtime': 'localhost',
  'cron-scheduler': 'localhost',
};

const DISTRIBUTED_INTERNAL_HOSTS: Record<ServiceName, string> = {
  gateway: 'gateway',
  'identity-access': 'identity-access',
  'knowledge-read': 'knowledge-read',
  'knowledge-write': 'knowledge-write',
  'candidate-ingestion': 'candidate-worker',
  'governance-review': 'governance-worker',
  'job-runtime': 'outbox-worker',
  'cron-scheduler': 'cron-scheduler',
};

// ---------------------------------------------------------------------------
// Internal service URLs (defaults assume all on localhost)
// ---------------------------------------------------------------------------

export interface InternalServiceUrls {
  gateway: string;
  identityAccess: string;
  knowledgeRead: string;
  knowledgeWrite: string;
  candidateIngestion: string;
  review: string;
  governanceReview: string;
  jobRuntime: string;
  cronScheduler: string;
}

export type InternalTransportKind = 'http' | 'rpc';

export interface InternalServiceTransports {
  knowledgeWrite: InternalTransportKind;
}

function defaultInternalUrls(): InternalServiceUrls {
  return buildInternalUrls(DEFAULT_INTERNAL_HOSTS);
}

function distributedInternalUrls(): InternalServiceUrls {
  return buildInternalUrls(DISTRIBUTED_INTERNAL_HOSTS);
}

function buildInternalUrls(hosts: Record<ServiceName, string>): InternalServiceUrls {
  return {
    gateway: `http://${hosts.gateway}:${DEFAULT_PORTS.gateway}`,
    identityAccess: `http://${hosts['identity-access']}:${DEFAULT_PORTS['identity-access']}`,
    knowledgeRead: `http://${hosts['knowledge-read']}:${DEFAULT_PORTS['knowledge-read']}`,
    knowledgeWrite: `http://${hosts['knowledge-write']}:${DEFAULT_PORTS['knowledge-write']}`,
    candidateIngestion: `http://${hosts['candidate-ingestion']}:${DEFAULT_PORTS['candidate-ingestion']}`,
    review: `http://${hosts['governance-review']}:${DEFAULT_PORTS['governance-review']}`,
    governanceReview: `http://${hosts['governance-review']}:${DEFAULT_PORTS['governance-review']}`,
    jobRuntime: `http://${hosts['job-runtime']}:${DEFAULT_PORTS['job-runtime']}`,
    cronScheduler: `http://${hosts['cron-scheduler']}:${DEFAULT_PORTS['cron-scheduler']}`,
  };
}

// fallow-ignore-next-line unused-type -- exported config type for runtime consumers
export type ServiceDiscoveryMode = 'localhost-defaults' | 'docker-dns';

function resolveServiceDiscoveryMode(): ServiceDiscoveryMode {
  return process.env[ENV_DEPLOYMENT_PROFILE] === 'distributed'
    ? 'docker-dns'
    : 'localhost-defaults';
}

function resolveDefaultInternalUrls(mode = resolveServiceDiscoveryMode()): InternalServiceUrls {
  return mode === 'docker-dns' ? distributedInternalUrls() : defaultInternalUrls();
}

function resolveDefaultAdvertiseHost(
  serviceName: ServiceName,
  mode = resolveServiceDiscoveryMode(),
): string {
  return mode === 'docker-dns'
    ? DISTRIBUTED_INTERNAL_HOSTS[serviceName]
    : DEFAULT_INTERNAL_HOSTS[serviceName];
}

// ---------------------------------------------------------------------------
// Service configuration
// ---------------------------------------------------------------------------

export interface ServiceConfig {
  serviceName: ServiceName;
  port: number;
  host: string;
  advertiseHost: string;
  logLevel: string;
  systemAdminKey: string | null;

  /** Database URL for this specific service (falls back to DATABASE_URL). */
  databaseUrl: string | null;

  /** Pool size for this service's connection pool. */
  poolSize: number;

  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
  queryTimeoutMs: number;
  idleInTransactionTimeoutMs: number;
  connectionBudget: number;

  /** Internal URLs for inter-service communication. */
  internalUrls: InternalServiceUrls;

  /** Transport seam for selected high-frequency internal owner hops. */
  internalTransports: InternalServiceTransports;

  /** Whether Consul-backed service discovery is enabled. */
  consulEnabled: boolean;

  /** Consul HTTP API address (e.g. http://localhost:8500). */
  consulAddress: string;
}

function envKeyForServicePoolSize(serviceName: ServiceName): string {
  return `TRAPMAP_${serviceName.replace(/-/g, '_').toUpperCase()}_POOL_SIZE`;
}

function resolvePoolSize(serviceName: ServiceName): number {
  const specific = process.env[envKeyForServicePoolSize(serviceName)];
  const shared = process.env[ENV_SERVICE_POOL_SIZE];
  const rawValue = specific ?? shared;
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return 5;
}

function resolveTimeout(
  serviceName: ServiceName,
  suffix: string,
  sharedKey: string,
  fallback: number,
): number {
  const specific = process.env[`TRAPMAP_${serviceName.replace(/-/g, '_').toUpperCase()}_${suffix}`];
  const shared = process.env[sharedKey];
  const parsed = Number.parseInt(specific ?? shared ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveConnectionBudget(): number {
  const parsed = Number.parseInt(process.env[ENV_DATABASE_CONNECTION_BUDGET] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

export interface DistributedConnectionBudgetSnapshot {
  configured: number;
  budget: number;
  withinBudget: boolean;
}

export function getDistributedConnectionBudgetSnapshot(): DistributedConnectionBudgetSnapshot {
  const configured = ALL_SERVICES.filter((serviceName) => serviceName !== 'gateway').reduce(
    (total, serviceName) => total + resolvePoolSize(serviceName),
    0,
  );
  const budget = resolveConnectionBudget();
  return { configured, budget, withinBudget: configured <= budget };
}

export function assertDistributedConnectionBudget(): void {
  const snapshot = getDistributedConnectionBudgetSnapshot();
  if (!snapshot.withinBudget) {
    throw new Error(
      `Configured distributed PostgreSQL pools (${snapshot.configured}) exceed connection budget (${snapshot.budget})`,
    );
  }
}

function resolveKnowledgeWriteTransport(): InternalTransportKind {
  return process.env[ENV_KNOWLEDGE_WRITE_TRANSPORT] === 'rpc' ? 'rpc' : 'http';
}

// fallow-ignore-next-line complexity -- flat env aggregation for a single ServiceConfig shape; splitting would add indirection without reducing decision count meaningfully
export function loadServiceConfig(serviceName?: ServiceName): ServiceConfig {
  const name: ServiceName =
    serviceName ?? (process.env[ENV_SERVICE_NAME] as ServiceName) ?? 'gateway';

  const port = process.env[ENV_SERVICE_PORT]
    ? Number.parseInt(process.env[ENV_SERVICE_PORT], 10)
    : DEFAULT_PORTS[name];

  const databaseUrl =
    process.env[ENV_SERVICE_DATABASE_URL] ??
    process.env[ENV_DATABASE_URL] ??
    process.env[ENV_LEGACY_DATABASE_URL] ??
    null;

  const defaults = resolveDefaultInternalUrls();

  const consulHost = process.env[ENV_CONSUL_HOST] ?? 'localhost';
  const consulPort = process.env[ENV_CONSUL_PORT] ?? '8500';
  const consulAddress = `http://${consulHost}:${consulPort}`;
  const advertiseHost =
    process.env[ENV_SERVICE_ADVERTISE_HOST] ?? resolveDefaultAdvertiseHost(name);

  return {
    serviceName: name,
    port,
    host: '0.0.0.0',
    advertiseHost,
    logLevel: process.env[ENV_LOG_LEVEL] ?? 'info',
    systemAdminKey: process.env[ENV_SYSTEM_ADMIN_KEY] ?? null,
    databaseUrl,
    poolSize: resolvePoolSize(name),
    idleTimeoutMs: resolveTimeout(name, 'IDLE_TIMEOUT_MS', ENV_SERVICE_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMs: resolveTimeout(
      name,
      'CONNECTION_TIMEOUT_MS',
      ENV_SERVICE_CONNECTION_TIMEOUT_MS,
      5_000,
    ),
    statementTimeoutMs: resolveTimeout(
      name,
      'STATEMENT_TIMEOUT_MS',
      ENV_SERVICE_STATEMENT_TIMEOUT_MS,
      30_000,
    ),
    queryTimeoutMs: resolveTimeout(name, 'QUERY_TIMEOUT_MS', ENV_SERVICE_QUERY_TIMEOUT_MS, 30_000),
    idleInTransactionTimeoutMs: resolveTimeout(
      name,
      'IDLE_IN_TRANSACTION_TIMEOUT_MS',
      ENV_SERVICE_IDLE_IN_TRANSACTION_TIMEOUT_MS,
      30_000,
    ),
    connectionBudget: resolveConnectionBudget(),
    internalUrls: {
      gateway: process.env[ENV_GATEWAY_URL] ?? defaults.gateway,
      identityAccess: process.env[ENV_IDENTITY_ACCESS_URL] ?? defaults.identityAccess,
      knowledgeRead: process.env[ENV_KNOWLEDGE_READ_URL] ?? defaults.knowledgeRead,
      knowledgeWrite: process.env[ENV_KNOWLEDGE_WRITE_URL] ?? defaults.knowledgeWrite,
      candidateIngestion: process.env[ENV_CANDIDATE_INGESTION_URL] ?? defaults.candidateIngestion,
      review: process.env[ENV_GOVERNANCE_REVIEW_URL] ?? defaults.review,
      governanceReview: process.env[ENV_GOVERNANCE_REVIEW_URL] ?? defaults.governanceReview,
      jobRuntime: process.env[ENV_JOB_RUNTIME_URL] ?? defaults.jobRuntime,
      cronScheduler: process.env[ENV_CRON_SCHEDULER_URL] ?? defaults.cronScheduler,
    },
    internalTransports: {
      knowledgeWrite: resolveKnowledgeWriteTransport(),
    },
    consulEnabled: process.env[ENV_CONSUL_ENABLED] === 'true',
    consulAddress,
  };
}
