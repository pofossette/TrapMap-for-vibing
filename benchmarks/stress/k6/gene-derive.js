import http from 'k6/http';
import { check } from 'k6';
export const options = {
  vus: 10,
  duration: '10s',
  thresholds: { http_req_failed: ['rate==0'], http_req_duration: ['p(95)<50'] },
};
const payload = JSON.stringify({
  traps: Array.from({ length: 200 }, (_, i) => ({
    trapId: `t-${i}`,
    trapText: 'MATCH: foo\nGOAL: bar\nSTRATEGY: fix\nAVOID: bad\nVERIFY: test',
    derivationUnitId: `u-${i}`,
  })),
});
export default function () {
  const res = http.post('http://localhost:4100/v1/gene/derive-batch', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 200: (r) => r.status === 200 });
}
