import { describe, expect, it } from 'vitest';
import {
  type ArchFreezeFileRule,
  type ArchFreezeRule,
  checkArchFreezeRule,
  checkFile,
} from '../check-arch-freeze';

describe('checkFile', () => {
  const filePath = 'packages/host-local/src/nest/app.module.ts';

  // ── mustContain ──────────────────────────────────────────────────

  describe('mustContain', () => {
    it('passes when required phrase is present', () => {
      const rule: ArchFreezeFileRule = { mustContain: ['buildServer()'] };
      expect(checkFile(rule, filePath, 'const app = buildServer()')).toEqual([]);
    });

    it('fails when required phrase is missing', () => {
      const rule: ArchFreezeFileRule = { mustContain: ['buildServer()'] };
      const msgs = checkFile(rule, filePath, 'const app = createApp()');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('must contain "buildServer()"');
    });

    it('checks multiple required phrases independently', () => {
      const rule: ArchFreezeFileRule = { mustContain: ['alpha', 'beta'] };
      const msgs = checkFile(rule, filePath, 'alpha only');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('"beta"');
    });

    it('checks multiple phrases all present', () => {
      const rule: ArchFreezeFileRule = { mustContain: ['alpha', 'beta'] };
      expect(checkFile(rule, filePath, 'alpha and beta')).toEqual([]);
    });
  });

  // ── mustNotContain ───────────────────────────────────────────────

  describe('mustNotContain', () => {
    it('passes when forbidden phrase is absent', () => {
      const rule: ArchFreezeFileRule = { mustNotContain: ['createApp()'] };
      expect(checkFile(rule, filePath, 'buildServer()')).toEqual([]);
    });

    it('fails when forbidden phrase is present', () => {
      const rule: ArchFreezeFileRule = { mustNotContain: ['createApp()'] };
      const msgs = checkFile(rule, filePath, 'createApp() is here');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('must NOT contain "createApp()"');
    });

    it('checks multiple forbidden phrases independently', () => {
      const rule: ArchFreezeFileRule = { mustNotContain: ['old', 'deprecated'] };
      const msgs = checkFile(rule, filePath, 'old and deprecated');
      expect(msgs).toHaveLength(2);
    });
  });

  // ── mustExist ────────────────────────────────────────────────────

  describe('mustExist', () => {
    it('passes when file exists', () => {
      const rule: ArchFreezeFileRule = { mustExist: true };
      expect(checkFile(rule, filePath, 'file content')).toEqual([]);
    });

    it('fails when file does not exist (content is null)', () => {
      const rule: ArchFreezeFileRule = { mustExist: true };
      const msgs = checkFile(rule, filePath, null);
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('must exist but was not found');
    });
  });

  // ── file not readable (null content, no mustExist) ───────────────

  describe('file not readable', () => {
    it('reports error when content is null and mustExist is not set', () => {
      const rule: ArchFreezeFileRule = { mustContain: ['something'] };
      const msgs = checkFile(rule, filePath, null);
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('cannot be read');
    });

    it('returns early without checking mustContain when file missing', () => {
      const rule: ArchFreezeFileRule = {
        mustExist: true,
        mustContain: ['alpha', 'beta'],
      };
      const msgs = checkFile(rule, filePath, null);
      // mustExist fail message only, no mustContain messages
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('must exist but was not found');
    });
  });

  // ── Combined rules ───────────────────────────────────────────────

  describe('combined rules', () => {
    it('checks mustContain and mustNotContain together', () => {
      const rule: ArchFreezeFileRule = {
        mustContain: ['required'],
        mustNotContain: ['forbidden'],
      };
      expect(checkFile(rule, filePath, 'required content')).toEqual([]);
    });

    it('reports failures from both rule types', () => {
      const rule: ArchFreezeFileRule = {
        mustContain: ['required'],
        mustNotContain: ['forbidden'],
      };
      const msgs = checkFile(rule, filePath, 'forbidden stuff');
      expect(msgs).toHaveLength(2);
      expect(msgs.some((m) => m.includes('must contain "required"'))).toBe(true);
      expect(msgs.some((m) => m.includes('must NOT contain "forbidden"'))).toBe(true);
    });

    it('returns empty array when all rules pass', () => {
      const rule: ArchFreezeFileRule = {
        mustContain: ['hello'],
        mustNotContain: ['goodbye'],
        mustExist: true,
      };
      expect(checkFile(rule, filePath, 'hello world')).toEqual([]);
    });
  });

  // ── No assertions defined ────────────────────────────────────────

  it('returns empty array for rule with no assertions', () => {
    const rule: ArchFreezeFileRule = {};
    expect(checkFile(rule, filePath, 'any content')).toEqual([]);
  });
});

describe('checkArchFreezeRule', () => {
  it('checks multiple files in a single rule', () => {
    const rule: ArchFreezeRule = {
      id: 'test-rule',
      description: 'Test rule',
      files: {
        'file-a.ts': { mustContain: ['alpha'] },
        'file-b.ts': { mustContain: ['beta'] },
      },
    };

    const readFile = (path: string): string | null => {
      if (path === 'file-a.ts') return 'alpha content';
      if (path === 'file-b.ts') return 'beta content';
      return null;
    };

    expect(checkArchFreezeRule(rule, readFile)).toEqual([]);
  });

  it('reports failures for each file independently', () => {
    const rule: ArchFreezeRule = {
      id: 'test-rule',
      description: 'Test rule',
      files: {
        'file-a.ts': { mustContain: ['alpha'] },
        'file-b.ts': { mustContain: ['beta'] },
      },
    };

    const readFile = (path: string): string | null => {
      if (path === 'file-a.ts') return 'no match';
      if (path === 'file-b.ts') return 'beta content';
      return null;
    };

    const msgs = checkArchFreezeRule(rule, readFile);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('file-a.ts');
    expect(msgs[0]).toContain('"alpha"');
  });

  it('handles missing files gracefully', () => {
    const rule: ArchFreezeRule = {
      id: 'test-rule',
      description: 'Test rule',
      files: {
        'missing.ts': { mustContain: ['something'] },
      },
    };

    const readFile = (): string | null => null;
    const msgs = checkArchFreezeRule(rule, readFile);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('missing.ts');
    expect(msgs[0]).toContain('cannot be read');
  });

  it('handles mustExist rules', () => {
    const rule: ArchFreezeRule = {
      id: 'test-rule',
      description: 'Test rule',
      files: {
        'exists.ts': { mustExist: true },
        'missing.ts': { mustExist: true },
      },
    };

    const readFile = (path: string): string | null => {
      if (path === 'exists.ts') return 'content';
      return null;
    };

    const msgs = checkArchFreezeRule(rule, readFile);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('missing.ts');
    expect(msgs[0]).toContain('must exist');
  });

  it('returns empty when rule has no files', () => {
    const rule: ArchFreezeRule = {
      id: 'empty',
      description: 'Empty rule',
      files: {},
    };
    expect(checkArchFreezeRule(rule, () => null)).toEqual([]);
  });

  it('checks mustContain and mustNotContain together across files', () => {
    const rule: ArchFreezeRule = {
      id: 'combined',
      description: 'Combined rule',
      files: {
        'server.ts': {
          mustContain: ['buildServer()'],
          mustNotContain: ['createApp()'],
        },
      },
    };

    const readFile = (path: string): string | null => {
      if (path === 'server.ts') return 'buildServer() with old createApp()';
      return null;
    };

    const msgs = checkArchFreezeRule(rule, readFile);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('must NOT contain "createApp()"');
  });

  it('passes when multiple phrases exist in content', () => {
    const rule: ArchFreezeRule = {
      id: 'multi-phrase',
      description: 'Multiple phrases',
      files: {
        'config.ts': {
          mustContain: [
            "provider: z.enum(['postgres', 'rabbitmq']).default('postgres')",
            "profile: z.enum(['local-agent', 'team-monolith', 'distributed'])",
          ],
        },
      },
    };

    const content = `
      provider: z.enum(['postgres', 'rabbitmq']).default('postgres'),
      profile: z.enum(['local-agent', 'team-monolith', 'distributed']),
    `;

    const readFile = (path: string): string | null => {
      if (path === 'config.ts') return content;
      return null;
    };

    expect(checkArchFreezeRule(rule, readFile)).toEqual([]);
  });
});
