import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPLIER_NAME_MAX_LENGTH } from '@lytronix/validators';
import { useSuppliers } from '@/api/purchases';
import { Icon } from '@/components/icon';
import { RowList } from '@/components/ui/list-row';
import { bangladeshiPhone } from '@/lib/phone';
import type { SupplierValue } from './purchase-lines';

// The matches offered at most, as drawn.
const MATCHES_SHOWN = 5;

/**
 * A purchase's supplier, typed (Part 21's `sh-po-supplier`; agreed in the 11.10 read): the shop's live suppliers whose
 * names match are offered as you type, each with its phone, then the name typed "as a new supplier" unless one has it
 * already. The server finds a supplier by the name ignoring case, or makes it, as Add stock does.
 */
export function SupplierField({
  value,
  onChange,
  chevron = false,
}: {
  value: SupplierValue;
  onChange: (value: SupplierValue) => void;
  /** A saved purchase's field shows the drawn chevron. */
  chevron?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const own = useId();
  const [open, setOpen] = useState(false);
  const typed = value.name.trim();
  const asking = open && typed !== '';
  const found = useSuppliers({ search: typed, enabled: asking });
  const matches = asking ? (found.data?.suppliers ?? []).slice(0, MATCHES_SHOWN) : [];
  const known = matches.some((each) => each.name.toLowerCase() === typed.toLowerCase());

  const choose = (next: SupplierValue) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div
      className="flex flex-col gap-1.5"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        // Escape closes the matches first, the sheet only after.
        if (event.key === 'Escape' && asking) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <label htmlFor={own} className="text-[14px] font-medium text-fg-muted">
        {t('poSupplier')}
      </label>
      <div
        className={[
          'flex h-12 items-center gap-2 rounded-control border bg-surface px-3 text-[16px] focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus',
          asking ? 'border-primary' : 'border-line-strong',
        ].join(' ')}
      >
        <input
          id={own}
          autoComplete="off"
          value={value.name}
          maxLength={SUPPLIER_NAME_MAX_LENGTH}
          placeholder={t('supTypePh')}
          aria-describedby={`${own}-help`}
          onFocus={() => {
            setOpen(true);
          }}
          onChange={(event) => {
            onChange({ id: null, name: event.target.value });
            setOpen(true);
          }}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle"
        />
        {chevron ? (
          <span className="text-neutral-500">
            <Icon name="down" />
          </span>
        ) : null}
      </div>
      {/* The matches follow the box as buttons, the next stops for the keyboard. */}
      {asking ? (
        <div className="mt-1 flex-none overflow-hidden rounded-card border border-line">
          <RowList>
            {matches.map((supplier) => (
              <button
                key={supplier.id}
                type="button"
                onClick={() => {
                  choose({ id: supplier.id, name: supplier.name });
                }}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-medium">{supplier.name}</span>
                  <span className="num truncate text-[14px] text-fg-muted">
                    {supplier.phone ? bangladeshiPhone.display(supplier.phone) : t('supNoPhone')}
                  </span>
                </span>
              </button>
            ))}
            {known ? null : (
              <button
                type="button"
                onClick={() => {
                  choose({ id: null, name: typed });
                }}
                className="flex min-h-12 w-full items-center gap-1 px-4 py-2 text-left text-[15px] font-medium text-primary"
              >
                <Icon name="plus" size={16} />
                {t('supNewAs', { name: typed })}
              </button>
            )}
          </RowList>
        </div>
      ) : null}
      <p id={`${own}-help`} className="text-[13px] text-fg-muted">
        {t('poSupplierHelp')}
      </p>
    </div>
  );
}
