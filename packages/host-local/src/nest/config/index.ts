import { loadConfig, type HostLocalConfig } from './config.js';

export function loadHostLocalConfig(): HostLocalConfig {
  return loadConfig();
}

export const HOST_LOCAL_CONFIG_TOKEN = 'HOST_LOCAL_CONFIG';
export type { HostLocalConfig };
