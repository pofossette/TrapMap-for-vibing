import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

export async function assertOwnerMigrationSet(
  owner: string,
  migrationsFolder: string,
  expectedTags: readonly string[],
): Promise<void> {
  const files = (await readdir(migrationsFolder))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => file.slice(0, -4));
  const journal = JSON.parse(
    await readFile(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string }> };
  const names = new Set(files);
  const tags = new Set(journal.entries.map(({ tag }) => tag));
  const allowed = new Set(expectedTags);
  const missing = expectedTags.filter((tag) => !names.has(tag) || !tags.has(tag));
  const unexpected = [...new Set([...files, ...tags])].filter((tag) => !allowed.has(tag));
  const stale = [...tags].filter((tag) => !names.has(tag));

  if (missing.length || unexpected.length || stale.length) {
    throw new Error(
      `${owner} migration journal mismatch: missing=${missing.join(',')} unexpected=${unexpected.join(',')} stale=${stale.join(',')}`,
    );
  }
}
