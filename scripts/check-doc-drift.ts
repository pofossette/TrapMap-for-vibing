import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = resolve(ROOT, 'scripts/complexity-budgets.json');

interface DocRule {
  file: string;
  mustContain?: string[];
  mustNotContain?: string[];
}

interface Config {
  docRules: DocRule[];
}

function main(): void {
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const config: Config = JSON.parse(raw);

  let failures = 0;

  for (const rule of config.docRules) {
    const filePath = resolve(ROOT, rule.file);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      console.error(`[doc-drift] FAIL: cannot read ${rule.file}`);
      failures++;
      continue;
    }

    if (rule.mustContain) {
      for (const phrase of rule.mustContain) {
        if (!content.includes(phrase)) {
          console.error(`[doc-drift] FAIL: ${rule.file} must contain "${phrase}" but does not`);
          failures++;
        }
      }
    }

    if (rule.mustNotContain) {
      for (const phrase of rule.mustNotContain) {
        if (content.includes(phrase)) {
          console.error(`[doc-drift] FAIL: ${rule.file} must NOT contain "${phrase}" but does`);
          failures++;
        }
      }
    }
  }

  if (failures > 0) {
    console.error(`\n[doc-drift] ${failures} violation(s) found. Fix the docs and try again.`);
    process.exit(1);
  }

  console.log(`[doc-drift] All ${config.docRules.length} doc rule(s) passed.`);
}

main();
