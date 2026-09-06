import { Button, toast } from '@heroui/react';
import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import { PageContainer, SectionHeader } from '@trapmap/web-panel/shared/ui';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import { useSessionStore } from '@trapmap/web-panel/stores/session-store';
import { type ReactElement, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function LoginPage(): ReactElement {
  const { t } = useI18nStore();
  const navigate = useNavigate();
  const sessionRequest = useSessionStore((state) => state.request);
  const setSession = useSessionStore((state) => state.setSession);
  const setError = useSessionStore((state) => state.setError);

  const [accessKey, setAccessKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setLocalError] = useState<string | null>(null);

  const isAuthenticated = sessionRequest.payload?.authenticated ?? false;

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async () => {
    const trimmed = accessKey.trim();
    if (trimmed.length < 16) {
      setLocalError(t('loginFailed'));
      return;
    }
    setSubmitting(true);
    setLocalError(null);
    try {
      const session = await getAdminPanelApi().login({ accessKey: trimmed });
      setSession(session);
      toast.success(t('loginSuccess'));
      navigate('/', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('loginFailed');
      setLocalError(message);
      setError(message);
      toast.danger(t('loginFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel-bg p-6">
      <PageContainer className="w-full max-w-md">
        <div className="rounded-2xl border border-panel-line bg-panel-surface p-8 shadow-panel">
          <SectionHeader description={t('loginDesc')} title={t('loginTitle')} />
          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-panel-muted" htmlFor="accessKey">
                {t('accessKeyLabel')}
              </label>
              <input
                className="w-full rounded-panel-md border border-panel-line bg-panel-surface-strong px-3 py-2.5 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent"
                id="accessKey"
                onChange={(event) => setAccessKey(event.target.value)}
                placeholder={t('accessKeyPlaceholder')}
                type="password"
                value={accessKey}
              />
            </div>
            {error ? <p className="text-xs text-rose-500">{error}</p> : null}
            <Button
              className="w-full"
              isDisabled={submitting || accessKey.trim().length < 16}
              onPress={() => void handleLogin()}
              variant="primary"
            >
              {submitting ? t('loggingIn') : t('loginButton')}
            </Button>
            <p className="text-xs leading-5 text-panel-muted">{t('authRequired')}</p>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
