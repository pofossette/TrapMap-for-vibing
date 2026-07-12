import type { ServiceName } from '../config/index.js';

export type DatabaseWriteService = ServiceName | 'server-compatibility-seam';

export type DatabaseTableFamily =
  | 'identity'
  | 'knowledge'
  | 'candidate'
  | 'governance'
  | 'job-runtime'
  | 'knowledge-read-projection'
  | 'audit'
  | 'compatibility';

const DATABASE_WRITE_OWNERS: Record<DatabaseTableFamily, DatabaseWriteService> = {
  identity: 'identity-access',
  knowledge: 'knowledge-write',
  candidate: 'candidate-ingestion',
  governance: 'governance-review',
  'job-runtime': 'job-runtime',
  'knowledge-read-projection': 'knowledge-read',
  audit: 'server-compatibility-seam',
  compatibility: 'server-compatibility-seam',
};

export class DatabaseOwnershipError extends Error {
  constructor(serviceName: DatabaseWriteService, tableFamily: DatabaseTableFamily) {
    super(
      `Database write denied: ${DATABASE_WRITE_OWNERS[tableFamily]} owns ${tableFamily}, not ${serviceName}`,
    );
    this.name = 'DatabaseOwnershipError';
  }
}

export function getDatabaseWriteOwner(tableFamily: DatabaseTableFamily): DatabaseWriteService {
  return DATABASE_WRITE_OWNERS[tableFamily];
}

export function assertDatabaseWriteOwner(
  serviceName: DatabaseWriteService,
  tableFamily: DatabaseTableFamily,
): void {
  const owner = getDatabaseWriteOwner(tableFamily);
  if (serviceName !== owner && serviceName !== 'server-compatibility-seam') {
    throw new DatabaseOwnershipError(serviceName, tableFamily);
  }
}

const MUTATING_REPOSITORY_METHODS = new Set([
  'insert',
  'update',
  'delete',
  'create',
  'save',
  'supersede',
  'updateLifecycle',
  'appendRevision',
  'appendLifecycleEvent',
  'updateGovernance',
  'updateEmbeddingCache',
  'revoke',
  'updateActiveTeam',
  'nextId',
]);

export function withDatabaseWriteGuard<T extends object>(
  repository: T,
  serviceName: DatabaseWriteService,
  tableFamily: DatabaseTableFamily,
): T {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || !MUTATING_REPOSITORY_METHODS.has(property)) {
        return value;
      }

      return (...args: unknown[]) => {
        assertDatabaseWriteOwner(serviceName, tableFamily);
        return value.apply(target, args);
      };
    },
  });
}
