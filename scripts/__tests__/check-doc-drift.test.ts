import { describe, expect, it } from 'vitest';
import { type DocRule, checkRule } from '../check-doc-drift';

describe('checkRule', () => {
  const file = 'docs/test.md';

  // ── mustContain ──────────────────────────────────────────────────

  describe('mustContain', () => {
    it('passes when required phrase is present', () => {
      const rule: DocRule = { file, mustContain: ['hello'] };
      expect(checkRule(rule, 'hello world')).toEqual([]);
    });

    it('fails when required phrase is missing', () => {
      const rule: DocRule = { file, mustContain: ['hello'] };
      const msgs = checkRule(rule, 'goodbye world');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('must contain "hello"');
    });

    it('checks multiple required phrases independently', () => {
      const rule: DocRule = { file, mustContain: ['alpha', 'beta'] };
      const msgs = checkRule(rule, 'alpha only');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('"beta"');
    });
  });

  // ── mustNotContain ───────────────────────────────────────────────

  describe('mustNotContain', () => {
    it('passes when forbidden phrase is absent', () => {
      const rule: DocRule = { file, mustNotContain: ['stale'] };
      expect(checkRule(rule, 'fresh content')).toEqual([]);
    });

    it('fails when forbidden phrase is present', () => {
      const rule: DocRule = { file, mustNotContain: ['stale'] };
      const msgs = checkRule(rule, 'this is stale content');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('must NOT contain "stale"');
    });

    it('checks multiple forbidden phrases independently', () => {
      const rule: DocRule = { file, mustNotContain: ['old', 'deprecated'] };
      const msgs = checkRule(rule, 'old and deprecated');
      expect(msgs).toHaveLength(2);
    });
  });

  // ── mustNotContainRegex ──────────────────────────────────────────

  describe('mustNotContainRegex', () => {
    it('passes when regex does not match', () => {
      const rule: DocRule = { file, mustNotContainRegex: ['\\d+ items'] };
      expect(checkRule(rule, 'no items here')).toEqual([]);
    });

    it('fails when regex matches', () => {
      const rule: DocRule = { file, mustNotContainRegex: ['\\d+ 张表'] };
      const msgs = checkRule(rule, '数据库有 48 张表');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('must NOT match regex');
      expect(msgs[0]).toContain('48 张表');
    });

    it('reports invalid regex as an error', () => {
      const rule: DocRule = { file, mustNotContainRegex: ['[invalid'] };
      const msgs = checkRule(rule, 'any content');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('ERROR');
      expect(msgs[0]).toContain('invalid regex');
    });
  });

  // ── mustContainCount (expected) ──────────────────────────────────

  describe('mustContainCount with expected', () => {
    it('passes when captured number matches expected', () => {
      const rule: DocRule = {
        file,
        mustContainCount: { pattern: '(\\d+) tables', expected: 56 },
      };
      expect(checkRule(rule, 'has 56 tables total')).toEqual([]);
    });

    it('fails when captured number does not match', () => {
      const rule: DocRule = {
        file,
        mustContainCount: { pattern: '(\\d+) tables', expected: 56 },
      };
      const msgs = checkRule(rule, 'has 48 tables total');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('expected count 56 but found 48');
    });

    it('fails when pattern has no match', () => {
      const rule: DocRule = {
        file,
        mustContainCount: { pattern: '(\\d+) tables', expected: 56 },
      };
      const msgs = checkRule(rule, 'no tables mentioned');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('no match found');
    });

    it('fails when regex has no capture group', () => {
      const rule: DocRule = {
        file,
        mustContainCount: { pattern: '\\d+', expected: 5 },
      };
      const msgs = checkRule(rule, 'count is 5');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('no capture group');
    });

    it('fails when captured group is not a number', () => {
      const rule: DocRule = {
        file,
        mustContainCount: { pattern: '(\\w+) tables', expected: 56 },
      };
      const msgs = checkRule(rule, 'has many tables');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('is not a number');
    });
  });

  // ── mustContainCount (minOccurrences) ────────────────────────────

  describe('mustContainCount with minOccurrences', () => {
    it('passes when occurrence count meets minimum', () => {
      const rule: DocRule = {
        file,
        mustContainCount: { pattern: 'PostgreSQL', minOccurrences: 3 },
      };
      const content = 'PostgreSQL is great. Use PostgreSQL. PostgreSQL rocks.';
      expect(checkRule(rule, content)).toEqual([]);
    });

    it('passes when occurrence count exceeds minimum', () => {
      const rule: DocRule = {
        file,
        mustContainCount: { pattern: 'PostgreSQL', minOccurrences: 2 },
      };
      const content = 'PostgreSQL x PostgreSQL x PostgreSQL';
      expect(checkRule(rule, content)).toEqual([]);
    });

    it('fails when occurrence count is below minimum', () => {
      const rule: DocRule = {
        file,
        mustContainCount: { pattern: 'PostgreSQL', minOccurrences: 3 },
      };
      const content = 'PostgreSQL is great. Use PostgreSQL.';
      const msgs = checkRule(rule, content);
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('at least 3');
      expect(msgs[0]).toContain('found 2');
    });

    it('fails when no matches found', () => {
      const rule: DocRule = {
        file,
        mustContainCount: { pattern: 'PostgreSQL', minOccurrences: 1 },
      };
      const msgs = checkRule(rule, 'use MySQL instead');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('found 0');
    });
  });

  // ── mustMatchRegex ────────────────────────────────────────────────

  describe('mustMatchRegex', () => {
    it('passes when regex matches content', () => {
      const rule: DocRule = { file, mustMatchRegex: ['version \\d+\\.\\d+'] };
      expect(checkRule(rule, 'deploy version 1.0 of the system')).toEqual([]);
    });

    it('fails when regex does not match content', () => {
      const rule: DocRule = { file, mustMatchRegex: ['version \\d+\\.\\d+'] };
      const msgs = checkRule(rule, 'no version info here');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('must match regex');
      expect(msgs[0]).toContain('no match found');
    });

    it('reports invalid regex as an error', () => {
      const rule: DocRule = { file, mustMatchRegex: ['[invalid'] };
      const msgs = checkRule(rule, 'any content');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('ERROR');
      expect(msgs[0]).toContain('invalid regex');
      expect(msgs[0]).toContain('mustMatchRegex');
    });

    it('supports multiline matching with s flag', () => {
      const rule: DocRule = { file, mustMatchRegex: ['start.*end'] };
      const content = 'start\nmiddle\nend';
      // Without 's' flag, . wouldn't match \n; with 's' it does.
      expect(checkRule(rule, content)).toEqual([]);
    });

    it('returns empty array when mustMatchRegex is empty', () => {
      const rule: DocRule = { file, mustMatchRegex: [] };
      expect(checkRule(rule, 'any content')).toEqual([]);
    });

    it('fails when only some patterns match (all must match)', () => {
      const rule: DocRule = {
        file,
        mustMatchRegex: ['alpha', 'beta'],
      };
      const msgs = checkRule(rule, 'alpha only');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('beta');
    });
  });

  // ── Combined rules ───────────────────────────────────────────────

  describe('combined rules', () => {
    it('checks all rule types independently', () => {
      const rule: DocRule = {
        file,
        mustContain: ['required'],
        mustNotContain: ['forbidden'],
        mustNotContainRegex: ['\\d+ 张表'],
        mustContainCount: { pattern: 'important', minOccurrences: 2 },
      };
      const content = 'required content. important. important. 42 张表';
      const msgs = checkRule(rule, content);
      // should fail on: mustNotContainRegex (42 张表), mustNotContain (missing "forbidden" -> no fail)
      // mustContain passes, mustContainCount passes (2 occurrences)
      // mustNotContain: "forbidden" not in content -> passes
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toContain('must NOT match regex');
    });

    it('returns empty array when all rules pass', () => {
      const rule: DocRule = {
        file,
        mustContain: ['hello'],
        mustNotContain: ['goodbye'],
        mustNotContainRegex: ['\\d+ stale'],
        mustContainCount: { pattern: 'word', minOccurrences: 1 },
      };
      const content = 'hello word world';
      expect(checkRule(rule, content)).toEqual([]);
    });
  });

  // ── No assertions defined ────────────────────────────────────────

  it('returns empty array for rule with no assertions', () => {
    const rule: DocRule = { file };
    expect(checkRule(rule, 'any content')).toEqual([]);
  });

  // ── mustContainCount with neither expected nor minOccurrences ────

  it('reports error when mustContainCount has neither expected nor minOccurrences', () => {
    const rule: DocRule = {
      file,
      mustContainCount: { pattern: 'something' },
    };
    const msgs = checkRule(rule, 'something');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('ERROR');
    expect(msgs[0]).toContain('must specify either');
  });
});
