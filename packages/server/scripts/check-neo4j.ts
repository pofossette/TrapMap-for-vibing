#!/usr/bin/env node

import neo4j from 'neo4j-driver';

import { loadGraphDbConfig } from '@trapmap/server/lib/graph-query/index.js';

function maskSecret(value: string): string {
  if (value.length <= 4) {
    return '****';
  }

  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

async function main(): Promise<void> {
  const config = loadGraphDbConfig();

  console.log('TrapMap graph DB config');
  console.log(`  enabled: ${config.enabled}`);
  console.log(`  provider: ${config.provider}`);
  console.log(`  failOpen: ${config.failOpen}`);
  console.log(`  syncOnWrite: ${config.syncOnWrite}`);

  if (!config.enabled) {
    console.log('');
    console.log('Graph DB is disabled. TrapMap will use the in-memory graphology backend.');
    process.exit(0);
  }

  console.log(`  uri: ${config.uri}`);
  console.log(`  username: ${config.username}`);
  console.log(`  password: ${maskSecret(config.password!)}`);
  console.log(`  database: ${config.database}`);
  console.log('');
  console.log('Checking Neo4j connectivity...');

  const driver = neo4j.driver(config.uri!, neo4j.auth.basic(config.username!, config.password!));

  try {
    await driver.verifyConnectivity();

    const session = driver.session({ database: config.database });
    try {
      const result = await session.run('RETURN 1 AS ok');
      const ok = result.records[0]?.get('ok');
      console.log(`Connectivity OK (probe result: ${String(ok)})`);
      console.log('TrapMap can use Neo4j as the primary graph query backend.');
    } finally {
      await session.close();
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Connectivity check failed: ${detail}`);
    if (config.failOpen) {
      console.error(
        'Current config keeps fail-open enabled, so TrapMap would fall back to memory.',
      );
    } else {
      console.error('Current config disables fail-open, so TrapMap startup would fail.');
    }
    process.exit(1);
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(detail);
  process.exit(1);
});
