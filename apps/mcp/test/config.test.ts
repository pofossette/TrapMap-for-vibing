import { describe, expect, it } from 'vitest';

import { loadMcpConfig } from '../src/config.js';

describe('loadMcpConfig', () => {
  it('throws when TRAPMAP_ACCESS_TOKEN is missing', () => {
    expect(() => loadMcpConfig({})).toThrow();
  });

  it('defaults gateway URL to the local light profile', () => {
    const cfg = loadMcpConfig({ TRAPMAP_ACCESS_TOKEN: 't' });
    expect(cfg.gatewayUrl).toBe('http://127.0.0.1:4000');
    expect(cfg.accessToken).toBe('t');
  });

  it('accepts an explicit TRAPMAP_GATEWAY_URL', () => {
    const cfg = loadMcpConfig({
      TRAPMAP_GATEWAY_URL: 'https://gateway.example.com',
      TRAPMAP_ACCESS_TOKEN: 't',
    });
    expect(cfg.gatewayUrl).toBe('https://gateway.example.com');
  });

  it('rejects invalid gateway URLs', () => {
    expect(() =>
      loadMcpConfig({ TRAPMAP_GATEWAY_URL: 'not-a-url', TRAPMAP_ACCESS_TOKEN: 't' }),
    ).toThrow();
  });
});
