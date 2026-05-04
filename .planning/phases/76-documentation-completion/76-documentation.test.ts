import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// Helper: read a file relative to project root, return string or empty string
// ---------------------------------------------------------------------------
function readDoc(relPath: string): string {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) return '';
  return readFileSync(abs, 'utf-8');
}

// ---------------------------------------------------------------------------
// Helper: extract Markdown link targets from text
// ---------------------------------------------------------------------------
function extractMarkdownLinks(md: string): string[] {
  // Match [text](target)  but ignore images ![alt](src)
  const re = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
  const targets: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const href = m[2].trim();
    // Skip external links and anchors-only
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) {
      continue;
    }
    // Strip in-doc anchors like #section
    targets.push(href.split('#')[0]);
  }
  return targets;
}

// ===========================================================================
// Gap 1: docs/api-surface.md exists and documents API endpoints
// ===========================================================================
describe('Gap 1 - DOC-01: api-surface.md documents API endpoints', () => {
  const relPath = 'docs/api-surface.md';
  const content = readDoc(relPath);

  it('file exists', () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it('documents auth endpoints', () => {
    expect(content).toContain('/v1/auth/login');
    expect(content).toContain('/v1/auth/session');
    expect(content).toContain('/v1/auth/logout');
  });

  it('documents team and member endpoints', () => {
    expect(content).toContain('/v1/teams');
    expect(content).toContain('/v1/members');
  });

  it('documents knowledge endpoints', () => {
    expect(content).toContain('/v1/knowledge');
  });

  it('documents retrieval endpoints', () => {
    expect(content).toContain('/v1/retrieval/search');
  });

  it('documents operations endpoints', () => {
    expect(content).toContain('/v1/operations/export');
    expect(content).toContain('/v1/operations/import');
  });

  it('includes request and response contract references', () => {
    // Verify the table structure mentions schema contracts
    expect(content).toMatch(/Request Contract/);
    expect(content).toMatch(/Response Contract/);
  });
});

// ===========================================================================
// Gap 2: README.md and GETTING_STARTED.md are comprehensive
// ===========================================================================
describe('Gap 2 - DOC-02: README.md and GETTING_STARTED.md are comprehensive', () => {
  const readme = readDoc('README.md');
  const gettingStarted = readDoc('docs/GETTING_STARTED.md');

  it('README.md exists', () => {
    expect(readme.length).toBeGreaterThan(0);
  });

  it('README.md has quick start or deployment section', () => {
    const combined = readme.toLowerCase();
    const hasQuickStart = combined.includes('quick') || combined.includes('deploy');
    expect(hasQuickStart).toBe(true);
  });

  it('README.md has configuration section', () => {
    expect(readme.toLowerCase()).toMatch(/configuration|config|env/i);
  });

  it('README.md has development commands section', () => {
    expect(readme.toLowerCase()).toMatch(/development|dev|pnpm/i);
  });

  it('README.md has project structure section', () => {
    expect(readme.toLowerCase()).toMatch(/project structure|structure/i);
  });

  it('GETTING_STARTED.md exists', () => {
    expect(gettingStarted.length).toBeGreaterThan(0);
  });

  it('GETTING_STARTED.md has prerequisites section', () => {
    expect(gettingStarted.toLowerCase()).toMatch(/prerequisite|require|前置/i);
  });

  it('GETTING_STARTED.md has installation steps', () => {
    expect(gettingStarted.toLowerCase()).toMatch(/install|安装/i);
  });

  it('GETTING_STARTED.md has environment configuration', () => {
    expect(gettingStarted.toLowerCase()).toMatch(/\.env|environment|环境/i);
  });

  it('GETTING_STARTED.md has dev server startup instructions', () => {
    expect(gettingStarted.toLowerCase()).toMatch(/dev:server|start|启动/i);
  });

  it('GETTING_STARTED.md has verification steps', () => {
    expect(gettingStarted.toLowerCase()).toMatch(/verify|验证|health/i);
  });
});

// ===========================================================================
// Gap 3: architecture.md has version v1.6
// ===========================================================================
describe('Gap 3 - DOC-03: architecture.md has version v1.6', () => {
  const content = readDoc('architecture.md');

  it('file exists', () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it('contains version v1.6', () => {
    expect(content).toContain('v1.6');
  });

  it('has version section', () => {
    expect(content.toLowerCase()).toMatch(/version|版本/i);
  });
});

// ===========================================================================
// Gap 4: docs/architecture/ sub-documents exist (API.md, DEPLOYMENT.md, FLOW.md)
// ===========================================================================
describe('Gap 4 - DOC-03: architecture sub-documents exist', () => {
  const requiredFiles = [
    'docs/architecture/API.md',
    'docs/architecture/DEPLOYMENT.md',
    'docs/architecture/FLOW.md',
  ];

  for (const relPath of requiredFiles) {
    it(`${relPath} exists and is non-empty`, () => {
      const content = readDoc(relPath);
      expect(content.length).toBeGreaterThan(0);
    });
  }

  it('API.md documents endpoint details', () => {
    const api = readDoc('docs/architecture/API.md');
    expect(api).toContain('/v1/');
  });

  it('DEPLOYMENT.md has deployment instructions', () => {
    const deploy = readDoc('docs/architecture/DEPLOYMENT.md');
    expect(deploy.toLowerCase()).toMatch(/deploy|docker|production/i);
  });

  it('FLOW.md has flow diagrams', () => {
    const flow = readDoc('docs/architecture/FLOW.md');
    // Flow.md uses ASCII art diagrams with box characters
    expect(flow.length).toBeGreaterThan(500);
  });
});

// ===========================================================================
// Gap 5: No broken internal links in documentation
// ===========================================================================
describe('Gap 5 - No broken internal links in documentation', () => {
  // Collect all markdown files to check
  const docFiles: string[] = [];

  function collectMdFiles(dir: string, relBase: string): void {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const rel = relBase ? `${relBase}/${entry}` : entry;
      if (statSync(full).isDirectory()) {
        collectMdFiles(full, rel);
      } else if (entry.endsWith('.md')) {
        docFiles.push(rel);
      }
    }
  }

  collectMdFiles(resolve(ROOT, 'docs'), 'docs');
  // Also check root-level docs
  const rootDocs = ['README.md', 'architecture.md'];
  for (const f of rootDocs) {
    if (existsSync(resolve(ROOT, f))) {
      docFiles.push(f);
    }
  }

  const brokenLinks: { file: string; target: string }[] = [];

  for (const docFile of docFiles) {
    const content = readDoc(docFile);
    if (!content) continue;

    const links = extractMarkdownLinks(content);
    const docDir = docFile.includes('/') ? docFile.substring(0, docFile.lastIndexOf('/')) : '.';

    for (const link of links) {
      // Resolve relative path from the document's directory
      const resolved = resolve(ROOT, docDir, link);
      const relResolved = relative(ROOT, resolved);

      // Only check links that appear to target local files
      if (link.startsWith('/')) continue; // absolute paths are ambiguous

      if (!existsSync(resolved)) {
        brokenLinks.push({ file: docFile, target: relResolved || link });
      }
    }
  }

  it('all internal markdown links resolve to existing files', () => {
    if (brokenLinks.length > 0) {
      const details = brokenLinks
        .map((b) => `  ${b.file} -> ${b.target}`)
        .join('\n');
      expect.fail(`Broken links found:\n${details}`);
    }
    // If no broken links, the test passes
    expect(brokenLinks.length).toBe(0);
  });
});
