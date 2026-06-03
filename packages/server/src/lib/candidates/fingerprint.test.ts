import type { CandidateSubmission } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildNormalizedDuplicateInput,
  computeCandidateFingerprint,
  computeSkillExactLookupKey,
  computeSkillFingerprint,
  computeTrapFingerprint,
  createAnalysisSnapshot,
  extractCandidateSkillProfile,
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

  it('is stable when labels are reordered (whitespace-insensitive sort)', () => {
    const reordered = computeTrapFingerprint({
      ...base,
      labels: ['  z', 'a  ', 'M', 'm'],
    });
    const sorted = computeTrapFingerprint({
      ...base,
      labels: ['  a', 'm  ', 'M', 'z'],
    });
    expect(reordered).toBe(sorted);
  });

  it('produces different hash for different label sets (case-sensitive)', () => {
    const a = computeTrapFingerprint({ ...base, labels: ['perf', 'patterns'] });
    const b = computeTrapFingerprint({ ...base, labels: ['perf', 'different'] });
    expect(a).not.toBe(b);
  });

  it('produces identical hash for canonical inputs that share shortcut/detail/labels', () => {
    const a = computeTrapFingerprint(base);
    const b = computeTrapFingerprint({
      shortcut: base.shortcut,
      detail: base.detail,
      labels: [...base.labels].reverse(),
    });
    expect(a).toBe(b);
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
// computeSkillExactLookupKey
// ---------------------------------------------------------------------------
describe('computeSkillExactLookupKey', () => {
  it('uses derivation-eligible file hashes in deterministic path order when content is unavailable', () => {
    const a = computeSkillExactLookupKey({
      files: [
        { path: 'references/z.md', sha256: 'z'.repeat(64) },
        { path: 'SKILL.md', sha256: 'a'.repeat(64) },
        { path: 'assets/logo.png', sha256: 'ignored'.repeat(10) },
      ],
    });

    const b = computeSkillExactLookupKey({
      files: [
        { path: 'SKILL.md', sha256: 'a'.repeat(64) },
        { path: 'references/z.md', sha256: 'z'.repeat(64) },
      ],
    });

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses derivation-eligible file content when all eligible content is available', () => {
    const withContent = computeSkillExactLookupKey({
      files: [
        {
          path: 'SKILL.md',
          sha256: 'a'.repeat(64),
          content: '# Deploy\n\nUse kubectl apply.',
        },
        {
          path: 'references/runbook.md',
          sha256: 'b'.repeat(64),
          text: 'Rollback with kubectl rollout undo.',
        },
      ],
    });

    const byHashOnly = computeSkillExactLookupKey({
      files: [
        { path: 'SKILL.md', sha256: 'a'.repeat(64) },
        { path: 'references/runbook.md', sha256: 'b'.repeat(64) },
      ],
    });

    expect(withContent).not.toBe(byHashOnly);
    expect(withContent).toMatch(/^[0-9a-f]{64}$/);
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

// ---------------------------------------------------------------------------
// extractCandidateSkillProfile (Phase 2)
// ---------------------------------------------------------------------------
describe('extractCandidateSkillProfile', () => {
  function makeSkillFile(overrides: Record<string, unknown> = {}) {
    return {
      path: 'index.ts',
      sha256: 'a'.repeat(64),
      sizeBytes: 100,
      mediaType: 'text/typescript',
      ...overrides,
    };
  }

  it('returns null for a skill submission with no files', () => {
    const skill = { files: [] };
    expect(extractCandidateSkillProfile(skill)).toBeNull();
  });

  it('returns null when SKILL.md is not present and no content is available', () => {
    const skill = {
      files: [makeSkillFile({ path: 'index.ts' }), makeSkillFile({ path: 'utils.ts' })],
    };
    expect(extractCandidateSkillProfile(skill)).toBeNull();
  });

  it('returns null when SKILL.md is present but no content/text field is available', () => {
    const skill = {
      files: [makeSkillFile({ path: 'SKILL.md' })],
    };
    expect(extractCandidateSkillProfile(skill)).toBeNull();
  });

  it('parses SKILL.md first heading as title and remaining body as summary when content is present', () => {
    const skill = {
      files: [
        makeSkillFile({
          path: 'SKILL.md',
          content: '# Deploy to Kubernetes\n\nUse kubectl apply to deploy the manifests.',
        }),
      ],
    };
    const profile = extractCandidateSkillProfile(skill);
    expect(profile).not.toBeNull();
    expect(profile!.title).toBe('Deploy to Kubernetes');
    expect(profile!.summary).toContain('kubectl apply');
    expect(Array.isArray(profile!.keywords)).toBe(true);
  });

  it('uses text field as a fallback for SKILL.md content', () => {
    const skill = {
      files: [
        makeSkillFile({
          path: 'SKILL.md',
          text: '# Document Parser\n\nParse PDF documents to extract text.',
        }),
      ],
    };
    const profile = extractCandidateSkillProfile(skill);
    expect(profile).not.toBeNull();
    expect(profile!.title).toBe('Document Parser');
    expect(profile!.summary).toContain('Parse PDF');
  });

  it('falls back to first non-empty line for title when no markdown heading exists', () => {
    const skill = {
      files: [
        makeSkillFile({
          path: 'SKILL.md',
          content: 'Plain title line\nBody content here.',
        }),
      ],
    };
    const profile = extractCandidateSkillProfile(skill);
    expect(profile).not.toBeNull();
    expect(profile!.title).toBe('Plain title line');
    expect(profile!.summary).toContain('Body content here');
  });
});

// ---------------------------------------------------------------------------
// buildNormalizedDuplicateInput (Phase 2)
// ---------------------------------------------------------------------------
describe('buildNormalizedDuplicateInput', () => {
  function makeTrapCandidate(overrides: Partial<CandidateSubmission> = {}): CandidateSubmission {
    return {
      id: 'cand_trap_1',
      sourceType: 'trap',
      submittedBy: 'user_1',
      teamId: null,
      status: 'received',
      originalPayload: {
        trap: {
          scope: 'project',
          labels: ['perf', 'patterns'],
          shortcut: 'Avoid nested loops',
          detail: 'Use map or forEach instead of nested for loops',
        },
      },
      analysisSnapshot: null,
      duplicateCase: null,
      receivedAt: '2024-01-01T00:00:00.000Z',
      queuedAt: null,
      analyzingAt: null,
      completedAt: null,
      lastError: null,
      retryCount: 0,
      manualResult: null,
      ...overrides,
    };
  }

  function makeSkillCandidate(overrides: Partial<CandidateSubmission> = {}): CandidateSubmission {
    return {
      id: 'cand_skill_1',
      sourceType: 'skill',
      submittedBy: 'user_1',
      teamId: null,
      status: 'received',
      originalPayload: {
        skill: {
          files: [
            {
              path: 'index.ts',
              sha256: 'b'.repeat(64),
              sizeBytes: 100,
              mediaType: 'text/typescript',
            },
          ],
          metadata: {
            title: 'My Skill',
            slug: 'my-skill',
            labels: ['tool'],
          },
        },
      },
      analysisSnapshot: null,
      duplicateCase: null,
      receivedAt: '2024-01-01T00:00:00.000Z',
      queuedAt: null,
      analyzingAt: null,
      completedAt: null,
      lastError: null,
      retryCount: 0,
      manualResult: null,
      ...overrides,
    };
  }

  it('produces the expected NormalizedDuplicateInput shape for a trap candidate', () => {
    const candidate = makeTrapCandidate();
    const normalized = buildNormalizedDuplicateInput(candidate);

    expect(normalized.sourceType).toBe('trap');
    expect(normalized.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(normalized.titleText).toBe('Avoid nested loops');
    expect(normalized.bodyText).toBe('Use map or forEach instead of nested for loops');
    expect(normalized.keywordTerms).toEqual(expect.arrayContaining(['perf', 'patterns']));
    expect(normalized.tokenTerms.length).toBeGreaterThan(0);
    expect(normalized.tokenTerms).toContain('avoid');
    expect(normalized.exactLookupKey).toBe(normalized.fingerprint);
  });

  it('for a trap candidate exactLookupKey matches computeTrapFingerprint of the trap payload', () => {
    const candidate = makeTrapCandidate();
    const normalized = buildNormalizedDuplicateInput(candidate);
    const expected = computeTrapFingerprint(candidate.originalPayload.trap!);
    expect(normalized.exactLookupKey).toBe(expected);
    expect(normalized.fingerprint).toBe(expected);
  });

  it('for a skill candidate with a SKILL.md file produces non-empty titleText and bodyText from markdown', () => {
    const candidate = makeSkillCandidate({
      originalPayload: {
        skill: {
          files: [
            {
              path: 'SKILL.md',
              sha256: 'c'.repeat(64),
              sizeBytes: 256,
              mediaType: 'text/markdown',
              content: '# Skill Title Heading\n\nThis is the body of the skill document.',
            },
            {
              path: 'scripts/run.sh',
              sha256: 'd'.repeat(64),
              sizeBytes: 64,
              mediaType: 'text/x-shellscript',
            },
          ],
          metadata: {
            title: 'My Skill',
            slug: 'my-skill',
            labels: ['tool'],
          },
        },
      },
    });
    const normalized = buildNormalizedDuplicateInput(candidate);

    expect(normalized.sourceType).toBe('skill');
    expect(normalized.titleText).toBe('Skill Title Heading');
    expect(normalized.bodyText).toContain('body of the skill document');
    expect(normalized.tokenTerms.length).toBeGreaterThan(0);
    expect(normalized.tokenTerms).toContain('skill');
    expect(normalized.tokenTerms).toContain('title');
    expect(normalized.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('for a skill candidate WITHOUT a SKILL.md file falls back to file paths', () => {
    const candidate = makeSkillCandidate({
      originalPayload: {
        skill: {
          files: [
            {
              path: 'src/index.ts',
              sha256: 'e'.repeat(64),
              sizeBytes: 200,
              mediaType: 'text/typescript',
            },
            {
              path: 'src/utils.ts',
              sha256: 'f'.repeat(64),
              sizeBytes: 150,
              mediaType: 'text/typescript',
            },
          ],
          metadata: {
            title: 'My Skill',
            slug: 'my-skill',
            labels: ['tool'],
          },
        },
      },
    });
    const normalized = buildNormalizedDuplicateInput(candidate);

    expect(normalized.sourceType).toBe('skill');
    expect(normalized.titleText).toBe('src/index.ts');
    expect(normalized.bodyText).toBe('src/index.ts\nsrc/utils.ts');
    expect(normalized.bodyText.length).toBeGreaterThan(0);
    expect(normalized.tokenTerms.length).toBeGreaterThan(0);
  });

  it('for a skill candidate without derivation text exactLookupKey differs from fingerprint and follows eligible file hashes', () => {
    const candidate = makeSkillCandidate({
      originalPayload: {
        skill: {
          files: [
            {
              path: 'SKILL.md',
              sha256: '1'.repeat(64),
              sizeBytes: 200,
              mediaType: 'text/markdown',
            },
            {
              path: 'references/usage.md',
              sha256: '2'.repeat(64),
              sizeBytes: 150,
              mediaType: 'text/markdown',
            },
            {
              path: 'scripts/run.ts',
              sha256: '3'.repeat(64),
              sizeBytes: 80,
              mediaType: 'text/typescript',
            },
          ],
          metadata: {
            title: 'My Skill',
            slug: 'my-skill',
            labels: ['tool'],
          },
        },
      },
    });
    const normalized = buildNormalizedDuplicateInput(candidate);
    expect(normalized.exactLookupKey).toBe(
      computeSkillExactLookupKey(candidate.originalPayload.skill!),
    );
    expect(normalized.exactLookupKey).not.toBe(normalized.fingerprint);
  });

  it('for a skill candidate with no files falls back to candidate id and empty tokenTerms', () => {
    const candidate = makeSkillCandidate({
      originalPayload: {
        skill: {
          files: [],
          metadata: {
            title: 'Empty Skill',
            slug: 'empty-skill',
            labels: ['tool'],
          },
        },
      },
    });
    const normalized = buildNormalizedDuplicateInput(candidate);
    expect(normalized.sourceType).toBe('skill');
    expect(normalized.titleText).toBe('cand_skill_1');
    expect(normalized.bodyText).toBe('');
    expect(normalized.tokenTerms).toEqual(['cand', 'skill']);
  });
});
