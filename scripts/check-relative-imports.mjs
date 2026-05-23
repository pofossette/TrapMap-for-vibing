#!/usr/bin/env node
/**
 * 检查 packages/ 下是否存在相对路径导入 (../ 或 ./)
 *
 * 用法:
 *   node scripts/check-relative-imports.mjs          # 检查并报告 (非零退出)
 *   node scripts/check-relative-imports.mjs --fix    # 提示使用 codemod 修复
 *   node scripts/check-relative-imports.mjs --only-cross-dir  # 仅检查 ../ (跳过 ./)
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const sourceRoots = ['packages'];
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);
const excludeDirs = new Set(['node_modules', 'dist', 'coverage', '.git']);

const args = process.argv.slice(2);
const fixMode = args.includes('--fix');
const onlyCrossDir = args.includes('--only-cross-dir');

/**
 * 扫描各包的 package.json，找出有显式 exports 字段的包。
 * 对于这些包，包内相对导入是合法的 (因为 exports 限制了子路径导入)，不应报错。
 */
async function findExportsPackages() {
  const exportsPackages = new Set();
  for (const root of sourceRoots) {
    const absRoot = path.resolve(repoRoot, root);
    let entries;
    try {
      entries = await readdir(absRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgJsonPath = path.join(absRoot, entry.name, 'package.json');
      try {
        const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
        if (pkgJson.exports) {
          exportsPackages.add(path.join(root, entry.name));
        }
      } catch {
        // no package.json or invalid JSON
      }
    }
  }
  return exportsPackages;
}

async function main() {
  // 跳过有显式 exports 字段的包 (包内相对导入是合法模式)
  const exportsPackages = await findExportsPackages();

  const violations = [];

  for (const root of sourceRoots) {
    const absRoot = path.resolve(repoRoot, root);
    await scanDirectory(absRoot, root, violations, exportsPackages);
  }

  if (violations.length === 0) {
    console.log('No relative imports found. All good.');
    process.exit(0);
  }

  if (fixMode) {
    console.log(
      `Found ${violations.length} relative import(s). Run the codemod to fix:\n  pnpm codemod:relative\n`,
    );
  } else {
    console.error(`Found ${violations.length} relative import(s):\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  "${v.importPath}"`);
    }
    console.error('\nFix with: pnpm codemod:relative');
    process.exit(1);
  }
}

async function scanDirectory(dir, workspacePrefix, violations, exportsPackages) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (excludeDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(repoRoot, fullPath);

    if (entry.isDirectory()) {
      await scanDirectory(fullPath, workspacePrefix, violations, exportsPackages);
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      // 跳过有显式 exports 的包 (包内 ../ 相对导入是合法模式)
      if (isInExportsPackage(relPath, exportsPackages)) continue;
      await checkFile(fullPath, relPath, violations);
    }
  }
}

function isInExportsPackage(relPath, exportsPackages) {
  for (const pkg of exportsPackages) {
    if (relPath.startsWith(`${pkg}/`)) return true;
  }
  return false;
}

async function checkFile(absPath, relPath, violations) {
  const contents = await readFile(absPath, 'utf8');

  const lines = contents.split('\n');
  let inBlockComment = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';
    const lineNumber = lineNum + 1;

    // 跳过注释行和块注释内的行
    if (inBlockComment) {
      if (line.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (line.trimStart().startsWith('//')) continue;
    if (line.trimStart().startsWith('/*')) {
      inBlockComment = !line.includes('*/');
      continue;
    }

    // 跳过 vi.mock() / vi.importActual() 调用 (测试工具)
    if (line.includes('vi.mock(') || line.includes('vi.importActual(')) continue;

    // 跳过测试文件中的 typeof import() 类型
    if (line.includes('typeof import(')) continue;

    // 根据 --only-cross-dir 选择匹配模式
    const prefix = onlyCrossDir ? '\\.\\./' : '\\.\\.?/';
    const importRegex = new RegExp(
      `(?:import|export)\\s+(?:[^;]*?\\s+from\\s+)?['"](${prefix}[^'"]*)['"]|import\\s*\\(\\s*['"](${prefix}[^'"]*)['"]\\s*\\)`,
    );

    const match = importRegex.exec(line);
    if (match) {
      const importPath = match[1] || match[2];
      if (importPath) {
        violations.push({
          file: relPath,
          line: lineNumber,
          importPath,
        });
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
