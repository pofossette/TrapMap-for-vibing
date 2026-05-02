import { describe, expect, it } from 'vitest';
import {
  boundaryMetaSchema,
  boundarySchema,
  conditionOperatorSchema,
  conditionSchema,
  constraintModeSchema,
  contextLayerSchema,
  evidenceEntrySchema,
  evidenceLayerSchema,
  evidenceTypeSchema,
  exclusionSchema,
  exclusionsLayerSchema,
  prerequisiteSchema,
  prerequisitesLayerSchema,
  signalsLayerSchema,
  versionConstraintSchema,
  versionsLayerSchema,
} from './boundary.js';
import { knowledgeEntrySchema } from './knowledge.js';
import { skillArtifactSchema } from './artifacts.js';

describe('boundary schema contracts', () => {
  describe('conditionOperatorSchema', () => {
    it('accepts valid condition operators', () => {
      expect(conditionOperatorSchema.parse('equals')).toBe('equals');
      expect(conditionOperatorSchema.parse('not-equals')).toBe('not-equals');
      expect(conditionOperatorSchema.parse('contains')).toBe('contains');
      expect(conditionOperatorSchema.parse('not-contains')).toBe('not-contains');
      expect(conditionOperatorSchema.parse('matches')).toBe('matches');
      expect(conditionOperatorSchema.parse('not-matches')).toBe('not-matches');
    });

    it('rejects invalid condition operators', () => {
      expect(() => conditionOperatorSchema.parse('invalid')).toThrow();
    });
  });

  describe('evidenceTypeSchema', () => {
    it('accepts valid evidence types', () => {
      expect(evidenceTypeSchema.parse('user-reported')).toBe('user-reported');
      expect(evidenceTypeSchema.parse('auto-detected')).toBe('auto-detected');
      expect(evidenceTypeSchema.parse('inferred')).toBe('inferred');
      expect(evidenceTypeSchema.parse('reviewed')).toBe('reviewed');
    });

    it('rejects invalid evidence types', () => {
      expect(() => evidenceTypeSchema.parse('invalid')).toThrow();
    });
  });

  describe('constraintModeSchema', () => {
    it('accepts valid constraint modes', () => {
      expect(constraintModeSchema.parse('required')).toBe('required');
      expect(constraintModeSchema.parse('preferred')).toBe('preferred');
      expect(constraintModeSchema.parse('excluded')).toBe('excluded');
    });

    it('rejects invalid constraint modes', () => {
      expect(() => constraintModeSchema.parse('optional')).toThrow();
    });
  });

  describe('contextLayerSchema', () => {
    it('accepts valid context with all fields', () => {
      const context = contextLayerSchema.parse({
        environments: ['production', 'staging'],
        platforms: ['linux', 'darwin'],
        runtimes: ['node', 'bun'],
      });

      expect(context.environments).toEqual(['production', 'staging']);
      expect(context.platforms).toEqual(['linux', 'darwin']);
      expect(context.runtimes).toEqual(['node', 'bun']);
    });

    it('accepts empty context', () => {
      const context = contextLayerSchema.parse({});
      expect(context.environments).toBeUndefined();
    });

    it('rejects too many environments', () => {
      expect(() =>
        contextLayerSchema.parse({
          environments: Array(11).fill('env'),
        }),
      ).toThrow();
    });

    it('rejects environment string exceeding max length', () => {
      expect(() =>
        contextLayerSchema.parse({
          environments: ['a'.repeat(65)],
        }),
      ).toThrow();
    });
  });

  describe('versionConstraintSchema', () => {
    it('accepts valid version constraint with required fields', () => {
      const constraint = versionConstraintSchema.parse({
        dependency: 'react',
        range: '^18.0.0',
      });

      expect(constraint.dependency).toBe('react');
      expect(constraint.range).toBe('^18.0.0');
      expect(constraint.mode).toBe('required');
    });

    it('accepts version constraint with all optional fields', () => {
      const constraint = versionConstraintSchema.parse({
        dependency: 'node',
        range: '>=18',
        displayName: 'Node.js 18+',
        mode: 'preferred',
      });

      expect(constraint.displayName).toBe('Node.js 18+');
      expect(constraint.mode).toBe('preferred');
    });

    it('rejects missing dependency', () => {
      expect(() =>
        versionConstraintSchema.parse({
          range: '^1.0.0',
        }),
      ).toThrow();
    });

    it('rejects missing range', () => {
      expect(() =>
        versionConstraintSchema.parse({
          dependency: 'react',
        }),
      ).toThrow();
    });
  });

  describe('versionsLayerSchema', () => {
    it('accepts valid versions layer with constraints', () => {
      const versions = versionsLayerSchema.parse({
        constraints: [
          { dependency: 'react', range: '^18.0.0' },
          { dependency: 'node', range: '>=16' },
        ],
      });

      expect(versions.constraints).toHaveLength(2);
    });

    it('rejects too many constraints', () => {
      expect(() =>
        versionsLayerSchema.parse({
          constraints: Array(21).fill({ dependency: 'pkg', range: '*' }),
        }),
      ).toThrow();
    });
  });

  describe('conditionSchema', () => {
    it('accepts valid condition', () => {
      const condition = conditionSchema.parse({
        field: 'environment',
        operator: 'equals',
        value: 'production',
      });

      expect(condition.field).toBe('environment');
      expect(condition.operator).toBe('equals');
      expect(condition.value).toBe('production');
    });

    it('rejects missing fields', () => {
      expect(() => conditionSchema.parse({ field: 'test' })).toThrow();
    });
  });

  describe('prerequisiteSchema', () => {
    it('accepts valid prerequisite with required fields', () => {
      const prereq = prerequisiteSchema.parse({
        id: 'docker-desktop',
      });

      expect(prereq.id).toBe('docker-desktop');
      expect(prereq.mode).toBe('required');
    });

    it('accepts prerequisite with condition', () => {
      const prereq = prerequisiteSchema.parse({
        id: 'docker-running',
        displayName: 'Docker Desktop running',
        mode: 'required',
        condition: {
          field: 'docker.status',
          operator: 'equals',
          value: 'running',
        },
      });

      expect(prereq.condition?.field).toBe('docker.status');
    });
  });

  describe('prerequisitesLayerSchema', () => {
    it('accepts valid prerequisites layer', () => {
      const prereqs = prerequisitesLayerSchema.parse({
        items: [{ id: 'docker' }, { id: 'node' }],
      });

      expect(prereqs.items).toHaveLength(2);
    });
  });

  describe('signalsLayerSchema', () => {
    it('accepts valid signals layer', () => {
      const signals = signalsLayerSchema.parse({
        keywords: ['docker', 'container'],
        errorPatterns: ['ECONNREFUSED', 'ENOTFOUND'],
        symptoms: ['connection timeout', 'port already in use'],
      });

      expect(signals.keywords).toEqual(['docker', 'container']);
      expect(signals.errorPatterns).toHaveLength(2);
    });

    it('accepts partial signals', () => {
      const signals = signalsLayerSchema.parse({
        keywords: ['test'],
      });

      expect(signals.keywords).toEqual(['test']);
      expect(signals.errorPatterns).toBeUndefined();
    });
  });

  describe('exclusionSchema', () => {
    it('accepts valid exclusion', () => {
      const exclusion = exclusionSchema.parse({
        id: 'wsl-mode',
        reason: 'Not compatible with WSL file system',
      });

      expect(exclusion.id).toBe('wsl-mode');
      expect(exclusion.reason).toBe('Not compatible with WSL file system');
    });

    it('accepts exclusion with condition', () => {
      const exclusion = exclusionSchema.parse({
        id: 'rosetta',
        condition: {
          field: 'arch',
          operator: 'equals',
          value: 'arm64',
        },
      });

      expect(exclusion.condition?.value).toBe('arm64');
    });
  });

  describe('exclusionsLayerSchema', () => {
    it('accepts valid exclusions layer', () => {
      const exclusions = exclusionsLayerSchema.parse({
        items: [{ id: 'windows' }, { id: 'wsl' }],
      });

      expect(exclusions.items).toHaveLength(2);
    });
  });

  describe('evidenceEntrySchema', () => {
    it('accepts valid evidence entry with required fields', () => {
      const evidence = evidenceEntrySchema.parse({
        source: 'user-report',
        type: 'user-reported',
        confidence: 0.8,
      });

      expect(evidence.source).toBe('user-report');
      expect(evidence.type).toBe('user-reported');
      expect(evidence.confidence).toBe(0.8);
    });

    it('accepts evidence with all optional fields', () => {
      const evidence = evidenceEntrySchema.parse({
        source: 'auto-detection',
        type: 'auto-detected',
        confidence: 0.95,
        timestamp: '2026-05-02T00:00:00Z',
        details: 'Detected from CI failure logs',
      });

      expect(evidence.timestamp).toBe('2026-05-02T00:00:00Z');
      expect(evidence.details).toBe('Detected from CI failure logs');
    });

    it('rejects confidence below 0', () => {
      expect(() =>
        evidenceEntrySchema.parse({
          source: 'test',
          type: 'user-reported',
          confidence: -0.1,
        }),
      ).toThrow();
    });

    it('rejects confidence above 1', () => {
      expect(() =>
        evidenceEntrySchema.parse({
          source: 'test',
          type: 'user-reported',
          confidence: 1.1,
        }),
      ).toThrow();
    });
  });

  describe('evidenceLayerSchema', () => {
    it('accepts valid evidence layer', () => {
      const evidence = evidenceLayerSchema.parse({
        entries: [
          { source: 'user', type: 'user-reported', confidence: 0.9 },
          { source: 'system', type: 'auto-detected', confidence: 0.7 },
        ],
      });

      expect(evidence.entries).toHaveLength(2);
    });

    it('rejects too many evidence entries', () => {
      expect(() =>
        evidenceLayerSchema.parse({
          entries: Array(11).fill({ source: 'x', type: 'user-reported', confidence: 0.5 }),
        }),
      ).toThrow();
    });
  });

  describe('boundarySchema', () => {
    it('accepts empty boundary', () => {
      const boundary = boundarySchema.parse({});
      expect(boundary.context).toBeUndefined();
    });

    it('accepts boundary with all layers', () => {
      const boundary = boundarySchema.parse({
        context: { environments: ['production'] },
        versions: { constraints: [{ dependency: 'node', range: '>=18' }] },
        prerequisites: { items: [{ id: 'docker' }] },
        signals: { keywords: ['test'] },
        exclusions: { items: [{ id: 'windows' }] },
        evidence: { entries: [{ source: 'user', type: 'user-reported', confidence: 0.9 }] },
      });

      expect(boundary.context?.environments).toEqual(['production']);
      expect(boundary.versions?.constraints).toHaveLength(1);
      expect(boundary.prerequisites?.items).toHaveLength(1);
      expect(boundary.signals?.keywords).toEqual(['test']);
      expect(boundary.exclusions?.items).toHaveLength(1);
      expect(boundary.evidence?.entries).toHaveLength(1);
    });

    it('accepts boundary with partial layers', () => {
      const boundary = boundarySchema.parse({
        context: { platforms: ['linux'] },
        signals: { keywords: ['docker'] },
      });

      expect(boundary.context?.platforms).toEqual(['linux']);
      expect(boundary.versions).toBeUndefined();
    });
  });

  describe('boundaryMetaSchema', () => {
    it('accepts valid boundary meta with required fields', () => {
      const meta = boundaryMetaSchema.parse({
        boundary: { context: { environments: ['production'] } },
        lastUpdated: '2026-05-02T00:00:00Z',
      });

      expect(meta.boundary.context?.environments).toEqual(['production']);
      expect(meta.lastUpdated).toBe('2026-05-02T00:00:00Z');
    });

    it('accepts boundary meta with all optional fields', () => {
      const meta = boundaryMetaSchema.parse({
        boundary: {},
        lastUpdated: '2026-05-02T00:00:00Z',
        updatedBy: 'user-123',
        notes: 'Updated for v2 API compatibility',
      });

      expect(meta.updatedBy).toBe('user-123');
      expect(meta.notes).toBe('Updated for v2 API compatibility');
    });

    it('rejects missing boundary', () => {
      expect(() =>
        boundaryMetaSchema.parse({
          lastUpdated: '2026-05-02T00:00:00Z',
        }),
      ).toThrow();
    });

    it('rejects missing lastUpdated', () => {
      expect(() =>
        boundaryMetaSchema.parse({
          boundary: {},
        }),
      ).toThrow();
    });
  });
});

describe('KnowledgeEntry with boundaryMeta', () => {
  it('accepts entry with boundary metadata', () => {
    const entry = knowledgeEntrySchema.parse({
      id: 'entry-1',
      teamId: null,
      scope: 'global',
      labels: ['docker', 'networking'],
      shortcut: 'Docker network conflict',
      detail: 'Container network conflicts with host network',
      requiredLevel: 5,
      lifecycleState: 'approved',
      owner: { id: 'user-1', handle: 'alice', securityLevel: 5 },
      latestRevision: {
        revision: 1,
        submittedAt: '2026-05-02T00:00:00Z',
        submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 5 },
        shortcut: 'Docker network conflict',
        detail: 'Container network conflicts with host network',
        labels: ['docker', 'networking'],
        reviewNotes: [],
      },
      history: [
        {
          revision: 1,
          submittedAt: '2026-05-02T00:00:00Z',
          submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 5 },
          shortcut: 'Docker network conflict',
          detail: 'Container network conflicts with host network',
          labels: ['docker', 'networking'],
          reviewNotes: [],
        },
      ],
      metadata: {
        scopeLabel: 'global-constraint',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: null,
        latestSubmittedAt: null,
        latestReviewedAt: null,
        latestDecision: null,
      },
      agentReview: null,
      boundaryMeta: {
        boundary: {
          context: { environments: ['production'] },
          versions: { constraints: [{ dependency: 'docker', range: '>=20.0' }] },
        },
        lastUpdated: '2026-05-02T00:00:00Z',
        updatedBy: 'user-1',
      },
      createdAt: '2026-05-02T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
    });

    expect(entry.boundaryMeta?.boundary.context?.environments).toEqual(['production']);
    expect(entry.boundaryMeta?.boundary.versions?.constraints?.[0]?.dependency).toBe('docker');
  });

  it('accepts entry without boundary metadata for backward compatibility', () => {
    const entry = knowledgeEntrySchema.parse({
      id: 'entry-2',
      teamId: null,
      scope: 'global',
      labels: ['test'],
      shortcut: 'Test entry',
      detail: 'Test detail',
      requiredLevel: 0,
      lifecycleState: 'approved',
      owner: { id: 'user-1', handle: 'alice', securityLevel: 5 },
      latestRevision: {
        revision: 1,
        submittedAt: '2026-05-02T00:00:00Z',
        submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 5 },
        shortcut: 'Test entry',
        detail: 'Test detail',
        labels: ['test'],
        reviewNotes: [],
      },
      history: [
        {
          revision: 1,
          submittedAt: '2026-05-02T00:00:00Z',
          submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 5 },
          shortcut: 'Test entry',
          detail: 'Test detail',
          labels: ['test'],
          reviewNotes: [],
        },
      ],
      metadata: {
        scopeLabel: 'global-constraint',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: null,
        latestSubmittedAt: null,
        latestReviewedAt: null,
        latestDecision: null,
      },
      agentReview: null,
      createdAt: '2026-05-02T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
    });

    expect(entry.boundaryMeta).toBeUndefined();
  });

  it('accepts entry with null boundaryMeta', () => {
    const entry = knowledgeEntrySchema.parse({
      id: 'entry-3',
      teamId: null,
      scope: 'global',
      labels: ['test'],
      shortcut: 'Test entry',
      detail: 'Test detail',
      requiredLevel: 0,
      lifecycleState: 'approved',
      owner: { id: 'user-1', handle: 'alice', securityLevel: 5 },
      latestRevision: {
        revision: 1,
        submittedAt: '2026-05-02T00:00:00Z',
        submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 5 },
        shortcut: 'Test entry',
        detail: 'Test detail',
        labels: ['test'],
        reviewNotes: [],
      },
      history: [
        {
          revision: 1,
          submittedAt: '2026-05-02T00:00:00Z',
          submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 5 },
          shortcut: 'Test entry',
          detail: 'Test detail',
          labels: ['test'],
          reviewNotes: [],
        },
      ],
      metadata: {
        scopeLabel: 'global-constraint',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: null,
        latestSubmittedAt: null,
        latestReviewedAt: null,
        latestDecision: null,
      },
      agentReview: null,
      boundaryMeta: null,
      createdAt: '2026-05-02T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
    });

    expect(entry.boundaryMeta).toBeNull();
  });
});

describe('SkillArtifact with boundaryMeta', () => {
  it('accepts artifact with boundary metadata', () => {
    const artifact = skillArtifactSchema.parse({
      id: 'art-1',
      teamId: null,
      scope: 'project',
      labels: ['typescript', 'testing'],
      title: 'Vitest configuration for ESM',
      slug: 'vitest-esm-config',
      requiredLevel: 3,
      lifecycleState: 'approved',
      owner: { id: 'user-1', handle: 'bob', securityLevel: 5 },
      latestRevision: 1,
      history: [
        {
          revision: 1,
          sourceHash: 'a'.repeat(64),
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown',
              sha256: 'b'.repeat(64),
              sizeBytes: 1024,
              mediaType: 'text/markdown',
              source: 'SKILL.md',
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          submittedAt: '2026-05-02T00:00:00Z',
          submittedBy: { id: 'user-1', handle: 'bob', securityLevel: 5 },
          scriptDescriptors: [],
          derived: null,
        },
      ],
      metadata: {
        sourceKind: 'skill-directory',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: null,
        latestSubmittedAt: null,
        latestReviewedAt: null,
        latestDecision: null,
      },
      agentReview: null,
      boundaryMeta: {
        boundary: {
          context: { runtimes: ['node'] },
          signals: { keywords: ['vitest', 'esm'] },
        },
        lastUpdated: '2026-05-02T00:00:00Z',
      },
      createdAt: '2026-05-02T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
    });

    expect(artifact.boundaryMeta?.boundary.context?.runtimes).toEqual(['node']);
    expect(artifact.boundaryMeta?.boundary.signals?.keywords).toEqual(['vitest', 'esm']);
  });

  it('accepts artifact without boundary metadata for backward compatibility', () => {
    const artifact = skillArtifactSchema.parse({
      id: 'art-2',
      teamId: null,
      scope: 'global',
      labels: ['test'],
      title: 'Test artifact',
      slug: 'test-artifact',
      requiredLevel: 0,
      lifecycleState: 'approved',
      owner: { id: 'user-1', handle: 'bob', securityLevel: 5 },
      latestRevision: 1,
      history: [
        {
          revision: 1,
          sourceHash: 'a'.repeat(64),
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown',
              sha256: 'b'.repeat(64),
              sizeBytes: 1024,
              mediaType: 'text/markdown',
              source: 'SKILL.md',
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          submittedAt: '2026-05-02T00:00:00Z',
          submittedBy: { id: 'user-1', handle: 'bob', securityLevel: 5 },
          scriptDescriptors: [],
          derived: null,
        },
      ],
      metadata: {
        sourceKind: 'skill-directory',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: null,
        latestSubmittedAt: null,
        latestReviewedAt: null,
        latestDecision: null,
      },
      agentReview: null,
      createdAt: '2026-05-02T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
    });

    expect(artifact.boundaryMeta).toBeUndefined();
  });
});
