import { describe, expect, it, vi } from 'vitest';

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';

import {
  extractStackPathHints,
  normalizeToken,
  parseSeedIntent,
  parseSeedIntentWithLLM,
} from './intent.js';

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
      expect(result.problem).toBeNull();
    });

    it('extracts error-like seeds without leaking new fields into client contract', () => {
      // The ParsedIntent type is server-internal, not exported through contracts
      const result = parseSeedIntent('TypeError: Cannot read property of undefined');

      expect(result.errorText).toBe('TypeError: Cannot read property of undefined');
      // Server keeps parsed intent internal per RETR-02
      expect(result.problem).toBeNull();
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
      process.env.OPENAI_API_KEY = undefined;

      const result = parseSeedIntent('test query without api key');

      expect(result).toBeDefined();
      expect(result.seed).toBe('test query without api key');

      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    });
  });

  describe('semantic fields stay null in fallback mode', () => {
    it('does not infer situation from action-oriented text without llm', () => {
      const result = parseSeedIntent('When deploying containers to production, the network fails');

      expect(result.situation).toBeNull();
    });

    it('does not infer problem from complaint-style text without llm', () => {
      const result = parseSeedIntent('My docker container fails with error');

      expect(result.problem).toBeNull();
    });

    it('does not infer goal from question-style text without llm', () => {
      const result = parseSeedIntent('How do I configure TLS for my PostgreSQL connection?');

      expect(result.goal).toBeNull();
    });
  });
});

describe('normalizeToken', () => {
  it('normalizes tokens to lowercase', () => {
    expect(normalizeToken('Docker')).toEqual({
      token: 'docker',
      original: 'Docker',
      isTechnical: true,
    });
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

describe('parseSeedIntentWithLLM', () => {
  function createMockChat(overrides: Partial<ChatProvider> = {}): ChatProvider {
    return {
      provider: 'mock',
      isConfigured: true,
      invoke: vi.fn().mockResolvedValue(
        JSON.stringify({
          situation: 'deploying to k8s',
          problem: 'fastify app crashes with connection refused',
          goal: 'fix connection issues',
          errorText: 'ECONNREFUSED',
          category: 'deployment',
          semanticQuery: 'fastify ECONNREFUSED kubernetes deployment networking',
        }),
      ),
      ...overrides,
    };
  }

  it('returns llm-parsed intent with category and semanticQuery on success', async () => {
    const chat = createMockChat();

    const result = await parseSeedIntentWithLLM('fastify ECONNREFUSED', chat);

    expect(result.parseMethod).toBe('llm');
    expect(result.category).toBe('deployment');
    expect(result.semanticQuery).toBe('fastify ECONNREFUSED kubernetes deployment networking');
    expect(result.situation).toBe('deploying to k8s');
    expect(result.problem).toBe('fastify app crashes with connection refused');
    expect(result.errorText).toBe('ECONNREFUSED');
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.stackPathHints).toBeDefined();
  });

  it('handles fenced JSON response', async () => {
    const chat = createMockChat({
      invoke: vi.fn().mockResolvedValue(
        `\`\`\`json\n${JSON.stringify({
          situation: null,
          problem: 'something broke',
          goal: 'fix it',
          errorText: null,
          category: 'debugging',
          semanticQuery: 'debugging troubleshooting',
        })}\n\`\`\``,
      ),
    });

    const result = await parseSeedIntentWithLLM('something broke', chat);

    expect(result.parseMethod).toBe('llm');
    expect(result.category).toBe('debugging');
    expect(result.problem).toBe('something broke');
  });

  it('falls back to regex when chat is not configured', async () => {
    const chat: ChatProvider = {
      provider: 'mock',
      isConfigured: false,
      invoke: vi.fn(),
    };

    const result = await parseSeedIntentWithLLM('docker deploy fails', chat);

    expect(result.parseMethod).toBe('regex');
    expect(result.category).toBeNull();
    expect(result.semanticQuery).toBeNull();
    expect(chat.invoke).not.toHaveBeenCalled();
  });

  it('retries on parse failure then falls back to regex', async () => {
    const chat = createMockChat({
      invoke: vi
        .fn()
        .mockResolvedValueOnce('invalid json response')
        .mockResolvedValueOnce('still not json')
        .mockResolvedValueOnce('nope'),
    });

    const result = await parseSeedIntentWithLLM('test seed', chat);

    expect(result.parseMethod).toBe('regex');
    expect(chat.invoke).toHaveBeenCalledTimes(3);
  });

  it('retries on invoke exception then falls back to regex', async () => {
    const chat: ChatProvider = {
      provider: 'mock',
      isConfigured: true,
      invoke: vi
        .fn()
        .mockRejectedValueOnce(new Error('LLM unavailable'))
        .mockRejectedValueOnce(new Error('LLM unavailable'))
        .mockRejectedValueOnce(new Error('LLM unavailable')),
    };

    const result = await parseSeedIntentWithLLM('test seed', chat);

    expect(result.parseMethod).toBe('regex');
    expect(chat.invoke).toHaveBeenCalledTimes(3);
  });

  it('falls back to regex on invalid category in response', async () => {
    const chat = createMockChat({
      invoke: vi.fn().mockResolvedValue(
        JSON.stringify({
          situation: null,
          problem: null,
          goal: null,
          errorText: null,
          category: 'invalid_category',
          semanticQuery: null,
        }),
      ),
    });

    const result = await parseSeedIntentWithLLM('test seed', chat);

    expect(result.parseMethod).toBe('regex');
    expect(result.category).toBeNull();
  });

  it('preserves deterministic tokens and stackPathHints in LLM results', async () => {
    const chat = createMockChat();

    const result = await parseSeedIntentWithLLM('fastify ECONNREFUSED kubernetes', chat);

    expect(result.parseMethod).toBe('llm');
    expect(result.tokens.length).toBeGreaterThan(0);
    const fastifyToken = result.tokens.find((t) => t.token === 'fastify');
    expect(fastifyToken).toBeDefined();
    expect(result.stackPathHints).toBeDefined();
  });

  it('returns cached result on cache hit', async () => {
    const chat = createMockChat();
    const cache = new (await import('./intent-cache.js')).InMemoryIntentCache();

    const first = await parseSeedIntentWithLLM('docker deploy', chat, { cache });
    expect(first.parseMethod).toBe('llm');
    expect(chat.invoke).toHaveBeenCalledTimes(1);

    const second = await parseSeedIntentWithLLM('docker deploy', chat, { cache });
    expect(second.parseMethod).toBe('llm');
    expect(second.category).toBe(first.category);
    expect(chat.invoke).toHaveBeenCalledTimes(1);
  });
});
