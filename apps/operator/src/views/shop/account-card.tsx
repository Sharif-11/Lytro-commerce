import { useNavigate } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { useShopAudit } from '@/api/shops';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard } from '@/components/ui/console-page';
import { NOTE, SMALL_BUTTON } from '@/components/ui/sizes';
import { formatDay, taka } from '@/lib/format';
import { spacedPhone } from '@/lib/phone-words';
import type { PlatformAuditEntry } from '@/types/shop-figures';

/** How many of the shop's latest audit entries its page shows; the audit log holds the rest. */
const RECENT_ACTIONS = 3;

const ROW =
  'flex min-h-[60px] w-full items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0';

/** ADM-08: what an entry's summary says, as one line: the days, the money, the TrxID and the reason it carries. */
function summaryLine(entry: PlatformAuditEntry, t: TFunction): string {
  const summary =
    typeof entry.summary === 'object' && entry.summary !== null
      ? (entry.summary as Record<string, unknown>)
      : {};
  const parts: string[] = [];
  const { days, from, to, amount, transactionId, reason } = summary;
  if (typeof days === 'number' && typeof from === 'string' && typeof to === 'string') {
    parts.push(`${t('p88shops.days', { n: days })} · ${formatDay(from)} → ${formatDay(to)}`);
  }
  if (typeof amount === 'number' || typeof amount === 'string') {
    const value = Number(amount);
    parts.push(value < 0 ? `−${taka(-value)}` : taka(value));
  }
  if (typeof transactionId === 'string') parts.push(transactionId);
  if (typeof reason === 'string' && reason !== '') parts.push(reason);
  return parts.join(' · ');
}

function whoOf(entry: PlatformAuditEntry, t: TFunction): string {
  if (entry.actorType === 'system') return t('p88shops.whoSystem');
  if (entry.actorType === 'shop_owner') return t('p88shops.whoOwner');
  return entry.actorEmail ?? '—';
}

/** ADM-08: the operators' latest actions on this shop, each opening the audit log at the shop. */
function ActionsCard({ shopId }: { shopId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const audit = useShopAudit(shopId, RECENT_ACTIONS);
  const entries = audit.data?.items ?? [];
  const open = (): void => {
    void navigate({ href: `/audit?tenantId=${shopId}` });
  };
  return (
    <ConsoleCard className="p-0!">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-1">
        <h2 className="mb-1 text-[16px] font-semibold">{t('p88shops.actionsTitle')}</h2>
        <button
          type="button"
          onClick={open}
          className="text-[14px] font-medium whitespace-nowrap text-primary"
        >
          {t('p88shops.actionsOpen')}
        </button>
      </div>
      {entries.length > 0 ? (
        <div className="flex flex-col">
          {entries.map((entry) => {
            const line = summaryLine(entry, t);
            return (
              <button key={entry.id} type="button" onClick={open} className={ROW}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">
                    {t(`p88shops.actions.${entry.action}`, { defaultValue: entry.action })}
                  </span>
                  <span className="text-[13px] text-fg-muted">
                    {[line, formatDay(entry.createdAt), whoOf(entry, t)]
                      .filter((part) => part !== '')
                      .join(' · ')}
                  </span>
                </span>
                <ConsoleIcon name="chev" className="text-neutral-400" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className={`px-4 pb-4 ${NOTE}`}>{audit.isPending ? '' : t('p88shops.none')}</div>
      )}
    </ConsoleCard>
  );
}

/**
 * ADM-04, ADM-13 (OPERATOR-CONSOLE-DESIGN v7 §5): resetting the owner's sign-in and deleting the shop's data, in the place
 * the dashed Shop detail card held, then the operators' latest actions on the shop.
 */
export function AccountCards({
  shopId,
  ownerPhone,
  onReset,
  onDelete,
}: {
  shopId: string;
  ownerPhone: string | null;
  onReset: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ConsoleCard className="p-0!">
        <h2 className="mb-1 px-4 pt-4 pb-1 text-[16px] font-semibold">{t('p88shops.account')}</h2>
        <div className="flex flex-col">
          <div className={ROW}>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-medium">{t('p88shops.resetRow')}</span>
              <span className="text-[13px] text-fg-muted">
                {t('p88shops.resetRowDetail')}{' '}
                {ownerPhone ? <span className="mono">{spacedPhone(ownerPhone)}</span> : null}
              </span>
            </span>
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={SMALL_BUTTON}
              onClick={onReset}
            >
              {t('p88shops.resetButton')}
            </Button>
          </div>
          <div className={ROW}>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-medium">{t('p88shops.deleteRow')}</span>
              <span className="text-[13px] text-fg-muted">{t('p88shops.deleteRowDetail')}</span>
            </span>
            <Button
              type="button"
              tone="ghost"
              small
              fit
              className={`${SMALL_BUTTON} text-danger!`}
              onClick={onDelete}
            >
              {t('p88shops.deleteButton')}
            </Button>
          </div>
        </div>
      </ConsoleCard>
      <ActionsCard shopId={shopId} />
    </div>
  );
}
