/**
 * Strict SQL analysis on a real PostgreSQL grammar (T3 of the
 * `sql-column-drift-guard` mainline).
 *
 * Replaces the regex pass that shipped with `check:sql-columns`. The regex
 * resolved `FROM t alias` and skipped bare columns in multi-table statements;
 * it could not see subqueries, CTEs, `LATERAL`, `INSERT` column lists,
 * `UPDATE ... SET` targets or `ON CONFLICT (...)` targets, and — the gap that
 * mattered most — it never checked that a referenced TABLE exists, so
 * `candidate_outcomes` (a table with no DDL for months, because the Phase-2
 * migration was never written) passed the guard while every statement using it
 * failed at runtime.
 *
 * Rules enforced per statement:
 *
 *   1. every table reference must exist in the applied schema, or be a CTE or
 *      subquery defined in the same statement (`unknown-table`);
 *   2. every column reference must resolve in its scope: `alias.column` against
 *      that alias, a bare `column` against the statement's resolvable scope
 *      (`column-not-in-scope`). `ORDER BY` / `GROUP BY` / `HAVING` may also
 *      name a select-list alias, which PG allows;
 *   3. `INSERT INTO t (a, b)`, `UPDATE t SET a = ...` and `ON CONFLICT (a)`
 *      targets must exist on `t`;
 *   4. a statement the parser rejects is reported (`unparseable`) rather than
 *      skipped. Silence is precisely what this mainline removes.
 *
 * Deliberate non-goals, because static analysis cannot decide them:
 * `${...}` interpolation is replaced by a placeholder identifier before
 * parsing, so a dynamically-built column list is only checked where it is
 * static; `SELECT *` / `RETURNING *` and unresolvable subquery projections are
 * treated as opaque rather than guessed at.
 */

import type {
  Expr,
  From,
  FromStatement,
  FromTable,
  InsertStatement,
  Name,
  OnConflictAction,
  OrderByStatement,
  QName,
  SelectFromStatement,
  SelectStatement,
  Statement,
  UpdateStatement,
} from 'pgsql-ast-parser';
import { parse } from 'pgsql-ast-parser';

import { parseAppliedSchema } from './applied-schema.js';

export type SqlAnalysisKind =
  | 'unknown-table'
  | 'unknown-alias'
  | 'column-not-in-scope'
  | 'unparseable'
  /** Everything structural in the statement is `${}`-interpolated. */
  | 'dynamic-statement';

export interface SqlAnalysisViolation {
  kind: SqlAnalysisKind;
  /** Table (or alias) the reference resolves to; empty when there is none. */
  table: string;
  column: string;
}

/** Placeholder that stands in for `${...}` interpolation. */
export const DYNAMIC_PLACEHOLDER = '__dyn__';

/** `EXCLUDED` pseudo-table available in `ON CONFLICT DO UPDATE`. */
const EXCLUDED = 'excluded';

interface ScopeEntry {
  /** Alias or table name as written in the statement. */
  ref: string;
  /** Real table name when resolvable. */
  table: string;
  /** Columns of that table here; null means "opaque, do not judge". */
  columns: Set<string> | null;
}

interface Scope {
  entries: ScopeEntry[];
  /** Names from the select list that ORDER BY / GROUP BY / HAVING may use. */
  outputAliases: Set<string>;
}

const EMPTY_SCOPE: Scope = { entries: [], outputAliases: new Set() };

function lower(value: string): string {
  return value.toLowerCase();
}

/**
 * Make a statement parseable without changing what it references.
 *
 * Two rewrites, both analysis-only:
 *
 *   - `${...}` holes become placeholders. `$${expr}` is the repo's ubiquitous
 *     "parameter number" idiom (`LIMIT $${n}`); collapsing it to `$1` avoids
 *     producing the invalid token `$__dyn__`, and every other hole becomes an
 *     identifier.
 *   - pgvector's distance operators (`<=>`, `<->`, `<#>`) are not in
 *     `pgsql-ast-parser`'s grammar. They are replaced by `-`, which has the same
 *     arity, so the surrounding column references are still resolved.
 */
export function normalizeForAnalysis(sql: string): string {
  return sql
    .replace(/\$\$\{[^}]*\}/g, '$1')
    .replace(/\$\{[^}]*\}/g, DYNAMIC_PLACEHOLDER)
    .replace(/<=>|<->|<#>/g, '-');
}

/** Table shapes from the applied DDL (CREATE TABLE plus later ALTERs). */
export function parseAppliedSchemaTables(schemaSql: string): Map<string, Set<string>> {
  return parseAppliedSchema(schemaSql).tables as Map<string, Set<string>>;
}

/** Column names a select statement exposes, or null when it cannot be known. */
function projectionOf(statement: SelectStatement): Set<string> | null {
  if (statement.type === 'values') return null;
  if (statement.type === 'with' || statement.type === 'with recursive') {
    return projectionOf(statement.in);
  }
  if (statement.type === 'union' || statement.type === 'union all') {
    return projectionOf(statement.left) ?? projectionOf(statement.right);
  }
  const columns = new Set<string>();
  for (const item of statement.columns ?? []) {
    if (item.alias) columns.add(lower(item.alias.name));
    else if (item.expr.type === 'ref' && item.expr.name !== '*') columns.add(lower(item.expr.name));
    else return null;
  }
  return columns.size > 0 ? columns : null;
}

/**
 * Output aliases usable by ORDER BY / GROUP BY / HAVING.
 *
 * Only explicit `AS` aliases qualify. A bare select-list ref (`SELECT name`)
 * must still be validated against the scope, so it is deliberately NOT added
 * here — ORDER BY may name it, but the scope already resolves it.
 */
function outputAliasesOf(statement: SelectFromStatement): Set<string> {
  const aliases = new Set<string>();
  for (const item of statement.columns ?? []) {
    if (item.alias) aliases.add(lower(item.alias.name));
  }
  return aliases;
}

function entriesForFrom(
  from: readonly From[] | null | undefined,
  tables: Map<string, Set<string>>,
  outer: Scope,
  violations: SqlAnalysisViolation[],
  nested: (statement: SelectStatement, scope: Scope) => void,
): ScopeEntry[] {
  const entries: ScopeEntry[] = [];

  for (const item of from ?? []) {
    switch (item.type) {
      case 'table': {
        const table = lower((item as FromTable).name.name);
        const alias = (item as FromTable).name.alias;
        const ref = alias ? lower(alias) : table;
        const shadowed = outer.entries.find((entry) => entry.ref === table);
        if (shadowed && !(item as FromTable).name.schema) {
          entries.push({ ref, table: shadowed.table, columns: shadowed.columns });
          break;
        }
        // A partially dynamic name (`audit_events${where}`) is best-effort
        // resolved to the table named by its static prefix, so the statement's
        // column references stay checkable; a fully dynamic one is not judged.
        const staticName = table.replace(DYNAMIC_PLACEHOLDER, '');
        const columns = tables.get(table) ?? tables.get(staticName) ?? null;
        const resolved = columns ? staticName : table;
        const dynamicName = table.includes(DYNAMIC_PLACEHOLDER);
        if (!columns && !dynamicName) {
          violations.push({ kind: 'unknown-table', table, column: '' });
        }
        entries.push({ ref, table: resolved, columns });
        break;
      }
      case 'statement': {
        const statement = item as FromStatement;
        const ref = lower(statement.alias);
        const aliased = statement.columnNames;
        const projection = projectionOf(statement.statement);
        const columns = aliased ? new Set(aliased.map((column) => lower(column.name))) : projection;
        entries.push({ ref, table: '', columns });
        // A subquery may be correlated: walk it with everything visible here.
        nested(statement.statement, {
          entries: [...entries, ...outer.entries],
          outputAliases: outer.outputAliases,
        });
        break;
      }
      default:
        // `FROM generate_series(...)` / `unnest(...)`: a function, not a table.
        entries.push({ ref: item.alias ? lower(item.alias.name) : '', table: '', columns: null });
        break;
    }
  }
  return entries;
}

/** Column references are only judged where a table's shape is known. */
function checkRef(
  ref: { name: string; table?: QName },
  scope: Scope,
  out: SqlAnalysisViolation[],
): void {
  const column = lower(ref.name);
  if (column === DYNAMIC_PLACEHOLDER || ref.name === '*') return;

  if (ref.table) {
    const qualifier = lower(ref.table.name);
    const entry = scope.entries.find((candidate) => candidate.ref === qualifier);
    if (!entry) {
      out.push({ kind: 'unknown-alias', table: qualifier, column });
      return;
    }
    if (entry.columns === null || entry.table === '') return;
    if (!entry.columns.has(column)) {
      out.push({ kind: 'column-not-in-scope', table: entry.table, column });
    }
    return;
  }

  if (scope.outputAliases.has(column)) return;
  const resolvable = scope.entries.filter((entry) => entry.columns !== null && entry.table !== '');
  if (resolvable.length === 0) return;
  if (resolvable.some((entry) => entry.columns?.has(column))) return;
  out.push({ kind: 'column-not-in-scope', table: resolvable[0]!.table, column });
}

const NON_REFERENCE_KEYS = new Set(['alias', 'type', 'name', 'schema', 'order', 'nulls']);

type NestedWalker = (statement: SelectStatement, scope: Scope) => void;

function walkExpr(
  node: unknown,
  scope: Scope,
  out: SqlAnalysisViolation[],
  seen: Set<unknown>,
  nested: NestedWalker,
): void {
  if (node === null || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) walkExpr(item, scope, out, seen, nested);
    return;
  }

  const candidate = node as { type?: unknown; name?: unknown; table?: QName };
  if (candidate.type === 'ref' && typeof candidate.name === 'string') {
    checkRef(candidate as { name: string; table?: QName }, scope, out);
    return;
  }
  // A subquery gets its own FROM scope; the enclosing scope stays visible for
  // correlation (`WHERE artifact_id = sa.id` inside a LATERAL subquery).
  if (
    (candidate.type === 'select' ||
      candidate.type === 'union' ||
      candidate.type === 'union all' ||
      candidate.type === 'values' ||
      candidate.type === 'with' ||
      candidate.type === 'with recursive') &&
    typeof (candidate as { columns?: unknown }).columns !== 'undefined'
  ) {
    nested(candidate as SelectStatement, scope);
    return;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (NON_REFERENCE_KEYS.has(key)) continue;
    walkExpr(value, scope, out, seen, nested);
  }
}

/** Columns named in an `ON CONFLICT (...)` target list. */
function conflictTargetColumns(action: OnConflictAction): Expr[] {
  const on = action.on;
  if (on?.type !== 'on expr') return [];
  return on.exprs;
}

function checkNamedColumns(
  names: readonly Name[] | null | undefined,
  entry: ScopeEntry | undefined,
  out: SqlAnalysisViolation[],
): void {
  if (!entry || entry.columns === null) return;
  for (const name of names ?? []) {
    const column = lower(name.name);
    // A dynamically built column list cannot be judged statically.
    if (column === DYNAMIC_PLACEHOLDER) continue;
    if (!entry.columns.has(column)) {
      out.push({ kind: 'column-not-in-scope', table: entry.table, column });
    }
  }
}

/**
 * `pgsql-ast-parser` does not accept the *partial index inference* form of
 * `ON CONFLICT` (`ON CONFLICT (cols) WHERE pred DO ...`). Rather than let one
 * unsupported clause hide a whole statement, the predicate is lifted out: the
 * statement is re-parsed without it, and the predicate is checked separately
 * against the INSERT target. Returns null when there is nothing to strip.
 */
function liftConflictPredicate(
  sql: string,
): { sql: string; predicate: string; table: string } | null {
  const conflict = /\bON\s+CONFLICT\s*\(([^)]*)\)\s*WHERE\s/i.exec(sql);
  if (!conflict) return null;
  const predicateStart = conflict.index + conflict[0].length;
  const rest = sql.slice(predicateStart);
  const doIndex = /\sDO\s+(?:NOTHING|UPDATE)\b/i.exec(rest);
  if (!doIndex) return null;
  const predicate = rest.slice(0, doIndex.index);
  const table = /\bINSERT\s+INTO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(sql)?.[1];
  if (!table) return null;
  // Keep `ON CONFLICT (cols)`, drop only the inference `WHERE` it carried.
  const whereOffset = conflict.index + conflict[0].toLowerCase().lastIndexOf('where');
  return {
    sql: sql.slice(0, whereOffset) + rest.slice(doIndex.index),
    predicate,
    table,
  };
}

export function analyzeSqlStatement(
  sql: string,
  tables: Map<string, Set<string>>,
): SqlAnalysisViolation[] {
  const violations: SqlAnalysisViolation[] = [];

  let statements: Statement[] | null = null;
  let lifted: { predicate: string; table: string } | null = null;

  try {
    statements = parse(sql);
  } catch {
    // Retry once with the one clause the grammar lacks, so an unsupported
    // construct cannot hide the rest of the statement.
    const stripped = liftConflictPredicate(sql);
    if (stripped) {
      try {
        statements = parse(stripped.sql);
        lifted = { predicate: stripped.predicate, table: stripped.table };
      } catch {
        statements = null;
      }
    }
  }

  if (statements === null) {
    // Reported either way — the difference is whether the code still has
    // anything static to check. The two kinds stay apart in the report:
    // `unparseable` means the analyzer failed on static SQL (a guard bug to
    // fix); `dynamic-statement` means every structural part is interpolated
    // (a code-shape decision the reviewer can see).
    violations.push({
      kind: sql.includes(DYNAMIC_PLACEHOLDER) ? 'dynamic-statement' : 'unparseable',
      table: '',
      column: '',
    });
    return violations;
  }

  const walkStatement = (statement: Statement, outer: Scope): void => {
    const nested: NestedWalker = (inner, scope): void => walkStatement(inner, scope);
    const fromEntries = (from: readonly From[] | null | undefined, scope: Scope): ScopeEntry[] =>
      entriesForFrom(from, tables, scope, violations, nested);

    switch (statement.type) {
      case 'select': {
        const select = statement as SelectFromStatement;
        // Own FROM first, then the enclosing scope: a correlated subquery reads
        // `ke.id` from the query it is nested in, and the inner table shadows
        // the outer one on a name clash (resolution is first-match).
        const scope: Scope = {
          entries: [...fromEntries(select.from, outer), ...outer.entries],
          outputAliases: outputAliasesOf(select),
        };
        const seen = new Set<unknown>();
        walkExpr(select.columns ?? [], scope, violations, seen, nested);
        walkExpr(select.where ?? null, scope, violations, seen, nested);
        walkExpr(select.groupBy ?? null, scope, violations, seen, nested);
        walkExpr(select.having ?? null, scope, violations, seen, nested);
        walkExpr(
          (select.orderBy ?? null) as OrderByStatement[] | null,
          scope,
          violations,
          seen,
          nested,
        );
        for (const item of select.from ?? []) {
          if (item.join) {
            walkExpr(item.join.on ?? null, scope, violations, seen, nested);
            checkNamedColumns(item.join.using, scope.entries.at(-1), violations);
          }
        }
        return;
      }
      case 'values': {
        const seen = new Set<unknown>();
        walkExpr((statement as { values: Expr[][] }).values, EMPTY_SCOPE, violations, seen, nested);
        return;
      }
      case 'union':
      case 'union all': {
        const union = statement as { left: SelectStatement; right: SelectStatement };
        walkStatement(union.left, outer);
        walkStatement(union.right, outer);
        return;
      }
      case 'with':
      case 'with recursive': {
        const withStatement = statement as {
          bind: Array<{ alias: Name; statement: SelectStatement }>;
          in: Statement;
        };
        const scope: Scope = { entries: [...outer.entries], outputAliases: outer.outputAliases };
        for (const cte of withStatement.bind) {
          scope.entries.push({
            ref: lower(cte.alias.name),
            table: '',
            columns: projectionOf(cte.statement),
          });
        }
        for (const cte of withStatement.bind) walkStatement(cte.statement, scope);
        walkStatement(withStatement.in, scope);
        return;
      }
      case 'insert': {
        const insert = statement as InsertStatement;
        const target = fromEntries([{ type: 'table', name: insert.into } as FromTable], outer)[0];
        const scope: Scope = {
          entries: [...(target ? [target] : []), ...outer.entries],
          outputAliases: new Set(),
        };
        checkNamedColumns(insert.columns, target, violations);

        const seen = new Set<unknown>();
        walkStatement(insert.insert, scope);
        if (insert.onConflict) {
          const conflictScope: Scope = {
            entries: [
              ...(target ? [target] : []),
              { ref: EXCLUDED, table: target?.table ?? '', columns: target?.columns ?? null },
            ],
            outputAliases: new Set(),
          };
          walkExpr(conflictTargetColumns(insert.onConflict), scope, violations, seen, nested);
          const action = insert.onConflict.do;
          if (typeof action === 'object') {
            for (const set of action.sets) {
              checkNamedColumns([set.column], target, violations);
              walkExpr(set.value, conflictScope, violations, seen, nested);
            }
          }
          walkExpr(insert.onConflict.where ?? null, conflictScope, violations, seen, nested);
        }
        walkExpr(insert.returning ?? null, scope, violations, seen, nested);
        return;
      }
      case 'update': {
        const update = statement as UpdateStatement;
        // `update.table` is a bare QName, not a FROM item.
        const target = fromEntries([{ type: 'table', name: update.table } as FromTable], outer)[0];
        const scope: Scope = {
          entries: [...(target ? [target] : []), ...outer.entries],
          outputAliases: new Set(),
        };
        if (update.from) scope.entries.push(...fromEntries(update.from as From[], scope));
        const seen = new Set<unknown>();
        for (const set of update.sets ?? []) {
          checkNamedColumns([set.column], target, violations);
          walkExpr(set.value ?? null, scope, violations, seen, nested);
        }
        walkExpr(update.where ?? null, scope, violations, seen, nested);
        walkExpr(update.returning ?? null, scope, violations, seen, nested);
        return;
      }
      case 'delete': {
        const del = statement as { from: From; where?: Expr; returning?: unknown };
        const scope: Scope = {
          entries: [...fromEntries([del.from], outer), ...outer.entries],
          outputAliases: new Set(),
        };
        const seen = new Set<unknown>();
        walkExpr(del.where ?? null, scope, violations, seen, nested);
        walkExpr(del.returning ?? null, scope, violations, seen, nested);
        return;
      }
      default:
        // DDL and session statements do not appear in service SQL fragments.
        return;
    }
  };

  for (const statement of statements) walkStatement(statement, EMPTY_SCOPE);

  if (lifted) {
    // `SELECT 1 FROM <target> WHERE <predicate>` reuses the same scope rules, so
    // the lifted predicate's references are checked like any other.
    try {
      for (const statement of parse(`SELECT 1 FROM ${lifted.table} WHERE ${lifted.predicate}`)) {
        walkStatement(statement, EMPTY_SCOPE);
      }
    } catch {
      violations.push({ kind: 'unparseable', table: lifted.table, column: '' });
    }
  }
  return violations;
}
