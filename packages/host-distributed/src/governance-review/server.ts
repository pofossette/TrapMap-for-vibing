import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import {
  type GovernanceReviewServer,
  createGovernanceReviewServer as createServiceGovernanceReviewServer,
} from '@trapmap/service-governance-review';
import { createGovernanceReviewDeps } from './ports.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<GovernanceReviewServer> {
  const ports = createServicePorts(db.pool);
  const deps = createGovernanceReviewDeps(ports, config);
  return createServiceGovernanceReviewServer(config, deps);
}
