import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { RowList } from '@/components/ui/list-row';
import { costOk, quantityOk, withLine, type LineDraft } from './purchase-lines';

const BOX =
  'rounded-[6px] border px-2 py-1.5 text-[15px] focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus';

/** An item's quantity in a small box (the prototype's `.in`, 70 px), red while it cannot be sent. */
export function QtyBox({
  line,
  onChange,
}: {
  line: LineDraft;
  onChange: (quantity: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const bad = line.quantity.trim() !== '' && !quantityOk(line.quantity);
  return (
    <input
      inputMode="decimal"
      aria-label={t('poQtyFor', { name: line.name })}
      aria-invalid={bad || undefined}
      value={line.quantity}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      className={`num w-[70px] flex-none bg-surface text-right outline-none ${BOX} ${bad ? 'border-danger' : 'border-line-strong'}`}
    />
  );
}

/** An item's unit cost in a small box after ৳ (84 px); empty is not known. */
export function CostBox({
  line,
  onChange,
}: {
  line: LineDraft;
  onChange: (cost: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const bad = !costOk(line.cost);
  return (
    <span
      className={`flex w-[84px] flex-none items-center gap-0.5 bg-surface ${BOX} ${bad ? 'border-danger' : 'border-line-strong'}`}
    >
      <span className="text-fg-muted">৳</span>
      <input
        inputMode="decimal"
        aria-label={t('poCostFor', { name: line.name })}
        aria-invalid={bad || undefined}
        value={line.cost}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="num min-w-0 flex-1 bg-transparent text-right outline-none"
      />
    </span>
  );
}

/** Remove an item from a purchase still being written. */
export function RemoveLine({
  line,
  onRemove,
}: {
  line: LineDraft;
  onRemove: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <button
      type="button"
      aria-label={t('poRemoveItem', { name: line.name })}
      onClick={onRemove}
      className="inline-flex size-9 flex-none items-center justify-center rounded-[8px] text-fg-muted"
    >
      <Icon name="x" />
    </button>
  );
}

/** "+ Add item" beside the Items heading (the prototype's `.sechead button.lnk`). */
export function AddItemLink({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <button
      type="button"
      onClick={onAdd}
      className="inline-flex items-center gap-1 text-[14px] font-medium whitespace-nowrap text-primary"
    >
      <Icon name="plus" size={16} />
      {t('poAddItem')}
    </button>
  );
}

/**
 * The Order sheet's items (the prototype's `purchase-new`; agreed in the 11.10 read): each named, its quantity and unit
 * cost in small boxes, and remove.
 */
export function LineRows({
  lines,
  onChange,
}: {
  lines: readonly LineDraft[];
  onChange: (lines: LineDraft[]) => void;
}): React.JSX.Element {
  return (
    <div className="flex-none overflow-hidden rounded-card border border-line">
      <RowList>
        {lines.map((line) => (
          <div key={line.variantId} className="flex min-h-16 items-center gap-2 py-2 pr-2 pl-4">
            <span className="min-w-0 flex-1 text-[15px] font-medium">{line.name}</span>
            <QtyBox
              line={line}
              onChange={(quantity) => {
                onChange(withLine(lines, line.variantId, { quantity }));
              }}
            />
            <CostBox
              line={line}
              onChange={(cost) => {
                onChange(withLine(lines, line.variantId, { cost }));
              }}
            />
            <RemoveLine
              line={line}
              onRemove={() => {
                onChange(lines.filter((each) => each.variantId !== line.variantId));
              }}
            />
          </div>
        ))}
      </RowList>
    </div>
  );
}
