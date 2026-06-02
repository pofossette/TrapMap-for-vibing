import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

export interface MermaidBlock {
  file: string;
  startLine: number;
  content: string;
}

export interface MermaidCheckResult {
  failures: number;
  messages: string[];
  checkedBlocks: number;
}

interface MermaidParser {
  parse(source: string): Promise<unknown>;
}

const MARKDOWN_ROOTS = ['README.md', 'docs', 'evals'];

let mermaidParserPromise: Promise<MermaidParser> | null = null;
let domReady = false;

function setGlobalValue<K extends keyof typeof globalThis>(
  key: K,
  value: (typeof globalThis)[K],
): void {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}

function ensureBrowserLikeDom(): void {
  if (domReady) {
    return;
  }

  const { window } = new JSDOM('<!doctype html><html><body></body></html>');
  setGlobalValue('window', window as typeof globalThis.window);
  setGlobalValue('document', window.document);
  setGlobalValue('navigator', window.navigator);
  setGlobalValue('Node', window.Node);
  setGlobalValue('Element', window.Element);
  setGlobalValue('HTMLElement', window.HTMLElement);
  setGlobalValue('SVGElement', window.SVGElement);
  setGlobalValue('DOMParser', window.DOMParser);
  setGlobalValue('XMLSerializer', window.XMLSerializer);
  setGlobalValue('getComputedStyle', window.getComputedStyle.bind(window));
  setGlobalValue('MutationObserver', window.MutationObserver);
  setGlobalValue('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 0),
  );
  setGlobalValue('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
  domReady = true;
}

async function getMermaidParser(): Promise<MermaidParser> {
  ensureBrowserLikeDom();
  mermaidParserPromise ??= import('mermaid/dist/mermaid.esm.min.mjs').then(
    (module) => module.default as MermaidParser,
  );
  return mermaidParserPromise;
}

function walkMarkdownFiles(entryPath: string): string[] {
  const statEntries = readdirSync(entryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of statEntries) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    const nextPath = resolve(entryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(nextPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(nextPath);
    }
  }

  return files;
}

export function listMarkdownFiles(root: string): string[] {
  const files: string[] = [];

  for (const entry of MARKDOWN_ROOTS) {
    const absPath = resolve(root, entry);
    if (entry.endsWith('.md')) {
      files.push(absPath);
      continue;
    }

    files.push(...walkMarkdownFiles(absPath));
  }

  return files.sort();
}

export function extractMermaidBlocks(
  file: string,
  content: string,
): {
  blocks: MermaidBlock[];
  messages: string[];
} {
  const lines = content.split(/\r?\n/);
  const blocks: MermaidBlock[] = [];
  const messages: string[] = [];

  let currentStartLine: number | null = null;
  let currentLines: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (currentStartLine === null) {
      if (/^```mermaid(?:\s+.*)?\s*$/.test(line)) {
        currentStartLine = index + 1;
        currentLines = [];
      }
      continue;
    }

    if (/^```\s*$/.test(line)) {
      blocks.push({
        file,
        startLine: currentStartLine,
        content: currentLines.join('\n'),
      });
      currentStartLine = null;
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  if (currentStartLine !== null) {
    messages.push(`[mermaid] FAIL: ${file}:${currentStartLine} has an unclosed mermaid code fence`);
  }

  return { blocks, messages };
}

export async function checkMermaidSource(
  file: string,
  content: string,
): Promise<MermaidCheckResult> {
  const { blocks, messages } = extractMermaidBlocks(file, content);
  const mermaid = await getMermaidParser();

  for (const block of blocks) {
    try {
      await mermaid.parse(block.content);
    } catch (error) {
      const detail =
        error instanceof Error
          ? (error.message
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)[0] ?? error.message)
          : String(error);

      messages.push(
        `[mermaid] FAIL: ${block.file}:${block.startLine} invalid mermaid syntax (${detail})`,
      );
    }
  }

  return {
    failures: messages.length,
    messages,
    checkedBlocks: blocks.length,
  };
}

export async function checkMermaid(root: string): Promise<MermaidCheckResult> {
  const files = listMarkdownFiles(root);
  const messages: string[] = [];
  let checkedBlocks = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const result = await checkMermaidSource(file, content);
    messages.push(...result.messages);
    checkedBlocks += result.checkedBlocks;
  }

  return {
    failures: messages.length,
    messages,
    checkedBlocks,
  };
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');
  const result = await checkMermaid(root);

  for (const msg of result.messages) {
    console.error(msg);
  }

  if (result.failures > 0) {
    console.error(
      `\n[mermaid] ${result.failures} violation(s) found while checking ${result.checkedBlocks} mermaid block(s).`,
    );
    process.exit(1);
  }

  console.log(`[mermaid] All ${result.checkedBlocks} mermaid block(s) passed.`);
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-mermaid');
if (isDirectRun) {
  void main().catch((error) => {
    console.error(`[mermaid] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
