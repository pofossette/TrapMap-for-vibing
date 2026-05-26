import { describe, expect, it } from 'vitest';

import {
  clientManifestReferenceSchema,
  clientManifestScriptSchema,
  scriptWithPolicyMetadataSchema,
  skillArtifactDerivedSchema,
  skillArtifactFileSchema,
  skillArtifactMetadataSchema,
  skillArtifactRevisionSchema,
} from './artifacts.js';

const validHex64 = 'a'.repeat(64);

describe('artifacts schema fixes', () => {
  // Bug 1: skillArtifactFileSchema — sha256 must be hex
  describe('skillArtifactFileSchema sha256 hex regex', () => {
    const base = {
      path: 'references/doc.md',
      kind: 'reference' as const,
      sha256: validHex64,
      sizeBytes: 100,
      mediaType: 'text/markdown',
      source: 'references/' as const,
      includeInDerivation: true,
      activationOnly: false,
    };

    it('accepts valid lowercase hex sha256', () => {
      const result = skillArtifactFileSchema.parse(base);
      expect(result.sha256).toBe(validHex64);
    });

    it('rejects uppercase hex sha256', () => {
      expect(() => skillArtifactFileSchema.parse({ ...base, sha256: 'A'.repeat(64) })).toThrow();
    });

    it('rejects non-hex characters in sha256', () => {
      expect(() =>
        skillArtifactFileSchema.parse({ ...base, sha256: 'g' + 'a'.repeat(63) }),
      ).toThrow();
    });

    it('rejects sha256 that is too short', () => {
      expect(() => skillArtifactFileSchema.parse({ ...base, sha256: 'a'.repeat(63) })).toThrow();
    });

    it('rejects sha256 that is too long', () => {
      expect(() => skillArtifactFileSchema.parse({ ...base, sha256: 'a'.repeat(65) })).toThrow();
    });
  });

  // Bug 2: skillArtifactDerivedSchema — sourceHash must be hex
  describe('skillArtifactDerivedSchema sourceHash hex regex', () => {
    it('accepts valid lowercase hex sourceHash', () => {
      const result = skillArtifactDerivedSchema.parse({
        profile: null,
        capsules: [],
        clientManifest: null,
        sourceHash: validHex64,
        derivedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.sourceHash).toBe(validHex64);
    });

    it('rejects uppercase hex sourceHash', () => {
      expect(() =>
        skillArtifactDerivedSchema.parse({
          profile: null,
          capsules: [],
          clientManifest: null,
          sourceHash: 'A'.repeat(64),
          derivedAt: '2025-01-01T00:00:00.000Z',
        }),
      ).toThrow();
    });

    it('rejects non-hex sourceHash', () => {
      expect(() =>
        skillArtifactDerivedSchema.parse({
          profile: null,
          capsules: [],
          clientManifest: null,
          sourceHash: 'z'.repeat(64),
          derivedAt: '2025-01-01T00:00:00.000Z',
        }),
      ).toThrow();
    });
  });

  // Bug 3: clientManifestScriptSchema — path rejects absolute + sha256 hex
  describe('clientManifestScriptSchema', () => {
    const base = {
      path: 'scripts/cleanup.sh',
      sha256: validHex64,
      capability: 'Docker cleanup',
      defaultPolicy: 'client-executable' as const,
    };

    it('accepts valid relative path and hex sha256', () => {
      const result = clientManifestScriptSchema.parse(base);
      expect(result.path).toBe('scripts/cleanup.sh');
      expect(result.sha256).toBe(validHex64);
    });

    it('rejects Unix absolute path', () => {
      expect(() =>
        clientManifestScriptSchema.parse({ ...base, path: '/usr/bin/script.sh' }),
      ).toThrow();
    });

    it('rejects Windows absolute path', () => {
      expect(() =>
        clientManifestScriptSchema.parse({ ...base, path: 'C:\\Users\\script.sh' }),
      ).toThrow();
    });

    it('rejects uppercase hex sha256', () => {
      expect(() => clientManifestScriptSchema.parse({ ...base, sha256: 'A'.repeat(64) })).toThrow();
    });

    it('rejects non-hex sha256', () => {
      expect(() => clientManifestScriptSchema.parse({ ...base, sha256: 'z'.repeat(64) })).toThrow();
    });
  });

  // Bug 4: skillArtifactRevisionSchema — derived.sourceHash must match sourceHash
  describe('skillArtifactRevisionSchema sourceHash consistency', () => {
    const baseRevision = {
      revision: 1,
      sourceHash: validHex64,
      files: [
        {
          path: 'SKILL.md',
          kind: 'skill-markdown' as const,
          sha256: validHex64,
          sizeBytes: 100,
          mediaType: 'text/markdown',
          source: 'SKILL.md' as const,
          includeInDerivation: true,
          activationOnly: false,
        },
      ],
      submittedAt: '2025-01-01T00:00:00.000Z',
      submittedBy: { id: 'u1', handle: 'alice', securityLevel: 0 },
      derived: {
        profile: null,
        capsules: [],
        clientManifest: null,
        sourceHash: validHex64,
        derivedAt: '2025-01-01T00:00:00.000Z',
      },
    };

    it('accepts when derived.sourceHash matches top-level sourceHash', () => {
      const result = skillArtifactRevisionSchema.parse(baseRevision);
      expect(result.sourceHash).toBe(result.derived!.sourceHash);
    });

    it('accepts when derived is null', () => {
      const result = skillArtifactRevisionSchema.parse({
        ...baseRevision,
        derived: null,
      });
      expect(result.derived).toBeNull();
    });

    it('rejects when derived.sourceHash differs from top-level sourceHash', () => {
      expect(() =>
        skillArtifactRevisionSchema.parse({
          ...baseRevision,
          derived: {
            ...baseRevision.derived,
            sourceHash: 'b'.repeat(64),
          },
        }),
      ).toThrow();
    });
  });

  // Bug 5: clientManifestReferenceSchema — .strict() rejects extra keys
  describe('clientManifestReferenceSchema strict mode', () => {
    const base = {
      path: 'references/doc.md',
      sha256: validHex64,
      sizeBytes: 100,
      mediaType: 'text/markdown',
    };

    it('accepts valid reference object', () => {
      const result = clientManifestReferenceSchema.parse(base);
      expect(result.path).toBe('references/doc.md');
    });

    it('rejects object with extra keys', () => {
      expect(() =>
        clientManifestReferenceSchema.parse({ ...base, extra: 'not allowed' }),
      ).toThrow();
    });

    it('rejects uppercase hex sha256', () => {
      expect(() =>
        clientManifestReferenceSchema.parse({ ...base, sha256: 'A'.repeat(64) }),
      ).toThrow();
    });
  });

  // Bug 6: skillArtifactMetadataSchema — submissionCount >= resubmissionCount
  describe('skillArtifactMetadataSchema count relationship', () => {
    const base = {
      sourceKind: 'skill-directory' as const,
      submissionCount: 5,
      resubmissionCount: 2,
      revisionCount: 3,
    };

    it('accepts when submissionCount > resubmissionCount', () => {
      const result = skillArtifactMetadataSchema.parse(base);
      expect(result.submissionCount).toBe(5);
      expect(result.resubmissionCount).toBe(2);
    });

    it('accepts when submissionCount === resubmissionCount', () => {
      const result = skillArtifactMetadataSchema.parse({
        ...base,
        submissionCount: 3,
        resubmissionCount: 3,
      });
      expect(result.submissionCount).toBe(3);
    });

    it('rejects when submissionCount < resubmissionCount', () => {
      expect(() =>
        skillArtifactMetadataSchema.parse({
          ...base,
          submissionCount: 1,
          resubmissionCount: 5,
        }),
      ).toThrow();
    });
  });

  // Bug 7: scriptWithPolicyMetadataSchema — path rejects absolute + sha256 hex
  describe('scriptWithPolicyMetadataSchema', () => {
    const base = {
      path: 'scripts/cleanup.sh',
      sha256: validHex64,
      capability: 'Docker cleanup',
      defaultPolicy: 'client-executable' as const,
    };

    it('accepts valid relative path and hex sha256', () => {
      const result = scriptWithPolicyMetadataSchema.parse(base);
      expect(result.path).toBe('scripts/cleanup.sh');
      expect(result.sha256).toBe(validHex64);
    });

    it('rejects Unix absolute path', () => {
      expect(() =>
        scriptWithPolicyMetadataSchema.parse({ ...base, path: '/usr/bin/script.sh' }),
      ).toThrow();
    });

    it('rejects Windows absolute path', () => {
      expect(() =>
        scriptWithPolicyMetadataSchema.parse({ ...base, path: 'C:\\Users\\script.sh' }),
      ).toThrow();
    });

    it('rejects uppercase hex sha256', () => {
      expect(() =>
        scriptWithPolicyMetadataSchema.parse({ ...base, sha256: 'A'.repeat(64) }),
      ).toThrow();
    });

    it('rejects non-hex sha256', () => {
      expect(() =>
        scriptWithPolicyMetadataSchema.parse({ ...base, sha256: 'z'.repeat(64) }),
      ).toThrow();
    });
  });
});
