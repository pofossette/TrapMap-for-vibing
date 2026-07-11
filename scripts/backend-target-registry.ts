import {
  backendTargetSchema,
  deploymentProfileSchema,
  resolveBackendTargetForProfile,
  type BackendTarget,
  type DeploymentProfile,
} from '../packages/contracts/src/enum-types/backend-target.js';

export interface DevTargetDefinition {
  env?: Record<string, string>;
  packageName: string;
  scriptName: string;
}

export interface BackendTargetDefinition {
  buildCommand: readonly string[];
  clientDefault: boolean;
  devTargets: Record<string, DevTargetDefinition>;
  hostPackage: string;
  profiles: readonly DeploymentProfile[];
  verificationCommands: readonly string[];
}

const distributedDevTargets = {
  gateway: {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:gateway',
  },
  'candidate-worker': {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:candidate-ingestion',
  },
  'governance-worker': {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:governance-review',
  },
  'outbox-worker': {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:job-runtime',
  },
} as const satisfies Record<string, DevTargetDefinition>;

const BACKEND_TARGET_PROFILES = Object.fromEntries(
  backendTargetSchema.options.map((target) => [
    target,
    deploymentProfileSchema.options.filter(
      (profile) => resolveBackendTargetForProfile(profile) === target,
    ),
  ]),
) as Record<BackendTarget, readonly DeploymentProfile[]>;

export const BACKEND_TARGET_REGISTRY = {
  light: {
    profiles: BACKEND_TARGET_PROFILES.light,
    hostPackage: '@trapmap/host-local',
    devTargets: {
      'local-agent': {
        env: { TRAPMAP_DEPLOYMENT_PROFILE: 'local-agent' },
        packageName: '@trapmap/host-local',
        scriptName: 'dev',
      },
      'team-monolith': {
        env: { TRAPMAP_DEPLOYMENT_PROFILE: 'team-monolith' },
        packageName: '@trapmap/host-local',
        scriptName: 'dev',
      },
    },
    buildCommand: ['pnpm', '--filter', '@trapmap/host-local', 'build'],
    verificationCommands: ['pnpm test:deployment-smoke', 'pnpm test:runtime-foundations'],
    clientDefault: true,
  },
  heavy: {
    profiles: BACKEND_TARGET_PROFILES.heavy,
    hostPackage: '@trapmap/host-distributed',
    devTargets: {
      ...distributedDevTargets,
      'distributed:gateway': distributedDevTargets.gateway,
      'distributed:candidate-worker': distributedDevTargets['candidate-worker'],
      'distributed:governance-worker': distributedDevTargets['governance-worker'],
      'distributed:outbox-worker': distributedDevTargets['outbox-worker'],
    },
    buildCommand: ['pnpm', '--filter', '@trapmap/host-distributed', 'build'],
    verificationCommands: [
      'pnpm test:deployment-smoke',
      'pnpm test:runtime-foundations',
      'pnpm test:discovery-closeout',
      'pnpm test:distributed-closeout',
      'pnpm test:runtime-closeout',
    ],
    clientDefault: false,
  },
} as const satisfies Record<BackendTarget, BackendTargetDefinition>;

export function verifyBackendTargetProfileOwnership(
  registry: Record<BackendTarget, Pick<BackendTargetDefinition, 'profiles'>>,
): void {
  for (const target of backendTargetSchema.options) {
    const expectedProfiles = BACKEND_TARGET_PROFILES[target];
    const actualProfiles = registry[target].profiles;
    const matches =
      actualProfiles.length === expectedProfiles.length &&
      actualProfiles.every((profile) => expectedProfiles.includes(profile));

    if (!matches) {
      throw new Error(`Backend target profile ownership drift for ${target}`);
    }
  }
}

verifyBackendTargetProfileOwnership(BACKEND_TARGET_REGISTRY);

export function resolveDevTargetFromRegistry(targetName: string): DevTargetDefinition | undefined {
  for (const target of Object.values(BACKEND_TARGET_REGISTRY)) {
    if (Object.prototype.hasOwnProperty.call(target.devTargets, targetName)) {
      return target.devTargets[targetName];
    }
  }

  return undefined;
}

export function listDevTargetNames(): readonly string[] {
  return Object.values(BACKEND_TARGET_REGISTRY).flatMap((target) => Object.keys(target.devTargets));
}
