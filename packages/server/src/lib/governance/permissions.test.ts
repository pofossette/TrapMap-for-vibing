/**
 * Tests for governance permission functions.
 *
 * Covers all 5 exported functions from permissions.ts:
 * - extractGovernanceContext
 * - hasPermission
 * - requirePermission
 * - requireTeamAccess
 * - requireHigherLevel
 */

import type { Permission } from '@trapmap/contracts';
import type { ResolvedAuthContext } from '@trapmap/server/lib/context.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { describe, expect, it } from 'vitest';
import {
  extractGovernanceContext,
  hasPermission,
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from './permissions.js';

function createTestAuth(overrides: Partial<ResolvedAuthContext> = {}): ResolvedAuthContext {
  return {
    subjectType: 'user',
    actorId: 'user_1',
    handle: 'testuser',
    activeTeamId: 'team_1',
    securityLevel: 5,
    effectivePermissions: ['session:read', 'team:list'] as Permission[],
    user: null,
    membership: null,
    team: null,
    ...overrides,
  };
}

describe('extractGovernanceContext', () => {
  it('extracts teamId from auth.activeTeamId', () => {
    const auth = createTestAuth({ activeTeamId: 'team_42' });
    const ctx = extractGovernanceContext(auth);
    expect(ctx.teamId).toBe('team_42');
  });

  it('extracts securityLevel from auth.securityLevel', () => {
    const auth = createTestAuth({ securityLevel: 8 });
    const ctx = extractGovernanceContext(auth);
    expect(ctx.securityLevel).toBe(8);
  });

  it('sets isSystemAdmin=true when subjectType is system-admin', () => {
    const auth = createTestAuth({ subjectType: 'system-admin' });
    const ctx = extractGovernanceContext(auth);
    expect(ctx.isSystemAdmin).toBe(true);
  });

  it('sets isSystemAdmin=false when subjectType is user', () => {
    const auth = createTestAuth({ subjectType: 'user' });
    const ctx = extractGovernanceContext(auth);
    expect(ctx.isSystemAdmin).toBe(false);
  });

  it('handles null activeTeamId', () => {
    const auth = createTestAuth({ activeTeamId: null });
    const ctx = extractGovernanceContext(auth);
    expect(ctx.teamId).toBeNull();
  });
});

describe('hasPermission', () => {
  it('returns true when permission is in effectivePermissions', () => {
    const auth = createTestAuth({
      effectivePermissions: ['session:read', 'team:list'] as Permission[],
    });
    expect(hasPermission(auth, 'session:read' as Permission)).toBe(true);
  });

  it('returns false when permission is NOT in effectivePermissions', () => {
    const auth = createTestAuth({
      effectivePermissions: ['session:read', 'team:list'] as Permission[],
    });
    expect(hasPermission(auth, 'admin:write' as Permission)).toBe(false);
  });

  it('returns true for system-admin subjectType with matching permission', () => {
    const auth = createTestAuth({
      subjectType: 'system-admin',
      effectivePermissions: ['session:read'] as Permission[],
    });
    expect(hasPermission(auth, 'session:read' as Permission)).toBe(true);
  });
});

describe('requirePermission', () => {
  it('does NOT throw when permission is present in effectivePermissions', () => {
    const auth = createTestAuth({
      effectivePermissions: ['session:read', 'team:list'] as Permission[],
    });
    expect(() => requirePermission(auth, 'session:read' as Permission)).not.toThrow();
  });

  it('throws AppError with statusCode=403 and code=forbidden when permission is missing', () => {
    const auth = createTestAuth({
      effectivePermissions: ['session:read'] as Permission[],
    });
    try {
      requirePermission(auth, 'admin:write' as Permission);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('forbidden');
    }
  });

  it('error message contains the missing permission name', () => {
    const auth = createTestAuth({
      effectivePermissions: [] as Permission[],
    });
    try {
      requirePermission(auth, 'team:delete' as Permission);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).message).toContain('team:delete');
    }
  });

  it('does not throw when multiple permissions present and one matches', () => {
    const auth = createTestAuth({
      effectivePermissions: ['session:read', 'team:list', 'admin:write'] as Permission[],
    });
    expect(() => requirePermission(auth, 'admin:write' as Permission)).not.toThrow();
  });
});

describe('requireTeamAccess', () => {
  it('does NOT throw for system-admin regardless of teamId', () => {
    const auth = createTestAuth({
      subjectType: 'system-admin',
      activeTeamId: 'team_1',
    });
    expect(() => requireTeamAccess(auth, 'team_other')).not.toThrow();
  });

  it('does NOT throw when auth.activeTeamId matches the provided teamId', () => {
    const auth = createTestAuth({ activeTeamId: 'team_1' });
    expect(() => requireTeamAccess(auth, 'team_1')).not.toThrow();
  });

  it('throws AppError(403, team_mismatch) when auth.activeTeamId differs from teamId', () => {
    const auth = createTestAuth({ activeTeamId: 'team_1' });
    try {
      requireTeamAccess(auth, 'team_other');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('team_mismatch');
    }
  });

  it('throws AppError(403, team_mismatch) when auth.activeTeamId is null', () => {
    const auth = createTestAuth({ activeTeamId: null });
    try {
      requireTeamAccess(auth, 'team_1');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('team_mismatch');
    }
  });
});

describe('requireHigherLevel', () => {
  it('does NOT throw for system-admin regardless of targetLevel', () => {
    const auth = createTestAuth({
      subjectType: 'system-admin',
      securityLevel: 0,
    });
    expect(() => requireHigherLevel(auth, 10)).not.toThrow();
  });

  it('does NOT throw when caller securityLevel > targetLevel', () => {
    const auth = createTestAuth({ securityLevel: 6 });
    expect(() => requireHigherLevel(auth, 5)).not.toThrow();
  });

  it('throws AppError(403, insufficient_level) when caller level EQUALS targetLevel (boundary)', () => {
    const auth = createTestAuth({ securityLevel: 5 });
    try {
      requireHigherLevel(auth, 5);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('insufficient_level');
    }
  });

  it('throws AppError(403, insufficient_level) when caller level < targetLevel', () => {
    const auth = createTestAuth({ securityLevel: 3 });
    try {
      requireHigherLevel(auth, 5);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('insufficient_level');
    }
  });

  it('uses nextLevel parameter: throws when securityLevel <= nextLevel even if > targetLevel', () => {
    // securityLevel=6, targetLevel=3, nextLevel=7 -> 6 <= 7 should throw
    const auth = createTestAuth({ securityLevel: 6 });
    try {
      requireHigherLevel(auth, 3, 7);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('insufficient_level');
    }
  });

  it('default nextLevel equals targetLevel (both parameters set boundary)', () => {
    // When nextLevel is not provided, it defaults to targetLevel.
    // securityLevel=5, targetLevel=5 -> 5 <= 5 throws
    const auth = createTestAuth({ securityLevel: 5 });
    try {
      requireHigherLevel(auth, 5);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).code).toBe('insufficient_level');
    }
  });
});
