import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { useCategories } from '@/api/catalogue';
import { NO_CATEGORY, useCreateCategory, type CategoryFields } from '@/api/categories';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckRow } from '@/components/ui/check-row';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { treeOrder } from '@/lib/category-tree';
import { toggleCategory, type ProductForm } from '@/lib/product-form';
import { CategoryForm, ParentChoice } from '../categories/category-form';

type Chosen = Pick<ProductForm, 'categoryIds' | 'primaryCategoryId'>;

/** The sheet's steps: the tree, a new category's fields, and where the new one sits. */
type Step = 'pick' | 'new' | 'parent';

/**
 * Pick categories (TENANT-DASHBOARD-DESIGN §7.4's sheet, the prototype's `sh-category`; PRD-03, PRD-15): the tree with a
 * tick each, the primary marked and Make primary on the others ticked, Uncategorized last for none; New category first,
 * a step of the sheet with a way back that returns with the new one ticked (`sh-category-new-product`, §7.5), its
 * parent a step of its own as the Categories page has it. Done keeps the choice; closing the sheet drops it.
 */
export function CategoryPicker({
  open,
  chosen,
  onDone,
  onClose,
}: {
  open: boolean;
  chosen: Chosen;
  onDone: (chosen: Chosen) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const categories = useCategories({ enabled: open });
  const make = useCreateCategory();
  const [picked, setPicked] = useState<Chosen>(chosen);
  const [step, setStep] = useState<Step>('pick');
  const [draft, setDraft] = useState<CategoryFields>(NO_CATEGORY);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(chosen);
    setStep('pick');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function startMaking(): void {
    setDraft(NO_CATEGORY);
    setTried(false);
    make.reset();
    setStep('new');
  }

  function create(): void {
    setTried(true);
    if (draft.name.trim() === '') return;
    make.mutate(
      { ...draft, name: draft.name.trim() },
      {
        onSuccess: (made) => {
          setPicked((current) =>
            current.categoryIds.includes(made.id) ? current : toggleCategory(current, made.id),
          );
          setStep('pick');
        },
      },
    );
  }

  const all = categories.data ?? [];
  const rows = treeOrder(all);
  const problems = make.error instanceof ApiClientError ? make.error.fieldProblems() : {};

  if (step === 'parent') {
    return (
      <Sheet
        open={open}
        title={t('catParentT')}
        onClose={onClose}
        onBack={() => {
          setStep('new');
        }}
        footer={
          <Button
            wide
            onClick={() => {
              setStep('new');
            }}
          >
            {t('done')}
          </Button>
        }
      >
        <ParentChoice
          categories={all}
          self={null}
          chosen={draft.parentId}
          onChoose={(parentId) => {
            setDraft({ ...draft, parentId });
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      title={step === 'new' ? t('catNew') : t('pickCategory')}
      onClose={onClose}
      onBack={
        step === 'new'
          ? () => {
              setStep('pick');
            }
          : undefined
      }
      footer={
        step === 'new' ? (
          <Button wide busy={make.isPending} onClick={create}>
            {t('save')}
          </Button>
        ) : (
          <Button
            wide
            onClick={() => {
              onDone(picked);
            }}
          >
            {t('done')}
          </Button>
        )
      }
    >
      {step === 'new' ? (
        <div className="flex flex-col gap-3">
          <CategoryForm
            draft={draft}
            categories={all}
            isNew
            nameError={tried && draft.name.trim() === '' ? t('errName') : problems.name}
            onChange={setDraft}
            onPickParent={() => {
              setStep('parent');
            }}
          />
          <p className="text-[14px] text-fg-muted">{t('catSlugNote')}</p>
          {make.isError && !problems.name ? (
            <p className="text-[14px] font-medium text-danger-text">
              {problems.parentId ?? errorText(make.error)}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mb-3 text-[14px] text-fg-muted">{t('catNote')}</p>
          <Card flush>
            <RowList>
              <button
                type="button"
                onClick={startMaking}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left text-[16px] font-medium text-primary"
              >
                <span className="flex size-10 flex-none items-center justify-center rounded-button bg-primary-soft">
                  <Icon name="plus" />
                </span>
                {t('catNew')}
              </button>
              {rows.map(({ category, depth }) => {
                const on = picked.categoryIds.includes(category.id);
                const primary = picked.primaryCategoryId === category.id;
                return (
                  <div
                    key={category.id}
                    className="flex min-h-[52px] items-center gap-2 py-1.5 pr-4"
                    style={{ paddingLeft: `${String(16 + (depth - 1) * 24)}px` }}
                  >
                    <div className="min-w-0 flex-1">
                      <CheckRow
                        checked={on}
                        onChange={() => {
                          setPicked((current) => toggleCategory(current, category.id));
                        }}
                        title={
                          <>
                            {category.name}
                            {primary ? (
                              <>
                                {' '}
                                <StatusTag tone="info">{t('primary')}</StatusTag>
                              </>
                            ) : null}
                          </>
                        }
                      />
                    </div>
                    {on && !primary ? (
                      <Button
                        tone="ghost"
                        size="xs"
                        onClick={() => {
                          setPicked((current) => ({ ...current, primaryCategoryId: category.id }));
                        }}
                      >
                        {t('makePrimary')}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
              <div className="flex min-h-[52px] items-center px-4 py-1.5">
                <div className="min-w-0 flex-1">
                  <CheckRow
                    checked={picked.categoryIds.length === 0}
                    onChange={() => {
                      setPicked({ categoryIds: [], primaryCategoryId: null });
                    }}
                    title={t('uncategorized')}
                  />
                </div>
              </div>
            </RowList>
          </Card>
        </>
      )}
    </Sheet>
  );
}
