/**
 * Quote-aware SQL extraction from TypeScript sources.
 *
 * The guard's first pass used a regex over string literals. It could not see
 * past a nested template literal or an escaped quote, counted SQL examples in
 * comments, matched `'DELETE'` (an HTTP method) as a statement, and reported
 * line numbers from whichever literal it happened to slice. That imprecision is
 * what "make the analyzer strict" has to fix first: an analyzer is only as
 * trustworthy as the text it is handed.
 *
 * The scanner walks the source once, tracking comments and the three quote
 * kinds, and returns one entry per string/template literal that looks like SQL:
 *
 *   - `'…'` / `"…"` literals are taken verbatim (`${…}` inside them is text,
 *     not interpolation);
 *   - template literals have their `${…}` holes replaced in place — with `$1`
 *     when the hole follows a `$` (the repo's `LIMIT $${n}` parameter idiom),
 *     otherwise with an identifier placeholder — and are marked `dynamic`;
 *   - comments are skipped entirely.
 */

/** Placeholder that stands in for a `${…}` hole where an identifier fits. */
export const DYNAMIC_IDENTIFIER = '__dyn__';

/** Placeholder that stands in for a `${…}` hole after a `$` (a parameter). */
export const DYNAMIC_PARAMETER = '$1';

export interface SqlFragment {
  /** Statement text with `${…}` holes substituted in place. */
  sql: string;
  /** 1-based line of the literal's opening quote. */
  line: number;
  /** True when the literal interpolated anything. */
  dynamic: boolean;
  /** Raw text of each `${…}` hole, in source order. */
  holes: string[];
  /** Holes the caller's resolver could turn into SQL text. */
  resolved: number;
}

/**
 * Statement-shaped literal.
 *
 * Each keyword is paired with the clause that makes it a statement, so prose
 * ("Update skills"), a bare HTTP method (`'DELETE'`) and a status word cannot
 * be mistaken for SQL. A `SELECT` without `FROM` (the `SELECT 1` health probe)
 * is skipped on purpose: it references no schema, so nothing is lost.
 */
function looksLikeStatement(text: string): boolean {
  const head = text.replace(/^\s*\(*\s*/, '');
  return (
    /^SELECT\b[\s\S]*\bFROM\b/i.test(head) ||
    /^WITH\b[\s\S]*\bSELECT\b/i.test(head) ||
    /^INSERT\s+INTO\b/i.test(head) ||
    /^UPDATE\s+["A-Za-z_][\w."]*\s+SET\b/i.test(head) ||
    /^DELETE\s+FROM\b/i.test(head)
  );
}

/**
 * A literal that is SQL but not a whole statement — a `WHERE …` clause, a
 * column list, a `SET …` list. These are assembled into statements elsewhere,
 * which means the guard cannot see the statement they end up in.
 */
function looksLikeClause(text: string): boolean {
  if (looksLikeStatement(text)) return false;
  if (
    !/^\s*(?:WHERE|SET|VALUES|RETURNING|GROUP BY|ORDER BY|HAVING|AND|OR|JOIN|ON|FROM)\b/i.test(text)
  ) {
    return false;
  }
  // Guard against ordinary words that happen to be SQL keywords: a clause
  // carries at least three tokens and a comparison, call or placeholder.
  const tokens = text.trim().split(/\s+/);
  return tokens.length >= 3 && /[=(]|\$\d/.test(text);
}

export function isClauseFragment(text: string): boolean {
  return looksLikeClause(text);
}

export function extractSqlFragments(
  source: string,
  /**
   * Optional resolver for `${…}` holes. Returning text splices it into the
   * statement so the hole's structure becomes checkable; returning null keeps
   * the identifier placeholder.
   */
  resolveHole?: (expression: string) => string | null,
): SqlFragment[] {
  const fragments: SqlFragment[] = [];
  let index = 0;
  let line = 1;

  const advance = (count: number): void => {
    for (let i = 0; i < count && index < source.length; i += 1) {
      if (source[index] === '\n') line += 1;
      index += 1;
    }
  };

  /** Skip a `${…}` hole, tolerating nested braces, strings and templates. */
  const readHole = (): string => {
    // `index` sits on `${`; `findHoleEnd()` points just past the closing `}`.
    const end = findHoleEnd();
    const inner = source.slice(index + 2, end - 1);
    advance(end - index);
    return inner.trim();
  };

  /** Index just past the closing brace of the hole starting at `index`. */
  const findHoleEnd = (): number => {
    let depth = 1;
    let cursor = index + 2;
    while (cursor < source.length && depth > 0) {
      const char = source[cursor];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === "'" || char === '"' || char === '`') {
        cursor += 1;
        while (cursor < source.length && source[cursor] !== char) {
          if (source[cursor] === '\\') cursor += 1;
          cursor += 1;
        }
      }
      cursor += 1;
    }
    return cursor;
  };

  while (index < source.length) {
    const char = source[index];

    // Comments: never SQL.
    if (char === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') advance(1);
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      advance(2);
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        advance(1);
      }
      advance(2);
      continue;
    }

    if (char !== "'" && char !== '"' && char !== '`') {
      advance(1);
      continue;
    }

    const quote = char;
    const startLine = line;
    let text = '';
    let dynamic = false;
    const holes: string[] = [];
    let cursor = index + 1;
    advance(1);

    while (cursor < source.length) {
      const current = source[cursor];
      if (current === '\\') {
        text += source.slice(cursor, cursor + 2);
        advance(2);
        cursor += 2;
        continue;
      }
      if (current === quote) {
        advance(1);
        cursor += 1;
        break;
      }
      // Only template literals interpolate.
      if (quote === '`' && current === '$' && source[cursor + 1] === '{') {
        dynamic = true;
        const expression = readHole();
        // `$${n}` is a parameter number, not structure: it is already replaced
        // by a valid placeholder and must not count as an unresolved hole.
        if (!text.endsWith('$')) {
          holes.push(expression);
          text += resolveHole?.(expression) ?? DYNAMIC_IDENTIFIER;
        } else {
          text = `${text.slice(0, -1)}${DYNAMIC_PARAMETER}`;
        }
        cursor = index;
        continue;
      }
      text += current;
      advance(1);
      cursor += 1;
    }

    const isSql = looksLikeStatement(text) || looksLikeClause(text);
    const resolved = holes.filter((hole) => resolveHole?.(hole) !== null).length;
    if (isSql) fragments.push({ sql: text, line: startLine, dynamic, holes, resolved });
  }

  return fragments;
}
