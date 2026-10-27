import { useTranslation } from 'react-i18next';
import { useCategories } from '@/api/catalogue';
import { Card } from '@/components/ui/card';
import { RadioMark } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { treeOrder } from '@/lib/category-tree';

/** Products filed in no category, as `GET /products` names them (PRD-03). */
export const UNCATEGORIZED = 'uncategorized';

/**
 * PRD-12 (Part 13's `sh-products-filter`): the list filtered by one category -- All categories first, the tree with its
 * depth, Uncategorized last. A tap chooses and closes.
 */
export function CategoryFilterSheet({
  open,
  chosen,
  onChoose,
  onClose,
}: {
  open: boolean;
  /** A category's id, UNCATEGORIZED, or null for all. */
  chosen: string | null;
  onChoose: (categoryId: string | null) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const categories = useCategories({ enabled: open });
  const rows: { id: string | null; name: string; depth: number }[] = [
    { id: null, name: t('plAllCats'), depth: 1 },
    ...treeOrder(categories.data ?? []).map(({ category, depth }) => ({
      id: category.id,
      name: category.name,
      depth,
    })),
    { id: UNCATEGORIZED, name: t('uncategorized'), depth: 1 },
  ];
  return (
    <Sheet open={open} title={t('plFilterTitle')} onClose={onClose}>
      <Card flush>
        <RowList role="radiogroup" aria-label={t('plFilterTitle')}>
          {rows.map((row) => (
            <button
              key={row.id ?? 'all'}
              type="button"
              role="radio"
              aria-checked={row.id === chosen}
              onClick={() => {
                onChoose(row.id);
              }}
              className="flex min-h-[52px] w-full items-center gap-3 py-3 pr-4 text-left"
              style={{ paddingLeft: `${String(16 + (row.depth - 1) * 24)}px` }}
            >
              <RadioMark on={row.id === chosen} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{row.name}</span>
            </button>
          ))}
        </RowList>
      </Card>
    </Sheet>
  );
}
