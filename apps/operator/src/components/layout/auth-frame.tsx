import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Wordmark } from '@/components/brand/wordmark';
import { LanguageToggle } from '@/components/ui/language-toggle';

/** The sign-in screens' frame: the OPERATOR eyebrow and wordmark, one card, nothing else. */
export function AuthFrame({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col bg-chrome text-fg">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div>
          <p className="eyebrow">{t('shell.eyebrow')}</p>
          <Wordmark height={24} tone="light" />
        </div>
        <LanguageToggle />
      </header>
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-4 pt-6 pb-10">
        <section className="rounded-sheet border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="heading text-[24px] text-fg">{title}</h1>
          {lead ? <p className="mt-2 text-[14px] text-fg-muted">{lead}</p> : null}
          <div className="mt-6">{children}</div>
        </section>
        <p className="mt-6 text-center text-[12px] text-fg-muted">{t('shell.footer')}</p>
      </div>
    </main>
  );
}
