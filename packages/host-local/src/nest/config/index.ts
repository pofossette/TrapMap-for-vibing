import {
  DEFAULT_CONSUL_CHECK_INTERVAL,
  DEFAULT_CONSUL_CHECK_TIMEOUT,
  type HostLocalConfig,
  loadConfig,
} from './config.js';

export function loadHostLocalConfig(): HostLocalConfig {
  return loadConfig();
}

export const HOST_LOCAL_CONFIG_TOKEN = 'HOST_LOCAL_CONFIG';
export type { HostLocalConfig };
export { DEFAULT_CONSUL_CHECK_INTERVAL, DEFAULT_CONSUL_CHECK_TIMEOUT };
