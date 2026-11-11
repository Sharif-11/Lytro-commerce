import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { CATEGORY_MAX_DEPTH, Permission } from '@lytronix/validators';
import { useProductDefaults } from '@/api/attributes';
import { useCategories } from '@/api/catalogue';
import {
  useCreateCategory,
  useDeleteCategory,
  useMoveCategory,
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
import { SkeletonRows } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { placeOf, siblingsOf, stepPlace, treeOrder, type CategoryPlace } from '@/lib/category-tree';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { CategorySummary } from '@/types/catalogue';
import { CategoryMenu, DeleteCategoryDialog, type MenuAction } from './category-menu';
import { CategoryRows } from './category-rows';
import { CategorySheet, type CategorySheetFor } from './category-sheet';
import { MoveToSheet } from './move-to-sheet';

/**
 * Categories (TENANT-DASHBOARD-DESIGN §7.5, the prototype's `categories` flow; PRD-03, ATR-02, PST-06, PRD-17): the
 * tree, each row with its products, Hidden and the shop type it behaves like, a switch that shows or hides it at once,
 * and its ⋯ menu; Uncategorized last. A new shop sees its type's suggested categories, added in one tap. Since Slice 8.8
 * (D8-72, §7.41) a category moves by dragging on a computer and by Move to… on a phone, each move one request, with
 * Undo; a move that a change made meanwhile has made impossible says so, and the list is read again.
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
  const move = useMoveCategory();
  const remove = useDeleteCategory();
  const toast = useToast();
  const [sheet, setSheet] = useState<CategorySheetFor | null>(null);
  const [menuFor, setMenuFor] = useState<CategorySummary | null>(null);
  const [moving, setMoving] = useState<CategorySummary | null>(null);
  const [deleting, setDeleting] = useState<CategorySummary | null>(null);
  const [fresh, setFresh] = useState<{ id: string; added: boolean } | null>(null);
  // The last move's way back, offered while its own toast shows.
  const [undo, setUndo] = useState<{
    category: CategorySummary;
    place: CategoryPlace;
    message: string;
  } | null>(null);
  const [movedMeanwhile, setMovedMeanwhile] = useState(false);
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

  /**
   * D8-72: one request moves it; the toast says where, with Undo, which is one more move back. A list someone changed
   * meanwhile says so above the title, and is read again.
   */
  function moveTo(category: CategorySummary, place: CategoryPlace, undoing = false): void {
    const from = placeOf(all, category.id);
    setProblem(null);
    setMovedMeanwhile(false);
    move.mutate(
      { id: category.id, place },
      {
        onSuccess: (list) => {
          setMoving(null);
          setFresh({ id: category.id, added: false });
          const parent = list.find((each) => each.id === place.parentId);
          const message =
            parent && place.parentId !== from.parentId
              ? t('p88cat.moved', { c: category.name, p: parent.name })
              : t('p88cat.movedHere', { c: category.name });
          toast.show(message);
          setUndo(undoing ? null : { category, place: from, message });
        },
        onError: (error) => {
          setMoving(null);
          if (error instanceof ApiClientError && error.status === 409) setMovedMeanwhile(true);
          else setProblem(error);
        },
      },
    );
  }

  function act(category: CategorySummary, action: MenuAction): void {
    setMenuFor(null);
    setProblem(null);
    switch (action) {
      case 'edit':
        setSheet({ kind: 'edit', category });
        break;
      case 'sub':
        setSheet({ kind: 'new', parentId: category.id });
        break;
      case 'moveTo':
        setMoving(category);
        break;
      case 'up':
      case 'down': {
        const place = stepPlace(all, category.id, action === 'up' ? -1 : 1);
        if (place) moveTo(category, place);
        break;
      }
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
    <ShellPage
      actions={add(true)}
      banner={movedMeanwhile ? <Banner tone="bad">{t('p88cat.failed')}</Banner> : null}
    >
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
          <CategoryRows
            categories={all}
            unfiled={unfiled.data ?? 0}
            mayManage={mayManage}
            fresh={fresh}
            typeName={typeName}
            onEdit={(category) => {
              setProblem(null);
              setSheet({ kind: 'edit', category });
            }}
            onMenu={setMenuFor}
            onVisible={(category, visible) => {
              setProblem(null);
              update.mutate({ id: category.id, body: { visible } }, { onError: setProblem });
            }}
            onMove={(category, place) => {
              moveTo(category, place);
            }}
          />
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
            setFresh({ id: made.id, added: true });
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
      <MoveToSheet
        key={moving?.id ?? 'none'}
        category={moving}
        categories={all}
        busy={move.isPending}
        onMove={(category, place) => {
          moveTo(category, place);
        }}
        onClose={() => {
          setMoving(null);
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
      <Toast
        message={toast.message}
        action={
          undo && toast.message === undo.message
            ? {
                label: t('p88cat.undo'),
                onClick: () => {
                  moveTo(undo.category, undo.place, true);
                },
              }
            : null
        }
      />
    </ShellPage>
  );
}
