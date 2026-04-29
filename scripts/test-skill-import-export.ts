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
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { ArtifactBundle } from '../packages/contracts/src/index.js';
import { buildServer } from '../packages/server/src/app.js';

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

async function main() {
  // Load bundles
  if (!existsSync(BUNDLES_PATH)) {
    console.error(`Bundles file not found: ${BUNDLES_PATH}`);
    console.error('Run pnpm download:skills first.');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(BUNDLES_PATH, 'utf8'));
  const allBundles: ArtifactBundle[] = raw.bundles;
  const bundles = allBundles.slice(0, LIMIT);

  log('\n=== Skill Import/Export Round-trip Test ===');
  log(`Loaded ${allBundles.length} bundles, testing ${bundles.length}`);

  // Build server with system admin key
  const ADMIN_KEY = 'test-admin-key-12345';
  const app = buildServer({
    config: {
      systemAdminKey: ADMIN_KEY,
      dataFile: resolve('./data/test-skill-import-export.json'),
    },
    bodyLimit: 5 * 1024 * 1024, // 5MB for large skill bundles
  });
  await app.ready();
  verbose('Server ready');

  try {
    // Step 1: Login as system admin
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { systemAdminKey: ADMIN_KEY },
    });
    if (adminLogin.statusCode !== 200) {
      throw new Error(`Admin login failed: ${adminLogin.statusCode} ${adminLogin.body}`);
    }
    const adminToken = adminLogin.headers['x-session-token'];
    verbose(`Admin login OK, token: ${adminToken.slice(0, 12)}...`);

    // Step 2: Create a team
    const teamRes = await app.inject({
      method: 'POST',
      url: '/v1/teams',
      headers: { 'x-session-token': adminToken },
      payload: { name: 'Import Test Team' },
    });
    if (teamRes.statusCode !== 200 && teamRes.statusCode !== 201) {
      throw new Error(`Team creation failed: ${teamRes.statusCode} ${teamRes.body}`);
    }
    const team = teamRes.json();
    const teamId = team.id;
    verbose(`Team created: ${teamId}`);

    // Step 3: Create an admin member
    const memberRes = await app.inject({
      method: 'POST',
      url: '/v1/members',
      headers: { 'x-session-token': adminToken },
      payload: {
        teamId,
        handle: 'test-importer',
        roleTemplate: 'admin',
        permissions: [],
      },
    });
    if (memberRes.statusCode !== 200 && memberRes.statusCode !== 201) {
      throw new Error(`Member creation failed: ${memberRes.statusCode} ${memberRes.body}`);
    }
    const member = memberRes.json();
    const memberId = member.id;
    verbose(`Member created: ${memberId}`);

    // Step 4: Set member security level to 10
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v1/members/${memberId}`,
      headers: { 'x-session-token': adminToken },
      payload: { memberId, securityLevel: 10 },
    });
    if (patchRes.statusCode !== 200) {
      throw new Error(`Member update failed: ${patchRes.statusCode} ${patchRes.body}`);
    }
    verbose('Member security level set to 10');

    // Step 5: Issue access key
    const keyRes = await app.inject({
      method: 'POST',
      url: '/v1/access-keys',
      headers: { 'x-session-token': adminToken },
      payload: { teamId, memberId },
    });
    if (keyRes.statusCode !== 200) {
      throw new Error(`Access key issuance failed: ${keyRes.statusCode} ${keyRes.body}`);
    }
    const accessKey = keyRes.json().accessKey;
    verbose(`Access key issued: ${accessKey.slice(-8)}`);

    // Step 6: Logout admin
    await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { 'x-session-token': adminToken },
    });

    // Step 7: Login as user
    const userLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { accessKey },
    });
    if (userLogin.statusCode !== 200) {
      throw new Error(`User login failed: ${userLogin.statusCode} ${userLogin.body}`);
    }
    const userToken = userLogin.headers['x-session-token'];
    verbose('User login OK');

    // Step 8: Select team
    const selectRes = await app.inject({
      method: 'POST',
      url: '/v1/teams/select',
      headers: { 'x-session-token': userToken },
      payload: { teamId },
    });
    if (selectRes.statusCode !== 200) {
      throw new Error(`Team select failed: ${selectRes.statusCode} ${selectRes.body}`);
    }
    // After team select, token is still valid but session now has activeTeamId
    verbose(`Team selected: ${teamId}`);

    // =========================================================================
    // IMPORT TEST
    // =========================================================================
    log('\n--- Import Test ---');
    log(`Importing ${bundles.length} bundles...`);

    // Import one by one to isolate errors
    let importedTotal = 0;
    let failedTotal = 0;
    const importedItems: Array<{ artifactId: string; bundleIndex: number }> = [];

    for (let i = 0; i < bundles.length; i++) {
      const bundle = bundles[i];
      const importRes = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/import',
        headers: { 'x-session-token': userToken },
        payload: { bundles: [bundle] },
      });

      if (importRes.statusCode !== 200) {
        console.error(`  [fail] ${bundle.title}: HTTP ${importRes.statusCode}`);
        console.error(`         ${importRes.body.slice(0, 300)}`);
        failedTotal++;
        continue;
      }

      const result = importRes.json();
      importedTotal += result.importedCount;
      failedTotal += result.failedCount;

      for (const r of result.results) {
        if (r.success && r.artifactId) {
          importedItems.push({ artifactId: r.artifactId, bundleIndex: i });
        }
        if (!r.success) {
          console.error(`  [fail] ${r.title}: ${r.error}`);
        }
      }

      if (result.importedCount > 0) {
        verbose(`  [ok] ${bundle.title} (${bundle.files.length} files)`);
      }
    }

    log(`Imported: ${importedTotal}, Failed: ${failedTotal}`);

    if (importedTotal === 0) {
      log('\nNo artifacts imported, skipping export test.');
      await app.close();
      return;
    }

    // =========================================================================
    // EXPORT TEST
    // =========================================================================
    log('\n--- Export Test ---');
    log(`Exporting ${importedItems.length} artifacts...`);

    let exportOk = 0;
    let exportFail = 0;
    let fileMismatchCount = 0;

    for (const { artifactId, bundleIndex } of importedItems) {
      const original = bundles[bundleIndex];
      const exportRes = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { 'x-session-token': userToken },
        payload: { artifactId, format: 'bundle-json' },
      });

      if (exportRes.statusCode !== 200) {
        console.error(`  [export-fail] ${original.title} (${artifactId}): ${exportRes.statusCode}`);
        exportFail++;
        continue;
      }

      const exported = exportRes.json();
      const bundle = exported.bundle;

      if (!bundle) {
        console.error(`  [export-fail] ${original.title}: no bundle in response`);
        exportFail++;
        continue;
      }

      if (original.files.length !== bundle.files.length) {
        console.error(
          `  [mismatch] ${original.title}: original ${original.files.length} files, exported ${bundle.files.length}`,
        );
        fileMismatchCount++;
      } else {
        verbose(`  [ok] ${original.title}: ${bundle.files.length} files match`);
      }

      exportOk++;
    }

    log(
      `Exported: ${exportOk}, Failed: ${exportFail}, File count mismatches: ${fileMismatchCount}`,
    );

    // =========================================================================
    // SUMMARY
    // =========================================================================
    log('\n=== Summary ===');
    log(`Bundles tested: ${bundles.length}`);
    log(`Imported: ${importedTotal}, Failed: ${failedTotal}`);
    log(`Exported: ${exportOk}, Failed: ${exportFail}`);
    log(`Round-trip file count OK: ${exportOk - fileMismatchCount}/${exportOk}`);

    if (failedTotal > 0 || exportFail > 0 || fileMismatchCount > 0) {
      log('\nSome issues found — see above for details.');
    } else if (importedTotal > 0 && exportOk > 0) {
      log('\nAll good! Import/export round-trip passed.');
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
