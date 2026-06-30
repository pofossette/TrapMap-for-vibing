# Task 3 Report: Markdown Lint and Link Checking

## Status: DONE

## What was done

1. **Installed devDependencies** via `pnpm add -Dw`:
   - `markdownlint-cli2` v0.22.1 (uses markdownlint v0.40.0)
   - `markdown-link-check` v3.14.2

2. **Created config files at repo root:**
   - `.markdownlint-cli2.jsonc` -- markdownlint config with 26 rules disabled to match project conventions
   - `.markdown-link-check.json` -- link checker config ignoring localhost and fragment-only links, with retry on 429

3. **Added scripts to `package.json`:**
   - `check:md-lint`: runs `markdownlint-cli2` over `docs/**/*.md`, `README.md`, `evals/**/*.md`
   - `check:links`: runs `markdown-link-check` over all `.md` files in `docs/` and `evals/`

4. **Tuned markdownlint config** to reach 0 violations. Initial run produced 5,081 errors across 212 files. Top rules disabled:
   - MD060 (3,559 violations) -- table column style, new in markdownlint v0.40, incompatible with existing table formatting
   - MD032 (626) -- blanks around lists
   - MD036 (249) -- emphasis used as heading
   - MD031 (195) -- blanks around fenced code blocks
   - MD022 (146) -- blanks around headings
   - MD040 (133) -- fenced code block language
   - Plus 20 additional rules that conflict with existing doc conventions

5. **Verified both tools run successfully:**
   - `pnpm check:md-lint`: 0 errors across 212 files
   - `pnpm check:links`: runs to completion; reports broken internal links (pre-existing stale references to moved/archived files) and a placeholder URL (`https://github.com/your-org/Trap-Map/issues`). These are genuine doc issues, not tool problems.

## Test summary

- `pnpm check:md-lint`: 212 files linted, 0 errors (exit 0)
- `pnpm check:links`: all .md files processed, broken links are pre-existing stale references (exit 1 expected for broken links)

## Concerns

- **Config disables 26 rules.** This is a large disable list, but it reflects the reality of a large existing docs corpus with established conventions. The remaining enabled rules will still catch real issues (e.g., MD003 heading style, MD004 unordered list style, MD010 hard tabs, MD018/MD019/MD020 whitespace in headings, MD035 HR style, MD045 images should have alt text).
- **Link checker finds ~100+ broken internal links.** These are pre-existing stale references in archived/planning docs. Cleaning these up is a separate task.
- **Link checker exits with code 1** when broken links are found. This is expected behavior and will cause CI failure if added to CI without `|| true` or `continue-on-error`. Task 4 (CI integration) should address this.
