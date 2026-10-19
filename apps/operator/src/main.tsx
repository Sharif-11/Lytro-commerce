import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './index.css';
import './i18n';
import { ApiClientError } from '@lytronix/api-client';
import { router } from './router';
import { operatorSession } from './session/operator-session';

// There is no /me for operators, so an expired cookie shows up as a 401 on whatever call runs next: that is
// the one place the session is cleared and the console returns to sign-in (SEC-14 session expiry).
function onUnauthenticated(error: unknown): void {
  if (error instanceof ApiClientError && error.status === 401 && operatorSession.isSignedIn()) {
    operatorSession.clear();
    void router.navigate({ to: '/sign-in' });
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onUnauthenticated }),
  mutationCache: new MutationCache({ onError: onUnauthenticated }),
});

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
