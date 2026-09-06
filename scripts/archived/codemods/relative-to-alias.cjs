// fallow-ignore-file unused-file -- invoked by scripts/archived/codemod-batch.sh
/**
 * jscodeshift transform: 将相对路径导入转换为 @trapmap/<pkg> 别名导入
 *
 * 用法 (从项目根目录运行):
 *   npx jscodeshift -t scripts/codemods/relative-to-alias.cjs packages \
 *     --parser=ts --extensions=ts
 *
 *   预览变更 (dry run):
 *   npx jscodeshift -t scripts/codemods/relative-to-alias.cjs packages \
 *     --parser=ts --extensions=ts --dry
 *
 * 自定义选项 (作为 CLI flag 传入，会透传给 transform):
 *   --project-root=<dir>         项目根目录 (默认: process.cwd())
 *   --convert-same-dir=true      是否转换 ./ 同级目录导入 (默认: false; 设 true 启用)
 *
 * 安全约束:
 *   - 仅转换位于 packages/ 目录内的文件
 *   - 不修改第三方包导入 (裸 specifier)
 *   - 目标路径必须在 workspace 内 (packages/*)
 *   - 外部依赖 (如 @trapmap/contracts) 保持原样
 */

const path = require('node:path');

const ALIAS_PREFIX = '@trapmap';
const WORKSPACE_ROOTS = ['packages'];
const STRIP_EXTENSIONS = ['.ts', '.tsx'];

/**
 * @param {import('jscodeshift').FileInfo} fileInfo
 * @param {import('jscodeshift').API} api
 * @param {import('jscodeshift').Options & { projectRoot?: string; convertSameDir?: string }} options
 */
module.exports = (fileInfo, api, options) => {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const projectRoot = options['project-root']
    ? path.resolve(options['project-root'])
    : process.cwd();
  const convertSameDir = options['convert-same-dir'] === 'true';

  const fileRelPath = path.relative(projectRoot, path.resolve(fileInfo.path));
  if (!isInWorkspace(fileRelPath)) return fileInfo.source;

  let changed = false;

  root.find(j.ImportDeclaration).forEach((nodePath) => {
    const src = nodePath.value.source;
    if (!src) return;
    const result = convertImport(fileRelPath, src.value, projectRoot, convertSameDir);
    if (!result) return;
    src.value = result;
    changed = true;
  });

  root.find(j.ExportNamedDeclaration).forEach((nodePath) => {
    const src = nodePath.value.source;
    if (!src) return;
    const result = convertImport(fileRelPath, src.value, projectRoot, convertSameDir);
    if (!result) return;
    src.value = result;
    changed = true;
  });

  root.find(j.ExportAllDeclaration).forEach((nodePath) => {
    const src = nodePath.value.source;
    const result = convertImport(fileRelPath, src.value, projectRoot, convertSameDir);
    if (!result) return;
    src.value = result;
    changed = true;
  });

  root.find(j.CallExpression).forEach((nodePath) => {
    if (nodePath.value.callee?.type !== 'Import') return;
    const arg = nodePath.value.arguments[0];
    if (arg?.type !== 'StringLiteral') return;
    const result = convertImport(fileRelPath, arg.value, projectRoot, convertSameDir);
    if (!result) return;
    arg.value = result;
    changed = true;
  });

  // 处理 TypeScript import() 类型: import('../store.js').Type
  root.find(j.TSImportType).forEach((nodePath) => {
    const arg = nodePath.value.argument;
    if (arg?.type !== 'StringLiteral') return;
    const result = convertImport(fileRelPath, arg.value, projectRoot, convertSameDir);
    if (!result) return;
    arg.value = result;
    changed = true;
  });

  return changed ? root.toSource() : fileInfo.source;
};

function convertImport(fileRelPath, importPath, _projectRoot, convertSameDir) {
  if (!isRelativeImport(importPath)) return null;
  if (!convertSameDir && isSameDirImport(importPath)) return null;

  const resolved = resolveImportPath(fileRelPath, importPath);
  if (!resolved) return null;

  return mapToAlias(resolved);
}

function isInWorkspace(fileRelPath) {
  return WORKSPACE_ROOTS.some(
    (r) => fileRelPath.startsWith(`${r}/`) || fileRelPath.startsWith(`${r}\\`),
  );
}

function isRelativeImport(specifier) {
  return specifier.startsWith('.');
}

function isSameDirImport(specifier) {
  return specifier.startsWith('./');
}

/**
 * 将相对导入路径解析为仓库根目录相对路径
 * 例: packages/server/src/lib/retrieval/, ../../store -> packages/server/src/lib/store
 *
 * 若解析结果越出仓库根目录则返回 null
 */
function resolveImportPath(fileRelPath, importPath) {
  const fileDir = path.dirname(fileRelPath);
  const resolved = path.normalize(path.join(fileDir, importPath));
  if (resolved.startsWith('..')) return null;
  return resolved;
}

/**
 * 将仓库相对路径映射为 alias 导入路径
 * 例: packages/server/src/lib/store -> @trapmap/server/lib/store
 *     packages/cli/src/commands/audit -> @trapmap/cli/commands/audit
 *     packages/contracts/src/domain/evals -> @trapmap/contracts/domain/evals
 */
function mapToAlias(resolvedPath) {
  for (const wsRoot of WORKSPACE_ROOTS) {
    const prefix = `${wsRoot}/`;
    if (!resolvedPath.startsWith(prefix)) continue;

    const remainder = resolvedPath.slice(prefix.length);
    const slashIdx = remainder.indexOf('/');
    const pkgName = slashIdx === -1 ? remainder : remainder.slice(0, slashIdx);
    const subPath = slashIdx === -1 ? '' : remainder.slice(slashIdx);

    // 裁剪 src/ 前缀 (packages/<pkg>/src/xxx -> @trapmap/<pkg>/xxx)
    const afterPkg = subPath || `/${remainder}`;
    const cleanSubPath = afterPkg.startsWith('/src/')
      ? afterPkg.slice('/src'.length)
      : afterPkg.startsWith('/src')
        ? ''
        : afterPkg;

    return `${ALIAS_PREFIX}/${pkgName}${stripExtensions(cleanSubPath)}`;
  }
  return null;
}

function stripExtensions(filePath) {
  for (const ext of STRIP_EXTENSIONS) {
    if (filePath.endsWith(ext)) {
      return filePath.slice(0, -ext.length);
    }
  }
  return filePath;
}
