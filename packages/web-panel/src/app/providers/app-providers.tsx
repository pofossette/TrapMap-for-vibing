import { Toast } from '@heroui/react';
import type { PropsWithChildren, ReactElement } from 'react';

export function AppProviders({ children }: PropsWithChildren): ReactElement {
  return (
    <>
      <Toast.Provider />
      {children}
    </>
  );
}
