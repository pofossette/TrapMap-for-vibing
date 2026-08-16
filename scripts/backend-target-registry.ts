import {
  type BackendTarget,
  type DeploymentProfile,
  backendTargetSchema,
  deploymentProfileSchema,
  resolveBackendTargetForProfile,
} from '../packages/contracts/src/enum-types/backend-target.js';

export interface DevTargetDefinition {
  env?: Record<string, string>;
  packageName: string;
  scriptName: string;
}

export interface BackendTargetDefinition {
  appPackage: string;
  buildCommand: readonly string[];
  clientDefault: boolean;
  devTargets: Record<string, DevTargetDefinition>;
  libraryPackage: string;
  profiles: readonly DeploymentProfile[];
  verificationCommands: readonly string[];
}

/**
 * Canonical distributed build-shape builder names. Each key maps a shape
 * builder name (as used by compose / assembly) to the `--service` start
 * command on the app shell.
 *
 * Design D3 final bullet: the registry is the single thin
 * `shape-builder-name -> command` mapping; the app shell `dev:*` aliases
 * derive from here.
 */
const distributedShapeBuilders = {
  'distributed:gateway': {
    packageName: '@trapmap/app-distributed',
    scriptName: 'dev:gateway',
  },
  'distributed:candidate-worker': {
    packageName: '@trapmap/app-distributed',
    scriptName: 'dev:candidate-ingestion',
  },
  'distributed:governance-worker': {
    packageName: '@trapmap/app-distributed',
    scriptName: 'dev:governance-review',
  },
  'distributed:outbox-worker': {
    packageName: '@trapmap/app-distributed',
    scriptName: 'dev:job-runtime',
  },
} as const satisfies Record<string, DevTargetDefinition>;

/**
 * Short compose/worker names alias to the canonical `distributed:<service>`
 * shape-builder keys. This keeps existing consumers that referenced the short
 * names working while preserving a single canonical mapping per builder.
 */
const distributedServiceAliases = {
  gateway: 'distributed:gateway',
  'candidate-worker': 'distributed:candidate-worker',
  'governance-worker': 'distributed:governance-worker',
  'outbox-worker': 'distributed:outbox-worker',
} as const satisfies Record<string, string>;

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
    appPackage: '@trapmap/app-light',
    libraryPackage: '@trapmap/host-local',
    devTargets: {
      'local-agent': {
        env: { TRAPMAP_DEPLOYMENT_PROFILE: 'local-agent' },
        packageName: '@trapmap/app-light',
        scriptName: 'dev',
      },
      'team-monolith': {
        env: { TRAPMAP_DEPLOYMENT_PROFILE: 'team-monolith' },
        packageName: '@trapmap/app-light',
        scriptName: 'dev',
      },
    },
    buildCommand: ['pnpm', '--filter', '@trapmap/app-light', 'build'],
    verificationCommands: ['pnpm test:deployment-smoke', 'pnpm test:runtime-foundations'],
    clientDefault: true,
  },
  heavy: {
    profiles: BACKEND_TARGET_PROFILES.heavy,
    appPackage: '@trapmap/app-distributed',
    libraryPackage: '@trapmap/host-distributed',
    devTargets: {
      ...distributedShapeBuilders,
      // Short compose/worker shape-builder names as aliases for the same
      // canonical builder entry (single source of truth per builder).
      gateway: distributedShapeBuilders['distributed:gateway'],
      'candidate-worker': distributedShapeBuilders['distributed:candidate-worker'],
      'governance-worker': distributedShapeBuilders['distributed:governance-worker'],
      'outbox-worker': distributedShapeBuilders['distributed:outbox-worker'],
    },
    buildCommand: ['pnpm', '--filter', '@trapmap/app-distributed', 'build'],
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

/**
 * Resolve a dev-target name to a command definition. Accepts the canonical
 * shape-builder name (`local-agent`, `team-monolith`, `distributed:<service>`)
 * or a short worker alias (`candidate-worker`, `gateway`, ...).
 */
export function resolveDevTargetFromRegistry(targetName: string): DevTargetDefinition | undefined {
  for (const target of Object.values(BACKEND_TARGET_REGISTRY)) {
    if (Object.prototype.hasOwnProperty.call(target.devTargets, targetName)) {
      return target.devTargets[targetName];
    }
  }

  return undefined;
}

/**
 * Alias a short worker/component name to its canonical `distributed:<service>`
 * shape-builder key, or return the name unchanged when it is already canonical.
 */
export function canonicalDevTargetName(targetName: string): string {
  return (
    distributedServiceAliases[targetName as keyof typeof distributedServiceAliases] ?? targetName
  );
}

/**
 * List every registered dev-target name (canonical shape-builder names plus
 * short worker aliases). Used for CLI usage/help output.
 */
export function listDevTargetNames(): readonly string[] {
  return Object.values(BACKEND_TARGET_REGISTRY).flatMap((target) => Object.keys(target.devTargets));
}
