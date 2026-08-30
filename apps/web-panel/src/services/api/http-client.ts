import {
  ApiError,
  type RequestOptions,
  type SessionProvider,
  apiRequest,
} from '@trapmap/client-core';

export type HttpClient = {
  request<T>(options: RequestOptions): Promise<T>;
};

export function createHttpClient(provider: SessionProvider): HttpClient {
  return {
    async request<T>(options: RequestOptions): Promise<T> {
      // Gateway cookie preference branch: when no bearer is present we still
      // want the browser to send httpOnly cookies, so we ensure fetch is
      // invoked with `credentials: 'include'`. The underlying `apiRequest`
      // uses the global fetch, so we temporarily wrap it to inject the option
      // when the provider has no token. This keeps the real transport
      // token-bearing while allowing the cookie fallback verified by the
      // 401 -> /login redirect path.
      const token = options.sessionToken ?? provider.getSessionToken();
      const shouldIncludeCredentials = !token;
      if (!shouldIncludeCredentials) {
        const response = await apiRequest<T>(provider, options);
        return response.data;
      }

      // Cookie path: wrap fetch to include credentials
      const originalFetch = globalThis.fetch;
      let wrappedFetch: typeof fetch | undefined;
      if (typeof originalFetch === 'function') {
        wrappedFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
          originalFetch(input, { ...init, credentials: 'include' })) as typeof fetch;
        // @ts-ignore - stub for apiRequest's internal fetch lookup
        globalThis.fetch = wrappedFetch;
      }
      try {
        const response = await apiRequest<T>(provider, options);
        return response.data;
      } catch (error) {
        // Re-throw as ApiError so that callers (withAuthRedirect) can detect 401
        if (error instanceof ApiError) throw error;
        throw error;
      } finally {
        if (wrappedFetch) {
          globalThis.fetch = originalFetch;
        }
      }
    },
  };
}
