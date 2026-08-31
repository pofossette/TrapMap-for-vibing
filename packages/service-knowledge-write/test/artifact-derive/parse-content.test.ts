import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '../../src/artifact-derive/parse-content.js';

describe('parseFrontmatter', () => {
  it('extracts title, labels, and version from frontmatter', () => {
    const result = parseFrontmatter(`---
title: My Skill
labels:
  - devops
version: 1.2.3
---
# Body
`);

    expect(result).toEqual({
      title: 'My Skill',
      labels: ['devops'],
      version: '1.2.3',
    });
  });

  it('returns null version when frontmatter has no version field', () => {
    const result = parseFrontmatter(`---
title: My Skill
labels:
  - devops
---
# Body
`);

    expect(result.version).toBeNull();
  });

  it('returns null version when content has no frontmatter', () => {
    const result = parseFrontmatter('# Body only\n');
    expect(result.version).toBeNull();
    expect(result.title).toBeNull();
  });

  it('returns null version for non-string version values', () => {
    const result = parseFrontmatter(`---
title: My Skill
version: 1
---
# Body
`);

    expect(result.version).toBeNull();
  });

  it('returns null version for empty version strings', () => {
    const result = parseFrontmatter(`---
title: My Skill
version: ""
---
# Body
`);

    expect(result.version).toBeNull();
  });
});
