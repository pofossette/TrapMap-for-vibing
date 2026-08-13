import { describe, expect, it } from 'vitest';

import {
  feedbackMatchesBadcaseExport,
  feedbackMatchesRemediationReactivation,
} from './invariants.js';

describe('governance-review feedback invariants', () => {
  it('matches feedback to a remediation reactivation payload', () => {
    const record = { entryId: 'entry-1', entryType: 'trap' };
    expect(
      feedbackMatchesRemediationReactivation(record, { entryId: 'entry-1', entryType: 'trap' }),
    ).toBe(true);
    expect(
      feedbackMatchesRemediationReactivation(record, { entryId: 'entry-9', entryType: 'trap' }),
    ).toBe(false);
    expect(
      feedbackMatchesRemediationReactivation(record, { entryId: 'entry-1', entryType: 'skill' }),
    ).toBe(false);
  });

  it('matches feedback to a badcase export draft payload including query id', () => {
    const record = { entryId: 'entry-1', entryType: 'skill', queryId: 'query-1' };
    const matching = { entryId: 'entry-1', entryType: 'skill', queryId: 'query-1' };
    expect(feedbackMatchesBadcaseExport(record, matching)).toBe(true);
    expect(feedbackMatchesBadcaseExport(record, { ...matching, queryId: 'query-2' })).toBe(false);
    expect(feedbackMatchesBadcaseExport(record, { ...matching, entryId: 'entry-2' })).toBe(false);
    expect(feedbackMatchesBadcaseExport(record, { ...matching, entryType: 'trap' })).toBe(false);
  });

  it('treats null and absent query ids as equivalent', () => {
    const record = { entryId: 'entry-1', entryType: 'skill', queryId: null };
    expect(
      feedbackMatchesBadcaseExport(record, {
        entryId: 'entry-1',
        entryType: 'skill',
        queryId: null,
      }),
    ).toBe(true);
    const absent = { entryId: 'entry-1', entryType: 'skill' };
    expect(
      feedbackMatchesBadcaseExport(absent, {
        entryId: 'entry-1',
        entryType: 'skill',
        queryId: null,
      }),
    ).toBe(true);
  });
});
