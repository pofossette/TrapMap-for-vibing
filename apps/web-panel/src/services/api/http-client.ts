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
  const wrappedProvider: SessionProvider = {
    getBaseUrl: () => provider.getBaseUrl(),
    getSessionToken: () => provider.getSessionToken(),
    getFetchOptions: () => {
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
