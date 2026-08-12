import { describe, expect, it } from 'vitest';

import {
  composeAccessToken,
  composeSystemAdminSessionToken,
  hashAccessToken,
  hashLoginSessionToken,
  systemAdminKeyMatches,
} from './access-key.js';

describe('identity-access access-key policy domain', () => {
  it('applies the shared token-hash normalization scheme', () => {
    expect(hashAccessToken('ak_key_1_1234')).toBe('hash_ak_key_1_1234');
    expect(hashLoginSessionToken(1712345678)).toBe('hash_1712345678');
  });

  it('composes provisioned access keys and system-admin session tokens', () => {
    expect(composeAccessToken('access_key_1', 1712345678)).toBe('ak_access_key_1_1712345678');
    expect(composeSystemAdminSessionToken('aGVsbG8')).toBe('ssr_sess_aGVsbG8');
    expect(composeSystemAdminSessionToken('')).toBe('ssr_sess_');
  });

  it('matches the system-admin key with constant-time digest comparison', () => {
    expect(systemAdminKeyMatches('admin-key-12345678', 'admin-key-12345678')).toBe(true);
    expect(systemAdminKeyMatches('admin-key-12345678', 'different-key')).toBe(false);
    expect(systemAdminKeyMatches('short', 'a-much-longer-configured-key')).toBe(false);
  });
});
