import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(
  resolve(fileURLToPath(new URL('..', import.meta.url)), 'Dockerfile'),
  'utf8',
);

const expectPackageCopiedInDepsStage = (packageName: string) => {
  expect(dockerfile).toContain(
    `COPY packages/${packageName}/package.json ./packages/${packageName}/`,
  );
  expect(dockerfile).toContain(
    `COPY packages/${packageName}/tsconfig.json ./packages/${packageName}/`,
  );
  expect(dockerfile).toContain(`COPY packages/${packageName}/src ./packages/${packageName}/src`);
};

const expectPackageBuilt = (packageName: string) => {
  expect(dockerfile).toContain(`packages/${packageName}/tsconfig.json`);
};

const expectPackageCopiedInProductionStage = (packageName: string) => {
  expect(dockerfile).toContain(
    `COPY --from=build /app/packages/${packageName}/dist ./packages/${packageName}/dist`,
  );
  expect(dockerfile).toContain(
    `COPY packages/${packageName}/package.json ./packages/${packageName}/`,
  );
  expect(dockerfile).toContain(
    `COPY packages/${packageName}/tsconfig.json ./packages/${packageName}/`,
  );
};

const expectPackageNodeModulesCopiedInProductionStage = (packageName: string) => {
  expect(dockerfile).toContain(
    `COPY --from=deps /app/packages/${packageName}/node_modules ./packages/${packageName}/node_modules`,
  );
};

describe('host-distributed Dockerfile', () => {
  it('includes the server compatibility project reference chain in deps, build, and production stages', () => {
    for (const packageName of ['server']) {
      expectPackageCopiedInDepsStage(packageName);
      expectPackageBuilt(packageName);
      expectPackageCopiedInProductionStage(packageName);
    }
  });

  it('preserves workspace package node_modules symlink layout in the production image', () => {
    for (const packageName of [
      'contracts',
      'server',
      'backend-core',
      'client-core',
      'service-identity-access',
      'service-knowledge-read',
      'service-knowledge-write',
      'service-candidate-ingestion',
      'service-governance-review',
      'service-job-runtime',
      'host-distributed',
    ]) {
      expectPackageNodeModulesCopiedInProductionStage(packageName);
    }
  });
});
