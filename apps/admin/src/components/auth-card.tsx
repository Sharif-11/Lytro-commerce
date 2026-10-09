import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  /** A hero graphic (see illustrations.tsx) — screens that pass one get the richer two-panel layout;
      screens that don't (simple states like "unavailable") keep the plain centered card. */
  illustration?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

function BrandMark({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 font-bold text-white shadow-md shadow-brand-600/30 ${
          compact ? 'h-8 w-8 text-sm' : 'h-9 w-9 text-base'
        }`}
      >
        L
      </span>
      <span
        className={`font-bold tracking-tight text-slate-900 ${compact ? 'text-base' : 'text-lg'}`}
      >
        {t('common.appName')}
      </span>
    </div>
  );
}

/** The shared frame every auth screen renders inside — Lytro commerce's own identity (not Lytronix's),
    reused by every screen in this flow. Mobile-first: the illustration panel sits above the form on small
    screens and becomes a side panel from md breakpoints up. */
export function AuthCard({
  title,
  subtitle,
  illustration,
  children,
  footer,
}: AuthCardProps): React.JSX.Element {
  if (!illustration) {
    return (
      <main className="auth-background-blobs relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
        <div className="relative z-10 w-full max-w-sm">
          <div className="mb-6 flex items-center justify-center">
            <BrandMark />
          </div>
          <div className="rounded-[28px] bg-white/90 p-6 shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
              {subtitle ? (
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{subtitle}</p>
              ) : null}
            </div>
            {children}
            {footer ? (
              <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-background-blobs relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-4xl bg-white/95 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5 backdrop-blur-sm md:min-h-128 md:flex-row">
        <div className="relative flex items-center justify-center overflow-hidden bg-linear-to-br from-brand-500 to-brand-700 px-6 py-10 md:w-5/12 md:p-10">
          <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-accent-400/20 blur-2xl" />
          {illustration}
        </div>
        <div className="flex w-full flex-col justify-center p-6 sm:p-8 md:p-10">
          <div className="mb-5 md:hidden">
            <BrandMark compact />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{subtitle}</p>
          ) : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 text-sm text-slate-500">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
