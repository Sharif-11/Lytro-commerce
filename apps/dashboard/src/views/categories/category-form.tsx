import { useTranslation } from 'react-i18next';
import { CATEGORY_MAX_DEPTH, CATEGORY_NAME_MAX_LENGTH } from '@lytronix/validators';
import type { CategoryFields } from '@/api/categories';
import { usePresets } from '@/api/shop-setup';
import { Field, PickField, SelectField } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { heightOf, subtreeOf, treeOrder } from '@/lib/category-tree';
import type { CategorySummary } from '@/types/catalogue';
import { ChoiceList, ChoiceRow } from '../product/choice-list';

/**
 * A category's own fields (§7.5, the prototype's `catForm`; PRD-03, PST-06): its name, where it sits (a step of its
 * own, `sh-category-parent`), whether the storefront shows it, and the shop type its new products behave like.
 */
export function CategoryForm({
  draft,
  categories,
  isNew,
  nameError,
  onChange,
  onPickParent,
}: {
  draft: CategoryFields;
  categories: readonly CategorySummary[];
  /** A new category's name says what it takes and its type that it only sets defaults; an existing one's, what changes. */
  isNew: boolean;
  nameError?: string;
  onChange: (draft: CategoryFields) => void;
  onPickParent: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('shop');
  const presets = usePresets();
  const parent = categories.find((each) => each.id === draft.parentId);
  return (
    <div className="flex flex-col gap-3">
      <Field
        label={t('catName')}
        value={draft.name}
        maxLength={CATEGORY_NAME_MAX_LENGTH}
        placeholder={t('catNamePh')}
        help={isNew ? t('catNameHelp', { max: CATEGORY_NAME_MAX_LENGTH }) : undefined}
        error={nameError}
        onChange={(event) => {
          onChange({ ...draft, name: event.target.value });
        }}
      />
      <PickField
        label={t('catParent')}
        value={parent?.name ?? t('catTop')}
        help={t('catDepthNote')}
        onPick={onPickParent}
      />
      <div className="flex min-h-10 items-center gap-3">
        <Switch
          checked={draft.visible}
          label={t('catVisible')}
          onChange={(visible) => {
            onChange({ ...draft, visible });
          }}
        />
        <span className="text-[15px] font-medium">{t('catVisible')}</span>
      </div>
      <SelectField
        label={t('catBehaves')}
        value={draft.behavesLike ?? ''}
        help={isNew ? t('catBehavesHelp') : t('catBehavesEdit')}
        options={[
          { value: '', label: t('catFollow') },
          ...(presets.data ?? []).map((preset) => ({
            value: preset.key,
            label: i18n.language === 'bn' ? preset.labelBn : preset.labelEn,
          })),
        ]}
        onChange={(event) => {
          onChange({ ...draft, behavesLike: event.target.value || null });
        }}
      />
    </div>
  );
}

/**
 * Where it sits (the prototype's `sh-category-parent`): the top level or any category, indented as the tree reads. A
 * category never sits inside itself or anything under it, nor deeper than four levels with what it takes along.
 */
export function ParentChoice({
  categories,
  self,
  chosen,
  onChoose,
}: {
  categories: readonly CategorySummary[];
  /** The category being moved; null for a new one. */
  self: string | null;
  chosen: string | null;
  onChoose: (parentId: string | null) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const inside = self ? subtreeOf(categories, self) : new Set<string>();
  const height = self ? heightOf(categories, self) : 1;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-fg-muted">
        {t('catDepthNote')}
        {self ? ` ${t('catMovesWith')}` : ''}
      </p>
      <ChoiceList label={t('catParentT')}>
        <ChoiceRow
          on={chosen === null}
          title={t('catTop')}
          onChoose={() => {
            onChoose(null);
          }}
        />
        {treeOrder(categories).map(({ category, depth }) => {
          const why = inside.has(category.id)
            ? t('catInsideSelf')
            : depth + height > CATEGORY_MAX_DEPTH
              ? t('catTooDeep')
              : null;
          return (
            <ChoiceRow
              key={category.id}
              on={chosen === category.id}
              title={category.name}
              sub={why}
              later={why !== null}
              indent={(depth - 1) * 24}
              onChoose={() => {
                onChoose(category.id);
              }}
            />
          );
        })}
      </ChoiceList>
    </div>
  );
}
