import { describe, expect, it } from 'vitest';

import {
  computeCandidateFingerprint,
  computeSkillFingerprint,
  computeTrapFingerprint,
  createAnalysisSnapshot,
  extractKeywords,
  tokenize,
} from './fingerprint.js';

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------
describe('tokenize', () => {
  it('splits text into lowercase words of length >= 3', () => {
    const result = tokenize('Hello World Test');
    expect(result).toEqual(new Set(['hello', 'world', 'test']));
  });

  it('filters out short tokens', () => {
    const result = tokenize('a bb ccc dddd');
    expect(result).toEqual(new Set(['ccc', 'dddd']));
  });

  it('handles empty string', () => {
    const result = tokenize('');
    expect(result.size).toBe(0);
  });

  it('splits on non-alphanumeric boundaries', () => {
    const result = tokenize('foo-bar_baz.qux');
    expect(result).toEqual(new Set(['foo', 'bar', 'baz', 'qux']));
  });

  it('handles numeric content', () => {
    const result = tokenize('v2 release 2024');
    expect(result).toEqual(new Set(['release', '2024']));
  });

  it('returns deterministic output for same input', () => {
    const a = tokenize('Deterministic Input Test');
    const b = tokenize('Deterministic Input Test');
    expect([...a]).toEqual([...b]);
  });
});

// ---------------------------------------------------------------------------
// extractKeywords
// ---------------------------------------------------------------------------
describe('extractKeywords', () => {
  it('extracts capitalized phrases', () => {
    const result = extractKeywords('Docker is great for containers');
    expect(result).toContain('Docker');
  });

  it('extracts quoted phrases', () => {
    const result = extractKeywords('use "fast deploy" now');
    expect(result).toContain('fast deploy');
  });

  it('extracts camelCase identifiers', () => {
    const result = extractKeywords('use buildServer for tests');
    expect(result).toContain('buildServer');
  });

  it('extracts snake_case identifiers (length >= 4)', () => {
    const result = extractKeywords('call process_candidate now');
    expect(result).toContain('process_candidate');
  });

  it('extracts kebab-case identifiers', () => {
    const result = extractKeywords('use fast-deploy today');
    expect(result).toContain('fast-deploy');
  });

  it('deduplicates keywords', () => {
    const result = extractKeywords('Docker docker Docker');
    const dockerCount = result.filter((k) => k === 'Docker').length;
    expect(dockerCount).toBe(1);
  });

  it('handles empty text', () => {
    const result = extractKeywords('');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeTrapFingerprint
// ---------------------------------------------------------------------------
describe('computeTrapFingerprint', () => {
  const base = { shortcut: 'Avoid nested loops', detail: 'Use map instead', labels: ['perf'] };

  it('produces consistent SHA-256 hash for same input', () => {
    const a = computeTrapFingerprint(base);
    const b = computeTrapFingerprint(base);
    expect(a).toBe(b);
  });

  it('produces different hash for different shortcuts', () => {
    const a = computeTrapFingerprint(base);
    const b = computeTrapFingerprint({ ...base, shortcut: 'Use reduce' });
    expect(a).not.toBe(b);
  });

  it('produces different hash for different details', () => {
    const a = computeTrapFingerprint(base);
    const b = computeTrapFingerprint({ ...base, detail: 'Different detail' });
    expect(a).not.toBe(b);
  });

  it('normalizes label order', () => {
    const a = computeTrapFingerprint({ ...base, labels: ['b', 'a'] });
    const b = computeTrapFingerprint({ ...base, labels: ['a', 'b'] });
    expect(a).toBe(b);
  });

  it('produces 64-character hex string', () => {
    const hash = computeTrapFingerprint(base);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// computeSkillFingerprint
// ---------------------------------------------------------------------------
describe('computeSkillFingerprint', () => {
  const base = {
    profile: { title: 'My Skill', summary: 'Does things', keywords: ['tool'] },
    files: [
      { path: 'index.ts', sha256: 'abc123' },
      { path: 'utils.ts', sha256: 'def456' },
    ],
  };

  it('produces consistent hash for same input', () => {
    const a = computeSkillFingerprint(base);
    const b = computeSkillFingerprint(base);
    expect(a).toBe(b);
  });

  it('includes file hashes sorted deterministically', () => {
    const a = computeSkillFingerprint({
      ...base,
      files: [
        { path: 'b.ts', sha256: 'zzz' },
        { path: 'a.ts', sha256: 'aaa' },
      ],
    });
    const b = computeSkillFingerprint({
      ...base,
      files: [
        { path: 'a.ts', sha256: 'aaa' },
        { path: 'b.ts', sha256: 'zzz' },
      ],
    });
    expect(a).toBe(b);
  });

  it('handles null profile', () => {
    const hash = computeSkillFingerprint({ profile: null, files: base.files });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hash when profile title changes', () => {
    const a = computeSkillFingerprint(base);
    const b = computeSkillFingerprint({
      ...base,
      profile: { ...base.profile, title: 'Different Title' },
    });
    expect(a).not.toBe(b);
  });

  it('produces different hash when files change', () => {
    const a = computeSkillFingerprint(base);
    const b = computeSkillFingerprint({
      ...base,
      files: [{ path: 'index.ts', sha256: 'changed' }],
    });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// computeCandidateFingerprint
// ---------------------------------------------------------------------------
describe('computeCandidateFingerprint', () => {
  const trapInput = {
    sourceType: 'trap' as const,
    trapPayload: {
      shortcut: 'Avoid nested loops',
      detail: 'Use map instead',
      labels: ['perf', 'patterns'],
    },
  };

  const skillInput = {
    sourceType: 'skill' as const,
    skillPayload: {
      profile: {
        title: 'My Skill',
        summary: 'A useful skill for testing',
        keywords: ['testing', 'skill'],
      },
      files: [{ path: 'index.ts', sha256: 'abc123' }],
    },
  };

  it('delegates to computeTrapFingerprint for trap sourceType', () => {
    const result = computeCandidateFingerprint(trapInput);
    const direct = computeTrapFingerprint(trapInput.trapPayload);
    expect(result.fingerprint).toBe(direct);
  });

  it('delegates to computeSkillFingerprint for skill sourceType', () => {
    const result = computeCandidateFingerprint(skillInput);
    const direct = computeSkillFingerprint(skillInput.skillPayload);
    expect(result.fingerprint).toBe(direct);
  });

  it('extracts keywords from trap payload including labels', () => {
    const result = computeCandidateFingerprint(trapInput);
    expect(result.keywords.length).toBeGreaterThan(0);
    // Labels are appended to keywords
    expect(result.keywords).toContain('perf');
    expect(result.keywords).toContain('patterns');
  });

  it('tokenizes trap shortcut and detail', () => {
    const result = computeCandidateFingerprint(trapInput);
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.tokens).toContain('avoid');
  });

  it('extracts keywords from skill profile when present', () => {
    const result = computeCandidateFingerprint(skillInput);
    expect(result.keywords).toContain('testing');
    expect(result.keywords).toContain('skill');
  });

  it('returns empty keywords/tokens when skill profile is null', () => {
    const result = computeCandidateFingerprint({
      sourceType: 'skill',
      skillPayload: { profile: null, files: [{ path: 'a.ts', sha256: 'x' }] },
    });
    expect(result.keywords).toEqual([]);
    expect(result.tokens).toEqual([]);
  });

  it('throws for invalid sourceType', () => {
    expect(() => computeCandidateFingerprint({ sourceType: 'invalid' as any })).toThrow(
      /Invalid fingerprint input/,
    );
  });

  it('throws for trap sourceType without trapPayload', () => {
    expect(() => computeCandidateFingerprint({ sourceType: 'trap' })).toThrow(
      /Invalid fingerprint input/,
    );
  });

  it('throws for skill sourceType without skillPayload', () => {
    expect(() => computeCandidateFingerprint({ sourceType: 'skill' })).toThrow(
      /Invalid fingerprint input/,
    );
  });
});

// ---------------------------------------------------------------------------
// createAnalysisSnapshot
// ---------------------------------------------------------------------------
describe('createAnalysisSnapshot', () => {
  it('returns object with fingerprint, keywords, tokens, and normalizedAt', () => {
    const snapshot = createAnalysisSnapshot('abc123', ['key1'], ['token1']);
    expect(snapshot).toMatchObject({
      fingerprint: 'abc123',
      keywords: ['key1'],
      tokens: ['token1'],
    });
    expect(snapshot.normalizedAt).toBeDefined();
  });

  it('normalizedAt is a valid ISO timestamp', () => {
    const snapshot = createAnalysisSnapshot('abc', [], []);
    const parsed = new Date(snapshot.normalizedAt);
    expect(parsed.toISOString()).toBe(snapshot.normalizedAt);
  });
});
