import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import type { CategorySummary } from '@/types/catalogue';

/** What the ⋯ menu can do to a category. */
export type MenuAction = 'edit' | 'sub' | 'up' | 'down' | 'visibility' | 'delete';

/**
 * A category's ⋯ menu (§7.5, the prototype's `sh-category-menu`): Edit, Add a sub-category, Move up and Move down among
 * its siblings, Hide or Show on the storefront, and Delete category. What cannot be done here is left out: a fourth
 * level has no sub-category, the first sibling no Move up, the last no Move down.
 */
export function CategoryMenu({
  category,
  canAddSub,
  first,
  last,
  onAction,
  onClose,
}: {
  category: CategorySummary | null;
  canAddSub: boolean;
  first: boolean;
  last: boolean;
  onAction: (action: MenuAction) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const actions: { action: MenuAction; icon: IconName; label: string; shown: boolean }[] = [
    { action: 'edit', icon: 'pencil', label: t('edit'), shown: true },
    { action: 'sub', icon: 'plus', label: t('catSub'), shown: canAddSub },
    { action: 'up', icon: 'trend', label: t('catMoveUp'), shown: !first },
    { action: 'down', icon: 'down', label: t('catMoveDown'), shown: !last },
    {
      action: 'visibility',
      icon: 'image',
      label: category?.visible === false ? t('catShow') : t('catHide'),
      shown: true,
    },
    { action: 'delete', icon: 'trash', label: t('catDelete'), shown: true },
  ];
  return (
    <Sheet open={category !== null} title={category?.name ?? ''} onClose={onClose}>
      <Card flush>
        <RowList>
          {actions
            .filter((each) => each.shown)
            .map(({ action, icon, label }) => (
              <button
                key={action}
                type="button"
                onClick={() => {
                  onAction(action);
                }}
                className={[
                  'flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left',
                  action === 'delete' ? 'text-danger-text' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex size-10 flex-none items-center justify-center rounded-button',
                    action === 'delete'
                      ? 'bg-danger-soft text-danger-text'
                      : 'bg-neutral-100 text-fg-muted',
                  ].join(' ')}
                >
                  <Icon name={icon} />
                </span>
                <span className="text-[15px] font-medium">{label}</span>
              </button>
            ))}
        </RowList>
      </Card>
    </Sheet>
  );
}

/**
 * Delete category (the prototype's `sh-category-delete`, `-delete-children` and `-delete-empty`; PRD-03): one with
 * sub-categories cannot go yet, and says why; one holding products moves them to Uncategorized, removing nothing; an
 * empty one simply goes.
 */
export function DeleteCategoryDialog({
  category,
  subCount,
  busy,
  error,
  onDelete,
  onClose,
}: {
  category: CategorySummary | null;
  /** How many sub-categories it has. */
  subCount: number;
  busy: boolean;
  error: string | null;
  onDelete: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const name = category?.name ?? '';
  const products = category?.productCount ?? 0;
  if (subCount > 0) {
    return (
      <Dialog
        open={category !== null}
        title={t('catDeleteChildrenT', { name })}
        onClose={onClose}
        actions={<Button onClick={onClose}>{t('done')}</Button>}
      >
        {t('catDeleteChildren', { count: subCount })}
      </Dialog>
    );
  }
  return (
    <Dialog
      open={category !== null}
      title={t('catDeleteT', { name })}
      onClose={onClose}
      actions={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button tone="danger" busy={busy} onClick={onDelete}>
            {products > 0 ? t('catDeleteMove') : t('deleteBtn')}
          </Button>
        </>
      }
    >
      {products > 0 ? t('catDeleteProducts', { count: products }) : t('catDeleteEmpty')}
      {error ? (
        <span role="alert" className="mt-2 block font-medium text-danger-text">
          {error}
        </span>
      ) : null}
    </Dialog>
  );
}
