import Link from 'next/link';

/** A plain link to /sign-in, not a cross-origin URL — on lytro.com that path is served by apps/admin's own
    static build, routed by Caddy on the same host (docs/DEPLOYMENT.md §5). Both the CTA and the login link
    point at /sign-in, not a separate /sign-up: AUTH-12 makes sign-in the one entry point for both a new and
    an existing phone number, so there is no dedicated sign-up screen to link to (DEPLOYMENT.md's routing
    table still lists /sign-up* among the paths proxied to admin — reserved, but nothing in apps/admin
    actually answers it yet). */
export function Nav(): React.JSX.Element {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
            L
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">Lytro</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/sign-in"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            লগইন
          </Link>
          <Link
            href="/sign-in"
            className="rounded-xl bg-linear-to-br from-brand-500 to-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25"
          >
            দোকান শুরু করুন
          </Link>
        </nav>
      </div>
    </header>
  );
}
