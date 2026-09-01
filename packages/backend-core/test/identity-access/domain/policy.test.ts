import { describe, expect, it } from 'vitest';

import type { Permission } from '@trapmap/contracts';

import {
  SYSTEM_ADMIN_SECURITY_LEVEL,
  USER_SECURITY_LEVEL,
  defaultRoleTemplate,
  defaultSecurityLevel,
  defaultTeamName,
  permissionsForRole,
  sessionSecurityLevel,
} from '../../../src/identity-access/domain/policy.js';

describe('identity-access policy domain', () => {
  it('grants the full capability set to admin and system-admin roles', () => {
    const admin: Permission[] = [
      'session:read',
      'team:list',
      'knowledge:search',
      'team:create',
      'team:select',
      'member:create',
      'member:update',
      'member:key:create',
      'knowledge:submit',
      'knowledge:review',
      'knowledge:update',
      'knowledge:export',
      'knowledge:import',
      'audit:read',
      'stats:read',
    ];
    expect(permissionsForRole('admin')).toEqual(admin);
    expect(permissionsForRole('system-admin')).toEqual(admin);
  });

  it('grants read + write capabilities to editors and read-only to everyone else', () => {
    expect(permissionsForRole('editor')).toEqual([
      'session:read',
      'team:list',
      'knowledge:search',
      'team:select',
      'knowledge:submit',
      'knowledge:update',
      'knowledge:export',
    ]);
    expect(permissionsForRole('viewer')).toEqual(['session:read', 'team:list', 'knowledge:search']);
    expect(permissionsForRole('unknown-role')).toEqual([
      'session:read',
      'team:list',
      'knowledge:search',
    ]);
  });

  it('maps session subject types to security levels', () => {
    expect(sessionSecurityLevel('system-admin')).toBe(10);
    expect(sessionSecurityLevel('user')).toBe(1);
    expect(SYSTEM_ADMIN_SECURITY_LEVEL).toBe(10);
    expect(USER_SECURITY_LEVEL).toBe(1);
  });

  it('normalizes membership defaults', () => {
    expect(defaultRoleTemplate(undefined)).toBe('user');
    expect(defaultRoleTemplate(null)).toBe('user');
    expect(defaultRoleTemplate('reviewer')).toBe('reviewer');
    expect(defaultSecurityLevel(undefined)).toBe(0);
    expect(defaultSecurityLevel(null)).toBe(0);
    expect(defaultSecurityLevel(5)).toBe(5);
    expect(defaultTeamName(undefined, 'platform')).toBe('platform');
    expect(defaultTeamName(null, 'platform')).toBe('platform');
    expect(defaultTeamName('Platform', 'platform')).toBe('Platform');
  });
});
