/** @deprecated Per-owner 0000 versioned migrations removed. Use @trapmap/db runMigrations. */
export async function assertOwnerMigrationSet(
  _owner: string,
  _migrationsFolder: string,
  _expectedTags: readonly string[],
): Promise<void> {
  return;
}
