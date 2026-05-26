import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = resolve(ROOT, 'scripts/complexity-budgets.json');

interface LineBudget {
  file: string;
  maxLines: number;
}

interface Config {
  lineBudgets: LineBudget[];
}

function main(): void {
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const config: Config = JSON.parse(raw);

  let failures = 0;

  for (const budget of config.lineBudgets) {
    const filePath = resolve(ROOT, budget.file);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      console.error(`[complexity] WARN: cannot read ${budget.file}, skipping`);
      continue;
    }

    const lineCount = content.split('\n').length;
    if (lineCount > budget.maxLines) {
      console.error(
        `[complexity] FAIL: ${budget.file} has ${lineCount} lines (budget: ${budget.maxLines})`,
      );
      failures++;
    } else {
      console.log(`[complexity] OK: ${budget.file} has ${lineCount}/${budget.maxLines} lines`);
    }
  }

  if (failures > 0) {
    console.error(
      `\n[complexity] ${failures} file(s) exceed their line budget. Refactor before merging.`,
    );
    process.exit(1);
  }

  console.log(`[complexity] All ${config.lineBudgets.length} file(s) within budget.`);
}

main();
