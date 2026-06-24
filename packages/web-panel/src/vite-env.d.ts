/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_PANEL_API_MODE?: 'real' | 'mock';
  readonly VITE_ADMIN_PANEL_API_BASE_URL?: string;
}
