import { describe, expect, it } from 'vitest';
import {
  type CiGuardrailFact,
  type DeploymentProfileFact,
  type DocTruthManifest,
  type EnvironmentFact,
  type RuntimeRouteFact,
  type ScriptFact,
  type TelemetryFact,
  type WorkspacePackageFact,
  extractCiGuardrails,
  extractDeploymentProfiles,
  extractDocTruthManifest,
  extractEnvironmentFacts,
  extractRuntimeRoutes,
  extractScripts,
  extractTelemetryFacts,
  extractWorkspacePackages,
} from '../extract-doc-truth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = new URL('../../', import.meta.url).pathname;

// ---------------------------------------------------------------------------
// extractScripts
// ---------------------------------------------------------------------------

describe('extractScripts', () => {
  it('returns script names and commands from package.json', () => {
    const scripts = extractScripts(ROOT);
    expect(scripts.length).toBeGreaterThan(0);

    const build = scripts.find((s) => s.name === 'build');
    expect(build).toBeDefined();
    expect(build!.command).toBe('tsc -b');
  });

  it('includes CI-related scripts', () => {
    const scripts = extractScripts(ROOT);
    const names = scripts.map((s) => s.name);
    expect(names).toContain('ci');
    expect(names).toContain('check:docs');
    expect(names).toContain('check:structure');
    expect(names).toContain('check:asserts');
    expect(names).toContain('test');
    expect(names).toContain('typecheck');
  });

  it('rejects duplicate script names', () => {
    const scripts = extractScripts(ROOT);
    const names = scripts.map((s) => s.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });
});

// ---------------------------------------------------------------------------
// extractWorkspacePackages
// ---------------------------------------------------------------------------

describe('extractWorkspacePackages', () => {
  it('lists all workspace packages from packages/ directory', () => {
    const pkgs = extractWorkspacePackages(ROOT);
    expect(pkgs.length).toBeGreaterThan(0);

    const names = pkgs.map((p) => p.name);
    expect(names).toContain('contracts');
    expect(names).toContain('host-local');
    expect(names).toContain('host-distributed');
    expect(names).toContain('backend-core');
    expect(names).toContain('persistence-schema');
  });

  it('includes package.json path for each package', () => {
    const pkgs = extractWorkspacePackages(ROOT);
    for (const pkg of pkgs) {
      expect(pkg.packageJsonPath).toMatch(/packages\/[^/]+\/package\.json$/);
    }
  });

  it('rejects duplicate package names', () => {
    const pkgs = extractWorkspacePackages(ROOT);
    const names = pkgs.map((p) => p.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });
});

// ---------------------------------------------------------------------------
// extractCiGuardrails
// ---------------------------------------------------------------------------

describe('extractCiGuardrails', () => {
  it('extracts guardrail commands from ci.yml', () => {
    const guardrails = extractCiGuardrails(ROOT);
    expect(guardrails.length).toBeGreaterThan(0);

    const names = guardrails.map((g) => g.name);
    expect(names).toContain('check:docs');
    expect(names).toContain('check:structure');
    expect(names).toContain('check:asserts');
    expect(names).toContain('check:deps');
    expect(names).toContain('check:complexity');
  });

  it('marks all doc-guardrails steps as blocking (non-blocking tiers moved inside check:docs)', () => {
    const guardrails = extractCiGuardrails(ROOT);
    for (const guardrail of guardrails) {
      expect(guardrail.blocking).toBe(true);
    }
  });

  it('marks commands without || true as blocking', () => {
    const guardrails = extractCiGuardrails(ROOT);
    const docs = guardrails.find((g) => g.name === 'check:docs');
    expect(docs).toBeDefined();
    expect(docs!.blocking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractEnvironmentFacts
// ---------------------------------------------------------------------------

describe('extractEnvironmentFacts', () => {
  it('extracts environment facts from observability config', () => {
    const envFacts = extractEnvironmentFacts(ROOT);
    expect(envFacts.length).toBeGreaterThan(0);

    const otelDisabled = envFacts.find((f) => f.key === 'OTEL_DISABLED');
    expect(otelDisabled).toBeDefined();
    expect(otelDisabled!.defaultValue).toBe(false);

    const metricsEnabled = envFacts.find((f) => f.key === 'TRAPMAP_METRICS_ENABLED');
    expect(metricsEnabled).toBeDefined();
    expect(metricsEnabled!.defaultValue).toBe(true);
  });

  it('includes source path for each fact', () => {
    const envFacts = extractEnvironmentFacts(ROOT);
    for (const fact of envFacts) {
      expect(fact.sourcePath).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// extractRuntimeRoutes
// ---------------------------------------------------------------------------

describe('extractRuntimeRoutes', () => {
  it('extracts health/ready/live/metrics from host-local', () => {
    const routes = extractRuntimeRoutes(ROOT);
    const hostLocalRoutes = routes.filter((r) => r.host === 'host-local');
    expect(hostLocalRoutes.length).toBeGreaterThan(0);

    const paths = hostLocalRoutes.map((r) => r.path);
    expect(paths).toContain('/health');
    expect(paths).toContain('/ready');
    expect(paths).toContain('/live');
    expect(paths).toContain('/metrics');
  });

  it('extracts health routes from host-distributed gateway', () => {
    const routes = extractRuntimeRoutes(ROOT);
    const gatewayRoutes = routes.filter((r) => r.host === 'host-distributed-gateway');
    expect(gatewayRoutes.length).toBeGreaterThan(0);

    const paths = gatewayRoutes.map((r) => r.path);
    expect(paths).toContain('/health');
    expect(paths).toContain('/ready');
    expect(paths).toContain('/live');
  });

  it('includes source path for each route', () => {
    const routes = extractRuntimeRoutes(ROOT);
    for (const route of routes) {
      expect(route.sourcePath).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// extractDeploymentProfiles
// ---------------------------------------------------------------------------

describe('extractDeploymentProfiles', () => {
  it('extracts deployment profiles from config', () => {
    const profiles = extractDeploymentProfiles(ROOT);
    expect(profiles.length).toBeGreaterThan(0);

    const names = profiles.map((p) => p.name);
    expect(names).toContain('local-agent');
    expect(names).toContain('team-monolith');
    expect(names).toContain('distributed');
  });

  it('includes preset options', () => {
    const profiles = extractDeploymentProfiles(ROOT);
    const allPresets = profiles.flatMap((p) => p.presets);
    expect(allPresets).toContain('monolith');
    expect(allPresets).toContain('api');
  });
});

// ---------------------------------------------------------------------------
// extractTelemetryFacts
// ---------------------------------------------------------------------------

describe('extractTelemetryFacts', () => {
  it('extracts telemetry-related facts', () => {
    const telemetry = extractTelemetryFacts(ROOT);
    expect(telemetry.length).toBeGreaterThan(0);

    const disabled = telemetry.find((t) => t.key === 'OTEL_DISABLED');
    expect(disabled).toBeDefined();
  });

  it('includes source path for each fact', () => {
    const telemetry = extractTelemetryFacts(ROOT);
    for (const fact of telemetry) {
      expect(fact.sourcePath).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// extractDocTruthManifest (full manifest)
// ---------------------------------------------------------------------------

describe('extractDocTruthManifest', () => {
  it('produces a complete manifest with all sections', () => {
    const manifest = extractDocTruthManifest(ROOT);
    expect(manifest.scripts.length).toBeGreaterThan(0);
    expect(manifest.workspacePackages.length).toBeGreaterThan(0);
    expect(manifest.ciGuardrails.length).toBeGreaterThan(0);
    expect(manifest.environment.length).toBeGreaterThan(0);
    expect(manifest.runtimeRoutes.length).toBeGreaterThan(0);
    expect(manifest.deploymentProfiles.length).toBeGreaterThan(0);
    expect(manifest.telemetry.length).toBeGreaterThan(0);
  });

  it('includes a generatedAt timestamp', () => {
    const manifest = extractDocTruthManifest(ROOT);
    expect(manifest.generatedAt).toBeTruthy();
    expect(new Date(manifest.generatedAt).getTime()).not.toBeNaN();
  });
});
