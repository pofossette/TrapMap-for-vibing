import { describe, expect, it, vi } from 'vitest';

import type { ChatProvider } from '@trapmap/ai-providers';
import { assertLabelResultShape, sampleLabelInput } from '@trapmap/backend-core';
import type { LabelAlignmentInput } from '@trapmap/contracts';

import { createLlmLabelAlignment } from '../../src/label-alignment/llm-label-alignment.js';
import { createRuleLabelAlignment } from '../../src/label-alignment/rule-label-alignment.js';

function labelInput(overrides: Partial<LabelAlignmentInput> = {}): LabelAlignmentInput {
  return { ...sampleLabelInput, ...overrides };
}

// fallow-ignore-next-line code-duplication -- minimal chat stub shared with labels/llm-align.test.ts; extraction deferred
function makeMockChat(responses: string[], options: { configured?: boolean } = {}): ChatProvider {
  let callIndex = 0;
  return {
    provider: 'mock',
    isConfigured: options.configured ?? true,
    invoke: vi.fn().mockImplementation(async () => {
      const response = responses[callIndex] ?? responses[responses.length - 1] ?? '{}';
      callIndex += 1;
      return response;
    }),
  };
}

describe('createRuleLabelAlignment', () => {
  it('maps an exact alias match to an existing label', async () => {
    const port = createRuleLabelAlignment();

    const result = await port.align(labelInput({ rawLabel: 'git' }));

    assertLabelResultShape(result);
    expect(result.decision.decision).toBe('existing');
    if (result.decision.decision === 'existing') {
      expect(result.decision.canonicalLabelId).toBe('label-git');
    }
    expect(result.llmSuccess).toBe(false);
  });

  it('creates a new label when there are no candidates', async () => {
    const port = createRuleLabelAlignment();

    const result = await port.align(labelInput({ candidates: [] }));

    // assertLabelResultShape requires a non-empty candidate list, so it is not
    // applied to the new-label no-candidate path.
    expect(result.candidates).toEqual([]);
    expect(result.decision.decision).toBe('new');
    if (result.decision.decision === 'new') {
      expect(result.decision.canonicalName).toBe('git');
    }
    expect(result.llmSuccess).toBe(false);
  });

  it('returns unsure when no candidate matches exactly', async () => {
    const port = createRuleLabelAlignment();

    const result = await port.align(
      labelInput({
        candidates: [
          {
            id: 'label-terraform',
            canonicalName: 'Terraform',
            definition: 'Infrastructure as code',
            aliases: ['terraform', 'iac'],
            recallReason: 'exact-alias',
          } as LabelAlignmentInput['candidates'][number],
        ],
      }),
    );

    assertLabelResultShape(result);
    expect(result.decision.decision).toBe('unsure');
    expect(result.llmSuccess).toBe(false);
  });
});

describe('createLlmLabelAlignment', () => {
  it('aligns with the LLM when it returns a valid decision', async () => {
    const chat = makeMockChat([
      JSON.stringify({
        decision: 'existing',
        canonicalLabelId: 'label-git',
        confidence: 1,
        reasoning: 'matches the git canonical label',
      }),
    ]);
    const port = createLlmLabelAlignment({ chat });

    const result = await port.align(labelInput());

    assertLabelResultShape(result);
    expect(result.llmSuccess).toBe(true);
    expect(result.decision.decision).toBe('existing');
    if (result.decision.decision === 'existing') {
      expect(result.decision.canonicalLabelId).toBe('label-git');
    }
  });

  it('falls back to unsure when the LLM returns invalid output', async () => {
    // fallow-ignore-next-line code-duplication -- adjacent llm-fallback assertions share the same stub/assert shape
    const chat = makeMockChat(['not valid json']);
    const port = createLlmLabelAlignment({ chat });

    const result = await port.align(labelInput());

    assertLabelResultShape(result);
    expect(result.llmSuccess).toBe(false);
    expect(result.decision.decision).toBe('unsure');
  });

  it('falls back to unsure when the chat provider is not configured', async () => {
    const chat = makeMockChat([], { configured: false });
    const port = createLlmLabelAlignment({ chat });

    const result = await port.align(labelInput());

    assertLabelResultShape(result);
    expect(result.llmSuccess).toBe(false);
    expect(result.decision.decision).toBe('unsure');
  });
});
