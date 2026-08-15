/**
 * Trap Fixture Index
 *
 * Aggregates all trap JSON fixtures for use in eval scenarios.
 * Each trap file follows the knowledgeSubmissionSchema-compatible format
 * with additional id and lifecycleState fields for fixture seeding.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSkillMarkdown } from '@trapmap/lib';

// =============================================================================
// Type definitions for trap fixtures
// =============================================================================

export interface TrapFixture {
  id: string;
  teamId: string | null;
  scope: 'global' | 'project';
  labels: string[];
  shortcut: string;
  detail: string;
  requiredLevel: number;
  lifecycleState: 'approved' | 'pending' | 'rejected' | 'deprecated';
}

// =============================================================================
// Frontend traps (8)
// =============================================================================

import trapAsyncRaceCondition from './frontend/trap_async_race_condition.json';
import trapBundleSizeBloat from './frontend/trap_bundle_size_bloat.json';
import trapCssLayoutShift from './frontend/trap_css_layout_shift.json';
import trapCssZIndexStacking from './frontend/trap_css_z_index_stacking.json';
import trapMemoryLeakEventListeners from './frontend/trap_memory_leak_event_listeners.json';
import trapReactKeyDuplicate from './frontend/trap_react_key_duplicate.json';
import trapReactStaleClosure from './frontend/trap_react_stale_closure.json';
import trapSsrHydrationMismatch from './frontend/trap_ssr_hydration_mismatch.json';

export const frontendTraps: TrapFixture[] = [
  trapReactStaleClosure,
  trapCssZIndexStacking,
  trapAsyncRaceCondition,
  trapMemoryLeakEventListeners,
  trapReactKeyDuplicate,
  trapBundleSizeBloat,
  trapSsrHydrationMismatch,
  trapCssLayoutShift,
] as TrapFixture[];

// =============================================================================
// Backend traps (8)
// =============================================================================

import trapConnectionPoolExhaustion from './backend/trap_connection_pool_exhaustion.json';
import trapJsonSerializationCircular from './backend/trap_json_serialization_circular.json';
import trapMissingPagination from './backend/trap_missing_pagination.json';
import trapNPlusOneQuery from './backend/trap_n_plus_1_query.json';
import trapRaceConditionIdCounter from './backend/trap_race_condition_id_counter.json';
import trapTransactionDeadlock from './backend/trap_transaction_deadlock.json';
import trapUnboundedMemoryCache from './backend/trap_unbounded_memory_cache.json';
import trapUnhandledPromiseRejection from './backend/trap_unhandled_promise_rejection.json';

export const backendTraps: TrapFixture[] = [
  trapNPlusOneQuery,
  trapConnectionPoolExhaustion,
  trapTransactionDeadlock,
  trapJsonSerializationCircular,
  trapUnboundedMemoryCache,
  trapMissingPagination,
  trapRaceConditionIdCounter,
  trapUnhandledPromiseRejection,
] as TrapFixture[];

// =============================================================================
// Testing traps (6)
// =============================================================================

import trapAssertionAsyncGap from './testing/trap_assertion_async_gap.json';
import trapFlakyTestTiming from './testing/trap_flaky_test_timing.json';
import trapMockStateLeakage from './testing/trap_mock_state_leakage.json';
import trapSetupTeardownOrder from './testing/trap_setup_teardown_order.json';
import trapSnapshotDrift from './testing/trap_snapshot_drift.json';
import trapTestEnvironmentMismatch from './testing/trap_test_environment_mismatch.json';

export const testingTraps: TrapFixture[] = [
  trapFlakyTestTiming,
  trapMockStateLeakage,
  trapAssertionAsyncGap,
  trapSnapshotDrift,
  trapTestEnvironmentMismatch,
  trapSetupTeardownOrder,
] as TrapFixture[];

// =============================================================================
// Infrastructure traps (6)
// =============================================================================

import trapCiTimeoutSlowTest from './infra/trap_ci_timeout_slow_test.json';
import trapDockerCacheStale from './infra/trap_docker_cache_stale.json';
import trapEnvConfigMismatch from './infra/trap_env_config_mismatch.json';
import trapHelmChartDrift from './infra/trap_helm_chart_drift.json';
import trapK8sOomKill from './infra/trap_k8s_oom_kill.json';
import trapTlsCertRotation from './infra/trap_tls_cert_rotation.json';

export const infraTraps: TrapFixture[] = [
  trapDockerCacheStale,
  trapCiTimeoutSlowTest,
  trapK8sOomKill,
  trapEnvConfigMismatch,
  trapHelmChartDrift,
  trapTlsCertRotation,
] as TrapFixture[];

// =============================================================================
// Cross-domain traps (6)
// =============================================================================

import trapCiTestInfraCascade from './cross-domain/trap_ci_test_infra_cascade.json';
import trapCorsPreflightFailure from './cross-domain/trap_cors_preflight_failure.json';
import trapFullstackDeployOrder from './cross-domain/trap_fullstack_deploy_order.json';
import trapMonitoringBlindSpot from './cross-domain/trap_monitoring_blind_spot.json';
import trapSchemaMigrationBreaking from './cross-domain/trap_schema_migration_breaking.json';
import trapSecretsRotationCascade from './cross-domain/trap_secrets_rotation_cascade.json';

export const crossDomainTraps: TrapFixture[] = [
  trapFullstackDeployOrder,
  trapCiTestInfraCascade,
  trapMonitoringBlindSpot,
  trapSchemaMigrationBreaking,
  trapCorsPreflightFailure,
  trapSecretsRotationCascade,
] as TrapFixture[];

// =============================================================================
// Skill-format traps (6) - SKILL.md format for import testing
// =============================================================================

/**
 * Skill-format trap fixture parsed from SKILL.md files.
 * Used for testing skill import functionality.
 */
export interface SkillFormatTrap {
  id: string;
  name: string;
  description: string | null;
  labels: string[];
  body: string;
  skillMdPath: string;
}

/**
 * Load a skill-format trap from a SKILL.md file.
 */
function loadSkillFormatTrap(dirName: string): SkillFormatTrap {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const skillMdPath = join(__dirname, 'skill-format', dirName, 'SKILL.md');
  const content = readFileSync(skillMdPath, 'utf-8');
  const parsed = parseSkillMarkdown(content);

  return {
    id: `skill-format-${dirName}`,
    name: parsed.name ?? dirName,
    description: parsed.description,
    labels: parsed.labels,
    body: parsed.body,
    skillMdPath,
  };
}

export const skillFormatTraps: SkillFormatTrap[] = [
  loadSkillFormatTrap('docker-deploy-trap'),
  loadSkillFormatTrap('react-hooks-trap'),
  loadSkillFormatTrap('api-pagination-trap'),
  loadSkillFormatTrap('ci-pipeline-trap'),
  loadSkillFormatTrap('typescript-strict-trap'),
  loadSkillFormatTrap('database-migration-trap'),
];

// =============================================================================
// Aggregated exports
// =============================================================================

/**
 * All trap fixtures indexed by category.
 */
export const trapsByCategory = {
  frontend: frontendTraps,
  backend: backendTraps,
  testing: testingTraps,
  infra: infraTraps,
  'cross-domain': crossDomainTraps,
} as const;

/**
 * All trap fixtures in a flat array.
 */
export const allTraps: TrapFixture[] = [
  ...frontendTraps,
  ...backendTraps,
  ...testingTraps,
  ...infraTraps,
  ...crossDomainTraps,
];

/**
 * All trap fixtures indexed by id for O(1) lookup.
 */
export const trapsById: Map<string, TrapFixture> = new Map(allTraps.map((trap) => [trap.id, trap]));

/**
 * Category list for iteration.
 */
export const trapCategories = Object.keys(trapsByCategory) as Array<keyof typeof trapsByCategory>;
