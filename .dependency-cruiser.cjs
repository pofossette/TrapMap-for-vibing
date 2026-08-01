/**
 * dependency-cruiser configuration for Trap-Map monorepo.
 *
 * Enforces layer-boundary rules:
 *   contracts  -> no workspace deps
 *   backend-core -> contracts only
 *   server     -> no host-* deps
 *   service-*  -> no cross-deps between services
 *   web-panel  -> no server/backend-core/host-* deps
 */

const SERVICE_PACKAGES = [
  'service-candidate-ingestion',
  'service-governance-review',
  'service-identity-access',
  'service-job-runtime',
  'service-knowledge-read',
  'service-knowledge-write',
];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // 1. contracts is the foundation — must not depend on any other workspace package
    {
      name: 'contracts-is-foundation',
      comment: 'packages/contracts must NOT depend on any workspace package',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: { path: '^packages/', pathNot: '^packages/contracts/' },
    },

    // 2. backend-core may only depend on contracts
    {
      name: 'backend-core-only-depends-contracts',
      comment:
        'packages/backend-core must only depend on packages/contracts (NOT server, host-*, service-*, web-panel, cli)',
      severity: 'error',
      from: { path: '^packages/backend-core/' },
      to: {
        path: '^packages/(server|host-[^/]+|service-[^/]+|web-panel|cli)/',
      },
    },

    // 3. server must not depend on host-* packages
    {
      name: 'server-no-host-deps',
      comment: 'packages/server must NOT depend on packages/host-*',
      severity: 'error',
      from: { path: '^packages/server/' },
      to: {
        path: '^packages/host-[^/]+/',
      },
    },

    // 4. service-* must not cross-depend on each other (runtime imports).
    //    Type-only imports are allowed for shared record types.
    //    Known exception: service-knowledge-read dynamically imports
    //    service-knowledge-write/labels/graph-align.js for optional label alignment.
    ...SERVICE_PACKAGES.map((svc) => ({
      name: `services-must-not-cross-dep:${svc}`,
      comment: `${svc} must NOT depend on other service-* packages (type-only imports allowed)`,
      severity: 'error',
      from: { path: `^packages/${svc}/` },
      to: {
        path: '^packages/service-[^/]+/',
        pathNot: [
          `^packages/${svc}/`,
          // knowledge-read may dynamically import knowledge-write/labels/graph-align
          ...(svc === 'service-knowledge-read'
            ? ['^packages/service-knowledge-write/dist/labels/graph-align']
            : []),
        ],
        dependencyTypesNot: ['type-only'],
      },
    })),

    // 5. web-panel must not import from server, backend-core, or host-*
    {
      name: 'web-panel-server-isolation',
      comment:
        'packages/web-panel must NOT import from packages/server, packages/backend-core, or packages/host-*',
      severity: 'error',
      from: { path: '^packages/web-panel/' },
      to: {
        path: '^packages/(server|backend-core|host-[^/]+)/',
      },
    },
  ],

  options: {
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'default'],
    },
  },
};
