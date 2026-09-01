import { describe, expect, it } from 'vitest';

import { isUnauthorizedSession } from '../../../src/app/router/router';

describe('router RequireAuth — 401 -> login redirect', () => {
  it('detects unauthenticated success payload as unauthorized', () => {
    expect(
      isUnauthorizedSession({
        status: 'success',
        payload: {
          authenticated: false,
          activeAccountId: null,
          accounts: [],
          availableRoles: [],
          token: null,
          user: null,
        },
        error: null,
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(true);
  });

  it('detects error status as unauthorized (401 mapped to error)', () => {
    expect(
      isUnauthorizedSession({
        status: 'error',
        payload: null,
        error: 'Request failed with status 401',
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(true);
  });

  it('does not treat loading or idle as unauthorized', () => {
    expect(
      isUnauthorizedSession({
        status: 'loading',
        payload: null,
        error: null,
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(false);
    expect(
      isUnauthorizedSession({
        status: 'idle',
        payload: null,
        error: null,
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(false);
  });

  it('does not treat authenticated success as unauthorized', () => {
    expect(
      isUnauthorizedSession({
        status: 'success',
        payload: {
          authenticated: true,
          activeAccountId: 'acct-admin',
          accounts: [],
          availableRoles: ['administrator'],
          token: 'tok',
          user: { displayName: 'Op', handle: 'op@local', role: 'administrator' },
        },
        error: null,
        updatedAt: new Date().toISOString(),
      } as never),
    ).toBe(false);
  });
});
