'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { LiveProvider } from './live-provider';
import { ThemeApplier } from './theme-toggle';
import { Toaster } from './toaster';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeApplier />
      <LiveProvider>
        {children}
        <Toaster />
      </LiveProvider>
    </QueryClientProvider>
  );
}
