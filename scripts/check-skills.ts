#!/usr/bin/env tsx

/**
 * Skill artifact version guard (check:skills).
 *
 * Validates every SKILL.md artifact under packages/skills/:
 *   - the frontmatter must declare a valid semver version (major.minor.patch
 *     with optional prerelease/build identifiers, no leading zeros)
 *   - optional fields (author, license, compatibility, tags) must be
 *     non-empty when present
 *   - the version must be non-decreasing relative to the last committed
 *     version for that skill directory (git log -1 -- <dir> + git show),
 *     unless the skill has no previous version in history (first
 *     introduction) — then the monotonic check is skipped
 *
 * Frontmatter parsing is a raw read, not a YAML parser: scripts are
 * standalone tsx entry points and workspace deps (@trapmap/lib / gray-matter)
 * are not resolvable from scripts/ at runtime, so the frontmatter block is
 * extracted with the gray-matter delimiter pattern (^---(?:\r?\n)) used by
 * @trapmap/lib's parseMarkdownFrontmatter, and the flat `key: value` fields
 * both SKILL.md artifacts use are read line-by-line. Comparison is numeric on
 * the three core semver segments, which is sufficient for regression
 * detection.
 *
 * Usage:
 *   pnpm check:skills
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const FRONTMATTER_DELIMITER_RE = /^---(?:\r?\n)/;
const FRONTMATTER_BLOCK_RE = /^---(?:\r?\n)([\s\S]*?)(?:\r?\n)---(?:\r?\n|$)/;

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
}

export interface SkillFileReport {
  relPath: string;
  currentVersion: string | null;
  previousVersion: string | null;
  errors: string[];
  warnings: string[];
}

/**
 * Extract the raw frontmatter block (between the leading `---` delimiters),
 * or null when the content has no parseable frontmatter. Delimiter detection
 * mirrors gray-matter as used by @trapmap/lib's parseMarkdownFrontmatter.
 */
export function extractFrontmatterBlock(content: string): string | null {
  if (!FRONTMATTER_DELIMITER_RE.test(content)) {
    return null;
  }
  const match = content.match(FRONTMATTER_BLOCK_RE);
  return match === null ? null : (match[1] ?? null);
}

/**
 * Read the value of a flat `key: value` line from the frontmatter block.
 * Returns the trimmed value, '' when the key is present with an empty value,
 * or null when the key line is absent.
 */
export function readFieldValue(frontmatter: string, key: string): string | null {
  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith(`${key}:`)) {
      continue;
    }
    return line.slice(key.length + 1).trim();
  }
  return null;
}

export function isValidSemver(version: string): boolean {
  return SEMVER_RE.test(version);
}

export function parseSemver(version: string): ParsedSemver | null {
  const match = version.match(SEMVER_RE);
  if (match === null) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Compare two semver strings numerically on the major.minor.patch segments;
 * returns a negative number when `a` is older than `b`, 0 when equal, a
 * positive number when newer. Prerelease/build identifiers are accepted by
 * the validation regex but do not affect ordering. Unparsable inputs compare
 * as equal (the caller validates the current version separately).
 */
export function compareSemver(a: string, b: string): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);
  if (parsedA === null || parsedB === null) {
    return 0;
  }
  if (parsedA.major !== parsedB.major) {
    return parsedA.major - parsedB.major;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor - parsedB.minor;
  }
  return parsedA.patch - parsedB.patch;
}

/**
 * Accept a non-empty scalar or an inline `[a, b]` list whose items are all
 * non-empty — the shapes used by the compatibility and tags fields.
 */
export function isNonEmptyScalarOrArray(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner.length === 0) {
      return false;
    }
    return inner.split(',').every((item) => item.trim().length > 0);
  }
  return true;
}

/**
 * Validate the flat frontmatter block of one SKILL.md artifact. Returns a
 * list of human-readable error messages; an empty list means valid.
 */
export function validateSkillMetadata(frontmatter: string): string[] {
  const errors: string[] = [];

  const version = readFieldValue(frontmatter, 'version');
  if (version === null || !isValidSemver(version)) {
    errors.push(
      `version: missing or invalid semver (expected major.minor.patch with optional prerelease/build, no leading zeros), got ${JSON.stringify(version)}`,
    );
  }

  for (const key of ['author', 'license']) {
    const value = readFieldValue(frontmatter, key);
    if (value !== null && value.trim().length === 0) {
      errors.push(`${key}: must be a non-empty string when present`);
    }
  }

  for (const key of ['compatibility', 'tags']) {
    const value = readFieldValue(frontmatter, key);
    if (value !== null && !isNonEmptyScalarOrArray(value)) {
      errors.push(`${key}: must be a non-empty value (string or [a, b] list) when present`);
    }
  }

  return errors;
}

export function collectSkillFiles(skillsRoot: string): string[] {
  const entries = readdirSync(skillsRoot, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillFile = join(skillsRoot, entry.name, 'SKILL.md');
    if (existsSync(skillFile)) {
      files.push(skillFile);
    }
  }
  return files.sort();
}

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function runGit(repoRoot: string, args: string[]): GitResult {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Read the version of the last committed state of the skill file. Returns
 * null when the file has no history (first introduction) or its frontmatter
 * carries no version. Git failures (as opposed to empty history) are pushed
 * as warnings so they surface without failing the check.
 */
export function readPreviousVersionFromHistory(
  repoRoot: string,
  skillDirRel: string,
  skillFileRel: string,
  warnings: string[],
): string | null {
  const logResult = runGit(repoRoot, ['log', '--format=%H', '-1', '--', skillDirRel]);
  if (!logResult.ok) {
    warnings.push(
      `git log failed for ${skillDirRel}: ${logResult.stderr.trim()}; skipping regression check`,
    );
    return null;
  }
  const lastCommit = logResult.stdout.trim();
  if (lastCommit.length === 0) {
    return null;
  }
  const showResult = runGit(repoRoot, ['show', `${lastCommit}:${skillFileRel}`]);
  if (!showResult.ok) {
    warnings.push(
      `git show failed for ${lastCommit}:${skillFileRel}: ${showResult.stderr.trim()}; skipping regression check`,
    );
    return null;
  }
  const frontmatter = extractFrontmatterBlock(showResult.stdout);
  if (frontmatter === null) {
    return null;
  }
  return readFieldValue(frontmatter, 'version');
}

export function checkSkillFile(absPath: string, repoRoot: string): SkillFileReport {
  const relPath = relative(repoRoot, absPath);
  const content = readFileSync(absPath, 'utf8');
  const frontmatter = extractFrontmatterBlock(content);
  const errors =
    frontmatter === null ? validateSkillMetadata('') : validateSkillMetadata(frontmatter);
  const warnings: string[] = [];

  const currentVersion = frontmatter === null ? null : readFieldValue(frontmatter, 'version');
  let previousVersion: string | null = null;
  if (currentVersion !== null && isValidSemver(currentVersion) && errors.length === 0) {
    previousVersion = readPreviousVersionFromHistory(repoRoot, dirname(relPath), relPath, warnings);
    if (previousVersion !== null) {
      if (!isValidSemver(previousVersion)) {
        warnings.push(
          `version history: previous version ${JSON.stringify(previousVersion)} is not valid semver; skipping regression check`,
        );
      } else if (compareSemver(currentVersion, previousVersion) < 0) {
        errors.push(
          `version regression: ${currentVersion} is older than the last committed ${previousVersion}`,
        );
      }
    }
  }

  return { relPath, currentVersion, previousVersion, errors, warnings };
}

function main() {
  const repoRoot = resolve(import.meta.dirname, '..');
  const skillsRoot = join(repoRoot, 'packages', 'skills');
  const skillFiles = collectSkillFiles(skillsRoot);

  if (skillFiles.length === 0) {
    console.error('[check-skills] FAIL: no SKILL.md files found under packages/skills/');
    process.exit(1);
  }

  const reports = skillFiles.map((absPath) => checkSkillFile(absPath, repoRoot));

  for (const report of reports) {
    if (report.errors.length === 0) {
      const history =
        report.previousVersion === null
          ? 'no previous version in history'
          : `previous ${report.previousVersion}`;
      console.log(
        `[check-skills] OK   ${report.relPath}  version=${report.currentVersion ?? 'MISSING'}  (${history})`,
      );
    } else {
      console.error(
        `[check-skills] FAIL ${report.relPath}  version=${report.currentVersion ?? 'MISSING'}`,
      );
      for (const error of report.errors) {
        console.error(`  - ${error}`);
      }
    }
    for (const warning of report.warnings) {
      console.warn(`[check-skills] WARN ${report.relPath}: ${warning}`);
    }
  }

  const failed = reports.filter((report) => report.errors.length > 0);
  if (failed.length > 0) {
    console.error(
      `[check-skills] FAIL: ${failed.length} of ${reports.length} skill artifact(s) failed`,
    );
    process.exit(1);
  }
  console.log(
    `[check-skills] OK: ${reports.length} skill artifact(s) valid, versions non-decreasing`,
  );
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-skills');
if (isDirectRun) {
  try {
    main();
  } catch (err) {
    console.error(`[check-skills] FAIL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
