import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './index.css';
import './i18n';
import { ApiClientError } from '@lytronix/api-client';
import { router } from './router';
import { operatorSession } from './session/operator-session';

// An expired cookie shows up as a 401 on whatever call runs next: that is the one place the session is cleared and the
// console returns to sign-in (SEC-14 session expiry).
function onUnauthenticated(error: unknown): void {
  if (error instanceof ApiClientError && error.status === 401 && operatorSession.isSignedIn()) {
    operatorSession.clear();
    void router.navigate({ to: '/sign-in' }).then(() => {
      queryClient.clear();
    });
  }
}

// A refusal won't change on a second try, so an expired session returns to sign-in at once; a server that didn't answer
// gets two more chances before the screen says so.
const MORE_TRIES = 2;

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failures, error) =>
        failures < MORE_TRIES && !(error instanceof ApiClientError && error.status < 500),
    },
  },
  queryCache: new QueryCache({ onError: onUnauthenticated }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // A step-up's 401 is a mistyped password or code: the session is fine, and the panel says what was wrong.
      if (mutation.meta?.stepUp !== true) onUnauthenticated(error);
    },
  }),
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
