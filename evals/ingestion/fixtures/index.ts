/**
 * Ingestion Eval Fixtures
 *
 * Self-contained fixture bundles for CI (since data/ is gitignored).
 * Each fixture exercises a different derivation path.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ArtifactBundle, BundleFilePayload } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DerivationFixture {
  id: string;
  bundle: ArtifactBundle;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function mimeTypeFor(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    md: 'text/markdown',
    json: 'application/json',
    sh: 'application/x-sh',
    txt: 'text/plain',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    ts: 'text/typescript',
    js: 'application/javascript',
  };
  return map[ext] ?? 'application/octet-stream';
}

function classifyFile(relPath: string): {
  kind: BundleFilePayload['kind'];
  source: BundleFilePayload['source'];
  includeInDerivation: boolean;
  activationOnly: boolean;
} {
  if (relPath === 'SKILL.md') {
    return { kind: 'skill-markdown', source: 'SKILL.md', includeInDerivation: true, activationOnly: false };
  }
  if (relPath.startsWith('references/')) {
    return { kind: 'reference', source: 'references/', includeInDerivation: true, activationOnly: false };
  }
  if (relPath.startsWith('assets/')) {
    return { kind: 'asset', source: 'assets/', includeInDerivation: false, activationOnly: true };
  }
  if (relPath.startsWith('scripts/')) {
    return { kind: 'script', source: 'scripts/', includeInDerivation: false, activationOnly: true };
  }
  return { kind: 'reference', source: 'references/', includeInDerivation: true, activationOnly: false };
}

function collectFiles(dir: string, base: string = ''): Array<{ relPath: string; fullPath: string }> {
  const results: Array<{ relPath: string; fullPath: string }> = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'meta.json' || entry === '.gitkeep') continue;
    const fullPath = join(dir, entry);
    const relPath = base ? `${base}/${entry}` : entry;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectFiles(fullPath, relPath));
    } else {
      results.push({ relPath, fullPath });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

function loadFixture(dirName: string): DerivationFixture {
  const fixtureDir = join(__dirname, dirName);
  const meta = JSON.parse(readFileSync(join(fixtureDir, 'meta.json'), 'utf-8'));

  const fileEntries = collectFiles(fixtureDir);
  const files: BundleFilePayload[] = fileEntries.map(({ relPath, fullPath }) => {
    const content = readFileSync(fullPath, 'utf-8');
    const classification = classifyFile(relPath);
    return {
      path: relPath,
      kind: classification.kind,
      sha256: sha256(content),
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
      mediaType: mimeTypeFor(relPath),
      source: classification.source,
      includeInDerivation: classification.includeInDerivation,
      activationOnly: classification.activationOnly,
      content,
    };
  });

  const bundle: ArtifactBundle = {
    scope: meta.scope,
    labels: meta.labels,
    title: meta.title,
    slug: meta.slug,
    requiredLevel: meta.requiredLevel,
    sourceKind: meta.sourceKind,
    files,
    scriptDescriptors: meta.scriptDescriptors ?? [],
  };

  return { id: dirName, bundle };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const derivationFixtures: DerivationFixture[] = [
  loadFixture('with-frontmatter'),
  loadFixture('minimal-skill'),
  loadFixture('with-assets-and-scripts'),
];

export function getSmokeFixtures(): DerivationFixture[] {
  const first = derivationFixtures[0];
  return first ? [first] : [];
}
