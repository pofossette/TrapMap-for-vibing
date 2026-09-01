#!/usr/bin/env node
// autocannon wrapper — batch-cosine (not auto-run)
// Usage: node benchmarks/stress/autocannon-batch-cosine.js [--url http://localhost:4100]
import { spawnSync } from 'node:child_process';
const url = process.argv[2] ?? 'http://localhost:4100/v1/vector/batch-cosine';
const payload = (() => {
  const dim = 384,
    n = 1000;
  const vec = () => Array.from({ length: dim }, () => Math.random() * 2 - 1);
  return JSON.stringify({ query: vec(), vectors: Array.from({ length: n }, vec) });
})();
spawnSync(
  'npx',
  [
    'autocannon',
    '-c',
    '50',
    '-d',
    '10',
    '-p',
    '10',
    '-m',
    'POST',
    '-H',
    'Content-Type: application/json',
    '-b',
    payload,
    url,
  ],
  { stdio: 'inherit' },
);
