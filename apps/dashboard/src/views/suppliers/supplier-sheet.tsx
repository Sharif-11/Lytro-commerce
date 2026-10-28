import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SUPPLIER_ADDRESS_MAX_LENGTH,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_NOTES_MAX_LENGTH,
} from '@lytronix/validators';
import { useCreateSupplier, useUpdateSupplier, type SupplierDraft } from '@/api/purchases';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { AreaField, Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import type { Supplier } from '@/types/purchasing';

/** A supplier's details as typed. */
interface Typed {
  name: string;
  phone: string;
  email: string;
  postalAddress: string;
  notes: string;
}

const typedOf = (supplier: Supplier | null): Typed => ({
  name: supplier?.name ?? '',
  phone: supplier?.phone ?? '',
  email: supplier?.email ?? '',
  postalAddress: supplier?.postalAddress ?? '',
  notes: supplier?.notes ?? '',
});

/**
 * A supplier's sheet (the prototype's `sh-supplier`, `sh-supplier-new`; PUR-01): its name, phone, email, address and
 * notes; one already saved can be archived -- no longer offered for new purchases, never deleted.
 */
export function SupplierSheet({
  open,
  supplier,
  onClose,
}: {
  open: boolean;
  /** Null for a new one. */
  supplier: Supplier | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const [typed, setTyped] = useState<Typed>(typedOf(supplier));

  useEffect(() => {
    if (!open) return;
    setTyped(typedOf(supplier));
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const was = typedOf(supplier);
  // Only what changed is sent; a field cleared is sent empty, which clears it.
  const changes = Object.fromEntries(
    (Object.keys(typed) as (keyof Typed)[])
      .filter((key) => typed[key].trim() !== was[key])
      .map((key) => [key, typed[key].trim()]),
  ) as Partial<Typed> satisfies SupplierDraft;
  const ready = typed.name.trim() !== '' && (supplier === null || Object.keys(changes).length > 0);
  const failed = create.error ?? update.error;

  function save(): void {
    if (!ready) return;
    if (supplier === null) {
      create.mutate({ ...changes, name: typed.name.trim() }, { onSuccess: onClose });
    } else {
      update.mutate({ id: supplier.id, body: changes }, { onSuccess: onClose });
    }
  }

  const field = (key: keyof Typed) => ({
    value: typed[key],
    onChange: (event: { target: { value: string } }) => {
      setTyped((now) => ({ ...now, [key]: event.target.value }));
    },
  });

  return (
    <Sheet
      open={open}
      title={supplier ? supplier.name : t('supNew')}
      onClose={onClose}
      footer={
        <Button wide busy={create.isPending || update.isPending} disabled={!ready} onClick={save}>
          {t('save')}
        </Button>
      }
    >
      {open ? (
        <>
          <Field label={t('supName')} maxLength={SUPPLIER_NAME_MAX_LENGTH} {...field('name')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('supPhone')} type="tel" inputMode="tel" {...field('phone')} />
            <Field label={t('supEmail')} type="email" placeholder="—" {...field('email')} />
          </div>
          <AreaField
            label={t('supAddress')}
            maxLength={SUPPLIER_ADDRESS_MAX_LENGTH}
            {...field('postalAddress')}
          />
          <Field
            label={t('supNotes')}
            placeholder="—"
            maxLength={SUPPLIER_NOTES_MAX_LENGTH}
            {...field('notes')}
          />
          {supplier ? (
            <>
              <p className="text-[14px] text-fg-muted">{t('supArchiveHelp')}</p>
              <div>
                <Button
                  tone="ghost"
                  size="sm"
                  busy={update.isPending}
                  onClick={() => {
                    update.mutate({ id: supplier.id, body: { archived: true } }, { onSuccess: onClose });
                  }}
                >
                  {t('supArchive')}
                </Button>
              </div>
            </>
          ) : null}
          {failed ? <Banner tone="bad">{errorText(failed)}</Banner> : null}
        </>
      ) : null}
    </Sheet>
  );
}
