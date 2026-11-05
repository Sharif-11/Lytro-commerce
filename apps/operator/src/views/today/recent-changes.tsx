import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PlatformAuditAction } from '@lytronix/validators';
import { useRecentChanges } from '@/api/recent-changes';
import { ConsoleIcon, type ConsoleIconName } from '@/components/ui/console-icon';
import { ConsoleCard } from '@/components/ui/console-page';
import { CardList, LIST_ROW, RowIcon, RowLines } from '@/components/ui/list-row';
import { formatDay } from '@/lib/format';
import { settingChangeWords } from '@/lib/setting-words';
import type { RecentChange } from '@/types/operator';

function value(of: unknown): string {
  if (of === null || of === undefined) return '–';
  return typeof of === 'string' ? of : JSON.stringify(of);
}

function ChangeBody({
  icon,
  title,
  change,
}: {
  icon: ConsoleIconName;
  title: string;
  change: RecentChange;
}): React.JSX.Element {
  return (
    <>
      <RowIcon name={icon} />
      <RowLines
        title={title}
        detail={`${formatDay(change.at)}${change.by ? ` · ${change.by}` : ''}`}
      />
      <ConsoleIcon name="chev" />
    </>
  );
}

/** One change, opening the screen it was made on. */
function ChangeRow({ change }: { change: RecentChange }): React.JSX.Element | null {
  const { t } = useTranslation();
  const from = `${value(change.oldValue)} → ${value(change.newValue)}`;
  const key = change.key ?? '';
  switch (change.action) {
    case PlatformAuditAction.RateChanged:
      return (
        <Link to="/rates" className={LIST_ROW}>
          <ChangeBody
            icon="signal"
            title={`${t(`rateNames.${key}`, { defaultValue: key })}: ${from}`}
            change={change}
          />
        </Link>
      );
    case PlatformAuditAction.SettingsChanged:
      return (
        <Link to="/settings" className={LIST_ROW}>
          <ChangeBody
            icon="settings"
            title={`${t(`settingNames.${key}`, { defaultValue: key })}: ${settingChangeWords(key, change.oldValue, change.newValue, t)}`}
            change={change}
          />
        </Link>
      );
    case PlatformAuditAction.TenantSuspended:
    case PlatformAuditAction.PaymentPageSuspended:
      if (!change.shop) return null;
      return (
        <Link to="/shops/$id" params={{ id: change.shop.id }} className={LIST_ROW}>
          <ChangeBody
            icon="pause"
            title={t(
              change.action === PlatformAuditAction.TenantSuspended
                ? 'today.changeSuspended'
                : 'today.changePageSuspended',
              { shop: change.shop.name },
            )}
            change={change}
          />
        </Link>
      );
    default:
      return null;
  }
}

export function RecentChanges(): React.JSX.Element {
  const { t } = useTranslation();
  const changes = useRecentChanges();
  return (
    <ConsoleCard>
      <h2 className="mb-1 text-[16px] font-semibold">{t('today.changes')}</h2>
      {changes.data?.length === 0 ? (
        <div className="text-[13px] text-fg-muted">{t('today.noChanges')}</div>
      ) : (
        <CardList>
          {changes.data?.map((change) => (
            <ChangeRow key={change.id} change={change} />
          ))}
        </CardList>
      )}
    </ConsoleCard>
  );
}
