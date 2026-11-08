import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMarkNotificationsRead, useNotifications } from '@/api/notifications';
import { Icon } from '@/components/icon';
import { useShell } from '@/shell/shell-context';
import { dayKey } from '@/lib/dates';
import type { NotificationView } from '@/types/notifications';
import { NotificationRow } from './bell-rows';
import { useOpenNotification } from './notification-words';

/** How many rows the panel holds; See all opens the rest. */
const PANEL_ROWS = 20;

/**
 * The bell (TENANT-DASHBOARD-DESIGN §7.40, Part 37's `p37-bell`; NTF-01): in both bars on every screen, its badge the
 * unread count; it opens the panel of the newest notifications, Today and Earlier.
 */
export function BellButton({ variant }: { variant: 'bar' | 'desk' }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const [open, setOpen] = useState(false);
  const list = useNotifications({ limit: PANEL_ROWS });
  const unread = list.data?.pages[0]?.unread ?? 0;
  return (
    <>
      <button
        type="button"
        aria-label={unread ? `${t('ntTitle')} · ${t('ntNew', { n: unread })}` : t('ntTitle')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
        className={
          variant === 'bar'
            ? 'relative inline-flex size-11 items-center justify-center rounded-button text-fg-muted'
            : 'relative inline-flex size-10 items-center justify-center rounded-button border border-line text-fg-muted'
        }
      >
        <Icon name="bell" />
        {unread ? (
          <span
            className={
              variant === 'bar'
                ? 'num absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-on-primary'
                : 'num absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-[5px] text-[11px] font-semibold text-on-primary'
            }
          >
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <BellPanel
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/** The panel (the prototype's `.npop`): Today and Earlier, Mark all read, the switches, See all, kept for 30 days. */
function BellPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { slug, showToast } = useShell();
  const list = useNotifications({ limit: PANEL_ROWS });
  const mark = useMarkNotificationsRead();
  const open = useOpenNotification();
  const rows = list.data?.pages[0]?.items ?? [];
  const unread = list.data?.pages[0]?.unread ?? 0;
  const todayKey = dayKey(new Date().toISOString());
  const todays = rows.filter((row) => dayKey(row.createdAt) === todayKey);
  const earlier = rows.filter((row) => dayKey(row.createdAt) !== todayKey);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const choose = (notification: NotificationView): void => {
    open(notification);
    onClose();
  };
  const group = (label: string, items: NotificationView[]): React.JSX.Element | null =>
    items.length === 0 ? null : (
      <>
        <div className="px-4 pt-2.5 pb-1 text-[12px] font-bold tracking-[0.04em] text-neutral-700 uppercase [html[lang=bn]_&]:text-[13px] [html[lang=bn]_&]:tracking-normal [html[lang=bn]_&]:normal-case">
          {label}
        </div>
        {items.map((row) => (
          <NotificationRow key={row.id} notification={row} onOpen={choose} />
        ))}
      </>
    );

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-end bg-[rgba(16,32,31,0.28)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('ntTitle')}
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="relative mx-2 mt-[62px] flex max-h-[calc(100%-78px)] w-[calc(100%-16px)] flex-col overflow-hidden rounded-[14px] bg-surface shadow-[0_24px_60px_-20px_rgba(16,32,31,0.45),0_0_0_1px_var(--color-line)] lg:mx-7 lg:mt-[72px] lg:max-h-[calc(100%-96px)] lg:w-[400px] [html[lang=bn]_&]:leading-[1.6]"
      >
        <div className="flex items-center gap-2 border-b border-line py-2.5 pr-3 pl-4">
          <h2 className="flex min-w-0 flex-1 items-center gap-2 text-[17px] font-bold">
            {t('ntTitle')}
            {unread ? (
              <span className="inline-flex h-[22px] items-center rounded-full bg-info-soft px-2 text-[12px] font-semibold text-info-text">
                {t('ntNew', { n: unread })}
              </span>
            ) : null}
          </h2>
          {unread ? (
            <button
              type="button"
              className="rounded-[8px] px-2 py-1.5 text-[13px] font-semibold text-primary"
              disabled={mark.isPending}
              onClick={() => {
                mark.mutate('all', {
                  onSuccess: () => {
                    showToast(t('ntAllRead'));
                  },
                });
              }}
            >
              {t('ntMarkAll')}
            </button>
          ) : null}
          <Link
            to="/$shop/settings/notifications"
            params={{ shop: slug }}
            aria-label={t('ntSettings')}
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-[8px] text-fg-muted"
          >
            <Icon name="settings" />
          </Link>
        </div>
        <div className="min-h-0 overflow-auto pt-1 pb-1.5">
          {list.isSuccess && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon name="bell" size={26} />
              </span>
              <b className="text-[15px]">{t('ntEmpty')}</b>
              <p className="max-w-[30ch] text-[13px] text-neutral-700">{t('ntEmptyHint')}</p>
            </div>
          ) : (
            <>
              {group(t('ntToday'), todays)}
              {group(t('ntEarlier'), earlier)}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line bg-surface py-2.5 pr-3 pl-4">
          <Link
            to="/$shop/notifications"
            params={{ shop: slug }}
            onClick={onClose}
            className="text-[14px] font-semibold text-primary no-underline"
          >
            {t('ntSeeAll')}
          </Link>
          <span className="text-[12px] text-neutral-700">{t('p37BellKept')}</span>
        </div>
      </div>
    </div>
  );
}
