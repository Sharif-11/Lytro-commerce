import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckboxRow, SelectField, TextField } from '@lytronix/ui';
import { ProductFormField, SerialFormat, StockTracking, StockUnit } from '@lytronix/validators';
import { useUpdatePreset } from '@/api/catalogue';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { INLINE_FIELD, NOTE, TWO_FIELDS } from '@/components/ui/sizes';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { TagButton, TagLine } from '@/components/ui/value-tag';
import { enumValue } from '@/lib/enum-value';
import { problemsOf } from '@/lib/form-problems';
import type { LibraryAttribute, ShopTypePreset } from '@/types/operator';

const FIELDS = [
  'labelEn',
  'labelBn',
  'defaultStockUnit',
  'defaultSerial',
  'defaultSerialFormat',
  'defaultLowStock',
];

/** OPERATOR-CONSOLE-DESIGN §11: what a new product starts with in a shop of this type (PST-02 to PST-05). */
export function PresetPanel({
  preset,
  attributes,
  onClose,
}: {
  preset: ShopTypePreset;
  attributes: readonly LibraryAttribute[];
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const update = useUpdatePreset();
  const { defaults } = preset;
  const [labelEn, setLabelEn] = useState(preset.labelEn);
  const [labelBn, setLabelBn] = useState(preset.labelBn);
  const [unit, setUnit] = useState(defaults.stockUnit);
  const [tracking, setTracking] = useState(defaults.stockTracking);
  const [batches, setBatches] = useState(defaults.batchTracked);
  const [serials, setSerials] = useState(defaults.serialTracked);
  const [format, setFormat] = useState(defaults.serialFormat);
  const [low, setLow] = useState(String(Number(defaults.lowStockThreshold)));
  const [categories, setCategories] = useState(defaults.suggestedCategories);
  const [attributeIds, setAttributeIds] = useState(defaults.suggestedAttributeIds);
  const [upFront, setUpFront] = useState(defaults.upFrontFields);
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const problems = problemsOf(update.error, t, FIELDS);
  const name = i18n.language === 'bn' ? preset.labelBn : preset.labelEn;
  const offerable = attributes.filter(
    (attribute) => !attribute.retired && !attributeIds.includes(attribute.id),
  );

  function addCategory(): void {
    const typed = (addingCategory ?? '').trim();
    if (typed !== '' && !categories.includes(typed)) setCategories([...categories, typed]);
    setAddingCategory(null);
  }

  function handleCategoryKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCategory();
    }
  }

  return (
    <ActionPanel
      title={t('shopTypes.editTitle', { name })}
      sub={<span className="mono">{preset.key}</span>}
      onClose={onClose}
      actionLabel={t('common.save')}
      pending={update.isPending}
      canSubmit={labelEn.trim() !== '' && labelBn.trim() !== '' && low.trim() !== ''}
      error={problems.banner}
      onSubmit={() => {
        update.mutate(
          {
            key: preset.key,
            labelEn: labelEn.trim(),
            labelBn: labelBn.trim(),
            defaultStockUnit: unit,
            defaultNotTracked: tracking === StockTracking.NotTracked,
            defaultBatch: batches,
            defaultSerial: serials,
            defaultSerialFormat: format,
            defaultLowStock: Number(low),
            suggestedCategories: categories,
            suggestedAttributeIds: attributeIds,
            upFrontFields: upFront,
          },
          {
            onSuccess: () => {
              toast(t('shopTypes.saved', { name }));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence>{t('shopTypes.consequence')}</Consequence>
      <div className={TWO_FIELDS}>
        <TextField
          label={t('shopTypes.labelEn')}
          name="labelEn"
          required
          maxLength={60}
          data-autofocus
          error={problems.field('labelEn')}
          value={labelEn}
          onChange={(event) => {
            setLabelEn(event.target.value);
          }}
        />
        <TextField
          label={t('shopTypes.labelBn')}
          name="labelBn"
          required
          maxLength={60}
          error={problems.field('labelBn')}
          value={labelBn}
          onChange={(event) => {
            setLabelBn(event.target.value);
          }}
        />
      </div>
      <div className={TWO_FIELDS}>
        <SelectField
          label={t('shopTypes.stockUnit')}
          name="unit"
          value={unit}
          onChange={(event) => {
            setUnit(enumValue(Object.values(StockUnit), event.target.value, unit));
          }}
        >
          {Object.values(StockUnit).map((each) => (
            <option key={each} value={each}>
              {t(`shopTypes.units.${each}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('shopTypes.tracking')}
          name="tracking"
          value={tracking}
          onChange={(event) => {
            setTracking(enumValue(Object.values(StockTracking), event.target.value, tracking));
          }}
        >
          {Object.values(StockTracking).map((each) => (
            <option key={each} value={each}>
              {t(`shopTypes.trackings.${each}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {/* The server takes batches or serial numbers, never both, so turning one on turns the other off. */}
      <Switch
        checked={batches}
        label={t('shopTypes.batches')}
        showLabel
        onChange={(on) => {
          setBatches(on);
          if (on) setSerials(false);
        }}
      />
      <Switch
        checked={serials}
        label={t('shopTypes.serials')}
        showLabel
        onChange={(on) => {
          setSerials(on);
          if (on) setBatches(false);
        }}
      />
      <div className={TWO_FIELDS}>
        <SelectField
          label={t('shopTypes.serialFormat')}
          name="format"
          value={format}
          onChange={(event) => {
            setFormat(enumValue(Object.values(SerialFormat), event.target.value, format));
          }}
        >
          {Object.values(SerialFormat).map((each) => (
            <option key={each} value={each}>
              {t(`shopTypes.formats.${each}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('shopTypes.lowStock')}
          name="low"
          required
          mono
          inputMode="decimal"
          error={problems.field('defaultLowStock')}
          value={low}
          onChange={(event) => {
            setLow(event.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-field-label text-field-label">
          {t('shopTypes.suggestedCategories')}
        </span>
        <TagLine>
          {categories.map((category) => (
            <TagButton
              key={category}
              aria-label={t('shopTypes.remove', { name: category })}
              onClick={() => {
                setCategories(categories.filter((each) => each !== category));
              }}
            >
              {category}
              <ConsoleIcon name="x" size={14} />
            </TagButton>
          ))}
          {addingCategory === null ? (
            <TagButton
              aria-label={t('shopTypes.addCategory')}
              onClick={() => {
                setAddingCategory('');
              }}
            >
              <ConsoleIcon name="plus" size={14} />
            </TagButton>
          ) : (
            <input
              name="new-category"
              aria-label={t('shopTypes.addCategory')}
              autoFocus
              value={addingCategory}
              onChange={(event) => {
                setAddingCategory(event.target.value);
              }}
              onKeyDown={handleCategoryKey}
              onBlur={addCategory}
              className={`${INLINE_FIELD} w-40`}
            />
          )}
        </TagLine>
        <div className={NOTE}>{t('shopTypes.categoriesHelp')}</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-field-label text-field-label">
          {t('shopTypes.suggestedAttributes')}
        </span>
        <TagLine>
          {attributeIds.map((id) => {
            const attribute = attributes.find((each) => each.id === id);
            const words = attribute?.name ?? id;
            return (
              <TagButton
                key={id}
                tone="on"
                aria-label={t('shopTypes.remove', { name: words })}
                onClick={() => {
                  setAttributeIds(attributeIds.filter((each) => each !== id));
                }}
              >
                {words}
                <ConsoleIcon name="x" size={14} />
              </TagButton>
            );
          })}
        </TagLine>
        {offerable.length > 0 ? (
          <select
            name="new-attribute"
            aria-label={t('shopTypes.addAttribute')}
            value=""
            onChange={(event) => {
              if (event.target.value !== '') setAttributeIds([...attributeIds, event.target.value]);
            }}
            className={`${INLINE_FIELD} w-full sm:w-60`}
          >
            <option value="">{t('shopTypes.addAttribute')}</option>
            {offerable.map((attribute) => (
              <option key={attribute.id} value={attribute.id}>
                {attribute.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-field-label text-field-label">
          {t('shopTypes.upFront')}
        </span>
        <div className={TWO_FIELDS}>
          {Object.values(ProductFormField).map((field) => (
            <CheckboxRow
              key={field}
              label={t(`shopTypes.fields.${field}`)}
              checked={upFront.includes(field)}
              onChange={(on) => {
                setUpFront(on ? [...upFront, field] : upFront.filter((each) => each !== field));
              }}
            />
          ))}
        </div>
        <div className={NOTE}>{t('shopTypes.upFrontHelp')}</div>
      </div>
    </ActionPanel>
  );
}
