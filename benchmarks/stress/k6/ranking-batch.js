import http from 'k6/http';
import { check } from 'k6';
export const options = {
  vus: 30,
  duration: '10s',
  thresholds: { http_req_failed: ['rate==0'], http_req_duration: ['p(95)<20'] },
};
const entry = (id) => ({
  id,
  semanticScore: 0.6,
  keywordScore: 0.4,
  combinedScore: 0.5,
  channelScores: { semantic: 0.6 },
  tokenMatches: [],
  channels: ['semantic'],
  preRerankScore: 0.5,
  finalScore: 0.5,
  labels: [],
  scope: 'global',
  shortcut: 'x',
  detail: 'y',
});
const payload = JSON.stringify({
  entries: Array.from({ length: 1000 }, (_, i) => entry(`id-${i}`)),
  queryTokens: ['x', 'y'],
  maxCandidates: 50,
});
export default function () {
  const res = http.post('http://localhost:4100/v1/retrieval/ranking-batch', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 200: (r) => r.status === 200 });
}
