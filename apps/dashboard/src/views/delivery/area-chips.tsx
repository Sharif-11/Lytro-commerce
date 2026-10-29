import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { chipClass } from '@/components/ui/classes';
import type { Locations } from '@/types/delivery';
import { areaKey, type AreaRef } from './areas';
import { useDeliveryWords } from './delivery-words';

// A chosen chip's shape in the danger colours: an area another zone holds.
const TAKEN_CHIP =
  'inline-flex h-10 flex-none items-center gap-1.5 rounded-full border border-danger bg-danger-soft px-3.5 text-[14px] font-medium whitespace-nowrap text-danger-text';
// The free chip's shape, dashed and in the primary colour: add an area (the prototype's dashed `.chip`).
const ADD_CHIP =
  'inline-flex h-10 flex-none items-center gap-1.5 rounded-full border border-dashed border-line bg-surface px-3.5 text-[14px] font-medium whitespace-nowrap text-primary';

/**
 * A zone's areas as chips, each with its remove, then the dashed "add" chip (the prototype's `sh-zone`); an area another
 * zone holds is red, until it is removed here.
 */
export function AreaChips({
  refs,
  locations,
  addLabel,
  taken,
  onRemove,
  onAdd,
}: {
  refs: readonly AreaRef[];
  locations: Locations;
  addLabel: string;
  /** The areas another zone holds, by key. */
  taken: ReadonlySet<string>;
  onRemove: (ref: AreaRef) => void;
  onAdd: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = useDeliveryWords();
  return (
    <div className="flex flex-wrap gap-2">
      {refs.map((ref) => {
        const name = words.area(locations, ref);
        const bad = taken.has(areaKey(ref));
        return (
          <span key={areaKey(ref)} className={bad ? TAKEN_CHIP : chipClass(true, 'lg')}>
            {name}
            <button
              type="button"
              aria-label={t('areaRemove', { area: name })}
              onClick={() => {
                onRemove(ref);
              }}
              // Its x sits close after the name, as drawn; the 28 px box reaches into the chip's own padding.
              className="-mr-2 -ml-1.5 inline-flex size-7 items-center justify-center rounded-full"
            >
              <Icon name="x" size={14} />
            </button>
          </span>
        );
      })}
      <button type="button" onClick={onAdd} className={ADD_CHIP}>
        <Icon name="plus" size={14} />
        {addLabel}
      </button>
    </div>
  );
}
