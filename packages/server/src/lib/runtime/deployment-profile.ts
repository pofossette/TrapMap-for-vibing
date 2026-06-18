import type { DeploymentPreset } from './deployment-preset.js';

export type DeploymentProfile = 'local-agent' | 'team-monolith' | 'distributed';

export type DeploymentProfileSource = 'explicit' | 'inferred';

export interface DeploymentProfileCompatibility {
  profile: DeploymentProfile;
  source: DeploymentProfileSource;
  requiresGateway: true;
  requiresAsyncOwnership: boolean;
  allowsSingleProcess: boolean;
  requiresPostgres: boolean;
  minimumPreset: DeploymentPreset;
}

function inferDeploymentProfileFromPreset(
  preset: DeploymentPreset | undefined,
): DeploymentProfileCompatibility {
  switch (preset) {
    case 'api':
    case 'candidate-worker':
    case 'governance-worker':
    case 'outbox-worker':
      return {
        profile: 'distributed',
        source: 'inferred',
        requiresGateway: true,
        requiresAsyncOwnership: true,
        allowsSingleProcess: false,
        requiresPostgres: true,
        minimumPreset: 'api',
      };
    case 'monolith':
    default:
      return {
        profile: 'team-monolith',
        source: 'inferred',
        requiresGateway: true,
        requiresAsyncOwnership: false,
        allowsSingleProcess: true,
        requiresPostgres: true,
        minimumPreset: 'monolith',
      };
  }
}

export function resolveDeploymentProfileCompatibility(args: {
  profile: DeploymentProfile | undefined;
  preset: DeploymentPreset | undefined;
}): DeploymentProfileCompatibility {
  if (!args.profile) {
    return inferDeploymentProfileFromPreset(args.preset);
  }

  switch (args.profile) {
    case 'local-agent':
      return {
        profile: 'local-agent',
        source: 'explicit',
        requiresGateway: true,
        requiresAsyncOwnership: false,
        allowsSingleProcess: true,
        requiresPostgres: false,
        minimumPreset: 'monolith',
      };
    case 'distributed':
      return {
        profile: 'distributed',
        source: 'explicit',
        requiresGateway: true,
        requiresAsyncOwnership: true,
        allowsSingleProcess: false,
        requiresPostgres: true,
        minimumPreset: 'api',
      };
    case 'team-monolith':
    default:
      return {
        profile: 'team-monolith',
        source: 'explicit',
        requiresGateway: true,
        requiresAsyncOwnership: false,
        allowsSingleProcess: true,
        requiresPostgres: true,
        minimumPreset: 'monolith',
      };
  }
}
