/**
 * Resolve `${…}` holes that carry schema structure (`SELECT ${COLUMNS} FROM
 * ${table}`) so the guard can check those statements instead of declaring them
 * unanalysable.
 *
 * Only the shapes this codebase actually uses are resolved, and each resolution
 * is exact rather than guessed at:
 *
 *   - `const T = 'literal'` / `const T = \`literal\``  → the text;
 *   - `const T = ['a', 'b'].join(', ')`                → the joined text;
 *   - `const T = getTableName(exportedTable)`           → the table's real name,
 *     read from the drizzle metadata of `@trapmap/db` (the same module the
 *     service imports), so a renamed table cannot drift from the guard;
 *   - `${X.join(', ')}` with a local array-literal `X`.
 *
 * Anything computed at runtime (`clauses.join(' AND ')`, ternaries, template
 * composition) stays unresolved on purpose: guessing there would produce the
 * false positives this mainline exists to remove, and an unresolved hole keeps
 * the statement in the "declare it" bucket instead.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Split an array literal's source into its string items.
 *
 * Only whole quoted elements count: `["a = 'x'", 'b > 1']` has two items, not
 * four. Anything that is not a plain quoted string (a call, a spread, a
 * template with holes) makes the array unanalysable and returns null, because a
 * wrong guess here would splice garbage into the statement and manufacture the
 * false positives this guard exists to avoid.
 */
function arrayStringItems(arraySource: string): string[] | null {
  const items: string[] = [];
  let index = 0;
  while (index < arraySource.length) {
    const char = arraySource[index]!;
    if (/\s|,/.test(char)) {
      index += 1;
      continue;
    }
    const quote = char === '"' || char === "'" || char === '`' ? char : null;
    if (!quote) return null;
    let cursor = index + 1;
    let text = '';
    while (cursor < arraySource.length && arraySource[cursor] !== quote) {
      if (arraySource[cursor] === '\\') {
        text += arraySource[cursor + 1] ?? '';
        cursor += 2;
        continue;
      }
      text += arraySource[cursor];
      cursor += 1;
    }
    if (cursor >= arraySource.length) return null;
    items.push(text);
    index = cursor + 1;
  }
  return items.length > 0 ? items : null;
}

/** Identifier → SQL text, for string/array constants declared in one file. */
export function collectLocalConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();

  // const NAME = 'text';  |  const NAME = `text`;  (no interpolation)
  for (const match of source.matchAll(
    /(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*(?:'([^'\\]*)'|`([^`$\\]*)`)\s*;/g,
  )) {
    constants.set(match[1]!, match[2] ?? match[3] ?? '');
  }

  // const NAME = ['a', 'b'].join(', ');
  for (const match of source.matchAll(
    /(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*\[([^\]]*)\]\s*\.join\(\s*(?:'([^']*)'|`([^`]*)`|"([^"]*)")\s*\)/g,
  )) {
    const items = arrayStringItems(match[2] ?? '');
    if (items) constants.set(match[1]!, items.join(match[3] ?? match[4] ?? match[5] ?? ''));
  }

  // const NAME = getTableName(exportedTable);
  for (const match of source.matchAll(
    /(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*getTableName\(\s*([A-Za-z_]\w*)\s*\)/g,
  )) {
    constants.set(match[1]!, `getTableName(${match[2]})`);
  }

  return constants;
}

/**
 * Exported drizzle table name per export identifier, read from the schema
 * module the services themselves import. Read lazily and cached: the module is
 * pure data (no connections), exactly as `check:schema-parity` already does.
 */
let tableNamesCache: Map<string, string> | null = null;

async function loadExportedTableNames(root: string): Promise<Map<string, string>> {
  if (tableNamesCache) return tableNamesCache;
  const names = new Map<string, string>();
  try {
    const entry = pathToFileURL(join(root, 'packages', 'db', 'src', 'schema', 'index.ts')).href;
    const mod = (await import(entry)) as Record<string, unknown>;
    const nameSymbol = Symbol.for('drizzle:Name');
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value !== 'object' || value === null) continue;
      const table = (value as Record<symbol, unknown>)[nameSymbol];
      if (typeof table === 'string') names.set(exportName, table);
    }
  } catch {
    // Without the schema module the resolver simply resolves less.
  }
  tableNamesCache = names;
  return names;
}

export interface HoleResolver {
  (expression: string): string | null;
}

/** Exported constants per package `src` dir, cached across files. */
const packageConstantsCache = new Map<string, Map<string, string>>();

function packageSrcOf(file: string): string | null {
  // Works for repo-relative and absolute paths alike: the guard hands over
  // relative paths, the import walker absolute ones.
  const match = /(^|.*\/)(packages\/[^/]+\/src)(?:\/|$)/.exec(file);
  return match ? match[1]! + match[2]! : null;
}

export function collectTreeConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  // Exported string/template constants. Templates may themselves interpolate
  // other constants (`status = '${TASK_STATUS_PENDING}'`); those are expanded by
  // the caller, one level at a time, so a shared SQL fragment still resolves.
  for (const match of source.matchAll(
    /export\s+const\s+([A-Za-z_]\w*)\s*=\s*(?:'([^'\\]*)'|`([^`\\]*)`)\s*(?:as const)?\s*;/g,
  )) {
    constants.set(match[1]!, match[2] ?? match[3] ?? '');
  }
  for (const match of source.matchAll(
    /export\s+const\s+([A-Za-z_]\w*)\s*=\s*\[([^\]]*)\]\s*\.join\(\s*(?:'([^']*)'|`([^`]*)`|"([^"]*)")\s*\)/g,
  )) {
    const items = arrayStringItems(match[2] ?? '');
    if (items) constants.set(match[1]!, items.join(match[3] ?? match[4] ?? match[5] ?? ''));
  }
  return constants;
}

/** Exported constants of every file in the same package `src` tree. */
export function packageConstants(file: string): Map<string, string> {
  const src = packageSrcOf(file);
  if (!src) return new Map();
  const cached = packageConstantsCache.get(src);
  if (cached) return cached;

  const constants = new Map<string, string>();
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== 'node_modules' && entry !== 'dist') walk(full);
      } else if (entry.endsWith('.ts') && !entry.includes('.test.')) {
        for (const [name, text] of collectTreeConstants(readFileSync(full, 'utf8'))) {
          if (!constants.has(name)) constants.set(name, text);
        }
      }
    }
  };
  walk(src);
  packageConstantsCache.set(src, constants);
  return constants;
}

/**
 * Build a resolver for one file. `expression` is the raw text inside `${…}`.
 */
/**
 * Exported constants of workspace packages this file imports, so a shared
 * status/column constant defined in `backend-core` resolves here too.
 */
function importedPackageConstants(root: string, source: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const match of source.matchAll(/from\s+'@trapmap\/([\w-]+)'/g)) {
    const src = join(root, 'packages', match[1]!, 'src');
    try {
      if (!statSync(src).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const [name, text] of packageConstants(join(src, 'index.ts'))) {
      if (!constants.has(name)) constants.set(name, text);
    }
  }
  return constants;
}

export async function createHoleResolver(
  root: string,
  source: string,
  file?: string,
): Promise<HoleResolver> {
  const constants = collectLocalConstants(source);
  const sibling = file ? packageConstants(file) : new Map<string, string>();
  const imported = importedPackageConstants(root, source);
  const tableNames = await loadExportedTableNames(root);

  /** Expand a constant's text, resolving any holes it carries (depth-capped). */
  const expand = (text: string, depth: number): string =>
    depth > 3
      ? text
      : text.replace(/\$\{([^}]*)\}/g, (whole, inner: string) => {
          const resolved = resolveConstant(inner.trim(), depth + 1);
          return resolved ?? whole;
        });

  const resolveConstant = (name: string, depth = 0): string | null => {
    const value = constants.get(name) ?? sibling.get(name) ?? imported.get(name);
    if (value === undefined) return null;
    const tableReference = /^getTableName\((\w+)\)$/.exec(value);
    if (tableReference) return tableNames.get(tableReference[1]!) ?? null;
    return expand(value, depth);
  };

  return (expression: string): string | null => {
    const trimmed = expression.trim();

    // `NAME` or `NAME.join(', ')`
    const join = /^([A-Za-z_]\w*)\.join\(\s*(?:'([^']*)'|`([^`]*)`|"([^"]*)")\s*\)$/.exec(trimmed);
    if (join) {
      const name = join[1]!;
      // Only an array that is never mutated may be folded: a `.push`/`.splice`/
      // index assignment means the literal is a seed, and inlining just that
      // seed would quietly drop conditions from the statement (and invent a
      // statement that does not exist). Refusing keeps it in the declared set.
      if (
        new RegExp(`\\b${name}\\s*(?:\\.\\s*(?:push|unshift|splice|pop|shift)|\\[)`).test(source)
      ) {
        return null;
      }
      const arraySource =
        new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(source)?.[1] ??
        '';
      const items = arrayStringItems(arraySource);
      return items ? items.join(join[2] ?? join[3] ?? join[4] ?? '') : null;
    }

    if (/^[A-Za-z_]\w*$/.test(trimmed)) return resolveConstant(trimmed, 0);
    return null;
  };
}

/** Directories the guard scans inside a repo root (mirrors check-sql-columns). */
export function packageSrcRoots(root: string): string[] {
  const roots: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(join(root, 'packages'));
  } catch {
    return roots;
  }
  for (const entry of entries) {
    const src = join(root, 'packages', entry, 'src');
    try {
      if (statSync(src).isDirectory()) roots.push(src);
    } catch {
      // not every package has a src dir
    }
  }
  return roots;
}

export function repoRoot(): string {
  return resolve(import.meta.dirname, '..', '..');
}

export function readSource(file: string): string {
  return readFileSync(file, 'utf8');
}
