import type { useNavigate } from '@tanstack/react-router';
import type { NextStep } from '@/types/auth';

type Navigate = ReturnType<typeof useNavigate>;

/**
 * Where a successful verify/signin/OAuth-callback response sends the tenant next — shared by every place
 * that gets a NextStep back (OTP verify, password sign-in, OAuth callback). `renewal`/`purchase` are billing
 * states Phase 1 doesn't build screens for yet (plan subscription is Phase 2); they fall back to the same
 * placeholder as `unavailable`. No default case: adding a NextStep variant without updating this switch is a
 * compile error (every branch must return), not a silent no-op navigation.
 */
export function navigateForNextStep(navigate: Navigate, next: NextStep): void {
  switch (next) {
    case 'create-shop':
      void navigate({ to: '/create-shop' });
      return;
    case 'set-password':
      void navigate({ to: '/set-password', search: { required: false } });
      return;
    case 'dashboard':
      void navigate({ to: '/dashboard' });
      return;
    case 'renewal':
    case 'purchase':
    case 'unavailable':
      void navigate({ to: '/unavailable' });
      return;
  }
}
