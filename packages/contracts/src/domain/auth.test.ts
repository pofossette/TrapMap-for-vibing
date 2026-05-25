import { describe, expect, it } from 'vitest';

import {
  loginRequestSchema,
  logoutResponseSchema,
  sessionStatusResponseSchema,
} from './auth.js';

describe('auth schemas', () => {
  describe('loginRequestSchema', () => {
    it('accepts valid accessKey request', () => {
      expect(loginRequestSchema.parse({ accessKey: 'a'.repeat(20) })).toEqual({
        accessKey: 'a'.repeat(20),
      });
    });

    it('accepts valid systemAdminKey request', () => {
      expect(
        loginRequestSchema.parse({ systemAdminKey: 'b'.repeat(20) }),
      ).toEqual({ systemAdminKey: 'b'.repeat(20) });
    });

    it('rejects extra fields on accessKey branch', () => {
      expect(() =>
        loginRequestSchema.parse({
          accessKey: 'a'.repeat(20),
          extra: 'field',
        }),
      ).toThrow();
    });

    it('rejects extra fields on systemAdminKey branch', () => {
      expect(() =>
        loginRequestSchema.parse({
          systemAdminKey: 'b'.repeat(20),
          extra: 'field',
        }),
      ).toThrow();
    });
  });

  describe('logoutResponseSchema', () => {
    it('accepts valid logout response', () => {
      expect(logoutResponseSchema.parse({ ok: true })).toEqual({ ok: true });
    });

    it('rejects extra fields', () => {
      expect(() =>
        logoutResponseSchema.parse({ ok: true, extra: 'field' }),
      ).toThrow();
    });
  });

  describe('sessionStatusResponseSchema', () => {
    const validSession = {
      sessionId: 'sess-1',
      member: {
        id: 'member-1',
        teamId: 'team-1',
        handle: 'testuser',
        roleTemplate: 'user' as const,
        securityLevel: 0,
        permissions: [],
        notes: null,
        isSystem: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      activeTeam: null,
      effectivePermissions: [],
      expiresAt: null,
      issuedAt: '2026-01-01T00:00:00Z',
    };

    it('accepts authenticated=true with non-null session', () => {
      const result = sessionStatusResponseSchema.parse({
        authenticated: true,
        session: validSession,
      });
      expect(result.authenticated).toBe(true);
      expect(result.session).not.toBeNull();
    });

    it('accepts authenticated=false with null session', () => {
      const result = sessionStatusResponseSchema.parse({
        authenticated: false,
        session: null,
      });
      expect(result.authenticated).toBe(false);
      expect(result.session).toBeNull();
    });

    it('rejects authenticated=true with null session', () => {
      expect(() =>
        sessionStatusResponseSchema.parse({
          authenticated: true,
          session: null,
        }),
      ).toThrow();
    });
  });
});
