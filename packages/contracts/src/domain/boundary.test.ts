import { describe, expect, it } from 'vitest';
import {
  boundaryConditionSchema,
  boundaryContextSchema,
  boundaryExplanationSchema,
  boundaryMetaSchema,
  boundarySchema,
  conditionKindSchema,
  evidenceKindSchema,
  evidenceReferenceSchema,
  exclusionKindSchema,
  exclusionRuleSchema,
  signalKindSchema,
  signalMatcherSchema,
  versionConstraintSchema,
} from './boundary.js';

describe('boundary schema contracts', () => {
  describe('conditionKindSchema', () => {
    it('accepts valid condition kinds', () => {
      expect(conditionKindSchema.parse('environment')).toBe('environment');
      expect(conditionKindSchema.parse('permission')).toBe('permission');
      expect(conditionKindSchema.parse('tool')).toBe('tool');
      expect(conditionKindSchema.parse('configuration')).toBe('configuration');
      expect(conditionKindSchema.parse('other')).toBe('other');
    });

    it('rejects invalid condition kind', () => {
      expect(() => conditionKindSchema.parse('invalid-kind')).toThrow();
    });
  });

  describe('signalKindSchema', () => {
    it('accepts valid signal kinds', () => {
      expect(signalKindSchema.parse('exact')).toBe('exact');
      expect(signalKindSchema.parse('keyword')).toBe('keyword');
      expect(signalKindSchema.parse('regex')).toBe('regex');
      expect(signalKindSchema.parse('error-code')).toBe('error-code');
      expect(signalKindSchema.parse('log-pattern')).toBe('log-pattern');
    });

    it('rejects invalid signal kind', () => {
      expect(() => signalKindSchema.parse('invalid')).toThrow();
    });
  });

  describe('exclusionKindSchema', () => {
    it('accepts valid exclusion kinds', () => {
      expect(exclusionKindSchema.parse('platform')).toBe('platform');
      expect(exclusionKindSchema.parse('version')).toBe('version');
      expect(exclusionKindSchema.parse('context')).toBe('context');
      expect(exclusionKindSchema.parse('configuration')).toBe('configuration');
      expect(exclusionKindSchema.parse('other')).toBe('other');
    });

    it('rejects invalid exclusion kind', () => {
      expect(() => exclusionKindSchema.parse('invalid')).toThrow();
    });
  });

  describe('evidenceKindSchema', () => {
    it('accepts valid evidence kinds', () => {
      expect(evidenceKindSchema.parse('issue')).toBe('issue');
      expect(evidenceKindSchema.parse('incident')).toBe('incident');
      expect(evidenceKindSchema.parse('cve')).toBe('cve');
      expect(evidenceKindSchema.parse('documentation')).toBe('documentation');
      expect(evidenceKindSchema.parse('test')).toBe('test');
      expect(evidenceKindSchema.parse('commit')).toBe('commit');
      expect(evidenceKindSchema.parse('other')).toBe('other');
    });

    it('rejects invalid evidence kind', () => {
      expect(() => evidenceKindSchema.parse('invalid')).toThrow();
    });
  });

  describe('versionConstraintSchema', () => {
    it('accepts valid semver range', () => {
      const constraint = versionConstraintSchema.parse({
        package: 'react',
        range: '>=16.8.0',
      });
      expect(constraint.package).toBe('react');
      expect(constraint.range).toBe('>=16.8.0');
    });

    it('accepts with optional note', () => {
      const constraint = versionConstraintSchema.parse({
        package: 'node',
        range: '>=18',
        note: 'Required for native fetch',
      });
      expect(constraint.note).toBe('Required for native fetch');
    });

    it('rejects empty package name', () => {
      expect(() =>
        versionConstraintSchema.parse({
          package: '',
          range: '>=1.0.0',
        }),
      ).toThrow();
    });

    it('rejects empty range', () => {
      expect(() =>
        versionConstraintSchema.parse({
          package: 'react',
          range: '',
        }),
      ).toThrow();
    });

    it('rejects package over 128 chars', () => {
      expect(() =>
        versionConstraintSchema.parse({
          package: 'a'.repeat(129),
          range: '>=1.0.0',
        }),
      ).toThrow();
    });

    it('rejects range over 64 chars', () => {
      expect(() =>
        versionConstraintSchema.parse({
          package: 'react',
          range: 'a'.repeat(65),
        }),
      ).toThrow();
    });
  });

  describe('boundaryConditionSchema', () => {
    it('accepts required condition', () => {
      const condition = boundaryConditionSchema.parse({
        description: 'Admin access required',
      });
      expect(condition.description).toBe('Admin access required');
      expect(condition.required).toBe(true);
    });

    it('accepts optional condition', () => {
      const condition = boundaryConditionSchema.parse({
        description: 'Docker installed',
        required: false,
      });
      expect(condition.required).toBe(false);
    });

    it('defaults required to true', () => {
      const condition = boundaryConditionSchema.parse({
        description: 'Test',
      });
      expect(condition.required).toBe(true);
    });

    it('accepts with kind', () => {
      const condition = boundaryConditionSchema.parse({
        description: 'Test',
        kind: 'permission',
      });
      expect(condition.kind).toBe('permission');
    });

    it('rejects empty description', () => {
      expect(() =>
        boundaryConditionSchema.parse({
          description: '',
        }),
      ).toThrow();
    });

    it('rejects description over 280 chars', () => {
      expect(() =>
        boundaryConditionSchema.parse({
          description: 'a'.repeat(281),
        }),
      ).toThrow();
    });
  });

  describe('signalMatcherSchema', () => {
    it('accepts keyword pattern', () => {
      const signal = signalMatcherSchema.parse({
        pattern: 'ECONNREFUSED',
      });
      expect(signal.pattern).toBe('ECONNREFUSED');
      expect(signal.kind).toBe('keyword');
    });

    it('defaults kind to keyword', () => {
      const signal = signalMatcherSchema.parse({
        pattern: 'test',
      });
      expect(signal.kind).toBe('keyword');
    });

    it('accepts regex pattern', () => {
      const signal = signalMatcherSchema.parse({
        pattern: '^Error:.*$',
        kind: 'regex',
      });
      expect(signal.kind).toBe('regex');
    });

    it('accepts error-code pattern', () => {
      const signal = signalMatcherSchema.parse({
        pattern: 'ENOENT',
        kind: 'error-code',
      });
      expect(signal.kind).toBe('error-code');
    });

    it('accepts with description', () => {
      const signal = signalMatcherSchema.parse({
        pattern: 'test',
        description: 'When this fires',
      });
      expect(signal.description).toBe('When this fires');
    });

    it('rejects empty pattern', () => {
      expect(() =>
        signalMatcherSchema.parse({
          pattern: '',
        }),
      ).toThrow();
    });

    it('rejects pattern over 500 chars', () => {
      expect(() =>
        signalMatcherSchema.parse({
          pattern: 'a'.repeat(501),
        }),
      ).toThrow();
    });
  });

  describe('exclusionRuleSchema', () => {
    it('accepts valid exclusion', () => {
      const exclusion = exclusionRuleSchema.parse({
        description: 'Not for Windows',
      });
      expect(exclusion.description).toBe('Not for Windows');
    });

    it('accepts with kind', () => {
      const exclusion = exclusionRuleSchema.parse({
        description: 'SSR only',
        kind: 'context',
      });
      expect(exclusion.kind).toBe('context');
    });

    it('rejects empty description', () => {
      expect(() =>
        exclusionRuleSchema.parse({
          description: '',
        }),
      ).toThrow();
    });
  });

  describe('evidenceReferenceSchema', () => {
    it('accepts valid evidence with URL', () => {
      const evidence = evidenceReferenceSchema.parse({
        kind: 'issue',
        identifier: '123',
        url: 'https://github.com/org/repo/issues/123',
      });
      expect(evidence.kind).toBe('issue');
      expect(evidence.identifier).toBe('123');
      expect(evidence.url).toBe('https://github.com/org/repo/issues/123');
    });

    it('accepts evidence without URL', () => {
      const evidence = evidenceReferenceSchema.parse({
        kind: 'incident',
        identifier: 'INC-2024-001',
      });
      expect(evidence.identifier).toBe('INC-2024-001');
      expect(evidence.url).toBeUndefined();
    });

    it('accepts all evidence kinds', () => {
      const kinds = [
        'issue',
        'incident',
        'cve',
        'documentation',
        'test',
        'commit',
        'other',
      ] as const;
      for (const kind of kinds) {
        const evidence = evidenceReferenceSchema.parse({
          kind,
          identifier: 'test',
        });
        expect(evidence.kind).toBe(kind);
      }
    });

    it('rejects empty identifier', () => {
      expect(() =>
        evidenceReferenceSchema.parse({
          kind: 'issue',
          identifier: '',
        }),
      ).toThrow();
    });

    it('rejects invalid URL', () => {
      expect(() =>
        evidenceReferenceSchema.parse({
          kind: 'issue',
          identifier: '123',
          url: 'not-a-url',
        }),
      ).toThrow();
    });

    it('rejects identifier over 128 chars', () => {
      expect(() =>
        evidenceReferenceSchema.parse({
          kind: 'issue',
          identifier: 'a'.repeat(129),
        }),
      ).toThrow();
    });
  });

  describe('boundarySchema', () => {
    it('defaults all layers to empty arrays', () => {
      const boundary = boundarySchema.parse({});

      expect(boundary.context).toEqual([]);
      expect(boundary.versions).toEqual([]);
      expect(boundary.prerequisites).toEqual([]);
      expect(boundary.signals).toEqual([]);
      expect(boundary.exclusions).toEqual([]);
      expect(boundary.evidence).toEqual([]);
    });

    it('accepts complete boundary with all layers', () => {
      const boundary = boundarySchema.parse({
        context: ['frontend', 'production'],
        versions: [{ package: 'react', range: '>=16.8.0' }],
        prerequisites: [{ description: 'Admin access required' }],
        signals: [{ pattern: 'ECONNREFUSED', kind: 'error-code' }],
        exclusions: [{ description: 'Not for SSR' }],
        evidence: [{ kind: 'issue', identifier: '123' }],
      });

      expect(boundary.context).toHaveLength(2);
      expect(boundary.versions).toHaveLength(1);
      expect(boundary.prerequisites).toHaveLength(1);
      expect(boundary.signals).toHaveLength(1);
      expect(boundary.exclusions).toHaveLength(1);
      expect(boundary.evidence).toHaveLength(1);
    });

    it('rejects context over 10 items', () => {
      expect(() =>
        boundarySchema.parse({
          context: Array(11).fill('item'),
        }),
      ).toThrow();
    });

    it('rejects signals over 20 items', () => {
      expect(() =>
        boundarySchema.parse({
          signals: Array(21).fill({ pattern: 'test' }),
        }),
      ).toThrow();
    });

    it('rejects versions over 10 items', () => {
      expect(() =>
        boundarySchema.parse({
          versions: Array(11).fill({ package: 'react', range: '>=1.0.0' }),
        }),
      ).toThrow();
    });

    it('rejects context item over 64 chars', () => {
      expect(() =>
        boundarySchema.parse({
          context: ['a'.repeat(65)],
        }),
      ).toThrow();
    });

    it('validates nested schema', () => {
      expect(() =>
        boundarySchema.parse({
          versions: [{ package: '', range: '>=1.0.0' }],
        }),
      ).toThrow();
    });
  });

  describe('boundaryContextSchema', () => {
    it('accepts valid context with all fields', () => {
      const ctx = boundaryContextSchema.parse({
        contexts: ['frontend', 'production'],
        platform: 'linux',
        versions: [{ package: 'react', version: '18.0.0' }],
      });
      expect(ctx.contexts).toEqual(['frontend', 'production']);
      expect(ctx.platform).toBe('linux');
      expect(ctx.versions).toHaveLength(1);
    });

    it('accepts context with only contexts field', () => {
      const ctx = boundaryContextSchema.parse({ contexts: ['backend'] });
      expect(ctx.contexts).toEqual(['backend']);
      expect(ctx.platform).toBeUndefined();
      expect(ctx.versions).toBeUndefined();
    });

    it('accepts context with only platform field', () => {
      const ctx = boundaryContextSchema.parse({ platform: 'darwin' });
      expect(ctx.platform).toBe('darwin');
    });

    it('accepts context with only versions field', () => {
      const ctx = boundaryContextSchema.parse({
        versions: [{ package: 'node', version: '22.0.0' }],
      });
      expect(ctx.versions).toHaveLength(1);
    });

    it('accepts empty versions array', () => {
      const ctx = boundaryContextSchema.parse({ versions: [] });
      expect(ctx.versions).toEqual([]);
    });

    it('accepts empty object (all optional)', () => {
      const ctx = boundaryContextSchema.parse({});
      expect(ctx.contexts).toBeUndefined();
      expect(ctx.platform).toBeUndefined();
      expect(ctx.versions).toBeUndefined();
    });

    it('rejects invalid platform type', () => {
      expect(() => boundaryContextSchema.parse({ platform: 123 })).toThrow();
    });

    it('rejects context item over 64 chars', () => {
      expect(() => boundaryContextSchema.parse({ contexts: ['a'.repeat(65)] })).toThrow();
    });

    it('rejects empty package in version query', () => {
      expect(() =>
        boundaryContextSchema.parse({
          versions: [{ package: '', version: '1.0.0' }],
        }),
      ).toThrow();
    });
  });

  describe('boundaryExplanationSchema', () => {
    it('accepts valid explanation with all fields', () => {
      const expl = boundaryExplanationSchema.parse({
        checked: true,
        requiredSatisfied: false,
        warnings: ['Version mismatch: requires >=16'],
        boosts: ['Context match: frontend'],
      });
      expect(expl.checked).toBe(true);
      expect(expl.requiredSatisfied).toBe(false);
      expect(expl.warnings).toHaveLength(1);
      expect(expl.boosts).toHaveLength(1);
    });

    it('accepts explanation with empty arrays', () => {
      const expl = boundaryExplanationSchema.parse({
        checked: false,
        requiredSatisfied: true,
        warnings: [],
        boosts: [],
      });
      expect(expl.warnings).toEqual([]);
      expect(expl.boosts).toEqual([]);
    });

    it('rejects missing checked field', () => {
      expect(() =>
        boundaryExplanationSchema.parse({
          requiredSatisfied: true,
          warnings: [],
          boosts: [],
        }),
      ).toThrow();
    });

    it('rejects wrong type for warnings', () => {
      expect(() =>
        boundaryExplanationSchema.parse({
          checked: true,
          requiredSatisfied: true,
          warnings: 'not-an-array',
          boosts: [],
        }),
      ).toThrow();
    });
  });

  describe('boundaryMetaSchema', () => {
    it('aliases boundarySchema (parses same data)', () => {
      const data = {
        context: ['frontend'],
        versions: [{ package: 'react', range: '>=16.8.0' }],
        prerequisites: [],
        signals: [],
        exclusions: [],
        evidence: [],
      };
      const meta = boundaryMetaSchema.parse(data);
      expect(meta.context).toEqual(['frontend']);
      expect(meta.versions).toHaveLength(1);
    });

    it('defaults all layers to empty arrays like boundarySchema', () => {
      const meta = boundaryMetaSchema.parse({});
      expect(meta.context).toEqual([]);
      expect(meta.versions).toEqual([]);
      expect(meta.prerequisites).toEqual([]);
      expect(meta.signals).toEqual([]);
      expect(meta.exclusions).toEqual([]);
      expect(meta.evidence).toEqual([]);
    });
  });
});
