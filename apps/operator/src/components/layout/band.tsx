import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleWordmark, Eyebrow, OperatorTile } from './lockup';
import { bandTitleKey } from './nav-items';

const BUTTON =
  'inline-flex size-11 flex-none items-center justify-center rounded-lg text-neutral-200';

/** The ink band under 1024 px: the one cue that this is the operator's console, with search and the menu. */
export function Band({ onMenu }: { onMenu: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const titleKey = bandTitleKey(pathname);
  return (
    <header className="flex h-[52px] flex-none items-center gap-3 bg-chrome pr-3 pl-4 text-white lg:hidden">
      <span className="flex min-w-0 items-center gap-2.5">
        <OperatorTile size={32} />
        <span className="flex min-w-0 flex-col gap-0.5 leading-[1.1]">
          <Eyebrow />
          {titleKey ? (
            <span className="truncate font-display text-[16px] font-extrabold tracking-[-0.02em] text-white">
              {t(titleKey)}
            </span>
          ) : (
            <ConsoleWordmark size={17} />
          )}
        </span>
      </span>
      <span className="flex-1" />
      <Link to="/tenants" aria-label={t('shell.searchOpen')} className={BUTTON}>
        <ConsoleIcon name="search" />
      </Link>
      <button type="button" aria-label={t('nav.menu')} onClick={onMenu} className={BUTTON}>
        <ConsoleIcon name="menu" />
      </button>
    </header>
  );
}
