/**
 * Ingestion Eval Adapter
 *
 * Bridges ArtifactBundle (from batch-download or fixtures) to the inputs
 * expected by deriveFromPayloads().
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArtifactBundle, ArtifactFilePayloadRecord } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context for deriveFromPayloads(). Mirrors the unexported interface in derive.ts.
 */
export interface DerivationContext {
  artifactId: string;
  labels: string[];
  title: string;
  scope: 'global' | 'project';
  requiredLevel: number;
}

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

const FIXED_STORED_AT = '2025-01-01T00:00:00.000Z';

export function bundleToPayloads(
  bundle: ArtifactBundle,
  artifactId: string,
): ArtifactFilePayloadRecord[] {
  return bundle.files.map((file) => ({
    artifactId,
    revision: 1,
    path: file.path,
    sha256: file.sha256,
    sizeBytes: file.sizeBytes,
    mediaType: file.mediaType,
    content: file.content,
    storedAt: FIXED_STORED_AT,
  }));
}

export function buildDerivationContext(
  bundle: ArtifactBundle,
  artifactId: string,
): DerivationContext {
  return {
    artifactId,
    labels: bundle.labels,
    title: bundle.title,
    scope: bundle.scope,
    requiredLevel: bundle.requiredLevel,
  };
}

export function makeDeterministicId(slug: string): string {
  return createHash('sha256').update(slug).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export function loadDownloadedBundles(): ArtifactBundle[] {
  const bundlePath = join(process.cwd(), 'data', 'downloaded-skills', 'skill-bundles.json');
  try {
    const raw = readFileSync(bundlePath, 'utf-8');
    const parsed = JSON.parse(raw) as { bundles: ArtifactBundle[] };
    return parsed.bundles;
  } catch (_err) {
    throw new Error(
      `Cannot load downloaded skills from ${bundlePath}.\nRun \`pnpm download:skills\` first, or use --dry-run to use bundled fixtures.`,
    );
  }
}
