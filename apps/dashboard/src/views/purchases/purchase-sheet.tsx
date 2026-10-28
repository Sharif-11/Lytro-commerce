import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PURCHASE_NOTES_MAX_LENGTH } from '@lytronix/validators';
import { useCreatePurchase, usePlacePurchase } from '@/api/purchases';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import { AddItemSheet } from './add-item-sheet';
import { AddItemLink, LineRows } from './line-rows';
import {
  linesBody,
  linesOk,
  supplierBody,
  type LineDraft,
  type SupplierValue,
} from './purchase-lines';
import { SupplierField } from './supplier-field';

const NO_SUPPLIER: SupplierValue = { id: null, name: '' };

/**
 * Order from supplier (the prototype's `purchase-new`, Part 21's `sh-po-supplier`; PUR-02): the supplier typed, the
 * expected day and notes, the items with quantity and unit cost; Save draft keeps it among the drafts, Place with
 * supplier numbers it and counts it as coming, then opens it. A place refused after the draft was saved opens the draft,
 * where Place with supplier says why.
 */
export function PurchaseSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug } = useShell();
  const create = useCreatePurchase();
  const place = usePlacePurchase();
  const [supplier, setSupplier] = useState<SupplierValue>(NO_SUPPLIER);
  const [expectedOn, setExpectedOn] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSupplier(NO_SUPPLIER);
    setExpectedOn('');
    setNotes('');
    setLines([]);
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ready = linesOk(lines);
  const busy = create.isPending || place.isPending;

  async function save(placing: boolean): Promise<void> {
    if (!ready) return;
    const saved = await create.mutateAsync({
      ...supplierBody(supplier),
      ...(expectedOn === '' ? {} : { expectedOn }),
      ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
      items: linesBody(lines),
    });
    onClose();
    if (!placing) {
      void navigate({
        to: '/$shop/purchases',
        params: { shop: slug },
        search: { seg: 'drafts' },
      });
      return;
    }
    await place.mutateAsync(saved.id).catch(() => undefined);
    void navigate({
      to: '/$shop/purchases/$purchaseId',
      params: { shop: slug, purchaseId: saved.id },
    });
  }

  return (
    <>
      <Sheet
        open={open && !adding}
        title={t('poNew')}
        onClose={onClose}
        footer={
          <>
            <Button
              tone="outline"
              disabled={!ready || busy}
              onClick={() => {
                void save(false).catch(() => undefined);
              }}
            >
              {t('poSaveDraft')}
            </Button>
            <Button
              busy={busy}
              disabled={!ready}
              onClick={() => {
                void save(true).catch(() => undefined);
              }}
            >
              {t('poPlace')}
            </Button>
          </>
        }
      >
        {open ? (
          <>
            <SupplierField value={supplier} onChange={setSupplier} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('poExpected')}
                type="date"
                value={expectedOn}
                onChange={(event) => {
                  setExpectedOn(event.target.value);
                }}
              />
              <Field
                label={t('poNotes')}
                placeholder="—"
                maxLength={PURCHASE_NOTES_MAX_LENGTH}
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                }}
              />
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[17px] font-semibold">{t('poItems')}</h3>
              <AddItemLink
                onAdd={() => {
                  setAdding(true);
                }}
              />
            </div>
            {lines.length > 0 ? <LineRows lines={lines} onChange={setLines} /> : null}
            <p className="text-[14px] text-fg-muted">{t('poPlaceHelp')}</p>
            {create.isError ? <Banner tone="bad">{errorText(create.error)}</Banner> : null}
          </>
        ) : null}
      </Sheet>
      <AddItemSheet
        open={open && adding}
        listed={new Set(lines.map((line) => line.variantId))}
        onAdd={(added) => {
          setLines((now) => [...now, ...added]);
        }}
        onClose={() => {
          setAdding(false);
        }}
      />
    </>
  );
}
