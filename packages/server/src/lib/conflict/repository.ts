import type { ConflictRelation } from '@trapmap/contracts';
import type { Pool } from 'pg';

import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

export interface ConflictRepository {
  listAll(): Promise<ConflictRelation[]>;
}

export class InMemoryConflictRepository implements ConflictRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async listAll(): Promise<ConflictRelation[]> {
    const data = await this.store.snapshot();
    return data.conflicts;
  }
}

export function createConflictRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): ConflictRepository {
  void config.pool;
  return new InMemoryConflictRepository(config.store);
}
