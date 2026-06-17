import { describe, expect, it } from 'vitest';

import { getServiceUnitProfile, resolveServiceUnit } from './service-unit.js';

describe('service unit profiles', () => {
  it('defaults unknown service units to full-platform', () => {
    expect(resolveServiceUnit('unknown-unit')).toBe('full-platform');
    expect(resolveServiceUnit(undefined)).toBe('full-platform');
  });

  it('candidate-ingestion owns candidate task workers but not shared jobs or outbox', () => {
    const profile = getServiceUnitProfile('candidate-ingestion', 'combined');

    expect(profile).toEqual({
      name: 'candidate-ingestion',
      ownsCandidateTaskWork: true,
      ownsSharedJobTaskWork: false,
      ownsOutboxWork: false,
    });
  });

  it('knowledge-governance owns shared jobs and outbox but not candidate task workers', () => {
    const profile = getServiceUnitProfile('knowledge-governance', 'combined');

    expect(profile).toEqual({
      name: 'knowledge-governance',
      ownsCandidateTaskWork: false,
      ownsSharedJobTaskWork: true,
      ownsOutboxWork: true,
    });
  });

  it('api runtime does not own work for rehearsal units', () => {
    const candidateApi = getServiceUnitProfile('candidate-ingestion', 'api');
    const knowledgeApi = getServiceUnitProfile('knowledge-governance', 'api');

    expect(candidateApi.ownsCandidateTaskWork).toBe(false);
    expect(knowledgeApi.ownsSharedJobTaskWork).toBe(false);
    expect(knowledgeApi.ownsOutboxWork).toBe(false);
  });
});
