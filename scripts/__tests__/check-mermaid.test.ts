import { describe, expect, it } from 'vitest';
import { checkMermaidSource, extractMermaidBlocks } from '../check-mermaid';

describe('extractMermaidBlocks', () => {
  it('extracts mermaid blocks with their fence line numbers', () => {
    const source = [
      '# Title',
      '',
      '```mermaid',
      'flowchart TD',
      '  A --> B',
      '```',
      '',
      '```ts',
      'console.log("ignore");',
      '```',
    ].join('\n');

    const result = extractMermaidBlocks('docs/test.md', source);

    expect(result.messages).toEqual([]);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      file: 'docs/test.md',
      startLine: 3,
      content: 'flowchart TD\n  A --> B',
    });
  });

  it('reports unclosed mermaid fences', () => {
    const source = ['```mermaid', 'flowchart TD', '  A --> B'].join('\n');

    const result = extractMermaidBlocks('docs/broken.md', source);

    expect(result.blocks).toEqual([]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain('unclosed mermaid code fence');
    expect(result.messages[0]).toContain('docs/broken.md:1');
  });
});

describe('checkMermaidSource', () => {
  it('passes valid mermaid syntax', async () => {
    const source = ['```mermaid', 'flowchart TD', '  A --> B', '```'].join('\n');

    const result = await checkMermaidSource('docs/ok.md', source);

    expect(result.failures).toBe(0);
    expect(result.messages).toEqual([]);
    expect(result.checkedBlocks).toBe(1);
  });

  it('fails invalid mermaid syntax', async () => {
    const source = ['```mermaid', 'flowchart TD', '  A -> B', '```'].join('\n');

    const result = await checkMermaidSource('docs/bad.md', source);

    expect(result.failures).toBe(1);
    expect(result.checkedBlocks).toBe(1);
    expect(result.messages[0]).toContain('docs/bad.md:1');
    expect(result.messages[0]).toContain('invalid mermaid syntax');
  });
});
