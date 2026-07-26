#!/usr/bin/env node
/**
 * Skill bundle owner round-trip check.
 *
 * Imports downloaded bundles through knowledge-write's PostgreSQL owner and
 * verifies the artifact read projection retains each file manifest.
 *
 * Usage:
 *   TRAPMAP_DATABASE_URL=... pnpm exec tsx scripts/test-skill-import-export.ts --actor-id <existing-user-id>
 */

import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { ArtifactBundle } from '@trapmap/contracts';
import {
  createArtifactBundleImportPort,
  createArtifactReadProjection,
} from '@trapmap/service-knowledge-write';
import { Pool } from 'pg';

const { values } = parseArgs({
  options: {
    'bundles-path': { type: 'string', default: './data/downloaded-skills/skill-bundles.json' },
    limit: { type: 'string', default: '' },
    verbose: { type: 'boolean', default: false },
    'actor-id': { type: 'string' },
    'actor-handle': { type: 'string', default: 'skill-import-export-runner' },
    'actor-level': { type: 'string', default: '10' },
    'team-id': { type: 'string' },
  },
  strict: true,
});

const BUNDLES_PATH = values['bundles-path'];
const LIMIT = values.limit ? Number(values.limit) : Number.POSITIVE_INFINITY;
const VERBOSE = values.verbose;

type ImportedItem = { artifactId: string; bundleIndex: number };
type ImportSummary = { importedTotal: number; failedTotal: number; importedItems: ImportedItem[] };
type ExportSummary = { exportOk: number; exportFail: number; fileMismatchCount: number };

function log(message: string): void {
  console.log(message);
}

function verbose(message: string): void {
  if (VERBOSE) console.log(`  ${message}`);
}

function loadBundles(): { allBundles: ArtifactBundle[]; bundles: ArtifactBundle[] } {
  if (!existsSync(BUNDLES_PATH)) {
    throw new Error(`Bundles file not found: ${BUNDLES_PATH}. Run pnpm download:skills first.`);
  }
  const raw = JSON.parse(readFileSync(BUNDLES_PATH, 'utf8')) as { bundles: ArtifactBundle[] };
  return { allBundles: raw.bundles, bundles: raw.bundles.slice(0, LIMIT) };
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.TRAPMAP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('skill import/export requires TRAPMAP_DATABASE_URL or DATABASE_URL');
  }
  return databaseUrl;
}

function requireActor() {
  if (!values['actor-id']) {
    throw new Error('skill import/export requires --actor-id for an existing identity owner');
  }
  const securityLevel = Number(values['actor-level']);
  if (!Number.isInteger(securityLevel) || securityLevel < 0 || securityLevel > 10) {
    throw new Error(`Invalid --actor-level: ${values['actor-level']}`);
  }
  return {
    actorId: values['actor-id'],
    teamId: values['team-id'] ?? null,
    handle: values['actor-handle'],
    securityLevel,
  };
}

async function importBundles(
  importer: ReturnType<typeof createArtifactBundleImportPort>,
  bundles: ArtifactBundle[],
): Promise<ImportSummary> {
  log('\n--- Import Test ---');
  const actor = requireActor();
  const summary: ImportSummary = { importedTotal: 0, failedTotal: 0, importedItems: [] };
  for (const [bundleIndex, bundle] of bundles.entries()) {
    try {
      if (bundle.requiredLevel > actor.securityLevel) {
        throw new Error(
          `requiredLevel ${bundle.requiredLevel} exceeds actor level ${actor.securityLevel}`,
        );
      }
      const artifact = await importer.importBundle(bundle, actor);
      summary.importedTotal += 1;
      summary.importedItems.push({ artifactId: artifact.id, bundleIndex });
      verbose(`[ok] ${bundle.title} (${bundle.files.length} files)`);
    } catch (error) {
      summary.failedTotal += 1;
      console.error(
        `  [fail] ${bundle.title}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  log(`Imported: ${summary.importedTotal}, Failed: ${summary.failedTotal}`);
  return summary;
}

async function exportBundles(
  projection: ReturnType<typeof createArtifactReadProjection>,
  bundles: ArtifactBundle[],
  items: ImportedItem[],
): Promise<ExportSummary> {
  log('\n--- Export Test ---');
  const summary: ExportSummary = { exportOk: 0, exportFail: 0, fileMismatchCount: 0 };
  for (const item of items) {
    const original = bundles[item.bundleIndex]!;
    const [artifact] = await projection.exportArtifacts({ artifactId: item.artifactId });
    if (!artifact) {
      summary.exportFail += 1;
      console.error(`  [export-fail] ${original.title}: artifact not found`);
      continue;
    }
    const fileCount = artifact.history.at(-1)?.files.length ?? 0;
    if (fileCount !== original.files.length) {
      summary.fileMismatchCount += 1;
      console.error(
        `  [mismatch] ${original.title}: original ${original.files.length} files, exported ${fileCount}`,
      );
    } else {
      verbose(`[ok] ${original.title}: ${fileCount} files match`);
    }
    summary.exportOk += 1;
  }
  log(
    `Exported: ${summary.exportOk}, Failed: ${summary.exportFail}, File count mismatches: ${summary.fileMismatchCount}`,
  );
  return summary;
}

function reportSummary(
  bundleCount: number,
  imported: ImportSummary,
  exported: ExportSummary,
): void {
  log('\n=== Summary ===');
  log(`Bundles tested: ${bundleCount}`);
  log(`Imported: ${imported.importedTotal}, Failed: ${imported.failedTotal}`);
  log(`Exported: ${exported.exportOk}, Failed: ${exported.exportFail}`);
  log(
    `Round-trip file count OK: ${exported.exportOk - exported.fileMismatchCount}/${exported.exportOk}`,
  );
}

async function main(): Promise<void> {
  const { allBundles, bundles } = loadBundles();
  log('\n=== Skill Import/Export Owner Round-trip Test ===');
  log(`Loaded ${allBundles.length} bundles, testing ${bundles.length}`);
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  try {
    const imported = await importBundles(createArtifactBundleImportPort(pool), bundles);
    const exported = await exportBundles(
      createArtifactReadProjection(pool),
      bundles,
      imported.importedItems,
    );
    reportSummary(bundles.length, imported, exported);
    if (imported.failedTotal > 0 || exported.exportFail > 0 || exported.fileMismatchCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
