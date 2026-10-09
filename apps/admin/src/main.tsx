import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './index.css';
import './i18n';
import { isOperatorHost } from './host';
import { router } from './router';
import { tenantSession } from './session/tenant-session';

const queryClient = new QueryClient();

// Only the tenant session has an auth-init check (a /me call) to run — the operator host has no protected
// screen yet that needs to wait on one (session/operator-session.ts).
if (!isOperatorHost()) {
  void tenantSession.init();
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
