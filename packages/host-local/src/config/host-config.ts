/**
 * Host-local configuration.
 *
 * Defines the configuration shape for the light host assembly.
 * Configuration is loaded from environment variables with sensible defaults.
 */

import type {
  DeploymentPreset,
  DeploymentProfile,
  RuntimeMode,
  ServiceUnit,
} from '@trapmap/backend-core';

// ---------------------------------------------------------------------------
// Host configuration interface
// ---------------------------------------------------------------------------

export interface HostConfig {
  /** Deployment profile: local-agent or team-monolith */
  deploymentProfile: DeploymentProfile;

  /** Deployment preset */
  deploymentPreset: DeploymentPreset;

  /** Runtime mode: api, task-worker, outbox-worker, combined */
  runtimeMode: RuntimeMode;

  /** Service unit ownership scope */
  serviceUnit: ServiceUnit;

  /** HTTP server port */
  port: number;

  /** PostgreSQL connection URL (undefined = JSON store) */
  databaseUrl: string | undefined;

  /** Host binding address */
  host: string;

  /** Log level */
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

// ---------------------------------------------------------------------------
// Environment loading
// ---------------------------------------------------------------------------

function readEnvString(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function readEnvInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function resolveProfile(value: string): DeploymentProfile {
  if (value === 'local-agent' || value === 'team-monolith' || value === 'distributed') {
    return value;
  }
  return 'team-monolith';
}

function resolvePreset(value: string): DeploymentPreset {
  const valid: DeploymentPreset[] = [
    'monolith',
    'api',
    'candidate-worker',
    'governance-worker',
    'outbox-worker',
  ];
  return valid.includes(value as DeploymentPreset) ? (value as DeploymentPreset) : 'monolith';
}

function resolveRuntimeMode(value: string): RuntimeMode {
  if (
    value === 'api' ||
    value === 'task-worker' ||
    value === 'outbox-worker' ||
    value === 'combined'
  ) {
    return value;
  }
  return 'combined';
}

function resolveServiceUnit(value: string): ServiceUnit {
  if (
    value === 'full-platform' ||
    value === 'candidate-ingestion' ||
    value === 'knowledge-governance'
  ) {
    return value;
  }
  return 'full-platform';
}

/**
 * Load host configuration from environment variables.
 */
export function loadHostConfig(): HostConfig {
  return {
    deploymentProfile: resolveProfile(readEnvString('TRAPMAP_DEPLOYMENT_PROFILE', 'team-monolith')),
    deploymentPreset: resolvePreset(readEnvString('TRAPMAP_DEPLOYMENT_PRESET', 'monolith')),
    runtimeMode: resolveRuntimeMode(readEnvString('RUNTIME_MODE', 'combined')),
    serviceUnit: resolveServiceUnit(readEnvString('TRAPMAP_SERVICE_UNIT', 'full-platform')),
    port: readEnvInt('PORT', 4000),
    databaseUrl: process.env.DATABASE_URL ?? process.env.TRAPMAP_DATABASE_URL,
    host: readEnvString('HOST', '0.0.0.0'),
    logLevel: readEnvString('LOG_LEVEL', 'info') as HostConfig['logLevel'],
  };
}
