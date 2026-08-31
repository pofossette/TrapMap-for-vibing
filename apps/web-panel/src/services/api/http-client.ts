import { type RequestOptions, type SessionProvider, apiRequest } from '@trapmap/client-core';

export type HttpClient = {
  request<T>(options: RequestOptions): Promise<T>;
};

function getCredentialsForToken(token: string | null | undefined): RequestCredentials | undefined {
  return token ? undefined : 'include';
}

export function createHttpClient(provider: SessionProvider): HttpClient {
  // Isolated per-request credentials without global fetch mutation.
  // Previously this wrapped `globalThis.fetch` to inject `credentials:'include'`
  // when no bearer token was present, which raced concurrent requests and
  // mutated global state. Now we expose the gateway cookie preference via
  // `SessionProvider.getFetchOptions()` and per-request `RequestOptions.credentials`
  // so `apiRequest` sends cookies per-call without touching globals.
  // Cookie preference branching: respect explicit provider.getFetchOptions() (e.g.
  // browserSessionProvider in VITE_ADMIN_PANEL_SESSION_MODE=cookie or when
  // trapmap_session cookie is present) before falling back to token-presence heuristic.
  const wrappedProvider: SessionProvider = {
    getBaseUrl: () => provider.getBaseUrl(),
    getSessionToken: () => provider.getSessionToken(),
    getFetchOptions: () => {
      const explicit = provider.getFetchOptions?.();
      if (explicit?.credentials) return explicit;
      const token = provider.getSessionToken();
      const credentials = getCredentialsForToken(token);
      return credentials ? { credentials } : {};
    },
  };

  return {
    async request<T>(options: RequestOptions): Promise<T> {
      const effectiveToken = options.sessionToken ?? provider.getSessionToken();
      const credentials = options.credentials ?? getCredentialsForToken(effectiveToken);
      const requestOptions: RequestOptions =
        credentials !== undefined ? { ...options, credentials } : options;
      const response = await apiRequest<T>(wrappedProvider, requestOptions);
      return response.data;
    },
  };
}
