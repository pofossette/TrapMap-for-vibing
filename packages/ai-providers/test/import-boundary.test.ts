import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AiPromptBlock, ChatProvider } from '../src/types.js';

describe('ai-providers import boundary', () => {
  it('has no compatibility or prompt-package imports', async () => {
    const source = await readFile(resolve(import.meta.dirname, 'index.ts'), 'utf8');

    expect(source).not.toContain('@trapmap/server');
    expect(source).not.toContain('/prompts');
    expect(source).not.toContain('/cache');
  });

  it('keeps a server-shaped prompt block assignable to ChatProvider', () => {
    const block: AiPromptBlock = { content: 'system instruction' };
    const provider: Pick<ChatProvider, 'invokeWithBlocks'> = {
      invokeWithBlocks: async (blocks) => blocks.map((item) => item.content).join('\n'),
    };

    expect(block.content).toBe('system instruction');
    expect(provider.invokeWithBlocks).toBeTypeOf('function');
  });
});
