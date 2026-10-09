// D8, ADM-01: one build, two route trees, picked by which host it's running on (docs/DEPLOYMENT.md §5). The
// tenant-facing host serves /sign-up, /sign-in, /dashboard*; admin.<platform domain> serves everything as the
// operator console. Override locally with VITE_OPERATOR_HOST when testing the operator tree on localhost.
const OPERATOR_HOST = import.meta.env.VITE_OPERATOR_HOST ?? 'admin.lytro.com';

export function isOperatorHost(): boolean {
  return window.location.hostname === OPERATOR_HOST;
}
