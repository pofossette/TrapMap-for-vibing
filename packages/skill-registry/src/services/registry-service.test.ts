import { describe, expect, it } from 'vitest';
import { RegistryService } from './registry-service.js';

describe('RegistryService parseSource', () => {
  const svc = new RegistryService();
  it('parses local', () => {
    const s = svc.parseSource('./my-skill');
    expect(s.kind).toBe('local-path');
  });
  it('parses github owner/repo', () => {
    const s = svc.parseSource('vercel-labs/skills');
    expect(s.kind).toBe('github');
    expect(s.owner).toBe('vercel-labs');
  });
  it('parses github with subpath and ref', () => {
    const s = svc.parseSource('anthropics/skills/retrieval@main');
    expect(s.subpath).toBe('retrieval');
  });
  it('parses skills.sh slug', () => {
    const s = svc.parseSource('tdd');
    expect(s.kind).toBe('skills-sh');
  });
});
