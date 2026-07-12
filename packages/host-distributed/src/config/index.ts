/**
 * Configuration barrel export.
 */

export {
  type ServiceName,
  type ServiceConfig,
  type InternalServiceUrls,
  type InternalTransportKind,
  ALL_SERVICES,
  assertDistributedConnectionBudget,
  getDistributedConnectionBudgetSnapshot,
  loadServiceConfig,
} from './service-config.js';
