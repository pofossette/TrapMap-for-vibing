/**
 * Contract for resolving gateway URL and session credentials.
 *
 * Hosts (CLI, web panel, test harness) implement this interface to inject
 * their own state management.  The client-core transport layer never owns
 * credentials or URLs directly -- it always reads them from a provider.
 */
export interface SessionProvider {
  /** Base URL of the TrapMap gateway (no trailing slash, e.g. "http://127.0.0.1:4000"). */
  getBaseUrl(): string;

  /** Return the current bearer session token, or null when unauthenticated. */
  getSessionToken(): string | null;
}
