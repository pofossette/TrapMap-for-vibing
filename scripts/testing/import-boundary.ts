import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function expectFilesFreeOfImports(
  root: string,
  files: string[],
  forbiddenImports: string[],
  assertAbsent: (source: string, forbiddenImport: string) => void,
): Promise<void> {
  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf-8');
    for (const forbiddenImport of forbiddenImports) {
      assertAbsent(source, forbiddenImport);
    }
  }
}
