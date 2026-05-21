/**
 * Ingestion Eval Assertions
 *
 * Validates each stage of deriveFromPayloads() output.
 */

import type { ArtifactBundle } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Local types (mirrors DerivedArtifactOutputs from derive.ts)
// ---------------------------------------------------------------------------

interface DerivedCapsule {
  capsuleId: string;
  artifactId: string;
  revision: number;
  sourcePaths: string[];
  content: string;
  situation: string;
  problem: string;
  goal: string;
  errorText: string | null;
  contextualPrefix?: string;
  labels: string[];
  scope: string;
  requiredLevel: number;
}

interface DerivedProfile {
  artifactId: string;
  revision: number;
  sourceHash: string;
  title: string;
  summary: string;
  keywords: string[];
  referencePaths: string[];
  contentHash: string;
}

interface ClientManifest {
  artifactId: string;
  revision: number;
  references: Array<{ path: string; sha256: string; sizeBytes: number; mediaType: string }>;
  assets: Array<{ path: string; sha256: string; sizeBytes: number; mediaType: string }>;
  scripts: Array<{
    path: string;
    sha256: string;
    capability: string;
    argsSchemaSummary: string;
    sideEffectSummary: string;
    defaultPolicy: string;
  }>;
  sourceHash: string;
}

export interface DerivedOutput {
  profile: DerivedProfile | null;
  capsules: DerivedCapsule[];
  clientManifest: ClientManifest | null;
  sourceHash: string;
  derivedAt: string;
}

// ---------------------------------------------------------------------------
// Assertion types
// ---------------------------------------------------------------------------

export interface DerivationAssertions {
  profileNonNull: boolean;
  profileSummaryNonEmpty: boolean;
  profileSummaryMinLength: boolean;
  profileKeywordsNonEmpty: boolean;
  capsulesNonEmpty: boolean;
  capsulesMaxFive: boolean;
  allCapsulesHaveContent: boolean;
  allCapsulesHaveSituation: boolean;
  allCapsulesHaveProblem: boolean;
  allCapsulesHaveGoal: boolean;
  allCapsulesHaveLabels: boolean;
  clientManifestMatchesInput: boolean;
  sourceHashNonEmpty: boolean;
  derivedAtValid: boolean;
  noLLMCalls: boolean;
}

export interface DerivationAssertionResult {
  fixtureId: string;
  title: string;
  assertions: DerivationAssertions;
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Assertion runner
// ---------------------------------------------------------------------------

export function runAssertions(
  fixtureId: string,
  bundle: ArtifactBundle,
  output: DerivedOutput,
): DerivationAssertionResult {
  const a: DerivationAssertions = {
    profileNonNull: output.profile !== null,
    profileSummaryNonEmpty: (output.profile?.summary?.length ?? 0) > 0,
    profileSummaryMinLength: (output.profile?.summary?.length ?? 0) >= 20,
    profileKeywordsNonEmpty: (output.profile?.keywords?.length ?? 0) >= 1,
    capsulesNonEmpty: output.capsules.length >= 1,
    capsulesMaxFive: output.capsules.length <= 5,
    allCapsulesHaveContent:
      output.capsules.length > 0 &&
      output.capsules.every((c: DerivedCapsule) => c.content.length > 0),
    allCapsulesHaveSituation:
      output.capsules.length > 0 &&
      output.capsules.every((c: DerivedCapsule) => c.situation.length > 0),
    allCapsulesHaveProblem:
      output.capsules.length > 0 &&
      output.capsules.every((c: DerivedCapsule) => c.problem.length > 0),
    allCapsulesHaveGoal:
      output.capsules.length > 0 && output.capsules.every((c: DerivedCapsule) => c.goal.length > 0),
    allCapsulesHaveLabels:
      output.capsules.length > 0 &&
      output.capsules.every((c: DerivedCapsule) => c.labels.length >= 1),
    clientManifestMatchesInput: checkClientManifest(bundle, output),
    sourceHashNonEmpty: output.sourceHash.length === 64,
    derivedAtValid: !Number.isNaN(Date.parse(output.derivedAt)),
    noLLMCalls: output.capsules.every((c: DerivedCapsule) => !c.contextualPrefix),
  };

  const passed = Object.values(a).every(Boolean);

  return {
    fixtureId,
    title: bundle.title,
    assertions: a,
    passed,
  };
}

// ---------------------------------------------------------------------------
// Client manifest check
// ---------------------------------------------------------------------------

function checkClientManifest(bundle: ArtifactBundle, output: DerivedOutput): boolean {
  const hasRefs = bundle.files.some((f) => f.source === 'references/');
  const hasAssets = bundle.files.some((f) => f.source === 'assets/');
  const hasScripts = bundle.files.some((f) => f.source === 'scripts/');

  // If no references, assets, or scripts exist, any result is acceptable
  if (!hasRefs && !hasAssets && !hasScripts) {
    return true;
  }

  // If any exist, clientManifest must be non-null
  if (!output.clientManifest) return false;

  // Check references paths match
  if (hasRefs) {
    const expectedPaths = bundle.files
      .filter((f) => f.source === 'references/')
      .map((f) => f.path)
      .sort();
    const actualPaths = output.clientManifest.references
      .map((r: { path: string }) => r.path)
      .sort();
    if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) return false;
  }

  // Check assets paths match
  if (hasAssets) {
    const expectedPaths = bundle.files
      .filter((f) => f.source === 'assets/')
      .map((f) => f.path)
      .sort();
    const actualPaths = output.clientManifest.assets.map((a: { path: string }) => a.path).sort();
    if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) return false;
  }

  // Check scripts paths match
  if (hasScripts) {
    const expectedPaths = bundle.files
      .filter((f) => f.source === 'scripts/')
      .map((f) => f.path)
      .sort();
    const actualPaths = output.clientManifest.scripts.map((s: { path: string }) => s.path).sort();
    if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) return false;
  }

  return true;
}
