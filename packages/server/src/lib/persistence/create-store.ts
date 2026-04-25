import type { ServerConfig } from '../../config.js';
import { JsonStore, type SkillShareerStore } from '../store.js';
import { PostgresStore } from './postgres-store.js';

export function createSkillShareerStore(config: Pick<ServerConfig, 'dataFile' | 'databaseUrl'>): SkillShareerStore {
  if (config.databaseUrl) {
    return new PostgresStore({
      databaseUrl: config.databaseUrl,
    });
  }

  return new JsonStore(config.dataFile);
}
