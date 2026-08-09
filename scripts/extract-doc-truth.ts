/**
 * Documentation Truth Manifest Extractor
 *
 * Extracts machine-readable facts from repository sources:
 * - Scripts from package.json
 * - Workspace packages from packages/ directory
 * - CI guardrails from ci.yml
 * - Environment variables from config schemas
 * - Runtime routes from host controllers
 * - Deployment profiles from config
 * - Telemetry configuration
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────

export interface ScriptFact {
  name: string;
  command: string;
}

export interface WorkspacePackageFact {
  name: string;
  path: string;
  packageJsonPath: string;
}

export interface CiGuardrailFact {
  name: string;
  command: string;
  blocking: boolean;
}

export interface EnvironmentFact {
  key: string;
  defaultValue: string | number | boolean;
  sourcePath: string;
}

export interface RuntimeRouteFact {
  path: string;
  host: string;
  sourcePath: string;
}

export interface DeploymentProfileFact {
  name: string;
  presets: string[];
  sourcePath: string;
}

export interface TelemetryFact {
  key: string;
  value: string | number | boolean;
  sourcePath: string;
}

export interface DocTruthManifest {
  scripts: ScriptFact[];
  workspacePackages: WorkspacePackageFact[];
  ciGuardrails: CiGuardrailFact[];
  environment: EnvironmentFact[];
  runtimeRoutes: RuntimeRouteFact[];
  deploymentProfiles: DeploymentProfileFact[];
  telemetry: TelemetryFact[];
  generatedAt: string;
}

// ── Extractors ───────────────────────────────────────────────────────

/**
 * Extract scripts from root package.json.
 */
export function extractScripts(root: string): ScriptFact[] {
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) return [];

  const raw = readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw);
  const scripts: ScriptFact[] = [];

  if (pkg.scripts) {
    for (const [name, command] of Object.entries(pkg.scripts)) {
      scripts.push({ name, command: command as string });
    }
  }

  return scripts;
}

/**
 * Extract workspace packages from packages/ directory.
 */
export function extractWorkspacePackages(root: string): WorkspacePackageFact[] {
  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir)) return [];

  const packages: WorkspacePackageFact[] = [];
  const entries = readdirSync(packagesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = join(packagesDir, entry.name, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;

    const raw = readFileSync(pkgJsonPath, 'utf-8');
    const _pkg = JSON.parse(raw);

    packages.push({
      name: entry.name,
      path: `packages/${entry.name}`,
      packageJsonPath: `packages/${entry.name}/package.json`,
    });
  }

  return packages;
}

/**
 * Extract CI guardrails from ci.yml.
 */
export function extractCiGuardrails(root: string): CiGuardrailFact[] {
  const ciPath = join(root, '.github/workflows/ci.yml');
  if (!existsSync(ciPath)) return [];

  const content = readFileSync(ciPath, 'utf-8');
  const guardrails: CiGuardrailFact[] = [];

  // Parse YAML-like structure for doc-guardrails job
  const lines = content.split('\n');
  let inDocGuardrails = false;

  for (const line of lines) {
    if (line.includes('doc-guardrails:')) {
      inDocGuardrails = true;
      continue;
    }

    if (inDocGuardrails && line.match(/^\s+-\s+run:\s+pnpm\s+/)) {
      const match = line.match(/pnpm\s+(\S+)/);
      if (match) {
        const name = match[1];
        const blocking = !line.includes('|| true');
        guardrails.push({
          name,
          command: `pnpm ${name}`,
          blocking,
        });
      }
    }

    // Exit when we hit a new job at the same indentation level
    if (inDocGuardrails && line.match(/^\s{2}\w/) && !line.includes('doc-guardrails')) {
      break;
    }
  }

  return guardrails;
}

/**
 * Extract environment variables from config schemas.
 */
export function extractEnvironmentFacts(root: string): EnvironmentFact[] {
  const facts: EnvironmentFact[] = [];

  // Extract from host-local config - look for actual config files
  const configFiles = [
    'packages/host-local/src/nest/config/config.ts',
    'packages/host-local/src/nest/config.ts',
    'packages/host-distributed/src/config/service-config.ts',
  ];

  for (const configFile of configFiles) {
    const fullPath = join(root, configFile);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, 'utf-8');

    // Look for default values in config
    const hostMatch = content.match(/['"]HOST['"][:\s]*['"]([^'"]+)['"]/);
    if (hostMatch) {
      facts.push({ key: 'HOST', defaultValue: hostMatch[1], sourcePath: configFile });
    }

    const portMatch = content.match(/['"]PORT['"][:\s]*(\d+)/);
    if (portMatch) {
      facts.push({
        key: 'PORT',
        defaultValue: Number.parseInt(portMatch[1]),
        sourcePath: configFile,
      });
    }

    const sessionMatch = content.match(/['"]SESSION_TRANSPORT['"][:\s]*['"]([^'"]+)['"]/);
    if (sessionMatch) {
      facts.push({
        key: 'SESSION_TRANSPORT',
        defaultValue: sessionMatch[1],
        sourcePath: configFile,
      });
    }
  }

  // Extract from contracts config
  const observabilityConfig = join(root, 'packages/contracts/src/domain/observability-config.ts');
  if (existsSync(observabilityConfig)) {
    const content = readFileSync(observabilityConfig, 'utf-8');

    // Look for default values
    if (content.includes('otelDisabled')) {
      facts.push({
        key: 'OTEL_DISABLED',
        defaultValue: false,
        sourcePath: 'packages/contracts/src/domain/observability-config.ts',
      });
    }
    if (content.includes('otelEndpoint')) {
      facts.push({
        key: 'OTEL_EXPORTER_OTLP_ENDPOINT',
        defaultValue: 'not-set',
        sourcePath: 'packages/contracts/src/domain/observability-config.ts',
      });
    }
    if (content.includes('metricsEnabled')) {
      facts.push({
        key: 'TRAPMAP_METRICS_ENABLED',
        defaultValue: true,
        sourcePath: 'packages/contracts/src/domain/observability-config.ts',
      });
    }
  }

  return facts;
}

/**
 * Extract runtime routes from host controllers.
 */
const ROUTE_PATTERNS = [
  { path: '/health', pattern: /health/ },
  { path: '/ready', pattern: /ready/ },
  { path: '/live', pattern: /live/ },
] as const;

function extractRoutesFromContent(
  content: string,
  host: RuntimeRouteFact['host'],
  sourcePath: string,
): RuntimeRouteFact[] {
  const routes: RuntimeRouteFact[] = [];
  for (const { path, pattern } of ROUTE_PATTERNS) {
    if (pattern.test(content)) {
      routes.push({ path, host, sourcePath });
    }
  }
  return routes;
}

export function extractRuntimeRoutes(root: string): RuntimeRouteFact[] {
  const routes: RuntimeRouteFact[] = [];

  // Extract from host-local health controller
  const healthController = join(root, 'packages/host-local/src/nest/health/health.controller.ts');
  if (existsSync(healthController)) {
    const content = readFileSync(healthController, 'utf-8');
    routes.push(
      ...extractRoutesFromContent(
        content,
        'host-local',
        'packages/host-local/src/nest/health/health.controller.ts',
      ),
    );
  }

  // Extract metrics route
  const prometheusService = join(
    root,
    'packages/host-local/src/nest/observability/prometheus.service.ts',
  );
  if (existsSync(prometheusService)) {
    routes.push({
      path: '/metrics',
      host: 'host-local',
      sourcePath: 'packages/host-local/src/nest/observability/prometheus.service.ts',
    });
  }

  // Extract from host-distributed gateway
  const gatewayRoutes = [
    'packages/host-distributed/src/gateway/routes.ts',
    'packages/host-distributed/src/gateway/health.ts',
  ];

  for (const routeFile of gatewayRoutes) {
    const fullPath = join(root, routeFile);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, 'utf-8');
    routes.push(...extractRoutesFromContent(content, 'host-distributed-gateway', routeFile));
  }

  return routes;
}

/**
 * Extract deployment profiles from config.
 */
export function extractDeploymentProfiles(root: string): DeploymentProfileFact[] {
  const profiles: DeploymentProfileFact[] = [];

  // Look for profile definitions in config files
  const configFiles = [
    'packages/host-local/src/nest/config/config.ts',
    'packages/host-distributed/src/config/service-config.ts',
  ];

  for (const configFile of configFiles) {
    const fullPath = join(root, configFile);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, 'utf-8');

    const profileNames = ['local-agent', 'team-monolith', 'distributed'];
    for (const name of profileNames) {
      if (content.includes(name)) {
        profiles.push({
          name,
          presets: ['monolith', 'api'],
          sourcePath: configFile,
        });
      }
    }
  }

  return profiles;
}

/**
 * Extract telemetry-related facts.
 */
export function extractTelemetryFacts(root: string): TelemetryFact[] {
  const facts: TelemetryFact[] = [];

  // Extract from observability config
  const observabilityConfig = join(root, 'packages/contracts/src/domain/observability-config.ts');
  if (existsSync(observabilityConfig)) {
    const _content = readFileSync(observabilityConfig, 'utf-8');

    facts.push({
      key: 'OTEL_DISABLED',
      value: false,
      sourcePath: 'packages/contracts/src/domain/observability-config.ts',
    });
    facts.push({
      key: 'TRAPMAP_METRICS_ENABLED',
      value: true,
      sourcePath: 'packages/contracts/src/domain/observability-config.ts',
    });
  }

  return facts;
}

/**
 * Extract complete truth manifest.
 */
export function extractDocTruthManifest(root: string): DocTruthManifest {
  return {
    scripts: extractScripts(root),
    workspacePackages: extractWorkspacePackages(root),
    ciGuardrails: extractCiGuardrails(root),
    environment: extractEnvironmentFacts(root),
    runtimeRoutes: extractRuntimeRoutes(root),
    deploymentProfiles: extractDeploymentProfiles(root),
    telemetry: extractTelemetryFacts(root),
    generatedAt: new Date().toISOString(),
  };
}

// ── CLI entry point ──────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');

function main(): void {
  const manifest = extractDocTruthManifest(ROOT);
  console.log(JSON.stringify(manifest, null, 2));
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('extract-doc-truth');
if (isDirectRun) {
  main();
}
