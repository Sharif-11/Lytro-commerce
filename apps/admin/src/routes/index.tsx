import { createFileRoute, redirect } from '@tanstack/react-router';
import { isOperatorHost } from '@/host';

// Caddy only forwards the bare "/" path to this app on admin.<platform domain> (docs/DEPLOYMENT.md §5) — the
// tenant-facing host never reaches this route at all, since only /sign-up, /sign-in and /dashboard* are routed
// here there. This redirect exists for the operator host's root, and as a safe fallback otherwise.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: isOperatorHost() ? '/operator/sign-in' : '/sign-in' });
  },
});
