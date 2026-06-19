import { type ReactElement, useEffect } from 'react';

import { useThemeStore } from '../../stores/theme-store';
import { AppProviders } from '../providers/app-providers';
import { AppRouter } from '../router/router';

export function Bootstrap(): ReactElement {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
