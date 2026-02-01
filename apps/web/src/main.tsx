import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { AuthProvider } from './app/AuthContext';
import { queryClient } from './app/queryClient';
import { router } from './app/router';
import { ThemeProvider } from './app/ThemeContext';
import type { StatusResponse } from './api/types';
import './styles.css';

declare global {
  var __UPTIMER_INITIAL_STATUS__: StatusResponse | undefined;
}

const initialStatus = globalThis.__UPTIMER_INITIAL_STATUS__;
if (initialStatus) {
  // Seed React Query so the status page can render instantly on slow networks.
  // Use the server-provided timestamp so we don't hide stale data.
  const updatedAt =
    typeof initialStatus.generated_at === 'number' ? initialStatus.generated_at * 1000 : Date.now();

  queryClient.setQueryData<StatusResponse>(['status'], initialStatus, { updatedAt });
}

function PreloadCleanup() {
  // Remove the server-rendered preload right before the first paint with React,
  // avoiding a flash of duplicated content.
  React.useLayoutEffect(() => {
    document.getElementById('uptimer-preload')?.remove();
  }, []);

  return null;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PreloadCleanup />
          <RouterProvider
            router={router}
            fallbackElement={<div className="min-h-screen bg-slate-50 dark:bg-slate-900" />}
          />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
