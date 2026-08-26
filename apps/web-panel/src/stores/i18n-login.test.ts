import { beforeEach, describe, expect, it } from 'vitest';

import { useI18nStore } from './i18n-store';

describe('i18n login keys', () => {
  beforeEach(() => {
    useI18nStore.getState().setLanguage('en');
  });

  it('exposes login and RBAC keys in both languages', async () => {
    const { t } = useI18nStore.getState();
    expect(t('loginTitle')).toBe('Sign in to Admin Workspace');
    expect(t('noPermission')).toContain('permission');
    useI18nStore.getState().setLanguage('cn');
    const cn = useI18nStore.getState();
    expect(cn.t('loginTitle')).toBe('登录管理工作区');
    expect(cn.t('noPermission')).toContain('无权');
    expect(cn.t('loginFailed')).toContain('登录失败');
  });

  it('renders focus-visible and panel tokens are present', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const currentDir = join(fileURLToPath(import.meta.url), '..');
    const cssPath = join(currentDir, '../styles/index.css');
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain('*:focus-visible');
    expect(css).toContain('--panel-accent: #faff69');
    expect(css).toContain('--panel-radius-md: 8px');
  });
});
