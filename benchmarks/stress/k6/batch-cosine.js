// k6 script — batch-cosine 1k×384 (not auto-run)
// Usage: k6 run benchmarks/stress/k6/batch-cosine.js

import { check } from 'k6';
import http from 'k6/http';
export const options = {
  vus: 50,
  duration: '10s',
  thresholds: { http_req_failed: ['rate==0'], http_req_duration: ['p(95)<15', 'p(99)<30'] },
};
const dim = 384;
const n = 1000;
function vec() {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}
const payload = JSON.stringify({ query: vec(), vectors: Array.from({ length: n }, vec) });
export default function () {
  const res = http.post('http://localhost:4100/v1/vector/batch-cosine', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, {
    200: (r) => r.status === 200,
    'scores len': (r) => (r.json('scores') || []).length === n,
  });
}
