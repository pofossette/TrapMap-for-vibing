import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(
  resolve(fileURLToPath(new URL('../../../apps/distributed', import.meta.url)), 'Dockerfile'),
  'utf8',
);

const packageRoot = (packageName: string): string =>
  packageName.startsWith('apps/') ? packageName : `packages/${packageName}`;

const expectPackageCopiedInDepsStage = (packageName: string) => {
  const root = packageRoot(packageName);
  expect(dockerfile).toContain(`COPY ${root}/package.json ./${root}/`);
  expect(dockerfile).toContain(`COPY ${root}/tsconfig.json ./${root}/`);
  expect(dockerfile).toContain(`COPY ${root}/src ./${root}/src`);
};

const expectPackageBuilt = (packageName: string) => {
  expect(dockerfile).toContain(`${packageRoot(packageName)}/tsconfig.json`);
};

const expectPackageCopiedInProductionStage = (packageName: string) => {
  const root = packageRoot(packageName);
  expect(dockerfile).toContain(`COPY --from=build /app/${root}/dist ./${root}/dist`);
  expect(dockerfile).toContain(`COPY ${root}/package.json ./${root}/`);
  expect(dockerfile).toContain(`COPY ${root}/tsconfig.json ./${root}/`);
};

const expectPackageNodeModulesCopiedInProductionStage = (packageName: string) => {
  expect(dockerfile).toContain(
    `COPY --from=deps /app/${packageRoot(packageName)}/node_modules ./${packageRoot(packageName)}/node_modules`,
  );
};

describe('host-distributed Dockerfile', () => {
  it('includes the core project reference chain in deps, build, and production stages', () => {
    for (const packageName of [
      'contracts',
      'backend-core',
      'host-distributed',
      'apps/distributed',
    ]) {
      expectPackageCopiedInDepsStage(packageName);
      expectPackageBuilt(packageName);
      expectPackageCopiedInProductionStage(packageName);
    }
  });

  it('preserves workspace package node_modules symlink layout in the production image', () => {
    for (const packageName of [
      'contracts',
      'backend-core',
      'service-identity-access',
      'service-knowledge-read',
      'service-knowledge-write',
      'service-candidate-ingestion',
      'service-governance-review',
      'service-job-runtime',
      'service-cron',
      'host-distributed',
    ]) {
      expectPackageNodeModulesCopiedInProductionStage(packageName);
    }
  });
});
