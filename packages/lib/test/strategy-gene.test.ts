import { describe, expect, it } from 'vitest';

import { createExperienceGeneFixture } from '@trapmap/contracts';
import { formatStrategyGene } from '../src/strategy-gene.js';

describe('formatStrategyGene', () => {
  it('renders ordered strategy and avoid controls without internals', () => {
    const gene = createExperienceGeneFixture();
    const rendered = formatStrategyGene({
      primaryGene: {
        gene: {
          ...gene,
          strategy: ['Claim the lease', 'Publish once'],
          avoid: ['Publish from every retry'],
        },
        score: 0.91,
        reason: 'exact-signal',
        sourceCitation: {
          kind: 'trap',
          sourceId: 'trap-1',
          sourceRevision: 3,
          artifactId: null,
          capsuleId: null,
        },
        warnings: [],
      },
      supplementaryAvoid: [],
    });

    expect(rendered).toBe(
      [
        '<strategy-gene>',
        `Domain keywords: ${gene.signalsMatch.join(', ')}`,
        `Summary: ${gene.summary}`,
        'Strategy:',
        '  1. Claim the lease',
        '  2. Publish once',
        '  3. AVOID: Publish from every retry',
        '</strategy-gene>',
      ].join('\n'),
    );
    expect(rendered).not.toContain('contentHash');
    expect(rendered).not.toContain('promptVersion');
  });

  it('states that no Gene matched instead of fabricating advice', () => {
    expect(formatStrategyGene({ primaryGene: null, supplementaryAvoid: [] })).toBe(
      'No matching Experience Gene.',
    );
  });
});
