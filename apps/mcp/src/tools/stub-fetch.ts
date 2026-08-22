import { vi } from 'vitest';

/** Shared fetch stub for MCP tool tests: records calls, returns a JSON ok/error. */
export function stubFetchCapture(
  respond: (url: string, init?: RequestInit) => Response = (url) =>
    new Response(JSON.stringify({ ok: true, url }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
): Array<{ url: string; init?: RequestInit }> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = vi.fn(async (input: string | URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond(String(input), init);
  }) as typeof fetch;
  return calls;
}
