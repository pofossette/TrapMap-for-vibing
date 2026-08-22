import { afterEach, describe, expect, it } from 'vitest';

import {
  SURFACE_EXEMPTIONS,
  SURFACE_INVENTORY_DRIFT,
  type SurfaceViolation,
  checkSurface,
  collectDocumentedPaths,
  collectRoutePathsFromSource,
  normalizeRoutePath,
} from '../check-route-surface';
import { cleanupTempRepos, makeTempRepo, write } from './helpers/temp-repo';

afterEach(() => {
  cleanupTempRepos();
});

describe('normalizeRoutePath', () => {
  it('replaces named route params with a shared :param token', () => {
    expect(normalizeRoutePath('/v1/traps/:trapId')).toBe('/v1/traps/:param');
    expect(normalizeRoutePath('/v1/knowledge/:entryId/history')).toBe(
      '/v1/knowledge/:param/history',
    );
    expect(normalizeRoutePath('/v1/operations/artifacts/:artifactId/review')).toBe(
      '/v1/operations/artifacts/:param/review',
    );
  });

  it('leaves static paths untouched', () => {
    expect(normalizeRoutePath('/v1/retrieval/search')).toBe('/v1/retrieval/search');
  });
});

describe('collectRoutePathsFromSource', () => {
  it('extracts single-quoted path field literals with 1-based line numbers', () => {
    const source = [
      'gatewayRouteDef({',
      "  method: 'GET',",
      "  path: '/v1/knowledge/:entryId',",
      '  handler: () => null,',
      '}),',
      'gatewayRouteDef({',
      "  method: 'POST',",
      "  path: '/v1/retrieval/search',",
      '}),',
    ].join('\n');

    const refs = collectRoutePathsFromSource(source, 'route-defs.ts');
    expect(refs).toEqual([
      { path: '/v1/knowledge/:entryId', file: 'route-defs.ts', line: 3 },
      { path: '/v1/retrieval/search', file: 'route-defs.ts', line: 8 },
    ]);
  });

  it('ignores non-path-field strings, type declarations and non-version paths', () => {
    const source = [
      'interface RouteDef {',
      '  path: string;',
      '}',
      "const url = '/v1/handwritten';",
      'const comment = "path is \'/v2/retrieval/search\'";',
      "gatewayRouteDef({ path: '/internal/retrieval/search' }),",
      "gatewayRouteDef({ path: '/v3/retrieval/search' }),",
    ].join('\n');

    const refs = collectRoutePathsFromSource(source, 'route-defs.ts');
    expect(refs).toEqual([{ path: '/v3/retrieval/search', file: 'route-defs.ts', line: 7 }]);
  });
});

describe('collectDocumentedPaths', () => {
  it('extracts /v1|/v2|/v3 path literals from markdown with file:line locations', () => {
    const root = makeTempRepo('route-surface-docs-');
    const doc = [
      '# API surface',
      '',
      '| 方法 | 路由 | 用途 |',
      '|------|------|------|',
      '| `POST` | `/v1/auth/login` | 登录 |',
      '| `POST` | `/v1/retrieval/search` | 检索 |',
      '',
      'curl /v1/operations/artifacts/export for the manifest endpoint',
      '内部端点 /internal/retrieval/search 不参与网关面',
    ].join('\n');
    write(root, 'docs/api-surface.md', doc);

    const refs = collectDocumentedPaths([`${root}/docs/api-surface.md`]);
    expect(refs).toEqual([
      { path: '/v1/auth/login', file: `${root}/docs/api-surface.md`, line: 5 },
      { path: '/v1/retrieval/search', file: `${root}/docs/api-surface.md`, line: 6 },
      { path: '/v1/operations/artifacts/export', file: `${root}/docs/api-surface.md`, line: 8 },
    ]);
  });

  it('keeps one ref per (file, line) occurrence and ignores trailing punctuation', () => {
    const root = makeTempRepo('route-surface-docs-');
    const doc = [
      '- `POST /v1/retrieval/search`（v1 条目级检索）',
      '- `POST /v2/retrieval/search`、`POST /v3/retrieval/search`',
      '- 另见 `/v1/retrieval/search`。',
    ].join('\n');
    write(root, 'docs/api-surface.md', doc);

    const refs = collectDocumentedPaths([`${root}/docs/api-surface.md`]);
    expect(refs).toEqual([
      { path: '/v1/retrieval/search', file: `${root}/docs/api-surface.md`, line: 1 },
      { path: '/v2/retrieval/search', file: `${root}/docs/api-surface.md`, line: 2 },
      { path: '/v3/retrieval/search', file: `${root}/docs/api-surface.md`, line: 2 },
      { path: '/v1/retrieval/search', file: `${root}/docs/api-surface.md`, line: 3 },
    ]);
  });
});

describe('checkSurface', () => {
  const routeFile = 'packages/host-local/src/nest/gateway/gateway.route-defs.ts';
  const apiSurfaceFile = 'docs/reference/api-surface.md';
  const clientFile = 'docs/guides/CLIENT_INTEGRATION.md';
  const skillLookup = '/v1/retrieval/skills/search-by-content';

  function expectSkillLookupGap(violations: SurfaceViolation[]) {
    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe('documented-not-real');
    expect(violations[0]?.path).toBe(skillLookup);
  }

  it('passes when every documented path exists as a gateway route (:param normalized)', () => {
    const real = [
      { path: '/v1/traps/:trapId', file: routeFile, line: 1 },
      { path: '/v1/retrieval/search', file: routeFile, line: 2 },
      { path: '/v1/knowledge/:entryId', file: routeFile, line: 3 },
    ];
    const documented = [
      { path: '/v1/traps/:trapId', file: apiSurfaceFile, line: 10 },
      { path: '/v1/retrieval/search', file: apiSurfaceFile, line: 11 },
      { path: '/v1/knowledge/:entryId', file: apiSurfaceFile, line: 12 },
    ];
    expect(checkSurface(real, documented, SURFACE_EXEMPTIONS)).toEqual([]);
  });

  it('flags documented paths that no gateway RouteDef registers', () => {
    const real = [{ path: '/v1/retrieval/search', file: routeFile, line: 2 }];
    const documented = [
      { path: '/v1/retrieval/search', file: apiSurfaceFile, line: 11 },
      { path: skillLookup, file: apiSurfaceFile, line: 12 },
      { path: skillLookup, file: clientFile, line: 53 },
    ];

    const violations = checkSurface(real, documented, SURFACE_EXEMPTIONS);
    expectSkillLookupGap(violations);
    expect(violations[0].refs).toEqual([
      { path: '/v1/retrieval/skills/search-by-content', file: apiSurfaceFile, line: 12 },
      { path: '/v1/retrieval/skills/search-by-content', file: clientFile, line: 53 },
    ]);
  });

  it('exempts only the listed documented-but-unimplemented paths (seed: /v2/retrieval/search)', () => {
    const real = [{ path: '/v1/retrieval/search', file: routeFile, line: 2 }];
    const documented = [
      { path: '/v1/retrieval/search', file: apiSurfaceFile, line: 10 },
      { path: '/v2/retrieval/search', file: apiSurfaceFile, line: 11 },
      { path: '/v1/retrieval/skills/search-by-content', file: apiSurfaceFile, line: 12 },
    ];

    const violations = checkSurface(real, documented, SURFACE_EXEMPTIONS);
    expect(violations.map((v) => v.path)).toEqual(['/v1/retrieval/skills/search-by-content']);
  });

  it('does not let exemptions hide newly added paths', () => {
    const real = [{ path: '/v1/retrieval/search', file: routeFile, line: 2 }];
    const documented = [
      { path: '/v1/retrieval/search', file: apiSurfaceFile, line: 10 },
      // A different v2-style path must NOT be silently covered by the v2 seed.
      { path: '/v2/other/endpoint', file: apiSurfaceFile, line: 11 },
    ];

    const violations = checkSurface(real, documented, SURFACE_EXEMPTIONS);
    expect(violations.map((v) => v.path)).toEqual(['/v2/other/endpoint']);
  });

  it('flags real gateway routes that are absent from api-surface.md documentation', () => {
    const real = [
      { path: '/v1/retrieval/search', file: routeFile, line: 2 },
      {
        path: '/v1/cron/jobs',
        file: 'packages/host-local/src/nest/gateway/gateway.cron-route-defs.ts',
        line: 9,
      },
    ];
    const documented = [
      { path: '/v1/retrieval/search', file: apiSurfaceFile, line: 11 },
      // Documented in CLIENT_INTEGRATION only -> does not count as api-surface doc.
      { path: '/v1/cron/jobs', file: clientFile, line: 30 },
    ];

    const violations = checkSurface(real, documented, SURFACE_EXEMPTIONS);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('real-not-documented');
    expect(violations[0].path).toBe('/v1/cron/jobs');
  });

  it('exemptions never suppress the real-not-documented direction', () => {
    const real = [{ path: '/v2/retrieval/search', file: routeFile, line: 2 }];
    const documented: { path: string; file: string; line: number }[] = [];

    const violations = checkSurface(real, documented, SURFACE_EXEMPTIONS);
    expect(violations.map((v) => v.kind)).toEqual(['real-not-documented']);
  });

  it('keys the expected base-main scenario to the skill-lookup gap only', () => {
    const real = [
      { path: '/v1/retrieval/search', file: routeFile, line: 121 },
      {
        path: '/v3/retrieval/search',
        file: 'packages/host-distributed/src/gateway/route-defs.ts',
        line: 835,
      },
    ];
    const documented = [
      { path: '/v1/retrieval/search', file: apiSurfaceFile, line: 115 },
      { path: '/v2/retrieval/search', file: apiSurfaceFile, line: 116 },
      { path: '/v3/retrieval/search', file: apiSurfaceFile, line: 117 },
      { path: skillLookup, file: apiSurfaceFile, line: 119 },
    ];

    const violations = checkSurface(real, documented, SURFACE_EXEMPTIONS);
    expectSkillLookupGap(violations);
  });

  it('freezes known adoption-time drift without hiding new documented paths', () => {
    const real = [{ path: '/v1/retrieval/search', file: routeFile, line: 2 }];
    const known = SURFACE_INVENTORY_DRIFT.at(0);
    if (!known) throw new Error('inventory drift fixture is required');
    const documented = [
      { path: '/v1/retrieval/search', file: apiSurfaceFile, line: 10 },
      { path: known, file: apiSurfaceFile, line: 11 },
      { path: '/v1/new/not-implemented', file: apiSurfaceFile, line: 12 },
    ];

    const violations = checkSurface(real, documented, SURFACE_EXEMPTIONS, SURFACE_INVENTORY_DRIFT);
    expect(violations.map((violation) => violation.path)).toEqual(['/v1/new/not-implemented']);
  });

  it('freezes known undocumented gateway routes but still requires new routes to be documented', () => {
    const known = SURFACE_INVENTORY_DRIFT.find((path) => path === '/v1/cron/status');
    if (!known) throw new Error('cron status drift fixture is required');
    const real = [
      { path: known, file: routeFile, line: 2 },
      { path: '/v1/new/undocumented', file: routeFile, line: 3 },
    ];
    const documented = [{ path: '/v1/retrieval/search', file: apiSurfaceFile, line: 10 }];

    const violations = checkSurface(real, documented, SURFACE_EXEMPTIONS, SURFACE_INVENTORY_DRIFT);
    expect(violations.map((violation) => violation.path)).toEqual([
      '/v1/retrieval/search',
      '/v1/new/undocumented',
    ]);
  });
});
