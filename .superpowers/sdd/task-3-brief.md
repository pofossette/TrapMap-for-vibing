# Task 3: Add Markdown Lint and Link Checking

## Task Description

Add two mature documentation quality tools: `markdownlint-cli2` for markdown formatting lint and `markdown-link-check` for broken link detection. Configure both, add scripts, and integrate into CI.

### Part 1: markdownlint-cli2

Install `markdownlint-cli2` as a root devDependency.

Create `.markdownlint-cli2.jsonc` at the repo root:

```jsonc
{
  "config": {
    "default": true,
    "MD013": false,   // Line length — too noisy for docs with tables
    "MD033": false,   // Inline HTML — used intentionally in some docs
    "MD041": false,   // First line heading — some files have frontmatter
    "MD024": false,   // Duplicate headings — used in Phase sections
    "MD034": false    // Bare URLs — some intentional
  },
  "globs": ["docs/**/*.md", "README.md", "evals/**/*.md"],
  "ignores": ["node_modules", "packages/*/node_modules"]
}
```

Add script to `package.json`:
```json
"check:md-lint": "markdownlint-cli2 'docs/**/*.md' 'README.md' 'evals/**/*.md'"
```

### Part 2: markdown-link-check

Install `markdown-link-check` as a root devDependency.

Create `.markdown-link-check.json` at the repo root:

```json
{
  "ignorePatterns": [
    { "pattern": "^https?://localhost" },
    { "pattern": "^#" }
  ],
  "retryOn429": true,
  "retryCount": 2
}
```

Add script to `package.json`:
```json
"check:links": "find docs evals -name '*.md' -exec markdown-link-check {} +"
```

**Note:** External link checking can be flaky. The script should use `--retryOn 429` where supported. If `markdown-link-check` doesn't have a `--retryOn` flag, the JSON config handles it.

### Part 3: Verify both tools work

1. Run `pnpm check:md-lint` — fix any issues by adjusting the config (disable noisy rules), NOT by modifying docs
2. Run `pnpm check:links` — it should complete without crashing (some external links may fail, that's expected)

## Context

- The project has markdown docs in `docs/`, `evals/`, and root `README.md`
- Existing docs use intentional patterns that some markdownlint rules would flag:
  - Tables in docs trigger MD013 (line length)
  - Some docs use inline HTML intentionally
  - Phase sections have duplicate headings
  - Bare URLs are used in some docs
- The pre-commit hook at `.husky/pre-commit` currently runs: format, check:imports, check:mermaid

## Key Files

- `package.json` — scripts to add
- `.husky/pre-commit` — will be updated in Task 4 (not here)
- `.github/workflows/ci.yml` — will be updated in Task 4 (not here)

## Your Job

1. Install `markdownlint-cli2` and `markdown-link-check` as root devDependencies
2. Create `.markdownlint-cli2.jsonc` with the config above
3. Create `.markdown-link-check.json` with the config above
4. Add the two scripts to package.json
5. Run `pnpm check:md-lint` — if there are violations, tune the config to disable rules that conflict with the project's conventions (DO NOT modify docs)
6. Run `pnpm check:links` — verify it runs (some external link failures are expected)
7. Commit your work

## Work From

/home/wunai/Disks/Data/my-project/Trap-Map
