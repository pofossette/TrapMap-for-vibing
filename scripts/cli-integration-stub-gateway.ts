// scripts/cli-integration-stub-gateway.ts
// Minimal stub gateway for CLI integration without full Nest stack
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4000);

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === '/health') {
    return json(res, {
      status: 'ok',
      service: 'stub-gateway',
      artifact: process.env.ARTIFACT ?? 'A-light',
      uptime: process.uptime(),
    });
  }
  if (path === '/ready') {
    return json(res, { ready: true, dependencies: { postgres: 'ok', gateway: 'ok' } });
  }
  if (path === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(
      '# HELP go_goroutines gauge\ngo_goroutines 5\n# HELP go_accel_cache_hits_total counter\ngo_accel_cache_hits_total 123\n',
    );
  }

  if (path === '/v1/auth/session') {
    return json(res, {
      authenticated: true,
      session: {
        sessionId: 'session_stub',
        member: {
          id: 'member_1',
          teamId: null,
          handle: 'stub-user',
          roleTemplate: 'admin',
          securityLevel: 5,
          permissions: [
            'team:create',
            'member:create',
            'knowledge:search',
            'knowledge:submit',
            'knowledge:review',
          ],
          notes: null,
          isSystem: false,
          createdAt: '2026-09-02T00:00:00.000Z',
          updatedAt: '2026-09-02T00:00:00.000Z',
        },
        activeTeam: null,
        effectivePermissions: [
          'team:create',
          'member:create',
          'knowledge:search',
          'knowledge:submit',
          'knowledge:review',
          'knowledge:export',
        ],
        expiresAt: null,
        issuedAt: '2026-09-02T00:00:00.000Z',
      },
    });
  }

  if (path === '/v1/auth/login') {
    return json(res, {
      session: {
        sessionId: 'session_stub',
        member: {
          id: 'member_1',
          teamId: null,
          handle: 'stub-user',
          roleTemplate: 'admin',
          securityLevel: 5,
          permissions: [
            'team:create',
            'member:create',
            'knowledge:search',
            'knowledge:submit',
            'knowledge:review',
          ],
          notes: null,
          isSystem: false,
          createdAt: '2026-09-02T00:00:00.000Z',
          updatedAt: '2026-09-02T00:00:00.000Z',
        },
        activeTeam: null,
        effectivePermissions: [
          'team:create',
          'member:create',
          'knowledge:search',
          'knowledge:submit',
          'knowledge:review',
        ],
        expiresAt: null,
        issuedAt: '2026-09-02T00:00:00.000Z',
      },
    });
  }

  if (path === '/v1/retrieval/search') {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      json(res, {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Test shortcut',
            detail: 'Test detail',
            labels: ['label1'],
            score: 0.95,
            reason: 'stub reason',
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
        routingTrace: {
          selectedMode: 'local',
          routeFamily: 'entry',
          routingReason: 'explicit-mode',
          fallbackApplied: false,
          channelsUsed: ['semantic'],
          fallbackTarget: null,
          confidenceScore: 0.9,
          confidenceBucket: 'high',
        },
      });
    });
    return;
  }

  if (path === '/v1/retrieval/genes/search') {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      json(res, {
        items: [
          {
            artifactId: 'artifact-1',
            title: 'Stub Gene',
            slug: 'stub-gene',
            labels: ['test'],
            scope: 'global',
            requiredLevel: 0,
            score: 0.9,
            reason: 'stub',
            situation: 's',
            problem: 'p',
            goal: 'g',
          },
        ],
        total: 1,
      });
    });
    return;
  }

  if (path === '/v1/candidates') {
    return json(res, { items: [], total: 0 });
  }

  if (path === '/v1/retrieval/skills/search-by-content') {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      json(res, {
        items: [
          {
            artifactId: 'artifact-1',
            title: 'Stub Skill',
            slug: 'stub-skill',
            labels: ['test'],
            scope: 'global',
            requiredLevel: 0,
          },
        ],
        total: 1,
      });
    });
    return;
  }

  if (path.startsWith('/v1/') || path.startsWith('/api/')) {
    // generic fallback for other v1 routes
    return json(res, { items: [], total: 0, success: true, path, method: req.method });
  }

  return json(res, { error: 'not found', path }, 404);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[stub-gateway] listening on 0.0.0.0:${PORT} artifact=${process.env.ARTIFACT ?? 'unknown'}`,
  );
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
