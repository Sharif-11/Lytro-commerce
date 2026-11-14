import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './index.css';
import './i18n';
// TEN-17: catches the browser's install offer, which can come before the Menu opens.
import './lib/install-prompt';
import { errorTracking } from './lib/error-tracking';
import { createQueryClient } from './lib/query-client';
import { serviceWorker } from './lib/service-worker';
import { router } from './router';
import { tenantSession } from './session/tenant-session';

// OBS-03 (Slice 9.6): before anything else runs, so an error at start is reported too.
errorTracking.start();

// D9-14 (Slice 9.9): it also hears a save refused while changes can't be saved, for the banner.
const queryClient = createQueryClient();

// The one auth-init check (a /me call) every protected screen waits on (session/tenant-session.ts).
void tenantSession.init();

// NTF-02, NTF-07: offline starts, pushes and the update prompt; vite-plugin-pwa makes the worker in a built app only.
if (import.meta.env.PROD) serviceWorker.register();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

createRoot(root, {
  // What a screen's error boundary caught is reported as well; React still logs it as it would. One nobody caught
  // reaches the page's own error handler, which reports it.
  onCaughtError: (error, info) => {
    errorTracking.capture(error);
    console.error(error, info.componentStack);
  },
}).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
