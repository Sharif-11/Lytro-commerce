import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useOperatorSignOut } from '@/api/operator-auth';
import { Icon, LanguageToggle, Wordmark } from '@lytronix/ui';
import { navItems } from './nav-items';

/**
 * The console's chrome (BRAND-IDENTITY §8.4): a fixed sidebar from 1024 px with the OPERATOR eyebrow over
 * the wordmark, the destinations and sign-out; below that a top bar with a menu button that opens the same
 * list as a sheet. Container: it owns the sign-out mutation and the sheet state.
 */
export function ConsoleShell({ children }: { children: ReactNode }): React.JSX.Element {
  const { t } = useTranslation();
  const signOut = useOperatorSignOut();
  const [open, setOpen] = useState(false);

  const nav = (onPick: () => void) => (
    <nav className="space-y-0.5" aria-label={t('nav.primary')}>
      {navItems.map((item) => (
        <Link
          key={item.section}
          to={item.to}
          onClick={onPick}
          className="flex min-h-11 items-center gap-3 rounded-control px-3 text-[14px] font-semibold text-fg-muted hover:bg-surface-hover hover:text-fg"
          activeProps={{ className: 'bg-surface-alt text-brand-300' }}
        >
          <Icon name={item.icon} size={20} />
          {t(item.labelKey)}
        </Link>
      ))}
    </nav>
  );

  const signOutButton = (
    <button
      type="button"
      onClick={() => {
        signOut.mutate();
      }}
      disabled={signOut.isPending}
      className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-[14px] font-semibold text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-60"
    >
      <Icon name="logout" size={20} />
      {t('common.signOut')}
    </button>
  );

  return (
    <div className="min-h-screen bg-chrome text-fg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-chrome lg:flex">
        <div className="px-5 pt-5 pb-4">
          <p className="eyebrow">{t('shell.eyebrow')}</p>
          <div className="mt-1">
            <Wordmark height={26} tone="light" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">{nav(() => undefined)}</div>
        <div className="space-y-3 border-t border-line p-3">
          <div className="px-3">
            <LanguageToggle />
          </div>
          {signOutButton}
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-line bg-chrome/95 backdrop-blur-md lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            aria-label={t('nav.menu')}
            aria-expanded={open}
            aria-controls="console-menu"
            onClick={() => {
              setOpen((value) => !value);
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-control text-fg hover:bg-surface-hover"
          >
            <Icon name={open ? 'x' : 'menu'} size={22} />
          </button>
          <div className="flex items-center gap-2">
            <span className="eyebrow">{t('shell.eyebrow')}</span>
            <Wordmark height={22} tone="light" />
          </div>
          <div className="ml-auto">
            <LanguageToggle />
          </div>
        </div>
      </header>
      <div
        id="console-menu"
        hidden={!open}
        className="fixed inset-x-0 top-14 bottom-0 z-40 overflow-y-auto border-t border-line bg-chrome p-3 lg:hidden"
      >
        {nav(() => {
          setOpen(false);
        })}
        <div className="mt-3 border-t border-line pt-3">{signOutButton}</div>
      </div>

      <main className="lg:pl-64">{children}</main>
    </div>
  );
}
