import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { SerialStatus } from '@lytronix/validators';
import { useFixSerial, useRemoveSerial, useSerials } from '@/api/stock';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Kv } from '@/components/ui/kv';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import type { SerialUnit } from '@/types/stock';
import type { StockHolder } from './stock-holders';
import { VariantPicker } from './variant-picker';

/** The chips, as the prototype's `sh-serials` draws them. */
const STATUSES = [
  { status: SerialStatus.InStock, label: 'serialIn' },
  { status: SerialStatus.Sold, label: 'serialSold' },
  { status: SerialStatus.Returned, label: 'serialReturned' },
  { status: SerialStatus.WrittenOff, label: 'serialOff' },
] as const;

/**
 * IMEI / serials (the prototype's `sh-serials` and `sh-serial-fix`, Part 18's `sh-serials-product`; INV-14): a
 * variant's serials by where their units stand, picked as "Product · variant" where the product has several; how many
 * units held have none yet, with Add serials; and Fix on a unit in stock, a step to correct its serial or remove it.
 */
export function HeldSerialsSheet({
  open,
  product,
  holders,
  initial,
  mayManage,
  onMissing,
  onClose,
}: {
  open: boolean;
  product: { id: string; name: string };
  holders: readonly StockHolder[];
  initial: string | null;
  mayManage: boolean;
  /** Add serials for the units held with none (Part 18's `sh-serials-missing`). */
  onMissing: (variantId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [status, setStatus] = useState<SerialStatus>(SerialStatus.InStock);
  const [fixing, setFixing] = useState<SerialUnit | null>(null);
  const [typed, setTyped] = useState('');
  const fix = useFixSerial(product.id);
  const remove = useRemoveSerial(product.id);

  useEffect(() => {
    if (!open) return;
    setVariantId(initial ?? holders[0]?.variantId ?? null);
    setStatus(SerialStatus.InStock);
    setFixing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = open ? variantId : null;
  // Each chip's count, as drawn; the list is the chosen chip's.
  const pages = {
    [SerialStatus.InStock]: useSerials(product.id, shown, SerialStatus.InStock),
    [SerialStatus.Sold]: useSerials(product.id, shown, SerialStatus.Sold),
    [SerialStatus.Returned]: useSerials(product.id, shown, SerialStatus.Returned),
    [SerialStatus.WrittenOff]: useSerials(product.id, shown, SerialStatus.WrittenOff),
  };
  const list = pages[status as keyof typeof pages];
  const holder = holders.find((each) => each.variantId === variantId);

  function openFix(unit: SerialUnit): void {
    setFixing(unit);
    setTyped(unit.serial);
    fix.reset();
    remove.reset();
  }

  const fixProblem = fix.isError
    ? fix.error instanceof ApiClientError && fix.error.code === 'conflict'
      ? t('snDup')
      : errorText(fix.error)
    : undefined;

  return (
    <Sheet
      open={open}
      title={fixing ? t('snTitle') : t('heldSerialsTitle')}
      onClose={onClose}
      onBack={
        fixing
          ? () => {
              setFixing(null);
            }
          : undefined
      }
      footer={
        fixing ? (
          <Button
            wide
            busy={fix.isPending}
            disabled={typed.trim() === '' || typed.trim() === fixing.serial}
            onClick={() => {
              fix.mutate(
                { serialId: fixing.id, serial: typed.trim() },
                {
                  onSuccess: () => {
                    setFixing(null);
                  },
                },
              );
            }}
          >
            {t('snSave')}
          </Button>
        ) : undefined
      }
    >
      {open && fixing ? (
        <div className="flex flex-col gap-3">
          <Kv label={t('snCurrent')} value={<span className="font-mono">{fixing.serial}</span>} />
          <Field
            label={t('snNew')}
            value={typed}
            autoComplete="off"
            className="font-mono"
            error={fixProblem}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
          <p className="text-[14px] text-fg-muted">{t('snOnlyInStock')}</p>
          <button
            type="button"
            className="self-start text-[15px] font-semibold text-danger-text underline"
            onClick={() => {
              remove.mutate(fixing.id, {
                onSuccess: () => {
                  setFixing(null);
                },
              });
            }}
          >
            {t('snRemove')}
          </button>
          {remove.isError ? <Banner tone="bad">{errorText(remove.error)}</Banner> : null}
        </div>
      ) : open ? (
        <div className="flex flex-col gap-3">
          {holders.length > 1 ? (
            <VariantPicker
              product={product.name}
              holders={holders}
              value={variantId}
              onChange={setVariantId}
            />
          ) : (
            <p className="text-[14px] text-fg-muted">{product.name}</p>
          )}
          {holder && holder.missing > 0 ? (
            <Banner
              tone="warn"
              action={
                mayManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      onMissing(holder.variantId);
                    }}
                  >
                    {t('addSerials')}
                  </button>
                ) : undefined
              }
            >
              {t('serialsMissing', { n: holder.missing })}
            </Banner>
          ) : null}
          <ChipRow>
            {STATUSES.map((each) => {
              // As drawn, a chip with none shows no count.
              const total = pages[each.status].data?.total ?? 0;
              return (
                <Chip
                  key={each.status}
                  on={status === each.status}
                  count={total > 0 ? total : null}
                  onClick={() => {
                    setStatus(each.status);
                  }}
                >
                  {t(each.label)}
                </Chip>
              );
            })}
          </ChipRow>
          {list.isSuccess && list.data.serials.length === 0 ? (
            <p className="text-[14px] text-fg-muted">{t('serialsNone')}</p>
          ) : (
            <ul
              aria-label={t('heldSerialsTitle')}
              className="flex-none rounded-card border border-line px-4 py-1"
            >
              {(list.data?.serials ?? []).map((unit) => (
                <li
                  key={unit.id}
                  className="flex items-center gap-2.5 border-t border-line py-2.5 text-[15px] first:border-t-0"
                >
                  <code className="min-w-0 flex-1 truncate">{unit.serial}</code>
                  <StatusTag tone={unit.status === SerialStatus.InStock ? 'ok' : 'neutral'}>
                    {t(STATUSES.find((each) => each.status === unit.status)?.label ?? 'serialIn')}
                  </StatusTag>
                  {unit.status === SerialStatus.InStock && mayManage ? (
                    <Button
                      tone="ghost"
                      size="xs"
                      aria-label={`${t('fixSerial')} ${unit.serial}`}
                      onClick={() => {
                        openFix(unit);
                      }}
                    >
                      {t('fixSerial')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[14px] text-fg-muted">{t('serialsNote')}</p>
        </div>
      ) : null}
    </Sheet>
  );
}
