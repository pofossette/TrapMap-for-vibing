import { pathToFileURL } from 'node:url';

export { buildServer } from './app.js';

async function start() {
  throw new Error(
    'server executable has no identity owner; start the host-local compatibility runtime instead',
  );
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl === import.meta.url) {
  start().catch((error: unknown) => {
    console.error('Failed to start TrapMap server', error);
    process.exitCode = 1;
  });
}
