import { describe, expect, it } from 'vitest';
import * as schema from '../src/schema/index.js';

describe('db schema integrity', () => {
  it('exports all expected tables', () => {
    // Spot-check a few tables from each domain
    expect(schema.knowledgeEntries).toBeDefined();
    expect(schema.skillArtifacts).toBeDefined();
    expect(schema.candidates).toBeDefined();
    expect(schema.usersTable).toBeDefined();
    expect(schema.taskQueue).toBeDefined();
    expect(schema.experienceGenes).toBeDefined();
    expect(schema.cronJobs).toBeDefined();
  });

  it('exposes column factories', () => {
    expect(schema.auditTimestamps).toBeDefined();
    expect(typeof schema.auditTimestamps).toBe('function');
  });

  it('creates drizzle client without throwing', async () => {
    const { createDb } = await import('../src/client.js');
    // Use a mock pool that does nothing — just verify the factory builds a drizzle instance
    const mockPool = { query: async () => ({ rows: [] }) } as any;
    const db = createDb(mockPool);
    expect(db).toBeDefined();
  });
});
