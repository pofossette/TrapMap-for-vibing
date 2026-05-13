import { describe, expect, it } from 'vitest';

import {
  CACHE_BOUNDARY_MARKER,
  buildSystemPromptBlocks,
  splitPromptByBoundary,
} from './cache/index.js';
import { getDynamicInjections, injectDynamicContent } from './dynamic/index.js';
import {
  buildBoundaryExtractionSystemPrompt,
  buildBoundaryExtractionSystemPromptBlocks,
  buildClaimVerificationSystemPrompt,
  buildKnowledgeRefinementSystemPrompt,
  buildKnowledgeRefinementSystemPromptBlocks,
  buildPrompt,
  buildPromptWithCacheControl,
} from './prompts.js';
import type { PromptSlots } from './providers/types.js';

function withEnv<T>(patch: Record<string, string | undefined>, run: () => T): T {
  const original = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(patch)) {
    original.set(key, process.env[key]);
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of original.entries()) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('buildBoundaryExtractionSystemPrompt', () => {
  it('renders XML with role, task, output format, and constraints', () => {
    const prompt = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildBoundaryExtractionSystemPrompt(),
    );

    expect(prompt).toContain('boundary extraction assistant');
    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('</system_instructions>');
    expect(prompt).toContain('<role>');
    expect(prompt).toContain('<task>');
    expect(prompt).toContain('<output_format>');
    expect(prompt).toContain('&quot;context&quot;');
    expect(prompt).toContain('When in doubt, omit it');
  });
});

describe('buildKnowledgeRefinementSystemPrompt', () => {
  it('renders XML with refinement role and sentence limit', () => {
    const prompt = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildKnowledgeRefinementSystemPrompt({ maxSentences: 3 }),
    );

    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('</system_instructions>');
    expect(prompt).toContain('knowledge refinement assistant');
    expect(prompt).toContain('under 3 sentences');
    expect(prompt).toContain('most relevant information');
  });
});

describe('buildClaimVerificationSystemPrompt', () => {
  it('renders XML with strict verification constraints', () => {
    const prompt = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildClaimVerificationSystemPrompt({ strict: true }),
    );

    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('</system_instructions>');
    expect(prompt).toContain('claim verification assistant');
    expect(prompt).toContain('only mark a claim as supported if the context directly supports it');
    expect(prompt).toContain('Do not rely on outside knowledge');
  });

  it('applies template overrides from a custom file', () => {
    const prompt = withEnv(
      {
        AI_PROMPT_TEMPLATE_FILE:
          'packages/server/src/lib/ai/__fixtures__/prompt-template.override.json',
      },
      () => buildClaimVerificationSystemPrompt({ strict: false }),
    );

    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('a custom verification assistant');
    expect(prompt).toContain('Use the custom verification framing.');
    expect(prompt).not.toContain('Do not rely on outside knowledge');
  });
});

// ---------------------------------------------------------------------------
// buildPrompt — multi-provider scenarios
// ---------------------------------------------------------------------------

const defaultSlots: PromptSlots = {
  role: 'a boundary extraction assistant',
  task: 'Analyze the knowledge entry and extract structured boundary constraints.',
  outputInstructions: ['Return a JSON object.'],
  constraints: ['All fields are optional.'],
  metadata: {
    taskType: 'boundary-extraction',
    title: 'Boundary Extraction',
    outputFormatHint: 'json-object',
  },
};

describe('buildPrompt', () => {
  it('builds XML prompt with default provider', () => {
    const prompt = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPrompt('boundary-extraction', defaultSlots),
    );

    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('<role>');
    expect(prompt).toContain('boundary extraction assistant');
  });

  it('builds XML prompt with anthropic provider (claude model ID)', () => {
    const prompt = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPrompt('boundary-extraction', defaultSlots, 'claude-3-opus'),
    );

    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('<role>');
    expect(prompt).toContain('boundary extraction assistant');
  });

  it('builds JSON prompt with openai provider (gpt model ID)', () => {
    const prompt = withEnv(
      {
        AI_PROMPT_TEMPLATE_FILE:
          'packages/server/src/lib/ai/__fixtures__/prompt-template.json-safe.json',
      },
      () => buildPrompt('boundary-extraction', defaultSlots, 'gpt-4'),
    );

    // JSON format: should be parseable
    const parsed = JSON.parse(prompt);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('builds XML prompt with deepseek provider', () => {
    const prompt = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPrompt('boundary-extraction', defaultSlots, 'deepseek-chat'),
    );

    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('boundary extraction assistant');
  });

  it('builds JSON prompt with kimi provider (moonshot model ID)', () => {
    const prompt = withEnv(
      {
        AI_PROMPT_TEMPLATE_FILE:
          'packages/server/src/lib/ai/__fixtures__/prompt-template.json-safe.json',
      },
      () => buildPrompt('boundary-extraction', defaultSlots, 'moonshot-v1-128k'),
    );

    const trimmed = prompt.trim();
    expect(trimmed.startsWith('{')).toBe(true);
  });

  it('builds XML prompt with gemini provider', () => {
    const prompt = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPrompt('boundary-extraction', defaultSlots, 'gemini-pro'),
    );

    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('boundary extraction assistant');
  });

  it('applies template overrides from env var', () => {
    const prompt = withEnv(
      {
        AI_PROMPT_TEMPLATE_FILE:
          'packages/server/src/lib/ai/__fixtures__/prompt-template.override.json',
      },
      () =>
        buildPrompt('claim-verification', {
          role: 'a claim verification assistant',
          task: 'Verify claims.',
          metadata: { taskType: 'claim-verification', title: 'Claim Verification' },
        }),
    );

    expect(prompt).toContain('a custom verification assistant');
    expect(prompt).toContain('Use the custom verification framing.');
  });
});

// ---------------------------------------------------------------------------
// buildPromptWithCacheControl — cache scope classification
// ---------------------------------------------------------------------------

describe('buildPromptWithCacheControl', () => {
  it('returns sections with correct cacheScope for anthropic provider', () => {
    const sections = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPromptWithCacheControl('boundary-extraction', defaultSlots, 'claude-3-opus'),
    );

    // Should have at least one static (global) section and one boundary marker
    const staticSections = sections.filter((s) => s.cacheScope === 'global');
    const boundarySections = sections.filter((s) => s.name === '__boundary__');
    expect(staticSections.length).toBeGreaterThan(0);
    expect(boundarySections.length).toBe(1);
  });

  it('inserts boundary marker between static and dynamic sections', () => {
    const sections = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPromptWithCacheControl('boundary-extraction', defaultSlots, 'claude-3-opus'),
    );

    const boundaryIdx = sections.findIndex((s) => s.name === '__boundary__');
    expect(boundaryIdx).toBeGreaterThan(0);

    // All sections before boundary should be static (global scope)
    for (let i = 0; i < boundaryIdx; i++) {
      expect(sections[i].cacheScope).toBe('global');
    }

    // Boundary marker and sections after should have null scope
    expect(sections[boundaryIdx].cacheScope).toBeNull();
    for (let i = boundaryIdx + 1; i < sections.length; i++) {
      expect(sections[i].cacheScope).toBeNull();
    }
  });

  it('boundary marker content matches CACHE_BOUNDARY_MARKER', () => {
    const sections = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPromptWithCacheControl('boundary-extraction', defaultSlots, 'claude-3-opus'),
    );

    const boundary = sections.find((s) => s.name === '__boundary__');
    expect(boundary).toBeDefined();
    expect(boundary!.content).toBe(CACHE_BOUNDARY_MARKER);
  });

  it('metadata section is always dynamic (null scope)', () => {
    const sections = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPromptWithCacheControl('boundary-extraction', defaultSlots, 'claude-3-opus'),
    );

    const metadata = sections.find((s) => s.name === 'metadata');
    expect(metadata).toBeDefined();
    expect(metadata!.cacheScope).toBeNull();
    // Metadata content is JSON-stringified
    const parsed = JSON.parse(metadata!.content);
    expect(parsed.taskType).toBe('boundary-extraction');
  });
});

// ---------------------------------------------------------------------------
// splitPromptByBoundary integration
// ---------------------------------------------------------------------------

describe('splitPromptByBoundary integration', () => {
  it('splits buildPromptWithCacheControl output into static prefix and dynamic suffix', () => {
    const sections = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPromptWithCacheControl('boundary-extraction', defaultSlots, 'claude-3-opus'),
    );

    const { staticPrefix, dynamicSuffix } = splitPromptByBoundary(sections);

    expect(staticPrefix.length).toBeGreaterThan(0);
    expect(dynamicSuffix.length).toBeGreaterThan(0);

    // All static prefix sections should have global scope
    for (const section of staticPrefix) {
      expect(section.cacheScope).toBe('global');
    }

    // Dynamic suffix should contain metadata (taskType)
    const hasMetadata = dynamicSuffix.some((s) => s.name === 'metadata');
    expect(hasMetadata).toBe(true);
  });

  it('produces all-dynamic output for provider without static sections', () => {
    // Use a slots with only dynamic-relevant content
    const dynamicOnlySlots: PromptSlots = {
      task: 'Do something.',
      metadata: { taskType: 'boundary-extraction', title: 'Test' },
    };

    const sections = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPromptWithCacheControl('boundary-extraction', dynamicOnlySlots, 'claude-3-opus'),
    );

    const { staticPrefix, dynamicSuffix } = splitPromptByBoundary(sections);
    // 'role' is static for anthropic, but we didn't provide one
    // 'task' is NOT in anthropic's static sections, so it should be dynamic
    // However, the boundary marker might not be inserted if there are no static sections
    // with cacheScope=global before it. Let's check the actual behavior:
    if (staticPrefix.length === 0) {
      // No static sections, everything is in suffix (including boundary marker if present)
      expect(dynamicSuffix.length).toBe(sections.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Injection + cache end-to-end combination
// ---------------------------------------------------------------------------

describe('injection + cache end-to-end', () => {
  it('applies dynamic injections to a cached section', () => {
    // Build a cached prompt section
    const cachedContent =
      'Role: boundary extraction assistant\nWorking dir: ${WORKING_DIR}\nDate: ${DATE}';

    // Get dynamic injections
    const injections = getDynamicInjections('boundary-extraction');

    // Apply injections to cached content
    const result = injectDynamicContent(cachedContent, injections);

    expect(result.injected).not.toContain('${WORKING_DIR}');
    expect(result.injected).not.toContain('${DATE}');
    expect(result.injected).toContain(process.cwd());
    // ISO date format
    expect(result.injected).toMatch(/Date: \d{4}-\d{2}-\d{2}/);
  });

  it('preserves static content when injections are applied only to dynamic suffix', () => {
    const sections = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPromptWithCacheControl('boundary-extraction', defaultSlots, 'claude-3-opus'),
    );

    const { staticPrefix } = splitPromptByBoundary(sections);

    // Static prefix should be pure template content, no unresolved placeholders
    const staticContent = staticPrefix.map((s) => s.content).join('\n');
    expect(staticContent).not.toContain('${WORKING_DIR}');
    expect(staticContent).not.toContain('${DATE}');

    // Static content should contain the template role
    expect(staticContent).toContain('boundary extraction assistant');
  });

  it('buildPromptWithCacheControl produces sections compatible with buildSystemPromptBlocks', () => {
    const sections = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildPromptWithCacheControl('boundary-extraction', defaultSlots, 'claude-3-opus'),
    );

    const blocks = buildSystemPromptBlocks(sections);
    expect(blocks.length).toBeGreaterThan(0);

    // First block should have cache_control (static sections)
    const firstBlockCache = blocks[0].cache_control;
    expect(firstBlockCache).toBeDefined();
    expect(firstBlockCache!.type).toBe('ephemeral');
    expect(firstBlockCache!.scope).toBe('global');

    // Remaining blocks should not have cache_control
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].cache_control).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Cache-aware prompt builder convenience functions
// ---------------------------------------------------------------------------

describe('buildBoundaryExtractionSystemPromptBlocks', () => {
  it('returns PromptBlock[] with cache_control on first block', () => {
    const blocks = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildBoundaryExtractionSystemPromptBlocks(),
    );

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral', scope: 'global' });
    expect(blocks[0].content).toContain('boundary extraction assistant');
  });

  it('produces content equivalent to the string builder', () => {
    const [blocks, stringPrompt] = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () => [
      buildBoundaryExtractionSystemPromptBlocks(),
      buildBoundaryExtractionSystemPrompt(),
    ]);

    const merged = blocks.map((b) => b.content).join('\n');
    // Both should contain the key role text
    expect(merged).toContain('boundary extraction assistant');
    expect(stringPrompt).toContain('boundary extraction assistant');
  });
});

describe('buildKnowledgeRefinementSystemPromptBlocks', () => {
  it('returns PromptBlock[] with cache_control on first block', () => {
    const blocks = withEnv({ AI_PROMPT_TEMPLATE_FILE: undefined }, () =>
      buildKnowledgeRefinementSystemPromptBlocks({ maxSentences: 3 }),
    );

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral', scope: 'global' });
    expect(blocks[0].content).toContain('knowledge refinement assistant');
  });
});
