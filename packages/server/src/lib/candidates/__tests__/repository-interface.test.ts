import type { CandidateRepository } from '@trapmap/server/lib/candidates/repository.js';

import { describe, expect, it, vi } from 'vitest';

describe('CandidateRepository interface', () => {
  it('exports an interface with 9 async methods', async () => {
    // Create a stub implementation to verify the interface shape
    const repo: CandidateRepository = {
      insert: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn().mockResolvedValue(null),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      attachAnalysis: vi.fn().mockResolvedValue(undefined),
      attachDuplicateCase: vi.fn().mockResolvedValue(undefined),
      attachManualResult: vi.fn().mockResolvedValue(undefined),
      listByStatus: vi.fn().mockResolvedValue([]),
      markResolved: vi.fn().mockResolvedValue(undefined),
      findByFingerprint: vi.fn().mockResolvedValue(null),
    };

    // Verify all methods exist and are functions
    expect(typeof repo.insert).toBe('function');
    expect(typeof repo.getById).toBe('function');
    expect(typeof repo.updateStatus).toBe('function');
    expect(typeof repo.attachAnalysis).toBe('function');
    expect(typeof repo.attachDuplicateCase).toBe('function');
    expect(typeof repo.attachManualResult).toBe('function');
    expect(typeof repo.listByStatus).toBe('function');
    expect(typeof repo.markResolved).toBe('function');
    expect(typeof repo.findByFingerprint).toBe('function');

    // Verify all methods return promises
    await expect(repo.insert({} as any)).resolves.toBeUndefined();
    await expect(repo.getById('test')).resolves.toBeNull();
    await expect(repo.updateStatus('test', 'queued')).resolves.toBeUndefined();
    await expect(repo.attachAnalysis('test', {} as any)).resolves.toBeUndefined();
    await expect(repo.attachDuplicateCase('test', {} as any)).resolves.toBeUndefined();
    await expect(repo.attachManualResult('test', {} as any, 'user')).resolves.toBeUndefined();
    await expect(repo.listByStatus('received')).resolves.toEqual([]);
    await expect(repo.markResolved('test', 'user')).resolves.toBeUndefined();
    await expect(repo.findByFingerprint('abc123')).resolves.toBeNull();
  });
});
