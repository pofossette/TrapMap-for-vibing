import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type { DerivedSkillCapsuleRecord } from '@trapmap/server/lib/store/enum-types/artifact-records.js';
import { describe, expect, it } from 'vitest';
import {
  ContextualEnrichmentCache,
  buildBaseContentForCache,
  buildContentPrompt,
  buildFallbackPrefix,
  buildManifestPrompt,
  enrichCapsules,
  generateCapsuleContents,
  generateCapsuleManifest,
  generateSingleCapsuleContent,
  parseManifestResponse,
} from './contextual-enrichment.js';
import type { CapsuleManifestItem } from './contextual-enrichment.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockChat(responses: string[]): ChatProvider {
  let callIndex = 0;
  return {
    provider: 'mock',
    isConfigured: true,
    invoke: async (_system: string, _user: string) => {
      if (callIndex >= responses.length) throw new Error('No more mock responses');
      return responses[callIndex++]!;
    },
  };
}

function mockFailingChat(): ChatProvider {
  return {
    provider: 'mock',
    isConfigured: true,
    invoke: async () => {
      throw new Error('LLM call failed');
    },
  };
}

function mockUnconfiguredChat(): ChatProvider {
  return {
    provider: 'fallback',
    isConfigured: false,
    invoke: async () => {
      throw new Error('Should not be called');
    },
  };
}

const sampleManifestItem: CapsuleManifestItem = {
  capsuleIndex: 0,
  title: 'Docker Node Version Mismatch',
  description: 'Resolving version conflicts between Docker and Node.js',
  contentScope: 'Docker containerization with Node.js applications',
  sourceType: 'skill-main',
  sourcePath: 'SKILL.md',
  tags: ['docker', 'node', 'version'],
};

// ---------------------------------------------------------------------------
// buildManifestPrompt
// ---------------------------------------------------------------------------

describe('buildManifestPrompt', () => {
  it('should include document title, labels, and content', () => {
    const prompt = buildManifestPrompt('My Skill', ['docker', 'node'], '# Content here');

    expect(prompt).toContain('My Skill');
    expect(prompt).toContain('docker, node');
    expect(prompt).toContain('# Content here');
  });

  it('should request JSON manifest format', () => {
    const prompt = buildManifestPrompt('Test', [], 'content');

    expect(prompt).toContain('JSON');
    expect(prompt).toContain('capsules');
  });
});

// ---------------------------------------------------------------------------
// buildContentPrompt
// ---------------------------------------------------------------------------

describe('buildContentPrompt', () => {
  it('should include manifest item details', () => {
    const prompt = buildContentPrompt(
      'Docker Skills',
      ['docker'],
      '# Full doc',
      sampleManifestItem,
    );

    expect(prompt).toContain('Docker Node Version Mismatch');
    expect(prompt).toContain('SKILL.md');
    expect(prompt).toContain('# Full doc');
    expect(prompt).toContain('capsule #0');
  });

  it('should include contentScope and tags', () => {
    const prompt = buildContentPrompt('Test', [], 'content', sampleManifestItem);

    expect(prompt).toContain('Docker containerization');
    expect(prompt).toContain('docker, node, version');
  });
});

// ---------------------------------------------------------------------------
// parseManifestResponse
// ---------------------------------------------------------------------------

describe('parseManifestResponse', () => {
  const validManifest = JSON.stringify({
    documentTitle: 'Docker Skills',
    documentLabels: ['docker'],
    capsules: [
      {
        capsuleIndex: 0,
        title: 'Setup',
        description: 'Initial setup',
        contentScope: 'Getting started',
        sourceType: 'skill-main',
        sourcePath: 'SKILL.md',
        tags: ['setup'],
      },
    ],
  });

  it('should parse valid JSON manifest', () => {
    const result = parseManifestResponse(validManifest);

    expect(result).not.toBeNull();
    expect(result!.documentTitle).toBe('Docker Skills');
    expect(result!.capsules).toHaveLength(1);
    expect(result!.capsules[0]!.title).toBe('Setup');
  });

  it('should handle JSON wrapped in markdown fences', () => {
    const wrapped = `\`\`\`json\n${validManifest}\n\`\`\``;
    const result = parseManifestResponse(wrapped);

    expect(result).not.toBeNull();
    expect(result!.documentTitle).toBe('Docker Skills');
  });

  it('should return null for invalid JSON', () => {
    expect(parseManifestResponse('not json')).toBeNull();
  });

  it('should return null for missing required fields', () => {
    const missing = JSON.stringify({ documentTitle: 'Test' });
    expect(parseManifestResponse(missing)).toBeNull();
  });

  it('should return null for invalid sourceType', () => {
    const invalid = JSON.stringify({
      documentTitle: 'Test',
      documentLabels: [],
      capsules: [
        {
          capsuleIndex: 0,
          title: 'Test',
          description: 'Test',
          contentScope: 'Test',
          sourceType: 'invalid',
          sourcePath: 'SKILL.md',
          tags: [],
        },
      ],
    });
    expect(parseManifestResponse(invalid)).toBeNull();
  });

  it('should return null for non-array capsules', () => {
    const invalid = JSON.stringify({
      documentTitle: 'Test',
      documentLabels: [],
      capsules: 'not-array',
    });
    expect(parseManifestResponse(invalid)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateCapsuleManifest
// ---------------------------------------------------------------------------

describe('generateCapsuleManifest', () => {
  const validManifest = JSON.stringify({
    documentTitle: 'Test',
    documentLabels: ['test'],
    capsules: [
      {
        capsuleIndex: 0,
        title: 'Test',
        description: 'Test capsule',
        contentScope: 'General',
        sourceType: 'skill-main',
        sourcePath: 'SKILL.md',
        tags: ['test'],
      },
    ],
  });

  it('should return manifest on successful LLM call', async () => {
    const chat = mockChat([validManifest]);
    const result = await generateCapsuleManifest(chat, 'Test', ['test'], 'content');

    expect(result).not.toBeNull();
    expect(result!.documentTitle).toBe('Test');
  });

  it('should return null when chat is not configured', async () => {
    const chat = mockUnconfiguredChat();
    const result = await generateCapsuleManifest(chat, 'Test', [], 'content');

    expect(result).toBeNull();
  });

  it('should return null when LLM call fails', async () => {
    const chat = mockFailingChat();
    const result = await generateCapsuleManifest(chat, 'Test', [], 'content');

    expect(result).toBeNull();
  });

  it('should return null when LLM returns invalid JSON', async () => {
    const chat = mockChat(['not json at all']);
    const result = await generateCapsuleManifest(chat, 'Test', [], 'content');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildBaseContentForCache
// ---------------------------------------------------------------------------

describe('buildBaseContentForCache', () => {
  it('should include document title, labels, and content', () => {
    const base = buildBaseContentForCache('My Skill', ['docker'], '# Content');

    expect(base).toContain('My Skill');
    expect(base).toContain('docker');
    expect(base).toContain('# Content');
  });

  it('should be consistent for same inputs (prompt cache hit)', () => {
    const a = buildBaseContentForCache('Title', ['label'], 'content');
    const b = buildBaseContentForCache('Title', ['label'], 'content');

    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// generateSingleCapsuleContent
// ---------------------------------------------------------------------------

describe('generateSingleCapsuleContent', () => {
  it('should return contextual prefix on success', async () => {
    const prefix =
      'Docker Skills document — main section on resolving Node.js version mismatches in containers';
    const chat = mockChat([prefix]);
    const result = await generateSingleCapsuleContent(
      chat,
      'Docker Skills',
      ['docker'],
      'content',
      sampleManifestItem,
    );

    expect(result.capsuleIndex).toBe(0);
    expect(result.contextualPrefix).toBe(prefix);
  });

  it('should truncate prefix to 300 chars', async () => {
    const longPrefix = 'x'.repeat(500);
    const chat = mockChat([longPrefix]);
    const result = await generateSingleCapsuleContent(
      chat,
      'Test',
      [],
      'content',
      sampleManifestItem,
    );

    expect(result.contextualPrefix!.length).toBeLessThanOrEqual(300);
  });

  it('should return null when chat is not configured', async () => {
    const chat = mockUnconfiguredChat();
    const result = await generateSingleCapsuleContent(
      chat,
      'Test',
      [],
      'content',
      sampleManifestItem,
    );

    expect(result.contextualPrefix).toBeNull();
    expect(result.capsuleIndex).toBe(0);
  });

  it('should return null when LLM call fails', async () => {
    const chat = mockFailingChat();
    const result = await generateSingleCapsuleContent(
      chat,
      'Test',
      [],
      'content',
      sampleManifestItem,
    );

    expect(result.contextualPrefix).toBeNull();
  });

  it('should return null for empty response', async () => {
    const chat = mockChat(['   ']);
    const result = await generateSingleCapsuleContent(
      chat,
      'Test',
      [],
      'content',
      sampleManifestItem,
    );

    expect(result.contextualPrefix).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateCapsuleContents
// ---------------------------------------------------------------------------

describe('generateCapsuleContents', () => {
  it('should generate content for all capsules', async () => {
    const items: CapsuleManifestItem[] = [
      sampleManifestItem,
      {
        ...sampleManifestItem,
        capsuleIndex: 1,
        title: 'Second',
        sourceType: 'reference',
        sourcePath: 'references/guide.md',
      },
    ];
    const chat = mockChat(['prefix 1', 'prefix 2']);
    const results = await generateCapsuleContents(chat, 'Test', [], 'content', items);

    expect(results).toHaveLength(2);
    expect(results[0]!.contextualPrefix).toBe('prefix 1');
    expect(results[1]!.contextualPrefix).toBe('prefix 2');
  });

  it('should process in batches of maxConcurrent', async () => {
    const items: CapsuleManifestItem[] = Array.from({ length: 5 }, (_, i) => ({
      ...sampleManifestItem,
      capsuleIndex: i,
      title: `Capsule ${i}`,
    }));
    const chat = mockChat(['p0', 'p1', 'p2', 'p3', 'p4']);
    const results = await generateCapsuleContents(chat, 'Test', [], 'content', items, 2);

    expect(results).toHaveLength(5);
    expect(results.every((r) => r.contextualPrefix !== null)).toBe(true);
  });

  it('should handle partial failures gracefully', async () => {
    const items: CapsuleManifestItem[] = [
      sampleManifestItem,
      { ...sampleManifestItem, capsuleIndex: 1, title: 'Second' },
    ];
    // First call always succeeds, second always fails (even with retries)
    let callCount = 0;
    const chat: ChatProvider = {
      provider: 'mock',
      isConfigured: true,
      invoke: async () => {
        callCount++;
        if (callCount >= 2) throw new Error('LLM failed');
        return 'prefix 1';
      },
    };
    const results = await generateCapsuleContents(chat, 'Test', [], 'content', items);

    expect(results).toHaveLength(2);
    expect(results[0]!.contextualPrefix).toBe('prefix 1');
    expect(results[1]!.contextualPrefix).toBeNull();
  });

  it('should return empty array for empty items', async () => {
    const chat = mockChat([]);
    const results = await generateCapsuleContents(chat, 'Test', [], 'content', []);

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildFallbackPrefix
// ---------------------------------------------------------------------------

describe('buildFallbackPrefix', () => {
  it('should generate prefix for skill-main source', () => {
    const prefix = buildFallbackPrefix('Docker Skills', 'skill-main', 'SKILL.md');

    expect(prefix).toBe('Docker Skills — from main document');
  });

  it('should generate prefix for reference source', () => {
    const prefix = buildFallbackPrefix('Docker Skills', 'reference', 'references/guide.md');

    expect(prefix).toBe('Docker Skills — from reference: references/guide.md');
  });

  it('should truncate to 300 characters', () => {
    const longTitle = 'A'.repeat(350);
    const prefix = buildFallbackPrefix(longTitle, 'skill-main', 'SKILL.md');

    expect(prefix.length).toBeLessThanOrEqual(300);
  });
});

// ---------------------------------------------------------------------------
// ContextualEnrichmentCache
// ---------------------------------------------------------------------------

describe('ContextualEnrichmentCache', () => {
  it('should store and retrieve values', () => {
    const cache = new ContextualEnrichmentCache();
    cache.set('abc123', 0, 'test prefix');

    expect(cache.get('abc123', 0)).toBe('test prefix');
    expect(cache.has('abc123', 0)).toBe(true);
  });

  it('should return undefined for missing keys', () => {
    const cache = new ContextualEnrichmentCache();

    expect(cache.get('abc123', 0)).toBeUndefined();
    expect(cache.has('abc123', 0)).toBe(false);
  });

  it('should track size', () => {
    const cache = new ContextualEnrichmentCache();
    expect(cache.size).toBe(0);

    cache.set('abc', 0, 'p0');
    cache.set('abc', 1, 'p1');
    expect(cache.size).toBe(2);
  });

  it('should build deterministic keys', () => {
    const cache = new ContextualEnrichmentCache();
    expect(cache.buildKey('abc', 0)).toBe('abc:0');
    expect(cache.buildKey('abc', 1)).toBe('abc:1');
  });
});

// ---------------------------------------------------------------------------
// enrichCapsules
// ---------------------------------------------------------------------------

describe('enrichCapsules', () => {
  const manifestResponse = JSON.stringify({
    documentTitle: 'Test',
    documentLabels: ['test'],
    capsules: [
      {
        capsuleIndex: 0,
        title: 'Capsule 0',
        description: 'First capsule',
        contentScope: 'General',
        sourceType: 'skill-main',
        sourcePath: 'SKILL.md',
        tags: ['test'],
      },
    ],
  });

  function makeCapsule(
    overrides: Partial<DerivedSkillCapsuleRecord> = {},
  ): DerivedSkillCapsuleRecord {
    return {
      capsuleId: 'cap_1',
      artifactId: 'art_1',
      revision: 1,
      sourcePaths: ['SKILL.md'],
      content: 'Test content',
      situation: 'When testing',
      problem: 'Need to test',
      goal: 'Verify tests pass',
      errorText: null,
      labels: ['test'],
      scope: 'global',
      requiredLevel: 0,
      ...overrides,
    };
  }

  it('should return empty array for empty capsules', async () => {
    const chat = mockChat(['should not be called']);
    const result = await enrichCapsules([], {
      chat,
      documentTitle: 'Test',
      labels: [],
      documentContent: '',
      sourceHash: 'abc',
    });
    expect(result.capsules).toHaveLength(0);
    expect(result.metrics.totalCapsules).toBe(0);
  });

  it('should enrich capsules with LLM-generated prefixes', async () => {
    const chat = mockChat([manifestResponse, 'LLM generated prefix for capsule 0']);
    const capsules = [makeCapsule()];
    const result = await enrichCapsules(capsules, {
      chat,
      documentTitle: 'Test',
      labels: ['test'],
      documentContent: '# Test content',
      sourceHash: 'abc',
    });

    expect(result.capsules).toHaveLength(1);
    expect(result.capsules[0]!.contextualPrefix).toBe('LLM generated prefix for capsule 0');
    expect(result.metrics.llmSuccessCount).toBe(1);
    expect(result.metrics.manifestGenerated).toBe(true);
  });

  it('should use fallback when LLM manifest fails', async () => {
    const failingChat: ChatProvider = {
      provider: 'mock',
      isConfigured: true,
      invoke: async () => {
        throw new Error('LLM failed');
      },
    };
    const capsules = [makeCapsule()];
    const result = await enrichCapsules(capsules, {
      chat: failingChat,
      documentTitle: 'Test Doc',
      labels: [],
      documentContent: '',
      sourceHash: 'abc',
    });

    expect(result.capsules[0]!.contextualPrefix).toBeDefined();
    expect(result.capsules[0]!.contextualPrefix).toContain('Test Doc');
    expect(result.capsules[0]!.contextualPrefix).toContain('main document');
    expect(result.metrics.fallbackCount).toBe(1);
    expect(result.metrics.manifestGenerated).toBe(false);
  });

  it('should use cached prefix on second call', async () => {
    const cache = new ContextualEnrichmentCache();
    const chat = mockChat([manifestResponse, 'first prefix']);
    const capsules = [makeCapsule()];

    // First call — LLM
    const result1 = await enrichCapsules(capsules, {
      chat,
      documentTitle: 'Test',
      labels: [],
      documentContent: '',
      sourceHash: 'abc',
      cache,
    });
    expect(result1.capsules[0]!.contextualPrefix).toBe('first prefix');
    expect(cache.size).toBe(1);

    // Second call — should use cache, no LLM calls
    const chat2 = mockChat(['should not be called']);
    const result2 = await enrichCapsules(capsules, {
      chat: chat2,
      documentTitle: 'Test',
      labels: [],
      documentContent: '',
      sourceHash: 'abc',
      cache,
    });
    expect(result2.capsules[0]!.contextualPrefix).toBe('first prefix');
    expect(result2.metrics.cacheHitCount).toBe(1);
    expect(result2.metrics.llmSuccessCount).toBe(0);
  });

  it('should handle multiple capsules', async () => {
    const multiManifest = JSON.stringify({
      documentTitle: 'Test',
      documentLabels: [],
      capsules: [
        {
          capsuleIndex: 0,
          title: 'C0',
          description: 'd',
          contentScope: 's',
          sourceType: 'skill-main',
          sourcePath: 'SKILL.md',
          tags: [],
        },
        {
          capsuleIndex: 1,
          title: 'C1',
          description: 'd',
          contentScope: 's',
          sourceType: 'reference',
          sourcePath: 'references/guide.md',
          tags: [],
        },
      ],
    });
    const chat = mockChat([multiManifest, 'prefix 0', 'prefix 1']);
    const capsules = [
      makeCapsule({ capsuleId: 'cap_0' }),
      makeCapsule({ capsuleId: 'cap_1', sourcePaths: ['references/guide.md'] }),
    ];
    const result = await enrichCapsules(capsules, {
      chat,
      documentTitle: 'Test',
      labels: [],
      documentContent: '',
      sourceHash: 'abc',
    });

    expect(result.capsules).toHaveLength(2);
    expect(result.capsules[0]!.contextualPrefix).toBe('prefix 0');
    expect(result.capsules[1]!.contextualPrefix).toBe('prefix 1');
    expect(result.metrics.totalCapsules).toBe(2);
    expect(result.metrics.llmSuccessCount).toBe(2);
  });

  it('should skip enrichment when enrichmentEnabled is false (D-4 kill-switch)', async () => {
    const chat = mockChat(['should not be called']);
    const capsules = [makeCapsule()];
    const result = await enrichCapsules(capsules, {
      chat,
      documentTitle: 'Test',
      labels: [],
      documentContent: '',
      sourceHash: 'abc',
      enrichmentEnabled: false,
    });

    expect(result.capsules).toHaveLength(1);
    expect(result.capsules[0]!.contextualPrefix).toBeUndefined();
    expect(result.metrics.llmSuccessCount).toBe(0);
    expect(result.metrics.manifestGenerated).toBe(false);
    expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
  });
});
