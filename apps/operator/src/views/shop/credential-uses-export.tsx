import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { credentialUsesCsv } from '@/api/shops';
import { ActionPanel } from '@/components/ui/action-panel';
import { Chip, Chips } from '@/components/ui/chips';
import { useToast } from '@/components/ui/use-toast';
import { daysInOrder, lastThirtyDays } from '@/lib/credential-days';
import { saveFile } from '@/lib/save-file';

const FIELD =
  'h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-[15px] text-ink';

/**
 * SEC-11 (Slice 9.9): the shop's credential uses as a CSV -- couriers, gateways and Meta, never a key -- for the days the
 * operator picks, the last 30 unless changed.
 */
export function CredentialUsesExport({
  shopId,
  shopName,
  shopSlug,
  onClose,
}: {
  shopId: string;
  shopName: string;
  shopSlug: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const initial = lastThirtyDays(new Date());
  const [dateFrom, setDateFrom] = useState(initial.dateFrom);
  const [dateTo, setDateTo] = useState(initial.dateTo);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inOrder = daysInOrder(dateFrom, dateTo);
  const lastThirty = dateFrom === initial.dateFrom && dateTo === initial.dateTo;

  async function download(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const { name, file } = await credentialUsesCsv(shopId, dateFrom, dateTo);
      saveFile(name, file);
      toast(t('shop.cuDone'));
      onClose();
    } catch (failure) {
      setError(errorMessage(failure, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <ActionPanel
      title={t('shop.cuTitle')}
      sub={`${shopName} · ${shopSlug}.lytro.app`}
      onClose={onClose}
      actionLabel={t('shop.cuDownload')}
      pending={pending}
      error={error}
      canSubmit={inOrder}
      onSubmit={() => {
        void download();
      }}
    >
      <Chips>
        <Chip
          on={lastThirty}
          className="text-[14px]"
          onClick={() => {
            setDateFrom(initial.dateFrom);
            setDateTo(initial.dateTo);
          }}
        >
          {t('shop.cuLast30')}
        </Chip>
      </Chips>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5 text-[14px] font-medium text-ink">
          {t('shop.cuFrom')}
          <input
            type="date"
            name="dateFrom"
            value={dateFrom}
            aria-invalid={!inOrder}
            onChange={(event) => {
              setDateFrom(event.target.value);
            }}
            className={`${FIELD} ${inOrder ? '' : 'border-danger!'}`}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-[14px] font-medium text-ink">
          {t('shop.cuTo')}
          <input
            type="date"
            name="dateTo"
            value={dateTo}
            aria-invalid={!inOrder}
            onChange={(event) => {
              setDateTo(event.target.value);
            }}
            className={`${FIELD} ${inOrder ? '' : 'border-danger!'}`}
          />
          {inOrder ? null : (
            <span role="alert" className="text-[14px] font-normal text-danger">
              {t('shop.cuBad')}
            </span>
          )}
        </label>
      </div>
      <div className="text-[14px] leading-[1.5] text-neutral-700">{t('shop.cuHelp')}</div>
    </ActionPanel>
  );
}
