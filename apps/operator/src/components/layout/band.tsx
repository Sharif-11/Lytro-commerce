import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleWordmark, Eyebrow, OperatorTile } from './lockup';
import { bandTitleKey } from './nav-items';

const BUTTON =
  'inline-flex size-11 flex-none items-center justify-center rounded-lg text-neutral-200';

type Back = { to: '/shops' | '/notices' } | { to: '/shops/$id' | '/notices/$id'; id: string };

/**
 * Where a page's back arrow goes, on the pages the sketch draws one: a shop's page and its credentials, and a notice's
 * pages (Slice 7.7), where who said I understand goes back to its notice and the rest to the list.
 */
function backOf(pathname: string): Back | null {
  const shop = /^\/shops\/([^/]+)(\/credentials)?$/.exec(pathname);
  if (shop?.[1]) return shop[2] ? { to: '/shops/$id', id: shop[1] } : { to: '/shops' };
  const notice = /^\/notices\/([^/]+)(\/edit|\/acknowledgments)?$/.exec(pathname);
  if (notice?.[1]) {
    return notice[2] === '/acknowledgments'
      ? { to: '/notices/$id', id: notice[1] }
      : { to: '/notices' };
  }
  return null;
}

/** The ink band under 1024 px: the one cue that this is the operator's console, with search and the menu. */
export function Band({ onMenu }: { onMenu: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const titleKey = bandTitleKey(pathname);
  // A page inside Shops or Notices shows the way back in place of the lockup.
  const back = backOf(pathname);
  return (
    <header className="flex h-[52px] flex-none items-center gap-3 bg-chrome pr-3 pl-4 text-white lg:hidden">
      {back ? (
        <>
          {'id' in back ? (
            <Link
              to={back.to}
              params={{ id: back.id }}
              aria-label={t('common.back')}
              className={BUTTON}
            >
              <ConsoleIcon name="back" />
            </Link>
          ) : (
            <Link to={back.to} aria-label={t('common.back')} className={BUTTON}>
              <ConsoleIcon name="back" />
            </Link>
          )}
          <span className="min-w-0 truncate font-display text-[15px] font-extrabold tracking-[-0.02em] text-white">
            {titleKey ? t(titleKey) : null}
          </span>
        </>
      ) : (
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
      )}
      <span className="flex-1" />
      <Link to="/shops" aria-label={t('shell.searchOpen')} className={BUTTON}>
        <ConsoleIcon name="search" />
      </Link>
      <button type="button" aria-label={t('nav.menu')} onClick={onMenu} className={BUTTON}>
        <ConsoleIcon name="menu" />
      </button>
    </header>
  );
}
