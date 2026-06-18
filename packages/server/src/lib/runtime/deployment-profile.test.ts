import { describe, expect, it } from 'vitest';

import { resolveDeploymentProfileCompatibility } from './deployment-profile.js';

describe('deployment profile compatibility', () => {
  it('keeps monolith preset mapped to team-monolith when no profile is set', () => {
    expect(
      resolveDeploymentProfileCompatibility({
        profile: undefined,
        preset: 'monolith',
      }),
    ).toEqual({
      profile: 'team-monolith',
      source: 'inferred',
      requiresGateway: true,
      requiresAsyncOwnership: false,
      allowsSingleProcess: true,
      requiresPostgres: true,
      minimumPreset: 'monolith',
    });
  });

  it('infers distributed from split presets when no profile is set', () => {
    expect(
      resolveDeploymentProfileCompatibility({
        profile: undefined,
        preset: 'candidate-worker',
      }),
    ).toEqual({
      profile: 'distributed',
      source: 'inferred',
      requiresGateway: true,
      requiresAsyncOwnership: true,
      allowsSingleProcess: false,
      requiresPostgres: true,
      minimumPreset: 'api',
    });
  });

  it('allows local-agent without requiring postgres or async ownership', () => {
    expect(
      resolveDeploymentProfileCompatibility({
        profile: 'local-agent',
        preset: 'monolith',
      }),
    ).toEqual({
      profile: 'local-agent',
      source: 'explicit',
      requiresGateway: true,
      requiresAsyncOwnership: false,
      allowsSingleProcess: true,
      requiresPostgres: false,
      minimumPreset: 'monolith',
    });
  });

  it('treats distributed as a gateway plus async-ownership shape, not a combined alias', () => {
    const compatibility = resolveDeploymentProfileCompatibility({
      profile: 'distributed',
      preset: 'monolith',
    });

    expect(compatibility.profile).toBe('distributed');
    expect(compatibility.requiresGateway).toBe(true);
    expect(compatibility.requiresAsyncOwnership).toBe(true);
    expect(compatibility.allowsSingleProcess).toBe(false);
    expect(compatibility.minimumPreset).toBe('api');
  });
});
