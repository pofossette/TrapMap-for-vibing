import { describe, expect, it } from 'vitest';

import {
  REFINEMENT_MAX_SENTENCES,
  buildRefinementPrompt,
  buildRefinementSystemPrompt,
  buildRefinementSystemPromptBlocks,
  isRefinementAvailable,
} from '../../../src/knowledge-read/domain/index.js';

describe('knowledge-read refinement rules', () => {
  it('treats refinement as available only when a chat provider is configured', () => {
    expect(isRefinementAvailable(true)).toBe(true);
    expect(isRefinementAvailable(false)).toBe(false);
  });

  it('builds the refinement prompt from both match buckets', () => {
    const prompt = buildRefinementPrompt(
      'how do I deploy this',
      [{ shortcut: 'G1', detail: 'global detail' }],
      [{ shortcut: 'P1', detail: 'project detail' }],
    );
    expect(prompt).toBe(
      'Search results for "how do I deploy this":\n- [Global Constraint] G1: global detail\n- [Project Knowledge] P1: project detail',
    );
    expect(buildRefinementPrompt('q', [], [])).toBe('Search results for "q":\n');
  });

  it('builds the refinement system prompt in text and block forms', () => {
    expect(REFINEMENT_MAX_SENTENCES).toBe(3);
    expect(buildRefinementSystemPrompt(3)).toBe(
      'You are a knowledge refinement assistant. Keep the response under 3 sentences.',
    );
    expect(buildRefinementSystemPromptBlocks(3)).toEqual([
      {
        type: 'text',
        text: 'You are a knowledge refinement assistant. Keep the response under 3 sentences.',
      },
    ]);
  });
});
