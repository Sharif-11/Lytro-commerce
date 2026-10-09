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
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-white to-white px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-100 sm:p-8">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold tracking-wide text-brand-600 uppercase">
            {t('common.appName')}
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {children}
        {footer ? <div className="mt-6 text-center text-sm text-slate-500">{footer}</div> : null}
      </div>
    </main>
  );
}
