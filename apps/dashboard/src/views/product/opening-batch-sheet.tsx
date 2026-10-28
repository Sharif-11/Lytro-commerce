import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { STOCK_BATCH_CODE_MAX_LENGTH, type StockUnit } from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { todayInputValue } from '@/lib/dates';
import type { OpeningBatch } from '@/lib/opening';

/**
 * Opening batch (Part 15's `pf-sh-batch`; INV-12, INV-10): the stock a new batch-tracked product, or one of its
 * variants, has on the shelf, as one batch -- how much, its code and expiry, both optional, and what each unit cost,
 * kept as its cost entered by hand (agreed in the 11.7c read). An expiry already past is refused here, as the server
 * does. Done keeps it; the product saves it with Save.
 */
export function OpeningBatchSheet({
  open,
  sub,
  unit,
  quantity,
  batch,
  onDone,
  onClose,
}: {
  open: boolean;
  /** What the batch is of: the product and the variant ("Matte Lipstick · Ruby"). */
  sub: string;
  unit: StockUnit;
  quantity: string;
  batch: OpeningBatch;
  onDone: (quantity: string, batch: OpeningBatch) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [amount, setAmount] = useState(quantity);
  const [draft, setDraft] = useState<OpeningBatch>(batch);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(quantity);
    setDraft(batch);
    setTried(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const today = todayInputValue();
  const past = draft.expiresOn !== '' && draft.expiresOn < today;
  return (
    <Sheet
      open={open}
      title={t('batchTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          onClick={() => {
            setTried(true);
            if (!past) onDone(amount, draft);
          }}
        >
          {t('done')}
        </Button>
      }
    >
      {open ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-fg-muted">{sub}</p>
          <Field
            label={t('quantity')}
            inputMode="decimal"
            className="num"
            value={amount}
            suffix={t(`su_${unit}`)}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('batchCode')}
              value={draft.code}
              maxLength={STOCK_BATCH_CODE_MAX_LENGTH}
              onChange={(event) => {
                setDraft({ ...draft, code: event.target.value });
              }}
            />
            <Field
              label={t('expiry')}
              type="date"
              min={today}
              value={draft.expiresOn}
              error={tried && past ? t('errExpiryPast') : undefined}
              onChange={(event) => {
                setDraft({ ...draft, expiresOn: event.target.value });
              }}
            />
          </div>
          <Field
            label={t('unitCost')}
            prefix="৳"
            inputMode="decimal"
            className="num"
            value={draft.unitCost}
            onChange={(event) => {
              setDraft({ ...draft, unitCost: event.target.value });
            }}
          />
          <p className="text-[14px] text-fg-muted">{t('batchHint')}</p>
        </div>
      ) : null}
    </Sheet>
  );
}
