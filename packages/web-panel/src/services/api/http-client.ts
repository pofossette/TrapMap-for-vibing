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
      const response = await apiRequest<T>(provider, options);
      return response.data;
    },
  };
}

export { ApiError };
