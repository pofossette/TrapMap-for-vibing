import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(currentDir, '../..');
const css = readFileSync(path.join(packageRoot, 'src/styles/index.css'), 'utf8');
const tailwindConfig = readFileSync(path.join(packageRoot, 'tailwind.config.ts'), 'utf8');

describe('web panel design tokens', () => {
  it('maps the approved dark-first visual language', () => {
    expect(css).toContain('Inter:wght@400;500;600;700');
    expect(css).toContain('JetBrains+Mono:wght@400;500');
    expect(css).toContain('--panel-accent: #faff69');
    expect(css).toContain('--panel-accent-contrast: #0a0a0a');
    expect(css).toContain('--panel-radius-sm: 6px');
    expect(css).toContain('--panel-radius-md: 8px');
    expect(css).toContain('--panel-radius-lg: 12px');
    expect(css).toContain('--panel-control-height: 40px');
    expect(tailwindConfig).toContain('"Inter"');
    expect(tailwindConfig).toContain('"JetBrains Mono"');
  });

  it('does not retain retired font or blue accent defaults', () => {
    expect(css).not.toContain('Geist');
    expect(css).not.toContain('#0070f3');
    expect(tailwindConfig).not.toContain('IBM Plex Sans');
    expect(tailwindConfig).not.toContain('IBM Plex Mono');
  });
});
