import { describe, expect, it } from 'vitest';

import { createExperienceGeneFixture } from '../../testing/experience-gene-fixtures.js';
import { scanExperienceGeneSafety } from './experience-gene-safety.js';

describe('experience gene safety scanner', () => {
  it('detects forbidden material without returning the secret value', () => {
    const gene = createExperienceGeneFixture();
    const issues = scanExperienceGeneSafety({
      ...gene,
      summary: 'password=hunter2 and use /Users/alice/secret.txt',
      signalsMatch: ['authorization: Bearer abc123', 'assistant: hidden transcript'],
      strategy: ['eval(function(){})'],
      avoid: ['-----BEGIN RSA PRIVATE KEY-----'],
      validation: ['tenant_id=acme-corp'],
    });
    const codes = issues.map((issue) => issue.code);

    expect(codes).toEqual([
      'safety-secret',
      'safety-private-path',
      'safety-bearer-token',
      'safety-chat-transcript',
      'safety-executable-body',
      'safety-private-key',
      'safety-tenant-id',
    ]);
    for (const issue of issues) {
      expect(issue.message.toLowerCase()).not.toContain('hunter2');
      expect(issue.message).not.toContain('/Users/alice/secret.txt');
    }
  });
});
