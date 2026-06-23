import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const DIST_DECLARATION_PATH = resolve(__dirname, '../../dist/modules/knowledge-read.d.ts');

describe('knowledge-read dist declaration contract', () => {
  it('emits the authoritative knowledgeProjection contract into dist', () => {
    expect(
      existsSync(DIST_DECLARATION_PATH),
      `Missing ${DIST_DECLARATION_PATH}; run \`rtk pnpm --filter @trapmap/backend-core build\` before this guard.`,
    ).toBe(true);

    const declaration = readFileSync(DIST_DECLARATION_PATH, 'utf8');

    expect(declaration).toContain(
      'knowledgeProjection: KnowledgeReadProjectionPort<KnowledgeEntryRecord>;',
    );
    expect(declaration).toContain('retrievalQuery: RetrievalQueryPort;');
    expect(declaration).toContain(
      'export declare function createKnowledgeReadModule(deps: KnowledgeReadDeps): KnowledgeReadPort;',
    );
    expect(declaration).not.toContain('knowledgeRepo');
    expect(declaration).not.toContain('listByFilter');
  });
});
