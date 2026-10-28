import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_MAX_DEPTH, Permission } from '@lytronix/validators';
import { useProductDefaults } from '@/api/attributes';
import { useCategories } from '@/api/catalogue';
import {
  useCreateCategory,
  useDeleteCategory,
  useReorderCategories,
  useUncategorizedCount,
  useUpdateCategory,
} from '@/api/categories';
import { usePresets } from '@/api/shop-setup';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { chipClass } from '@/components/ui/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { RowList, RowText } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { moved, siblingsOf, treeOrder } from '@/lib/category-tree';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { CategorySummary } from '@/types/catalogue';
import { CategoryMenu, DeleteCategoryDialog, type MenuAction } from './category-menu';
import { CategorySheet, type CategorySheetFor } from './category-sheet';

/**
 * Categories (TENANT-DASHBOARD-DESIGN §7.5, the prototype's `categories` flow; PRD-03, ATR-02, PST-06, PRD-17): the
 * tree, each row with its products, Hidden and the shop type it behaves like, a switch that shows or hides it at once,
 * and its ⋯ menu; Uncategorized last. A new shop sees its type's suggested categories, added in one tap.
 */
export function CategoriesView(): React.JSX.Element {
  const { t, i18n } = useTranslation('shop');
  const errorText = useErrorText();
  const { viewer } = useShell();
  const mayManage = allows(viewer, [Permission.ProductsManage]);
  const categories = useCategories();
  const unfiled = useUncategorizedCount();
  const presets = usePresets();
  const all = categories.data ?? [];
  const none = categories.isSuccess && all.length === 0;
  const defaults = useProductDefaults(null, { enabled: none && mayManage });
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const reorder = useReorderCategories();
  const remove = useDeleteCategory();
  const toast = useToast();
  const [sheet, setSheet] = useState<CategorySheetFor | null>(null);
  const [menuFor, setMenuFor] = useState<CategorySummary | null>(null);
  const [deleting, setDeleting] = useState<CategorySummary | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  const typeName = (key: string) => {
    const preset = presets.data?.find((each) => each.key === key);
    if (!preset) return key;
    return i18n.language === 'bn' ? preset.labelBn : preset.labelEn;
  };
  const rows = treeOrder(all);
  const subCount = (id: string) => all.filter((each) => each.parentId === id).length;
  const suggested = defaults.data?.suggestedCategories ?? [];

  async function seed(): Promise<void> {
    setSeeding(true);
    setProblem(null);
    try {
      for (const name of suggested) {
        await create.mutateAsync({ name, parentId: null, visible: true, behavesLike: null });
      }
      toast.show(t('catSeededToast', { count: suggested.length }));
    } catch (error) {
      setProblem(error);
    } finally {
      setSeeding(false);
    }
  }

  function act(category: CategorySummary, action: MenuAction): void {
    setMenuFor(null);
    setProblem(null);
    const siblings = siblingsOf(all, category.id);
    switch (action) {
      case 'edit':
        setSheet({ kind: 'edit', category });
        break;
      case 'sub':
        setSheet({ kind: 'new', parentId: category.id });
        break;
      case 'up':
      case 'down':
        reorder.mutate(moved(siblings, category.id, action === 'up' ? -1 : 1), {
          onError: setProblem,
        });
        break;
      case 'visibility':
        update.mutate(
          { id: category.id, body: { visible: !category.visible } },
          { onError: setProblem },
        );
        break;
      case 'delete':
        remove.reset();
        setDeleting(category);
        break;
    }
  }

  const add = (withIcon: boolean) =>
    mayManage ? (
      <Button
        size="sm"
        onClick={() => {
          setSheet({ kind: 'new', parentId: null });
        }}
      >
        {withIcon ? <Icon name="plus" /> : null}
        {t('addCategory')}
      </Button>
    ) : null;

  const menuSiblings = menuFor ? siblingsOf(all, menuFor.id) : [];
  const menuDepth = rows.find((row) => row.category.id === menuFor?.id)?.depth ?? 1;

  return (
    <ShellPage actions={add(true)}>
      {categories.isError ? <Banner tone="bad">{errorText(categories.error)}</Banner> : null}
      {problem !== null ? <Banner tone="bad">{errorText(problem)}</Banner> : null}
      {categories.isPending ? (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      ) : none ? (
        <>
          <Card>
            <EmptyState icon="layers" action={add(true)}>
              {t('catEmpty')}
            </EmptyState>
          </Card>
          {mayManage && suggested.length > 0 && defaults.data?.presetKey ? (
            <Card>
              <h3 className="text-[17px] font-semibold">
                {t('catSuggestedT', {
                  type:
                    i18n.language === 'bn'
                      ? typeName(defaults.data.presetKey)
                      : typeName(defaults.data.presetKey).toLowerCase(),
                })}
              </h3>
              <div className="my-2.5 flex flex-wrap gap-2">
                {suggested.map((name) => (
                  <span key={name} className={chipClass(false)}>
                    {name}
                  </span>
                ))}
              </div>
              <Button size="sm" busy={seeding} onClick={() => void seed()}>
                {t('catSuggestedAdd', { count: suggested.length })}
              </Button>
              <p className="mt-2.5 text-[14px] text-fg-muted">{t('catSuggestedNote')}</p>
            </Card>
          ) : null}
        </>
      ) : (
        <>
          <Card flush>
            <RowList>
              {rows.map(({ category, depth }) => (
                <div
                  key={category.id}
                  className={[
                    'flex min-h-14 items-center gap-3 py-3 pr-4',
                    fresh === category.id ? 'bg-primary-soft' : '',
                  ].join(' ')}
                  style={{ paddingLeft: `${String(16 + (depth - 1) * 28)}px` }}
                >
                  <button
                    type="button"
                    disabled={!mayManage}
                    onClick={() => {
                      setProblem(null);
                      setSheet({ kind: 'edit', category });
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                  >
                    {depth > 1 ? <span className="text-neutral-300">└</span> : null}
                    <RowText
                      title={
                        <>
                          {category.name}
                          {category.visible ? null : (
                            <>
                              {' '}
                              <StatusTag tone="neutral">{t('hidden')}</StatusTag>
                            </>
                          )}
                          {category.behavesLike ? (
                            <>
                              {' '}
                              <StatusTag tone="info">
                                {t('behaves', { type: typeName(category.behavesLike) })}
                              </StatusTag>
                            </>
                          ) : null}
                          {fresh === category.id ? (
                            <>
                              {' '}
                              <StatusTag tone="ok">{t('freshTag')}</StatusTag>
                            </>
                          ) : null}
                        </>
                      }
                      sub={t('productsN', { count: category.productCount })}
                    />
                  </button>
                  <span className="flex flex-none items-center gap-1">
                    <span className="flex scale-[.85]">
                      <Switch
                        checked={category.visible}
                        disabled={!mayManage}
                        label={t('catVisible')}
                        onChange={(visible) => {
                          setProblem(null);
                          update.mutate(
                            { id: category.id, body: { visible } },
                            { onError: setProblem },
                          );
                        }}
                      />
                    </span>
                    {mayManage ? (
                      <button
                        type="button"
                        aria-label={t('catMore', { name: category.name })}
                        aria-haspopup="dialog"
                        onClick={() => {
                          setMenuFor(category);
                        }}
                        className="inline-flex size-9 items-center justify-center rounded-[8px] text-neutral-700"
                      >
                        <Icon name="more" />
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
              <div className="flex min-h-14 items-center gap-3 px-4 py-3">
                <RowText
                  title={t('uncategorized')}
                  sub={t('productsN', { count: unfiled.data ?? 0 })}
                />
              </div>
            </RowList>
          </Card>
          <p className="text-[14px] text-fg-muted">
            {t('catSwitchNote')} {t('catTreeNote')}
          </p>
        </>
      )}
      <CategorySheet
        open={sheet !== null}
        of={sheet ?? { kind: 'new', parentId: null }}
        categories={all}
        onSaved={(made) => {
          setSheet(null);
          if (made) {
            setFresh(made.id);
            toast.show(t('catAddedToast', { name: made.name }));
          }
        }}
        onDelete={(category) => {
          setSheet(null);
          remove.reset();
          setDeleting(category);
        }}
        onClose={() => {
          setSheet(null);
        }}
      />
      <CategoryMenu
        category={menuFor}
        canAddSub={menuDepth < CATEGORY_MAX_DEPTH}
        first={menuSiblings[0]?.id === menuFor?.id}
        last={menuSiblings.at(-1)?.id === menuFor?.id}
        onAction={(action) => {
          if (menuFor) act(menuFor, action);
        }}
        onClose={() => {
          setMenuFor(null);
        }}
      />
      <DeleteCategoryDialog
        category={deleting}
        subCount={deleting ? subCount(deleting.id) : 0}
        busy={remove.isPending}
        error={remove.isError ? errorText(remove.error) : null}
        onDelete={() => {
          if (!deleting) return;
          const gone = deleting;
          remove.mutate(
            { id: gone.id, uncategorize: gone.productCount > 0 },
            {
              onSuccess: () => {
                setDeleting(null);
                toast.show(
                  gone.productCount > 0
                    ? t('catDeletedToast', { name: gone.name, count: gone.productCount })
                    : t('catDeletedPlain', { name: gone.name }),
                );
              },
            },
          );
        }}
        onClose={() => {
          setDeleting(null);
        }}
      />
      <Toast message={toast.message} />
    </ShellPage>
  );
}
