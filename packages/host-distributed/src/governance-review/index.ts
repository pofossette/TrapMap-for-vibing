import { loadServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { createServer } from './server.js';

export async function start() {
  const config = loadServiceConfig('governance-review');
  const db = createServiceDatabase(config);
  const server = await createServer(config, db);
  await server.start();
  return { config, db, server };
}
