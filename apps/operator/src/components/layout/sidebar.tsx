import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useOperatorMe, useOperatorSignOut } from '@/api/operator-auth';
import type { ShellCounts } from '@/api/shell-counts';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { SoonTag } from '@/components/ui/console-page';
import { CountBadge } from './count-badge';
import { ConsoleWordmark, Eyebrow, OperatorTile } from './lockup';
import { navGroups, type NavItem } from './nav-items';

const ITEM =
  'relative flex h-[38px] w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-neutral-700 hover:bg-neutral-50';

function SidebarLink({
  item,
  later,
  count,
}: {
  item: NavItem;
  later: boolean;
  count: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Link
      to={item.to}
      className={`${ITEM} font-medium`}
      activeProps={{
        className:
          'bg-brand-50! font-semibold! text-brand-800! before:absolute before:top-2 before:bottom-2 before:-left-2.5 before:w-[3px] before:rounded-r-[3px] before:bg-primary',
      }}
    >
      <ConsoleIcon name={item.icon} size={18} />
      <span className="min-w-0 truncate">{t(item.labelKey)}</span>
      {later ? (
        <span className="ml-auto">
          <SoonTag dashed />
        </span>
      ) : (
        <CountBadge count={count} className="ml-auto h-5 min-w-5 px-1.5 text-[11px]" />
      )}
    </Link>
  );
}

/** The sidebar from 1024 px: the ink head, the destinations in their groups, and who is signed in. */
export function Sidebar({ counts }: { counts: ShellCounts }): React.JSX.Element {
  const { t } = useTranslation();
  const me = useOperatorMe();
  const signOut = useOperatorSignOut();
  const email = me.data?.email;
  return (
    <aside className="hidden min-h-0 w-[248px] flex-none flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 flex-none items-center gap-2.5 bg-chrome px-4 text-white">
        <OperatorTile size={36} />
        <span className="flex flex-col gap-0.5 leading-[1.1]">
          <Eyebrow />
          <ConsoleWordmark size={19} />
        </span>
      </div>
      <nav aria-label={t('nav.primary')} className="flex-1 overflow-auto px-2.5 py-3">
        {navGroups.map((group) => (
          <div key={group.labelKey}>
            <div className="px-2.5 pt-3 pb-1.5 text-[11px] font-bold tracking-[0.08em] text-neutral-700 uppercase bn:text-[12px] bn:tracking-normal bn:normal-case">
              {t(group.labelKey)}
            </div>
            {group.items.map((item) => (
              <SidebarLink
                key={item.to}
                item={item}
                later={group.later ?? false}
                count={item.count ? counts[item.count] : 0}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-2.5 border-t border-line px-4 py-3 text-[13px]">
        <span className="flex size-8 flex-none items-center justify-center rounded-full bg-ink text-[13px] font-bold text-accent-300 uppercase">
          {email?.charAt(0)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {email ? (
            <b className="truncate font-semibold">{email}</b>
          ) : (
            <span className="skel my-[3px] w-4/5" />
          )}
          <span className="text-[12px] text-fg-muted">
            {t('nav.account')} ·{' '}
            <Link to="/account" className="text-primary underline">
              {t('shell.open')}
            </Link>
          </span>
        </span>
        <button
          type="button"
          title={t('common.signOut')}
          aria-label={t('common.signOut')}
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
          className="inline-flex size-9 flex-none items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100"
        >
          <ConsoleIcon name="logout" />
        </button>
      </div>
    </aside>
  );
}
