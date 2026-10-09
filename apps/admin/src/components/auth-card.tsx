import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  /** A hero graphic (see illustrations.tsx) — screens that pass one get the richer two-panel layout;
      screens that don't (simple states like "unavailable") keep the plain full-bleed screen. */
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

/** Decorative color fields, desktop/tablet only (sm+) — on a phone they'd just be background showing
    around the edges of a "card", which is exactly the web-page look this is meant to avoid. */
function BackgroundBlobs(): React.JSX.Element {
  return (
    <>
      <span className="pointer-events-none absolute -top-24 -left-24 hidden h-96 w-96 rounded-full bg-brand-300 opacity-35 blur-3xl sm:block" />
      <span className="pointer-events-none absolute -right-20 -bottom-28 hidden h-80 w-80 rounded-full bg-accent-300 opacity-35 blur-3xl sm:block" />
    </>
  );
}

/**
 * The shared frame every auth screen renders inside — Lytro commerce's own identity (not Lytronix's).
 * Phones get a true full-bleed app screen (no floating card, no visible page around it — content fills the
 * viewport edge to edge); from the sm breakpoint up it becomes a centered card over a colored background,
 * which reads correctly as a website on a tablet/desktop instead of a stretched phone screen.
 */
export function AuthCard({
  title,
  subtitle,
  illustration,
  children,
  footer,
}: AuthCardProps): React.JSX.Element {
  if (!illustration) {
    return (
      <main className="relative isolate min-h-screen bg-white sm:flex sm:items-center sm:justify-center sm:bg-slate-50 sm:px-4 sm:py-10">
        <BackgroundBlobs />
        <div className="relative z-10 mx-auto flex min-h-screen w-full flex-col px-5 pt-10 pb-8 sm:min-h-0 sm:max-w-sm sm:px-0 sm:pt-0 sm:pb-0">
          <div className="mb-8 sm:mb-6 sm:flex sm:justify-center">
            <BrandMark />
          </div>
          <div className="flex flex-1 flex-col sm:flex-none sm:rounded-[28px] sm:bg-white/90 sm:p-8 sm:shadow-xl sm:shadow-slate-900/5 sm:ring-1 sm:ring-slate-900/5 sm:backdrop-blur-sm">
            <div className="mb-6 sm:text-center">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
              {subtitle ? (
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{subtitle}</p>
              ) : null}
            </div>
            {children}
            {footer ? (
              <div className="mt-6 text-sm text-slate-500 sm:text-center">{footer}</div>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-screen bg-white sm:flex sm:items-center sm:justify-center sm:bg-slate-50 sm:px-4 sm:py-10">
      <BackgroundBlobs />
      <div className="relative z-10 flex min-h-screen w-full flex-col sm:min-h-0 sm:max-w-4xl sm:flex-row sm:overflow-hidden sm:rounded-4xl sm:bg-white/95 sm:shadow-2xl sm:shadow-slate-900/10 sm:ring-1 sm:ring-slate-900/5 sm:backdrop-blur-sm md:min-h-128">
        <div className="relative flex shrink-0 items-center justify-center overflow-hidden bg-linear-to-br from-brand-500 to-brand-700 px-6 py-6 sm:w-5/12 sm:p-10">
          <div className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-white/10 sm:-top-8 sm:-right-8 sm:h-32 sm:w-32" />
          <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-accent-400/20 blur-2xl sm:-bottom-10 sm:-left-10 sm:h-36 sm:w-36" />
          {illustration}
        </div>
        <div className="flex w-full flex-1 flex-col justify-center px-5 pt-8 pb-8 sm:p-8 md:p-10">
          <div className="mb-5 sm:hidden">
            <BrandMark compact />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{subtitle}</p>
          ) : null}
          <div className="mt-6 flex-1">{children}</div>
          {footer ? <div className="mt-6 text-sm text-slate-500">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
