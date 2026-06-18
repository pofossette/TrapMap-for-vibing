export { createServer } from './server.js';
export { registerRoutes } from './routes.js';
export { createCandidateIngestionDeps } from './ports.js';

import { loadServiceConfig } from '../config/index.js';
import { createServiceDatabase } from '../shared/database.js';
import { createServer } from './server.js';

export async function start() {
  const config = loadServiceConfig('candidate-ingestion');
  const db = createServiceDatabase(config);
  const server = await createServer(config, db);
  await server.start();
  return { config, db, server };
}
