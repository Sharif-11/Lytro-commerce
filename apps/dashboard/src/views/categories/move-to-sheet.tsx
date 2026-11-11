import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  isSamePlace,
  placeOf,
  refusalOf,
  treeOrder,
  type CategoryPlace,
} from '@/lib/category-tree';
import type { CategorySummary } from '@/types/catalogue';
import { ChoiceList, ChoiceRow } from '../product/choice-list';

/** Where in the chosen parent's list: first, last, or after one of its sub-categories. */
type Position = 'first' | 'last' | `after:${string}`;

/**
 * Move to… (D8-72, Part 39's `p88-cat-moveto`): a phone's way to move a category anywhere at once -- the parent, with the
 * ones that can't take it greyed (inside itself, or deeper than four levels), and where in that parent's list. Its
 * sub-categories go with it. Done moves it in one request.
 */
export function MoveToSheet({
  category,
  categories,
  busy,
  onMove,
  onClose,
}: {
  category: CategorySummary | null;
  categories: readonly CategorySummary[];
  busy: boolean;
  onMove: (category: CategorySummary, place: CategoryPlace) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const id = category?.id ?? '';
  const now = category ? placeOf(categories, id) : { parentId: null, afterId: null };
  const siblingsUnder = (parentId: string | null) =>
    treeOrder(categories)
      .map((row) => row.category)
      .filter((each) => each.parentId === parentId && each.id !== id);
  const [parentId, setParentId] = useState<string | null>(now.parentId);
  const [position, setPosition] = useState<Position>(() => {
    const siblings = siblingsUnder(now.parentId);
    if (now.afterId === null) return siblings.length === 0 ? 'last' : 'first';
    return siblings.at(-1)?.id === now.afterId ? 'last' : `after:${now.afterId}`;
  });

  const siblings = siblingsUnder(parentId);
  const options = [
    { value: 'first', label: t('p88cat.first') },
    ...siblings.slice(0, -1).map((each) => ({
      value: `after:${each.id}`,
      label: t('p88cat.after', { name: each.name }),
    })),
    { value: 'last', label: t('p88cat.last') },
  ];
  const place: CategoryPlace = {
    parentId,
    afterId:
      position === 'first'
        ? null
        : position === 'last'
          ? (siblings.at(-1)?.id ?? null)
          : position.slice('after:'.length),
  };

  return (
    <Sheet
      open={category !== null}
      title={t('p88cat.moveToT', { c: category?.name ?? '' })}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={busy}
          onClick={() => {
            if (!category || isSamePlace(categories, id, place)) onClose();
            else onMove(category, place);
          }}
        >
          {t('done')}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">{t('p88cat.note')}</p>
      {/* The list scrolls within the sheet, so Where in the list stays in view below it, as drawn. */}
      <div className="min-h-0 shrink overflow-y-auto rounded-card">
        <ChoiceList label={t('catParentT')}>
          <ChoiceRow
            on={parentId === null}
            title={t('catTop')}
            onChoose={() => {
              setParentId(null);
              setPosition('last');
            }}
          />
          {treeOrder(categories).map(({ category: each, depth }) => (
            <ChoiceRow
              key={each.id}
              on={parentId === each.id}
              title={each.name}
              later={refusalOf(categories, id, each.id) !== null}
              indent={(depth - 1) * 24}
              onChoose={() => {
                setParentId(each.id);
                setPosition('last');
              }}
            />
          ))}
        </ChoiceList>
      </div>
      <SelectField
        label={t('p88cat.where')}
        options={options}
        value={position}
        onChange={(event) => {
          setPosition(event.target.value as Position);
        }}
      />
    </Sheet>
  );
}
