import { type ReactElement, useEffect } from 'react';

import { AppProviders } from '@trapmap/web-panel/app/providers/app-providers';
import { AppRouter } from '@trapmap/web-panel/app/router/router';
import { useThemeStore } from '@trapmap/web-panel/stores/theme-store';

export function Bootstrap(): ReactElement {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
