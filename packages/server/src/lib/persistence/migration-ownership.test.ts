import { describe, expect, it } from 'vitest';

import {
  MigrationOwnershipError,
  assertMigrationManifestComplete,
  assertMigrationRunnerAuthorized,
  migrationOwnershipManifest,
} from './migration-ownership.js';

describe('migration ownership manifest', () => {
  it('requires owner metadata for every discovered migration', () => {
    expect(() =>
      assertMigrationManifestComplete(['0000_bent_nightmare.sql', '9999_missing_owner.sql']),
    ).toThrow(/9999_missing_owner\.sql/);
  });

  it('rejects manifest entries that do not match a discovered migration', () => {
    expect(() => assertMigrationManifestComplete(['0000_bent_nightmare.sql'])).toThrow(
      /manifest references migrations missing from the directory/i,
    );
  });

  it('allows the compatibility seam to execute historical cross-domain migrations', () => {
    expect(() =>
      assertMigrationRunnerAuthorized('server-compatibility-seam', migrationOwnershipManifest),
    ).not.toThrow();
  });

  it('rejects a service runner that requests migrations outside its declared owner', () => {
    const knowledgeMigration = migrationOwnershipManifest.find(
      ({ migration }) => migration === '0002_round3_knowledge_structural.sql',
    );
    expect(knowledgeMigration).toBeDefined();
    expect(() =>
      assertMigrationRunnerAuthorized('governance-review', [knowledgeMigration!]),
    ).toThrow(MigrationOwnershipError);
  });
});
