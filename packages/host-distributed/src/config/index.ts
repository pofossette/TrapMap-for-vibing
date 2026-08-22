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
  resolveInternalTimeoutMs,
  serviceNameForInternalHost,
} from './service-config.js';
