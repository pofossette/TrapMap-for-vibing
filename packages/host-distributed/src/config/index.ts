/**
 * Configuration barrel export.
 */

export {
  type ServiceName,
  type ServiceConfig,
  type ServiceDiscoveryMode,
  type InternalServiceUrls,
  ALL_SERVICES,
  loadServiceConfig,
  resolveDefaultInternalUrls,
  resolveServiceDiscoveryMode,
} from './service-config.js';
