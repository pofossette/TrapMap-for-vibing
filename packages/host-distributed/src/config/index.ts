/**
 * Configuration barrel export.
 */

export {
  ALL_SERVICES,
  assertDistributedConnectionBudget,
  assertDistributedResilienceConfig,
  getDistributedConnectionBudgetSnapshot,
  type InternalServiceUrls,
  type InternalTransportKind,
  loadServiceConfig,
  resolveInternalTimeoutMs,
  type ServiceConfig,
  type ServiceName,
  serviceNameForInternalHost,
} from './service-config.js';
