#!/usr/bin/env node
/**
 * Skill Import/Export Round-trip Test
 *
 * Tests the full TrapMap server import/export pipeline using downloaded skill bundles.
 * Uses the Fastify inject() API to call routes directly (no network required).
 *
 * Usage:
 *   pnpm exec tsx scripts/test-skill-import-export.ts
 *   pnpm exec tsx scripts/test-skill-import-export.ts --limit 3 --verbose
 */

import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { ArtifactBundle } from '../packages/contracts/src/index.js';
import { buildPostgresComposedServer } from './testing/postgres-server-composition.js';

// =============================================================================
// CLI
// =============================================================================

const { values } = parseArgs({
  options: {
    'bundles-path': { type: 'string', default: './data/downloaded-skills/skill-bundles.json' },
    limit: { type: 'string', default: '' },
    verbose: { type: 'boolean', default: false },
  },
  strict: true,
});

const BUNDLES_PATH = values['bundles-path'];
const LIMIT = values.limit ? Number(values.limit) : Number.POSITIVE_INFINITY;
const VERBOSE = values.verbose;

// =============================================================================
// Helpers
// =============================================================================

function log(msg: string) {
  console.log(msg);
}

function verbose(msg: string) {
  if (VERBOSE) console.log(`  ${msg}`);
}

// =============================================================================
// Main
// =============================================================================

type App = ReturnType<typeof buildPostgresComposedServer>['app'];
type ImportedItem = { artifactId: string; bundleIndex: number };
type ImportSummary = { importedTotal: number; failedTotal: number; importedItems: ImportedItem[] };
type ExportSummary = { exportOk: number; exportFail: number; fileMismatchCount: number };

function loadBundles(): { allBundles: ArtifactBundle[]; bundles: ArtifactBundle[] } {
  if (!existsSync(BUNDLES_PATH)) {
    console.error(`Bundles file not found: ${BUNDLES_PATH}`);
    console.error('Run pnpm download:skills first.');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(BUNDLES_PATH, 'utf8')) as { bundles: ArtifactBundle[] };
  return { allBundles: raw.bundles, bundles: raw.bundles.slice(0, LIMIT) };
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.TRAPMAP_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'skill import/export requires TRAPMAP_DATABASE_URL and PostgreSQL host composition',
    );
  }
  return databaseUrl;
}

async function main() {
  const { allBundles, bundles } = loadBundles();

  log('\n=== Skill Import/Export Round-trip Test ===');
  log(`Loaded ${allBundles.length} bundles, testing ${bundles.length}`);

  const ADMIN_KEY = 'test-admin-key-12345';
  const composed = buildPostgresComposedServer(requireDatabaseUrl(), {
    config: {
      systemAdminKey: ADMIN_KEY,
    },
    bodyLimit: 5 * 1024 * 1024, // 5MB for large skill bundles
  });
  const app = composed.app;

  try {
    await app.ready();
    verbose('Server ready');
    await runRoundTrip(app, bundles, ADMIN_KEY);
  } finally {
    await composed.close();
  }
}

async function runRoundTrip(app: App, bundles: ArtifactBundle[], adminKey: string): Promise<void> {
  const userToken = await createUserSession(app, adminKey);
  const imported = await importBundles(app, bundles, userToken);
  const exported =
    imported.importedTotal === 0
      ? skippedExportSummary()
      : await exportBundles(app, bundles, imported.importedItems, userToken);
  reportSummary(bundles.length, imported, exported);
}

async function createUserSession(app: App, adminKey: string): Promise<string> {
  const adminLogin = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { systemAdminKey: adminKey },
  });
  assertStatus(adminLogin, [200], 'Admin login');
  const adminToken = adminLogin.headers['x-session-token'] as string;
  const team = await createTeam(app, adminToken);
  const member = await createMember(app, adminToken, team.id);
  await configureMember(app, adminToken, member.id);
  const accessKey = await issueAccessKey(app, adminToken, team.id, member.id);
  await app.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    headers: { 'x-session-token': adminToken },
  });
  return loginAndSelectTeam(app, accessKey, team.id);
}

async function createTeam(app: App, token: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/teams',
    headers: { 'x-session-token': token },
    payload: { name: 'Import Test Team' },
  });
  assertStatus(response, [200, 201], 'Team creation');
  return response.json() as { id: string };
}

async function createMember(app: App, token: string, teamId: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/members',
    headers: { 'x-session-token': token },
    payload: { teamId, handle: 'test-importer', roleTemplate: 'admin', permissions: [] },
  });
  assertStatus(response, [200, 201], 'Member creation');
  return response.json() as { id: string };
}

async function configureMember(app: App, token: string, memberId: string): Promise<void> {
  const response = await app.inject({
    method: 'PATCH',
    url: `/v1/members/${memberId}`,
    headers: { 'x-session-token': token },
    payload: { memberId, securityLevel: 10 },
  });
  assertStatus(response, [200], 'Member update');
}

async function issueAccessKey(
  app: App,
  token: string,
  teamId: string,
  memberId: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/access-keys',
    headers: { 'x-session-token': token },
    payload: { teamId, memberId },
  });
  assertStatus(response, [200], 'Access key issuance');
  return (response.json() as { accessKey: string }).accessKey;
}

async function loginAndSelectTeam(app: App, accessKey: string, teamId: string): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { accessKey } });
  assertStatus(login, [200], 'User login');
  const token = login.headers['x-session-token'] as string;
  const selection = await app.inject({
    method: 'POST',
    url: '/v1/teams/select',
    headers: { 'x-session-token': token },
    payload: { teamId },
  });
  assertStatus(selection, [200], 'Team select');
  return token;
}

function assertStatus(
  response: { statusCode: number; body: string },
  expected: number[],
  action: string,
): void {
  if (!expected.includes(response.statusCode))
    throw new Error(`${action} failed: ${response.statusCode} ${response.body}`);
}

async function importBundles(
  app: App,
  bundles: ArtifactBundle[],
  token: string,
): Promise<ImportSummary> {
  log('\n--- Import Test ---');
  log(`Importing ${bundles.length} bundles...`);
  const summary: ImportSummary = { importedTotal: 0, failedTotal: 0, importedItems: [] };
  for (const [bundleIndex, bundle] of bundles.entries())
    await importBundle(app, token, bundle, bundleIndex, summary);
  log(`Imported: ${summary.importedTotal}, Failed: ${summary.failedTotal}`);
  return summary;
}

async function importBundle(
  app: App,
  token: string,
  bundle: ArtifactBundle,
  bundleIndex: number,
  summary: ImportSummary,
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/operations/artifacts/import',
    headers: { 'x-session-token': token },
    payload: { bundles: [bundle] },
  });
  if (response.statusCode !== 200) {
    console.error(`  [fail] ${bundle.title}: HTTP ${response.statusCode}`);
    console.error(`         ${response.body.slice(0, 300)}`);
    summary.failedTotal += 1;
    return;
  }
  const result = response.json() as {
    importedCount: number;
    failedCount: number;
    results: Array<{ success: boolean; artifactId?: string; title: string; error?: string }>;
  };
  summary.importedTotal += result.importedCount;
  summary.failedTotal += result.failedCount;
  recordImportedItems(result.results, bundleIndex, summary.importedItems);
  reportImportResult(result, bundle);
}

function recordImportedItems(
  results: Array<{ success: boolean; artifactId?: string }>,
  bundleIndex: number,
  importedItems: ImportedItem[],
): void {
  for (const result of results)
    if (result.success && result.artifactId)
      importedItems.push({ artifactId: result.artifactId, bundleIndex });
}

function reportImportResult(
  result: {
    importedCount: number;
    results: Array<{ success: boolean; title: string; error?: string }>;
  },
  bundle: ArtifactBundle,
): void {
  result.results
    .filter((item) => !item.success)
    .forEach((item) => console.error(`  [fail] ${item.title}: ${item.error}`));
  if (result.importedCount > 0) verbose(`  [ok] ${bundle.title} (${bundle.files.length} files)`);
}

function skippedExportSummary(): ExportSummary {
  log('\nNo artifacts imported, skipping export test.');
  return { exportOk: 0, exportFail: 0, fileMismatchCount: 0 };
}

async function exportBundles(
  app: App,
  bundles: ArtifactBundle[],
  items: ImportedItem[],
  token: string,
): Promise<ExportSummary> {
  log('\n--- Export Test ---');
  log(`Exporting ${items.length} artifacts...`);
  const summary: ExportSummary = { exportOk: 0, exportFail: 0, fileMismatchCount: 0 };
  for (const item of items)
    await exportBundle(app, token, bundles[item.bundleIndex]!, item.artifactId, summary);
  log(
    `Exported: ${summary.exportOk}, Failed: ${summary.exportFail}, File count mismatches: ${summary.fileMismatchCount}`,
  );
  return summary;
}

async function exportBundle(
  app: App,
  token: string,
  original: ArtifactBundle,
  artifactId: string,
  summary: ExportSummary,
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/operations/artifacts/export',
    headers: { 'x-session-token': token },
    payload: { artifactId, format: 'bundle-json' },
  });
  if (response.statusCode !== 200)
    return reportExportFailure(
      summary,
      `${original.title} (${artifactId}): ${response.statusCode}`,
    );
  const bundle = (response.json() as { bundle?: ArtifactBundle }).bundle;
  if (!bundle) return reportExportFailure(summary, `${original.title}: no bundle in response`);
  reportFileCount(original, bundle, summary);
  summary.exportOk += 1;
}

function reportExportFailure(summary: ExportSummary, detail: string): void {
  console.error(`  [export-fail] ${detail}`);
  summary.exportFail += 1;
}

function reportFileCount(
  original: ArtifactBundle,
  bundle: ArtifactBundle,
  summary: ExportSummary,
): void {
  if (original.files.length !== bundle.files.length) {
    console.error(
      `  [mismatch] ${original.title}: original ${original.files.length} files, exported ${bundle.files.length}`,
    );
    summary.fileMismatchCount += 1;
    return;
  }
  verbose(`  [ok] ${original.title}: ${bundle.files.length} files match`);
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
  reportOutcome(imported, exported);
}

function reportOutcome(imported: ImportSummary, exported: ExportSummary): void {
  if (hasRoundTripIssues(imported, exported)) {
    log('\nSome issues found — see above for details.');
    return;
  }
  reportSuccessfulRoundTrip(imported, exported);
}

function hasRoundTripIssues(imported: ImportSummary, exported: ExportSummary): boolean {
  return imported.failedTotal > 0 || exported.exportFail > 0 || exported.fileMismatchCount > 0;
}

function reportSuccessfulRoundTrip(imported: ImportSummary, exported: ExportSummary): void {
  if (imported.importedTotal > 0 && exported.exportOk > 0)
    log('\nAll good! Import/export round-trip passed.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
