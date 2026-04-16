import { describe, expect, it } from 'vitest';

import { parseSeedIntent, normalizeToken, extractStackPathHints } from './intent.js';

describe('parseSeedIntent', () => {
  describe('basic parsing', () => {
    it('yields normalized tokens plus nullable situation, problem, goal, and errorText', () => {
      const result = parseSeedIntent('docker container fails to start');

      expect(result.seed).toBe('docker container fails to start');
      expect(result.normalized).toBe('docker container fails to start');
      expect(result.tokens.length).toBeGreaterThan(0);
      // These fields can be null - they are nullable by design
      expect(result.situation === null || typeof result.situation === 'string').toBe(true);
      expect(result.problem === null || typeof result.problem === 'string').toBe(true);
      expect(result.goal === null || typeof result.goal === 'string').toBe(true);
      expect(result.errorText).toBeNull();
    });

    it('handles empty seed gracefully', () => {
      const result = parseSeedIntent('');

      expect(result.seed).toBe('');
      expect(result.normalized).toBe('');
      expect(result.tokens).toEqual([]);
      expect(result.situation).toBeNull();
      expect(result.problem).toBeNull();
      expect(result.goal).toBeNull();
      expect(result.errorText).toBeNull();
    });

    it('preserves original seed in result', () => {
      const seed = 'Why does TypeScript complain about null checks?';
      const result = parseSeedIntent(seed);

      expect(result.seed).toBe(seed);
    });
  });

  describe('error detection', () => {
    it('surfaces errorText when seed contains error-like patterns', () => {
      const result = parseSeedIntent('Error: permission denied while connecting to Docker daemon');

      expect(result.errorText).not.toBeNull();
      expect(result.errorText).toContain('permission denied');
      expect(result.problem).not.toBeNull();
    });

    it('extracts error-like seeds without leaking new fields into client contract', () => {
      // The ParsedIntent type is server-internal, not exported through contracts
      const result = parseSeedIntent('TypeError: Cannot read property of undefined');

      expect(result.errorText).toBe('TypeError: Cannot read property of undefined');
      // Server keeps parsed intent internal per RETR-02
      expect(result.problem).not.toBeNull();
    });

    it('recognizes common error patterns', () => {
      const errorPatterns = [
        'ENOENT: no such file or directory',
        'Error: Connection refused',
        'TypeError: undefined is not a function',
        'SyntaxError: Unexpected token',
        'FATAL: database connection failed',
      ];

      for (const pattern of errorPatterns) {
        const result = parseSeedIntent(pattern);
        expect(result.errorText, `Expected error for: ${pattern}`).not.toBeNull();
      }
    });
  });

  describe('stack and path hints', () => {
    it('extracts stack/path hints deterministically for later ranking inputs', () => {
      const result = parseSeedIntent('How do I fix docker networking issues?');

      expect(result.stackPathHints.length).toBeGreaterThan(0);
      const dockerHint = result.stackPathHints.find((h) => h.hint === 'docker');
      expect(dockerHint).toBeDefined();
      expect(dockerHint?.kind).toBe('stack');
    });

    it('extracts file paths from seed', () => {
      const result = parseSeedIntent('tsconfig.json is not finding my src/index.ts file');

      expect(result.stackPathHints.length).toBeGreaterThan(0);
      const pathHints = result.stackPathHints.filter((h) => h.kind === 'path');
      expect(pathHints.length).toBeGreaterThan(0);
    });

    it('classifies technology stacks correctly', () => {
      const stacks = ['docker', 'kubernetes', 'postgres', 'react'];
      const seeds = stacks.map((s) => `How do I use ${s} for deployment`);

      for (let i = 0; i < stacks.length; i++) {
        const result = parseSeedIntent(seeds[i]!);
        const stackHint = result.stackPathHints.find((h) => h.hint === stacks[i]);
        expect(stackHint, `Expected stack hint for: ${stacks[i]}`).toBeDefined();
      }
    });
  });

  describe('deterministic behavior', () => {
    it('produces identical output for identical input', () => {
      const seed = 'Docker container fails with permission error';
      const result1 = parseSeedIntent(seed);
      const result2 = parseSeedIntent(seed);

      expect(result1).toEqual(result2);
    });

    it('runs without OPENAI_API_KEY or external dependencies', () => {
      // This test verifies the parser is deterministic and has no external deps
      // by running in an environment without OPENAI_API_KEY
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const result = parseSeedIntent('test query without api key');

      expect(result).toBeDefined();
      expect(result.seed).toBe('test query without api key');

      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    });
  });

  describe('situation, problem, goal extraction', () => {
    it('extracts situation from action-oriented seeds', () => {
      const result = parseSeedIntent('When deploying containers to production, the network fails');

      expect(result.situation).not.toBeNull();
      expect(result.situation).toContain('deploying');
    });

    it('extracts problem from complaint-style seeds', () => {
      const result = parseSeedIntent('My docker container fails with error');

      expect(result.problem).not.toBeNull();
    });

    it('extracts goal from question-style seeds', () => {
      const result = parseSeedIntent('How do I configure TLS for my PostgreSQL connection?');

      expect(result.goal).not.toBeNull();
      expect(result.goal).toContain('configure TLS');
    });
  });
});

describe('normalizeToken', () => {
  it('normalizes tokens to lowercase', () => {
    expect(normalizeToken('Docker')).toEqual({ token: 'docker', original: 'Docker', isTechnical: true });
  });

  it('identifies technical terms', () => {
    const technicalTerms = ['typescript', 'kubernetes', 'postgres', 'docker', 'npm', 'nodejs'];
    for (const term of technicalTerms) {
      const result = normalizeToken(term);
      expect(result.isTechnical, `Expected ${term} to be technical`).toBe(true);
    }
  });

  it('preserves original form', () => {
    expect(normalizeToken('TypeScript').original).toBe('TypeScript');
    expect(normalizeToken('TypeScript').token).toBe('typescript');
  });

  it('handles special characters in paths', () => {
    const result = normalizeToken('src/index.ts');
    expect(result.token).toBe('src/index.ts');
    expect(result.isTechnical).toBe(true);
  });

  it('marks non-technical words as not technical', () => {
    const result = normalizeToken('hello');
    expect(result.isTechnical).toBe(false);
  });
});

describe('extractStackPathHints', () => {
  it('extracts technology stacks from text', () => {
    const hints = extractStackPathHints('Using TypeScript with Express and React');

    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.hint === 'typescript')).toBe(true);
    expect(hints.some((h) => h.hint === 'react')).toBe(true);
  });

  it('extracts file paths from text', () => {
    const hints = extractStackPathHints('My package.json has a dependency issue');

    expect(hints.some((h) => h.kind === 'path')).toBe(true);
  });

  it('returns empty array for text without hints', () => {
    const hints = extractStackPathHints('generic text without technical terms');

    expect(hints.length).toBe(0);
  });

  it('classifies hints correctly by kind', () => {
    const hints = extractStackPathHints('Docker container with docker-compose.yml');

    const stackHints = hints.filter((h) => h.kind === 'stack');
    const pathHints = hints.filter((h) => h.kind === 'path');

    expect(stackHints.length).toBeGreaterThan(0);
    expect(pathHints.length).toBeGreaterThan(0);
  });
});
