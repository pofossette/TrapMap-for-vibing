import { describe, expect, it } from 'vitest';

import { resolveListenOptions } from './resolve-listen-options.js';

describe('resolveListenOptions', () => {
  it('falls back to port 4000 when PORT is missing or invalid', () => {
    expect(resolveListenOptions({}, { PORT: undefined, HOST: undefined })).toEqual({
      host: '0.0.0.0',
      port: 4000,
    });

    expect(resolveListenOptions({}, { PORT: 'not-a-number', HOST: undefined })).toEqual({
      host: '0.0.0.0',
      port: 4000,
    });
  });

  it('prefers explicit options over environment values', () => {
    expect(
      resolveListenOptions({ port: 4100, host: '127.0.0.1' }, { PORT: '4200', HOST: 'localhost' }),
    ).toEqual({
      host: '127.0.0.1',
      port: 4100,
    });
  });
});
