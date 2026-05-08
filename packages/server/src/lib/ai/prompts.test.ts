import { describe, expect, it } from 'vitest';

import {
  buildBoundaryExtractionSystemPrompt,
  buildClaimVerificationSystemPrompt,
  buildKnowledgeRefinementSystemPrompt,
} from './prompts.js';

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
  it('renders XML by default and includes JSON constraints', () => {
    const prompt = withEnv(
      {
        AI_PROMPT_FORMAT_BOUNDARY_EXTRACTION: undefined,
        AI_PROMPT_TEMPLATE_FILE: undefined,
      },
      () => buildBoundaryExtractionSystemPrompt(),
    );

    expect(prompt).toContain('boundary extraction assistant');
    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('<output_format>');
    expect(prompt).toContain('&quot;context&quot;');
    expect(prompt).toContain('When in doubt, omit it');
  });
});

describe('buildKnowledgeRefinementSystemPrompt', () => {
  it('renders markdown with refinement role and sentence limit', () => {
    const prompt = withEnv(
      {
        AI_PROMPT_FORMAT_KNOWLEDGE_REFINEMENT: 'markdown',
        AI_PROMPT_TEMPLATE_FILE: undefined,
      },
      () => buildKnowledgeRefinementSystemPrompt({ maxSentences: 3 }),
    );

    expect(prompt).toContain('knowledge refinement assistant');
    expect(prompt).toContain('under 3 sentences');
    expect(prompt).toContain('most relevant information');
  });
});

describe('buildClaimVerificationSystemPrompt', () => {
  it('renders JSON with strict verification constraints', () => {
    const prompt = withEnv(
      {
        AI_PROMPT_FORMAT_CLAIM_VERIFICATION: 'json',
        AI_PROMPT_TEMPLATE_FILE: undefined,
      },
      () => buildClaimVerificationSystemPrompt({ strict: true }),
    );

    expect(() => JSON.parse(prompt)).not.toThrow();
    expect(prompt).toContain('claim verification assistant');
    expect(prompt).toContain('only mark a claim as supported if the context directly supports it');
    expect(prompt).toContain('Do not rely on outside knowledge');
  });

  it('applies template overrides from a custom file', () => {
    const prompt = withEnv(
      {
        AI_PROMPT_FORMAT_CLAIM_VERIFICATION: 'markdown',
        AI_PROMPT_TEMPLATE_FILE: 'packages/server/src/lib/ai/__fixtures__/prompt-template.override.json',
      },
      () => buildClaimVerificationSystemPrompt({ strict: false }),
    );

    expect(prompt).toContain('a custom verification assistant');
    expect(prompt).toContain('Use the custom verification framing.');
    expect(prompt).not.toContain('Do not rely on outside knowledge');
  });
});
