import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** The shared frame every auth screen renders inside — mobile-first centered card, Lytro commerce's own
    identity (not Lytronix's), reused by every screen in this flow. */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main className="auth-background-blobs relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-base font-bold text-white shadow-md shadow-brand-600/30">
            L
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            {t('common.appName')}
          </span>
        </div>

        <div className="rounded-[28px] bg-white/90 p-6 shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          {children}
          {footer ? <div className="mt-6 text-center text-sm text-slate-500">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
