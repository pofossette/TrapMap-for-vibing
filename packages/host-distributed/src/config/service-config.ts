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
const ENV_SERVICE_DATABASE_URL = 'TRAPMAP_SERVICE_DATABASE_URL';
const ENV_GATEWAY_URL = 'TRAPMAP_GATEWAY_URL';
const ENV_IDENTITY_ACCESS_URL = 'TRAPMAP_IDENTITY_ACCESS_URL';
const ENV_KNOWLEDGE_READ_URL = 'TRAPMAP_KNOWLEDGE_READ_URL';
const ENV_KNOWLEDGE_WRITE_URL = 'TRAPMAP_KNOWLEDGE_WRITE_URL';
const ENV_CANDIDATE_INGESTION_URL = 'TRAPMAP_CANDIDATE_INGESTION_URL';
const ENV_GOVERNANCE_REVIEW_URL = 'TRAPMAP_GOVERNANCE_REVIEW_URL';
const ENV_JOB_RUNTIME_URL = 'TRAPMAP_JOB_RUNTIME_URL';
const ENV_LOG_LEVEL = 'TRAPMAP_LOG_LEVEL';

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
  | 'job-runtime';

export const ALL_SERVICES: readonly ServiceName[] = [
  'gateway',
  'identity-access',
  'knowledge-read',
  'knowledge-write',
  'candidate-ingestion',
  'governance-review',
  'job-runtime',
];

// ---------------------------------------------------------------------------
// Default ports per service
// ---------------------------------------------------------------------------

const DEFAULT_PORTS: Record<ServiceName, number> = {
  'gateway': 3000,
  'identity-access': 3001,
  'knowledge-read': 3002,
  'knowledge-write': 3003,
  'candidate-ingestion': 3004,
  'governance-review': 3005,
  'job-runtime': 3006,
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
  governanceReview: string;
  jobRuntime: string;
}

function defaultInternalUrls(): InternalServiceUrls {
  return {
    gateway: `http://localhost:${DEFAULT_PORTS.gateway}`,
    identityAccess: `http://localhost:${DEFAULT_PORTS['identity-access']}`,
    knowledgeRead: `http://localhost:${DEFAULT_PORTS['knowledge-read']}`,
    knowledgeWrite: `http://localhost:${DEFAULT_PORTS['knowledge-write']}`,
    candidateIngestion: `http://localhost:${DEFAULT_PORTS['candidate-ingestion']}`,
    governanceReview: `http://localhost:${DEFAULT_PORTS['governance-review']}`,
    jobRuntime: `http://localhost:${DEFAULT_PORTS['job-runtime']}`,
  };
}

// ---------------------------------------------------------------------------
// Service configuration
// ---------------------------------------------------------------------------

export interface ServiceConfig {
  serviceName: ServiceName;
  port: number;
  host: string;
  logLevel: string;

  /** Database URL for this specific service (falls back to DATABASE_URL). */
  databaseUrl: string | null;

  /** Pool size for this service's connection pool. */
  poolSize: number;

  /** Internal URLs for inter-service communication. */
  internalUrls: InternalServiceUrls;
}

export function loadServiceConfig(serviceName?: ServiceName): ServiceConfig {
  const name: ServiceName =
    serviceName ?? (process.env[ENV_SERVICE_NAME] as ServiceName) ?? 'gateway';

  const port = process.env[ENV_SERVICE_PORT]
    ? Number.parseInt(process.env[ENV_SERVICE_PORT], 10)
    : DEFAULT_PORTS[name];

  const databaseUrl =
    process.env[ENV_SERVICE_DATABASE_URL] ?? process.env[ENV_DATABASE_URL] ?? null;

  const defaults = defaultInternalUrls();

  return {
    serviceName: name,
    port,
    host: '0.0.0.0',
    logLevel: process.env[ENV_LOG_LEVEL] ?? 'info',
    databaseUrl,
    poolSize: 5,
    internalUrls: {
      gateway: process.env[ENV_GATEWAY_URL] ?? defaults.gateway,
      identityAccess: process.env[ENV_IDENTITY_ACCESS_URL] ?? defaults.identityAccess,
      knowledgeRead: process.env[ENV_KNOWLEDGE_READ_URL] ?? defaults.knowledgeRead,
      knowledgeWrite: process.env[ENV_KNOWLEDGE_WRITE_URL] ?? defaults.knowledgeWrite,
      candidateIngestion: process.env[ENV_CANDIDATE_INGESTION_URL] ?? defaults.candidateIngestion,
      governanceReview: process.env[ENV_GOVERNANCE_REVIEW_URL] ?? defaults.governanceReview,
      jobRuntime: process.env[ENV_JOB_RUNTIME_URL] ?? defaults.jobRuntime,
    },
  };
}
