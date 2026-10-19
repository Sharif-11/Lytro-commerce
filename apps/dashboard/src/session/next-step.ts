import type { useNavigate } from '@tanstack/react-router';
import type { NextStep } from '@/types/auth';

type Navigate = ReturnType<typeof useNavigate>;

/**
 * Where a successful verify/sign-in/OAuth response sends the person next (API-CONTRACT §2's `next`). Written
 * with no default case so a new NextStep value is a compile error here, not a silent no-op. `dashboard`,
 * `renewal` and `unavailable` all go through /shops, which reads /me and lands on the person's shop (TEN-31):
 * the shop layout then shows the renewal or unavailable state itself, since it needs the tenant to do so.
 */
export function navigateForNextStep(navigate: Navigate, next: NextStep): void {
  switch (next) {
    case 'create-shop':
      void navigate({ to: '/create-shop' });
      return;
    case 'set-password':
      void navigate({ to: '/set-password', search: { required: true } });
      return;
    case 'dashboard':
    case 'renewal':
    case 'unavailable':
      void navigate({ to: '/shops' });
      return;
  }
}
