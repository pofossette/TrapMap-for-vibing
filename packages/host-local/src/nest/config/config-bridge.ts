import { loadConfig, type ServerConfig } from './config.js';

export interface NestConfigBridge {
  serverConfig: ServerConfig;
}

export function loadServerConfigBridge(): NestConfigBridge {
  return {
    serverConfig: loadConfig(),
  };
}

export const SERVER_CONFIG_TOKEN = 'SERVER_CONFIG';
