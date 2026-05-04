/**
 * Nyquist adversarial validation tests for governance permissions.
 *
 * Validates gap claims:
 * 1. hasPermission returns correct boolean for present/absent permissions
 * 2. requirePermission throws AppError with statusCode=403, code='forbidden'
 * 3. requireTeamAccess enforces team boundary, system-admin bypasses
 * 4. requireHigherLevel enforces strictly-higher-level rule
 */

import type { Permission } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';
import type { ResolvedAuthContext } from '../context.js';
import { AppError } from '../errors.js';
import {
  extractGovernanceContext,
  hasPermission,
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from './permissions.js';

function makeAuth(overrides: Partial<ResolvedAuthContext> = {}): ResolvedAuthContext {
  return {
    subjectType: 'user',
    actorId: 'user_nyq',
    handle: 'nyquist',
    activeTeamId: 'team_nyq',
    securityLevel: 5,
    effectivePermissions: ['session:read', 'team:list'] as Permission[],
    user: null,
    membership: null,
    team: null,
    ...overrides,
  };
}

describe('Nyquist: hasPermission returns exact boolean', () => {
  it('returns true when permission string is in effectivePermissions array', () => {
    const auth = makeAuth({
      effectivePermissions: ['session:read', 'team:list'] as Permission[],
    });
    expect(hasPermission(auth, 'session:read' as Permission)).toBe(true);
  });

  it('returns false when permission string is NOT in effectivePermissions array', () => {
    const auth = makeAuth({
      effectivePermissions: ['session:read'] as Permission[],
    });
    expect(hasPermission(auth, 'admin:write' as Permission)).toBe(false);
  });

  it('returns false when effectivePermissions is empty array', () => {
    const auth = makeAuth({ effectivePermissions: [] as Permission[] });
    expect(hasPermission(auth, 'session:read' as Permission)).toBe(false);
  });
});

describe('Nyquist: requirePermission throws AppError(403)', () => {
  it('throws AppError with statusCode 403 and code "forbidden" for missing permission', () => {
    const auth = makeAuth({ effectivePermissions: [] as Permission[] });
    try {
      requirePermission(auth, 'admin:delete' as Permission);
      expect.unreachable('should have thrown AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(403);
      expect(appErr.code).toBe('forbidden');
    }
  });

  it('does NOT throw when the exact permission is present', () => {
    const auth = makeAuth({
      effectivePermissions: ['admin:delete'] as Permission[],
    });
    expect(() => requirePermission(auth, 'admin:delete' as Permission)).not.toThrow();
  });
});

describe('Nyquist: requireTeamAccess enforces team boundary', () => {
  it('throws AppError(403, team_mismatch) when activeTeamId differs from target teamId', () => {
    const auth = makeAuth({ activeTeamId: 'team_A' });
    try {
      requireTeamAccess(auth, 'team_B');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('team_mismatch');
    }
  });

  it('does NOT throw when activeTeamId matches target teamId', () => {
    const auth = makeAuth({ activeTeamId: 'team_A' });
    expect(() => requireTeamAccess(auth, 'team_A')).not.toThrow();
  });

  it('system-admin bypasses team check even with mismatched teamId', () => {
    const auth = makeAuth({
      subjectType: 'system-admin',
      activeTeamId: 'team_X',
    });
    expect(() => requireTeamAccess(auth, 'team_Y')).not.toThrow();
  });

  it('throws AppError(403, team_mismatch) when activeTeamId is null', () => {
    const auth = makeAuth({ activeTeamId: null });
    try {
      requireTeamAccess(auth, 'team_A');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('team_mismatch');
    }
  });
});

describe('Nyquist: requireHigherLevel enforces strictly-higher rule', () => {
  it('throws when caller level equals targetLevel (boundary: not strictly higher)', () => {
    const auth = makeAuth({ securityLevel: 5 });
    try {
      requireHigherLevel(auth, 5);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('insufficient_level');
    }
  });

  it('throws when caller level is less than targetLevel', () => {
    const auth = makeAuth({ securityLevel: 3 });
    try {
      requireHigherLevel(auth, 7);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('insufficient_level');
    }
  });

  it('does NOT throw when caller level is strictly greater than targetLevel', () => {
    const auth = makeAuth({ securityLevel: 8 });
    expect(() => requireHigherLevel(auth, 5)).not.toThrow();
  });

  it('system-admin bypasses level check even at level 0', () => {
    const auth = makeAuth({ subjectType: 'system-admin', securityLevel: 0 });
    expect(() => requireHigherLevel(auth, 10)).not.toThrow();
  });

  it('nextLevel parameter creates additional constraint', () => {
    // caller level 6 > targetLevel 3, but caller level 6 <= nextLevel 7 => should throw
    const auth = makeAuth({ securityLevel: 6 });
    try {
      requireHigherLevel(auth, 3, 7);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
    }
  });
});

describe('Nyquist: extractGovernanceContext maps auth fields correctly', () => {
  it('maps subjectType system-admin to isSystemAdmin true', () => {
    const auth = makeAuth({ subjectType: 'system-admin' });
    const ctx = extractGovernanceContext(auth);
    expect(ctx.isSystemAdmin).toBe(true);
  });

  it('maps subjectType user to isSystemAdmin false', () => {
    const auth = makeAuth({ subjectType: 'user' });
    const ctx = extractGovernanceContext(auth);
    expect(ctx.isSystemAdmin).toBe(false);
  });

  it('preserves null activeTeamId as null teamId', () => {
    const auth = makeAuth({ activeTeamId: null });
    const ctx = extractGovernanceContext(auth);
    expect(ctx.teamId).toBeNull();
  });
});
