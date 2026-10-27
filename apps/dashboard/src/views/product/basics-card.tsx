import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategories } from '@/api/catalogue';
import { Card } from '@/components/ui/card';
import { AreaField, Field, PickField } from '@/components/ui/field';
import type { ProductForm } from '@/lib/product-form';
import type { ProductDetail } from '@/types/product';
import { CategoryPicker } from './category-picker';
import { PhotoStrip } from './photo-strip';

/**
 * Basics (TENANT-DASHBOARD-DESIGN §7.4's first card, the prototype's `pfBasics`): the photos and video, the name, the
 * price, the category (the picker sheet) and the description, kept exactly as typed (PRD-01).
 */
export function BasicsCard({
  form,
  product,
  problems,
  readOnly,
  onChange,
}: {
  form: ProductForm;
  product: ProductDetail | null;
  problems: Record<string, string | undefined>;
  readOnly: boolean;
  onChange: (patch: Partial<ProductForm>) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const categories = useCategories();
  const [picking, setPicking] = useState(false);
  const primary = categories.data?.find((each) => each.id === form.primaryCategoryId);
  const more = form.categoryIds.length - 1;
  const categoryText =
    form.categoryIds.length === 0
      ? t('uncategorized')
      : primary
        ? more > 0
          ? t('categoryMore', { name: primary.name, more })
          : primary.name
        : '';
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-[17px] font-semibold">{t('basics')}</h3>
      <PhotoStrip form={form} product={product} />
      <Field
        label={t('name')}
        value={form.name}
        placeholder={t('name')}
        readOnly={readOnly}
        error={problems.name}
        onChange={(event) => {
          onChange({ name: event.target.value });
        }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('price')}
          prefix="৳"
          inputMode="decimal"
          value={form.price}
          readOnly={readOnly}
          error={problems.price}
          className="num"
          onChange={(event) => {
            onChange({ price: event.target.value });
          }}
        />
        <PickField
          label={t('category')}
          value={categoryText}
          disabled={readOnly}
          error={problems.category}
          onPick={() => {
            setPicking(true);
          }}
        />
      </div>
      <AreaField
        label={t('description')}
        value={form.description}
        readOnly={readOnly}
        help={t('descPh')}
        error={problems.description}
        onChange={(event) => {
          onChange({ description: event.target.value });
        }}
      />
      <CategoryPicker
        open={picking}
        chosen={{ categoryIds: form.categoryIds, primaryCategoryId: form.primaryCategoryId }}
        onDone={(chosen) => {
          setPicking(false);
          onChange(chosen);
        }}
        onClose={() => {
          setPicking(false);
        }}
      />
    </Card>
  );
}
