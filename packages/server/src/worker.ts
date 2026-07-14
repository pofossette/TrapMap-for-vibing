import { pathToFileURL } from 'node:url';

async function startWorker() {
  throw new Error(
    'server worker executable has no identity owner; start a host-composed worker instead',
  );
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl === import.meta.url) {
  startWorker().catch((error: unknown) => {
    console.error('Failed to start TrapMap worker runtime', error);
    process.exitCode = 1;
  });
}
