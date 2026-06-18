/**
 * Unified gateway API error.
 *
 * Thrown by {@link apiRequest} when the server returns a non-2xx status or
 * when the response body cannot be parsed as JSON.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly payload: unknown,
    message: string,
  ) {
    super(message);
  }
}
