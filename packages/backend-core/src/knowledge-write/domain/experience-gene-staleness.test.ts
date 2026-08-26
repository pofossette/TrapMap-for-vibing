import { describe, expect, it } from 'vitest';

import { createExperienceGeneFixture } from '../../testing/experience-gene-fixtures.js';
import { evaluateExperienceGeneStaleness } from './experience-gene-staleness.js';

describe('experience gene staleness evaluation', () => {
  it('detects source revision and hash changes separately', () => {
    const gene = createExperienceGeneFixture();

    expect(
      evaluateExperienceGeneStaleness({
        gene,
        signal: { revision: gene.source.sourceRevision + 1 },
      }),
    ).toEqual({ stale: true, reason: 'source-revision' });
    expect(
      evaluateExperienceGeneStaleness({
        gene,
        signal: {
          revision: gene.source.sourceRevision,
          sourceHash: 'd'.repeat(64),
        },
      }),
    ).toEqual({ stale: true, reason: 'source-hash' });
  });

  it('detects remediation suppression', () => {
    const gene = createExperienceGeneFixture();

    expect(
      evaluateExperienceGeneStaleness({
        gene,
        signal: { remediationSuppressed: true },
      }),
    ).toEqual({ stale: true, reason: 'remediation' });
  });

  it('detects deactivation before governance drift', () => {
    const gene = createExperienceGeneFixture();

    expect(
      evaluateExperienceGeneStaleness({
        gene,
        signal: {
          lifecycleState: 'deactivated',
          scope: 'global',
        },
      }),
    ).toEqual({ stale: true, reason: 'source-lifecycle' });
  });

  it('detects tightened governance that the Gene cannot inherit', () => {
    const gene = createExperienceGeneFixture();

    expect(
      evaluateExperienceGeneStaleness({
        gene,
        signal: { requiredLevel: gene.requiredLevel + 1 },
      }).reason,
    ).toBe('governance');
    expect(
      evaluateExperienceGeneStaleness({
        gene,
        signal: { labels: ['other-label'] },
      }).reason,
    ).toBe('governance');
  });

  it('reports a fresh governed source as not stale', () => {
    const gene = createExperienceGeneFixture();

    expect(
      evaluateExperienceGeneStaleness({
        gene,
        signal: {
          revision: gene.source.sourceRevision,
          sourceHash: gene.source.sourceHash,
          labels: gene.labels,
          scope: gene.scope,
          teamId: gene.teamId,
          requiredLevel: gene.requiredLevel,
          lifecycleState: 'approved',
          remediationSuppressed: false,
        },
      }),
    ).toEqual({ stale: false });
  });
});
