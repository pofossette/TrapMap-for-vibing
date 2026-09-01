/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_PANEL_API_MODE?: 'real' | 'mock';
  readonly VITE_ADMIN_PANEL_API_BASE_URL?: string;
  /**
   * Gateway session transport preference for web-panel.
   * - `cookie` — prefer gateway httpOnly cookie (`credentials:'include'`, `trapmap_session`) over insecure bearer persistence
   * - `bearer` — force bearer `Authorization` header (default, but insecure persistence warning applies)
   * When `cookie` is set or `document.cookie` already contains `trapmap_session`, the panel sends `credentials:'include'`
   * and treats bearer token in store as fallback only. When undefined, bearer is kept but documented as insecure.
   */
  readonly VITE_ADMIN_PANEL_SESSION_MODE?: 'cookie' | 'bearer';
}
