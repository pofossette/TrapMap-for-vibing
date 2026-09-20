import { afterEach, describe, expect, it } from 'vitest';

import { checkSqlColumns, parseSchemaTables } from '../check-sql-columns';
import { analyzeSqlStatement, normalizeForAnalysis } from '../lib/sql-ast-analysis';
import { extractSqlFragments, isClauseFragment } from '../lib/sql-extraction';
import { cleanupTempRepos, makeTempRepo, write } from './helpers/temp-repo';

afterEach(() => {
  cleanupTempRepos();
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS "widgets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "widget_events" (
	"id" text PRIMARY KEY NOT NULL,
	"widget_id" text NOT NULL,
	"kind" text NOT NULL
);
`;

const tables = parseSchemaTables(SCHEMA);

function analyze(sql: string): string[] {
  return analyzeSqlStatement(normalizeForAnalysis(sql), tables).map(
    (violation) => `${violation.kind}:${violation.table}.${violation.column}`,
  );
}

describe('sql AST analysis — rejections', () => {
  it('flags a table that has no DDL', () => {
    expect(analyze('SELECT id FROM gadgetry')).toEqual(['unknown-table:gadgetry.']);
  });

  it('flags an unknown column on a known table', () => {
    expect(analyze('SELECT nick_name FROM widgets')).toEqual([
      'column-not-in-scope:widgets.nick_name',
    ]);
  });

  it('flags an alias that the statement never introduced', () => {
    expect(analyze('SELECT w.id FROM widgets x')).toEqual(['unknown-alias:w.id']);
  });

  it('flags a bad column behind a good alias', () => {
    expect(analyze('SELECT w.nick_name FROM widgets w')).toEqual([
      'column-not-in-scope:widgets.nick_name',
    ]);
  });

  it('flags a column that resolves in no table of a multi-table statement', () => {
    // The regex era skipped bare columns here rather than guess.
    expect(
      analyze('SELECT nope FROM widgets w JOIN widget_events e ON e.widget_id = w.id'),
    ).toEqual(['column-not-in-scope:widgets.nope']);
  });

  it('flags INSERT column lists against the target table', () => {
    expect(analyze('INSERT INTO widgets (id, nick_name) VALUES ($1, $2)')).toEqual([
      'column-not-in-scope:widgets.nick_name',
    ]);
  });

  it('flags UPDATE SET targets against the target table', () => {
    expect(analyze('UPDATE widgets SET nick_name = $2 WHERE id = $1')).toEqual([
      'column-not-in-scope:widgets.nick_name',
    ]);
  });

  it('flags ON CONFLICT targets against the target table', () => {
    expect(
      analyze('INSERT INTO widgets (id) VALUES ($1) ON CONFLICT (nick_name) DO NOTHING'),
    ).toEqual(['column-not-in-scope:widgets.nick_name']);
  });

  it('flags an unparseable static statement instead of skipping it', () => {
    expect(analyze('SELECT FROM WHERE gibberish')).toEqual(['unparseable:.']);
  });
});

describe('sql AST analysis — acceptances', () => {
  it('accepts SELECT *, EXCLUDED and output aliases in ORDER BY', () => {
    expect(analyze('SELECT w.* FROM widgets w ORDER BY w.created_at DESC')).toEqual([]);
    expect(
      analyze(
        'INSERT INTO widgets (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
      ),
    ).toEqual([]);
    expect(analyze('SELECT name AS label FROM widgets ORDER BY label')).toEqual([]);
  });

  it('accepts correlated references from a LATERAL subquery', () => {
    expect(
      analyze(
        `SELECT w.id, COALESCE(latest.id, '') AS last_event
           FROM widgets w
           LEFT JOIN LATERAL (
             SELECT id FROM widget_events WHERE widget_id = w.id ORDER BY id DESC LIMIT 1
           ) latest ON true
          WHERE w.id = $1`,
      ),
    ).toEqual([]);
  });

  it('accepts CTEs and their projected columns', () => {
    expect(analyze('WITH recent AS (SELECT id FROM widgets) SELECT r.id FROM recent r')).toEqual(
      [],
    );
  });

  it('accepts the parameter-number idiom and pgvector operators', () => {
    expect(normalizeForAnalysis('SELECT id FROM widgets LIMIT $${limit}')).toContain('$1');
    expect(analyze('SELECT id FROM widgets ORDER BY payload <=> $1::vector LIMIT 5')).toEqual([]);
  });

  it('checks the predicate of a partial-index ON CONFLICT clause', () => {
    // `pgsql-ast-parser` lacks this clause; the analyzer lifts it out instead of
    // dropping the whole statement.
    expect(
      analyze(
        `INSERT INTO widgets (id, name) VALUES ($1, $2)
           ON CONFLICT (id) WHERE name IS NOT NULL DO UPDATE SET name = EXCLUDED.name`,
      ),
    ).toEqual([]);
    expect(
      analyze(
        `INSERT INTO widgets (id, name) VALUES ($1, $2)
           ON CONFLICT (id) WHERE nick_name IS NOT NULL DO UPDATE SET name = EXCLUDED.name`,
      ),
    ).toEqual(['column-not-in-scope:widgets.nick_name']);
  });

  it('classifies a fully interpolated statement as dynamic rather than broken', () => {
    expect(analyze('UPDATE ${table} SET ${cols} WHERE id = $1')).toEqual(['dynamic-statement:.']);
  });
});

describe('sql extraction', () => {
  it('substitutes interpolation, keeping the parameter idiom intact', () => {
    const [fragment] = extractSqlFragments(
      'const q = `SELECT id FROM widgets WHERE name = $${index} AND ${column} IS NULL`;',
    );
    expect(fragment?.dynamic).toBe(true);
    expect(fragment?.sql).toContain('$1');
    expect(fragment?.sql).toContain('__dyn__ IS NULL');
  });

  it('ignores comments, prose and non-SQL literals', () => {
    const source = [
      '// SELECT id FROM widgets -- a comment, not SQL',
      '/** UPDATE widgets SET name = $1 */',
      "const method = 'DELETE';",
      "const status = 'pending';",
      'program.command("update").description("Update skills");',
      "const probe = 'SELECT 1';",
    ].join('\n');
    expect(extractSqlFragments(source)).toEqual([]);
  });

  it('reports the opening line of the literal', () => {
    const source = ['const a = 1;', 'const b = 2;', 'const q = `SELECT id FROM widgets`;'].join(
      '\n',
    );
    expect(extractSqlFragments(source)[0]?.line).toBe(3);
  });

  it('recognises clause fragments that are not whole statements', () => {
    expect(isClauseFragment("WHERE status = 'pending' AND kind = ANY($1::text[])")).toBe(true);
    expect(isClauseFragment('set')).toBe(false);
    expect(isClauseFragment('SELECT id FROM widgets')).toBe(false);
  });
});

describe('check:sql-columns end to end', () => {
  it('fails on an undeclared dynamic statement and on a bad reference', async () => {
    const root = makeTempRepo('sql-columns-');
    write(root, 'packages/db/migrations/schema.sql', SCHEMA);
    write(
      root,
      'packages/demo/src/repository.ts',
      [
        'export async function load(pool: { query: (sql: string) => Promise<unknown> }) {',
        '  await pool.query(`SELECT nick_name FROM widgets WHERE id = $1`);',
        '  await pool.query(`UPDATE ${table} SET ${sets} WHERE id = $1`);',
        '}',
      ].join('\n'),
    );

    const result = await checkSqlColumns(root, []);
    expect(result.failures).toBe(2);
    expect(result.violations.map((violation) => violation.kind).sort()).toEqual([
      'column-not-in-scope',
      'dynamic-statement',
    ]);
    expect(result.checked).toBe(2);
    expect(result.dynamic).toBe(1);
  });

  it('requires an exact count when a file is declared dynamic', async () => {
    const root = makeTempRepo('sql-columns-');
    write(root, 'packages/db/migrations/schema.sql', SCHEMA);
    write(
      root,
      'packages/demo/src/repository.ts',
      [
        'export async function update(pool: { query: (sql: string) => Promise<unknown> }) {',
        '  await pool.query(`UPDATE ${table} SET ${sets} WHERE id = $1`);',
        '}',
      ].join('\n'),
    );

    // Declared with the right count: allowed, and still reported.
    const declared = await checkSqlColumns(root, [
      { file: 'packages/demo/src/repository.ts', allowed: 1, reason: 'test fixture' },
    ]);
    expect(declared.failures).toBe(0);
    expect(declared.declared).toHaveLength(1);

    // A stale count is a failure in its own right.
    const stale = await checkSqlColumns(root, [
      { file: 'packages/demo/src/repository.ts', allowed: 2, reason: 'test fixture' },
    ]);
    expect(stale.failures).toBe(1);
    expect(stale.violations[0]?.column).toBe('declared 2, found 1');
  });

  it('passes clean SQL and reports schema-clean statements', async () => {
    const root = makeTempRepo('sql-columns-');
    write(root, 'packages/db/migrations/schema.sql', SCHEMA);
    write(
      root,
      'packages/demo/src/repository.ts',
      [
        'export async function load(pool: { query: (sql: string) => Promise<unknown> }) {',
        '  return pool.query(`SELECT w.id, e.kind FROM widgets w JOIN widget_events e ON e.widget_id = w.id WHERE w.id = $1`);',
        '}',
      ].join('\n'),
    );

    const result = await checkSqlColumns(root, []);
    expect(result.failures).toBe(0);
    expect(result.declared).toEqual([]);
    expect(result.failures).toBe(0);
  });
});
