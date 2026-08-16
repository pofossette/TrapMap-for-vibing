import { assertChannelMergeShape, buildSampleChannelInput } from '@trapmap/backend-core';
import { describe, expect, it } from 'vitest';

import { createRuleChannelMerge } from './rule-channel-merge.js';

describe('createRuleChannelMerge', () => {
  it('merges hybrid and graph candidates into a ranked list', async () => {
    const rule = createRuleChannelMerge<{ id: string }>();
    const input = buildSampleChannelInput();
    const merged = await rule.merge(input);

    assertChannelMergeShape(merged);

    const entryIds = merged.map((item) => item.entry.id);
    expect(entryIds).toContain('entry-c');

    const entryB = merged.find((item) => item.entry.id === 'entry-b');
    expect(entryB?.channels).toContain('graph');

    for (let i = 1; i < merged.length; i += 1) {
      expect(merged[i - 1]!.combinedScore).toBeGreaterThanOrEqual(merged[i]!.combinedScore);
    }
  });

  it('returns hybrid candidates unchanged when there are no graph candidates', async () => {
    const rule = createRuleChannelMerge<{ id: string }>();
    const input = buildSampleChannelInput();
    const merged = await rule.merge({ ...input, graphCandidates: [] });

    expect(merged).toHaveLength(input.hybridCandidates.length);
    expect(merged.map((item) => item.entry.id)).toEqual(
      input.hybridCandidates.map((item) => item.entry.id),
    );
  });
});
