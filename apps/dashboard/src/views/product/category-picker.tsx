import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { CATEGORY_MAX_DEPTH, CATEGORY_NAME_MAX_LENGTH } from '@lytronix/validators';
import { useCategories } from '@/api/catalogue';
import { useCreateCategory } from '@/api/products';
import { usePresets } from '@/api/shop-setup';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckRow } from '@/components/ui/check-row';
import { Field, SelectField } from '@/components/ui/field';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/hooks/use-error-text';
import { treeOrder } from '@/lib/category-tree';
import { toggleCategory, type ProductForm } from '@/lib/product-form';

type Chosen = Pick<ProductForm, 'categoryIds' | 'primaryCategoryId'>;

/** The New category step's fields, as typed. */
interface NewCategory {
  name: string;
  parentId: string;
  visible: boolean;
  behavesLike: string;
}

const NO_CATEGORY: NewCategory = { name: '', parentId: '', visible: true, behavesLike: '' };

/**
 * Pick categories (TENANT-DASHBOARD-DESIGN §7.4's sheet, the prototype's `sh-category`; PRD-03, PRD-15): the tree with a
 * tick each, the primary marked and Make primary on the others ticked, Uncategorized last for none; New category first,
 * a step of the sheet with a way back that returns with the new one ticked (`sh-category-new-product`, §7.5). Done keeps
 * the choice; closing the sheet drops it.
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
  const { t, i18n } = useTranslation('shop');
  const errorText = useErrorText();
  const categories = useCategories({ enabled: open });
  const presets = usePresets();
  const make = useCreateCategory();
  const [picked, setPicked] = useState<Chosen>(chosen);
  const [making, setMaking] = useState(false);
  const [draft, setDraft] = useState<NewCategory>(NO_CATEGORY);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(chosen);
    setMaking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function startMaking(): void {
    setDraft(NO_CATEGORY);
    setTried(false);
    make.reset();
    setMaking(true);
  }

  function create(): void {
    setTried(true);
    if (draft.name.trim() === '') return;
    make.mutate(
      {
        name: draft.name.trim(),
        parentId: draft.parentId || null,
        visible: draft.visible,
        behavesLike: draft.behavesLike || null,
      },
      {
        onSuccess: (made) => {
          setPicked((current) =>
            current.categoryIds.includes(made.id) ? current : toggleCategory(current, made.id),
          );
          setMaking(false);
        },
      },
    );
  }

  const rows = treeOrder(categories.data ?? []);
  const problems = make.error instanceof ApiClientError ? make.error.fieldProblems() : {};

  return (
    <Sheet
      open={open}
      title={making ? t('catNew') : t('pickCategory')}
      onClose={onClose}
      onBack={
        making
          ? () => {
              setMaking(false);
            }
          : undefined
      }
      footer={
        making ? (
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
      {making ? (
        <div className="flex flex-col gap-3">
          <Field
            label={t('catName')}
            value={draft.name}
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            placeholder={t('catNamePh')}
            help={t('catNameHelp', { max: CATEGORY_NAME_MAX_LENGTH })}
            error={tried && draft.name.trim() === '' ? t('errName') : problems.name}
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
            }}
          />
          <SelectField
            label={t('catParent')}
            value={draft.parentId}
            help={t('catDepthNote')}
            options={[
              { value: '', label: t('catTop') },
              ...rows
                .filter(({ depth }) => depth < CATEGORY_MAX_DEPTH)
                .map(({ category, depth }) => ({
                  value: category.id,
                  label: `${'— '.repeat(depth - 1)}${category.name}`,
                })),
            ]}
            onChange={(event) => {
              setDraft({ ...draft, parentId: event.target.value });
            }}
          />
          <div className="flex min-h-10 items-center gap-3">
            <Switch
              checked={draft.visible}
              label={t('catVisible')}
              onChange={(visible) => {
                setDraft({ ...draft, visible });
              }}
            />
            <span className="text-[15px] font-medium">{t('catVisible')}</span>
          </div>
          <SelectField
            label={t('catBehaves')}
            value={draft.behavesLike}
            help={t('catBehavesHelp')}
            options={[
              { value: '', label: t('catFollow') },
              ...(presets.data ?? []).map((preset) => ({
                value: preset.key,
                label: i18n.language === 'bn' ? preset.labelBn : preset.labelEn,
              })),
            ]}
            onChange={(event) => {
              setDraft({ ...draft, behavesLike: event.target.value });
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
                <span className="flex size-10 flex-none items-center justify-center rounded-[8px] bg-primary-soft">
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
