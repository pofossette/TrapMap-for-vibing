import { check } from 'k6';
import http from 'k6/http';
export const options = {
  vus: 100,
  duration: '10s',
  thresholds: { http_req_failed: ['rate==0'], http_req_duration: ['p(95)<10'] },
};
export default function () {
  const payload = JSON.stringify({ parts: ['hello', 'world', 'trap'] });
  const res = http.post('http://localhost:4100/v1/dedup/fingerprint', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 200: (r) => r.status === 200 });
}
