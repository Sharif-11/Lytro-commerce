import { useTranslation } from 'react-i18next';
import { useMarkNotificationsRead, useNotifications } from '@/api/notifications';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow } from '@/components/ui/page';
import { SkeletonRows } from '@/components/ui/skeleton';
import { dayKey } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { NotificationView } from '@/types/notifications';
import { useOpenNotification } from './notification-words';
import { NotificationRow } from './bell-rows';

/**
 * The bell's own page (TENANT-DASHBOARD-DESIGN §7.40, Part 37's `p37-bell-all`; NTF-01, D7-39): the last 30 days grouped by
 * day -- Today, Yesterday, then earlier -- Mark all read, and Show earlier for the next page. No filter chips: no route
 * filters by kind or unread.
 */
export function BellPage(): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { showToast } = useShell();
  const list = useNotifications({ limit: 30 });
  const mark = useMarkNotificationsRead();
  const open = useOpenNotification();
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  const unread = list.data?.pages[0]?.unread ?? 0;
  const now = new Date();
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  const groups: [string, NotificationView[]][] = [
    [t('ntToday'), rows.filter((row) => dayKey(row.createdAt) === today)],
    [t('ntYesterday'), rows.filter((row) => dayKey(row.createdAt) === yesterday)],
    [
      t('ntEarlier'),
      rows.filter((row) => dayKey(row.createdAt) !== today && dayKey(row.createdAt) !== yesterday),
    ],
  ];
  return (
    <ShellPage
      actions={
        unread ? (
          <Button
            tone="outline"
            size="sm"
            busy={mark.isPending}
            onClick={() => {
              mark.mutate('all', {
                onSuccess: () => {
                  showToast(t('ntAllRead'));
                },
              });
            }}
          >
            {t('ntMarkAll')}
          </Button>
        ) : undefined
      }
    >
      <p className="text-[14px] text-fg-muted">{t('ntPageLead')}</p>
      {list.isLoading ? (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="bell">
            <b>{t('ntEmpty')}</b>
            <br />
            {t('ntEmptyHint')}
          </EmptyState>
        </Card>
      ) : (
        groups.map(([label, items]) =>
          items.length === 0 ? null : (
            <div key={label} className="flex flex-col gap-2">
              <Eyebrow>{label}</Eyebrow>
              <Card flush>
                <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
                  {items.map((row) => (
                    <NotificationRow key={row.id} notification={row} onOpen={open} />
                  ))}
                </div>
              </Card>
            </div>
          ),
        )
      )}
      {list.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {t('showEarlier')}
        </Button>
      ) : null}
    </ShellPage>
  );
}
